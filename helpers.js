// Shared UI helpers with no DOM, so tests can import them directly.

/** Group accents that progress from cool to warm, with extra shades for dense maps. */
export const GROUP_PALETTE = [
  '#8bb6e6', '#a6a9de', '#b8a1df', '#d899b3', '#de8b86', '#e2ac79',
  '#d8c778', '#a9c889', '#79c9c1', '#b4c4ca', '#98b276', '#c496d4',
  '#78b0ab', '#d9aeaa', '#8cace0', '#aebd8d', '#e1b69d', '#9e95c5',
  '#9dc2d5', '#c98fa0', '#c3b48f', '#82a7ba', '#a1c3a4', '#cf9dbf',
  '#a6c3ed', '#c2aa99', '#92ada7', '#e2bdce', '#b9adca', '#c5cc9b',
  '#d6ac8d', '#8fbfcf',
];

/** Keep colors for terms still in the solution and reuse freed colors. */
export function colorsForGroups(terms, previous = new Map()) {
  const colors = new Map();
  for (const term of terms) {
    if (previous.has(term)) colors.set(term, previous.get(term));
  }
  const inUse = new Set(colors.values());
  const available = GROUP_PALETTE.filter(color => !inUse.has(color));
  for (const term of terms) {
    if (!colors.has(term)) colors.set(term, available.shift());
  }
  return colors;
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
