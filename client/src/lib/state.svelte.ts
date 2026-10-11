import { liveQuery } from 'dexie';
import { note, startWaiting, stopWaiting } from './diagnostics.svelte.ts';

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

// Live queries only run while this copy of the app is on screen; coming back to the front starts them over.
let onScreen = $state(true);

export function startClock() {
  const update = () => {
    clock.now = Date.now();
    onScreen = document.visibilityState === 'visible';
  };
  update();
  setInterval(update, 1000);
  document.addEventListener('visibilitychange', update);
}

export function reportProblem(error: unknown) {
  note(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}

export function watchForProblems() {
  addEventListener('error', event => reportProblem(event.error ?? event.message));
  addEventListener('unhandledrejection', event => reportProblem(event.reason));
}

/**
 * Keeps a value in sync with a Dexie query. `deps` reads the reactive values the query depends on,
 * so the query re-runs when they change. Call it while a component initializes.
 */
export function live<T, D = undefined>(query: (deps: D) => Promise<T>, initial: T, deps?: () => D) {
  let value = $state.raw(initial);
  $effect(() => {
    // A hidden copy (a background browser tab, say) that Android freezes mid-read holds up every save in the
    // copy on screen, and every read after it. So hidden copies don't read; they keep their last value.
    if (!onScreen) return;
    const current = deps?.() as D;
    const ticket = startWaiting();
    const subscription = liveQuery(() => query(current)).subscribe({
      next: result => {
        stopWaiting(ticket);
        value = result;
      },
      error: reportProblem
    });
    return () => {
      stopWaiting(ticket);
      subscription.unsubscribe();
    };
  });
  return {
    get value() {
      return value;
    }
  };
}
