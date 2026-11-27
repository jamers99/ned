import { describe, expect, it } from 'vitest';
import type { BabyEvent } from './db.ts';
import { bedtimeStats, feedSplit, goodNights, wakingsByWeek } from './insights.ts';

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
