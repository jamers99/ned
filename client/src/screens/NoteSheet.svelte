<script lang="ts">
  import Sheet from '../components/Sheet.svelte';
  import { addEvent } from '../lib/actions.ts';
  import { close } from '../lib/nav.svelte.ts';

  let text = $state('');

  function save() {
    const now = Date.now();
    if (text.trim()) void addEvent({ Type: 'Note', Start: now, End: now, Text: text.trim() });
    close();
  }
</script>

<Sheet onclose={save}>
  <div class="screen-title">Note</div>
  <!-- svelte-ignore a11y_autofocus -->
  <textarea bind:value={text} rows="4" placeholder="What happened?" aria-label="Note" autofocus></textarea>
  <button class="primary-dark" disabled={!text.trim()} onclick={save}>Save note</button>
</Sheet>

<style>
  textarea {
    width: 100%;
    border-radius: 18px;
    border: 1px solid var(--line);
    background: var(--ground);
    padding: 14px 16px;
    font-size: 16px;
    font-weight: 600;
    resize: none;
    outline: 0;
  }
</style>
