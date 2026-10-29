import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newEvent } from './actions.ts';
import { db, setMeta, type BabyEvent, type Food, type Settings } from './db.ts';
import { firstFamily, foodGuid } from './ids.ts';
import { status } from './state.svelte.ts';
import { abandonSync, oldestUnpushed, syncIsStale, syncNow } from './sync.ts';

/** Just enough of the Benevia API: rotating refresh, the family, upserts in $batch, and pulls by ModifiedAt. */
class FakeServer {
  rows = new Map<string, Record<string, unknown>>();
  family = firstFamily;
  familyHasSettings = true;
  clock = Date.UTC(2026, 9, 11, 12);
  onBatch: () => Promise<void> = async () => {};
  onPull: () => void = () => {};

  // Like PostgreSQL, stamps carry microseconds.
  save(guid: string, fields: Record<string, unknown>) {
    this.clock += 1;
    const modifiedAt = new Date(this.clock).toISOString().replace('Z', '123Z');
    this.rows.set(guid, { ...this.rows.get(guid), ...fields, Guid: guid, ModifiedAt: modifiedAt });
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'http://phone');
    if (url.pathname === '/api/auth/refresh') {
      const payload = btoa(JSON.stringify({ exp: Date.now() / 1000 + 1800 }));
      return Response.json({ accessToken: `x.${payload}.y`, refreshToken: 'next' });
    }
    if (url.pathname === '/api/Family')
      return Response.json({ value: [{ Guid: this.family, InviteCode: 'K7QM-3WXP' }] });
    if (url.pathname.startsWith('/api/Settings('))
      return this.familyHasSettings ? Response.json({ Guid: this.family }) : new Response('', { status: 404 });
    if (url.pathname === '/api/$batch') {
      await this.onBatch();
      const { requests } = JSON.parse(String(init!.body));
      const responses = requests.map((r: { id: string; method: string; url: string; body: Record<string, unknown> }) => {
        const patchGuid = r.url.match(/^\w+\((.+)\)$/)?.[1];
        if (r.method === 'PATCH' && patchGuid) {
          if (!this.rows.has(patchGuid)) return { id: r.id, status: 404, body: { text: 'Not found' } };
          this.save(patchGuid, r.body);
          return { id: r.id, status: 200, body: {} };
        }
        if (this.rows.has(r.body.Guid as string)) return { id: r.id, status: 400, body: [{ text: 'In use' }] };
        this.save(r.body.Guid as string, r.body);
        return { id: r.id, status: 200, body: {} };
      });
      return Response.json({ responses });
    }
    if (url.pathname === '/api/Event') {
      this.onPull();
      const since = url.searchParams.get('$filter')!.replace('ModifiedAt ge ', '');
      const value = [...this.rows.values()].filter(r => (r.ModifiedAt as string) >= since);
      return Response.json({ value });
    }
    return Response.json({ value: [] });
  };
}

let server: FakeServer;

beforeEach(async () => {
  await db.delete();
  await db.open();
  await setMeta('refreshToken', 'first');
  status.user = 'John';
  status.family = firstFamily;
  status.needsSignIn = false;
  status.error = '';
  server = new FakeServer();
  vi.stubGlobal('fetch', server.fetch);
});

const sleep = (fields: Partial<BabyEvent> = {}) =>
  newEvent({ Type: 'Sleep', Start: Date.UTC(2026, 9, 11, 1), IsNight: true, ...fields });

describe('sync', () => {
  it('creates rows the server has never seen and marks them clean', async () => {
    const local = sleep({ Foods: [] });
    await db.events.add({ ...local, dirty: 1 });

    await syncNow();

    expect(server.rows.get(local.Guid)).toMatchObject({ Type: 'Sleep', Start: '2026-10-11T01:00:00.000Z', IsNight: true });
    expect(await db.events.get(local.Guid)).toMatchObject({ dirty: 0, ModifiedAt: server.rows.get(local.Guid)!.ModifiedAt });
  });

  it("pulls the other phone's edits and deletions, but never over an unpushed local edit", async () => {
    const shared = sleep();
    const mine = sleep({ Start: Date.UTC(2026, 9, 11, 3) });
    await db.events.bulkAdd([{ ...shared, dirty: 1 }, { ...mine, dirty: 1 }]);
    await syncNow();

    server.save(shared.Guid, { Deleted: true, LoggedBy: 'Jane' });
    server.save(mine.Guid, { Text: 'from Jane' });
    await db.events.update(mine.Guid, { Text: 'from John', dirty: 5 });
    server.onBatch = async () => {
      // Pull runs after push, so by now the local edit has been pushed and wins.
      expect((await db.events.get(mine.Guid))!.dirty).toBe(5);
    };
    await syncNow();

    expect(await db.events.get(shared.Guid)).toMatchObject({ Deleted: true, LoggedBy: 'Jane', dirty: 0 });
    expect(server.rows.get(mine.Guid)!.Text).toBe('from John');
    expect(await db.events.get(mine.Guid)).toMatchObject({ Text: 'from John', dirty: 0 });
  });

  it('keeps a row dirty when it is edited again while its push is in flight', async () => {
    const local = sleep();
    await db.events.add({ ...local, dirty: 1 });
    server.onBatch = async () => {
      await db.events.update(local.Guid, { End: Date.UTC(2026, 9, 11, 11), dirty: 2 });
    };

    await syncNow();

    expect(await db.events.get(local.Guid)).toMatchObject({ dirty: 2, End: Date.UTC(2026, 9, 11, 11) });
  });

  it('abandons a request left hanging in the background and syncs again on return', async () => {
    const local = sleep();
    await db.events.add({ ...local, dirty: 1 });
    vi.stubGlobal('fetch', (_input: unknown, init?: RequestInit) => new Promise((_, reject) =>
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    const stuck = syncNow();

    vi.stubGlobal('fetch', server.fetch);
    abandonSync();
    await stuck;
    await syncNow();

    expect(server.rows.has(local.Guid)).toBe(true);
    expect(await db.events.get(local.Guid)).toMatchObject({ dirty: 0 });
  });

  it('keeps working offline and asks for a sign-in when the refresh token is revoked', async () => {
    const local = sleep();
    await db.events.add({ ...local, dirty: 1 });
    vi.stubGlobal('fetch', async () => new Response('Token refresh failed.', { status: 401 }));

    await syncNow();

    expect(status.needsSignIn).toBe(true);
    expect(await db.events.get(local.Guid)).toMatchObject({ dirty: 1 });
  });

  it('stands out only when a change has waited an hour, or the phone has not synced in an hour', async () => {
    const now = Date.UTC(2026, 9, 11, 12);
    const hourAgo = now - 61 * 60_000;
    await db.events.bulkAdd([{ ...sleep(), dirty: hourAgo }, { ...sleep(), dirty: now }, { ...sleep(), dirty: 0 }]);
    expect(await oldestUnpushed()).toBe(hourAgo);

    // Opening the app after a quiet night: nothing to worry about until a sync has had its chance and failed.
    status.lastSyncedAt = hourAgo;
    expect(syncIsStale(hourAgo, now)).toBe(false);
    status.error = 'Load failed';
    expect(syncIsStale(hourAgo, now)).toBe(true);
    status.lastSyncedAt = now - 60_000;
    expect(syncIsStale(now - 60_000, now)).toBe(false);
    expect(syncIsStale(hourAgo, now)).toBe(true);
  });
});

describe('direction', () => {
  it('says up while pushing changes and down while pulling, then rests', async () => {
    await db.events.add({ ...sleep(), dirty: 1 });
    const seen: string[] = [];
    server.onBatch = async () => void seen.push(status.direction);
    server.onPull = () => void seen.push(status.direction);

    await syncNow();

    // A new row takes two batches: the PATCH that 404s, then the POST.
    expect(seen).toEqual(['up', 'up', 'down']);
    expect(status.direction).toBe('');
  });

  it('only pulls when nothing is waiting to push', async () => {
    const seen: string[] = [];
    server.onBatch = async () => void seen.push(status.direction);
    server.onPull = () => void seen.push(status.direction);

    await syncNow();

    expect(seen).toEqual(['down']);
  });
});

describe('family', () => {
  const settings = (Guid: string, NapsPerDay: number): Settings => ({
    Guid, NapsPerDay, NapWakeWindowMinutes: 150, BedtimeWakeWindowMinutes: 210, NightStartMinutes: 1200,
    NightEndMinutes: 360, ModifiedAt: '', Deleted: false, LoggedBy: '', dirty: 1
  });
  const food = async (Name: string, family: string): Promise<Food> => ({
    Guid: await foodGuid(Name, family), Name, Category: 'Fruit', LastUsedAt: 1, UseCount: 2,
    ModifiedAt: '', Deleted: false, LoggedBy: '', dirty: 1
  });

  it('moves what a guest logged to the new family it starts, before pushing', async () => {
    server.family = '0b7c4a52-9a3e-4d8f-b1a6-6f2e9c0d4e17';
    server.familyHasSettings = false;
    await db.settings.put(settings(firstFamily, 3));
    await db.foods.put(await food('Mango', firstFamily));

    await syncNow();

    expect(status.family).toBe(server.family);
    expect(status.inviteCode).toBe('K7QM-3WXP');
    expect(await db.settings.get(server.family)).toMatchObject({ NapsPerDay: 3 });
    expect(await db.settings.get(firstFamily)).toBeUndefined();
    const mango = await foodGuid('Mango', server.family);
    expect(mango).toBe('ea7fee3c-d8c3-5e3b-94e1-6b47a663f80a'); // FoodGuid_MatchesThePhones on the server
    expect(server.rows.get(mango)).toMatchObject({ Name: 'Mango', UseCount: 2 });
    expect(server.rows.has(await foodGuid('Mango', firstFamily))).toBe(false);
  });

  it("joining a family keeps the family's settings over the phone's", async () => {
    server.family = '0b7c4a52-9a3e-4d8f-b1a6-6f2e9c0d4e17';
    await db.settings.put(settings(firstFamily, 3));

    await syncNow();

    expect(await db.settings.count()).toBe(0);
  });

  it("a phone in the first family keeps its foods' Guids", async () => {
    await db.foods.put({ ...(await food('Pear', firstFamily)), dirty: 0 });

    await syncNow();

    expect(await db.foods.get(await foodGuid('Pear', firstFamily))).toMatchObject({ dirty: 0 });
  });
});
