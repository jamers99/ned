import { describe, expect, it, vi } from 'vitest';
import { newEvent } from './actions.ts';
import type { Food, Growth } from './db.ts';
import { localIso, toCsv } from './export.ts';

vi.stubEnv('TZ', 'America/New_York');

const synced = { ModifiedAt: '', Deleted: false, LoggedBy: 'John', dirty: 0 };
const at = (hour: number, minute = 0) => Date.UTC(2026, 9, 18, hour, minute);

describe('export', () => {
  it('gives local times with their offset', () => {
    expect(localIso(at(10, 5))).toBe('2026-10-18T06:05:00-04:00');
    expect(localIso(Date.UTC(2026, 0, 5, 3))).toBe('2026-01-04T22:00:00-05:00');
  });

  it('writes one row per entry, oldest first, without deleted ones', () => {
    const night = newEvent({ Type: 'Sleep', Start: at(2, 20), End: at(12, 30), IsNight: true, SleepLocation: 'Crib' });
    const feed = newEvent({
      Type: 'Feed', FeedKind: 'Nursing', Start: at(10, 5), End: at(10, 14), LeftSeconds: 240, RightSeconds: 270,
      StartSide: 'Left', Text: 'Fussy, then "fine"\nall good'
    });
    const deleted = { ...newEvent({ Type: 'Note', Start: at(11), Text: 'oops' }), Deleted: true };
    const solids = newEvent({ Type: 'Solids', Start: at(13, 20), End: at(13, 20), Foods: ['Egg', 'Mango'], SolidAmount: 'All' });
    const growth: Growth = { ...synced, Guid: 'g', MeasuredAt: at(14), WeightKg: 7.2, LengthCm: 66, HeadCm: null };
    const food: Food = { ...synced, Guid: 'f', Name: 'Mango', Category: 'Fruit', LastUsedAt: at(13, 20), UseCount: 3 };

    const lines = toCsv([solids, deleted, feed, night], [growth], [food]).trimEnd().split('\r\n');
    const header = lines[0].split(',');
    const rows = lines.slice(1);
    const value = (row: string, column: string) => row.split(',')[header.indexOf(column)];

    expect(header.slice(0, 7)).toEqual(['Record', 'Type', 'Start', 'End', 'Start UTC', 'End UTC', 'Minutes']);
    expect(rows.map(r => r.split(',').slice(0, 2).join(' '))[0]).toBe('Event Sleep');
    expect(value(rows[0], 'Start')).toBe('2026-10-17T22:20:00-04:00');
    expect(value(rows[0], 'End UTC')).toBe('2026-10-18T12:30:00.000Z');
    expect(value(rows[0], 'Minutes')).toBe('610');
    expect(value(rows[0], 'Night')).toBe('true');
    expect(value(rows[0], 'Where')).toBe('Crib');

    expect(value(rows[1], 'Left seconds')).toBe('240');
    expect(rows[1]).toContain('"Fussy, then ""fine""\nall good"');
    expect(lines.join('\n')).not.toContain('oops');

    expect(rows.slice(2).map(r => r.split(',').slice(0, 2).join(' '))).toEqual(['Event Solids', 'Food ', 'Growth ']);
    expect(rows[2]).toContain('Egg; Mango');
    expect(value(rows[3], 'Food')).toBe('Mango');
    expect(value(rows[3], 'Times used')).toBe('3');
    expect(value(rows[4], 'Weight kg')).toBe('7.2');
  });
});
