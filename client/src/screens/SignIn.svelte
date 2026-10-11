<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { signIn } from '../lib/auth.ts';
  import { close, nav } from '../lib/nav.svelte.ts';
  import { syncNow } from '../lib/sync.ts';

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = await signIn(username, password);
    busy = false;
    if (error) return;
    if (nav.overlay?.kind === 'signin') close();
    void syncNow();
  }
</script>

<div class="signin">
  <form class="screen" onsubmit={submit}>
    {#if nav.overlay?.kind === 'signin'}
      <button type="button" class="round-button" aria-label="Close" onclick={close}>
        <Icon name="close" size={18} width={2} />
      </button>
    {/if}
    <div class="brand">
      <Icon name="sprig" size={56} stroke="var(--moss)" width={1.3} />
      <h1 class="serif">Kennedy</h1>
      <p>Sign in once on this phone. Everything you log stays on the phone and syncs in the background.</p>
    </div>

    <label>
      <span class="eyebrow">Name</span>
      <input bind:value={username} autocomplete="username" autocapitalize="words" required />
    </label>
    <label>
      <span class="eyebrow">Password</span>
      <input bind:value={password} type="password" autocomplete="current-password" required />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <button class="primary-dark" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
  </form>
</div>

<style>
  .signin {
    position: fixed;
    inset: 0;
    z-index: 20;
    overflow-y: auto;
    background: var(--ground);
  }

  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
    padding: 40px 0 16px;
  }

  h1 {
    margin: 0;
    font-size: 40px;
    font-weight: 600;
  }

  p {
    margin: 0;
    color: var(--muted);
    font-size: 15px;
    line-height: 1.4;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  input {
    height: 54px;
    padding: 0 16px;
    border-radius: 16px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 17px;
    outline: 0;
  }

  .error {
    color: var(--terra-text);
    font-weight: 700;
  }
</style>
