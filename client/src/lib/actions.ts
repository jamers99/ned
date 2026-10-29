// Every local write goes through here: write to Dexie, mark the row dirty, and schedule a push.
// The UI re-renders from Dexie, so nothing waits on the network.
import { db, type BabyEvent, type Food, type FoodCategory, type Growth, type Settings, type Side } from './db.ts';
import { settingsGuid } from './family.ts';
import { foodGuid } from './ids.ts';
import { targetsFrom, wakingsDuring } from './sleep.ts';
import { status } from './state.svelte.ts';
import { scheduleSync } from './sync.ts';
import { day } from './time.ts';

let lastEdit = 0;

/** A unique, increasing stamp, so a push can tell whether a row changed while it was in flight. */
export function editStamp(): number {
  lastEdit = Math.max(lastEdit + 1, Date.now());
  return lastEdit;
}

export function newEvent(fields: Partial<BabyEvent> & Pick<BabyEvent, 'Type'>): BabyEvent {
  const start = fields.Start ?? Date.now();
  return {
    Guid: crypto.randomUUID(),
    ModifiedAt: '',
    Deleted: false,
    LoggedBy: status.user,
    dirty: 0,
    Start: start,
    End: null,
    IsNight: false,
    SleepLocation: null,
    SleepOnset: null,
    WakeMood: null,
    SettledBy: null,
    FeedKind: null,
    LeftSeconds: 0,
    RightSeconds: 0,
    StartSide: null,
    ActiveSide: null,
    ActiveSince: null,
    BottleOz: null,
    Foods: [],
    SolidAmount: null,
    Text: '',
    ...fields
  };
}

export async function addEvent(fields: Partial<BabyEvent> & Pick<BabyEvent, 'Type'>): Promise<BabyEvent> {
  const event = { ...newEvent(fields), dirty: editStamp() };
  await db.events.add(event);
  scheduleSync();
  return event;
}

export async function updateEvent(guid: string, changes: Partial<BabyEvent>) {
  await db.events.update(guid, { ...changes, dirty: editStamp() });
  scheduleSync();
}

export async function deleteEvent(guid: string) {
  await updateEvent(guid, { Deleted: true });
}

/**
 * Changes a sleep's times and keeps its wakings inside it: a waking it no longer covers is deleted, and one
 * running past its new end stops there. A sleep moved whole takes its wakings along.
 */
export async function updateSleep(guid: string, changes: Partial<Pick<BabyEvent, 'Start' | 'End'>>) {
  const sleep = await db.events.get(guid);
  if (!sleep) return;
  const wakings = wakingsDuring(sleep, await db.events.where('Start').aboveOrEqual(sleep.Start).toArray());
  const start = changes.Start ?? sleep.Start;
  const end = (changes.End === undefined ? sleep.End : changes.End) ?? Infinity;
  const shift = start - sleep.Start;
  const whole = shift !== 0 && sleep.End != null && end - sleep.End === shift;
  await updateEvent(guid, changes);
  for (const w of wakings) {
    if (whole) await updateEvent(w.Guid, { Start: w.Start + shift, End: w.End == null ? null : w.End + shift });
    else if (w.Start < start || w.Start >= end) await deleteEvent(w.Guid);
    else if ((w.End ?? Infinity) > end) await updateEvent(w.Guid, { End: end });
  }
}

/**
 * Starts a sleep, a night waking or a nursing feed, unless one of that kind is already running. A second tap
 * (or a tap before the screen has caught up) returns the running one instead of starting another.
 */
export async function startRunning(fields: Partial<BabyEvent> & Pick<BabyEvent, 'Type'>): Promise<BabyEvent> {
  const event = { ...newEvent(fields), dirty: editStamp() };
  const running = await db.transaction('rw', db.events, async () => {
    const existing = await db.events
      .where('Start').above(event.Start - 2 * day)
      .filter(e => e.Type === event.Type && e.FeedKind === event.FeedKind && e.End == null && !e.Deleted)
      .first();
    if (!existing) await db.events.add(event);
    return existing;
  });
  if (running) return running;
  scheduleSync();
  return event;
}

/** Stops the running side at `at`, folding its time into its total, then starts `side` (if any). */
export function switchSide(feed: BabyEvent, side: Side | null, at = Date.now(), changes: Partial<BabyEvent> = {}) {
  if (feed.ActiveSide && feed.ActiveSince) {
    const key = feed.ActiveSide === 'Left' ? 'LeftSeconds' : 'RightSeconds';
    changes[key] = feed[key] + Math.round((at - feed.ActiveSince) / 1000);
  }
  return updateEvent(feed.Guid, { ...changes, ActiveSide: side, ActiveSince: side ? at : null });
}

export const endFeed = (feed: BabyEvent, at = Date.now()) => switchSide(feed, null, at, { End: at });

/** Saves the chosen foods on a Solids event at `at` and bumps each food's recency, creating new foods. */
export async function addSolids(foods: { name: string; category: FoodCategory }[], amount: BabyEvent['SolidAmount'],
  at = Date.now()) {
  const now = Date.now();
  const names = foods.map(f => f.name.trim());
  // Outside the transaction: awaiting anything but IndexedDB inside one lets it commit early.
  const guids = await Promise.all(names.map(name => foodGuid(name, status.family)));
  await db.transaction('rw', db.events, db.foods, async () => {
    for (const [i, name] of names.entries()) {
      const guid = guids[i];
      const existing = await db.foods.get(guid);
      const food: Food = existing
        ? { ...existing, LastUsedAt: now, UseCount: existing.UseCount + 1, Deleted: false }
        : {
          Guid: guid, ModifiedAt: '', Deleted: false, LoggedBy: status.user, dirty: 0,
          Name: name, Category: foods[i].category, LastUsedAt: now, UseCount: 1
        };
      await db.foods.put({ ...food, dirty: editStamp() });
    }
    await db.events.add({
      ...newEvent({ Type: 'Solids', Start: at, End: at, Foods: names, SolidAmount: amount }),
      dirty: editStamp()
    });
  });
  scheduleSync();
}

export async function saveGrowth(growth: Omit<Growth, 'Guid' | 'ModifiedAt' | 'Deleted' | 'LoggedBy' | 'dirty'>
  & { Guid?: string }) {
  const existing = growth.Guid ? await db.growth.get(growth.Guid) : undefined;
  await db.growth.put({
    ModifiedAt: '', Deleted: false, LoggedBy: status.user,
    ...existing,
    ...growth,
    Guid: growth.Guid ?? crypto.randomUUID(),
    dirty: editStamp()
  });
  scheduleSync();
}

export async function deleteGrowth(guid: string) {
  await db.growth.update(guid, { Deleted: true, dirty: editStamp() });
  scheduleSync();
}

async function loadSettings(): Promise<Settings> {
  const row = await db.settings.get(settingsGuid());
  return {
    Guid: settingsGuid(), ModifiedAt: '', Deleted: false, LoggedBy: status.user, dirty: 0, ...row, ...targetsFrom(row)
  };
}

export async function updateSettings(changes: Partial<Settings>) {
  const current = await loadSettings();
  await db.settings.put({ ...current, ...changes, dirty: editStamp() });
  scheduleSync();
}
