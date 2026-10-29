<script lang="ts">
  import { baby } from '../lib/baby.svelte.ts';
  import Icon from '../components/Icon.svelte';
  import TodayStrip from '../components/TodayStrip.svelte';
  import type { BabyEvent } from '../lib/db.ts';
  import { startRunning } from '../lib/actions.ts';
  import { nursedSeconds } from '../lib/describe.ts';
  import { appear } from '../lib/motion.ts';
  import { open } from '../lib/nav.svelte.ts';
  import {
    askStillAsleep, isNightTime, latestRunning, napNumber, nextSleep, timeAsleep, typicalNapRange, wakingsDuring,
    type SleepTargets
  } from '../lib/sleep.ts';
  import { clock, live, status, stillAsleep } from '../lib/state.svelte.ts';
  import { lastSyncedText, oldestUnpushed, syncIsStale } from '../lib/sync.ts';
  import { clockShort, clock as clockTime, duration, longDate, minute, stopwatch } from '../lib/time.ts';

  // Sleep and feeds weigh the same here: two big buttons, each opening its drawer and showing when it's running.
  let { events, targets }: { events: BabyEvent[]; targets: SleepTargets } = $props();

  const now = $derived(clock.now);
  const sleeping = $derived(latestRunning(events, 'Sleep'));
  const feeding = $derived(latestRunning(events, 'Feed'));
  const next = $derived(nextSleep(events, targets, now));

  const wakings = $derived(sleeping ? wakingsDuring(sleeping, events) : []);
  const waking = $derived(wakings.find(w => w.End == null));
  const sleepTitle = $derived(!sleeping ? 'Sleep' : sleeping.IsNight ? 'Night' : `Nap ${napNumber(sleeping, events)}`);
  const asleepFor = $derived(sleeping ? timeAsleep(sleeping, wakings, now) : 0);
  const typical = $derived(sleeping && !sleeping.IsNight ? typicalNapRange(events, now) : null);
  const askAwake = $derived(sleeping != null &&
    askStillAsleep(sleeping, events, now, stillAsleep.guid === sleeping.Guid ? stillAsleep.at : 0));

  const awakeFor = $derived(next ? now - next.awakeSince : 0);
  const barSpan = $derived(next ? next.to - next.awakeSince + 20 * minute : 1);

  // The last feed and the last solids, timed from when they started, like the gap between feeds is usually counted.
  const lastFeed = $derived(events.filter(e => e.Type === 'Feed' && e.End != null).at(-1));
  const lastSolids = $derived(events.filter(e => e.Type === 'Solids').at(-1));
  const ago = (at: number) => (now - at < minute ? 'just now' : `${duration(now - at)} ago`);

  // A quiet cloud beside Settings that only stands out when the other phone may be missing something.
  const unpushed = live(oldestUnpushed, null);
  const stale = $derived(syncIsStale(unpushed.value, now));
  const synced = $derived(lastSyncedText(now));
  // While a sync is moving data, an arrow inside the cloud says which way.
  const moving = $derived(status.direction === 'up' ? 'Uploading changes' : status.direction === 'down' ? 'Downloading changes' : '');

  // One tap starts the sleep at now; the drawer that opens can move its start earlier, like Feed's.
  async function sleepTapped() {
    if (!sleeping) await startRunning({ Type: 'Sleep', Start: Date.now(), IsNight: isNightTime(Date.now(), targets) });
    open({ kind: 'sleep' });
  }
</script>

<div class="screen" in:appear|global>
  <header class="screen-header">
    <div>
      <div class="date">{longDate(now)}</div>
      <div class="name">
        <span class="serif">{baby.name}</span>
        <Icon name="sprig" size={24} stroke="var(--moss)" width={1.5} />
      </div>
    </div>
    <div class="header-buttons">
      {#if status.user}
        <button class="sync" class:stale class:moving={moving !== ''}
          aria-label={moving || (stale ? `Not synced. ${synced}` : synced)} onclick={() => open({ kind: 'settings' })}>
          <Icon name={status.direction === 'up' ? 'cloudUp' : status.direction === 'down' ? 'cloudDown' : 'cloud'}
            size={18} width={stale ? 2 : 1.5} />
          {#if stale}<span class="stale-dot"></span>{/if}
        </button>
      {/if}
      <button class="round-button" aria-label="Settings" onclick={() => open({ kind: 'settings' })}>
        <Icon name="sliders" size={20} />
      </button>
    </div>
  </header>

  {#if sleeping}
    <!-- Asleep: the card follows the sleep, and tapping it opens the sleep drawer. -->
    <button class="card status" onclick={() => open({ kind: 'sleep' })}>
      <span class="since">
        {#if waking}
          <span class="dot"></span>
          <span class="awake-label">Awake</span>
          <span>waking {wakings.length} · since {clockTime(waking.Start)}</span>
        {:else}
          <span class="dot asleep"></span>
          <span class="asleep-label">Asleep</span>
          <span>{sleepTitle} · since {clockTime(sleeping.Start)}</span>
        {/if}
      </span>
      <span class="big serif">{duration(waking ? now - waking.Start : asleepFor)}</span>
      <span class="hint">
        {#if askAwake}<span class="ask">Still asleep? Tap to check.</span>
        {:else if typical}Naps usually run {duration(typical[0])}–{duration(typical[1])}
        {:else if sleeping.IsNight}
          {wakings.length === 0 ? 'No wakings yet' : `${wakings.length} ${wakings.length === 1 ? 'waking' : 'wakings'} so far`}
        {/if}
      </span>
    </button>
  {:else}
    <!-- Awake: the wake window. Tapping it explains the bar. -->
    <button class="card status" onclick={() => open({ kind: 'wakeWindow' })}>
      <span class="since">
        <span class="dot"></span>
        <span class="awake-label">Awake</span>
        {#if next}<span>since {clockTime(next.awakeSince)}</span>{/if}
      </span>
      {#if next}
        <span class="big serif">{duration(awakeFor)}</span>
        <span class="bar" aria-hidden="true">
          <span class="fill" style:transform="translateX({Math.min(100, (awakeFor / barSpan) * 100) - 100}%)"></span>
          <span class="target" style:left="{((next.from - next.awakeSince) / barSpan) * 100}%"
            style:width="{Math.max(1.5, ((next.to - next.from) / barSpan) * 100)}%"></span>
        </span>
        <span class="window">
          <span>Wake window ~{duration(next.targetMinutes * minute)}</span>
          <span class="next">
            {#if next.kind === 'nap'}Nap {clockShort(next.from)}–{clockShort(next.to)}{:else}Bedtime {clockTime(next.from)}{/if}
          </span>
        </span>
      {:else}
        <span class="empty">Log a sleep to see {baby.their} wake window.</span>
      {/if}
    </button>
  {/if}

  <div class="actions">
    <button class="action sleep" onclick={sleepTapped}>
      <Icon name={waking ? 'sun' : 'moonStar'} size={28} stroke="var(--on-moss)" width={1.8} />
      <span class="action-label serif">{sleepTitle}</span>
      <!-- The status card above has the timer; here a dot says it's running. -->
      <span class="action-state">
        {#if waking}<span class="live"></span>Awake
        {:else if sleeping}<span class="live"></span>Asleep
        {:else}{isNightTime(now, targets) ? 'Start night' : 'Start nap'}{/if}
      </span>
    </button>
    <button class="action feed" onclick={() => open({ kind: 'feed' })}>
      <Icon name="drop" size={28} stroke="var(--on-feed-fill)" width={1.8} />
      <span class="action-label serif">Feed</span>
      <span class="action-state">
        {#if feeding}
          <span class="live"></span>{stopwatch(nursedSeconds(feeding, now) * 1000)} · {feeding.ActiveSide ?? 'paused'}
        {:else if lastFeed}Fed {ago(lastFeed.Start)}
        {:else}Nursing or bottle{/if}
      </span>
    </button>
  </div>

  <!-- Solids says when she last ate. A note is rare, so it gets a small square beside it. -->
  <div class="more">
    <button class="card solids" onclick={() => open({ kind: 'solids' })}>
      <Icon name="bowl" stroke="var(--terra-text)" />
      <span class="solids-text">
        <span class="solids-label">Solids</span>
        {#if lastSolids}
          <span class="solids-meta">Ate {ago(lastSolids.Start)}{lastSolids.Foods.length ? ` · ${lastSolids.Foods.join(', ')}` : ''}</span>
        {/if}
      </span>
    </button>
    <button class="card note" aria-label="Note" onclick={() => open({ kind: 'note' })}>
      <Icon name="pencil" stroke="var(--terra-text)" />
    </button>
  </div>

  <TodayStrip {events} {now} />
</div>

<style>
  .date {
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
    letter-spacing: 0.04em;
  }

  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .header-buttons {
    display: flex;
    align-items: center;
  }

  .sync {
    position: relative;
    width: 44px;
    height: 44px;
    border: 0;
    background: none;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
  }

  .sync.moving {
    opacity: 1;
  }

  .sync.stale {
    opacity: 1;
    color: var(--terra-text);
  }

  .stale-dot {
    position: absolute;
    top: 10px;
    right: 8px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--terra);
  }

  .status {
    border-radius: 26px;
    padding: 22px 22px 20px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
    text-align: left;
  }

  .status:active {
    transform: scale(0.99);
  }

  .since {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--muted);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: var(--terra);
  }

  .dot.asleep {
    background: var(--moss);
  }

  .awake-label {
    font-weight: 800;
    color: var(--terra-text);
  }

  .asleep-label {
    font-weight: 800;
    color: var(--moss-deep);
  }

  .big {
    font-size: 66px;
    font-weight: 400;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .hint {
    font-size: 14px;
    font-weight: 700;
    color: var(--muted);
  }

  .hint:empty {
    display: none;
  }

  .ask {
    color: var(--terra-text);
    font-weight: 800;
  }

  .bar {
    display: block;
    height: 10px;
    border-radius: 5px;
    background: var(--track);
    position: relative;
    overflow: hidden;
  }

  /* Full width and slid into place, so it glides between the clock's one-second ticks. */
  .fill {
    position: absolute;
    inset: 0;
    border-radius: 5px;
    background: var(--terra);
    transition: transform 1s linear;
  }

  .target {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--moss-pale);
    mix-blend-mode: multiply;
  }

  .window {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }

  .next {
    color: var(--moss-deep);
  }

  .empty {
    font-size: 15px;
    color: var(--muted);
  }

  /* Sleep and Feed: the same size, side by side. */
  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .action {
    min-height: 132px;
    padding: 16px 12px;
    border: 0;
    border-radius: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .action.sleep {
    background: var(--moss);
    color: var(--on-moss);
    box-shadow: var(--button-shadow);
  }

  .action.feed {
    background: var(--feed-fill);
    color: var(--on-feed-fill);
    box-shadow: var(--feed-shadow);
  }

  .action-label {
    font-size: 26px;
    font-weight: 600;
    line-height: 1.15;
  }

  .action-state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    opacity: 0.9;
  }

  /* A running timer: a small ring beside the time. */
  .live {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: currentColor;
    box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 35%, transparent);
  }

  .more {
    display: flex;
    gap: 10px;
  }

  .solids {
    flex: 1;
    min-width: 0;
    min-height: 64px;
    padding: 10px 18px;
    border-radius: 22px;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
  }

  .note {
    width: 64px;
    border-radius: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .solids:active,
  .note:active {
    transform: scale(0.97);
  }

  .solids-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .solids-label {
    font-size: 15px;
    font-weight: 800;
  }

  .solids-meta {
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
