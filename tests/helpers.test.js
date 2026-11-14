import test from 'node:test';
import assert from 'node:assert/strict';
import {
  colorsForGroups,
  randomizeValues,
} from '../helpers.js';
import { solve } from '../solver.js';

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

test('the group palette supplies a unique color for every term in the largest solution', () => {
  const terms = Array.from({ length: 32 }, (_, index) => String(index));
  const colors = [...colorsForGroups(terms).values()];
  assert.equal(new Set(colors).size, terms.length);
  assert.ok(colors.every(color => /^#[0-9a-f]{6}$/i.test(color)));
});

test('group colors persist through edits that add, remove, or reorder terms', () => {
  const terms = ["A'C'E", 'BDE', "C'F"];
  const initial = colorsForGroups(terms);
  assert.deepEqual(colorsForGroups(terms), initial);

  const edited = colorsForGroups(['ADF', "C'F", 'BDE', 'ABC'], initial);
  assert.equal(edited.get("C'F"), initial.get("C'F"));
  assert.equal(edited.get('BDE'), initial.get('BDE'));
  assert.equal(edited.get('ADF'), initial.get("A'C'E"));
  assert.equal(edited.has("A'C'E"), false);
  assert.equal(new Set(edited.values()).size, edited.size);
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
