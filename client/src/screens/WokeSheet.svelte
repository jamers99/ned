<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import TimeInput from '../components/TimeInput.svelte';
  import { updateEvent } from '../lib/actions.ts';
  import type { BabyEvent, WakeMood } from '../lib/db.ts';
  import { close } from '../lib/nav.svelte.ts';
  import { napNumber, nextSleep, timeAsleep, wakingsDuring, type SleepTargets } from '../lib/sleep.ts';
  import { clock as clockTime, clockShort, day, duration, minute } from '../lib/time.ts';

  let { guid, events, targets }: { guid: string; events: BabyEvent[]; targets: SleepTargets } = $props();

  const sleep = $derived(events.find(e => e.Guid === guid));
  const next = $derived(nextSleep(events, targets));
  const moods: WakeMood[] = ['Happy', 'Fussy', 'Crying'];

  function setStart(start: number) {
    if (!sleep?.End) return;
    void updateEvent(guid, { Start: start > sleep.End ? start - day : start });
  }

  function setEnd(end: number) {
    if (!sleep) return;
    void updateEvent(guid, { End: end < sleep.Start ? end + day : end });
  }
</script>

<Sheet>
  {#if sleep?.End}
    <div class="saved">
      <div class="label">{sleep.IsNight ? 'Night' : `Nap ${napNumber(sleep, events)}`} saved</div>
      <div class="big serif">{duration(timeAsleep(sleep, wakingsDuring(sleep, events), sleep.End))}</div>
    </div>

    <div class="times">
      <TimeInput class="time" value={sleep.Start} onchange={setStart} label="Fell asleep at">
        <span class="time-label">Fell asleep</span>
        <span class="time-value serif">{clockTime(sleep.Start)}</span>
      </TimeInput>
      <TimeInput class="time" value={sleep.End} onchange={setEnd} label="Woke at">
        <span class="time-label">Woke</span>
        <span class="time-value serif">{clockTime(sleep.End)}</span>
      </TimeInput>
    </div>

    <div class="moods">
      <div class="eyebrow">Woke up</div>
      <div class="mood-grid">
        {#each moods as mood (mood)}
          <button class:on={sleep.WakeMood === mood}
            onclick={() => updateEvent(guid, { WakeMood: sleep.WakeMood === mood ? null : mood })}>{mood}</button>
        {/each}
      </div>
    </div>

    {#if next}
      <div class="callout">
        <Icon name="moon" stroke="var(--moss-deep)" width={1.8} />
        <div>
          <div class="callout-title">
            {next.kind === 'nap' ? `Nap ${next.napNumber} window` : 'Bedtime window'}
            {clockShort(next.from)}–{clockTime(next.to)}
          </div>
          <div class="callout-note">
            {next.kind === 'nap' ? 'Wake window' : 'Last wake window of the day'}
            ~{duration(next.targetMinutes * minute)}
          </div>
        </div>
      </div>
    {/if}

    <button class="primary-dark" onclick={close}>Done</button>
  {/if}
</Sheet>

<style>
  .saved {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .label {
    font-size: 14px;
    font-weight: 800;
    color: var(--moss);
  }

  .big {
    font-size: 46px;
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1.05;
  }

  .times {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .times :global(.time) {
    height: 66px;
    border-radius: 18px;
    border: 1px solid var(--line);
    background: var(--ground);
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 16px;
    gap: 2px;
  }

  .time-label {
    font-size: 12px;
    font-weight: 800;
    color: var(--muted);
  }

  .time-value {
    font-size: 22px;
    font-weight: 600;
  }

  .moods {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mood-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .mood-grid button {
    height: 52px;
    border-radius: 16px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 16px;
    font-weight: 700;
  }

  .mood-grid button.on {
    border-color: transparent;
    background: var(--moss);
    color: var(--surface);
    font-weight: 800;
  }

  .callout {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 18px;
    background: var(--moss-soft);
  }

  .callout-title {
    font-size: 15px;
    font-weight: 800;
    color: var(--moss-deep);
  }

  .callout-note {
    font-size: 13px;
    font-weight: 600;
    color: #4E5B43;
  }
</style>
