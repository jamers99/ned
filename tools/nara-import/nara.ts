// Maps a Nara Baby CSV export to Ned rows. Pure functions, so they can be tested without a server.
import type { BabyEvent, Food, Growth, SolidAmount } from '../../client/src/lib/db.ts';
import { firstFamily, foodGuid, uuidV5 } from '../../client/src/lib/ids.ts';
import { presetCategory } from '../../client/src/lib/foods.ts';
import { defaultTargets, isNightTime } from '../../client/src/lib/sleep.ts';

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

// Nara's column names. Times are epoch ms (UTC); the other time columns can mix time zones from travel.
const columns = {
  type: 'Type',
  key: '_activityKey',
  start: 'Start Date/time (Epoch)',
  note: 'Note',
  beginSide: '[Breastfeed] Begin Side',
  leftSeconds: '[Breastfeed] Left Duration (Seconds)',
  rightSeconds: '[Breastfeed] Right Duration (Seconds)',
  breastMilk: '[Bottle Feed] Breast Milk Volume',
  breastMilkUnit: '[Bottle Feed] Breast Milk Volume Unit',
  formula: '[Bottle Feed] Formula Volume',
  formulaUnit: '[Bottle Feed] Formula Volume Unit',
  volume: '[Bottle Feed] Volume',
  volumeUnit: '[Bottle Feed] Volume Unit',
  foods: '[Solid Feed] Food',
  sleepEnd: '[Sleep] End Date/time (Epoch)',
  weight: '[Growth] Weight',
  weightUnit: '[Growth] Weight Unit',
  length: '[Growth] Height',
  lengthUnit: '[Growth] Height Unit',
  head: '[Growth] Head Size',
  headUnit: '[Growth] Head Size Unit'
};

export interface Imported {
  events: Partial<BabyEvent>[];
  growth: Partial<Growth>[];
  foods: Partial<Food>[];
  counts: Record<string, number>;
  skipped: Record<string, number>;
}

const kgPerLb = 0.45359237;
const cmPerIn = 2.54;
const ozPerMl = 1 / 29.5735;

export async function mapRows(rows: CsvRow[], family = firstFamily): Promise<Imported> {
  const missing = Object.values(columns).filter(name => rows.length && !(name in rows[0]));
  if (missing.length) throw new Error(`The CSV has no ${missing.join(', ')} column.`);
  const get = (row: CsvRow, key: keyof typeof columns) => row[columns[key]] ?? '';
  const result: Imported = { events: [], growth: [], foods: [], counts: {}, skipped: {} };
  const foodUse = new Map<string, { name: string; count: number; last: number }>();

  for (const row of rows) {
    const type = get(row, 'type');
    const start = Number(get(row, 'start'));
    const guid = await uuidV5(get(row, 'key'), naraNamespace);
    const base = { Guid: guid, Start: start, LoggedBy: 'Nara', Deleted: false, Text: get(row, 'note'), Foods: [] as string[] };

    switch (type) {
      case 'Breastfeed': {
        const left = Number(get(row, 'leftSeconds')) || 0;
        const right = Number(get(row, 'rightSeconds')) || 0;
        result.events.push({
          ...base, Type: 'Feed', FeedKind: 'Nursing', LeftSeconds: left, RightSeconds: right,
          StartSide: side(get(row, 'beginSide')), End: start + (left + right) * 1000
        });
        break;
      }
      case 'Bottle Feed': {
        const oz = measure(get(row, 'breastMilk'), get(row, 'breastMilkUnit'), { floz: 1, ml: ozPerMl })
          ?? measure(get(row, 'formula'), get(row, 'formulaUnit'), { floz: 1, ml: ozPerMl })
          ?? measure(get(row, 'volume'), get(row, 'volumeUnit'), { floz: 1, ml: ozPerMl }) ?? 0;
        result.events.push({ ...base, Type: 'Feed', FeedKind: 'Bottle', BottleOz: Math.round(oz * 100) / 100, End: start });
        break;
      }
      case 'Solid Feed': {
        // Older entries look like "Cereal: amountKey=ALL; reactionKey=LOVE"; newer ones are just the name.
        const entries = get(row, 'foods').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const foods = entries.map(entry => entry.split(':')[0].trim()).filter(Boolean);
        for (const name of foods) {
          const key = name.toLowerCase();
          const use = foodUse.get(key) ?? { name, count: 0, last: 0 };
          foodUse.set(key, { name: use.name, count: use.count + 1, last: Math.max(use.last, start) });
        }
        const amount = entries.map(solidAmount).find(a => a != null) ?? null;
        result.events.push({ ...base, Type: 'Solids', Foods: foods, SolidAmount: amount, End: start });
        break;
      }
      case 'Sleep': {
        const end = Number(get(row, 'sleepEnd')) || null;
        result.events.push({ ...base, Type: 'Sleep', End: end, IsNight: isNightTime(start, defaultTargets) });
        break;
      }
      case 'Growth': {
        result.growth.push({
          Guid: guid, MeasuredAt: start, LoggedBy: 'Nara', Deleted: false,
          WeightKg: measure(get(row, 'weight'), get(row, 'weightUnit'), { lb: kgPerLb, kg: 1 }),
          LengthCm: measure(get(row, 'length'), get(row, 'lengthUnit'), { in: cmPerIn, cm: 1 }),
          HeadCm: measure(get(row, 'head'), get(row, 'headUnit'), { in: cmPerIn, cm: 1 })
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
      Guid: await foodGuid(use.name, family), Name: use.name, Category: presetCategory(use.name), LastUsedAt: use.last,
      UseCount: use.count, LoggedBy: 'Nara', Deleted: false
    });
  }
  return result;
}

/** "LEFT" → "Left". */
function side(value: string): BabyEvent['StartSide'] {
  const plain = value.toLowerCase();
  return plain === 'left' ? 'Left' : plain === 'right' ? 'Right' : null;
}

/** "amountKey=LITTLE" → Taste, "ALL" → All, any other amount → Some. */
function solidAmount(entry: string): SolidAmount | null {
  const key = entry.match(/amountKey=(\w+)/i)?.[1]?.toUpperCase();
  if (key === 'LITTLE') return 'Taste';
  if (key === 'ALL') return 'All';
  return key ? 'Some' : null;
}

/** A value converted by the factor for its unit ("LB", "FLOZ", ...), rounded to 3 places. Blank is null. */
function measure(value: string, unit: string, factors: Record<string, number>): number | null {
  if (!value) return null;
  const factor = factors[unit.toLowerCase()] ?? Object.values(factors)[0];
  return Math.round(Number(value) * factor * 1000) / 1000;
}
