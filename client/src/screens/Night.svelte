<script lang="ts">
  import { startRunning, startSleep, updateEvent } from '../lib/actions.ts';
  import type { BabyEvent, SettledBy } from '../lib/db.ts';
  import { settleChoices } from '../lib/describe.ts';
  import { appear } from '../lib/motion.ts';
  import { close, open } from '../lib/nav.svelte.ts';
  import { latestRunning, timeAsleep, wakingsDuring } from '../lib/sleep.ts';
  import { clock } from '../lib/state.svelte.ts';
  import { clock as clockTime, duration } from '../lib/time.ts';

  let { events }: { events: BabyEvent[] } = $props();

  const now = $derived(clock.now);
  const sleep = $derived(latestRunning(events, 'Sleep'));
  const wakings = $derived(sleep ? wakingsDuring(sleep, events) : []);
  const waking = $derived(wakings.find(w => w.End == null));

  function settled(by: SettledBy) {
    if (waking) void updateEvent(waking.Guid, { End: Date.now(), SettledBy: by });
  }

  function upForTheDay() {
    if (!sleep) return;
    const end = Date.now();
    if (waking) void updateEvent(waking.Guid, { End: end });
    void updateEvent(sleep.Guid, { End: end });
    open({ kind: 'woke', guid: sleep.Guid });
  }
</script>

<div class="night" transition:appear>
  <header>
    <div class="dim">Night · {clockTime(now)}</div>
    <button class="exit" onclick={close}>Exit</button>
  </header>

  {#if waking && sleep}
    <section class="timer">
      <div class="dim">Waking {wakings.length} · awake for</div>
      <div class="big serif">{duration(now - waking.Start)}</div>
      <div class="dim small">Slept {duration(timeAsleep(sleep, wakings, waking.Start))} before this</div>
    </section>
    <div class="dim label">Back to sleep by</div>
    {#each settleChoices as [value, text] (value)}
      <button class="huge" onclick={() => settled(value)}>{text}</button>
    {/each}
  {:else if sleep}
    <section class="timer">
      <div class="dim">Asleep since {clockTime(sleep.Start)}</div>
      <div class="big serif">{duration(timeAsleep(sleep, wakings, now))}</div>
      <div class="dim small">
        {wakings.length === 0 ? 'No wakings yet' : `${wakings.length} ${wakings.length === 1 ? 'waking' : 'wakings'} so far`}
      </div>
    </section>
    <button class="huge awake" onclick={() => startRunning({ Type: 'NightWaking', Start: Date.now() })}>
      She's awake
    </button>
  {:else}
    <section class="timer">
      <div class="dim">Not asleep</div>
    </section>
    <button class="huge awake" onclick={() => startSleep(Date.now(), true)}>
      Start night
    </button>
  {/if}

  {#if sleep}
    <button class="up" onclick={upForTheDay}>Up for the day</button>
  {/if}
</div>

<style>
  .night {
    position: fixed;
    inset: 0;
    z-index: 10;
    overflow-y: auto;
    background: var(--night-bg);
    color: var(--night-text);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: calc(var(--safe-top) + 24px) 20px calc(var(--safe-bottom) + 24px);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .dim {
    color: var(--night-dim);
    font-size: 15px;
    font-weight: 700;
  }

  .small {
    font-size: 14px;
    font-weight: 600;
  }

  .exit {
    min-height: 44px;
    min-width: 44px;
    border: 0;
    background: none;
    color: var(--night-dim);
    font-size: 14px;
    font-weight: 700;
  }

  .timer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 0 40px;
  }

  .big {
    font-size: 100px;
    font-weight: 400;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .label {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0 4px;
  }

  .huge {
    min-height: 96px;
    border-radius: 28px;
    border: 1px solid var(--night-line);
    background: var(--night-button);
    color: #F0B39D;
    font-family: var(--serif);
    font-size: 24px;
    font-weight: 600;
  }

  .huge.awake {
    min-height: 140px;
    font-size: 28px;
  }

  .up {
    margin-top: auto;
    min-height: 52px;
    border: 0;
    border-radius: 18px;
    background: transparent;
    color: var(--night-dim);
    font-size: 15px;
    font-weight: 700;
  }
</style>
