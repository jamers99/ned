import { describe, expect, it } from 'vitest';
import type { BabyEvent } from './db.ts';
import { bedtimeStats, feedSplit, goodNights, typicalNightFeeds, wakingsByWeek } from './insights.ts';

const at = (dayOfMonth: number, time: string) => {
  const [h, m] = time.split(':').map(Number);
  return new Date(2026, 9, dayOfMonth, h, m).getTime();
};

let next = 0;
function event(fields: Partial<BabyEvent> & Pick<BabyEvent, 'Type' | 'Start'>): BabyEvent {
  return {
    Guid: `e${next++}`, ModifiedAt: '', Deleted: false, LoggedBy: 'Natalie', dirty: 0, End: null, IsNight: false,
    SleepLocation: null, SleepOnset: null, WakeMood: null, SettledBy: null, FeedKind: null, LeftSeconds: 0,
    RightSeconds: 0, StartSide: null, ActiveSide: null, ActiveSince: null, BottleOz: null, Foods: [],
    SolidAmount: null, Text: '', ...fields
  };
}

const night = (from: [number, string], to: [number, string]) =>
  event({ Type: 'Sleep', IsNight: true, Start: at(...from), End: at(...to) });

// A week like the one that showed an 11:24 PM average: one night logged in two pieces, and a morning nap
// marked night by mistake, on top of bedtimes between 8:35 and 10:20 PM.
const week = [
  night([12, '21:20'], [13, '01:07']),
  night([13, '01:27'], [13, '06:55']),
  night([13, '09:20'], [13, '10:05']),
  night([13, '20:35'], [14, '06:30']),
  event({ Type: 'NightWaking', Start: at(13, '21:17'), End: at(13, '21:28'), SettledBy: 'Feeding' }),
  night([14, '20:58'], [15, '07:30']),
  night([15, '22:15'], [16, '07:22']),
  night([16, '21:00'], [17, '09:22']),
  night([17, '22:20'], [18, '08:30'])
];
const now = at(18, '15:56');

describe('nights logged in pieces', () => {
  it('take bedtime from the first piece of each night', () => {
    const stats = bedtimeStats(week, now)!;
    expect(new Date(stats.average).getHours() * 60 + new Date(stats.average).getMinutes()).toBe(21 * 60 + 25);
    expect(stats.spreadMinutes).toBe(40);
  });

  it('count as one night for wakings per night', () => {
    expect(wakingsByWeek(week, now).at(-1)).toMatchObject({ perNight: 0.2, fedPerNight: 0.2 });
  });
});

const feed = (dayOfMonth: number, time: string) => event({ Type: 'Feed', FeedKind: 'Nursing', Start: at(dayOfMonth, time) });

describe('feeds a day', () => {
  it('count the ones during a night apart', () => {
    const days = [12, 13, 14].flatMap(d => [
      night([d, '20:00'], [d + 1, '06:00']), feed(d + 1, '02:00'), feed(d + 1, '07:00'), feed(d + 1, '11:00')
    ]);
    expect(feedSplit(days, at(15, '12:00'))).toEqual({ day: 2, night: 1 });
  });
});

describe('calmer nights', () => {
  const targets = { NapsPerDay: 2, NightStartMinutes: 20 * 60 + 30 };
  const waking = (d: number) => event({ Type: 'NightWaking', Start: at(d, '02:00'), End: at(d, '02:15') });
  const nap = (d: number, time: string) => event({ Type: 'Sleep', Start: at(d, time), End: at(d, time) + 45 * 60_000 });

  it('compare nights after the planned naps with nights after more', () => {
    const days = [1, 2, 3, 4, 5, 6].flatMap(d => [
      nap(d, '09:00'), nap(d, '13:00'), ...(d > 3 ? [nap(d, '16:30'), waking(d + 1), waking(d + 1)] : []),
      night([d, '20:00'], [d + 1, '06:30'])
    ]);
    expect(goodNights(days, targets, at(7, '12:00'))).toEqual({
      calm: '2 naps or fewer', rough: '3+ naps', calmWakings: 0, roughWakings: 2
    });
  });

  it('say nothing until both sides have a few nights', () => {
    const days = [1, 2, 3].flatMap(d => [nap(d, '09:00'), night([d, '20:00'], [d + 1, '06:30'])]);
    expect(goodNights(days, targets, at(4, '12:00'))).toBeNull();
  });
});

describe('from newborn to one year', () => {
  // Two weeks of one routine: day feeds and naps at fixed times, then a night from 8 PM with wakings that a feed
  // settles. Wakings are spread through the night; extra naps (when `extraNapEvery` is set) come before bedtime.
  function routine(o: { dayFeeds: string[]; naps: string[]; wakings: number; extraNapEvery?: number }) {
    const rows: BabyEvent[] = [];
    for (let d = 1; d <= 14; d++) {
      for (const time of o.dayFeeds) rows.push(feed(d, time));
      for (const time of o.naps) rows.push(event({ Type: 'Sleep', Start: at(d, time), End: at(d, time) + 40 * 60_000 }));
      const extra = o.extraNapEvery && d % o.extraNapEvery === 0;
      if (extra) rows.push(event({ Type: 'Sleep', Start: at(d, '18:30'), End: at(d, '18:50') }));
      rows.push(night([d, '20:00'], [d + 1, '06:30']));
      const wakings = o.wakings + (extra ? 2 : 0);
      for (let w = 0; w < wakings; w++) {
        const start = at(d, '21:00') + (w + 1) * Math.floor((9 * 60) / (wakings + 1)) * 60_000;
        rows.push(event({ Type: 'NightWaking', Start: start, End: start + 20 * 60_000, SettledBy: 'Feeding' }));
        rows.push(event({ Type: 'Feed', FeedKind: 'Nursing', Start: start + 60_000 }));
      }
    }
    return rows;
  }
  const now = at(15, '12:00');
  const targets = (naps: number) => ({ NapsPerDay: naps, NightStartMinutes: 20 * 60 });

  it('a newborn: many feeds, several at night, and no nap comparison to make', () => {
    const rows = routine({ dayFeeds: ['07:00', '09:30', '12:00', '14:30', '17:00', '19:30'], naps: ['08:00', '10:30', '13:00', '15:30', '17:45'], wakings: 3 });
    expect(feedSplit(rows, now)).toEqual({ day: 6, night: 3 });
    expect(wakingsByWeek(rows, now).at(-1)).toMatchObject({ perNight: 3, fedPerNight: 3 });
    expect(goodNights(rows, targets(5), now)).toBeNull();
    expect(typicalNightFeeds(0)).toBe('2–4');
  });

  it('eight months: extra naps show up as rougher nights', () => {
    const rows = routine({ dayFeeds: ['07:00', '11:00', '15:00', '19:00'], naps: ['09:30', '13:30'], wakings: 1, extraNapEvery: 3 });
    expect(goodNights(rows, targets(2), now)).toMatchObject({ calm: '2 naps or fewer', rough: '3+ naps', calmWakings: 1, roughWakings: 3 });
    expect(typicalNightFeeds(8)).toBe('0–1');
  });

  it('one year: one nap, no night feeds, and nothing to compare', () => {
    const rows = routine({ dayFeeds: ['07:00', '12:00', '16:00', '19:30'], naps: ['12:30'], wakings: 0 });
    expect(feedSplit(rows, now)).toEqual({ day: 4, night: 0 });
    expect(wakingsByWeek(rows, now).at(-1)).toMatchObject({ perNight: 0, fedPerNight: 0 });
    expect(goodNights(rows, targets(1), now)).toBeNull();
    expect(typicalNightFeeds(12)).toBe('0');
  });

  it('one nap reads as one nap', () => {
    const rows = routine({ dayFeeds: ['07:00'], naps: ['12:30'], wakings: 0, extraNapEvery: 2 });
    expect(goodNights(rows, targets(1), now)?.calm).toBe('1 nap or fewer');
  });
});
