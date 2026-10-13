<script lang="ts">
  import { nav, showTab, type Tab } from '../lib/nav.svelte.ts';
  import Icon, { type IconName } from './Icon.svelte';

  let { dark = false }: { dark?: boolean } = $props();

  const tabs: { tab: Tab; label: string; icon: IconName }[] = [
    { tab: 'now', label: 'Now', icon: 'clock' },
    { tab: 'day', label: 'Day', icon: 'list' },
    { tab: 'insights', label: 'Insights', icon: 'bars' }
  ];
</script>

<nav class:dark>
  {#each tabs as { tab, label, icon } (tab)}
    <button class:active={nav.tab === tab} aria-current={nav.tab === tab ? 'page' : undefined}
      onclick={() => showTab(tab)}>
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
    background: var(--sleep-bg);
    border-top-color: var(--sleep-line);
  }

  nav.dark button {
    color: var(--moss-mist);
  }

  nav.dark button.active {
    color: var(--on-sleep);
  }
</style>
