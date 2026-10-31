<script lang="ts">
  import { untrack } from 'svelte';
  import TimeInput from './TimeInput.svelte';
  import { addEvent } from '../lib/actions.ts';
  import type { BabyEvent, SettledBy } from '../lib/db.ts';
  import { settleChoices } from '../lib/describe.ts';
  import { pastWaking } from '../lib/sleep.ts';
  import { clock as clockTime, minute } from '../lib/time.ts';

  // A waking that happened but wasn't logged at the time: two time wheels and how she settled.
  // Used in the sleep drawer while a night runs, and in a night's edit sheet on the Day screen afterwards.
  let { sleep, now, onclose }: { sleep: BabyEvent; now: number; onclose: () => void } = $props();

  // A running night starts from a waking a little while ago; a past night from the middle of it.
  const fiveMinutes = 5 * minute;
  // Taken once, when the card opens.
  const [initialFrom, initialTo] = untrack(() => {
    const from = sleep.End == null
      ? Math.max(sleep.Start + minute, Date.now() - 45 * minute)
      : Math.round((sleep.Start + (sleep.End - sleep.Start) / 2) / fiveMinutes) * fiveMinutes;
    return [from, Math.min(sleep.End ?? Date.now(), from + 15 * minute)];
  });

  let from = $state(initialFrom);
  let to = $state(initialTo);
  let by = $state<SettledBy | null>(null);
  const added = $derived(pastWaking(sleep, from, to, now));

  function save() {
    if (!added) return;
    void addEvent({ Type: 'NightWaking', ...added, SettledBy: by });
    onclose();
  }
</script>

<section class="add card">
  <div class="eyebrow">Add a waking</div>
  <div class="times">
    <TimeInput class="time" value={added?.Start ?? from} onchange={t => (from = t)} label="Woke at">
      <span class="time-label">Woke</span>
      <span class="time-value">{clockTime(added?.Start ?? from)}</span>
    </TimeInput>
    <TimeInput class="time" value={added?.End ?? to} onchange={t => (to = t)} label="Back asleep at">
      <span class="time-label">Back asleep</span>
      <span class="time-value">{clockTime(added?.End ?? to)}</span>
    </TimeInput>
  </div>
  <div class="chips">
    {#each settleChoices() as [value, text] (value)}
      <button class="chip" class:on={by === value} onclick={() => (by = by === value ? null : value)}>{text}</button>
    {/each}
  </div>
  <div class="row">
    <button class="quiet" onclick={onclose}>Cancel</button>
    <button class="quiet save" disabled={!added} onclick={save}>Save waking</button>
  </div>
</section>

<style>
  .add {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
  }

  .row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .quiet {
    min-height: 60px;
    border: 1px solid var(--line);
    border-radius: 22px;
    background: var(--surface);
    font-size: 17px;
    font-weight: 700;
  }

  .quiet.save {
    border-color: transparent;
    background: var(--moss);
    color: var(--on-moss);
    font-weight: 800;
  }
</style>
