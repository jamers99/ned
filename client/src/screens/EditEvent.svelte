<script lang="ts">
  import Sheet from '../components/Sheet.svelte';
  import TimeInput from '../components/TimeInput.svelte';
  import { deleteEvent, updateEvent } from '../lib/actions.ts';
  import { db, type BabyEvent, type SettledBy, type Side, type SleepLocation, type SleepOnset, type SolidAmount,
    type WakeMood } from '../lib/db.ts';
  import { amountText, locationText, onsetChoices, settleChoices } from '../lib/describe.ts';
  import { close } from '../lib/nav.svelte.ts';
  import { live } from '../lib/state.svelte.ts';
  import { clock as clockTime, day, duration, endAfter, mediumDate } from '../lib/time.ts';

  let { guid }: { guid: string } = $props();

  const row = live((g: string) => db.events.get(g), undefined as BabyEvent | undefined, () => guid);
  const e = $derived(row.value);

  const titles: Record<BabyEvent['Type'], string> = {
    Sleep: 'Sleep', NightWaking: 'Night waking', Feed: 'Feed', Solids: 'Solids', Note: 'Note'
  };
  const moods: WakeMood[] = ['Happy', 'Fussy', 'Crying'];
  const sides: Side[] = ['Left', 'Right'];

  function set(changes: Partial<BabyEvent>) {
    void updateEvent(guid, changes);
  }

  function setStart(start: number) {
    if (!e) return;
    set({ Start: e.End != null && start > e.End ? start - day : start });
  }

  function setEnd(end: number) {
    if (!e) return;
    set({ End: endAfter(e.Start, end) });
  }

  function remove() {
    if (!e || !confirm(`Delete this ${titles[e.Type].toLowerCase()}?`)) return;
    void deleteEvent(guid);
    close();
  }
</script>

{#snippet choices(label: string, options: [string, string][], value: string | null, onpick: (v: string | null) => void)}
  <div class="group">
    <div class="eyebrow">{label}</div>
    <div class="chips">
      {#each options as [option, text] (option)}
        <button class="chip" class:on={value === option} onclick={() => onpick(value === option ? null : option)}>
          {text}
        </button>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet stepper(label: string, text: string, onstep: (direction: number) => void)}
  <div class="stepper">
    <span class="eyebrow">{label}</span>
    <button class="round-button" aria-label="{label} less" onclick={() => onstep(-1)}>−</button>
    <span class="serif step-value">{text}</span>
    <button class="round-button" aria-label="{label} more" onclick={() => onstep(1)}>+</button>
  </div>
{/snippet}

<Sheet>
  {#if e}
    <div class="heading">
      <div class="screen-title">
        {e.Type === 'Sleep' ? (e.IsNight ? 'Night' : 'Nap') : e.FeedKind === 'Bottle' ? 'Bottle' : titles[e.Type]}
      </div>
      <div class="date">{mediumDate(e.Start)}{e.LoggedBy ? ` · ${e.LoggedBy}` : ''}</div>
    </div>

    <div class="times">
      <TimeInput class="time" value={e.Start} onchange={setStart} label="Start time">
        <span class="time-label">{e.Type === 'Sleep' ? 'Fell asleep' : 'Started'}</span>
        <span class="time-value">{clockTime(e.Start)}</span>
      </TimeInput>
      {#if (e.Type === 'Sleep' || e.Type === 'NightWaking') && e.End != null}
        <TimeInput class="time" value={e.End} onchange={setEnd} label="End time">
          <span class="time-label">{e.Type === 'Sleep' ? 'Woke' : 'Back asleep'}</span>
          <span class="time-value">{clockTime(e.End)}</span>
        </TimeInput>
      {/if}
    </div>

    {#if e.Type === 'Sleep'}
      {@render choices('Kind', [['nap', 'Nap'], ['night', 'Night']], e.IsNight ? 'night' : 'nap',
        v => v && set({ IsNight: v === 'night' }))}
      {@render choices('Where', Object.entries(locationText), e.SleepLocation,
        v => set({ SleepLocation: v as SleepLocation | null }))}
      {@render choices('Fell asleep', onsetChoices, e.SleepOnset, v => set({ SleepOnset: v as SleepOnset | null }))}
      {@render choices('Woke up', moods.map(m => [m, m]), e.WakeMood, v => set({ WakeMood: v as WakeMood | null }))}
    {:else if e.Type === 'NightWaking'}
      {@render choices('Back to sleep by', settleChoices, e.SettledBy, v => set({ SettledBy: v as SettledBy | null }))}
    {:else if e.Type === 'Feed' && e.FeedKind === 'Bottle'}
      {@render stepper('Amount', `${e.BottleOz ?? 0} oz`, d => set({ BottleOz: Math.max(0, (e.BottleOz ?? 0) + d / 2) }))}
    {:else if e.Type === 'Feed'}
      {@render stepper('Left', duration(e.LeftSeconds * 1000), d => set({ LeftSeconds: Math.max(0, e.LeftSeconds + d * 60) }))}
      {@render stepper('Right', duration(e.RightSeconds * 1000), d => set({ RightSeconds: Math.max(0, e.RightSeconds + d * 60) }))}
      {@render choices('Started on', sides.map(s => [s, s]), e.StartSide, v => set({ StartSide: v as Side | null }))}
    {:else if e.Type === 'Solids'}
      <div class="group">
        <div class="eyebrow">Foods · tap to remove</div>
        <div class="chips">
          {#each e.Foods as food (food)}
            <button class="chip on" onclick={() => set({ Foods: e.Foods.filter(f => f !== food) })}>{food}</button>
          {/each}
        </div>
      </div>
      {@render choices('How much', Object.entries(amountText), e.SolidAmount,
        v => set({ SolidAmount: v as SolidAmount | null }))}
    {/if}

    <div class="group">
      <div class="eyebrow">Note</div>
      <textarea rows="2" aria-label="Note" value={e.Text} onchange={ev => set({ Text: ev.currentTarget.value.trim() })}
        placeholder="Add a note"></textarea>
    </div>

    <div class="actions">
      <button class="delete" onclick={remove}>Delete</button>
      <button class="primary-dark" onclick={close}>Done</button>
    </div>
  {/if}
</Sheet>

<style>
  .heading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .date {
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .stepper .eyebrow {
    flex: 1;
  }

  .step-value {
    min-width: 72px;
    text-align: center;
    font-size: 20px;
    font-weight: 600;
  }

  textarea {
    width: 100%;
    border-radius: 16px;
    border: 1px solid var(--line);
    background: var(--ground);
    padding: 12px 14px;
    font-size: 16px;
    font-weight: 600;
    resize: none;
    outline: 0;
  }

  .actions {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
  }
</style>
