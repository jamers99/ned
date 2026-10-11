// A log of what happened on the phone, and recovery when the database stops answering.
// The log lives in sessionStorage so it survives the reload that recovery does.
import { db } from './db.ts';

const logKey = 'kennedy-diagnostics';
const reloadKey = 'kennedy-recovered-at';
const maxEntries = 40;
// A screen waiting this long for its first result is stuck, not slow.
const stuckAfter = 3_000;

export const diagnostics = $state({
  log: restore() as { at: number; message: string }[],
  /** True when recovery already reloaded once and the database still didn't answer. */
  stuck: false
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
  // Time spent in the background doesn't count as waiting.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') for (const ticket of waiting.keys()) waiting.set(ticket, Date.now());
  });
  db.on('close', () => note('Database connection closed'));
  db.on('ready', () => note('Database opened'));

  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const oldest = Math.min(...waiting.values());
    if (Date.now() - oldest > stuckAfter) void recover();
  }, 1_000);
}

let recovering = false;

async function recover() {
  if (recovering) return;
  recovering = true;
  const read = await Promise.race([
    db.meta.get('user').then(() => 'answered', (e: Error) => `failed: ${e.name}: ${e.message}`),
    new Promise<string>(resolve => setTimeout(() => resolve('got no answer in 2s'), 2_000))
  ]);
  note(`A screen waited over ${stuckAfter / 1000}s for its data; a direct database read ${read}`);

  const lastReload = Number(sessionStorage.getItem(reloadKey) ?? 0);
  if (Date.now() - lastReload < 60_000) {
    note('Already reloaded in the last minute; not reloading again');
    diagnostics.stuck = true;
    return;
  }
  sessionStorage.setItem(reloadKey, String(Date.now()));
  note('Reloading to recover');
  location.reload();
}

function restore() {
  try {
    return JSON.parse(sessionStorage.getItem(logKey) ?? '[]');
  } catch {
    return [];
  }
}
