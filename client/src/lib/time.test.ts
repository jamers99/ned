import { describe, expect, it } from 'vitest';
import { ageText, duration, endAfter, hour, minute, monthsOld } from './time.ts';

const at = (dayOfMonth: number, h: number, m = 0) => new Date(2026, 9, dayOfMonth, h, m).getTime();

describe('picking an end time', () => {
  it('lands a nap left running overnight back on the day it started', () => {
    // Fell asleep Sunday 1:05 PM; "Woke up" was tapped Monday 9:20 AM, then changed to 2:30 PM.
    expect(endAfter(at(11, 13, 5), at(12, 14, 30))).toBe(at(11, 14, 30));
  });

  it('carries a night past midnight', () => {
    expect(endAfter(at(11, 19, 5), at(11, 6, 40))).toBe(at(12, 6, 40));
  });

  it('keeps an end at the start as no time at all', () => {
    expect(endAfter(at(11, 13, 5), at(12, 13, 5))).toBe(at(11, 13, 5));
  });
});

describe('durations', () => {
  it('ticks in seconds for the first minute', () => {
    expect(duration(0)).toBe('0m');
    expect(duration(400)).toBe('0s');
    expect(duration(42_000)).toBe('42s');
    expect(duration(minute)).toBe('1m');
    expect(duration(hour + 5 * minute)).toBe('1h 05m');
  });
});

describe('age', () => {
  const born = new Date(2026, 2, 17).getTime();
  it('counts weeks for the first two months, then months', () => {
    expect(ageText(born, new Date(2026, 3, 7).getTime())).toBe('3 weeks');
    expect(ageText(born, new Date(2026, 10, 27).getTime())).toBe('8 months');
    expect(ageText(born, new Date(2026, 10, 16).getTime())).toBe('7 months');
    expect(monthsOld(born, new Date(2027, 2, 17).getTime())).toBe(12);
  });
});
