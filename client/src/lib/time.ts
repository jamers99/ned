export const minute = 60_000;
export const hour = 60 * minute;
export const day = 24 * hour;

/** "1h 48m", "38m". */
export function duration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / minute));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** "12:05" — minutes and seconds, for feed timers. */
export function stopwatch(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** "11:42 AM". */
export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "11:42" without AM/PM, for compact ranges like "1:55–2:15". */
export function clockShort(ms: number): string {
  return clock(ms).replace(/\s?[AP]M$/i, '');
}

/** "9:05 – 10:20 AM", or "7:05 PM – 6:40 AM" when the halves differ. */
export function clockRange(from: number, to: number): string {
  const a = clock(from);
  const b = clock(to);
  const meridiem = (s: string) => s.slice(-2);
  return meridiem(a) === meridiem(b) ? `${clockShort(from)} – ${b}` : `${a} – ${b}`;
}

/** "Friday, October 9". */
export function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Thursday, Oct 8". */
export function mediumDate(ms: number): string {
  return new Date(ms).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Minutes since local midnight. */
export function minuteOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/** The same local day as `ms`, at `minutes` after midnight. */
export function atMinuteOfDay(ms: number, minutes: number): number {
  return startOfDay(ms) + minutes * minute;
}

/** "HH:MM" for an <input type="time">. */
export function toTimeInput(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Keeps the local date of `ms` and applies the "HH:MM" from a time input. */
export function withTimeInput(ms: number, value: string): number {
  const [h, m] = value.split(':').map(Number);
  const d = new Date(ms);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/**
 * The end time picked on a time wheel: the first moment at or after `start` showing that clock time. A sleep never
 * lasts a day, so this gets the date right on its own, even for a nap that was left running until the next day.
 */
export function endAfter(start: number, picked: number): number {
  const end = withTimeInput(start, toTimeInput(picked));
  return end < start ? addDays(end, 1) : end;
}

/** "2026-10-09" for an <input type="date">. */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
