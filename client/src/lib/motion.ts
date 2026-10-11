// Every transition in the app. Short and calm: nothing over 180ms, transforms and opacity only,
// and no motion at all when the phone asks for reduced motion.
import { cubicOut } from 'svelte/easing';
import { fade, fly, scale } from 'svelte/transition';

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const time = (ms: number) => (reduced ? 0 : ms);

/** A screen appearing in place: switching tabs, falling asleep, waking up. */
export function appear(node: Element) {
  return fade(node, { duration: time(160) });
}

/** A full-screen overlay rising into place. */
export function rise(node: Element) {
  return fly(node, { y: 16, duration: time(180), easing: cubicOut });
}

/** A bottom sheet sliding up from the edge of the screen. */
export function slideUp(node: Element) {
  return fly(node, { y: '100%', opacity: 1, duration: time(180), easing: cubicOut });
}

/** Content arriving from the side it came from, like stepping to the next or previous day. */
export function slide(node: Element, { direction }: { direction: number }) {
  return fly(node, { x: 24 * Math.sign(direction), duration: time(180), easing: cubicOut });
}

/** A chip popping in when chosen. */
export function pop(node: Element) {
  return scale(node, { start: 0.85, duration: time(140), easing: cubicOut });
}
