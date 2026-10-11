<script lang="ts" module>
  const paths = {
    sprig: 'M2 20C8 16 14 10 22 3M9 14c-3 0-5-2-5-5 3 0 5 2 5 5zM14 9c-1-3 0-6 3-7 1 3 0 6-3 7zM15 12c3-1 6 0 7 3-3 1-6 0-7-3z',
    sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M18 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM12 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    moonStar: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5zM17 3l.5 1.5L19 5l-1.5.5L17 7l-.5-1.5L15 5l1.5-.5z',
    sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    drop: 'M12 21c4 0 7-3 7-7 0-4-4-9-7-11-3 2-7 7-7 11 0 4 3 7 7 7z',
    bowl: 'M4 11h16a8 8 0 0 1-16 0zM9 8c0-2 1-3 3-4M15 8c0-1.5-.5-2.5-1.5-3',
    pencil: 'M4 20h4L19 9l-4-4L4 16z',
    clock: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0zM12 8v4l3 2',
    list: 'M5 5h14M5 12h14M5 19h9',
    bars: 'M5 19V11M12 19V5M19 19v-6',
    close: 'M6 6l12 12M18 6L6 18',
    left: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    check: 'M5 12l5 5 9-10',
    search: 'M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0zM20 20l-4-4',
    plus: 'M12 5v14M5 12h14',
    ruler: 'M4 16L16 4l4 4L8 20zM8 12l2 2M11 9l2 2M14 6l2 2'
  };

  export type IconName = keyof typeof paths;
</script>

<script lang="ts">
  let { name, size = 22, stroke = 'currentColor', width = 1.7 }:
    { name: IconName; size?: number; stroke?: string; width?: number } = $props();
</script>

<svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" {stroke} stroke-width={width}
  stroke-linecap="round" stroke-linejoin="round">
  <path d={paths[name]} />
</svg>
