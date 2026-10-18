<script lang="ts">
  import { baby, capital } from '../lib/baby.ts';
  import Icon from '../components/Icon.svelte';
  import Overlay from '../components/Overlay.svelte';
  import TimeInput from '../components/TimeInput.svelte';
  import { addEvent, endFeed, startRunning, startSleep, updateEvent } from '../lib/actions.ts';
  import type { BabyEvent, SettledBy, SleepLocation } from '../lib/db.ts';
  import { locationText, nursedSeconds, onsetChoices, settleChoices } from '../lib/describe.ts';
  import { open } from '../lib/nav.svelte.ts';
  import {
    askStillAsleep, isNightTime, latestRunning, napNumber, nextSleep, pastWaking, timeAsleep, typicalNapRange,
    wakingsDuring, type SleepTargets
  } from '../lib/sleep.ts';
  import { clock, stillAsleep } from '../lib/state.svelte.ts';
  import { clock as clockTime, clockShort, day, duration, endAfter, minute, stopwatch } from '../lib/time.ts';

  // A drawer like Feed: start a sleep (now, or earlier if it was missed), follow it, and end it.
  // A nap is stop and start: Woke up ends it. A night has wakings in it, and ends with Up for the day.
  let { events, targets }: { events: BabyEvent[]; targets: SleepTargets } = $props();

  const now = $derived(clock.now);
  const sleep = $derived(latestRunning(events, 'Sleep'));
  const wakings = $derived(sleep ? wakingsDuring(sleep, events) : []);
  const waking = $derived(wakings.find(w => w.End == null));
  const title = $derived(!sleep ? 'Sleep' : sleep.IsNight ? 'Night' : `Nap ${napNumber(sleep, events)}`);
  const typical = $derived(sleep && !sleep.IsNight ? typicalNapRange(events, now) : null);
  const askAwake = $derived(sleep != null &&
    askStillAsleep(sleep, events, now, stillAsleep.guid === sleep.Guid ? stillAsleep.at : 0));

  // Before it starts: when she fell asleep. Now, unless it was missed and picked on the wheel.
  let fellAsleepAt = $state<number | null>(null);
  const startAt = $derived(fellAsleepAt ?? now);
  const startsNight = $derived(isNightTime(startAt, targets));
  const next = $derived(sleep ? null : nextSleep(events, targets));

  // What she's had during this waking: a feed settles her "by feeding" without asking.
  const during = $derived(waking ? events.filter(e => e.Start >= waking.Start && e.Type !== 'NightWaking' && e.Type !== 'Sleep') : []);
  const feeding = $derived(during.find(e => e.Type === 'Feed' && e.End == null));
  const logged = $derived(during.filter(e => e.End != null).map(e =>
    e.Type !== 'Feed' ? e.Type : e.FeedKind === 'Bottle' ? `${e.BottleOz ?? 0} oz bottle` : `Nursed ${duration(nursedSeconds(e, now) * 1000)}`));
  const fed = $derived(feeding != null || during.some(e => e.Type === 'Feed'));

  const places = Object.entries(locationText) as [SleepLocation, string][];

  function pickStart(start: number) {
    fellAsleepAt = start > Date.now() ? start - day : start;
  }

  function start() {
    void startSleep(fellAsleepAt ?? Date.now(), startsNight);
    fellAsleepAt = null;
  }

  function toggle(changes: Partial<BabyEvent>) {
    if (sleep) void updateEvent(sleep.Guid, changes);
  }

  function settled(by: SettledBy) {
    const at = Date.now();
    if (feeding) void endFeed(feeding, at);
    void updateEvent(waking!.Guid, { End: at, SettledBy: by });
  }

  function wokeUp(end = Date.now()) {
    if (!sleep) return;
    if (waking) void updateEvent(waking.Guid, { End: end });
    void updateEvent(sleep.Guid, { End: end });
    open({ kind: 'woke', guid: sleep.Guid });
  }

  /** Woke up was missed: ends the nap at the time picked, never later than now. */
  function wokeAt(picked: number) {
    if (sleep) wokeUp(Math.min(Date.now(), endAfter(sleep.Start, picked)));
  }

  function keepSleeping() {
    stillAsleep.guid = sleep!.Guid;
    stillAsleep.at = Date.now();
  }

  const earlier = (start: number) => (start > Date.now() ? start - day : start);

  // A waking that wasn't logged at the time: two time wheels and how she settled.
  let adding = $state(false);
  let addFrom = $state(0);
  let addTo = $state(0);
  let addBy = $state<SettledBy | null>(null);
  const added = $derived(sleep && adding ? pastWaking(sleep, addFrom, addTo, now) : null);

  function beginAdding() {
    addFrom = Math.max(sleep!.Start + minute, Date.now() - 45 * minute);
    addTo = Math.min(Date.now(), addFrom + 15 * minute);
    addBy = null;
    adding = true;
  }

  function saveWaking() {
    if (!added) return;
    void addEvent({ Type: 'NightWaking', ...added, SettledBy: addBy });
    adding = false;
  }
</script>

<Overlay {title}>
  {#if !sleep}
    <!-- Starting: one tap for now; a sleep that was missed can start earlier. -->
    {#if next}
      <div class="callout">
        <Icon name="moon" stroke="var(--moss-deep)" width={1.8} />
        <div>
          <div class="callout-title">
            {#if next.kind === 'nap'}Nap {next.napNumber} window {clockShort(next.from)}–{clockTime(next.to)}
            {:else}Bedtime {clockTime(next.from)}{/if}
          </div>
          <div class="callout-note">Awake {duration(now - next.awakeSince)}</div>
        </div>
      </div>
    {/if}

    <div class="fell-asleep">
      <TimeInput class="time" value={startAt} onchange={pickStart} label="Fell asleep at">
        <span class="time-label">Fell asleep</span>
        <span class="time-value">{fellAsleepAt == null ? 'Now' : clockTime(fellAsleepAt)}</span>
      </TimeInput>
      {#if fellAsleepAt != null}
        <button class="pill" onclick={() => (fellAsleepAt = null)}>Use now</button>
      {/if}
    </div>

    <button class="start" onclick={start}>
      <Icon name="moonStar" size={28} stroke="var(--on-moss)" width={1.8} />
      {startsNight ? 'Start night' : 'Start nap'}
    </button>
  {:else if waking}
    <!-- A night waking: log what she needs, then put her back to sleep. -->
    <section class="timer">
      <div class="dim">Waking {wakings.length} · awake for</div>
      <div class="big serif">{duration(now - waking.Start)}</div>
      <div class="dim small">Slept {duration(timeAsleep(sleep, wakings, waking.Start))} before this</div>
      <TimeInput class="adjust" value={waking.Start} onchange={t => updateEvent(waking.Guid, { Start: earlier(t) })}
        label="Woke at">
        Woke {clockTime(waking.Start)} · change
      </TimeInput>
    </section>

    <button class="huge feed" onclick={() => open({ kind: 'feed' })}>
      {feeding ? `Feeding · ${stopwatch(nursedSeconds(feeding, now) * 1000)}` : fed ? 'Feed again' : 'Feed'}
    </button>
    <div class="row">
      <button class="quiet" onclick={() => open({ kind: 'solids' })}>Solids</button>
      <button class="quiet" onclick={() => open({ kind: 'note' })}>Note</button>
    </div>
    {#if logged.length}<div class="dim small logged">{logged.join(' · ')}</div>{/if}

    <div class="eyebrow">Back asleep</div>
    {#if fed}
      <button class="huge settle" onclick={() => settled('Feeding')}>Back asleep</button>
    {:else}
      <div class="row">
        <button class="huge settle" onclick={() => settled('Soothing')}>Soothing</button>
        <button class="huge settle" onclick={() => settled('Own')}>On {baby.their} own</button>
      </div>
    {/if}
  {:else}
    <section class="timer">
      <div class="dim">Asleep since {clockTime(sleep.Start)}</div>
      <div class="big serif">{duration(timeAsleep(sleep, wakings, now))}</div>
      {#if typical}
        <div class="dim small">{capital(baby.their)} naps usually run {duration(typical[0])}–{duration(typical[1])}</div>
      {:else if sleep.IsNight}
        <div class="dim small">
          {wakings.length === 0 ? 'No wakings yet' : `${wakings.length} ${wakings.length === 1 ? 'waking' : 'wakings'} so far`}
        </div>
      {/if}
    </section>

    {#if askAwake}
      <!-- Woke up may have been missed. Ask gently; either answer is one tap. -->
      <section class="ask">
        <div class="ask-title">Still asleep?</div>
        <div class="ask-note">
          This nap has run {duration(now - sleep.Start)}{typical ? `, longer than ${baby.their} usual ${duration(typical[1])}` : ''}.
        </div>
        <div class="row">
          <button class="pill" onclick={keepSleeping}>Still asleep</button>
          <TimeInput class="pill woke-at" value={Math.min(now, sleep.Start + (typical?.[1] ?? 0))} onchange={wokeAt}
            label="Woke at">
            Woke at…
          </TimeInput>
        </div>
      </section>
    {/if}

    <!-- Where and how she fell asleep matter at bedtime; after a waking they'd only push Up for the day down. -->
    {#if wakings.length === 0}
      <section class="details card">
        <div class="group">
          <span class="eyebrow">Where</span>
          <div class="chips">
            {#each places as [value, text] (value)}
              <button class="chip" class:on={sleep.SleepLocation === value}
                onclick={() => toggle({ SleepLocation: sleep.SleepLocation === value ? null : value })}>{text}</button>
            {/each}
          </div>
        </div>
        <div class="divider"></div>
        <div class="group">
          <span class="eyebrow">Fell asleep</span>
          <div class="chips">
            {#each onsetChoices as [value, text] (value)}
              <button class="chip" class:on={sleep.SleepOnset === value}
                onclick={() => toggle({ SleepOnset: sleep.SleepOnset === value ? null : value })}>{text}</button>
            {/each}
          </div>
        </div>
      </section>
    {/if}

    <button class="woke" onclick={sleep.IsNight ? () => startRunning({ Type: 'NightWaking', Start: Date.now() }) : () => wokeUp()}>
      <Icon name={sleep.IsNight ? 'moonStar' : 'sun'} size={28} stroke="var(--peach-text)" width={1.8} />
      {sleep.IsNight ? `${capital(baby.theyre)} awake` : 'Woke up'}
    </button>

    <div class="adjust-row">
      <TimeInput class="pill" value={sleep.Start} onchange={t => updateEvent(sleep.Guid, { Start: earlier(t) })}
        label="Sleep start time">
        Started {clockShort(sleep.Start)}
      </TimeInput>
      {#if sleep.IsNight && !adding}
        <button class="pill" onclick={beginAdding}>Add a waking</button>
      {/if}
    </div>

    {#if adding}
      <!-- A waking that happened but wasn't logged. -->
      <section class="add card">
        <div class="eyebrow">Add a waking</div>
        <div class="times">
          <TimeInput class="time" value={added?.Start ?? addFrom} onchange={t => (addFrom = t)} label="Woke at">
            <span class="time-label">Woke</span>
            <span class="time-value">{clockTime(added?.Start ?? addFrom)}</span>
          </TimeInput>
          <TimeInput class="time" value={added?.End ?? addTo} onchange={t => (addTo = t)} label="Back asleep at">
            <span class="time-label">Back asleep</span>
            <span class="time-value">{clockTime(added?.End ?? addTo)}</span>
          </TimeInput>
        </div>
        <div class="chips">
          {#each settleChoices as [value, text] (value)}
            <button class="chip" class:on={addBy === value} onclick={() => (addBy = addBy === value ? null : value)}>{text}</button>
          {/each}
        </div>
        <div class="row">
          <button class="quiet" onclick={() => (adding = false)}>Cancel</button>
          <button class="quiet save" disabled={!added} onclick={saveWaking}>Save waking</button>
        </div>
      </section>
    {/if}
  {/if}

  {#if sleep?.IsNight}
    <button class="quiet up" onclick={() => wokeUp()}>
      <Icon name="sun" size={20} stroke="currentColor" width={1.8} />
      Up for the day
    </button>
  {/if}
</Overlay>

<style>
  .timer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 8px 0 0;
  }

  .dim {
    font-size: 15px;
    font-weight: 700;
    color: var(--muted);
  }

  .small {
    font-size: 14px;
    font-weight: 600;
  }

  .logged {
    text-align: center;
  }

  .big {
    font-size: 76px;
    font-weight: 400;
    letter-spacing: -0.04em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
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
    color: var(--moss-callout-note);
  }

  .fell-asleep {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .fell-asleep :global(.time) {
    flex: 1;
    height: 66px;
    border-radius: 18px;
    border: 1px solid var(--line);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 16px;
    gap: 2px;
  }

  .start {
    margin-top: auto;
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

  .ask {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    border-radius: 20px;
    border: 1px solid var(--terra-soft);
    background: var(--surface);
  }

  .ask-title {
    font-family: var(--serif);
    font-size: 20px;
    font-weight: 600;
    color: var(--terra-text);
  }

  .ask-note {
    font-size: 14px;
    color: var(--muted);
  }

  .ask .pill,
  .ask :global(.woke-at) {
    justify-content: center;
  }

  .details {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
  }

  /* Sleep chips are moss, not the feed terracotta. */
  .chip.on {
    background: var(--moss);
    color: var(--on-moss);
  }

  .divider {
    height: 1px;
    background: var(--line);
  }

  .woke {
    margin-top: auto;
    height: 108px;
    border: 0;
    border-radius: 30px;
    background: var(--peach);
    color: var(--peach-text);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    font-family: var(--serif);
    font-size: 26px;
    font-weight: 600;
  }

  .adjust-row {
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .timer :global(.adjust) {
    min-height: 44px;
    display: flex;
    align-items: center;
    color: var(--muted);
    font-size: 14px;
    font-weight: 700;
  }

  .add {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
  }

  .huge {
    min-height: 96px;
    border-radius: 28px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-family: var(--serif);
    font-size: 24px;
    font-weight: 600;
  }

  .huge.feed {
    min-height: 120px;
    border: 0;
    background: var(--feed-fill);
    color: var(--on-feed-fill);
    font-size: 28px;
    box-shadow: var(--feed-shadow);
  }

  .huge.settle {
    border: 0;
    background: var(--moss);
    color: var(--on-moss);
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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 17px;
    font-weight: 700;
  }

  .quiet.save {
    border-color: transparent;
    background: var(--moss);
    color: var(--on-moss);
    font-weight: 800;
  }

  .up {
    color: var(--muted);
  }
</style>
