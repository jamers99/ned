<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { db, type BabyEvent } from '../lib/db.ts';
  import { describe, sleepMeta } from '../lib/describe.ts';
  import { appear, slide } from '../lib/motion.ts';
  import { nav, open } from '../lib/nav.svelte.ts';
  import { dayTimeline } from '../lib/sleep.ts';
  import { clock, live } from '../lib/state.svelte.ts';
  import { addDays, clock as clockTime, clockRange, duration, mediumDate, startOfDay } from '../lib/time.ts';

  // A day's rows include the night that ended that morning, so read from the evening before.
  // The result carries its day, so the rows slide in only once that day's data is ready.
  const loaded = live(
    async (dayStart: number) => ({
      day: dayStart,
      events: await db.events.where('Start').between(addDays(dayStart, -1), addDays(dayStart, 1)).toArray()
    }),
    { day: nav.day, events: [] as BabyEvent[] },
    () => nav.day
  );

  const now = $derived(clock.now);
  const isToday = $derived(nav.day === startOfDay(now));
  const timeline = $derived(dayTimeline(loaded.value.events, loaded.value.day, now));
  let direction = $state(0);

  function show(day: number) {
    direction = day - nav.day;
    nav.day = day;
  }
</script>

<div class="screen" in:appear|global>
  <header class="screen-header">
    <button class="round-button" aria-label="Previous day" onclick={() => show(addDays(nav.day, -1))}>
      <Icon name="left" size={18} width={2} />
    </button>
    <button class="title serif" onclick={() => show(startOfDay(Date.now()))}>
      {isToday ? 'Today' : mediumDate(nav.day)}
    </button>
    <button class="round-button" aria-label="Next day" disabled={isToday} onclick={() => show(addDays(nav.day, 1))}>
      <Icon name="right" size={18} width={2} />
    </button>
  </header>

  {#key loaded.value.day}
    <div class="day" in:slide={{ direction }}>
      <div class="totals">
        <div class="total">
          <span>Sleep</span>
          <strong class="serif">{duration(timeline.sleepTotal)}</strong>
        </div>
        <div class="total">
          <span>{timeline.napCount} {timeline.napCount === 1 ? 'nap' : 'naps'}</span>
          <strong class="serif">{duration(timeline.napTotal)}</strong>
        </div>
        <div class="total">
          <span>{timeline.feedCount} {timeline.feedCount === 1 ? 'feed' : 'feeds'}</span>
          <strong class="serif">{duration(timeline.nursingTotal)}</strong>
        </div>
      </div>

      <div class="rows">
        {#each timeline.rows as row, i (row.kind === 'window' ? `window-${i}` : row.event.Guid)}
          {#if row.kind === 'sleep'}
            <button class="sleep" onclick={() => open({ kind: 'edit', guid: row.event.Guid })}>
              <span class="left">
                <span class="serif sleep-label">{row.label}</span>
                <span class="sleep-meta">
                  {row.event.End ? clockRange(row.event.Start, row.event.End) : `Since ${clockTime(row.event.Start)}`}
                  {#if sleepMeta(row.event, row.wakings)} · {sleepMeta(row.event, row.wakings)}{/if}
                </span>
              </span>
              <span class="serif sleep-duration">{duration(row.asleep)}</span>
            </button>
          {:else if row.kind === 'window'}
            <div class="window"><span class="line"></span>{row.label}</div>
          {:else}
            {@const text = describe(row.event, now)}
            <button class="event" onclick={() => open({ kind: 'edit', guid: row.event.Guid })}>
              <span class="left">
                <span class="event-label">{text.label}</span>
                {#if text.meta}<span class="event-meta">{text.meta}</span>{/if}
              </span>
              <span class="event-time">{text.time}</span>
            </button>
          {/if}
        {:else}
          <p class="empty">Nothing logged {isToday ? 'yet today' : 'this day'}.</p>
        {/each}
      </div>
    </div>
  {/key}
</div>

<style>
  .screen {
    gap: 14px;
  }

  .day {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .title {
    min-height: 44px;
    border: 0;
    background: none;
    font-size: 22px;
    font-weight: 600;
  }

  .totals {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .total {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .total span {
    font-size: 12px;
    font-weight: 800;
    color: var(--muted);
  }

  .total strong {
    font-size: 18px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rows button {
    width: 100%;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .rows button:active {
    transform: scale(0.99);
  }

  .left {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .sleep {
    min-height: 60px;
    border: 0;
    border-radius: 20px;
    padding: 13px 16px;
    background: var(--moss);
    color: var(--on-moss);
  }

  .sleep-label {
    font-size: 17px;
    font-weight: 600;
  }

  .sleep-meta {
    font-size: 13px;
    font-weight: 600;
    color: var(--on-moss-soft);
  }

  .sleep-duration {
    font-size: 19px;
    font-weight: 600;
    white-space: nowrap;
  }

  .window {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 1px 16px;
    font-size: 13px;
    font-weight: 700;
    color: var(--terra-text);
  }

  .line {
    width: 2px;
    height: 20px;
    border-radius: 1px;
    background: var(--terra-soft);
  }

  .event {
    min-height: 52px;
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 9px 16px;
    background: var(--surface);
  }

  .event-label {
    font-size: 14px;
    font-weight: 800;
  }

  .event-meta {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .event-time {
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
    white-space: nowrap;
  }

  .empty {
    margin: 24px 0;
    text-align: center;
    color: var(--muted);
  }
</style>
