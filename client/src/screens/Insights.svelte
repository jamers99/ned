<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { db, type BabyEvent } from '../lib/db.ts';
  import { settledText } from '../lib/describe.ts';
  import { bedtimeStats, bestLastWakeWindow, nightsNeededForPattern, stretchByMonth, wakingStats } from '../lib/insights.ts';
  import { open } from '../lib/nav.svelte.ts';
  import { clock, live } from '../lib/state.svelte.ts';
  import { clock as clockTime, duration } from '../lib/time.ts';

  const history = live(() => db.events.toArray(), [] as BabyEvent[]);
  const events = $derived(history.value.filter(e => !e.Deleted));

  const months = $derived(stretchByMonth(events));
  const maxHours = $derived(Math.max(1, ...months.map(m => m.hours)));
  const bedtime = $derived(bedtimeStats(events, clock.now));
  const wakings = $derived(wakingStats(events, clock.now));
  const pattern = $derived(bestLastWakeWindow(events));
</script>

<div class="screen">
  <h1 class="serif">Insights</h1>

  <section class="card chart">
    <div>
      <div class="serif card-title">Longest night stretch</div>
      <div class="muted">Typical hours between night feeds or wakings, by month</div>
    </div>
    {#if months.length}
      <div class="bars">
        {#each months as m, i (m.label + i)}
          <div class="bar-column">
            <span class="bar-value">{m.hours.toFixed(1)}</span>
            <div class="bar" class:latest={i === months.length - 1} style:height="{(m.hours / maxHours) * 118}px"></div>
            <span class="bar-label">{m.label}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="muted">Shows up once a few nights are logged.</div>
    {/if}
  </section>

  <div class="pair">
    <section class="card stat">
      <span class="stat-label">Avg bedtime · 7 days</span>
      {#if bedtime}
        <span class="serif stat-value">{clockTime(bedtime.average)}</span>
        <span class="muted small">±{bedtime.spreadMinutes}m spread</span>
      {:else}
        <span class="muted small">Log a couple of nights</span>
      {/if}
    </section>
    <section class="card stat">
      <span class="stat-label">Night wakings · 7 days</span>
      {#if wakings}
        <span class="serif stat-value">{wakings.perNight} / night</span>
        {#if wakings.top}
          <span class="muted small">{wakings.topShare}% back by {settledText[wakings.top]}</span>
        {/if}
      {:else}
        <span class="muted small">Log a night to see this</span>
      {/if}
    </section>
  </div>

  <section class="pattern">
    <div class="pattern-head">
      <Icon name="sprig" size={20} stroke="var(--moss-deep)" width={1.6} />
      <span>A pattern</span>
    </div>
    {#if !pattern.ready}
      <p class="serif quote">Which last wake window of the day leads to the calmest nights?</p>
      <div class="pattern-note">
        Unlocks after ~{nightsNeededForPattern} days of logged sleep · {pattern.nights} so far
      </div>
    {:else if pattern.from != null}
      <p class="serif quote">
        Nights after a last wake window of {duration(pattern.from)}–{duration(pattern.to)} have fewer wakings than
        shorter or longer ones.
      </p>
    {:else}
      <p class="serif quote">No last wake window stands out yet. Keep logging naps and nights.</p>
    {/if}
  </section>

  <button class="card growth" onclick={() => open({ kind: 'growth' })}>
    <Icon name="ruler" stroke="var(--moss)" />
    <span class="serif">Growth</span>
    <Icon name="right" size={18} stroke="var(--muted)" />
  </button>
</div>

<style>
  .screen {
    gap: 14px;
  }

  h1 {
    margin: 0;
    font-size: 30px;
    font-weight: 600;
  }

  .muted {
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
  }

  .small {
    font-size: 12px;
  }

  .chart {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .card-title {
    font-size: 18px;
    font-weight: 600;
  }

  .bars {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    height: 170px;
  }

  .bar-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    height: 100%;
  }

  .bar-value {
    font-size: 11px;
    font-weight: 800;
    color: var(--moss-deep);
  }

  .bar {
    width: 100%;
    min-height: 4px;
    border-radius: 8px 8px 4px 4px;
    background: #C3CBB3;
  }

  .bar.latest {
    background: var(--moss);
  }

  .bar-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .stat {
    border-radius: 20px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .stat-label {
    font-size: 12px;
    font-weight: 800;
    color: var(--muted);
  }

  .stat-value {
    font-size: 22px;
    font-weight: 600;
  }

  .pattern {
    background: var(--moss-soft);
    border-radius: 22px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pattern-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 800;
    color: var(--moss-deep);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .quote {
    margin: 0;
    font-size: 17px;
    font-weight: 500;
    font-style: italic;
    color: #2F3828;
    line-height: 1.4;
  }

  .pattern-note {
    font-size: 13px;
    font-weight: 700;
    color: #4E5B43;
  }

  .growth {
    min-height: 60px;
    padding: 0 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 18px;
    font-weight: 600;
  }

  .growth span {
    flex: 1;
    text-align: left;
  }
</style>
