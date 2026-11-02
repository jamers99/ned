import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addEvent, deleteEvent, startRunning, updateSleep } from './actions.ts';
import { db } from './db.ts';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('starting something that runs', () => {
  it('starts one sleep however many times Sleep is tapped', async () => {
    const startSleep = (IsNight: boolean) => startRunning({ Type: 'Sleep', Start: Date.now(), IsNight });
    const taps = await Promise.all([startSleep(false), startSleep(false), startSleep(false)]);

    expect((await db.events.toArray()).filter(e => e.Type === 'Sleep')).toHaveLength(1);
    expect(new Set(taps.map(t => t.Guid)).size).toBe(1);
  });

  it('still starts a waking during a running night, and a new sleep once the last one ended', async () => {
    const night = await startRunning({ Type: 'Sleep', Start: Date.now(), IsNight: true });
    await startRunning({ Type: 'NightWaking', Start: Date.now() });
    await db.events.update(night.Guid, { End: Date.now() });
    await startRunning({ Type: 'Sleep', Start: Date.now() });

    const types = (await db.events.toArray()).map(e => e.Type).sort();
    expect(types).toEqual(['NightWaking', 'Sleep', 'Sleep']);
  });

  it("starts a waking even with one left open outside tonight's night, and a second tap still starts only one", async () => {
    const hour = 3_600_000;
    await addEvent({ Type: 'NightWaking', Start: Date.now() - 30 * hour, End: null });
    await startRunning({ Type: 'Sleep', Start: Date.now() - 3 * hour, IsNight: true });
    const taps = await Promise.all([
      startRunning({ Type: 'NightWaking', Start: Date.now() }), startRunning({ Type: 'NightWaking', Start: Date.now() })
    ]);

    expect(taps[0].Guid).toBe(taps[1].Guid);
    expect(taps[0].Start).toBeGreaterThan(Date.now() - hour);
    expect((await db.events.toArray()).filter(e => e.Type === 'NightWaking')).toHaveLength(2);
  });
});

describe("changing a sleep's times", () => {
  const hour = 3_600_000;
  const t0 = Date.UTC(2026, 9, 18, 2);
  const night = () => addEvent({ Type: 'Sleep', IsNight: true, Start: t0, End: t0 + 10 * hour });
  const waking = (from: number, to: number | null) =>
    addEvent({ Type: 'NightWaking', Start: t0 + from * hour, End: to == null ? null : t0 + to * hour });
  const wakings = async () => (await db.events.toArray()).filter(e => e.Type === 'NightWaking' && !e.Deleted)
    .map(e => [(e.Start - t0) / hour, e.End == null ? null : (e.End - t0) / hour]).sort();

  it('deletes the wakings it no longer covers and stops one at its new end', async () => {
    const sleep = await night();
    await waking(1, 2);
    await waking(5, 7);
    await waking(9, 9.5);
    await updateSleep(sleep.Guid, { Start: t0 + 1.5 * hour, End: t0 + 6 * hour });
    expect(await wakings()).toEqual([[5, 6]]);
  });

  it('ends a running waking with the night', async () => {
    const sleep = await addEvent({ Type: 'Sleep', IsNight: true, Start: t0 });
    await waking(8, null);
    await updateSleep(sleep.Guid, { End: t0 + 9 * hour });
    expect(await wakings()).toEqual([[8, 9]]);
  });

  it('takes its wakings along when moved whole', async () => {
    const sleep = await night();
    await waking(3, 4);
    await updateSleep(sleep.Guid, { Start: t0 + 24 * hour, End: t0 + 34 * hour });
    expect(await wakings()).toEqual([[27, 28]]);
  });
});

describe('deleting a sleep', () => {
  it('deletes the wakings in it too, and keeps the feeds', async () => {
    const t0 = Date.UTC(2026, 9, 18, 2);
    const hour = 3_600_000;
    const night = await addEvent({ Type: 'Sleep', IsNight: true, Start: t0 });
    await addEvent({ Type: 'NightWaking', Start: t0 + hour, End: null });
    await addEvent({ Type: 'Feed', FeedKind: 'Bottle', Start: t0 + hour });
    await deleteEvent(night.Guid);

    const kept = (await db.events.toArray()).filter(e => !e.Deleted).map(e => e.Type);
    expect(kept).toEqual(['Feed']);
  });
});
