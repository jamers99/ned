<script lang="ts">
  import { baby, capital, verb } from '../lib/baby.svelte.ts';
  import Sheet from '../components/Sheet.svelte';
  import { close, open } from '../lib/nav.svelte.ts';
  import { nextSleep, type SleepTargets } from '../lib/sleep.ts';
  import type { BabyEvent } from '../lib/db.ts';
  import { clock } from '../lib/state.svelte.ts';
  import { clock as clockTime, clockShort, duration, minute } from '../lib/time.ts';

  // What the bar on Now means, in plain words, with today's numbers in it.
  let { events, targets }: { events: BabyEvent[]; targets: SleepTargets } = $props();

  const next = $derived(nextSleep(events, targets, clock.now));
</script>

<Sheet>
  <div class="title serif">The wake window</div>

  <div class="bar" aria-hidden="true">
    <div class="fill"></div>
    <div class="target"></div>
  </div>

  <div class="points">
    <p>
      <span class="swatch awake-swatch"></span>
      <span>
        <strong>The bar fills</strong> with the time {baby.theyve} been awake{next ? `, since ${baby.they} woke at ${clockTime(next.awakeSince)}` : ''}.
      </span>
    </p>
    <p>
      <span class="swatch target-swatch"></span>
      <span>
        {#if next?.kind === 'bedtime'}
          <strong>The mark at the end is bedtime</strong>, {clockTime(next.from)}. After the day's naps, {baby.they} {verb('stays', 'stay')} up until then.
        {:else}
          <strong>The shaded zone</strong> is a good time for the next nap: about
          {duration(targets.NapWakeWindowMinutes * minute)} after waking, give or take 10 minutes{next ? ` (${clockShort(next.from)}–${clockTime(next.to)})` : ''}.
        {/if}
      </span>
    </p>
    <p class="aside">
      {capital(baby.they)} won't always match it. It's a guide for when to start winding down, not a rule.
    </p>
  </div>

  <div class="row">
    <button class="pill" onclick={() => open({ kind: 'settings' })}>Change the targets</button>
    <button class="primary-dark" onclick={close}>Got it</button>
  </div>
</Sheet>

<style>
  .title {
    font-size: 26px;
    font-weight: 600;
  }

  .bar {
    height: 10px;
    border-radius: 5px;
    background: var(--track);
    position: relative;
    overflow: hidden;
  }

  .fill {
    position: absolute;
    inset: 0 45% 0 0;
    border-radius: 5px;
    background: var(--terra);
  }

  .target {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 70%;
    width: 12%;
    background: var(--moss-pale);
    mix-blend-mode: multiply;
  }

  .points {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  p {
    margin: 0;
    display: flex;
    gap: 12px;
    align-items: baseline;
    font-size: 15px;
    line-height: 1.45;
    color: var(--muted);
  }

  strong {
    color: var(--ink);
    font-weight: 800;
  }

  .swatch {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 6px;
    transform: translateY(1px);
  }

  .awake-swatch {
    background: var(--terra);
  }

  .target-swatch {
    background: var(--moss-pale);
  }

  .aside {
    padding-left: 24px;
  }

  .row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    align-items: center;
  }
</style>
