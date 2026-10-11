<script lang="ts">
  import LineChart from '../components/LineChart.svelte';
  import Overlay from '../components/Overlay.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { deleteGrowth, saveGrowth } from '../lib/actions.ts';
  import { db, type Growth } from '../lib/db.ts';
  import { live } from '../lib/state.svelte.ts';
  import { fromDateInput, toDateInput } from '../lib/time.ts';

  const kgPerLb = 0.45359237;
  const cmPerIn = 2.54;

  const rows = live(() => db.growth.orderBy('MeasuredAt').toArray(), [] as Growth[]);
  const measurements = $derived(rows.value.filter(g => !g.Deleted));

  const pounds = (kg: number) => {
    const totalOz = Math.round((kg / kgPerLb) * 16 * 10) / 10;
    const lb = Math.floor(totalOz / 16);
    return `${lb} lb ${Math.round((totalOz - lb * 16) * 10) / 10} oz`;
  };
  const inches = (cm: number) => `${(cm / cmPerIn).toFixed(1)} in`;

  const charts = $derived([
    { title: 'Weight', unit: 'lb', points: series(g => g.WeightKg, kg => kg / kgPerLb), format: (lb: number) => pounds(lb * kgPerLb) },
    { title: 'Length', unit: 'in', points: series(g => g.LengthCm, cm => cm / cmPerIn), format: (v: number) => `${v.toFixed(1)} in` },
    { title: 'Head', unit: 'in', points: series(g => g.HeadCm, cm => cm / cmPerIn), format: (v: number) => `${v.toFixed(1)} in` }
  ]);

  function series(pick: (g: Growth) => number | null, convert: (v: number) => number) {
    return measurements.filter(g => pick(g) != null).map(g => ({ at: g.MeasuredAt, value: convert(pick(g)!) }));
  }

  // The add/edit form works in pounds, ounces and inches; the record stores kilograms and centimetres.
  let editing = $state<{ guid?: string; date: string; lb: string; oz: string; length: string; head: string } | null>(null);

  function startEdit(g?: Growth) {
    const totalLb = g?.WeightKg != null ? g.WeightKg / kgPerLb : null;
    editing = {
      guid: g?.Guid,
      date: toDateInput(g?.MeasuredAt ?? Date.now()),
      lb: totalLb != null ? String(Math.floor(totalLb)) : '',
      oz: totalLb != null ? String(Math.round((totalLb % 1) * 16 * 10) / 10) : '',
      length: g?.LengthCm != null ? (g.LengthCm / cmPerIn).toFixed(1) : '',
      head: g?.HeadCm != null ? (g.HeadCm / cmPerIn).toFixed(1) : ''
    };
  }

  const number = (s: string) => (s.trim() === '' ? null : Number(s));

  function save() {
    if (!editing) return;
    const lb = number(editing.lb);
    const oz = number(editing.oz);
    const length = number(editing.length);
    const head = number(editing.head);
    void saveGrowth({
      Guid: editing.guid,
      MeasuredAt: fromDateInput(editing.date),
      WeightKg: lb == null && oz == null ? null : ((lb ?? 0) + (oz ?? 0) / 16) * kgPerLb,
      LengthCm: length == null ? null : length * cmPerIn,
      HeadCm: head == null ? null : head * cmPerIn
    });
    editing = null;
  }

  function remove() {
    if (editing?.guid && confirm('Delete this measurement?')) void deleteGrowth(editing.guid);
    editing = null;
  }
</script>

<Overlay title="Growth">
  {#each charts as chart (chart.title)}
    {#if chart.points.length}
      <section class="card chart">
        <div class="serif chart-title">{chart.title} <span>({chart.unit})</span></div>
        <LineChart points={chart.points} format={chart.format} />
      </section>
    {/if}
  {/each}

  <button class="primary-dark" onclick={() => startEdit()}>Add measurement</button>

  <section class="list">
    {#each [...measurements].reverse() as g (g.Guid)}
      <button class="card measurement" onclick={() => startEdit(g)}>
        <span class="when">{new Date(g.MeasuredAt).toLocaleDateString([], { dateStyle: 'medium' })}</span>
        <span class="values">
          {[g.WeightKg != null ? pounds(g.WeightKg) : '', g.LengthCm != null ? inches(g.LengthCm) : '',
            g.HeadCm != null ? `head ${inches(g.HeadCm)}` : ''].filter(Boolean).join(' · ')}
        </span>
      </button>
    {:else}
      <p class="empty">No measurements yet.</p>
    {/each}
  </section>
</Overlay>

{#if editing}
  <Sheet onclose={() => (editing = null)}>
    <div class="screen-title">{editing.guid ? 'Measurement' : 'Add measurement'}</div>
    <label class="field"><span class="eyebrow">Date</span><input type="date" bind:value={editing.date} /></label>
    <div class="pair">
      <label class="field"><span class="eyebrow">Weight lb</span><input inputmode="numeric" bind:value={editing.lb} /></label>
      <label class="field"><span class="eyebrow">oz</span><input inputmode="decimal" bind:value={editing.oz} /></label>
    </div>
    <div class="pair">
      <label class="field"><span class="eyebrow">Length in</span><input inputmode="decimal" bind:value={editing.length} /></label>
      <label class="field"><span class="eyebrow">Head in</span><input inputmode="decimal" bind:value={editing.head} /></label>
    </div>
    <div class="actions">
      {#if editing.guid}<button class="delete" onclick={remove}>Delete</button>{/if}
      <button class="primary-dark" onclick={save}>Save</button>
    </div>
  </Sheet>
{/if}

<style>
  .chart {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chart-title {
    font-size: 18px;
    font-weight: 600;
  }

  .chart-title span {
    font-family: var(--sans);
    font-size: 13px;
    color: var(--muted);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .measurement {
    min-height: 56px;
    padding: 10px 16px;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
  }

  .when {
    font-size: 14px;
    font-weight: 800;
  }

  .values {
    font-size: 13px;
    color: var(--muted);
  }

  .empty {
    text-align: center;
    color: var(--muted);
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field input {
    height: 52px;
    padding: 0 14px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: var(--ground);
    font-size: 17px;
    outline: 0;
    min-width: 0;
  }

  .actions {
    display: flex;
    gap: 10px;
  }
</style>
