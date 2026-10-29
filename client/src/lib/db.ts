import Dexie, { type EntityTable, type Table } from 'dexie';

// Rows mirror the server entities. Times are epoch milliseconds locally and ISO strings on the wire.

export type EventType = 'Sleep' | 'NightWaking' | 'Feed' | 'Solids' | 'Note';
export type SleepLocation = 'Crib' | 'Contact' | 'OnTheGo';
export type SleepOnset = 'Own' | 'Fed' | 'Rocked' | 'Held';
export type WakeMood = 'Happy' | 'Fussy' | 'Crying';
export type SettledBy = 'Feeding' | 'Soothing' | 'Own';
export type FeedKind = 'Nursing' | 'Bottle';
export type Side = 'Left' | 'Right';
export type SolidAmount = 'Taste' | 'Some' | 'All';
export type FoodCategory = 'Fruit' | 'Veggies' | 'Protein' | 'Grains' | 'Other';
export type Pronouns = 'She' | 'He' | 'They';

export interface Synced {
  Guid: string;
  /** Server save time, exactly as the server sent it. Empty until the row has been pulled. */
  ModifiedAt: string;
  Deleted: boolean;
  LoggedBy: string;
  /** 0 when the server has this version; otherwise a stamp of the latest local edit not yet pushed. */
  dirty: number;
}

export interface BabyEvent extends Synced {
  Type: EventType;
  Start: number;
  End: number | null;
  IsNight: boolean;
  SleepLocation: SleepLocation | null;
  SleepOnset: SleepOnset | null;
  WakeMood: WakeMood | null;
  SettledBy: SettledBy | null;
  FeedKind: FeedKind | null;
  LeftSeconds: number;
  RightSeconds: number;
  StartSide: Side | null;
  ActiveSide: Side | null;
  ActiveSince: number | null;
  BottleOz: number | null;
  Foods: string[];
  SolidAmount: SolidAmount | null;
  Text: string;
}

export interface Growth extends Synced {
  MeasuredAt: number;
  WeightKg: number | null;
  LengthCm: number | null;
  HeadCm: number | null;
}

export interface Food extends Synced {
  Name: string;
  Category: FoodCategory;
  LastUsedAt: number | null;
  UseCount: number;
}

export interface Settings extends Synced {
  NapsPerDay: number;
  NapWakeWindowMinutes: number;
  BedtimeWakeWindowMinutes: number;
  /** The night, as minutes after midnight: 8 PM – 6 AM by default. Bedtime aims for its start. */
  NightStartMinutes: number;
  NightEndMinutes: number;
  /** Missing until a parent sets them; the app then says "Baby" and they. */
  BabyName?: string;
  BabyPronouns?: Pronouns;
}

export interface Meta {
  key: string;
  value: unknown;
}

// No query cache: live queries read IndexedDB directly. With the cache on, a read interrupted while Android
// had the app suspended could leave a cached query that never settles, freezing every screen until a restart.
export const db = new Dexie('ned', { cache: 'disabled' }) as Dexie & {
  events: EntityTable<BabyEvent, 'Guid'>;
  growth: EntityTable<Growth, 'Guid'>;
  foods: EntityTable<Food, 'Guid'>;
  settings: EntityTable<Settings, 'Guid'>;
  meta: EntityTable<Meta, 'key'>;
};

db.version(1).stores({
  events: 'Guid, Start, dirty',
  growth: 'Guid, MeasuredAt, dirty',
  foods: 'Guid, LastUsedAt, dirty',
  settings: 'Guid, dirty',
  meta: 'key'
});

export type SyncedTable = 'events' | 'growth' | 'foods' | 'settings';
export const syncedTables: SyncedTable[] = ['events', 'growth', 'foods', 'settings'];

/** A synced table seen through the fields every synced row has, for code that handles all four alike. */
export function syncedTable(name: SyncedTable): Table<Synced, string> {
  return db[name] as unknown as Table<Synced, string>;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}
