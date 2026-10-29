<script lang="ts">
  import Icon from './Icon.svelte';
  import { device, install, installNow } from '../lib/install.svelte.ts';

  const on = device();
</script>

<!-- How to put Ned on this phone's home screen, shown until it's opened from there. -->
<section class="install">
  <h2>Ned works best as an app</h2>
  {#if on === 'iphone'}
    <p>Tap <span class="key"><Icon name="share" size={15} /> Share</span> in Safari, then
      <strong>Add to Home Screen</strong>.</p>
  {:else if on === 'android'}
    {#if install.done}
      <p>Installed. Open Ned from your home screen.</p>
    {:else if install.prompt}
      <button class="chip" onclick={installNow}>Install Ned</button>
    {:else}
      <p>Tap <span class="key">⋮</span> in Chrome, then <strong>Add to Home screen</strong>.</p>
    {/if}
  {:else}
    <p>Open this page on your phone to add it to the home screen.</p>
  {/if}
</section>

<style>
  .install {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 12px 16px;
    border-radius: 20px;
    border: 1px solid var(--line);
    background: var(--surface);
  }

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
  }

  p {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.5;
  }

  .key {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 7px;
    border-radius: 8px;
    background: var(--ground);
    color: var(--ink);
    font-weight: 800;
    vertical-align: bottom;
  }
</style>
