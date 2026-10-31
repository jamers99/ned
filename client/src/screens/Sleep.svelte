<script lang="ts">
  import { baby, capital } from '../lib/baby.svelte.ts';
  import AddWaking from '../components/AddWaking.svelte';
  import Icon from '../components/Icon.svelte';
  import Overlay from '../components/Overlay.svelte';
  import TimeInput from '../components/TimeInput.svelte';
  import { deleteEvent, endFeed, startRunning, updateEvent, updateSleep } from '../lib/actions.ts';
  import type { BabyEvent, SettledBy, SleepLocation } from '../lib/db.ts';
  import { locationText, nursedSeconds, onsetChoices } from '../lib/describe.ts';
  import { closeAll, open } from '../lib/nav.svelte.ts';
  import {
    askStillAsleep, latestRunning, napNumber, timeAsleep, typicalNapRange, wakingsDuring
  } from '../lib/sleep.ts';
  import { clock, stillAsleep } from '../lib/state.svelte.ts';
  import { clock as clockTime, clockShort, day, duration, endAfter, minute, stopwatch } from '../lib/time.ts';

  // A drawer like Feed: the Sleep button starts the sleep, and this follows it and ends it.
  // A nap is stop and start: Woke up ends it. A night has wakings in it, and ends with Up for the day.
  let { events }: { events: BabyEvent[] } = $props();

  const now = $derived(clock.now);
  const sleep = $derived(latestRunning(events, 'Sleep'));
  const wakings = $derived(sleep ? wakingsDuring(sleep, events) : []);
  const waking = $derived(wakings.find(w => w.End == null));
  const title = $derived(!sleep ? 'Sleep' : sleep.IsNight ? 'Night' : `Nap ${napNumber(sleep, events)}`);
  const typical = $derived(sleep && !sleep.IsNight ? typicalNapRange(events, now) : null);
  const askAwake = $derived(sleep != null &&
    askStillAsleep(sleep, events, now, stillAsleep.guid === sleep.Guid ? stillAsleep.at : 0));

  // What she's had during this waking: a feed settles her "by feeding" without asking.
  const during = $derived(waking ? events.filter(e => e.Start >= waking.Start && e.Type !== 'NightWaking' && e.Type !== 'Sleep') : []);
  const feeding = $derived(during.find(e => e.Type === 'Feed' && e.End == null));
  const logged = $derived(during.filter(e => e.End != null).map(e =>
    e.Type !== 'Feed' ? e.Type : e.FeedKind === 'Bottle' ? `${e.BottleOz ?? 0} oz bottle` : `Nursed ${duration(nursedSeconds(e, now) * 1000)}`));
  const fed = $derived(feeding != null || during.some(e => e.Type === 'Feed'));

  const places = Object.entries(locationText) as [SleepLocation, string][];

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
    // Up for the day during a waking: she never went back to sleep, so the night ended when she woke.
    void updateSleep(sleep.Guid, { End: waking ? waking.Start : end });
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

  /**
   * For a sleep started by mistake: deletes it with any wakings logged in it. Feeds stay; they happened.
   * Asks first unless it was only just started.
   */
  function deleteSleep() {
    if (!sleep) return;
    if (Date.now() - sleep.Start > 5 * minute && !confirm(`Delete this ${sleep.IsNight ? 'night' : 'nap'}?`))
      return;
    for (const w of wakings) void deleteEvent(w.Guid);
    void deleteEvent(sleep.Guid);
    closeAll();
  }

  const earlier = (start: number) => (start > Date.now() ? start - day : start);

  let adding = $state(false);
</script>

<Overlay {title}>
  {#if sleep && waking}
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

    <button class="huge feed" onclick={() => open({ kind: 'feed', back: { kind: 'sleep' } })}>
      {feeding ? `Feeding · ${stopwatch(nursedSeconds(feeding, now) * 1000)}` : fed ? 'Feed again' : 'Feed'}
    </button>
    <div class="row">
      <button class="quiet" onclick={() => open({ kind: 'solids', back: { kind: 'sleep' } })}>Solids</button>
      <button class="quiet" onclick={() => open({ kind: 'note', back: { kind: 'sleep' } })}>Note</button>
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
  {:else if sleep}
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
            {#each onsetChoices() as [value, text] (value)}
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
      <TimeInput class="pill" value={sleep.Start} onchange={t => updateSleep(sleep.Guid, { Start: earlier(t) })}
        label="Sleep start time">
        Started {clockShort(sleep.Start)}
      </TimeInput>
      {#if sleep.IsNight && !adding}
        <button class="pill" onclick={() => (adding = true)}>Add a waking</button>
      {/if}
      <button class="pill delete" onclick={deleteSleep}>Delete</button>
    </div>

    {#if adding}<AddWaking {sleep} {now} onclose={() => (adding = false)} />{/if}
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

  .up {
    color: var(--muted);
  }

  .delete {
    color: var(--terra-text);
  }
</style>
