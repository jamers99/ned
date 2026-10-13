import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { startRunning, startSleep } from './actions.ts';
import { db } from './db.ts';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('starting something that runs', () => {
  it('starts one sleep however many times Start sleep is tapped', async () => {
    const taps = await Promise.all([startSleep(Date.now(), false), startSleep(Date.now(), false), startSleep(Date.now(), false)]);

    expect((await db.events.toArray()).filter(e => e.Type === 'Sleep')).toHaveLength(1);
    expect(new Set(taps.map(t => t.Guid)).size).toBe(1);
  });

  it('still starts a waking during a running night, and a new sleep once the last one ended', async () => {
    const night = await startSleep(Date.now(), true);
    await startRunning({ Type: 'NightWaking', Start: Date.now() });
    await db.events.update(night.Guid, { End: Date.now() });
    await startSleep(Date.now(), false);

    const types = (await db.events.toArray()).map(e => e.Type).sort();
    expect(types).toEqual(['NightWaking', 'Sleep', 'Sleep']);
  });
});
