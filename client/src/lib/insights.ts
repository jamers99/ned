import type { BabyEvent } from './db.ts';
import { byStart, dayOf, type SleepTargets, wakingsDuring } from './sleep.ts';
import { atMinuteOfDay, clock as clockText, day, hour, minuteOfDay, startOfDay } from './time.ts';

interface Night {
  /** The morning it ended, as the Day screen files it. */
  morning: number;
  /** Bedtime: when its first piece started. */
  start: number;
  /**
   * Its night sleeps. Usually one, but a night can be logged in pieces (Nara did, and Ned can after an early
   * Up for the day), and a piece marked night by mistake can land on the same morning.
   */
  pieces: BabyEvent[];
}

/** Finished nights, oldest first: the night sleeps that end on the same morning count as one night. */
function loggedNights(events: BabyEvent[]): Night[] {
  const nights = new Map<number, Night>();
  for (const sleep of events.filter(e => e.Type === 'Sleep' && e.IsNight && !e.Deleted && e.End != null).sort(byStart)) {
    const morning = dayOf(sleep);
    const night = nights.get(morning);
    if (night) night.pieces.push(sleep);
    else nights.set(morning, { morning, start: sleep.Start, pieces: [sleep] });
  }
  return [...nights.values()];
}

const wakingsIn = (night: Night, events: BabyEvent[]) => night.pieces.flatMap(piece => wakingsDuring(piece, events));

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Her longest stretch each night, keyed by the morning it ended. Logged nights use the time between wakings;
 * older nights (like the Nara history) fall back to the longest gap between feeds from 6 PM to 9 AM.
 */
function longestNightStretches(events: BabyEvent[]): Map<number, number> {
  const live = events.filter(e => !e.Deleted);
  const stretches = new Map<number, number>();

  for (const night of loggedNights(live)) {
    let longest = 0;
    for (const piece of night.pieces) {
      let from = piece.Start;
      for (const waking of wakingsDuring(piece, live)) {
        longest = Math.max(longest, waking.Start - from);
        from = waking.End ?? waking.Start;
      }
      longest = Math.max(longest, piece.End! - from);
    }
    stretches.set(night.morning, longest);
  }

  const nightFeeds = new Map<number, number[]>();
  for (const feed of live.filter(e => e.Type === 'Feed').sort(byStart)) {
    const m = minuteOfDay(feed.Start);
    if (m < 18 * 60 && m >= 9 * 60) continue;
    const morning = startOfDay(feed.Start + 12 * hour);
    nightFeeds.set(morning, [...(nightFeeds.get(morning) ?? []), feed.Start]);
  }
  for (const [morning, starts] of nightFeeds) {
    if (stretches.has(morning) || starts.length < 2) continue;
    const gaps = starts.slice(1).map((start, i) => start - starts[i]);
    stretches.set(morning, Math.max(...gaps));
  }

  return stretches;
}

/** The typical (median) longest night stretch per month, in hours, for the last eight months. */
export function stretchByMonth(events: BabyEvent[]): { label: string; hours: number }[] {
  const byMonth = new Map<string, number[]>();
  for (const [morning, stretch] of longestNightStretches(events)) {
    const d = new Date(morning);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    byMonth.set(key, [...(byMonth.get(key) ?? []), stretch]);
  }
  return [...byMonth.keys()].sort().slice(-8).map(key => {
    const [year, month] = key.split('-').map(Number);
    return {
      label: new Date(year, month, 1).toLocaleDateString([], { month: 'short' }),
      hours: Math.round((median(byMonth.get(key)!) / hour) * 10) / 10
    };
  });
}

/** Average bedtime over the last week and how much it varies (standard deviation, in minutes). */
export function bedtimeStats(events: BabyEvent[], now: number): { average: number; spreadMinutes: number } | null {
  const bedtimes = loggedNights(events)
    .filter(night => night.start > now - 7 * day)
    .map(night => {
      const m = minuteOfDay(night.start);
      return m < 12 * 60 ? m + 24 * 60 : m;
    });
  if (bedtimes.length < 2) return null;

  const mean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
  const variance = bedtimes.reduce((sum, m) => sum + (m - mean) ** 2, 0) / bedtimes.length;
  return { average: atMinuteOfDay(now, Math.round(mean) % (24 * 60)), spreadMinutes: Math.round(Math.sqrt(variance)) };
}

/** Wakings per night, and how many of them a feed settled, for each of the last eight weeks (oldest first). */
export function wakingsByWeek(events: BabyEvent[], now: number): { label: string; perNight: number; fedPerNight: number }[] {
  const live = events.filter(e => !e.Deleted);
  const nights = loggedNights(live);
  const weeks = [];
  for (let k = 7; k >= 0; k--) {
    const from = now - (k + 1) * 7 * day;
    const inWeek = nights.filter(night => night.start > from && night.start <= from + 7 * day);
    if (inWeek.length === 0) continue;
    const wakings = inWeek.flatMap(night => wakingsIn(night, live));
    const perNight = (count: number) => Math.round((count / inWeek.length) * 10) / 10;
    weeks.push({
      label: new Date(from + day).toLocaleDateString([], { month: 'numeric', day: 'numeric' }),
      perNight: perNight(wakings.length),
      fedPerNight: perNight(wakings.filter(w => w.SettledBy === 'Feeding').length)
    });
  }
  return weeks;
}

const isFeed = (e: BabyEvent) => e.Type === 'Feed' && !e.Deleted;
const duringNight = (ms: number, nights: Night[]) => nights.some(n => n.pieces.some(p => ms >= p.Start && ms < p.End!));

/** Feeds per day over the last week: by day, and during a logged night. */
export function feedSplit(events: BabyEvent[], now: number): { day: number; night: number } | null {
  const nights = loggedNights(events);
  const feeds = events.filter(e => isFeed(e) && e.Start > now - 7 * day);
  const days = new Set(feeds.map(feed => startOfDay(feed.Start))).size;
  if (days < 2) return null;
  const atNight = feeds.filter(feed => duringNight(feed.Start, nights)).length;
  const perDay = (count: number) => Math.round((count / days) * 10) / 10;
  return { day: perDay(feeds.length - atNight), night: perDay(atNight) };
}

/**
 * Of a few things about the day before (naps, bedtime, day feeds), the one whose nights differ most in
 * wakings over the last four weeks, with the calmer side first. Needs three nights on each side.
 */
export function goodNights(events: BabyEvent[], targets: Pick<SleepTargets, 'NapsPerDay' | 'NightStartMinutes'>, now: number) {
  const live = events.filter(e => !e.Deleted);
  const nights = loggedNights(live);
  const naps = live.filter(e => e.Type === 'Sleep' && !e.IsNight && e.End != null);
  const feeds = live.filter(isFeed);
  const bedtime = clockText(atMinuteOfDay(now, targets.NightStartMinutes));

  const factors: { sides: [string, string]; test: (night: Night) => boolean }[] = [
    {
      sides: [`${targets.NapsPerDay} naps or fewer`, `${targets.NapsPerDay + 1}+ naps`],
      test: night => naps.filter(nap => nap.End! <= night.start && nap.Start > night.start - 14 * hour).length <= targets.NapsPerDay
    },
    {
      sides: [`a bedtime by ${bedtime}`, 'a later bedtime'],
      test: night => {
        const m = minuteOfDay(night.start);
        return (m < 12 * 60 ? m + 24 * 60 : m) <= targets.NightStartMinutes;
      }
    },
    {
      sides: ['4+ day feeds', 'fewer day feeds'],
      test: night => feeds.filter(f => f.Start < night.start && f.Start > night.start - 14 * hour && !duringNight(f.Start, nights)).length >= 4
    }
  ];

  const recent = nights.filter(night => night.start > now - 28 * day);
  const average = (group: Night[]) => group.reduce((sum, night) => sum + wakingsIn(night, live).length, 0) / group.length;
  let best: { calm: string; rough: string; calmWakings: number; roughWakings: number } | null = null;
  for (const { sides, test } of factors) {
    const yes = recent.filter(test);
    const no = recent.filter(night => !test(night));
    if (yes.length < 3 || no.length < 3) continue;
    const [a, b] = [average(yes), average(no)];
    if (Math.abs(a - b) < 0.5 || (best && Math.abs(a - b) <= best.roughWakings - best.calmWakings)) continue;
    const round = (n: number) => Math.round(n * 10) / 10;
    best = a < b
      ? { calm: sides[0], rough: sides[1], calmWakings: round(a), roughWakings: round(b) }
      : { calm: sides[1], rough: sides[0], calmWakings: round(b), roughWakings: round(a) };
  }
  return best;
}
