<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { signIn, signUp, skipSignIn } from '../lib/auth.ts';
  import { close, nav } from '../lib/nav.svelte.ts';
  import { syncNow } from '../lib/sync.ts';

  let creating = $state(false);
  let username = $state('');
  let password = $state('');
  let inviteCode = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = creating ? await signUp(username, password, inviteCode) : await signIn(username, password);
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
      <h1 class="serif">Ned</h1>
      <p>An account shares one log across both parents' phones. Ned saves to this phone first, so it works
        offline and syncs when it can.</p>
    </div>

    <div class="modes" role="tablist">
      <button type="button" role="tab" aria-selected={!creating} class:on={!creating}
        onclick={() => (creating = false)}>Sign in</button>
      <button type="button" role="tab" aria-selected={creating} class:on={creating}
        onclick={() => (creating = true)}>Create account</button>
    </div>

    <label>
      <span class="eyebrow">Name</span>
      <input bind:value={username} autocomplete="username" autocapitalize="words" required />
    </label>
    <label>
      <span class="eyebrow">Password</span>
      <input bind:value={password} type="password" autocomplete={creating ? 'new-password' : 'current-password'}
        required />
      {#if creating}<span class="hint">8 or more, with upper and lower case, a number and a symbol.</span>{/if}
    </label>
    {#if creating}
      <label>
        <span class="eyebrow">Invite code <span class="optional">· if your partner already has an account</span></span>
        <input bind:value={inviteCode} autocomplete="off" autocapitalize="characters" spellcheck="false"
          placeholder="K7QM-3WXP" />
        <span class="hint">It's in Settings on their phone. Leave it empty to start a new log.</span>
      </label>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <button class="primary-dark" disabled={busy}>
      {#if creating}{busy ? 'Creating…' : 'Create account'}{:else}{busy ? 'Signing in…' : 'Sign in'}{/if}
    </button>

    {#if nav.overlay?.kind === 'signin'}
      <button type="button" class="skip" onclick={close}>Not now</button>
    {:else}
      <div class="try">
        <button type="button" class="skip" onclick={skipSignIn}>Try it without an account</button>
        <p>Everything stays on this phone. Make an account any time from Settings to sync what you've logged.</p>
      </div>
    {/if}
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

  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    border-radius: 30px;
    background: var(--line);
  }

  .modes button {
    min-height: 46px;
    border: 0;
    border-radius: 26px;
    background: transparent;
    color: var(--muted);
    font-size: 15px;
    font-weight: 800;
  }

  .modes .on {
    background: var(--surface);
    color: var(--ink);
  }

  .hint {
    color: var(--muted);
    font-size: 13px;
  }

  .optional {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 600;
  }

  .try {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: center;
  }

  .try p {
    font-size: 13px;
  }

  .skip {
    min-height: 54px;
    border-radius: 30px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    font-size: 16px;
    font-weight: 800;
  }

  .error {
    color: var(--terra-text);
    font-weight: 700;
  }
</style>
