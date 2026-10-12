// One-time import of a Nara Baby CSV export into Ned. Safe to re-run: every row gets a Guid derived
// from its Nara key, and rows are upserted.
//
//   node tools/nara-import/import.ts export_narababy_kennedy_20261010.csv --dry-run
//   read -s NED_PASSWORD; export NED_PASSWORD
//   node tools/nara-import/import.ts export_narababy_kennedy_20261010.csv --server https://baby.example.com --user James
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { SyncedTable } from '../../client/src/lib/db.ts';
import { entitySets, toServer } from '../../client/src/lib/wire.ts';
import { mapRows, parseCsv } from './nara.ts';

const expected: Record<string, number> = { Breastfeed: 2019, 'Bottle Feed': 36, 'Solid Feed': 165, Sleep: 25, Growth: 11 };
const chunkSize = 200;

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    server: { type: 'string', default: 'http://localhost:5205' },
    user: { type: 'string', default: 'James' },
    'dry-run': { type: 'boolean', default: false }
  }
});

if (positionals.length !== 1) {
  console.error('Usage: node tools/nara-import/import.ts <export.csv> [--dry-run] [--server URL] [--user NAME]');
  process.exit(1);
}

const imported = await mapRows(parseCsv(await readFile(positionals[0], 'utf8')));

console.log('Rows by Nara type (expected):');
for (const type of new Set([...Object.keys(expected), ...Object.keys(imported.counts)]))
  console.log(`  ${type.padEnd(12)} ${String(imported.counts[type] ?? 0).padStart(5)}  (${expected[type] ?? '-'})`);
console.log('Skipped:', imported.skipped);
console.log(`Foods: ${imported.foods.length}`);

const nursing = imported.events.filter(e => e.FeedKind === 'Nursing');
const averageMinutes = nursing.reduce((sum, e) => sum + e.LeftSeconds! + e.RightSeconds!, 0) / Math.max(1, nursing.length) / 60;
console.log(`Average breastfeed: ${averageMinutes.toFixed(1)} min (check the duration unit if this looks wrong)`);
for (const type of ['Feed', 'Solids', 'Sleep'] as const)
  console.log(`Sample ${type}:`, imported.events.find(e => e.Type === type));
console.log('Sample growth:', imported.growth[0]);

if (options['dry-run']) process.exit(0);

const password = process.env.NED_PASSWORD;
if (!password) {
  console.error('Set NED_PASSWORD to the password for --user.');
  process.exit(1);
}

const signIn = await fetch(`${options.server}/api/auth/signin`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ TenantId: 'Ned', Username: options.user, Password: password })
});
if (!signIn.ok) throw new Error(`Sign-in failed: ${await signIn.text()}`);
const { accessToken } = await signIn.json();

const tables: [SyncedTable, object[]][] = [['foods', imported.foods], ['growth', imported.growth], ['events', imported.events]];
for (const [table, rows] of tables) {
  let failed = 0;
  for (let i = 0; i < rows.length; i += chunkSize)
    failed += await upsert(table, rows.slice(i, i + chunkSize) as { Guid: string }[]);
  console.log(`${entitySets[table]}: ${rows.length - failed} saved, ${failed} failed`);
}

/** PATCH every row, then POST the ones the server has not seen. Returns how many failed. */
async function upsert(table: SyncedTable, rows: { Guid: string }[]): Promise<number> {
  const patched = await batch(rows.map(row => ({
    method: 'PATCH', url: `${entitySets[table]}(${row.Guid})`, body: toServer(table, row)
  })));
  const missing = rows.filter((_, i) => patched[i].status === 404);
  const posted = await batch(missing.map(row => ({
    method: 'POST', url: entitySets[table], body: { Guid: row.Guid, ...toServer(table, row) }
  })));

  const failures = [...patched.filter(r => r.status !== 404), ...posted].filter(r => r.status >= 300);
  for (const failure of failures.slice(0, 3)) console.error(`  ${failure.status}: ${JSON.stringify(failure.body)}`);
  return failures.length;
}

async function batch(requests: { method: string; url: string; body: object }[]) {
  if (requests.length === 0) return [];
  const response = await fetch(`${options.server}/api/$batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}`, prefer: 'odata.continue-on-error' },
    body: JSON.stringify({
      requests: requests.map((r, i) => ({ id: String(i), headers: { 'content-type': 'application/json' }, ...r }))
    })
  });
  if (!response.ok) throw new Error(`Batch failed (${response.status}): ${await response.text()}`);
  const { responses } = await response.json() as { responses: { id: string; status: number; body: unknown }[] };
  return requests.map((_, i) => responses.find(r => r.id === String(i)) ?? { id: String(i), status: 0, body: 'No response' });
}
