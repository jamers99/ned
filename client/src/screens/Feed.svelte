<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import TimeInput from '../components/TimeInput.svelte';
  import { addEvent, updateEvent } from '../lib/actions.ts';
  import type { BabyEvent, FeedKind, Side } from '../lib/db.ts';
  import { rise } from '../lib/motion.ts';
  import { close } from '../lib/nav.svelte.ts';
  import { latestRunning } from '../lib/sleep.ts';
  import { clock } from '../lib/state.svelte.ts';
  import { clock as clockTime, clockShort, day, duration, stopwatch } from '../lib/time.ts';

  let { events }: { events: BabyEvent[] } = $props();

  const now = $derived(clock.now);
  const feed = $derived(latestRunning(events, 'Feed'));
  const lastNursing = $derived(events.filter(e => e.FeedKind === 'Nursing' && e.End != null && e.StartSide).at(-1));

  let kind = $state<FeedKind>('Nursing');
  let lastTapped = $state<Side | null>(null);
  let bottleOz = $state(4);
  let bottleTime = $state(Date.now());

  function choose(option: FeedKind) {
    kind = option;
    if (option !== 'Bottle') return;
    bottleOz = events.filter(e => e.FeedKind === 'Bottle').at(-1)?.BottleOz ?? 4;
    bottleTime = Date.now();
  }

  const secondsKey = (side: Side) => (side === 'Left' ? 'LeftSeconds' : 'RightSeconds');

  function seconds(side: Side): number {
    if (!feed) return 0;
    const running = feed.ActiveSide === side && feed.ActiveSince ? (now - feed.ActiveSince) / 1000 : 0;
    return feed[secondsKey(side)] + running;
  }

  /** Folds the running side's time into its total. */
  function banked(at: number): Partial<BabyEvent> {
    if (!feed?.ActiveSide || !feed.ActiveSince) return {};
    const key = secondsKey(feed.ActiveSide);
    return { [key]: feed[key] + Math.round((at - feed.ActiveSince) / 1000) };
  }

  function tap(side: Side) {
    const at = Date.now();
    lastTapped = side;
    if (!feed) {
      void addEvent({ Type: 'Feed', FeedKind: 'Nursing', Start: at, StartSide: side, ActiveSide: side, ActiveSince: at });
      return;
    }
    if (feed.ActiveSide === side)
      void updateEvent(feed.Guid, { ...banked(at), ActiveSide: null, ActiveSince: null });
    else
      void updateEvent(feed.Guid, { ...banked(at), ActiveSide: side, ActiveSince: at });
  }

  function nudge(deltaSeconds: number) {
    const side = feed?.ActiveSide ?? lastTapped ?? feed?.StartSide;
    if (!feed || !side) return;
    const key = secondsKey(side);
    void updateEvent(feed.Guid, { [key]: Math.max(0, feed[key] + deltaSeconds) });
  }

  function setStart(start: number) {
    if (feed) void updateEvent(feed.Guid, { Start: start > Date.now() ? start - day : start });
  }

  function done() {
    if (feed) {
      const at = Date.now();
      void updateEvent(feed.Guid, { ...banked(at), ActiveSide: null, ActiveSince: null, End: at });
    }
    close();
  }

  function saveBottle() {
    void addEvent({ Type: 'Feed', FeedKind: 'Bottle', Start: bottleTime, End: bottleTime, BottleOz: bottleOz });
    close();
  }
</script>

<div class="overlay" transition:rise>
  <div class="screen">
    <header class="screen-header">
      <button class="round-button" aria-label="Close" onclick={close}><Icon name="close" size={18} width={2} /></button>
      <div class="screen-title">Feed</div>
      <div style:width="44px"></div>
    </header>

    <div class="segments" role="tablist">
      <span class="thumb" class:second={kind === 'Bottle'}></span>
      {#each ['Nursing', 'Bottle'] as option (option)}
        <button role="tab" aria-selected={kind === option} class:on={kind === option} disabled={!!feed && option === 'Bottle'}
          onclick={() => choose(option as FeedKind)}>{option}</button>
      {/each}
    </div>

    {#if kind === 'Nursing'}
      <section class="total">
        <div class="total-label">Total</div>
        <div class="big serif">{stopwatch((seconds('Left') + seconds('Right')) * 1000)}</div>
        {#if lastNursing?.StartSide}
          <div class="last">
            Last feed started on the {lastNursing.StartSide.toLowerCase()} · {duration(now - lastNursing.Start)} ago
          </div>
        {/if}
      </section>

      <div class="sides">
        {#each ['Left', 'Right'] as const as side (side)}
          {@const active = feed?.ActiveSide === side}
          <button class="side" class:active onclick={() => tap(side)}>
            <span class="side-name">{side}</span>
            <span class="side-time serif">{stopwatch(seconds(side) * 1000)}</span>
            <span class="side-hint">{active ? 'Tap to pause' : 'Tap to start'}</span>
          </button>
        {/each}
      </div>

      {#if feed}
        <div class="adjust">
          <button class="pill" onclick={() => nudge(-60)}>−1 min</button>
          <button class="pill" onclick={() => nudge(60)}>+1 min</button>
          <TimeInput class="pill" value={feed.Start} onchange={setStart} label="Feed start time">
            Started {clockShort(feed.Start)}
          </TimeInput>
        </div>
      {/if}

      <button class="primary-dark save" onclick={done}>{feed ? 'Done · save feed' : 'Close'}</button>
    {:else}
      <section class="total">
        <div class="total-label">Bottle</div>
        <div class="stepper">
          <button class="round-button big-step" aria-label="Less" onclick={() => (bottleOz = Math.max(0.5, bottleOz - 0.5))}>−</button>
          <div class="big serif">{bottleOz} oz</div>
          <button class="round-button big-step" aria-label="More" onclick={() => (bottleOz += 0.5)}>+</button>
        </div>
      </section>
      <div class="adjust">
        <TimeInput class="pill" value={bottleTime} onchange={t => (bottleTime = t > Date.now() ? t - day : t)}
          label="Bottle time">
          At {clockTime(bottleTime)}
        </TimeInput>
      </div>
      <button class="primary-dark save" onclick={saveBottle}>Save bottle</button>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10;
    overflow-y: auto;
    background: var(--ground);
  }

  .screen {
    gap: 20px;
  }

  .segments {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    border-radius: 16px;
    background: var(--track);
  }

  .segments button {
    height: 44px;
    border-radius: 12px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 15px;
    font-weight: 700;
  }

  .segments button {
    position: relative;
  }

  .segments button.on {
    color: var(--ink);
    font-weight: 800;
  }

  .thumb {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 4px;
    width: calc(50% - 6px);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 1px 2px rgba(58, 47, 37, 0.08);
    transition: transform var(--quick);
  }

  .thumb.second {
    transform: translateX(calc(100% + 4px));
  }

  .total {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 0 4px;
  }

  .total-label {
    font-size: 14px;
    font-weight: 700;
    color: var(--muted);
  }

  .big {
    font-size: 64px;
    font-weight: 400;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .last {
    font-size: 13px;
    font-weight: 700;
    color: var(--terra-text);
  }

  .sides {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .side {
    aspect-ratio: 1;
    max-height: 200px;
    border-radius: 50%;
    border: 1.5px solid var(--line);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .side.active {
    border-color: transparent;
    background: var(--terra);
    color: var(--surface);
    box-shadow: 0 10px 26px rgba(176, 88, 58, 0.35);
  }

  .side-name {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .side-time {
    font-size: 34px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .side-hint {
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }

  .side.active .side-hint {
    color: var(--surface);
  }

  .adjust {
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .adjust :global(.pill),
  .pill {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 22px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 14px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 12px 0;
  }

  .big-step {
    width: 64px;
    height: 64px;
    border-radius: 32px;
    font-size: 28px;
    font-weight: 600;
  }

  .save {
    margin-top: auto;
  }
</style>
