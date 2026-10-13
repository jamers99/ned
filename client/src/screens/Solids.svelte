<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import TimeInput from '../components/TimeInput.svelte';
  import { addSolids } from '../lib/actions.ts';
  import { db, type Food, type FoodCategory, type SolidAmount } from '../lib/db.ts';
  import { foodPresets, presetCategory } from '../lib/foods.ts';
  import Overlay from '../components/Overlay.svelte';
  import { pop } from '../lib/motion.ts';
  import { close } from '../lib/nav.svelte.ts';
  import { clock, live } from '../lib/state.svelte.ts';
  import { clock as clockTime, day } from '../lib/time.ts';

  const known = live(() => db.foods.toArray(), [] as Food[]);
  const foods = $derived(known.value.filter(f => !f.Deleted).sort((a, b) => (b.LastUsedAt ?? 0) - (a.LastUsedAt ?? 0)));

  let query = $state('');
  let tab = $state<keyof typeof foodPresets>('Fruit');
  let selected = $state<string[]>([]);
  let amount = $state<SolidAmount | null>(null);
  // Follows the clock until a time is picked; a time later than now means yesterday.
  let picked = $state<number | null>(null);
  const at = $derived(picked ?? clock.now);

  const tabs = Object.keys(foodPresets) as (keyof typeof foodPresets)[];
  const amounts: [SolidAmount, string][] = [['Taste', 'A taste'], ['Some', 'Some'], ['All', 'All of it']];

  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const isSelected = (name: string) => selected.some(s => same(s, name));
  const unique = (names: string[]) => names.filter((n, i) => names.findIndex(m => same(m, n)) === i);

  const recents = $derived(foods.filter(f => f.LastUsedAt).slice(0, 6).map(f => f.Name));
  const allNames = $derived(unique([...foods.map(f => f.Name), ...Object.values(foodPresets).flat()]));
  const tabNames = $derived(unique([...foodPresets[tab], ...foods.filter(f => f.Category === tab).map(f => f.Name)]));
  const matches = $derived(query.trim() ? allNames.filter(n => n.toLowerCase().includes(query.trim().toLowerCase())) : []);
  const canAdd = $derived(query.trim() !== '' && !allNames.some(n => same(n, query)));

  function toggle(name: string) {
    selected = isSelected(name) ? selected.filter(s => !same(s, name)) : [...selected, name];
  }

  function addTyped() {
    toggle(query.trim());
    query = '';
  }

  function categoryOf(name: string): FoodCategory {
    const existing = foods.find(f => same(f.Name, name));
    if (existing) return existing.Category;
    const preset = presetCategory(name);
    return preset === 'Other' ? tab : preset;
  }

  function save() {
    if (selected.length === 0) return;
    void addSolids(selected.map(name => ({ name, category: categoryOf(name) })), amount, at);
    close();
  }
</script>

{#snippet chip(name: string)}
  <button class="chip" class:on={isSelected(name)} onclick={() => toggle(name)}>
    {#if isSelected(name)}<Icon name="check" size={14} width={3} />{/if}{name}
  </button>
{/snippet}

<Overlay title="Solids">
  <label class="search">
    <Icon name="search" size={18} stroke="var(--muted)" width={2} />
    <input placeholder="Find or add a food" aria-label="Find or add a food" bind:value={query}
      enterkeyhint="done" onkeydown={e => e.key === 'Enter' && canAdd && addTyped()} />
  </label>

  {#if query.trim()}
    <div class="chips">
      {#each matches as name (name)}{@render chip(name)}{/each}
      {#if canAdd}
        <button class="chip add" onclick={addTyped}><Icon name="plus" size={14} width={2.4} />Add “{query.trim()}”</button>
      {/if}
    </div>
  {:else}
    {#if recents.length}
      <section class="group">
        <div class="eyebrow">Recent</div>
        <div class="chips">{#each recents as name (name)}{@render chip(name)}{/each}</div>
      </section>
    {/if}

    <section class="group">
      <div class="tabs">
        {#each tabs as name (name)}
          <button class:on={tab === name} onclick={() => (tab = name)}>{name}</button>
        {/each}
      </div>
      <div class="chips presets">{#each tabNames as name (name)}{@render chip(name)}{/each}</div>
    </section>
  {/if}

  {#if selected.length}
    <section class="group">
      <div class="eyebrow">Chosen</div>
      <div class="chips">{#each selected as name (name)}<span class="chosen" in:pop>{@render chip(name)}</span>{/each}</div>
    </section>
  {/if}

  <section class="group">
    <div class="eyebrow">How much · optional</div>
    <div class="amounts">
      {#each amounts as [value, text] (value)}
        <button class:on={amount === value} onclick={() => (amount = amount === value ? null : value)}>{text}</button>
      {/each}
    </div>
  </section>

  <div class="when">
    <TimeInput class="pill" value={at} onchange={t => (picked = t > Date.now() ? t - day : t)} label="Solids time">
      At {clockTime(at)}
    </TimeInput>
  </div>

  <button class="primary-dark save" disabled={selected.length === 0} onclick={save}>
    {selected.length ? `Save · ${selected.length} ${selected.length === 1 ? 'food' : 'foods'}` : 'Save'}
  </button>
</Overlay>

<style>
  .when {
    display: flex;
    justify-content: center;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 50px;
    padding: 0 16px;
    border-radius: 16px;
    border: 1px solid var(--line);
    background: var(--surface);
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font-size: 16px;
    font-weight: 600;
  }

  .search input::placeholder {
    color: var(--placeholder);
  }

  .chosen {
    display: inline-flex;
  }

  .presets .chip:not(.on) {
    border-style: dashed;
    border-color: var(--line-strong);
    background: transparent;
  }

  .add {
    border-style: dashed;
    color: var(--terra-text);
  }

  .tabs {
    display: flex;
    gap: 6px;
  }

  .tabs button {
    flex: 1;
    height: 44px;
    border-radius: 12px;
    border: 0;
    background: var(--track);
    color: var(--muted);
    font-size: 14px;
    font-weight: 700;
  }

  .tabs button.on {
    background: var(--ink);
    color: var(--surface);
    font-weight: 800;
  }

  .amounts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .amounts button {
    height: 46px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 14px;
    font-weight: 700;
  }

  .amounts button.on {
    border-color: transparent;
    background: var(--moss);
    color: var(--on-moss);
    font-weight: 800;
  }

  .save {
    margin-top: auto;
  }
</style>
