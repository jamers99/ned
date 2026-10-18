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
    Guid: `e${next++}`, ModifiedAt: '', Deleted: false, LoggedBy: 'John', dirty: 0, End: null, IsNight: false,
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
    ['19:59', false], ['20:00', true], ['23:00', true], ['05:59', true], ['06:00', false], ['13:00', false]
  ])('a sleep starting at %s is night: %s', (time, expected) => {
    expect(isNightTime(at(8, time), defaultTargets)).toBe(expected);
  });

  it('follows the night setting', () => {
    const early = { NightStartMinutes: 18 * 60 + 30, NightEndMinutes: 5 * 60 };
    expect(isNightTime(at(8, '18:29'), early)).toBe(false);
    expect(isNightTime(at(8, '18:30'), early)).toBe(true);
    expect(isNightTime(at(8, '05:00'), early)).toBe(false);
  });
});

describe('next sleep window', () => {
  it('follows the nap target through the day, then aims for the bedtime setting', () => {
    const afterNight = nextSleep([night], defaultTargets, at(8, '07:00'))!;
    expect(afterNight).toMatchObject({ kind: 'nap', napNumber: 1, targetMinutes: 150 });
    expect([clockTime(afterNight.from), clockTime(afterNight.to)]).toEqual([clockTime(at(8, '09:00')), clockTime(at(8, '09:20'))]);

    const afterNap1 = nextSleep([night, nap1], defaultTargets, at(8, '11:00'))!;
    expect(afterNap1).toMatchObject({ kind: 'nap', napNumber: 2, targetMinutes: 150 });
    expect(afterNap1.from).toBe(at(8, '12:40'));

    // After the day's two naps it's bedtime: 8 PM, which leaves a 6h 25m wake window after a nap ending at 1:35 PM.
    const afterNap2 = nextSleep([night, nap1, nap2], defaultTargets, at(8, '14:00'))!;
    expect(afterNap2).toMatchObject({ kind: 'bedtime', targetMinutes: 6 * 60 + 25 });
    expect([afterNap2.from, afterNap2.to]).toEqual([at(8, '20:00'), at(8, '20:00')]);
  });

  it('switches to bedtime when another nap would run into the evening', () => {
    const lateNap = event({ Type: 'Sleep', Start: at(8, '15:00'), End: at(8, '16:30') });
    expect(nextSleep([night, lateNap], defaultTargets, at(8, '17:00'))?.kind).toBe('bedtime');
  });

  it('switches to bedtime once a skipped nap no longer leaves room before bed', () => {
    // A nap has to start by 4:30 PM to leave the 3h 30m before an 8 PM bedtime.
    expect(nextSleep([night, nap1], defaultTargets, at(8, '16:30'))?.kind).toBe('nap');
    expect(nextSleep([night, nap1], defaultTargets, at(8, '16:31'))).toMatchObject({ kind: 'bedtime', from: at(8, '20:00') });
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
      'Night', 'Awake 2h 25m', 'Feed', 'Nap 1', 'Awake 2h 30m', 'Nap 2', 'Awake 5h 30m until bedtime'
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

  it('groups what happened during a night inside it, in time order, and still counts the feeds', () => {
    // A feed started a minute before the waking it belongs to, then solids after the night.
    const feed = event({ Type: 'Feed', FeedKind: 'Nursing', Start: at(8, '06:05'), End: at(8, '06:14'), LeftSeconds: 240, RightSeconds: 240 });
    const wake = event({ Type: 'NightWaking', Start: at(8, '06:06'), End: at(8, '06:14'), SettledBy: 'Feeding' });
    const longNight = event({ Type: 'Sleep', IsNight: true, Start: at(7, '22:20'), End: at(8, '08:30') });
    const solids = event({ Type: 'Solids', Start: at(8, '09:20'), End: at(8, '09:20'), Foods: ['Egg'] });
    const timeline = dayTimeline([solids, wake, feed, longNight], at(8, '00:00'), at(8, '10:00'));

    expect(timeline.rows.map(r => r.kind)).toEqual(['sleep', 'event']);
    expect(timeline.rows[0]).toMatchObject({ kind: 'sleep', event: longNight, during: [feed, wake] });
    expect(timeline).toMatchObject({ feedCount: 1, nursingTotal: 8 * 60_000 });
    expect(timeline.sleepTotal).toBe(at(8, '08:30') - at(7, '22:20') - 8 * 60_000);
  });

  it('groups into a running sleep until now, and into a nap', () => {
    const running = event({ Type: 'Sleep', IsNight: true, Start: at(7, '19:05') });
    const wake = event({ Type: 'NightWaking', Start: at(8, '02:14') });
    expect(dayTimeline([running, wake], at(8, '00:00'), at(8, '03:00')).rows)
      .toEqual([expect.objectContaining({ kind: 'sleep', during: [wake] })]);

    const note = event({ Type: 'Note', Start: at(8, '09:30'), Text: 'Stirred' });
    const rows = dayTimeline([night, nap1, note], at(8, '00:00'), at(8, '12:00')).rows;
    expect(rows.at(-1)).toMatchObject({ kind: 'sleep', event: nap1, during: [note] });
  });
});
