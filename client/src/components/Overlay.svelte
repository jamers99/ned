<script lang="ts">
  import type { Snippet } from 'svelte';
  import { rise } from '../lib/motion.ts';
  import { close } from '../lib/nav.svelte.ts';
  import Icon from './Icon.svelte';

  // A full-screen page over the tabs: a close button, a title, and anything small on the right.
  let { title, aside, children }: { title: string; aside?: Snippet; children: Snippet } = $props();
</script>

<div class="overlay" transition:rise>
  <div class="screen">
    <header class="screen-header">
      <button class="round-button" aria-label="Close" onclick={close}><Icon name="close" size={18} width={2} /></button>
      <div class="screen-title">{title}</div>
      <div class="aside">{@render aside?.()}</div>
    </header>
    {@render children()}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10;
    overflow-y: auto;
    background: var(--ground);
  }

  .aside {
    width: 44px;
    text-align: right;
  }
</style>
