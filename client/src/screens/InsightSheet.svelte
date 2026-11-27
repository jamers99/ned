<script lang="ts">
  import Sheet from '../components/Sheet.svelte';
  import { baby, verb } from '../lib/baby.svelte.ts';
  import type { bedtimeStats, feedSplit, goodNights } from '../lib/insights.ts';
  import { close, open, type InsightCard } from '../lib/nav.svelte.ts';
  import type { SleepTargets } from '../lib/sleep.ts';
  import { atMinuteOfDay, clock as clockTime } from '../lib/time.ts';

  // What an Insights card means, in plain words with this week's numbers, and one thing to try.
  // The suggestions lean on Babywise: a steady routine, full feeds by day, and settling without a feed.
  type Bar = { label: string; value: number; inner: number };
  let { card, stretches, weeks, bedtime, feeds, nights, typical, age, solids, targets }: {
    card: InsightCard;
    stretches: Bar[];
    weeks: Bar[];
    bedtime: ReturnType<typeof bedtimeStats>;
    feeds: ReturnType<typeof feedSplit>;
    nights: ReturnType<typeof goodNights>;
    /** Night feeds typical at this age, or null with no birth date. */
    typical: [number, number] | null;
    age: string | null;
    /** Solids logged over the last week. */
    solids: number;
    targets: SleepTargets;
  } = $props();

  const titles: Record<InsightCard, string> = {
    stretch: 'Longest night stretch',
    wakings: 'Night wakings',
    bedtime: 'Bedtime',
    feeds: 'Feeds by day and night',
    nights: 'Calmer nights'
  };

  const [latest, previous] = $derived(
    (card === 'stretch' ? stretches : weeks).slice(-2).reverse() as [Bar | undefined, Bar | undefined]
  );
  const change = $derived(latest && previous ? latest.value - previous.value : 0);
  const fedShare = $derived(latest ? Math.round(latest.inner * 100) : 0);
  const range = (r: [number, number]) => (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`);
  const plannedBedtime = $derived(clockTime(atMinuteOfDay(0, targets.NightStartMinutes)));
</script>

<Sheet>
  <div class="title serif">{titles[card]}</div>

  <div class="points">
    {#if card === 'stretch'}
      <p><strong>The longest {baby.they} slept in one go</strong> each night, between wakings or night feeds. Each bar is the typical night that month.</p>
      {#if latest}
        <p>
          <strong>{latest.value.toFixed(1)} hours</strong> this month{previous ? `, ${change >= 0 ? 'up' : 'down'} from ${previous.value.toFixed(1)} last month` : ''}.
        </p>
      {/if}
      <p class="try">
        Longer stretches come as {baby.they} {verb('learns', 'learn')} to link sleep cycles. Full feeds by day and the same
        bedtime routine every night help them grow.
      </p>
    {:else if card === 'wakings'}
      <p><strong>How often {baby.they} {verb('wakes', 'wake')} each night</strong>, averaged by week. The highlighted part is the wakings a feed settled.</p>
      {#if latest}
        <p>
          <strong>{latest.value.toFixed(1)} a night</strong> this week{previous ? `, against ${previous.value.toFixed(1)} the week before` : ''}.
          {fedShare}% ended with a feed.
        </p>
      {/if}
      <p class="try">
        {#if latest && latest.value <= 1}
          Nights are settling. Keep the routine steady while it holds.
        {:else if fedShare > 50}
          Most wakings end with a feed, so feeding can become the way back to sleep. Try a few minutes of quiet soothing
          first, and save the feed for when {baby.they} {verb("doesn't", "don't")} settle.
        {:else}
          Note what's different about the calmer weeks: naps, bedtime and day feeds. The Calmer nights card compares them.
        {/if}
      </p>
    {:else if card === 'bedtime'}
      <p><strong>When night sleep started</strong>, averaged over the last week, and how much it moved around.</p>
      {#if bedtime}
        <p><strong>{clockTime(bedtime.average)}</strong> on average, give or take {bedtime.spreadMinutes} minutes.</p>
      {/if}
      <p class="try">
        {#if bedtime && bedtime.spreadMinutes > 30}
          A steady bedtime and morning wake-up set the rhythm for the whole day. Try keeping bedtime within half an hour
          of {plannedBedtime}.
        {:else}
          Bedtime is steady. A consistent start to the morning helps it stay that way.
        {/if}
      </p>
    {:else if card === 'feeds'}
      <p><strong>Feeds a day over the last week</strong>: the ones during a logged night, and the rest.</p>
      {#if feeds}
        <p>
          <strong>{feeds.day} by day, {feeds.night} at night.</strong>
          {#if typical}Typical at {age}: {range(typical)} at night.{/if}
        </p>
      {/if}
      <p class="try">
        {#if feeds && typical && feeds.night > typical[1]}
          More night feeds than usual at this age. Fuller, well-spaced feeds by day can move them to the day.
          {#if solids}Nurse first and offer solids after, so solids add to milk rather than replace it.{/if}
          Check with {baby.their} doctor before dropping night feeds.
        {:else}
          Full feeds when {baby.they} {verb('wakes', 'wake')}, then play, then sleep, keeps feeding from becoming how
          {baby.they} {verb('falls', 'fall')} asleep.
        {/if}
      </p>
    {:else}
      <p>
        <strong>The last four weeks of nights, split three ways</strong> by the day before: the number of naps, bedtime, and
        day feeds. This shows the split with the biggest difference in wakings.
      </p>
      {#if nights}
        <p><strong>{nights.calmWakings} wakings</strong> after {nights.calm}, against {nights.roughWakings} after {nights.rough}.</p>
        <p class="try">Try a week of days with {nights.calm}, and watch the Night wakings chart.</p>
      {/if}
      <p class="aside">It's a pattern, not proof: a rough day can bring both a late bedtime and a rough night.</p>
    {/if}
  </div>

  <div class="row">
    <button class="pill" onclick={() => open({ kind: 'settings' })}>Change the targets</button>
    <button class="primary-dark" onclick={close}>Got it</button>
  </div>
</Sheet>

<style>
  .title {
    font-size: 26px;
    font-weight: 600;
  }

  .points {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  p {
    margin: 0;
    font-size: 15px;
    line-height: 1.45;
    color: var(--muted);
  }

  strong {
    color: var(--ink);
    font-weight: 800;
  }

  .try {
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--moss-soft);
    color: var(--on-moss-callout);
  }

  .row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    align-items: center;
  }
</style>
