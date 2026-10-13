<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import TodayStrip from '../components/TodayStrip.svelte';
  import { startSleep } from '../lib/actions.ts';
  import type { BabyEvent } from '../lib/db.ts';
  import { nursedSeconds } from '../lib/describe.ts';
  import { appear } from '../lib/motion.ts';
  import { open, showTab } from '../lib/nav.svelte.ts';
  import { isNightTime, latestRunning, nextSleep, type SleepTargets } from '../lib/sleep.ts';
  import { clock } from '../lib/state.svelte.ts';
  import { clockShort, clock as clockTime, duration, longDate, minute, stopwatch } from '../lib/time.ts';
  import Asleep from './Asleep.svelte';

  let { events, targets }: { events: BabyEvent[]; targets: SleepTargets } = $props();

  const now = $derived(clock.now);
  const sleeping = $derived(latestRunning(events, 'Sleep'));
  const feeding = $derived(latestRunning(events, 'Feed'));
  const next = $derived(nextSleep(events, targets));

  const awakeFor = $derived(next ? now - next.awakeSince : 0);
  const barSpan = $derived(next ? next.to - next.awakeSince + 20 * minute : 1);

  // The last finished feed or solids, timed from when it started, like the gap between feeds is usually counted.
  const lastMeal = $derived(events.filter(e => (e.Type === 'Feed' || e.Type === 'Solids') && e.End != null).at(-1));
  const lastMealAgo = $derived(lastMeal ? now - lastMeal.Start : 0);

  function mealDetail(meal: BabyEvent): string {
    if (meal.Type === 'Solids') return meal.Foods.join(', ') || 'solids';
    if (meal.FeedKind === 'Bottle') return `${meal.BottleOz ?? 0} oz bottle`;
    const seconds = meal.LeftSeconds + meal.RightSeconds;
    return seconds ? `nursed ${duration(seconds * 1000)}` : 'nursed';
  }
</script>

{#if sleeping}
  <Asleep sleep={sleeping} {events} />
{:else}
  <div class="screen" in:appear|global>
    <header class="screen-header">
      <div>
        <div class="date">{longDate(now)}</div>
        <div class="name">
          <span class="serif">Kennedy</span>
          <Icon name="sprig" size={24} stroke="var(--moss)" width={1.5} />
        </div>
      </div>
      <button class="round-button" aria-label="Settings" onclick={() => open({ kind: 'settings' })}>
        <Icon name="sliders" size={20} />
      </button>
    </header>

    <section class="card awake">
      <div class="since">
        <span class="dot"></span>
        <span class="awake-label">Awake</span>
        {#if next}<span>since {clockTime(next.awakeSince)}</span>{/if}
      </div>
      {#if next}
        <div class="big serif">{duration(awakeFor)}</div>
        <div class="bar" aria-hidden="true">
          <div class="fill" style:transform="translateX({Math.min(100, (awakeFor / barSpan) * 100) - 100}%)"></div>
          <div class="target" style:left="{((next.from - next.awakeSince) / barSpan) * 100}%"
            style:width="{Math.max(1.5, ((next.to - next.from) / barSpan) * 100)}%"></div>
        </div>
        <div class="window">
          <span>Wake window ~{duration(next.targetMinutes * minute)}</span>
          <span class="next">
            {#if next.kind === 'nap'}Nap {clockShort(next.from)}–{clockShort(next.to)}{:else}Bedtime {clockTime(next.from)}{/if}
          </span>
        </div>
      {:else}
        <div class="empty">Log a sleep to see her wake window.</div>
      {/if}
    </section>

    <button class="start-sleep" onclick={() => startSleep(Date.now(), isNightTime(Date.now(), targets))}>
      <Icon name="moonStar" size={28} stroke="var(--surface)" width={1.8} />
      {isNightTime(now, targets) ? 'Start night' : 'Start nap'}
    </button>

    <div class="tiles">
      <button class="tile" class:running={feeding} onclick={() => open({ kind: 'feed' })}>
        <Icon name="drop" stroke="var(--terra-text)" />
        {feeding ? stopwatch(nursedSeconds(feeding, now) * 1000) : 'Feed'}
      </button>
      <button class="tile" onclick={() => open({ kind: 'solids' })}>
        <Icon name="bowl" stroke="var(--terra-text)" />
        Solids
      </button>
      <button class="tile" onclick={() => open({ kind: 'note' })}>
        <Icon name="pencil" stroke="var(--terra-text)" />
        Note
      </button>
    </div>

    {#if lastMeal}
      <button class="card last-meal" onclick={() => showTab('day')}>
        <Icon name={lastMeal.Type === 'Solids' ? 'bowl' : 'drop'} stroke="var(--terra-text)" />
        <span class="last-meal-text">
          <span class="last-meal-ago serif">
            {lastMeal.Type === 'Solids' ? 'Ate' : 'Fed'} {lastMealAgo < minute ? 'just now' : `${duration(lastMealAgo)} ago`}
          </span>
          <span class="last-meal-meta">{clockTime(lastMeal.Start)} · {mealDetail(lastMeal)}</span>
        </span>
        <Icon name="right" size={18} stroke="var(--muted)" />
      </button>
    {/if}

    <TodayStrip {events} {now} />
  </div>
{/if}

<style>
  .date {
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
    letter-spacing: 0.04em;
  }

  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .awake {
    border-radius: 26px;
    padding: 22px 22px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .since {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--muted);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: var(--terra);
  }

  .awake-label {
    font-weight: 800;
    color: var(--terra-text);
  }

  .big {
    font-size: 66px;
    font-weight: 400;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .bar {
    height: 10px;
    border-radius: 5px;
    background: var(--track);
    position: relative;
    overflow: hidden;
  }

  /* Full width and slid into place, so it glides between the clock's one-second ticks. */
  .fill {
    position: absolute;
    inset: 0;
    border-radius: 5px;
    background: var(--terra);
    transition: transform 1s linear;
  }

  .target {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--moss-pale);
    mix-blend-mode: multiply;
  }

  .window {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }

  .next {
    color: var(--moss-deep);
  }

  .empty {
    font-size: 15px;
    color: var(--muted);
  }

  .start-sleep {
    height: 108px;
    border: 0;
    border-radius: 30px;
    background: var(--moss);
    color: var(--on-moss);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    font-family: var(--serif);
    font-size: 26px;
    font-weight: 600;
    box-shadow: var(--button-shadow);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .tile {
    height: 78px;
    border-radius: 22px;
    border: 1px solid var(--line);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .tile.running {
    border-color: var(--terra);
    color: var(--terra-text);
  }

  .last-meal {
    min-height: 60px;
    padding: 10px 16px;
    border-radius: 22px;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
  }

  .last-meal-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .last-meal-ago {
    font-size: 18px;
    font-weight: 600;
  }

  .last-meal-meta {
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
