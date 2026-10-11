<script lang="ts">
  import type { BabyEvent } from '../lib/db.ts';
  import { dayOf, timeAsleep, wakingsDuring } from '../lib/sleep.ts';
  import { atMinuteOfDay, day, duration, startOfDay } from '../lib/time.ts';

  let { events, now }: { events: BabyEvent[]; now: number } = $props();

  // A baby's day: 6 AM to 6 AM.
  const from = $derived.by(() => {
    const sixAm = atMinuteOfDay(now, 6 * 60);
    return now < sixAm ? sixAm - day : sixAm;
  });
  const to = $derived(from + day);
  const at = (ms: number) => ((Math.min(Math.max(ms, from), to) - from) / day) * 100;

  const sleeps = $derived(events.filter(e => e.Type === 'Sleep' && e.Start < to && (e.End ?? now) > from));
  const feeds = $derived(events.filter(e => (e.Type === 'Feed' || e.Type === 'Solids') && e.Start >= from && e.Start < to));

  const lastNight = $derived(events
    .filter(e => e.Type === 'Sleep' && e.IsNight && dayOf(e) === startOfDay(now))
    .at(-1));
  const lastNightWakings = $derived(lastNight ? wakingsDuring(lastNight, events) : []);
</script>

<section class="today">
  <div class="heading">
    <div class="serif title">Today</div>
    {#if lastNight}
      <div class="summary">
        Night {duration(timeAsleep(lastNight, lastNightWakings, now))} ·
        {lastNightWakings.length} {lastNightWakings.length === 1 ? 'waking' : 'wakings'}
      </div>
    {/if}
  </div>
  <div class="strip" aria-hidden="true">
    {#each sleeps as sleep (sleep.Guid)}
      <div class="sleep" class:nap={!sleep.IsNight} style:left="{at(sleep.Start)}%"
        style:width="{at(sleep.End ?? now) - at(sleep.Start)}%"></div>
    {/each}
    {#each feeds as feed (feed.Guid)}
      <div class="feed" style:left="{at(feed.Start)}%"></div>
    {/each}
    <div class="now" style:left="{at(now)}%"></div>
  </div>
  <div class="labels" aria-hidden="true">
    <span style:left="0%">6a</span>
    <span style:left="25%">12p</span>
    <span style:left="50%">6p</span>
    <span style:left="75%">12a</span>
  </div>
</section>

<style>
  .today {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px 4px 0;
  }

  .heading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .title {
    font-size: 18px;
    font-weight: 600;
  }

  .summary {
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }

  .strip {
    height: 26px;
    border-radius: 13px;
    background: var(--track);
    position: relative;
    overflow: hidden;
  }

  .sleep {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--moss);
  }

  .sleep.nap {
    background: #8E9B7D;
  }

  .feed {
    position: absolute;
    top: 7px;
    bottom: 7px;
    width: 4px;
    margin-left: -2px;
    border-radius: 2px;
    background: var(--terra);
  }

  .now {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--ink);
  }

  .labels {
    position: relative;
    height: 16px;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
  }

  .labels span {
    position: absolute;
  }
</style>
