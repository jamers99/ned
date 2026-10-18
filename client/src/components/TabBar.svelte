<script lang="ts">
  import { nav, open, showTab, type Tab } from '../lib/nav.svelte.ts';
  import { clock, live, status } from '../lib/state.svelte.ts';
  import { lastSyncedText, oldestUnpushed, syncIsStale } from '../lib/sync.ts';
  import Icon, { type IconName } from './Icon.svelte';

  let { dark = false }: { dark?: boolean } = $props();

  const tabs: { tab: Tab; label: string; icon: IconName }[] = [
    { tab: 'now', label: 'Now', icon: 'clock' },
    { tab: 'day', label: 'Day', icon: 'list' },
    { tab: 'insights', label: 'Insights', icon: 'bars' }
  ];

  // A quiet cloud that only stands out when the other phone may be missing something.
  const unpushed = live(oldestUnpushed, null);
  const stale = $derived(syncIsStale(unpushed.value, clock.now));
  const synced = $derived(lastSyncedText(clock.now));
</script>

<nav class:dark>
  <span></span>
  {#each tabs as { tab, label, icon } (tab)}
    <button class:active={nav.tab === tab} aria-current={nav.tab === tab ? 'page' : undefined}
      onclick={() => showTab(tab)}>
      <Icon name={icon} width={nav.tab === tab ? 2 : 1.7} />
      {label}
    </button>
  {/each}
  {#if status.user}
    <button class="sync" class:stale aria-label={stale ? `Not synced. ${synced}` : synced}
      onclick={() => open({ kind: 'settings' })}>
      <Icon name="cloud" size={18} width={stale ? 2 : 1.5} />
      {#if stale}<span class="dot"></span>{/if}
    </button>
  {/if}
</nav>

<style>
  nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 4;
    display: grid;
    grid-template-columns: 1fr repeat(3, minmax(72px, 96px)) 1fr;
    padding: 6px 0 calc(var(--safe-bottom) + 10px);
    border-top: 1px solid var(--line);
    background: var(--ground);
    transition: background-color var(--quick), border-color var(--quick);
  }

  button {
    min-width: 72px;
    min-height: 48px;
    border: 0;
    background: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
  }

  button.active {
    font-weight: 800;
    color: var(--moss-deep);
  }

  .sync {
    position: relative;
    justify-self: end;
    min-width: 44px;
    margin-right: 8px;
    opacity: 0.7;
  }

  .sync.stale {
    opacity: 1;
    color: var(--terra-text);
  }

  .dot {
    position: absolute;
    top: 12px;
    right: 9px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--terra);
  }

  nav.dark {
    background: var(--sleep-bg);
    border-top-color: var(--sleep-line);
  }

  nav.dark button {
    color: var(--moss-mist);
  }

  nav.dark button.active {
    color: var(--on-sleep);
  }

  nav.dark .sync.stale {
    color: var(--peach);
  }
</style>
