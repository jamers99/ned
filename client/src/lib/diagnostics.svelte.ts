// A log of what happened on the phone, and recovery when the database stops answering.
// The log lives in sessionStorage so it survives the reload that recovery does.
import { db } from './db.ts';

const logKey = 'kennedy-diagnostics';
const reloadKey = 'kennedy-recovered-at';
const maxEntries = 40;
// A screen waiting this long for its first result is stuck, not slow.
const stuckAfter = 3_000;
// Every open copy of the app holds a shared lock under this name, so any copy can count the others.
const copyLock = 'kennedy-open:';
const thisCopy = globalThis.matchMedia?.('(display-mode: standalone)').matches ? 'app' : 'tab';

export const diagnostics = $state({
  log: restore() as { at: number; message: string }[],
  /**
   * Why screens are stuck, once recovery has looked: 'tab' or 'copy' when another copy of the app is open
   * (it holds the database and reloading can't help), 'database' when a reload already failed to fix it.
   */
  stuck: '' as '' | 'tab' | 'copy' | 'database'
});

const waiting = new Map<number, number>();
let nextId = 0;

export function note(message: string) {
  diagnostics.log = [{ at: Date.now(), message }, ...diagnostics.log].slice(0, maxEntries);
  try {
    sessionStorage.setItem(logKey, JSON.stringify(diagnostics.log));
  } catch {
    // Diagnostics are best-effort; private modes can refuse storage.
  }
}

/** Called when a screen starts waiting for its data. Returns a ticket to pass to `stopWaiting`. */
export function startWaiting(): number {
  waiting.set(++nextId, Date.now());
  return nextId;
}

export function stopWaiting(ticket: number) {
  waiting.delete(ticket);
}

export function watchDiagnostics() {
  const lifecycle = (event: Event) => {
    const persisted = 'persisted' in event && event.persisted ? ' (persisted)' : '';
    note(`${event.type}${event.type === 'visibilitychange' ? ` → ${document.visibilityState}` : ''}${persisted}`);
  };
  for (const type of ['pagehide', 'pageshow']) addEventListener(type, lifecycle);
  for (const type of ['visibilitychange', 'freeze', 'resume']) document.addEventListener(type, lifecycle);
  db.on('close', () => note('Database connection closed'));
  db.on('ready', () => note('Database opened'));

  void navigator.locks?.request(copyLock + thisCopy, { mode: 'shared' }, async () => {
    const others = await otherCopies();
    note(`Opened as ${thisCopy === 'app' ? 'the installed app' : 'a browser tab'}${others.length ? `; also open: ${others.join(', ')}` : ''}`);
    return new Promise(() => {});
  });

  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (isStuck()) {
      if (!diagnostics.stuck) void recover();
    } else if (diagnostics.stuck) {
      diagnostics.stuck = '';
      note('Screens are answering again');
    }
  }, 1_000);
}

function isStuck() {
  return Date.now() - Math.min(...waiting.values()) > stuckAfter;
}

let recovering = false;

async function recover() {
  if (recovering) return;
  recovering = true;
  try {
    const [reads, others] = await Promise.all([probeTables(), otherCopies()]);
    note(`A screen waited over ${stuckAfter / 1000}s for its data. Direct reads: ${reads}. ` +
      (others.length ? `Also open: ${others.join(', ')}` : 'No other copy open'));
    if (!isStuck()) return;

    // Another copy frozen in the background is holding the database. Reloading this one can't help;
    // everything here catches up the moment that copy closes.
    if (others.length) {
      diagnostics.stuck = others.includes('tab') ? 'tab' : 'copy';
      return;
    }
    const lastReload = Number(sessionStorage.getItem(reloadKey) ?? 0);
    if (Date.now() - lastReload < 60_000) {
      note('Already reloaded in the last minute; not reloading again');
      diagnostics.stuck = 'database';
      return;
    }
    sessionStorage.setItem(reloadKey, String(Date.now()));
    note('Reloading to recover');
    location.reload();
  } finally {
    recovering = false;
  }
}

/** Reads each table directly, outside any live query, e.g. "events stuck · meta ok". */
async function probeTables(): Promise<string> {
  const tables = ['events', 'growth', 'foods', 'settings', 'meta'] as const;
  const results = await Promise.all(tables.map(name => within(db[name].count(), 2_000)));
  return tables.map((name, i) => `${name} ${results[i]}`).join(' · ');
}

/** The other open copies of the app: 'app' for the installed app, 'tab' for a browser tab. */
async function otherCopies(): Promise<string[]> {
  const state = await Promise.race([navigator.locks?.query(), new Promise<undefined>(r => setTimeout(r, 2_000))]);
  const copies = (state?.held ?? []).map(lock => lock.name ?? '').filter(name => name.startsWith(copyLock))
    .map(name => name.slice(copyLock.length));
  const mine = copies.indexOf(thisCopy);
  if (mine >= 0) copies.splice(mine, 1);
  return copies;
}

function within(promise: Promise<unknown>, ms: number): Promise<string> {
  return Promise.race([
    promise.then(() => 'ok', (e: Error) => `failed (${e.name})`),
    new Promise<string>(resolve => setTimeout(() => resolve('stuck'), ms))
  ]);
}

function restore() {
  try {
    return JSON.parse(sessionStorage.getItem(logKey) ?? '[]');
  } catch {
    return [];
  }
}
