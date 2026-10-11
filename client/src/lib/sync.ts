import { db, getMeta, setMeta, syncedTable, syncedTables, type Synced, type SyncedTable } from './db.ts';
import { apiFetch, messageFrom, SignInRequired } from './auth.ts';
import { status } from './state.svelte.ts';
import { entitySets, fields, fromServer, parseInstant, toServer } from './wire.ts';

const batchLimit = 200;
const maxBackoff = 60_000;
// Rows are stamped before their transaction commits, so a slow save can land just behind the cursor.
// Re-reading a minute of overlap catches it; unchanged rows are skipped.
const pullOverlap = 60_000;

let running: Promise<void> | null = null;
let runAgain = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;

/** Syncs soon. Every local write calls this, so a burst of taps becomes one push. */
export function scheduleSync(delay = 1000) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
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

async function pushThenPull() {
  if (!status.user) return;
  status.syncing = true;
  try {
    const pushError = await push();
    await pull();
    if (pushError) throw new Error(pushError);
    failures = 0;
    status.lastSyncedAt = Date.now();
    status.error = '';
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
    if (error instanceof SignInRequired) return;
    failures++;
    scheduleSync(Math.min(maxBackoff, 1000 * 2 ** failures));
  } finally {
    status.syncing = false;
  }
}

interface Pending {
  table: SyncedTable;
  row: Synced;
}

/**
 * Upserts dirty rows: PATCH everything, then POST the rows the server has never seen.
 * Returns why some rows were not saved, or an empty string. Failed rows stay dirty and retry later.
 */
export async function push(): Promise<string> {
  for (;;) {
    const pending = await dirtyRows();
    if (pending.length === 0) return '';

    const patches = await sendBatch(pending, 'PATCH');
    const missing = pending.filter((_, i) => patches[i].status === 404);
    const posts = missing.length ? await sendBatch(missing, 'POST') : [];

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

async function sendBatch(pending: Pending[], method: 'PATCH' | 'POST'): Promise<BatchResult[]> {
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
    body: JSON.stringify({ requests })
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
export async function pull() {
  for (const table of syncedTables) {
    const cursor = (await getMeta<number>(`cursor:${table}`)) ?? 0;
    const since = new Date(Math.max(0, cursor - pullOverlap)).toISOString();
    const query = `$select=${fields[table].join(',')}&$filter=${encodeURIComponent(`ModifiedAt ge ${since}`)}`;
    let url: string | null = `/api/${entitySets[table]}?${query}&$orderby=ModifiedAt`;
    let newest = cursor;

    while (url) {
      const response = await apiFetch(url);
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

function errorText(body: unknown): string {
  const first = Array.isArray(body) ? body[0] : body;
  if (typeof first === 'string') return first;
  return (first as { text?: string } | undefined)?.text ?? '';
}

export async function dirtyCount(): Promise<number> {
  const counts = await Promise.all(syncedTables.map(table => syncedTable(table).where('dirty').above(0).count()));
  return counts.reduce((a, b) => a + b, 0);
}
