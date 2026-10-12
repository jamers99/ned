<script lang="ts">
  import type { Snippet } from 'svelte';
  import { on } from 'svelte/events';
  import { appear, slideUp } from '../lib/motion.ts';
  import { close } from '../lib/nav.svelte.ts';

  // `onclose` is the sheet's Done: tapping above it or swiping it down saves the same way.
  let { children, onclose = close }: { children: Snippet; onclose?: () => void } = $props();

  let sheet: HTMLDivElement;
  let drag = $state(0);
  let dragging = $state(false);
  let startY = 0;
  let lastY = 0;
  let lastAt = 0;
  let speed = 0;
  let tracking = false;

  function done() {
    // A note being typed only saves on change, which fires on blur.
    (document.activeElement as HTMLElement | null)?.blur?.();
    onclose();
  }

  // Swiping down from the top of the sheet's scroll pulls it down; far or fast enough, it closes.
  function touchstart(e: TouchEvent) {
    tracking = e.touches.length === 1 && sheet.scrollTop <= 0 && !(e.target as Element).closest('input, textarea');
    startY = lastY = e.touches[0].clientY;
    lastAt = e.timeStamp;
    speed = 0;
  }

  // Not passive (Svelte's default for touch handlers), so the drag can stop the sheet scrolling.
  function touchmove(e: TouchEvent) {
    if (!tracking) return;
    const y = e.touches[0].clientY;
    const dy = y - startY;
    if (!dragging && (dy <= 0 || sheet.scrollTop > 0)) {
      tracking = dy >= 0 && sheet.scrollTop <= 0;
      return;
    }
    e.preventDefault();
    dragging = true;
    drag = Math.max(0, dy);
    speed = (y - lastY) / Math.max(1, e.timeStamp - lastAt);
    lastY = y;
    lastAt = e.timeStamp;
  }

  function touchend() {
    tracking = false;
    if (!dragging) return;
    dragging = false;
    if (drag > Math.min(140, sheet.offsetHeight / 3) || speed > 0.5) done();
    else drag = 0;
  }
</script>

<div class="scrim" transition:appear>
  <button class="dismiss" aria-label="Done" onclick={done}></button>
  <div class="sheet" role="dialog" aria-modal="true" tabindex="-1" transition:slideUp bind:this={sheet}
    class:dragging style:transform={drag ? `translateY(${drag}px)` : null}
    ontouchstart={touchstart} ontouchend={touchend} ontouchcancel={touchend}
    {@attach node => on(node, 'touchmove', touchmove, { passive: false })}>
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
    overscroll-behavior: contain;
    transition: transform 180ms cubic-bezier(0.33, 1, 0.68, 1);
  }

  .sheet.dragging {
    transition: none;
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
