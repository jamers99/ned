<script lang="ts">
  import type { Snippet } from 'svelte';
  import { rise } from '../lib/motion.ts';
  import { close } from '../lib/nav.svelte.ts';
  import Icon from './Icon.svelte';

  // A full-screen page over the tabs: a close button and a centered title.
  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="overlay" transition:rise>
  <div class="screen">
    <header class="screen-header">
      <button class="round-button" aria-label="Close" onclick={close}><Icon name="close" size={18} width={2} /></button>
      <div class="screen-title">{title}</div>
      <div class="spacer"></div>
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

  .spacer {
    width: 44px;
  }
</style>
