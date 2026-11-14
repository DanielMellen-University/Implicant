// Shared UI helpers with no DOM, so tests can import them directly.

/** Start with distinct hues and add alternate shades for denser maps. */
export const GROUP_PALETTE = [
  // Red, blue, green, yellow, purple, orange, pink, teal.
  '#de8b86', '#8bb6e6', '#a9c889', '#d8c778', '#b8a1df', '#e2ac79', '#d899b3', '#79c9c1',
  '#d9aeaa', '#8cace0', '#98b276', '#c3b48f', '#c496d4', '#e1b69d', '#c98fa0', '#78b0ab',
  '#cf9dbf', '#a6a9de', '#aebd8d', '#d6ac8d', '#9e95c5', '#9dc2d5', '#e2bdce', '#a1c3a4',
  '#b4c4ca', '#c2aa99', '#a6c3ed', '#c5cc9b', '#b9adca', '#82a7ba', '#92ada7', '#8fbfcf',
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
