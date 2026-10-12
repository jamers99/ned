<script lang="ts">
  import type { Snippet } from 'svelte';
  import { toDateInput, toTimeInput, withDateInput, withTimeInput } from '../lib/time.ts';

  // Looks like whatever is passed in; tapping it opens the phone's native time wheel, or its calendar for a date.
  let { value, onchange, label, type = 'time', class: className = '', children }: {
    value: number;
    onchange: (ms: number) => void;
    label: string;
    type?: 'time' | 'date';
    class?: string;
    children: Snippet;
  } = $props();

  function pick(input: string) {
    if (input) onchange(type === 'date' ? withDateInput(value, input) : withTimeInput(value, input));
  }
</script>

<label class="time-input {className}">
  {@render children()}
  <input {type} aria-label={label} value={type === 'date' ? toDateInput(value) : toTimeInput(value)}
    max={type === 'date' ? toDateInput(Date.now()) : undefined} onchange={e => pick(e.currentTarget.value)} />
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
