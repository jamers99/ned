<script lang="ts">
  import { setSideSeconds } from '../lib/actions.ts';
  import type { BabyEvent, Side } from '../lib/db.ts';
  import { sideSeconds } from '../lib/describe.ts';

  // How long she nursed on each side, in minutes: tap the number to type it, or step it a minute at a time.
  // Used in a feed's edit sheet and in the Feed drawer, where a running side keeps counting.
  let { feed, now }: { feed: BabyEvent; now: number } = $props();

  // While a number is being typed it holds still, so a running side's tick doesn't overwrite it.
  let typing = $state<Side | null>(null);
  let held = $state(0);

  const minutes = (side: Side) => Math.floor(sideSeconds(feed, side, now) / 60);

  function step(side: Side, direction: number) {
    void setSideSeconds(feed, side, sideSeconds(feed, side, Date.now()) + direction * 60);
  }

  function typed(side: Side, text: string) {
    const value = Number.parseInt(text, 10);
    if (Number.isFinite(value) && value >= 0 && value <= 240) void setSideSeconds(feed, side, value * 60);
  }

  function focus(side: Side, input: HTMLInputElement) {
    held = minutes(side);
    typing = side;
    input.select();
  }
</script>

{#each ['Left', 'Right'] as const as side (side)}
  <div class="stepper">
    <span class="eyebrow">{side}</span>
    <button class="round-button" aria-label="{side} less" onclick={() => step(side, -1)}>−</button>
    <label class="minutes serif">
      <input type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" aria-label="{side} minutes"
        value={typing === side ? held : minutes(side)}
        onfocus={e => focus(side, e.currentTarget)}
        onblur={() => (typing = null)}
        onchange={e => typed(side, e.currentTarget.value)}
        onkeydown={e => e.key === 'Enter' && e.currentTarget.blur()} />
      <span class="unit">min</span>
    </label>
    <button class="round-button" aria-label="{side} more" onclick={() => step(side, 1)}>+</button>
  </div>
{/each}

<style>
  .stepper {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .stepper .eyebrow {
    flex: 1;
  }

  .minutes {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
    min-width: 92px;
    min-height: 44px;
    padding: 0 10px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: var(--ground);
    cursor: text;
  }

  input {
    width: 3ch;
    border: 0;
    padding: 8px 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 20px;
    font-weight: 600;
    text-align: right;
    outline: 0;
  }

  .unit {
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }
</style>
