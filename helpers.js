// Shared UI helpers with no DOM, so tests can import them directly.

/** Sixteen hand-picked hues that stay distinct on the dark background. */
export const BASE_GROUP_COLORS = [
  '#7F77DD', // violet
  '#1D9E75', // teal
  '#D85A30', // rust
  '#378ADD', // blue
  '#BA7517', // amber
  '#D4537E', // rose
  '#639922', // olive
  '#12A3C9', // cyan
  '#E2B714', // gold
  '#A855F7', // purple
  '#EF4444', // red
  '#5B6CFF', // indigo
  '#F97316', // orange
  '#2F9E44', // green
  '#EC4899', // magenta
  '#14B8A6', // turquoise
];

/**
 * Color for group `index`. The first 16 come from BASE_GROUP_COLORS.
 * Further groups use a golden-angle OKLCH walk with alternating lightness
 * so no two groups in one solution share a color.
 */
export function groupColor(index) {
  if (index < BASE_GROUP_COLORS.length) return BASE_GROUP_COLORS[index];
  const extra = index - BASE_GROUP_COLORS.length;
  // 31° offset keeps the first generated hues off the hand-picked set.
  const hue = (31 + extra * 137.508) % 360;
  const lightness = extra % 2 === 0 ? 0.62 : 0.74;
  const chroma = extra % 3 === 0 ? 0.19 : 0.15;
  return `oklch(${lightness} ${chroma} ${hue})`;
}

/**
 * Fill `length` cells independently. Each cell is 0, 1, or X (stored as 2)
 * with probability 1/3. `random` is a hook for tests; it should return
 * a number in [0, 1), like Math.random.
 */
export function randomizeValues(length, random = Math.random) {
  return Array.from({ length }, () => {
    const roll = random();
    if (roll < 1 / 3) return 0;
    if (roll < 2 / 3) return 1;
    return 2;
  });
}
