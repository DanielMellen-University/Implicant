// Shared UI helpers with no DOM, so tests can import them directly.

const BG = [0x1f, 0x1e, 0x1d];

function srgbChannelToLinear(u) {
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbChannel(c) {
  const t = c < 0 ? 0 : c;
  const v = t <= 0.0031308 ? 12.92 * t : 1.055 * (t ** (1 / 2.4)) - 0.055;
  return v;
}

export function rgbToOklab(r, g, b) {
  const l = srgbChannelToLinear(r / 255);
  const m = srgbChannelToLinear(g / 255);
  const s = srgbChannelToLinear(b / 255);
  const l_ = Math.cbrt(0.4122214708 * l + 0.5363325363 * m + 0.0514459929 * s);
  const m_ = Math.cbrt(0.2119034982 * l + 0.6806995451 * m + 0.1073969566 * s);
  const s_ = Math.cbrt(0.0883024619 * l + 0.2817188376 * m + 0.6299787005 * s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0892393808 * a - 1.2914855480 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [linearToSrgbChannel(r) * 255, linearToSrgbChannel(g) * 255, linearToSrgbChannel(bl) * 255];
}

function inGamut(rgb) {
  return rgb.every((c) => c >= -0.5 && c <= 255.5);
}

function clampRgb(rgb) {
  return rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))));
}

function rgbToHex(rgb) {
  return `#${clampRgb(rgb).map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export function hexToOklab(hex) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToOklab(r, g, b);
}

/** Euclidean distance in OKLab, a close stand-in for perceptual deltaE. */
export function oklabDeltaE(a, b) {
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

function chroma(lab) {
  return Math.hypot(lab.a, lab.b);
}

/**
 * Greedy max-min selection: start with the color farthest from the dark
 * background, then repeatedly add the candidate whose nearest already-picked
 * neighbor is farthest away.
 */
export function pickSpread(candidates, count) {
  if (count <= 0 || candidates.length === 0) return [];
  const take = Math.min(count, candidates.length);
  const remaining = candidates.map((hex) => ({ hex, lab: hexToOklab(hex) }));
  const bg = rgbToOklab(...BG);
  let firstIndex = 0;
  let firstScore = -1;
  remaining.forEach((item, index) => {
    if (chroma(item.lab) < 0.10) return;
    const score = oklabDeltaE(item.lab, bg);
    if (score > firstScore) {
      firstScore = score;
      firstIndex = index;
    }
  });
  const picked = [remaining.splice(firstIndex, 1)[0]];
  while (picked.length < take) {
    let bestIndex = 0;
    let bestDistance = -1;
    remaining.forEach((item, index) => {
      const distance = Math.min(...picked.map((p) => oklabDeltaE(item.lab, p.lab)));
      if (distance > bestDistance + 1e-12
          || (Math.abs(distance - bestDistance) < 1e-12 && chroma(item.lab) > chroma(remaining[bestIndex].lab))) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    picked.push(remaining.splice(bestIndex, 1)[0]);
  }
  return picked.map((item) => item.hex);
}

function buildGroupPalette() {
  const seen = new Set();
  const candidates = [];
  const bg = rgbToOklab(...BG);
  for (let Li = 52; Li <= 88; Li += 3) {
    const L = Li / 100;
    for (let Ci = 10; Ci <= 24; Ci += 2) {
      const C = Ci / 100;
      for (let h = 0; h < 360; h += 5) {
        const rad = (h * Math.PI) / 180;
        const rgb = oklabToRgb(L, C * Math.cos(rad), C * Math.sin(rad));
        if (!inGamut(rgb)) continue;
        const hex = rgbToHex(rgb);
        if (seen.has(hex)) continue;
        const lab = hexToOklab(hex);
        if (lab.L < 0.50 || oklabDeltaE(lab, bg) < 0.25) continue;
        seen.add(hex);
        candidates.push(hex);
      }
    }
  }
  return pickSpread(candidates, 32);
}

/** 32 dark-theme colors chosen by greedy max-min OKLab distance. */
export const GROUP_PALETTE = buildGroupPalette();

export function minPairwiseDeltaE(hexes) {
  let min = Infinity;
  for (let i = 0; i < hexes.length; i += 1) {
    const a = hexToOklab(hexes[i]);
    for (let j = i + 1; j < hexes.length; j += 1) {
      min = Math.min(min, oklabDeltaE(a, hexToOklab(hexes[j])));
    }
  }
  return hexes.length < 2 ? Infinity : min;
}

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
