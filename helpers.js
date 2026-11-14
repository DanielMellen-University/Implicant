// Shared UI helpers with no DOM, so tests can import them directly.

/** Start with distinct hues and add alternate shades for denser maps. */
export const GROUP_PALETTE = [
  // Red, blue, green, yellow, purple, orange, pink, teal.
  '#de8b86', '#8bb6e6', '#a9c889', '#d8c778', '#b8a1df', '#e2ac79', '#d899b3', '#79c9c1',
  '#d9aeaa', '#8cace0', '#98b276', '#c3b48f', '#c496d4', '#e1b69d', '#c98fa0', '#78b0ab',
  '#cf9dbf', '#a6a9de', '#aebd8d', '#d6ac8d', '#9e95c5', '#9dc2d5', '#e2bdce', '#a1c3a4',
  '#b4c4ca', '#c2aa99', '#a6c3ed', '#c5cc9b', '#b9adca', '#82a7ba', '#92ada7', '#8fbfcf',
];

const GROUP_TINT_PERCENT = 38;

export function groupTint(color) {
  return `color-mix(in srgb, var(--stage), ${color} ${GROUP_TINT_PERCENT}%)`;
}

function rgbChannels(hex) {
  return hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255);
}

function tintedOklab(color, background) {
  const weight = GROUP_TINT_PERCENT / 100;
  const [r, g, b] = rgbChannels(color).map((channel, index) => {
    const mixed = channel * weight + background[index] * (1 - weight);
    return mixed <= 0.04045 ? mixed / 12.92 : ((mixed + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function nearestColorDistance(candidate, neighbors) {
  return Math.min(...neighbors.map(neighbor => (
    candidate.reduce((sum, channel, index) => sum + (channel - neighbor[index]) ** 2, 0)
  )));
}

/** Keep surviving terms' colors and favor clearer splits when adding groups. */
export function colorsForGroups(groups, stageColor, previous = new Map()) {
  const colors = new Map();
  const colorsByMinterm = new Map();
  function assignColor(group, color) {
    colors.set(group.term, color);
    for (const minterm of group.minterms) {
      if (!colorsByMinterm.has(minterm)) colorsByMinterm.set(minterm, []);
      colorsByMinterm.get(minterm).push(color);
    }
  }

  for (const group of groups) {
    if (previous.has(group.term)) assignColor(group, previous.get(group.term));
  }
  if (colors.size === groups.length) return colors;

  const inUse = new Set(colors.values());
  const available = new Set(GROUP_PALETTE.filter(color => !inUse.has(color)));
  const background = rgbChannels(stageColor);
  const tints = new Map(GROUP_PALETTE.map(color => [color, tintedOklab(color, background)]));
  for (const group of groups) {
    if (colors.has(group.term)) continue;
    const overlapping = new Set(group.minterms.flatMap(minterm => colorsByMinterm.get(minterm) ?? []));
    const neighbors = [...overlapping].map(color => tints.get(color));
    let bestColor;
    let bestDistance = -Infinity;
    for (const color of available) {
      // With no neighbors, the first palette color wins the tie.
      const distance = nearestColorDistance(tints.get(color), neighbors);
      if (distance > bestDistance) {
        bestColor = color;
        bestDistance = distance;
      }
    }
    assignColor(group, bestColor);
    available.delete(bestColor);
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
