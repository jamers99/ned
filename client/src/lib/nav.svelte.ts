import { startOfDay } from './time.ts';

export type Tab = 'now' | 'day' | 'insights';

// `back` is the overlay to return to on close, e.g. the sleep drawer after a feed during a night waking.
export type Overlay = (
  | { kind: 'sleep' }
  | { kind: 'wakeWindow' }
  | { kind: 'feed' }
  | { kind: 'solids' }
  | { kind: 'note' }
  | { kind: 'woke'; guid: string }
  | { kind: 'edit'; guid: string }
  | { kind: 'growth' }
  | { kind: 'settings' }
  | { kind: 'signin' }
) & { back?: Overlay };

export const nav = $state<{ tab: Tab; overlay: Overlay | null; day: number }>({
  tab: 'now',
  overlay: null,
  day: startOfDay(Date.now())
});

/** Switches tabs. The Day tab always opens on today. */
export function showTab(tab: Tab) {
  if (tab === 'day' && nav.tab !== 'day') nav.day = startOfDay(Date.now());
  nav.tab = tab;
  scrollTo(0, 0);
}

// Overlays sit on one history entry, so the Android back gesture closes them.
export function open(overlay: Overlay) {
  if (nav.overlay) history.replaceState({ overlay: true }, '');
  else history.pushState({ overlay: true }, '');
  nav.overlay = overlay;
}

export function close() {
  if (nav.overlay?.back) nav.overlay = nav.overlay.back;
  else closeAll();
}

/** Closes the overlay without returning to the one it came from. */
export function closeAll() {
  if (history.state?.overlay) history.back();
  else nav.overlay = null;
}

export function listenForBack() {
  addEventListener('popstate', () => {
    const back = nav.overlay?.back;
    if (back) open(back);
    else nav.overlay = null;
  });
}
