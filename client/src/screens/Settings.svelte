<script lang="ts">
  import Overlay from '../components/Overlay.svelte';
  import { updateSettings } from '../lib/actions.ts';
  import { signOut } from '../lib/auth.ts';
  import { db, getMeta, syncedTables, type Settings } from '../lib/db.ts';
  import { settingsGuid } from '../lib/ids.ts';
  import { diagnostics } from '../lib/diagnostics.svelte.ts';
  import { close, open } from '../lib/nav.svelte.ts';
  import { targetsFrom, type SleepTargets } from '../lib/sleep.ts';
  import { live, status } from '../lib/state.svelte.ts';
  import { syncNow } from '../lib/sync.ts';
  import { atMinuteOfDay, clock as clockTime, duration, minute } from '../lib/time.ts';

  const row = live(() => db.settings.get(settingsGuid), undefined as Settings | undefined);
  const targets = $derived(targetsFrom(row.value));

  // The debug panel: what is waiting to push and how far each table has pulled.
  const tables = live(() => Promise.all(syncedTables.map(async table => ({
    table,
    rows: await db[table].count(),
    dirty: await db[table].where('dirty').above(0).count(),
    cursor: (await getMeta<number>(`cursor:${table}`)) ?? 0
  }))), []);

  type Target = keyof SleepTargets;
  const time = (v: number) => clockTime(atMinuteOfDay(0, v));
  const length = (v: number) => duration(v * minute);

  const rows: { key: Target; label: string; help?: string; step: number; show: (v: number) => string }[] = [
    { key: 'NapsPerDay', label: 'Naps a day', step: 1, show: String },
    { key: 'NapWakeWindowMinutes', label: 'Awake before a nap', step: 5, show: length,
      help: 'How long she can stay up before a nap.' },
    { key: 'BedtimeWakeWindowMinutes', label: 'Awake before bed', step: 5, show: length,
      help: 'How long she can stay up after her last nap before bed.' },
    { key: 'NightStartMinutes', label: 'Bedtime', step: 15, show: time,
      help: 'When she usually goes down for the night.' },
    { key: 'NightEndMinutes', label: 'Morning', step: 15, show: time,
      help: 'When she usually starts the day.' }
  ];

  const isTime = (key: Target) => key === 'NightStartMinutes' || key === 'NightEndMinutes';

  function step(key: Target, by: number) {
    const value = targets[key] + by;
    const day = 24 * 60;
    void updateSettings({ [key]: isTime(key) ? (value + day) % day : Math.max(key === 'NapsPerDay' ? 0 : 5, value) });
  }

  async function leave() {
    const clearData = confirm('Also erase the data on this phone? Choose Cancel to keep it.');
    await signOut(clearData);
    close();
  }
</script>

<Overlay title="Settings">
  <section class="card list">
    <div>
      <div class="eyebrow">Her sleep plan</div>
      <p class="help">Used to suggest when her next nap or bedtime is.</p>
    </div>
    {#each rows as { key, label, help, step: size, show } (key)}
      <div class="setting">
        <div class="row">
          <span>{label}</span>
          <button class="round-button" aria-label="{label} less" onclick={() => step(key, -size)}>−</button>
          <span class="value serif">{show(targets[key])}</span>
          <button class="round-button" aria-label="{label} more" onclick={() => step(key, size)}>+</button>
        </div>
        {#if help}<p class="help">{help}</p>{/if}
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

  .setting + .setting {
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }

  .help {
    margin: 4px 0 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    line-height: 1.35;
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
