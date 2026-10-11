<script lang="ts">
  import Overlay from '../components/Overlay.svelte';
  import { updateSettings } from '../lib/actions.ts';
  import { signOut } from '../lib/auth.ts';
  import { db, getMeta, syncedTables, type Settings } from '../lib/db.ts';
  import { settingsGuid } from '../lib/ids.ts';
  import { diagnostics } from '../lib/diagnostics.svelte.ts';
  import { close, open } from '../lib/nav.svelte.ts';
  import { defaultTargets } from '../lib/sleep.ts';
  import { live, status } from '../lib/state.svelte.ts';
  import { syncNow } from '../lib/sync.ts';
  import { atMinuteOfDay, clock as clockTime, duration, minute } from '../lib/time.ts';

  const row = live(() => db.settings.get(settingsGuid), undefined as Settings | undefined);
  const targets = $derived(row.value ?? defaultTargets);

  // The debug panel: what is waiting to push and how far each table has pulled.
  const tables = live(() => Promise.all(syncedTables.map(async table => ({
    table,
    rows: await db[table].count(),
    dirty: await db[table].where('dirty').above(0).count(),
    cursor: (await getMeta<number>(`cursor:${table}`)) ?? 0
  }))), []);

  type Target = 'Nap1WakeWindowMinutes' | 'Nap2WakeWindowMinutes' | 'BedtimeWakeWindowMinutes'
    | 'BedtimeEarliestMinutes' | 'BedtimeLatestMinutes' | 'NapsPerDay';

  const rows: { key: Target; label: string; step: number; show: (v: number) => string }[] = [
    { key: 'Nap1WakeWindowMinutes', label: 'Before nap 1', step: 5, show: v => duration(v * minute) },
    { key: 'Nap2WakeWindowMinutes', label: 'Before later naps', step: 5, show: v => duration(v * minute) },
    { key: 'BedtimeWakeWindowMinutes', label: 'Before bed', step: 5, show: v => duration(v * minute) },
    { key: 'NapsPerDay', label: 'Naps per day', step: 1, show: v => String(v) },
    { key: 'BedtimeEarliestMinutes', label: 'Earliest bedtime', step: 15, show: v => clockTime(atMinuteOfDay(0, v)) },
    { key: 'BedtimeLatestMinutes', label: 'Latest bedtime', step: 15, show: v => clockTime(atMinuteOfDay(0, v)) }
  ];

  function step(key: Target, by: number) {
    void updateSettings({ [key]: Math.max(key === 'NapsPerDay' ? 0 : 5, targets[key] + by) });
  }

  async function leave() {
    const clearData = confirm('Also erase the data on this phone? Choose Cancel to keep it.');
    await signOut(clearData);
    close();
  }
</script>

<Overlay title="Settings">
  <section class="card list">
    <div class="eyebrow">Wake windows</div>
    {#each rows as { key, label, step: size, show } (key)}
      <div class="row">
        <span>{label}</span>
        <button class="round-button" aria-label="{label} less" onclick={() => step(key, -size)}>−</button>
        <span class="value serif">{show(targets[key])}</span>
        <button class="round-button" aria-label="{label} more" onclick={() => step(key, size)}>+</button>
      </div>
    {/each}
  </section>

  <section class="card list">
    <div class="eyebrow">Sync</div>
    <div class="status">
      {#if status.needsSignIn}
        Signed out — <button class="inline" onclick={() => open({ kind: 'signin' })}>sign in to sync</button>
      {:else}
        {status.syncing ? 'Syncing…' : status.lastSyncedAt ? `Synced at ${clockTime(status.lastSyncedAt)}` : 'Not synced yet'}
      {/if}
    </div>
    {#if status.error}<div class="error">{status.error}</div>{/if}
    <table>
      <thead><tr><th>Table</th><th>Rows</th><th>To push</th><th>Pulled to</th></tr></thead>
      <tbody>
        {#each tables.value as t (t.table)}
          <tr>
            <td>{t.table}</td>
            <td>{t.rows}</td>
            <td>{t.dirty}</td>
            <td>{t.cursor ? new Date(t.cursor).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button class="chip" onclick={() => syncNow()}>Sync now</button>
  </section>

  <section class="card list">
    <div class="eyebrow">Diagnostics</div>
    {#each diagnostics.log as entry, i (i)}
      <div class="diagnostic">
        {new Date(entry.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })} ·
        {entry.message}
      </div>
    {:else}
      <div class="diagnostic">Nothing yet.</div>
    {/each}
  </section>

  <section class="card list">
    <div class="eyebrow">Signed in as {status.user}</div>
    <button class="chip" onclick={leave}>Sign out</button>
  </section>

  <div class="version">
    Version {new Date(__BUILD_TIME__).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
  </div>
</Overlay>

<style>
  .list {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
  }

  .row > span:first-child {
    flex: 1;
  }

  .value {
    min-width: 84px;
    text-align: center;
    font-size: 18px;
  }

  .status {
    font-size: 15px;
  }

  .inline {
    border: 0;
    background: none;
    padding: 0;
    color: var(--terra-text);
    font-weight: 800;
    text-decoration: underline;
  }

  .error {
    color: var(--terra-text);
    font-size: 13px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th {
    text-align: left;
    color: var(--muted);
    font-weight: 800;
  }

  td,
  th {
    padding: 4px 0;
  }

  .chip {
    align-self: flex-start;
  }

  .diagnostic {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  .version {
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
</style>
