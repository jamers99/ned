<script lang="ts">
  // One series over time: 2px line, ringed 8px dots, hairline grid, the latest value labelled at the end,
  // and a tap/hover readout for any other point.
  let { points, format }: { points: { at: number; value: number }[]; format: (value: number) => string } = $props();

  const width = 320;
  const height = 120;
  const pad = { top: 12, right: 12, bottom: 20, left: 36 };

  const minAt = $derived(Math.min(...points.map(p => p.at)));
  const maxAt = $derived(Math.max(...points.map(p => p.at)));
  const ticks = $derived.by(() => {
    const values = points.map(p => p.value);
    const lo = Math.floor(Math.min(...values));
    const hi = Math.ceil(Math.max(...values));
    return hi === lo ? [lo - 1, lo + 1] : [lo, hi];
  });

  const x = (at: number) => pad.left + (maxAt === minAt ? 0.5 : (at - minAt) / (maxAt - minAt)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - (v - ticks[0]) / (ticks[1] - ticks[0])) * (height - pad.top - pad.bottom);

  let picked = $state<number | null>(null);
  const shown = $derived(points[picked ?? points.length - 1]);

  function pick(event: PointerEvent) {
    const box = (event.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * width;
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.at) - px) < Math.abs(x(points[nearest].at) - px)) nearest = i;
    });
    picked = nearest;
  }
</script>

<svg viewBox="0 0 {width} {height}" role="img" aria-label="Line chart"
  onpointermove={pick} onpointerdown={pick} onpointerleave={() => (picked = null)}>
  {#each ticks as tick (tick)}
    <line class="grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
    <text class="axis" x={pad.left - 6} y={y(tick) + 4} text-anchor="end">{tick}</text>
  {/each}
  <polyline points={points.map(p => `${x(p.at)},${y(p.value)}`).join(' ')} />
  {#each points as p, i (p.at + '-' + i)}
    <circle cx={x(p.at)} cy={y(p.value)} r={i === (picked ?? points.length - 1) ? 5 : 4} />
  {/each}
  {#if shown}
    <text class="readout" x={Math.min(x(shown.at), width - pad.right)} y={height - 4}
      text-anchor={x(shown.at) > width / 2 ? 'end' : 'start'}>
      {format(shown.value)} · {new Date(shown.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
    </text>
  {/if}
</svg>

<style>
  svg {
    width: 100%;
    height: auto;
    touch-action: pan-y;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }

  .axis,
  .readout {
    font-size: 11px;
    font-weight: 700;
    fill: var(--muted);
  }

  .readout {
    fill: var(--ink);
    font-weight: 800;
  }

  polyline {
    fill: none;
    stroke: var(--moss);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  circle {
    fill: var(--moss);
    stroke: var(--surface);
    stroke-width: 2;
  }
</style>
