import type { BabyEvent, SettledBy } from './db.ts';
import { byStart, dayOf, wakingsDuring } from './sleep.ts';
import { atMinuteOfDay, day, hour, minute, minuteOfDay, startOfDay } from './time.ts';

const loggedNights = (events: BabyEvent[]) =>
  events.filter(e => e.Type === 'Sleep' && e.IsNight && !e.Deleted && e.End != null).sort(byStart);

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
    let from = night.Start;
    let longest = 0;
    for (const waking of wakingsDuring(night, live)) {
      longest = Math.max(longest, waking.Start - from);
      from = waking.End ?? waking.Start;
    }
    stretches.set(dayOf(night), Math.max(longest, night.End! - from));
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
    .filter(e => e.Start > now - 7 * day)
    .map(e => {
      const m = minuteOfDay(e.Start);
      return m < 12 * 60 ? m + 24 * 60 : m;
    });
  if (bedtimes.length < 2) return null;

  const mean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
  const variance = bedtimes.reduce((sum, m) => sum + (m - mean) ** 2, 0) / bedtimes.length;
  return { average: atMinuteOfDay(now, Math.round(mean) % (24 * 60)), spreadMinutes: Math.round(Math.sqrt(variance)) };
}

/** Night wakings per night over the last week, and the most common way she got back to sleep. */
export function wakingStats(events: BabyEvent[], now: number) {
  const nights = loggedNights(events).filter(e => e.Start > now - 7 * day);
  if (nights.length === 0) return null;

  const wakings = nights.flatMap(night => wakingsDuring(night, events));
  const counts = new Map<SettledBy, number>();
  for (const waking of wakings)
    if (waking.SettledBy) counts.set(waking.SettledBy, (counts.get(waking.SettledBy) ?? 0) + 1);
  const [top, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

  return {
    perNight: Math.round((wakings.length / nights.length) * 10) / 10,
    top,
    topShare: wakings.length ? Math.round((topCount / wakings.length) * 100) : 0
  };
}

export const nightsNeededForPattern = 14;

export type WakeWindowPattern =
  | { ready: false; nights: number }
  | { ready: true; from: number; to: number }
  | { ready: true; from: null; to: null };

/**
 * Which last wake window of the day (from the last nap to bedtime) is followed by the fewest night wakings.
 * Groups nights into 30-minute buckets and needs a few nights in a bucket before trusting it.
 */
export function bestLastWakeWindow(events: BabyEvent[]): WakeWindowPattern {
  const live = events.filter(e => !e.Deleted);
  const naps = live.filter(e => e.Type === 'Sleep' && !e.IsNight && e.End != null);
  const samples: { window: number; wakings: number }[] = [];

  for (const night of loggedNights(live)) {
    const lastNap = naps
      .filter(nap => nap.End! <= night.Start && nap.End! > night.Start - 12 * hour)
      .sort((a, b) => a.End! - b.End!)
      .at(-1);
    if (lastNap) samples.push({ window: night.Start - lastNap.End!, wakings: wakingsDuring(night, live).length });
  }
  if (samples.length < nightsNeededForPattern) return { ready: false, nights: samples.length };

  const bucketSize = 30 * minute;
  const buckets = new Map<number, number[]>();
  for (const sample of samples) {
    const bucket = Math.floor(sample.window / bucketSize);
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), sample.wakings]);
  }

  const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const trusted = [...buckets].filter(([, wakings]) => wakings.length >= 3);
  if (trusted.length < 2) return { ready: true, from: null, to: null };

  const [bestBucket, bestWakings] = trusted.sort((a, b) => average(a[1]) - average(b[1]))[0];
  const others = samples.filter(s => Math.floor(s.window / bucketSize) !== bestBucket).map(s => s.wakings);
  if (average(bestWakings) >= average(others)) return { ready: true, from: null, to: null };

  return { ready: true, from: bestBucket * bucketSize, to: (bestBucket + 1) * bucketSize };
}
