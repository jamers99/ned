<script lang="ts">
  import type { Snippet } from 'svelte';
  import { toTimeInput, withTimeInput } from '../lib/time.ts';

  // Looks like whatever is passed in; tapping it opens the phone's native time wheel.
  let { value, onchange, label, class: className = '', children }: {
    value: number;
    onchange: (ms: number) => void;
    label: string;
    class?: string;
    children: Snippet;
  } = $props();
</script>

<label class="time-input {className}">
  {@render children()}
  <input type="time" aria-label={label} value={toTimeInput(value)}
    onchange={e => e.currentTarget.value && onchange(withTimeInput(value, e.currentTarget.value))} />
</label>

<style>
  .time-input {
    position: relative;
    cursor: pointer;
  }

  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
</style>
