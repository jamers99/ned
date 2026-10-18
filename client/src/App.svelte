<script lang="ts">
  import TabBar from './components/TabBar.svelte';
  import { db, type BabyEvent, type Settings as SettingsRow } from './lib/db.ts';
  import { settingsGuid } from './lib/ids.ts';
  import { nav, open } from './lib/nav.svelte.ts';
  import { isNightTime, latestRunning, targetsFrom } from './lib/sleep.ts';
  import { clock, live, status } from './lib/state.svelte.ts';
  import { day } from './lib/time.ts';
  import Day from './screens/Day.svelte';
  import EditEvent from './screens/EditEvent.svelte';
  import Feed from './screens/Feed.svelte';
  import Growth from './screens/Growth.svelte';
  import Insights from './screens/Insights.svelte';
  import NoteSheet from './screens/NoteSheet.svelte';
  import Now from './screens/Now.svelte';
  import Settings from './screens/Settings.svelte';
  import SignIn from './screens/SignIn.svelte';
  import Sleep from './screens/Sleep.svelte';
  import Solids from './screens/Solids.svelte';
  import WakeWindowSheet from './screens/WakeWindowSheet.svelte';
  import WokeSheet from './screens/WokeSheet.svelte';

  // The last two weeks drive Now, the wake-window math and typical nap lengths.
  const recent = live(() => db.events.where('Start').above(Date.now() - 14 * day).toArray(),
    null as BabyEvent[] | null);
  const settingsRow = live(() => db.settings.get(settingsGuid), undefined as SettingsRow | undefined);

  const events = $derived((recent.value ?? []).filter(e => !e.Deleted));
  const targets = $derived(targetsFrom(settingsRow.value));
  const sleeping = $derived(latestRunning(events, 'Sleep'));
  const overlay = $derived(nav.overlay);
  // From bedtime to morning, and through any night sleep, the whole app goes near-black and dim.
  const night = $derived(isNightTime(clock.now, targets) || sleeping?.IsNight === true);

  $effect(() => {
    const root = document.documentElement;
    root.classList.toggle('night-theme', night);
    const color = getComputedStyle(root).getPropertyValue('--ground').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    document.body.style.background = color;
  });
</script>

{#if !status.user && !status.guest}
  <SignIn />
{:else if recent.value}
  <main>
    {#if status.needsSignIn}
      <button class="banner" onclick={() => open({ kind: 'signin' })}>Sign in to sync</button>
    {/if}
    {#if nav.tab === 'now'}
      <Now {events} {targets} />
    {:else if nav.tab === 'day'}
      <Day />
    {:else}
      <Insights />
    {/if}
    <TabBar />
  </main>

  {#if overlay?.kind === 'sleep'}
    <Sleep {events} />
  {:else if overlay?.kind === 'wakeWindow'}
    <WakeWindowSheet {events} {targets} />
  {:else if overlay?.kind === 'feed'}
    <Feed {events} />
  {:else if overlay?.kind === 'solids'}
    <Solids />
  {:else if overlay?.kind === 'note'}
    <NoteSheet />
  {:else if overlay?.kind === 'woke'}
    <WokeSheet guid={overlay.guid} {events} {targets} />
  {:else if overlay?.kind === 'edit'}
    <EditEvent guid={overlay.guid} />
  {:else if overlay?.kind === 'growth'}
    <Growth />
  {:else if overlay?.kind === 'settings'}
    <Settings />
  {:else if overlay?.kind === 'signin'}
    <SignIn />
  {/if}
{/if}

<style>
  main {
    min-height: 100%;
    padding-bottom: calc(var(--safe-bottom) + 72px);
    transition: background-color var(--quick);
  }

  .banner {
    position: sticky;
    top: 0;
    z-index: 5;
    width: 100%;
    min-height: 44px;
    padding: calc(var(--safe-top) + 8px) 20px 8px;
    border: 0;
    background: var(--peach);
    color: var(--terra-text);
    font-size: 14px;
    font-weight: 800;
  }

  .banner:active {
    transform: none;
  }
</style>
