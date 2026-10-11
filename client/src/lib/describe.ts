import type { BabyEvent, SettledBy, SleepLocation, SleepOnset, SolidAmount } from './db.ts';
import { clock, duration } from './time.ts';

export const locationText: Record<SleepLocation, string> = { Crib: 'Crib', Contact: 'Contact', OnTheGo: 'On the go' };
export const onsetText: Record<SleepOnset, string> = { Own: 'on her own', Fed: 'fed to sleep', Rocked: 'rocked', Held: 'held' };
export const settledText: Record<SettledBy, string> = { Feeding: 'feeding', Soothing: 'soothing', Own: 'on her own' };
export const amountText: Record<SolidAmount, string> = { Taste: 'a taste', Some: 'some', All: 'all of it' };

/** Title and detail lines for an event row on the Day screen. */
export function describe(e: BabyEvent, now: number): { label: string; meta: string; time: string } {
  const time = clock(e.Start);
  const withNote = (meta: string) => [meta, e.Type !== 'Note' && e.Text ? `“${e.Text}”` : ''].filter(Boolean).join(' · ');

  switch (e.Type) {
    case 'Feed': {
      if (e.FeedKind === 'Bottle') return { label: `Bottle · ${e.BottleOz ?? 0} oz`, meta: withNote(''), time };
      const running = e.ActiveSince ? (now - e.ActiveSince) / 1000 : 0;
      const left = e.LeftSeconds + (e.ActiveSide === 'Left' ? running : 0);
      const right = e.RightSeconds + (e.ActiveSide === 'Right' ? running : 0);
      const label = e.End == null ? 'Nursing now' : `Nursed · ${duration((left + right) * 1000)}`;
      const meta = `L ${duration(left * 1000)} · R ${duration(right * 1000)}`;
      return { label, meta: withNote(meta), time };
    }
    case 'Solids':
      return {
        label: 'Solids',
        meta: withNote([e.Foods.join(', '), e.SolidAmount ? amountText[e.SolidAmount] : ''].filter(Boolean).join(' · ')),
        time
      };
    case 'NightWaking': {
      const awake = e.End == null ? 'awake now' : duration(e.End - e.Start);
      const settled = e.SettledBy ? `back by ${settledText[e.SettledBy]}` : '';
      return { label: `Woke · ${awake}`, meta: withNote(settled), time };
    }
    case 'Note':
      return { label: 'Note', meta: e.Text, time };
    case 'Sleep':
      return { label: e.IsNight ? 'Night' : 'Nap', meta: withNote(sleepMeta(e, [])), time };
  }
}

/** "Crib · on her own" for a nap, "1 waking, fed" for a night. */
export function sleepMeta(sleep: BabyEvent, wakings: BabyEvent[]): string {
  const parts: string[] = [];
  if (sleep.IsNight) {
    const fed = wakings.some(w => w.SettledBy === 'Feeding');
    parts.push(`${wakings.length} ${wakings.length === 1 ? 'waking' : 'wakings'}${fed ? ', fed' : ''}`);
  }
  if (sleep.SleepLocation) parts.push(locationText[sleep.SleepLocation]);
  if (sleep.SleepOnset) parts.push(onsetText[sleep.SleepOnset]);
  return parts.join(' · ');
}
