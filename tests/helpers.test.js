import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_PALETTE,
  colorsForGroups,
  randomizeValues,
} from '../helpers.js';
import { solve } from '../solver.js';

const stageColor = '#201f1e';

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test('randomizeValues only emits 0, 1, or 2, and is roughly uniform', () => {
  const sampleSize = 30000;
  const values = randomizeValues(sampleSize, mulberry32(20261113));
  const counts = [0, 0, 0];
  for (const value of values) {
    assert.ok(value === 0 || value === 1 || value === 2, `unexpected cell value ${value}`);
    counts[value] += 1;
  }
  const expected = sampleSize / 3;
  for (const [value, count] of counts.entries()) {
    const ratio = count / expected;
    assert.ok(ratio > 0.9 && ratio < 1.1, `value ${value} appeared ${count} times (expected about ${expected})`);
  }
});

test('randomizeValues uses the provided random function independently per cell', () => {
  const rolls = [0, 0.32, 0.34, 0.66, 0.67, 0.99];
  let i = 0;
  const values = randomizeValues(rolls.length, () => rolls[i++]);
  assert.deepEqual(values, [0, 0, 1, 1, 2, 2]);
});

test('32 disjoint checkerboard groups use every color in palette order', () => {
  const cells = Array.from({ length: 64 }, (_, index) => index.toString(2).replaceAll('0', '').length % 2);
  for (const form of ['SOP', 'POS']) {
    const { groups } = solve(cells, 6, { form });
    assert.equal(groups.length, 32);
    const colors = [...colorsForGroups(groups, stageColor).values()];
    assert.deepEqual(colors, GROUP_PALETTE);
    assert.equal(new Set(colors).size, 32);
  }
});

test('new groups choose distinct fills for overlaps and skip unrelated colors in scoring', () => {
  const groups = [
    { term: 'A', minterms: [0, 1] },
    { term: 'B', minterms: [0, 2] },
    { term: 'C', minterms: [0, 3] },
    { term: 'D', minterms: [4] },
  ];
  const expected = new Map([
    ['A', '#de8b86'], // Red leads the palette.
    ['B', '#79c9c1'], // Teal is farthest from the rendered red tint.
    ['C', '#d8c778'], // Yellow maximizes distance to the closer of red and teal.
    ['D', '#8bb6e6'], // Blue is the first unused color for a disjoint group.
  ]);
  assert.deepEqual(colorsForGroups(groups, stageColor), expected);
});

test('edits keep surviving colors and reuse a removed group’s color', () => {
  const a = { term: 'A', minterms: [0, 1] };
  const b = { term: 'B', minterms: [2, 3] };
  const c = { term: 'C', minterms: [4, 5] };
  const initial = colorsForGroups([a, b, c], stageColor);
  const edited = colorsForGroups([
    { term: 'D', minterms: [2, 6] },
    c,
    b,
    { term: 'E', minterms: [7] },
  ], stageColor, initial);
  assert.equal(edited.get('B'), initial.get('B'));
  assert.equal(edited.get('C'), initial.get('C'));
  assert.equal(edited.get('E'), initial.get('A'));
  assert.equal(edited.has('A'), false);
  assert.equal(edited.get('D'), '#d8c778');
  assert.equal(new Set(edited.values()).size, 4);
});

test('the solver stays fast on a 6-variable map with about one third X cells', () => {
  const values = randomizeValues(64, mulberry32(20261113));
  const cells = values.map((value) => (value === 2 ? 'X' : value));
  const xCount = cells.filter((value) => value === 'X').length;
  assert.ok(xCount >= 10 && xCount <= 32, `unexpected X count ${xCount}`);
  const start = performance.now();
  const result = solve(cells, 6);
  const elapsed = performance.now() - start;
  assert.ok(Array.isArray(result.groups));
  assert.ok(elapsed < 500, `solve took ${elapsed.toFixed(1)}ms`);
});
