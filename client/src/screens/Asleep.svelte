<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import TimeInput from '../components/TimeInput.svelte';
  import { endFeed, startRunning, updateEvent } from '../lib/actions.ts';
  import type { BabyEvent, SettledBy, SleepLocation } from '../lib/db.ts';
  import { locationText, nursedSeconds, onsetChoices } from '../lib/describe.ts';
  import { appear } from '../lib/motion.ts';
  import { open } from '../lib/nav.svelte.ts';
  import { napNumber, timeAsleep, typicalNapRange, wakingsDuring } from '../lib/sleep.ts';
  import { clock } from '../lib/state.svelte.ts';
  import { clock as clockTime, day, duration, longDate, stopwatch } from '../lib/time.ts';

  // A nap is stop and start: Woke up ends it. A night has wakings in it, and ends with Up for the day.
  let { sleep, events }: { sleep: BabyEvent; events: BabyEvent[] } = $props();

  const now = $derived(clock.now);
  const wakings = $derived(wakingsDuring(sleep, events));
  const waking = $derived(wakings.find(w => w.End == null));
  const title = $derived(sleep.IsNight ? 'Night' : `Nap ${napNumber(sleep, events)}`);
  const typical = $derived(sleep.IsNight ? null : typicalNapRange(events, now));

  // What she's had during this waking: a feed settles her "by feeding" without asking.
  const during = $derived(waking ? events.filter(e => e.Start >= waking.Start && e.Type !== 'NightWaking' && e.Type !== 'Sleep') : []);
  const feeding = $derived(during.find(e => e.Type === 'Feed' && e.End == null));
  const logged = $derived(during.filter(e => e.End != null).map(e =>
    e.Type !== 'Feed' ? e.Type : e.FeedKind === 'Bottle' ? `${e.BottleOz ?? 0} oz bottle` : `Nursed ${duration(nursedSeconds(e, now) * 1000)}`));
  const fed = $derived(feeding != null || during.some(e => e.Type === 'Feed'));

  const places = Object.entries(locationText) as [SleepLocation, string][];

  function toggle(changes: Partial<BabyEvent>) {
    void updateEvent(sleep.Guid, changes);
  }

  function settled(by: SettledBy) {
    const at = Date.now();
    if (feeding) void endFeed(feeding, at);
    void updateEvent(waking!.Guid, { End: at, SettledBy: by });
  }

  function wokeUp() {
    const end = Date.now();
    if (waking) void updateEvent(waking.Guid, { End: end });
    void updateEvent(sleep.Guid, { End: end });
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
  </header>

  {#if waking}
    <!-- A night waking: log what she needs, then put her back to sleep. -->
    <section class="timer">
      <div class="dim">Waking {wakings.length} · awake for</div>
      <div class="big serif">{duration(now - waking.Start)}</div>
      <div class="dim small">Slept {duration(timeAsleep(sleep, wakings, waking.Start))} before this</div>
    </section>

    <button class="huge feed" onclick={() => open({ kind: 'feed' })}>
      {feeding ? `Feeding · ${stopwatch(nursedSeconds(feeding, now) * 1000)}` : fed ? 'Feed again' : 'Feed'}
    </button>
    <div class="row">
      <button class="quiet" onclick={() => open({ kind: 'solids' })}>Solids</button>
      <button class="quiet" onclick={() => open({ kind: 'note' })}>Note</button>
    </div>
    {#if logged.length}<div class="dim small logged">{logged.join(' · ')}</div>{/if}

    <div class="label">Back asleep</div>
    {#if fed}
      <button class="huge" onclick={() => settled('Feeding')}>Back asleep</button>
    {:else}
      <div class="row">
        <button class="huge" onclick={() => settled('Soothing')}>Soothing</button>
        <button class="huge" onclick={() => settled('Own')}>On her own</button>
      </div>
    {/if}
  {:else}
    <section class="timer">
      <svg aria-hidden="true" width="70" height="18" viewBox="0 0 70 18" fill="none" stroke="var(--moss-pale)"
        stroke-width="1.4" stroke-linecap="round">
        <path d="M2 9h22M46 9h22M35 3l1.2 3.8L40 8l-3.8 1.2L35 13l-1.2-3.8L30 8l3.8-1.2z" />
      </svg>
      <div class="dim">{title} · since {clockTime(sleep.Start)}</div>
      <div class="big serif">{duration(timeAsleep(sleep, wakings, now))}</div>
      {#if typical}
        <div class="dim small">Her naps usually run {duration(typical[0])}–{duration(typical[1])}</div>
      {:else if sleep.IsNight}
        <div class="dim small">
          {wakings.length === 0 ? 'No wakings yet' : `${wakings.length} ${wakings.length === 1 ? 'waking' : 'wakings'} so far`}
        </div>
      {/if}
    </section>

    <!-- Where and how she fell asleep matter at bedtime; after a waking they'd only push Up for the day down. -->
    {#if wakings.length === 0}
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
    {/if}

    <button class="woke" onclick={sleep.IsNight ? () => startRunning({ Type: 'NightWaking', Start: Date.now() }) : wokeUp}>
      <Icon name={sleep.IsNight ? 'moonStar' : 'sun'} size={28} stroke="var(--peach-text)" width={1.8} />
      {sleep.IsNight ? "She's awake" : 'Woke up'}
    </button>
    <TimeInput class="adjust" value={sleep.Start} onchange={adjustStart} label="Sleep start time">
      Adjust start time
    </TimeInput>
  {/if}

  {#if sleep.IsNight}
    <button class="quiet" class:last={waking} onclick={wokeUp}>
      <Icon name="sun" size={20} stroke="currentColor" width={1.8} />
      Up for the day
    </button>
  {/if}
</div>

<style>
  .asleep {
    color: var(--on-sleep);
    background: var(--sleep-bg);
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

  .timer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 24px 0 0;
  }

  .dim {
    font-size: 15px;
    font-weight: 700;
    color: var(--moss-mist);
  }

  .small {
    font-size: 14px;
    font-weight: 600;
  }

  .logged {
    text-align: center;
  }

  .big {
    font-size: 92px;
    font-weight: 400;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .details {
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: var(--sleep-tint);
    border: 1px solid var(--sleep-line);
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
    border-color: var(--sleep-edge);
    background: transparent;
    color: var(--on-sleep);
  }

  .chip.on {
    background: var(--on-sleep);
    color: var(--sleep-bg);
  }

  .divider {
    height: 1px;
    background: var(--sleep-line);
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

  .huge {
    min-height: 96px;
    border-radius: 28px;
    border: 1px solid var(--sleep-line);
    background: var(--sleep-tint);
    color: var(--on-sleep);
    font-family: var(--serif);
    font-size: 24px;
    font-weight: 600;
  }

  .huge.feed {
    min-height: 120px;
    font-size: 28px;
  }

  .row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .quiet {
    min-height: 60px;
    border: 1px solid var(--sleep-edge);
    border-radius: 22px;
    background: transparent;
    color: var(--on-sleep);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 17px;
    font-weight: 700;
  }

  .quiet.last {
    margin-top: auto;
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
