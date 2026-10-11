// Maps a Nara Baby CSV export to Kennedy rows. Pure functions, so they can be tested without a server.
import type { BabyEvent, Food, Growth, SolidAmount } from '../../client/src/lib/db.ts';
import { foodGuid, uuidV5 } from '../../client/src/lib/ids.ts';
import { presetCategory } from '../../client/src/lib/foods.ts';
import { isNightTime } from '../../client/src/lib/sleep.ts';

const naraNamespace = '9b8f2a64-1c3e-4d5f-8a7b-6c5d4e3f2a1b';

export type CsvRow = Record<string, string>;

/** RFC 4180: quoted fields may hold commas, quotes ("") and newlines. */
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field || row.length) rows.push([...row, field]);

  const [header, ...body] = rows;
  const names = header.map(h => h.replace(/^﻿/, '').trim());
  return body
    .filter(r => r.some(value => value.trim() !== ''))
    .map(r => Object.fromEntries(names.map((name, i) => [name, (r[i] ?? '').trim()])));
}

// Column names from the Nara export. The exact names of the duration, unit, food and growth columns are matched
// by pattern because they vary; run with --dry-run to check what was picked.
const columns = {
  type: /^Type$/i,
  key: /^_activityKey$/i,
  start: /^Start Date\/time \(Epoch\)$/i,
  sleepEnd: /^Sleep End \(Epoch\)$/i,
  beginSide: /^Begin Side$/i,
  leftDuration: /left.*duration|duration.*left/i,
  rightDuration: /right.*duration|duration.*right/i,
  breastMilkVolume: /^Breast Milk Volume$/i,
  volume: /^Volume$/i,
  volumeUnit: /volume.*unit/i,
  foods: /^(solid|food)/i,
  weight: /^weight(?!.*unit)/i,
  weightUnit: /weight.*unit/i,
  length: /^(length|height)(?!.*unit)/i,
  lengthUnit: /(length|height).*unit/i,
  head: /^head(?!.*unit)/i,
  headUnit: /head.*unit/i,
  note: /^notes?$/i
};

export type Columns = Partial<Record<keyof typeof columns, string>>;

/** Picks the export's header for each column we read. Throws if one we cannot do without is missing. */
export function findColumns(headers: string[]): Columns {
  const found: Columns = {};
  for (const [key, pattern] of Object.entries(columns) as [keyof typeof columns, RegExp][])
    found[key] = headers.find(h => pattern.test(h));
  const missing = (['type', 'key', 'start'] as const).filter(key => !found[key]);
  if (missing.length) throw new Error(`The CSV has no ${missing.join(', ')} column. Headers: ${headers.join(', ')}`);
  return found;
}

export interface Imported {
  events: Partial<BabyEvent>[];
  growth: Partial<Growth>[];
  foods: Partial<Food>[];
  counts: Record<string, number>;
  skipped: Record<string, number>;
}

const kgPerLb = 0.45359237;
const cmPerIn = 2.54;
const mlPerFlOz = 29.5735;

export async function mapRows(rows: CsvRow[]): Promise<Imported> {
  const c = findColumns(Object.keys(rows[0] ?? {}));
  const get = (row: CsvRow, key: keyof Columns) => (c[key] ? row[c[key]!] ?? '' : '');
  const result: Imported = { events: [], growth: [], foods: [], counts: {}, skipped: {} };
  const foodUse = new Map<string, { name: string; count: number; last: number }>();

  for (const row of rows) {
    const type = get(row, 'type');
    const start = Number(get(row, 'start'));
    const guid = await uuidV5(get(row, 'key'), naraNamespace);
    const base = { Guid: guid, Start: start, LoggedBy: 'Nara', Deleted: false, Text: get(row, 'note'), Foods: [] as string[] };

    switch (type) {
      case 'Breastfeed': {
        const left = seconds(get(row, 'leftDuration'), c.leftDuration);
        const right = seconds(get(row, 'rightDuration'), c.rightDuration);
        result.events.push({
          ...base, Type: 'Feed', FeedKind: 'Nursing', LeftSeconds: left, RightSeconds: right,
          StartSide: side(get(row, 'beginSide')), End: start + (left + right) * 1000
        });
        break;
      }
      case 'Bottle Feed': {
        const ml = /ml/i.test(get(row, 'volumeUnit'));
        const amount = Number(get(row, 'breastMilkVolume') || get(row, 'volume')) || 0;
        const oz = ml ? amount / mlPerFlOz : amount;
        result.events.push({ ...base, Type: 'Feed', FeedKind: 'Bottle', BottleOz: Math.round(oz * 100) / 100, End: start });
        break;
      }
      case 'Solid Feed': {
        const entries = get(row, 'foods').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const foods = entries.map(entry => entry.split(':')[0].trim()).filter(Boolean);
        for (const name of foods) {
          const key = name.toLowerCase();
          const use = foodUse.get(key) ?? { name, count: 0, last: 0 };
          foodUse.set(key, { name: use.name, count: use.count + 1, last: Math.max(use.last, start) });
        }
        const amounts = entries.map(entry => solidAmount(entry)).filter(a => a != null);
        result.events.push({ ...base, Type: 'Solids', Foods: foods, SolidAmount: amounts[0] ?? null, End: start });
        break;
      }
      case 'Sleep': {
        const end = Number(get(row, 'sleepEnd')) || null;
        result.events.push({ ...base, Type: 'Sleep', End: end, IsNight: isNightTime(start) });
        break;
      }
      case 'Growth': {
        const weight = measure(get(row, 'weight'), get(row, 'weightUnit') || c.weight, { lb: kgPerLb, kg: 1 });
        const length = measure(get(row, 'length'), get(row, 'lengthUnit') || c.length, { in: cmPerIn, cm: 1 });
        const head = measure(get(row, 'head'), get(row, 'headUnit') || c.head, { in: cmPerIn, cm: 1 });
        result.growth.push({
          Guid: guid, MeasuredAt: start, WeightKg: weight, LengthCm: length, HeadCm: head, LoggedBy: 'Nara', Deleted: false
        });
        break;
      }
      default:
        result.skipped[type || '(blank)'] = (result.skipped[type || '(blank)'] ?? 0) + 1;
        continue;
    }
    result.counts[type] = (result.counts[type] ?? 0) + 1;
  }

  for (const use of foodUse.values()) {
    result.foods.push({
      Guid: await foodGuid(use.name), Name: use.name, Category: presetCategory(use.name), LastUsedAt: use.last,
      UseCount: use.count, LoggedBy: 'Nara', Deleted: false
    });
  }
  return result;
}

/** "LEFT", "Left.nonTimer" → "Left". */
function side(value: string): BabyEvent['StartSide'] {
  const plain = value.replace(/\.nonTimer$/i, '').toLowerCase();
  return plain === 'left' ? 'Left' : plain === 'right' ? 'Right' : null;
}

/** Blank is 0. Accepts "m:ss" / "h:mm:ss", or a number in the unit the header names (seconds by default). */
function seconds(value: string, header = ''): number {
  if (!value) return 0;
  if (value.includes(':')) return value.split(':').map(Number).reduce((total, part) => total * 60 + part, 0);
  const n = Number(value) || 0;
  if (/\(ms\)|milli/i.test(header)) return Math.round(n / 1000);
  if (/\(min|minute/i.test(header)) return Math.round(n * 60);
  return Math.round(n);
}

/** "Cereal: amountKey=ALL; reactionKey=LOVE" → All. */
function solidAmount(entry: string): SolidAmount | null {
  const key = entry.match(/amountKey=(\w+)/i)?.[1]?.toUpperCase();
  if (key === 'LITTLE') return 'Taste';
  if (key === 'ALL') return 'All';
  return key ? 'Some' : null;
}

/** A value in the unit named by its unit column (or header), converted to kg or cm. Blank is null. */
function measure(value: string, unit: string, factors: Record<string, number>): number | null {
  if (!value) return null;
  const [, factor] = Object.entries(factors).find(([u]) => new RegExp(`\\b${u}\\b`, 'i').test(unit))
    ?? Object.entries(factors)[0];
  return Math.round(Number(value) * factor * 1000) / 1000;
}
