import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacentMinterms,
  findPrimeImplicants,
  formatImplicant,
  formatMintermList,
  getLayout,
  grayCode,
  mintermToPosition,
  positionToMinterm,
  solve,
} from '../solver.js';

function makeCells(nVars, ones, dontCares = []) {
  const cells = Array(2 ** nVars).fill(0);
  for (const minterm of ones) cells[minterm] = 1;
  for (const minterm of dontCares) cells[minterm] = 'X';
  return cells;
}

// Read the displayed expression independently of the solver's cube masks.
function evaluateExpression(expression, form, minterm, nVars) {
  if (expression === '0' || expression === '1') return Number(expression);
  function literalValue(literal) {
    assert.match(literal, /^[A-F]'?$/);
    const index = literal.charCodeAt(0) - 'A'.charCodeAt(0);
    assert.ok(index < nVars);
    const value = (minterm >> (nVars - index - 1)) & 1;
    return literal.endsWith("'") ? 1 - value : value;
  }
  if (form === 'SOP') {
    return Number(expression.split(' + ').some(term => {
      const literals = term.match(/[A-F]'?/g) ?? [];
      assert.equal(literals.join(''), term);
      return literals.every(literal => literalValue(literal) === 1);
    }));
  }
  const clauses = [...expression.matchAll(/\(([^()]+)\)/g)];
  assert.equal(clauses.map(match => match[0]).join(''), expression);
  return Number(clauses.every(match => match[1].split(' + ').some(literal => literalValue(literal) === 1)));
}

function assertValidSolution(cells, nVars, result) {
  const target = result.form === 'SOP' ? 1 : 0;
  for (let minterm = 0; minterm < cells.length; minterm += 1) {
    const coveringGroups = result.groups.filter(group => group.minterms.includes(minterm));
    if (cells[minterm] === target) assert.ok(coveringGroups.length > 0, `Missing m${minterm}`);
    if (cells[minterm] !== 'X' && cells[minterm] !== target) assert.equal(coveringGroups.length, 0);
    if (cells[minterm] !== 'X') {
      assert.equal(evaluateExpression(result.expression, result.form, minterm, nVars), cells[minterm]);
    }
  }
  assert.equal(result.termCount, result.groups.length);
  assert.equal(result.literalCount, result.groups.reduce((sum, group) => sum + group.literalCount, 0));
  for (const group of result.groups) {
    assert.ok(group.minterms.some(minterm => cells[minterm] === target));
    const expected = [];
    for (let minterm = 0; minterm < cells.length; minterm += 1) {
      const binary = minterm.toString(2).padStart(nVars, '0');
      if ([...group.pattern].every((bit, index) => bit === '-' || bit === binary[index])) expected.push(minterm);
    }
    assert.deepEqual(group.minterms, expected);
    assert.equal(group.literalCount, group.pattern.replaceAll('-', '').length);
  }
}

test('Gray order has the conventional headers', () => {
  assert.deepEqual(grayCode(0), [0]);
  assert.deepEqual(grayCode(1), [0, 1]);
  assert.deepEqual(grayCode(2), [0, 1, 3, 2]);
  for (const invalid of [-1, 3, 1.5, '2', NaN]) {
    assert.throws(() => grayCode(invalid), RangeError);
  }
});

test('layouts assign the specified variables, dimensions, and headers', () => {
  const expected = [
    [2, '', 'A', 'B', 1, 2, 2],
    [3, '', 'A', 'BC', 1, 2, 4],
    [4, '', 'AB', 'CD', 1, 4, 4],
    [5, 'A', 'BC', 'DE', 2, 4, 4],
    [6, 'AB', 'CD', 'EF', 4, 4, 4],
  ];
  for (const [n, layers, rows, columns, layerCount, rowCount, columnCount] of expected) {
    const layout = getLayout(n);
    assert.equal(layout.layerVariables, layers);
    assert.equal(layout.rowVariables, rows);
    assert.equal(layout.columnVariables, columns);
    assert.equal(layout.layerCount, layerCount);
    assert.equal(layout.rowCount, rowCount);
    assert.equal(layout.columnCount, columnCount);
    assert.deepEqual(layout.rowHeaders, rows.length === 1 ? ['0', '1'] : ['00', '01', '11', '10']);
    assert.deepEqual(layout.columnHeaders, columns.length === 1 ? ['0', '1'] : ['00', '01', '11', '10']);
  }
  assert.deepEqual(getLayout(4).layerHeaders, ['']);
  assert.deepEqual(getLayout(5).layerHeaders, ['0', '1']);
  assert.deepEqual(getLayout(6).layerHeaders, ['00', '01', '11', '10']);
  assert.deepEqual(getLayout(6).layerPositions, [
    { row: 0, col: 0 }, { row: 0, col: 1 },
    { row: 1, col: 1 }, { row: 1, col: 0 },
  ]);
});

test('every minterm round-trips through its unique map position', () => {
  for (let n = 2; n <= 6; n += 1) {
    const positions = new Set();
    for (let minterm = 0; minterm < 2 ** n; minterm += 1) {
      const position = mintermToPosition(minterm, n);
      positions.add(JSON.stringify(position));
      assert.equal(positionToMinterm(position, n), minterm);
    }
    assert.equal(positions.size, 2 ** n);
  }
  assert.deepEqual(mintermToPosition(2, 4), { layer: 0, row: 0, col: 3 });
  assert.deepEqual(mintermToPosition(24, 5), { layer: 1, row: 3, col: 0 });
  assert.deepEqual(mintermToPosition(32, 6), { layer: 3, row: 0, col: 0 });
});

test('layout helpers reject out-of-range variable counts and indices', () => {
  for (const n of [1, 7, 2.5, '4']) {
    assert.throws(() => getLayout(n), RangeError);
    assert.throws(() => adjacentMinterms(0, n), RangeError);
  }
  assert.throws(() => mintermToPosition(16, 4), RangeError);
  assert.throws(() => adjacentMinterms(-1, 3), RangeError);
  assert.throws(() => positionToMinterm({ layer: 0, row: 4, col: 0 }, 4), RangeError);
  assert.throws(() => positionToMinterm({ layer: 2, row: 0, col: 0 }, 5), RangeError);
});

test('two- through four-variable maps wrap along rows and columns', () => {
  assert.deepEqual(adjacentMinterms(0, 2), [1, 2]);
  assert.deepEqual(adjacentMinterms(0, 3), [1, 2, 4]);
  assert.deepEqual(adjacentMinterms(0, 4), [1, 2, 4, 8]);
  for (let n = 2; n <= 4; n += 1) {
    const layout = getLayout(n);
    const wrappedRow = positionToMinterm({ layer: 0, row: layout.rowCount - 1, col: 0 }, n);
    const wrappedCol = positionToMinterm({ layer: 0, row: 0, col: layout.columnCount - 1 }, n);
    assert.ok(adjacentMinterms(0, n).includes(wrappedRow));
    assert.ok(adjacentMinterms(0, n).includes(wrappedCol));
  }
});

test('five-variable layers connect matching positions', () => {
  for (let minterm = 0; minterm < 16; minterm += 1) {
    const across = minterm + 16;
    const { row, col } = mintermToPosition(minterm, 5);
    assert.deepEqual(mintermToPosition(across, 5), { layer: 1, row, col });
    assert.ok(adjacentMinterms(minterm, 5).includes(across));
    assert.ok(adjacentMinterms(across, 5).includes(minterm));
  }
  assert.deepEqual(adjacentMinterms(0, 5), [1, 2, 4, 8, 16]);
});

test('six-variable layers connect Gray neighbors with wraparound, never diagonals', () => {
  const layerNeighbors = [[1, 3], [0, 2], [1, 3], [0, 2]];
  for (let layer = 0; layer < 4; layer += 1) {
    const minterm = positionToMinterm({ layer, row: 3, col: 2 }, 6);
    const across = adjacentMinterms(minterm, 6)
      .map(neighbor => mintermToPosition(neighbor, 6))
      .filter(position => position.layer !== layer);
    assert.deepEqual(across.map(position => position.layer).sort(), layerNeighbors[layer]);
    assert.ok(across.every(position => position.row === 3 && position.col === 2));
  }
  assert.deepEqual(adjacentMinterms(0, 6), [1, 2, 4, 8, 16, 32]);
});

test('all adjacency lists are unique, symmetric, and differ by one variable', () => {
  for (let n = 2; n <= 6; n += 1) {
    for (let minterm = 0; minterm < 2 ** n; minterm += 1) {
      const neighbors = adjacentMinterms(minterm, n);
      assert.equal(new Set(neighbors).size, n);
      for (const neighbor of neighbors) {
        const difference = neighbor ^ minterm;
        assert.equal(difference & (difference - 1), 0);
        assert.ok(adjacentMinterms(neighbor, n).includes(minterm));
      }
    }
  }
});

test('Quine–McCluskey merges through multiple stages and removes duplicates', () => {
  assert.deepEqual(findPrimeImplicants(makeCells(4, [0, 1, 4, 5]), 4), [{
    bits: 0,
    mask: 5,
    pattern: '0-0-',
    minterms: [0, 1, 4, 5],
    literalCount: 2,
  }]);
  const primes = findPrimeImplicants(Array(64).fill(1), 6);
  assert.equal(primes.length, 1);
  assert.equal(primes[0].pattern, '------');
  assert.equal(primes[0].literalCount, 0);
  assert.equal(primes[0].minterms.length, 64);
});

test('unmergeable singletons remain primes', () => {
  const primes = findPrimeImplicants(makeCells(3, [0, 3, 5, 6]), 3);
  assert.deepEqual(primes.map(prime => prime.pattern), ['000', '011', '101', '110']);
  assert.ok(primes.every(prime => prime.literalCount === 3 && prime.minterms.length === 1));
});

test('prime generation uses X cells but discards X-only primes', () => {
  const cells = makeCells(3, [0], [1, 7]);
  assert.deepEqual(findPrimeImplicants(cells, 3).map(prime => prime.pattern), ['00-']);
  assert.deepEqual(findPrimeImplicants(Array(8).fill('X'), 3), []);
  assert.deepEqual(findPrimeImplicants(Array(8).fill(0), 3), []);
  assert.deepEqual(findPrimeImplicants(makeCells(2, [], [1, 2]), 2), []);
});

test('the concept example has all four primes, including an unneeded prime', () => {
  const cells = makeCells(4, [0, 1, 4, 5, 6, 8, 9, 10, 11]);
  const primes = findPrimeImplicants(cells, 4);
  assert.deepEqual(new Set(primes.map(prime => prime.pattern)), new Set([
    '-00-', '0-0-', '01-0', '10--',
  ]));
  for (const prime of primes) {
    assert.ok(prime.minterms.every(minterm => cells[minterm] === 1));
    assert.equal(prime.minterms.length, 2 ** (4 - prime.literalCount));
  }
});

test('POS primes group zeros and optional X cells, never ones', () => {
  const cells = [0, 'X', 1, 1];
  const primes = findPrimeImplicants(cells, 2, { form: 'POS' });
  assert.deepEqual(primes.map(prime => prime.pattern), ['0-']);
  assert.deepEqual(primes[0].minterms, [0, 1]);
});

test('prime generation validates the cell representation and form', () => {
  for (const cells of [[], Array(3).fill(0), '0000', [0, 1, 'x', 0], [0, 1, true, 0], Array(4)]) {
    assert.throws(() => findPrimeImplicants(cells, 2), TypeError);
  }
  assert.throws(() => findPrimeImplicants(Array(4).fill(0), 2, { form: 'sop' }), RangeError);
  assert.throws(() => findPrimeImplicants(Array(2).fill(0), 1), RangeError);
});

test('prime generation accepts frozen input and returns independent data', () => {
  const cells = Object.freeze(makeCells(4, [0, 1, 4, 5]));
  const first = findPrimeImplicants(cells, 4);
  first[0].minterms.push(15);
  assert.deepEqual(findPrimeImplicants(cells, 4)[0].minterms, [0, 1, 4, 5]);
});

test('constant SOP and POS follow the empty-target and full-map conventions', () => {
  for (let n = 2; n <= 6; n += 1) {
    for (const form of ['SOP', 'POS']) {
      for (const value of [0, 1, 'X']) {
        const cells = Array(2 ** n).fill(value);
        const result = solve(cells, n, { form });
        const expected = value === 'X' ? (form === 'SOP' ? '0' : '1') : String(value);
        assert.equal(result.expression, expected);
        assert.equal(result.literalCount, 0);
        assert.equal(result.termCount, value === (form === 'SOP' ? 1 : 0) ? 1 : 0);
        assertValidSolution(cells, n, result);
      }
    }
  }
  assert.equal(solve([0, 'X', 0, 'X'], 2).expression, '0');
  assert.equal(solve([1, 'X', 1, 'X'], 2).expression, '1');
  assert.equal(solve([0, 'X', 0, 'X'], 2, { form: 'POS' }).expression, '0');
  assert.equal(solve([1, 'X', 1, 'X'], 2, { form: 'POS' }).expression, '1');
});

test('formatting uses ordered variables, prime marks, and POS polarity', () => {
  assert.equal(formatImplicant({ bits: 4, mask: 2 }, 4), "A'BD'");
  assert.equal(formatImplicant({ bits: 4, mask: 2 }, 4, { form: 'POS' }), "(A + B' + D)");
  assert.equal(formatImplicant({ bits: 0, mask: 63 }, 6), '1');
  assert.equal(formatImplicant({ bits: 0, mask: 63 }, 6, { form: 'POS' }), '0');
  assert.equal(formatImplicant({ bits: 33, mask: 0 }, 6), "AB'C'D'E'F");
  assert.equal(solve(makeCells(2, [2, 3]), 2).expression, 'A');
  assert.throws(() => formatImplicant({ bits: 1, mask: 1 }, 2), RangeError);
  assert.throws(() => formatImplicant({ bits: 4, mask: 0 }, 2), RangeError);
});

test('minterm lists use sigma notation, ascending indices, and omit empty d()', () => {
  assert.equal(formatMintermList(makeCells(3, [4, 0, 1], [5, 2]), 3), 'F = Σm(0, 1, 4) + d(2, 5)');
  assert.equal(formatMintermList(makeCells(3, [4, 0, 1]), 3), 'F = Σm(0, 1, 4)');
  assert.equal(formatMintermList(Array(4).fill(0), 2), 'F = Σm()');
  assert.equal(formatMintermList(Array(4).fill('X'), 2), 'F = Σm() + d(0, 1, 2, 3)');
  const cells = makeCells(3, [0, 1, 4], [2, 5]);
  assert.equal(solve(cells, 3, { form: 'POS' }).mintermList, formatMintermList(cells, 3));
});

test('the concept example chooses the expected groups and minimal SOP', () => {
  const cells = makeCells(4, [0, 1, 4, 5, 6, 8, 9, 10, 11]);
  const result = solve(cells, 4);
  assert.deepEqual(new Set(result.expression.split(' + ')), new Set(["A'C'", "AB'", "A'BD'"]));
  assert.deepEqual(Object.fromEntries(result.groups.map(group => [group.term, group.minterms])), {
    "A'C'": [0, 1, 4, 5],
    "AB'": [8, 9, 10, 11],
    "A'BD'": [4, 6],
  });
  assert.equal(result.termCount, 3);
  assert.equal(result.literalCount, 7);
  assertValidSolution(cells, 4, result);
});

test('exact covering resolves a cyclic chart with no essential primes', () => {
  const cells = makeCells(3, [0, 1, 2, 5, 6, 7]);
  const primes = findPrimeImplicants(cells, 3);
  for (const minterm of [0, 1, 2, 5, 6, 7]) {
    assert.equal(primes.filter(prime => prime.minterms.includes(minterm)).length, 2);
  }
  const result = solve(cells, 3);
  assert.equal(result.termCount, 3);
  assert.equal(result.literalCount, 6);
  assertValidSolution(cells, 3, result);
  assert.deepEqual(solve(cells, 3), result);
});

test('equal-term covers are decided by total literals', () => {
  // This chart admits four-term covers costing either 11 or 12 literals.
  const cells = [1, 0, 1, 1, 1, 1, 0, 1, 1, 'X', 0, 'X', 0, 0, 0, 'X'];
  const result = solve(cells, 4);
  assert.equal(result.termCount, 4);
  assert.equal(result.literalCount, 11);
  assertValidSolution(cells, 4, result);
});

test('POS formats the hand example as a product of sums', () => {
  const cells = Array.from({ length: 16 }, (_, m) => Number(
    ((m & 8) !== 0 || (m & 2) === 0) && ((m & 4) !== 0 || (m & 1) !== 0)
  ));
  const result = solve(cells, 4, { form: 'POS' });
  assert.deepEqual(new Set(result.groups.map(group => group.term)), new Set(["(A + C')", '(B + D)']));
  assert.equal(result.expression, result.groups.map(group => group.term).join(''));
  assert.equal(result.termCount, 2);
  assert.equal(result.literalCount, 4);
  assertValidSolution(cells, 4, result);
});

test('POS and SOP agree for a simple function and its dual', () => {
  for (const [cells, sop, pos] of [
    [[0, 0, 0, 1], 'AB', '(A)(B)'],
    [[0, 1, 1, 1], 'A + B', '(A + B)'],
  ]) {
    const sopResult = solve(cells, 2);
    const posResult = solve(cells, 2, { form: 'POS' });
    assert.deepEqual(new Set(sopResult.expression.split(' + ')), new Set(sop.split(' + ')));
    assert.equal(posResult.expression, pos);
    assertValidSolution(cells, 2, sopResult);
    assertValidSolution(cells, 2, posResult);
  }
});

test('X cells can enlarge a group or remain unused, but no forbidden cell is claimed', () => {
  for (const form of ['SOP', 'POS']) {
    const target = form === 'SOP' ? 1 : 0;
    const forbidden = 1 - target;
    const enlarged = [target, 'X', forbidden, forbidden];
    const enlargedResult = solve(enlarged, 2, { form });
    assert.deepEqual(enlargedResult.groups[0].minterms, [0, 1]);
    assert.equal(enlargedResult.literalCount, 1);
    assertValidSolution(enlarged, 2, enlargedResult);
    const disconnected = [target, forbidden, forbidden, 'X'];
    const disconnectedResult = solve(disconnected, 2, { form });
    assert.deepEqual(disconnectedResult.groups[0].minterms, [0]);
    assert.equal(disconnectedResult.literalCount, 2);
    assertValidSolution(disconnected, 2, disconnectedResult);
  }
});

test('explanation data identifies fixed literals and dashed variables', () => {
  const cells = Object.freeze(makeCells(4, [0, 1, 4, 5]));
  const result = solve(cells, 4);
  const { kept, dropped } = result.groups[0].explanation;
  assert.deepEqual(kept.map(({ variable, value, literal }) => ({ variable, value, literal })), [
    { variable: 'A', value: 0, literal: "A'" }, { variable: 'C', value: 0, literal: "C'" },
  ]);
  assert.deepEqual(dropped.map(entry => entry.variable), ['B', 'D']);
  for (const entry of dropped) {
    assert.deepEqual(entry.values, [0, 1]);
    assert.match(entry.reason, /both 0 and 1/);
    assert.match(entry.reason, /dashed/);
  }
  const complemented = cells.map(value => 1 - value);
  const posGroup = solve(complemented, 4, { form: 'POS' }).groups[0];
  assert.deepEqual(posGroup.explanation.kept.map(entry => entry.literal), ['A', 'C']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  result.groups[0].explanation.dropped[0].values.push(2);
  assert.deepEqual(solve(cells, 4).groups[0].explanation.dropped[0].values, [0, 1]);
});
