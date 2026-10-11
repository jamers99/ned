<script lang="ts">
  import type { Snippet } from 'svelte';
  import { appear, slideUp } from '../lib/motion.ts';
  import { close } from '../lib/nav.svelte.ts';

  let { children, onclose = close }: { children: Snippet; onclose?: () => void } = $props();
</script>

<div class="scrim" transition:appear>
  <button class="dismiss" aria-label="Close" onclick={onclose}></button>
  <div class="sheet" role="dialog" aria-modal="true" transition:slideUp>
    <div class="handle"></div>
    {@render children()}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    background: rgba(58, 47, 37, 0.45);
  }

  .dismiss {
    flex: 1;
    border: 0;
    background: none;
  }

  .dismiss:active {
    transform: none;
  }

  .sheet {
    max-height: calc(100% - var(--safe-top) - 24px);
    overflow-y: auto;
    background: var(--surface);
    border-radius: 32px 32px 0 0;
    padding: 12px 20px calc(var(--safe-bottom) + 28px);
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .handle {
    width: 40px;
    height: 5px;
    border-radius: 3px;
    background: #DCCFBB;
    align-self: center;
    flex: none;
  }
</style>
