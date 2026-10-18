import type { BabyEvent, Settings } from './db.ts';
import { addDays, atMinuteOfDay, day, duration, endAfter, hour, minute, minuteOfDay, startOfDay } from './time.ts';

export type SleepTargets = Pick<Settings, 'NapsPerDay' | 'NapWakeWindowMinutes' | 'BedtimeWakeWindowMinutes'
  | 'NightStartMinutes' | 'NightEndMinutes'>;

/** Targets for about seven months old. */
export const defaultTargets: SleepTargets = {
  NapsPerDay: 2,
  NapWakeWindowMinutes: 150,
  BedtimeWakeWindowMinutes: 210,
  NightStartMinutes: 20 * 60,
  NightEndMinutes: 6 * 60
};

/** The settings row, with defaults for anything a phone hasn't pulled yet (such as fields added later). */
export function targetsFrom(row: Partial<SleepTargets> | undefined): SleepTargets {
  return { ...defaultTargets, ...Object.fromEntries(Object.entries(row ?? {}).filter(([, v]) => v != null)) };
}

const windowSlack = 10 * minute;

/**
 * Whether a time is between bedtime and morning. A sleep starting then is a night sleep (decided once when it
 * starts; the Day view's edit sheet can change it), and the app goes dim.
 */
export function isNightTime(ms: number, targets: Pick<SleepTargets, 'NightStartMinutes' | 'NightEndMinutes'>): boolean {
  const m = minuteOfDay(ms);
  const from = targets.NightStartMinutes;
  const to = targets.NightEndMinutes;
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

const isSleep = (e: BabyEvent) => e.Type === 'Sleep' && !e.Deleted;
const isNap = (e: BabyEvent) => isSleep(e) && !e.IsNight;
export const byStart = (a: BabyEvent, b: BabyEvent) => a.Start - b.Start;

export function latestRunning(events: BabyEvent[], type: BabyEvent['Type']): BabyEvent | undefined {
  return events.filter(e => e.Type === type && !e.Deleted && e.End == null).sort(byStart).at(-1);
}

function lastCompletedSleep(events: BabyEvent[]): BabyEvent | undefined {
  return events.filter(e => isSleep(e) && e.End != null).sort((a, b) => a.End! - b.End!).at(-1);
}

export function wakingsDuring(sleep: BabyEvent, events: BabyEvent[]): BabyEvent[] {
  const end = sleep.End ?? Infinity;
  return events
    .filter(e => e.Type === 'NightWaking' && !e.Deleted && e.Start >= sleep.Start && e.Start < end)
    .sort(byStart);
}

/** Time asleep: a night's span minus the time she was awake during it. */
export function timeAsleep(sleep: BabyEvent, wakings: BabyEvent[], now: number): number {
  const end = sleep.End ?? now;
  const awake = wakings.reduce((sum, w) => {
    const from = Math.max(w.Start, sleep.Start);
    const to = Math.min(w.End ?? now, end);
    return sum + Math.max(0, to - from);
  }, 0);
  return Math.max(0, end - sleep.Start - awake);
}

/** Which nap of the day a sleep is, counting from the end of the last night. */
export function napNumber(sleep: BabyEvent, events: BabyEvent[]): number {
  const dayStart = lastNightEnd(events, sleep.Start) ?? startOfDay(sleep.Start);
  return events.filter(e => isNap(e) && e.Start >= dayStart && e.Start <= sleep.Start).length;
}

function lastNightEnd(events: BabyEvent[], before: number): number | undefined {
  return events
    .filter(e => isSleep(e) && e.IsNight && e.End != null && e.End <= before)
    .map(e => e.End!)
    .sort((a, b) => a - b)
    .at(-1);
}

export interface NextSleep {
  kind: 'nap' | 'bedtime';
  napNumber: number;
  awakeSince: number;
  targetMinutes: number;
  /** The target window: the wake-window target ± 10 minutes for a nap; the bedtime itself for bed. */
  from: number;
  to: number;
}

/** When the next sleep should start, from the wake-window target for this nap of the day. */
export function nextSleep(events: BabyEvent[], targets: SleepTargets): NextSleep | null {
  const last = lastCompletedSleep(events);
  if (!last) return null;

  const awakeSince = last.End!;
  const dayStart = lastNightEnd(events, awakeSince + 1) ?? startOfDay(awakeSince);
  const napsToday = events.filter(e => isNap(e) && e.Start >= dayStart && e.Start < awakeSince).length;
  const napTarget = targets.NapWakeWindowMinutes;
  const bedtime = atMinuteOfDay(awakeSince, targets.NightStartMinutes);
  // Another nap only fits if there's still room for its wake window and the one before bed.
  const noRoomForNap = awakeSince + (napTarget + targets.BedtimeWakeWindowMinutes) * minute > bedtime;
  const isBedtime = napsToday >= targets.NapsPerDay || noRoomForNap;

  if (!isBedtime) {
    const center = awakeSince + napTarget * minute;
    return {
      kind: 'nap', napNumber: napsToday + 1, awakeSince, targetMinutes: napTarget,
      from: center - windowSlack, to: center + windowSlack
    };
  }

  // Bedtime is the bedtime setting, whatever the wake window says; her wake window is however long that leaves.
  return {
    kind: 'bedtime', napNumber: napsToday + 1, awakeSince, targetMinutes: Math.round((bedtime - awakeSince) / minute),
    from: bedtime, to: bedtime
  };
}

/** The middle half of her recent nap lengths, rounded to 5 minutes. Null until there are a few naps. */
export function typicalNapRange(events: BabyEvent[], now: number): [number, number] | null {
  const lengths = events
    .filter(e => isNap(e) && e.End != null && e.Start > now - 14 * day)
    .map(e => e.End! - e.Start)
    .sort((a, b) => a - b);
  if (lengths.length < 4) return null;

  const round = (ms: number) => Math.round(ms / (5 * minute)) * 5 * minute;
  const quartile = (q: number) => lengths[Math.round(q * (lengths.length - 1))];
  return [round(quartile(0.25)), round(quartile(0.75))];
}

/** How long a nap runs before Ned asks if she's still asleep: well past her usual longest, or 3h with no history. */
export function napOverdueAfter(events: BabyEvent[], now: number): number {
  const typical = typicalNapRange(events, now);
  return typical ? typical[1] + Math.max(30 * minute, typical[1] / 2) : 3 * hour;
}

/**
 * Whether to ask if a running nap is still going, because someone may have forgotten Woke up.
 * Saying she is still asleep (at `confirmedAt`) quiets the question for an hour.
 */
export function askStillAsleep(sleep: BabyEvent, events: BabyEvent[], now: number, confirmedAt = 0): boolean {
  if (sleep.IsNight || sleep.End != null) return false;
  return now - sleep.Start > napOverdueAfter(events, now) && now - confirmedAt > hour;
}

/**
 * A waking logged after the fact, from the clock times on two time wheels: it starts at the first such time after
 * the night began and ends at the first after that, no later than now. Null if it hasn't happened yet.
 */
export function pastWaking(sleep: BabyEvent, from: number, to: number, now: number): { Start: number; End: number } | null {
  const start = endAfter(sleep.Start, from);
  if (start >= now) return null;
  const end = Math.min(now, endAfter(start, to));
  return end > start ? { Start: start, End: end } : null;
}

/**
 * The local day an event shows under on the Day screen. A night, and the wakings in it, belong to the
 * morning it ends, so "Thursday" starts with Wednesday night's sleep.
 */
export function dayOf(e: BabyEvent): number {
  const belongsToMorning = (e.Type === 'Sleep' && e.IsNight) || e.Type === 'NightWaking';
  return startOfDay(belongsToMorning ? e.Start + 12 * hour : e.Start);
}

export type DayRow =
  | { kind: 'sleep'; event: BabyEvent; label: string; asleep: number; wakings: BabyEvent[] }
  | { kind: 'window'; label: string }
  | { kind: 'event'; event: BabyEvent };

export interface DayTimeline {
  rows: DayRow[];
  sleepTotal: number;
  napCount: number;
  napTotal: number;
  feedCount: number;
  nursingTotal: number;
}

/**
 * Everything that belongs to one day, in order, with awake gaps between sleeps shown as wake windows.
 * Anything logged during a night (a waking, a night feed) belongs to that night's morning.
 */
export function dayTimeline(events: BabyEvent[], dayStart: number, now: number): DayTimeline {
  const nights = events.filter(e => isSleep(e) && e.IsNight);
  const dayFor = (e: BabyEvent) => {
    const night = e.Type === 'Sleep' ? undefined : nights.find(n => e.Start >= n.Start && e.Start < (n.End ?? now));
    return dayOf(night ?? e);
  };
  const own = events.filter(e => !e.Deleted && dayFor(e) === dayStart).sort(byStart);
  const timeline: DayTimeline = { rows: [], sleepTotal: 0, napCount: 0, napTotal: 0, feedCount: 0, nursingTotal: 0 };
  let previousSleepEnd: number | null = null;
  let windowSlot = 0;

  for (const event of own) {
    if (event.Type === 'Sleep') {
      if (previousSleepEnd != null && event.Start > previousSleepEnd) {
        const awake = duration(event.Start - previousSleepEnd);
        const label = event.IsNight ? `Awake ${awake} until bedtime` : `Awake ${awake}`;
        timeline.rows.splice(windowSlot, 0, { kind: 'window', label });
      }

      const wakings = event.IsNight ? wakingsDuring(event, events) : [];
      const asleep = timeAsleep(event, wakings, now);
      timeline.sleepTotal += asleep;
      if (!event.IsNight) {
        timeline.napCount++;
        timeline.napTotal += asleep;
      }

      const label = event.IsNight ? 'Night' : `Nap ${timeline.napCount}`;
      timeline.rows.push({ kind: 'sleep', event, label, asleep, wakings });
      previousSleepEnd = event.End;
      windowSlot = timeline.rows.length;
      continue;
    }

    if (event.Type === 'Feed') {
      timeline.feedCount++;
      timeline.nursingTotal += (event.LeftSeconds + event.RightSeconds) * 1000;
    }
    timeline.rows.push({ kind: 'event', event });
    if (previousSleepEnd != null && event.Start < previousSleepEnd) windowSlot = timeline.rows.length;
  }

  // Tonight's sleep belongs to tomorrow, but the wake window leading into it belongs to today.
  const bedtime = events.find(e => isSleep(e) && e.IsNight && dayOf(e) === addDays(dayStart, 1));
  if (previousSleepEnd != null && bedtime && bedtime.Start > previousSleepEnd)
    timeline.rows.splice(windowSlot, 0, { kind: 'window', label: `Awake ${duration(bedtime.Start - previousSleepEnd)} until bedtime` });

  return timeline;
}
