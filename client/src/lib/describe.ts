import { baby } from './baby.ts';
import type { BabyEvent, SettledBy, Side, SleepLocation, SleepOnset, SolidAmount } from './db.ts';
import { clock, duration } from './time.ts';

export const locationText: Record<SleepLocation, string> = { Crib: 'Crib', Contact: 'Contact', OnTheGo: 'On the go' };
const onsetText: Record<SleepOnset, string> = { Own: `on ${baby.their} own`, Fed: 'fed to sleep', Rocked: 'rocked', Held: 'held' };
export const settledText: Record<SettledBy, string> = { Feeding: 'feeding', Soothing: 'soothing', Own: `on ${baby.their} own` };
export const amountText: Record<SolidAmount, string> = { Taste: 'a taste', Some: 'some', All: 'all of it' };

// Chip labels, in the order the chips appear.
export const onsetChoices: [SleepOnset, string][] = [['Own', `On ${baby.their} own`], ['Fed', 'Fed'], ['Rocked', 'Rocked'], ['Held', 'Held']];
export const settleChoices: [SettledBy, string][] = [['Feeding', 'Feeding'], ['Soothing', 'Soothing'], ['Own', `On ${baby.their} own`]];

/** Seconds nursed on one side, counting the side that's running. */
export function sideSeconds(feed: BabyEvent, side: Side, now: number): number {
  const running = feed.ActiveSide === side && feed.ActiveSince ? (now - feed.ActiveSince) / 1000 : 0;
  return feed[side === 'Left' ? 'LeftSeconds' : 'RightSeconds'] + running;
}

export const nursedSeconds = (feed: BabyEvent, now: number) => sideSeconds(feed, 'Left', now) + sideSeconds(feed, 'Right', now);

/** Title and detail lines for an event row on the Day screen. */
export function describe(e: BabyEvent, now: number): { label: string; meta: string; time: string } {
  const time = clock(e.Start);
  const withNote = (meta: string) => [meta, e.Type !== 'Note' && e.Text ? `“${e.Text}”` : ''].filter(Boolean).join(' · ');

  switch (e.Type) {
    case 'Feed': {
      if (e.FeedKind === 'Bottle') return { label: `Bottle · ${e.BottleOz ?? 0} oz`, meta: withNote(''), time };
      const left = sideSeconds(e, 'Left', now);
      const right = sideSeconds(e, 'Right', now);
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
