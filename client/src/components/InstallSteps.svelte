<script lang="ts">
  import Icon from './Icon.svelte';
  import { device, install, installNow } from '../lib/install.svelte.ts';

  const on = device();
</script>

<!-- How to put Ned on this phone's home screen, shown until it's opened from there. -->
<section class="install">
  {#if on === 'iphone'}
    <h2 class="serif">Add Ned to your Home Screen first</h2>
    <p>On iPhone the Home Screen app keeps its own sign-in, separate from Safari, so start there.</p>
    <ol>
      <li>Tap <span class="key"><Icon name="share" size={18} /> Share</span> in Safari's toolbar.</li>
      <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
      <li>Open Ned from your Home Screen and sign in there.</li>
    </ol>
  {:else if on === 'android'}
    <h2 class="serif">Install Ned on this phone</h2>
    {#if install.done}
      <p>Installed. Open Ned from your home screen and sign in there.</p>
    {:else if install.prompt}
      <p>It opens like an app, full screen and offline.</p>
      <button class="primary-dark" onclick={installNow}>Install Ned</button>
    {:else}
      <ol>
        <li>Tap <span class="key">⋮</span> at the top right of Chrome.</li>
        <li>Choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li>
        <li>Open Ned from your home screen and sign in there.</li>
      </ol>
    {/if}
  {:else}
    <h2 class="serif">Made for your phone</h2>
    <p>Open this page on your phone to add Ned to its home screen.</p>
  {/if}
</section>

<style>
  .install {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px;
    border-radius: 24px;
    border: 1px solid var(--line);
    background: var(--surface);
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }

  p {
    margin: 0;
    color: var(--muted);
    font-size: 15px;
    line-height: 1.4;
  }

  ol {
    margin: 0;
    padding-left: 22px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 15px;
    line-height: 1.4;
  }

  .key {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    border-radius: 10px;
    background: var(--ground);
    font-weight: 800;
    vertical-align: bottom;
  }
</style>
