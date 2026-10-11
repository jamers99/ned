<script lang="ts">
  import { nav, type Tab } from '../lib/nav.svelte.ts';
  import { startOfDay } from '../lib/time.ts';
  import Icon, { type IconName } from './Icon.svelte';

  let { dark = false }: { dark?: boolean } = $props();

  const tabs: { tab: Tab; label: string; icon: IconName }[] = [
    { tab: 'now', label: 'Now', icon: 'clock' },
    { tab: 'day', label: 'Day', icon: 'list' },
    { tab: 'insights', label: 'Insights', icon: 'bars' }
  ];

  function select(tab: Tab) {
    if (tab === 'day' && nav.tab !== 'day') nav.day = startOfDay(Date.now());
    nav.tab = tab;
    scrollTo(0, 0);
  }
</script>

<nav class:dark>
  {#each tabs as { tab, label, icon } (tab)}
    <button class:active={nav.tab === tab} aria-current={nav.tab === tab ? 'page' : undefined}
      onclick={() => select(tab)}>
      <Icon name={icon} width={nav.tab === tab ? 2 : 1.7} />
      {label}
    </button>
  {/each}
</nav>

<style>
  nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 4;
    display: flex;
    justify-content: space-around;
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

  nav.dark {
    background: var(--moss-deep);
    border-top-color: rgba(252, 249, 243, 0.12);
  }

  nav.dark button {
    color: var(--moss-mist);
  }

  nav.dark button.active {
    color: var(--surface);
  }
</style>
