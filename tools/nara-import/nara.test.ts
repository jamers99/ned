process.env.TZ = 'America/New_York';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { foodGuid } from '../../client/src/lib/ids.ts';
import { mapRows, parseCsv } from './nara.ts';

const sample = await readFile(new URL('./fixtures/export_narababy_sample.csv', import.meta.url), 'utf8');

test('maps each Nara type and skips the ones Kennedy does not track', async () => {
  const imported = await mapRows(parseCsv(sample));

  assert.deepEqual(imported.counts, { Breastfeed: 1, 'Bottle Feed': 1, 'Solid Feed': 1, Sleep: 2, Growth: 1 });
  assert.deepEqual(imported.skipped, { Diaper: 1 });

  const [nursing, bottle, solids, night, nap] = imported.events;
  assert.equal(nursing.FeedKind, 'Nursing');
  assert.equal(nursing.StartSide, 'Left');
  assert.equal(nursing.LeftSeconds, 420);
  assert.equal(nursing.RightSeconds, 0);
  assert.equal(nursing.End, nursing.Start! + 420_000);

  assert.equal(bottle.BottleOz, 4);

  assert.deepEqual(solids.Foods, ['Cereal', 'Sweet Potato']);
  assert.equal(solids.SolidAmount, 'All');
  assert.equal(solids.Text, 'first time, "loved" it');

  assert.equal(night.IsNight, true);
  assert.equal(nap.IsNight, false);
  assert.equal(night.End! - night.Start!, (11 * 60 + 35) * 60_000);

  const [growth] = imported.growth;
  assert.equal(growth.WeightKg, 6.917);
  assert.equal(growth.LengthCm, 67.31);
  assert.equal(growth.HeadCm, 43.18);
});

test('files foods under the phone-compatible Guid, with use counts', async () => {
  const imported = await mapRows(parseCsv(sample));

  const cereal = imported.foods.find(f => f.Name === 'Cereal')!;
  assert.equal(cereal.Guid, await foodGuid('cereal'));
  assert.equal(cereal.Category, 'Grains');
  assert.equal(cereal.UseCount, 1);
  assert.equal(imported.foods.find(f => f.Name === 'Sweet Potato')!.Category, 'Veggies');
});

test('gives a row the same Guid on every run', async () => {
  const first = await mapRows(parseCsv(sample));
  const second = await mapRows(parseCsv(sample));
  assert.deepEqual(first.events.map(e => e.Guid), second.events.map(e => e.Guid));
});
