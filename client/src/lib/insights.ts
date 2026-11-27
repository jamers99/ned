import type { BabyEvent } from './db.ts';
import { byStart, dayOf, type SleepTargets, wakingsDuring } from './sleep.ts';
import { addDays, atMinuteOfDay, clock as clockText, day, hour, minuteOfDay, startOfDay } from './time.ts';

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

/** Rounds to one decimal place, for the numbers Insights shows. */
const tenths = (n: number) => Math.round(n * 10) / 10;

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
      hours: tenths(median(byMonth.get(key)!) / hour)
    };
  });
}

/** Bedtime as minutes after the evening's midnight, so 12:30 AM sorts after 11 PM. */
function bedMinute(night: Night): number {
  const m = minuteOfDay(night.start);
  return m < 12 * 60 ? m + 24 * 60 : m;
}

/** Average bedtime over the last week and how much it varies (standard deviation, in minutes). */
export function bedtimeStats(events: BabyEvent[], now: number): { average: number; spreadMinutes: number } | null {
  const bedtimes = loggedNights(events).filter(night => night.start > now - 7 * day).map(bedMinute);
  if (bedtimes.length < 2) return null;

  const mean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
  const variance = bedtimes.reduce((sum, m) => sum + (m - mean) ** 2, 0) / bedtimes.length;
  return { average: atMinuteOfDay(now, Math.round(mean) % (24 * 60)), spreadMinutes: Math.round(Math.sqrt(variance)) };
}

/** Wakings per night, and how many of them a feed settled, for each of the last eight weeks (oldest first). */
export function wakingsByWeek(events: BabyEvent[], now: number): { label: string; perNight: number; fedPerNight: number }[] {
  const nights = loggedNights(events);
  const weeks = [];
  for (let k = 7; k >= 0; k--) {
    const from = now - (k + 1) * 7 * day;
    const inWeek = nights.filter(night => night.start > from && night.start <= from + 7 * day);
    if (inWeek.length === 0) continue;
    const wakings = inWeek.flatMap(night => wakingsIn(night, events));
    weeks.push({
      label: new Date(from + day).toLocaleDateString([], { month: 'numeric', day: 'numeric' }),
      perNight: tenths(wakings.length / inWeek.length),
      fedPerNight: tenths(wakings.filter(w => w.SettledBy === 'Feeding').length / inWeek.length)
    });
  }
  return weeks;
}

const isFeed = (e: BabyEvent) => e.Type === 'Feed' && !e.Deleted;
const duringNight = (ms: number, nights: Night[]) => nights.some(n => n.pieces.some(p => ms >= p.Start && ms < p.End!));

/** Feeds per day over the last seven whole days: by day, and during a logged night. */
export function feedSplit(events: BabyEvent[], now: number): { day: number; night: number } | null {
  const nights = loggedNights(events);
  const today = startOfDay(now);
  const feeds = events.filter(e => isFeed(e) && e.Start >= addDays(today, -7) && e.Start < today);
  const days = new Set(feeds.map(feed => startOfDay(feed.Start))).size;
  if (days < 2) return null;
  const atNight = feeds.filter(feed => duringNight(feed.Start, nights)).length;
  return { day: tenths((feeds.length - atNight) / days), night: tenths(atNight / days) };
}

/** How many night feeds most babies still take at this age: a rough guide, not a rule. */
export function typicalNightFeeds(months: number): [number, number] {
  if (months < 2) return [2, 4];
  if (months < 4) return [1, 3];
  if (months < 6) return [1, 2];
  if (months < 9) return [0, 1];
  return [0, 0];
}

/**
 * Of a few things about the day before (naps, bedtime, day feeds), the one whose nights differ most in
 * wakings over the last four weeks, with the calmer side first. Needs three nights on each side.
 */
export function goodNights(events: BabyEvent[], targets: Pick<SleepTargets, 'NapsPerDay' | 'NightStartMinutes'>, now: number) {
  const live = events.filter(e => !e.Deleted);
  const nights = loggedNights(live);
  const dayBefore = (night: Night, e: BabyEvent) => e.Start > night.start - 14 * hour && (e.End ?? e.Start) <= night.start;
  const recent = nights.filter(night => night.start > now - 28 * day).map(night => ({
    night,
    wakings: wakingsIn(night, live).length,
    naps: live.filter(e => e.Type === 'Sleep' && !e.IsNight && e.End != null && dayBefore(night, e)).length,
    feeds: live.filter(e => isFeed(e) && dayBefore(night, e) && !duringNight(e.Start, nights)).length
  }));
  // Babies take fewer feeds as they grow, so split at this baby's usual count rather than a fixed one.
  const usualFeeds = recent.length ? Math.ceil(median(recent.map(r => r.feeds))) : 0;
  const { NapsPerDay: naps, NightStartMinutes: bedtime } = targets;

  const factors: { sides: [string, string]; test: (r: (typeof recent)[number]) => boolean }[] = [
    { sides: [`${naps} ${naps === 1 ? 'nap' : 'naps'} or fewer`, `${naps + 1}+ naps`], test: r => r.naps <= naps },
    { sides: [`a bedtime by ${clockText(atMinuteOfDay(now, bedtime))}`, 'a later bedtime'], test: r => bedMinute(r.night) <= bedtime },
    { sides: [`${usualFeeds}+ day feeds`, 'fewer day feeds'], test: r => r.feeds >= usualFeeds }
  ];
  const average = (group: typeof recent) => group.reduce((sum, r) => sum + r.wakings, 0) / group.length;
  const [best] = factors
    .map(({ sides, test }) => {
      const yes = recent.filter(test);
      const no = recent.filter(r => !test(r));
      return yes.length < 3 || no.length < 3 ? null : { sides, a: average(yes), b: average(no) };
    })
    .filter(f => f != null && Math.abs(f.a - f.b) >= 0.5)
    .sort((x, y) => Math.abs(y!.b - y!.a) - Math.abs(x!.b - x!.a));
  if (!best) return null;
  const [calm, rough] = best.a < best.b ? best.sides : [best.sides[1], best.sides[0]];
  return { calm, rough, calmWakings: tenths(Math.min(best.a, best.b)), roughWakings: tenths(Math.max(best.a, best.b)) };
}
