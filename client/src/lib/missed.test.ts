import { describe, expect, it } from 'vitest';
import type { BabyEvent } from './db.ts';
import { askStillAsleep, napOverdueAfter, pastWaking } from './sleep.ts';
import { hour, minute } from './time.ts';

// Logging that was missed at the time: a nap left running, a night waking added afterwards.
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

const nap = (dayOfMonth: number, minutes: number) =>
  event({ Type: 'Sleep', Start: at(dayOfMonth, '09:00'), End: at(dayOfMonth, '09:00') + minutes * minute });

describe('still asleep?', () => {
  // Naps of 40m to 1h 30m: the middle half runs 45m–1h 15m.
  const history = [nap(4, 40), nap(5, 45), nap(6, 60), nap(7, 75), nap(8, 90)];
  const running = event({ Type: 'Sleep', Start: at(9, '13:00') });
  const events = [...history, running];

  it('waits until well past her usual longest nap', () => {
    expect(napOverdueAfter(events, at(9, '13:00'))).toBe(75 * minute + 37.5 * minute);
    expect(askStillAsleep(running, events, at(9, '14:50'))).toBe(false);
    expect(askStillAsleep(running, events, at(9, '15:00'))).toBe(true);
  });

  it('falls back to 3 hours before there are a few naps to go on', () => {
    expect(napOverdueAfter([running], at(9, '13:00'))).toBe(3 * hour);
    expect(askStillAsleep(running, [running], at(9, '15:59'))).toBe(false);
    expect(askStillAsleep(running, [running], at(9, '16:01'))).toBe(true);
  });

  it('stays quiet for an hour after she is said to be still asleep, and never asks during a night', () => {
    expect(askStillAsleep(running, events, at(9, '15:30'), at(9, '15:00'))).toBe(false);
    expect(askStillAsleep(running, events, at(9, '16:01'), at(9, '15:00'))).toBe(true);
    const night = event({ Type: 'Sleep', IsNight: true, Start: at(8, '19:00') });
    expect(askStillAsleep(night, [...history, night], at(9, '11:00'))).toBe(false);
  });
});

describe('adding a past waking', () => {
  const night = event({ Type: 'Sleep', IsNight: true, Start: at(8, '19:30') });

  it('places the times inside the night, after midnight too', () => {
    expect(pastWaking(night, at(1, '02:10'), at(1, '02:25'), at(9, '05:00')))
      .toEqual({ Start: at(9, '02:10'), End: at(9, '02:25') });
    expect(pastWaking(night, at(1, '23:50'), at(1, '00:20'), at(9, '05:00')))
      .toEqual({ Start: at(8, '23:50'), End: at(9, '00:20') });
  });

  it('ends no later than now, and refuses a waking that has not started yet', () => {
    expect(pastWaking(night, at(1, '04:40'), at(1, '05:30'), at(9, '05:00')))
      .toEqual({ Start: at(9, '04:40'), End: at(9, '05:00') });
    expect(pastWaking(night, at(1, '05:10'), at(1, '05:30'), at(9, '05:00'))).toBeNull();
  });
});
