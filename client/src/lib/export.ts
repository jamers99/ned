import { baby } from './baby.svelte.ts';
import { db, type BabyEvent, type Food, type Growth } from './db.ts';
import { toDateInput } from './time.ts';

// Everything logged, as one CSV that another app or a spreadsheet can read: one row per entry, the oldest
// first. Each time is given twice, in this phone's time zone (with its offset) and in UTC.

const columns = [
  'Record', 'Type', 'Start', 'End', 'Start UTC', 'End UTC', 'Minutes', 'Night', 'Where', 'Fell asleep', 'Woke up',
  'Settled by', 'Feed', 'Start side', 'Left seconds', 'Right seconds', 'Bottle oz', 'Foods', 'Amount',
  'Weight kg', 'Length cm', 'Head cm', 'Food', 'Category', 'Times used', 'Note', 'Logged by'
] as const;

type Row = Partial<Record<(typeof columns)[number], string | number | boolean | null>>;

export function toCsv(events: BabyEvent[], growth: Growth[], foods: Food[]): string {
  const rows: [number, Row][] = [
    ...events.filter(e => !e.Deleted).map(e => [e.Start, eventRow(e)] as [number, Row]),
    ...growth.filter(g => !g.Deleted).map(g => [g.MeasuredAt, growthRow(g)] as [number, Row]),
    ...foods.filter(f => !f.Deleted).map(f => [f.LastUsedAt ?? 0, foodRow(f)] as [number, Row])
  ];
  rows.sort((a, b) => a[0] - b[0]);
  return [columns.join(','), ...rows.map(([, row]) => columns.map(c => cell(row[c])).join(','))].join('\r\n') + '\r\n';
}

function eventRow(e: BabyEvent): Row {
  return {
    Record: 'Event',
    Type: e.Type,
    ...times(e.Start, e.End),
    Minutes: e.End != null ? Math.round((e.End - e.Start) / 60_000) : null,
    Night: e.Type === 'Sleep' ? e.IsNight : null,
    Where: e.SleepLocation,
    'Fell asleep': e.SleepOnset,
    'Woke up': e.WakeMood,
    'Settled by': e.SettledBy,
    Feed: e.FeedKind,
    'Start side': e.StartSide,
    'Left seconds': e.FeedKind === 'Nursing' ? e.LeftSeconds : null,
    'Right seconds': e.FeedKind === 'Nursing' ? e.RightSeconds : null,
    'Bottle oz': e.BottleOz,
    Foods: e.Foods.join('; '),
    Amount: e.SolidAmount,
    Note: e.Text,
    'Logged by': e.LoggedBy
  };
}

function growthRow(g: Growth): Row {
  return {
    Record: 'Growth',
    ...times(g.MeasuredAt, null),
    'Weight kg': g.WeightKg,
    'Length cm': g.LengthCm,
    'Head cm': g.HeadCm,
    'Logged by': g.LoggedBy
  };
}

function foodRow(f: Food): Row {
  return {
    Record: 'Food',
    ...(f.LastUsedAt != null ? times(f.LastUsedAt, null) : {}),
    Food: f.Name,
    Category: f.Category,
    'Times used': f.UseCount,
    'Logged by': f.LoggedBy
  };
}

function times(start: number, end: number | null): Row {
  return {
    Start: localIso(start),
    End: end != null ? localIso(end) : null,
    'Start UTC': new Date(start).toISOString(),
    'End UTC': end != null ? new Date(end).toISOString() : null
  };
}

/** "2026-10-18T06:05:00-04:00": the phone's wall-clock time with its UTC offset. */
export function localIso(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  return `${toDateInput(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${offset < 0 ? '-' : '+'}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}

function cell(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Hands the CSV to the share sheet where there is one (so it can go to Files or another app), else downloads it. */
export async function exportData() {
  const csv = toCsv(await db.events.toArray(), await db.growth.toArray(), await db.foods.toArray());
  const name = `ned-${baby.name.toLowerCase()}-${toDateInput(Date.now())}.csv`;
  // The byte order mark tells spreadsheet apps the file is UTF-8.
  const file = new File(['﻿', csv], name, { type: 'text/csv' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
