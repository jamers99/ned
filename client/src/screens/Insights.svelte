<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { db, type BabyEvent } from '../lib/db.ts';
  import { baby } from '../lib/baby.svelte.ts';
  import {
    bedtimeStats, feedSplit, goodNights, stretchByMonth, typicalNightFeeds, wakingsByWeek
  } from '../lib/insights.ts';
  import { appear } from '../lib/motion.ts';
  import { open } from '../lib/nav.svelte.ts';
  import { clock, live } from '../lib/state.svelte.ts';
  import type { SleepTargets } from '../lib/sleep.ts';
  import { ageText, clock as clockTime, monthsOld, startOfDay } from '../lib/time.ts';

  let { targets }: { targets: SleepTargets } = $props();

  const history = live(() => db.events.toArray(), [] as BabyEvent[]);
  const events = $derived(history.value.filter(e => !e.Deleted));
  // These only change with the data or the date, so they follow the day rather than the 1s clock tick.
  const today = $derived(startOfDay(clock.now));

  const stretches = $derived(stretchByMonth(events).map(m => ({ label: m.label, value: m.hours, inner: 0 })));
  const bedtime = $derived(bedtimeStats(events, today));
  const weeks = $derived(wakingsByWeek(events, today)
    .map(w => ({ label: w.label, value: w.perNight, inner: w.perNight ? w.fedPerNight / w.perNight : 0 })));
  const feeds = $derived(feedSplit(events, today));
  const nights = $derived(goodNights(events, targets, today));
  const months = $derived(baby.born == null ? null : monthsOld(baby.born, today));
</script>

{#snippet bars(rows: { label: string; value: number; inner: number }[], empty: string)}
  {#if rows.length}
    {@const max = Math.max(1, ...rows.map(r => r.value))}
    <div class="bars">
      {#each rows as r, i (r.label + i)}
        <div class="bar-column">
          <span class="bar-value">{r.value.toFixed(1)}</span>
          <div class="bar" class:latest={i === rows.length - 1} style:height="{(r.value / max) * 118}px">
            {#if r.inner}<div class="inner" style:height="{r.inner * 100}%"></div>{/if}
          </div>
          <span class="bar-label">{r.label}</span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="muted">{empty}</div>
  {/if}
{/snippet}

<div class="screen" in:appear|global>
  <div>
    <h1 class="serif">Insights</h1>
    {#if baby.born != null}<div class="muted">{baby.name} · {ageText(baby.born, clock.now)}</div>{/if}
  </div>

  <section class="card chart">
    <div>
      <div class="serif card-title">Longest night stretch</div>
      <div class="muted">Typical hours between night feeds or wakings, by month</div>
    </div>
    {@render bars(stretches, 'Shows up once a few nights are logged.')}
  </section>

  <section class="card chart">
    <div>
      <div class="serif card-title">Night wakings</div>
      <div class="muted">Per night, by week · highlighted: settled by a feed</div>
    </div>
    {@render bars(weeks, 'Shows up once a night is logged.')}
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
      <span class="stat-label">Feeds a day · 7 days</span>
      {#if feeds}
        <span class="serif stat-value">{feeds.day} by day</span>
        <span class="muted small">{feeds.night} at night</span>
        {#if months != null}<span class="muted small">Typical: {typicalNightFeeds(months)} at night</span>{/if}
      {:else}
        <span class="muted small">Log a couple of days</span>
      {/if}
    </section>
  </div>

  <section class="pattern">
    <div class="pattern-head">
      <Icon name="sprig" size={20} stroke="var(--moss-deep)" width={1.6} />
      <span>Calmer nights</span>
    </div>
    {#if months != null && months < 3}
      <p class="serif quote">Nights follow feeds for now. What helps them starts to show after about 3 months.</p>
    {:else if nights}
      <p class="serif quote">
        Nights after {nights.calm}: {nights.calmWakings} wakings. After {nights.rough}: {nights.roughWakings}.
      </p>
      <div class="pattern-note">Last 4 weeks</div>
    {:else}
      <p class="serif quote">What's different about the calmer nights?</p>
      <div class="pattern-note">Shows up after a couple of weeks of naps and nights</div>
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
    max-width: 36px;
    min-height: 4px;
    border-radius: 8px 8px 4px 4px;
    background: var(--moss-bar);
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }

  .bar.latest {
    background: var(--moss);
  }

  .inner {
    width: 100%;
    background: var(--moss-deep);
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
    color: var(--on-moss-callout);
    line-height: 1.4;
  }

  .pattern-note {
    font-size: 13px;
    font-weight: 700;
    color: var(--moss-callout-note);
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
