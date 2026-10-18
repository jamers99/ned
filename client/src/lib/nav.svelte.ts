import { startOfDay } from './time.ts';

export type Tab = 'now' | 'day' | 'insights';

export type Overlay =
  | { kind: 'sleep' }
  | { kind: 'wakeWindow' }
  | { kind: 'feed' }
  | { kind: 'solids' }
  | { kind: 'note' }
  | { kind: 'woke'; guid: string }
  | { kind: 'edit'; guid: string }
  | { kind: 'growth' }
  | { kind: 'settings' }
  | { kind: 'signin' };

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
  if (history.state?.overlay) history.back();
  else nav.overlay = null;
}

export function listenForBack() {
  addEventListener('popstate', () => (nav.overlay = null));
}
