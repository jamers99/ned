import { describe, expect, it } from 'vitest';
import type { BabyEvent } from './db.ts';
import { bedtimeStats, wakingStats } from './insights.ts';

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
    expect(wakingStats(week, now)?.perNight).toBe(Math.round((1 / 6) * 10) / 10);
  });
});
