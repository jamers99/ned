import { describe, expect, it } from 'vitest';
import type { BabyEvent } from './db.ts';
import { dayTimeline, defaultTargets, isNightTime, nextSleep, timeAsleep, wakingsDuring } from './sleep.ts';
import { clock as clockTime } from './time.ts';

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

// Thursday Oct 8: Wednesday night 7:05 PM – 6:40 AM with one waking, two naps, then bed at 7:05 PM.
const night = event({ Type: 'Sleep', IsNight: true, Start: at(7, '19:05'), End: at(8, '06:40') });
const waking = event({ Type: 'NightWaking', Start: at(8, '02:14'), End: at(8, '02:30'), SettledBy: 'Feeding' });
const nightFeed = event({ Type: 'Feed', FeedKind: 'Nursing', Start: at(7, '22:40'), End: at(7, '22:50'), LeftSeconds: 600 });
const morningFeed = event({ Type: 'Feed', FeedKind: 'Nursing', Start: at(8, '07:13'), End: at(8, '07:25'), LeftSeconds: 360, RightSeconds: 360 });
const nap1 = event({ Type: 'Sleep', Start: at(8, '09:05'), End: at(8, '10:20') });
const nap2 = event({ Type: 'Sleep', Start: at(8, '12:50'), End: at(8, '13:35') });
const nextNight = event({ Type: 'Sleep', IsNight: true, Start: at(8, '19:05'), End: at(9, '06:30') });

describe('night default', () => {
  it.each([
    ['17:29', false], ['17:30', true], ['23:00', true], ['03:59', true], ['04:00', false], ['13:00', false]
  ])('a sleep starting at %s is night: %s', (time, expected) => {
    expect(isNightTime(at(8, time))).toBe(expected);
  });
});

describe('next sleep window', () => {
  it('follows the nap targets through the day, then lands bedtime inside the target window', () => {
    const afterNight = nextSleep([night], defaultTargets)!;
    expect(afterNight).toMatchObject({ kind: 'nap', napNumber: 1, targetMinutes: 150 });
    expect([clockTime(afterNight.from), clockTime(afterNight.to)]).toEqual([clockTime(at(8, '09:00')), clockTime(at(8, '09:20'))]);

    const afterNap1 = nextSleep([night, nap1], defaultTargets)!;
    expect(afterNap1).toMatchObject({ kind: 'nap', napNumber: 2, targetMinutes: 165 });
    expect(afterNap1.from).toBe(at(8, '12:55'));

    // 1:35 PM + 3h 30m is 5:05 PM, earlier than the 6:30 PM earliest bedtime, so it moves into the window.
    const afterNap2 = nextSleep([night, nap1, nap2], defaultTargets)!;
    expect(afterNap2).toMatchObject({ kind: 'bedtime', targetMinutes: 210 });
    expect([afterNap2.from, afterNap2.to]).toEqual([at(8, '18:30'), at(8, '18:50')]);
  });

  it('switches to bedtime when another nap would run into the evening', () => {
    const lateNap = event({ Type: 'Sleep', Start: at(8, '15:00'), End: at(8, '16:30') });
    expect(nextSleep([night, lateNap], defaultTargets)?.kind).toBe('bedtime');
  });
});

describe('time asleep', () => {
  it('takes the wakings out of a night', () => {
    const events = [night, waking];
    expect(timeAsleep(night, wakingsDuring(night, events), 0)).toBe(at(8, '06:40') - at(7, '19:05') - 16 * 60_000);
  });
});

describe('day timeline', () => {
  it('starts with the night that ended that morning and shows awake gaps between sleeps', () => {
    const events = [night, nightFeed, waking, morningFeed, nap1, nap2, nextNight];
    const timeline = dayTimeline(events, at(8, '00:00'), at(9, '12:00'));

    expect(timeline.rows.map(r => (r.kind === 'window' ? r.label : r.kind === 'sleep' ? r.label : r.event.Type))).toEqual([
      'Night', 'Feed', 'NightWaking', 'Awake 2h 25m', 'Feed', 'Nap 1', 'Awake 2h 30m', 'Nap 2', 'Awake 5h 30m until bedtime'
    ]);
    expect(timeline).toMatchObject({ napCount: 2, feedCount: 2, nursingTotal: 22 * 60_000 });
    expect(dayTimeline(events, at(7, '00:00'), at(9, '12:00')).rows).toEqual([]);
    expect(timeline.napTotal).toBe(2 * 60 * 60_000);
  });

  it('ends with the wake window into bedtime; the night itself opens the next day', () => {
    const solids = event({ Type: 'Solids', Start: at(8, '14:47'), End: at(8, '14:47'), Foods: ['Chicken'] });
    const events = [night, nap1, nap2, solids, nextNight];

    const thursday = dayTimeline(events, at(8, '00:00'), at(8, '20:00')).rows;
    expect(thursday.slice(-3).map(r => (r.kind === 'event' ? r.event.Type : r.label)))
      .toEqual(['Nap 2', 'Awake 5h 30m until bedtime', 'Solids']);

    const friday = dayTimeline(events, at(9, '00:00'), at(9, '12:00')).rows;
    expect(friday[0]).toMatchObject({ kind: 'sleep', label: 'Night', event: nextNight });
  });
});
