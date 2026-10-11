<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import TimeInput from '../components/TimeInput.svelte';
  import { updateEvent } from '../lib/actions.ts';
  import type { BabyEvent, SleepLocation } from '../lib/db.ts';
  import { locationText, onsetChoices } from '../lib/describe.ts';
  import { appear } from '../lib/motion.ts';
  import { open } from '../lib/nav.svelte.ts';
  import { napNumber, timeAsleep, typicalNapRange, wakingsDuring } from '../lib/sleep.ts';
  import { clock } from '../lib/state.svelte.ts';
  import { clock as clockTime, day, duration, longDate } from '../lib/time.ts';

  let { sleep, events }: { sleep: BabyEvent; events: BabyEvent[] } = $props();

  const now = $derived(clock.now);
  const asleep = $derived(timeAsleep(sleep, wakingsDuring(sleep, events), now));
  const title = $derived(sleep.IsNight ? 'Night' : `Nap ${napNumber(sleep, events)}`);
  const typical = $derived(sleep.IsNight ? null : typicalNapRange(events, now));

  const places = Object.entries(locationText) as [SleepLocation, string][];

  function toggle(changes: Partial<BabyEvent>) {
    void updateEvent(sleep.Guid, changes);
  }

  function wokeUp() {
    void updateEvent(sleep.Guid, { End: Date.now() });
    open({ kind: 'woke', guid: sleep.Guid });
  }

  function adjustStart(start: number) {
    void updateEvent(sleep.Guid, { Start: start > Date.now() ? start - day : start });
  }
</script>

<div class="screen asleep" in:appear|global>
  <header class="screen-header">
    <div>
      <div class="date">{longDate(now)}</div>
      <div class="serif name">Kennedy</div>
    </div>
    <button class="round-button moon" aria-label="Night mode" onclick={() => open({ kind: 'night' })}>
      <Icon name="moon" size={20} stroke="var(--surface)" />
    </button>
  </header>

  <section class="timer">
    <svg aria-hidden="true" width="70" height="18" viewBox="0 0 70 18" fill="none" stroke="var(--moss-pale)"
      stroke-width="1.4" stroke-linecap="round">
      <path d="M2 9h22M46 9h22M35 3l1.2 3.8L40 8l-3.8 1.2L35 13l-1.2-3.8L30 8l3.8-1.2z" />
    </svg>
    <div class="since">{title} · since {clockTime(sleep.Start)}</div>
    <div class="big serif">{duration(asleep)}</div>
    {#if typical}
      <div class="hint">Her naps usually run {duration(typical[0])}–{duration(typical[1])}</div>
    {/if}
    <button class="kind" onclick={() => toggle({ IsNight: !sleep.IsNight })}>
      {sleep.IsNight ? 'Count as a nap' : 'Count as night'}
    </button>
  </section>

  <section class="details">
    <div class="group">
      <span class="label">Where</span>
      <div class="chips">
        {#each places as [value, text] (value)}
          <button class="chip" class:on={sleep.SleepLocation === value}
            onclick={() => toggle({ SleepLocation: sleep.SleepLocation === value ? null : value })}>{text}</button>
        {/each}
      </div>
    </div>
    <div class="divider"></div>
    <div class="group">
      <span class="label">Fell asleep</span>
      <div class="chips">
        {#each onsetChoices as [value, text] (value)}
          <button class="chip" class:on={sleep.SleepOnset === value}
            onclick={() => toggle({ SleepOnset: sleep.SleepOnset === value ? null : value })}>{text}</button>
        {/each}
      </div>
    </div>
  </section>

  <button class="woke" onclick={wokeUp}>
    <Icon name="sun" size={28} stroke="#5A2E1C" width={1.8} />
    Woke up
  </button>
  <TimeInput class="adjust" value={sleep.Start} onchange={adjustStart} label="Sleep start time">
    Adjust start time
  </TimeInput>
</div>

<style>
  .asleep {
    color: var(--surface);
    background: var(--moss-deep);
    min-height: calc(100vh - 72px);
  }

  .date {
    font-size: 13px;
    font-weight: 700;
    color: var(--moss-mist);
    letter-spacing: 0.04em;
  }

  .name {
    font-size: 30px;
    font-weight: 600;
  }

  .moon {
    background: transparent;
    border-color: rgba(252, 249, 243, 0.25);
  }

  .timer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 24px 0 0;
  }

  .since,
  .hint {
    font-size: 15px;
    font-weight: 700;
    color: var(--moss-mist);
  }

  .hint {
    font-size: 14px;
    font-weight: 600;
  }

  .big {
    font-size: 92px;
    font-weight: 400;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .kind {
    min-height: 44px;
    border: 0;
    background: none;
    color: var(--moss-pale);
    font-size: 13px;
    font-weight: 700;
  }

  .details {
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: rgba(252, 249, 243, 0.08);
    border: 1px solid rgba(252, 249, 243, 0.12);
    border-radius: 24px;
    padding: 18px;
  }

  .label {
    font-size: 12px;
    font-weight: 800;
    color: var(--moss-mist);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .chip {
    border-color: rgba(252, 249, 243, 0.3);
    background: transparent;
    color: var(--surface);
  }

  .chip.on {
    background: var(--surface);
    color: var(--moss-deep);
  }

  .divider {
    height: 1px;
    background: rgba(252, 249, 243, 0.12);
  }

  .woke {
    margin-top: auto;
    height: 108px;
    border: 0;
    border-radius: 30px;
    background: var(--peach);
    color: #5A2E1C;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    font-family: var(--serif);
    font-size: 26px;
    font-weight: 600;
  }

  .asleep :global(.adjust) {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--moss-mist);
    font-size: 14px;
    font-weight: 700;
  }
</style>
