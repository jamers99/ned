import { db, getMeta, setMeta, syncedTable, syncedTables, type Synced, type SyncedTable } from './db.ts';
import { apiFetch, errorText, messageFrom, SignInRequired } from './auth.ts';
import { adoptFamily, knowsFamily } from './family.ts';
import { status } from './state.svelte.ts';
import { clock, mediumDate, startOfDay } from './time.ts';
import { entitySets, fields, fromServer, parseInstant, toServer } from './wire.ts';

const batchLimit = 200;
const maxBackoff = 60_000;
// When Android suspends the app mid-request, the request can hang for minutes instead of failing.
// A sync that takes longer than this is abandoned and retried.
const syncTimeout = 30_000;
// Rows are stamped before their transaction commits, so a slow save can land just behind the cursor.
// Re-reading a minute of overlap catches it; unchanged rows are skipped.
const pullOverlap = 60_000;
// How long the phone can go without syncing before the sync cloud on Now asks for attention.
const staleAfter = 60 * 60_000;

let running: Promise<void> | null = null;
let currentRun: AbortController | null = null;
let runAgain = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;

/** Syncs soon. Every local write calls this, so a burst of taps becomes one push. */
export function scheduleSync() {
  clearTimeout(timer);
  timer = setTimeout(syncNow, 1000);
}

export function syncNow(): Promise<void> {
  if (running) {
    runAgain = true;
    return running;
  }
  running = pushThenPull().finally(() => {
    running = null;
    if (runAgain) {
      runAgain = false;
      void syncNow();
    }
  });
  return running;
}

/** Gives up on a sync still in flight, e.g. one left hanging while the app was in the background. */
export function abandonSync() {
  currentRun?.abort();
}

async function pushThenPull() {
  if (!status.user) return;
  const run = (currentRun = new AbortController());
  const timeout = setTimeout(() => run.abort(), syncTimeout);
  status.syncing = true;
  try {
    // Rows are keyed to the family, so the phone learns it before pushing anything.
    if (!(await knowsFamily())) {
      status.direction = 'down';
      await adoptFamily(run.signal);
    }
    const pushError = await push(run.signal);
    await pull(run.signal);
    if (pushError) throw new Error(pushError);
    failures = 0;
    status.lastSyncedAt = Date.now();
    status.error = '';
    await setMeta('lastSyncedAt', status.lastSyncedAt);
  } catch (error) {
    status.error = run.signal.aborted ? 'The connection stalled. Retrying.'
      : error instanceof Error ? error.message : String(error);
    if (error instanceof SignInRequired) return;
    failures++;
    // Retry with backoff, but not from the background: coming back to the front syncs anyway.
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (globalThis.document?.visibilityState !== 'hidden') void syncNow();
    }, Math.min(maxBackoff, 1000 * 2 ** failures));
  } finally {
    clearTimeout(timeout);
    status.syncing = false;
    status.direction = '';
  }
}

/**
 * Whether the sync indicator should stand out: a change has waited over an hour to reach the server, or the
 * phone hasn't heard from it in an hour. Only once a sync has failed, so opening the app after a quiet night
 * doesn't flash a warning before the first sync has had its chance.
 */
export function syncIsStale(unpushedSince: number | null, now: number): boolean {
  if (status.needsSignIn) return true;
  if (!status.error) return false;
  return (unpushedSince != null && now - unpushedSince > staleAfter) || now - status.lastSyncedAt > staleAfter;
}

/** "Synced at 9:41 AM", "Synced Thursday, Oct 8 at 9:41 AM", or "Not synced yet". */
export function lastSyncedText(now: number): string {
  const at = status.lastSyncedAt;
  if (!at) return 'Not synced yet';
  return `Synced ${at < startOfDay(now) ? `${mediumDate(at)} ` : ''}at ${clock(at)}`;
}

/** When the oldest change still waiting to be pushed was made, or null when everything is pushed. */
export async function oldestUnpushed(): Promise<number | null> {
  const stamps = await Promise.all(syncedTables.map(async table =>
    (await syncedTable(table).where('dirty').above(0).first())?.dirty));
  const pending = stamps.filter(stamp => stamp != null);
  return pending.length ? Math.min(...pending) : null;
}

interface Pending {
  table: SyncedTable;
  row: Synced;
}

/**
 * Upserts dirty rows: PATCH everything, then POST the rows the server has never seen.
 * Returns why some rows were not saved, or an empty string. Failed rows stay dirty and retry later.
 */
export async function push(signal: AbortSignal): Promise<string> {
  for (;;) {
    const pending = await dirtyRows();
    if (pending.length === 0) return '';
    status.direction = 'up';

    const patches = await sendBatch(pending, 'PATCH', signal);
    const missing = pending.filter((_, i) => patches[i].status === 404);
    const posts = missing.length ? await sendBatch(missing, 'POST', signal) : [];

    const failed = [...patches.filter(r => r.status !== 404), ...posts].filter(r => r.status >= 300);
    if (failed.length) return `${failed.length} change(s) not saved yet: ${failed[0].message}`;
    if (pending.length < batchLimit) return '';
  }
}

async function dirtyRows(): Promise<Pending[]> {
  const pending: Pending[] = [];
  for (const table of syncedTables) {
    if (pending.length >= batchLimit) break;
    const rows = await syncedTable(table).where('dirty').above(0).limit(batchLimit - pending.length).toArray();
    pending.push(...rows.map(row => ({ table, row })));
  }
  return pending;
}

interface BatchResult {
  status: number;
  message: string;
}

async function sendBatch(pending: Pending[], method: 'PATCH' | 'POST', signal: AbortSignal): Promise<BatchResult[]> {
  const requests = pending.map(({ table, row }, i) => ({
    id: String(i),
    method,
    url: method === 'PATCH' ? `${entitySets[table]}(${row.Guid})` : entitySets[table],
    headers: { 'content-type': 'application/json' },
    body: method === 'PATCH' ? toServer(table, row) : { Guid: row.Guid, ...toServer(table, row) }
  }));

  const response = await apiFetch('/api/$batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', prefer: 'odata.continue-on-error' },
    body: JSON.stringify({ requests }),
    signal
  });
  if (!response.ok) throw new Error(`Push failed: ${await messageFrom(response)}`);

  const { responses } = await response.json() as { responses: { id: string; status: number; body: unknown }[] };
  const results = pending.map(() => ({ status: 0, message: 'No response' }));
  for (const item of responses)
    results[Number(item.id)] = { status: item.status, message: errorText(item.body) };

  await Promise.all(pending.map(({ table, row }, i) =>
    results[i].status < 300 ? markPushed(table, row) : undefined));
  return results;
}

/** Clears the dirty flag, unless the row was edited again while the push was in flight. */
async function markPushed(table: SyncedTable, pushed: Synced) {
  const rows = syncedTable(table);
  await db.transaction('rw', rows, async () => {
    const current = await rows.get(pushed.Guid);
    if (current?.dirty === pushed.dirty) await rows.update(pushed.Guid, { dirty: 0 });
  });
}

/** Pulls rows changed since each table's cursor, deleted rows included. Local unpushed edits win. */
export async function pull(signal: AbortSignal) {
  status.direction = 'down';
  for (const table of syncedTables) {
    const cursor = (await getMeta<number>(`cursor:${table}`)) ?? 0;
    const since = new Date(Math.max(0, cursor - pullOverlap)).toISOString();
    const query = `$select=${fields[table].join(',')}&$filter=${encodeURIComponent(`ModifiedAt ge ${since}`)}`;
    let url: string | null = `/api/${entitySets[table]}?${query}&$orderby=ModifiedAt`;
    let newest = cursor;

    while (url) {
      const response = await apiFetch(url, { signal });
      if (!response.ok) throw new Error(`Pull failed: ${await messageFrom(response)}`);
      const page = await response.json() as { value: Record<string, unknown>[]; '@odata.nextLink'?: string };
      await merge(table, page.value);
      for (const row of page.value)
        newest = Math.max(newest, parseInstant(row.ModifiedAt as string));
      url = page['@odata.nextLink'] ?? null;
    }

    await setMeta(`cursor:${table}`, newest);
  }
}

async function merge(table: SyncedTable, serverRows: Record<string, unknown>[]) {
  if (serverRows.length === 0) return;
  const rows = syncedTable(table);
  await db.transaction('rw', rows, async () => {
    const locals = await rows.bulkGet(serverRows.map(row => row.Guid as string));
    const changed = serverRows.filter((row, i) => !locals[i]?.dirty && locals[i]?.ModifiedAt !== row.ModifiedAt);
    await rows.bulkPut(changed.map(row => fromServer(table, row) as unknown as Synced));
  });
}
