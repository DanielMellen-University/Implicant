import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacentMinterms,
  getLayout,
  grayCode,
  mintermToPosition,
  positionToMinterm,
} from '../solver.js';

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
