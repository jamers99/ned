import { liveQuery } from 'dexie';

/** One shared clock for every running timer. Timers render from start times, never by accumulating. */
export const clock = $state({ now: Date.now() });

export const status = $state({
  /** The signed-in parent, used as LoggedBy. Empty before the first sign-in. */
  user: '',
  /** True when the refresh token stopped working. The app keeps working; it just can't sync. */
  needsSignIn: false,
  syncing: false,
  lastSyncedAt: 0,
  error: ''
});

export function startClock() {
  const tick = () => (clock.now = Date.now());
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);
}

/**
 * Keeps a value in sync with a Dexie query. `deps` reads the reactive values the query depends on,
 * so the query re-runs when they change. Call it while a component initializes.
 */
export function live<T, D = undefined>(query: (deps: D) => Promise<T>, initial: T, deps?: () => D) {
  let value = $state.raw(initial);
  $effect(() => {
    const current = deps?.() as D;
    const subscription = liveQuery(() => query(current)).subscribe({
      next: result => (value = result),
      error: error => console.error(error)
    });
    return () => subscription.unsubscribe();
  });
  return {
    get value() {
      return value;
    }
  };
}
