import { describe, expect, it } from 'vitest';
import { endAfter } from './time.ts';

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
