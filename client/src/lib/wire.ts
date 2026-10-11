// Maps local rows to and from the server's OData shape. Shared with tools/nara-import.
import type { SyncedTable } from './db.ts';

export const entitySets: Record<SyncedTable, string> = {
  events: 'Event',
  growth: 'Growth',
  foods: 'Food',
  settings: 'Settings'
};

const common = ['Guid', 'ModifiedAt', 'Deleted', 'LoggedBy'];

export const fields: Record<SyncedTable, string[]> = {
  events: [...common, 'Type', 'Start', 'End', 'IsNight', 'SleepLocation', 'SleepOnset', 'WakeMood', 'SettledBy',
    'FeedKind', 'LeftSeconds', 'RightSeconds', 'StartSide', 'ActiveSide', 'ActiveSince', 'BottleOz', 'Foods',
    'SolidAmount', 'Text'],
  growth: [...common, 'MeasuredAt', 'WeightKg', 'LengthCm', 'HeadCm'],
  foods: [...common, 'Name', 'Category', 'LastUsedAt', 'UseCount'],
  settings: [...common, 'NapsPerDay', 'Nap1WakeWindowMinutes', 'Nap2WakeWindowMinutes', 'BedtimeWakeWindowMinutes',
    'BedtimeEarliestMinutes', 'BedtimeLatestMinutes']
};

const timeFields: Record<SyncedTable, string[]> = {
  events: ['Start', 'End', 'ActiveSince'],
  growth: ['MeasuredAt'],
  foods: ['LastUsedAt'],
  settings: []
};

type Row = Record<string, unknown>;

/** Parses a server instant. The server sends microseconds; trim to milliseconds so every browser parses it. */
export function parseInstant(value: string): number {
  return Date.parse(value.replace(/(\.\d{3})\d+/, '$1'));
}

/** The request body for a row: everything except the key, the server's stamp and local bookkeeping. */
export function toServer(table: SyncedTable, row: object): Row {
  const body: Row = {};
  for (const field of fields[table]) {
    if (field === 'Guid' || field === 'ModifiedAt') continue;
    body[field] = (row as Row)[field];
  }
  for (const field of timeFields[table])
    body[field] = body[field] == null ? null : new Date(body[field] as number).toISOString();
  if (table === 'events')
    body.Foods = (body.Foods as string[]).join('\n');
  return body;
}

export function fromServer(table: SyncedTable, json: Row): Row {
  const row: Row = { dirty: 0 };
  for (const field of fields[table])
    row[field] = json[field];
  for (const field of timeFields[table])
    row[field] = row[field] == null ? null : parseInstant(row[field] as string);
  if (table === 'events')
    row.Foods = ((row.Foods as string | null) ?? '').split('\n').filter(Boolean);
  for (const field of ['LoggedBy', 'Text', 'Name'])
    if (field in row && row[field] == null) row[field] = '';
  return row;
}
