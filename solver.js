/**
 * Pure Karnaugh-map helpers and Boolean minimization for 2–6 variables.
 * A is the most significant bit; cell array indices are minterm numbers.
 * Nothing in this module depends on a browser, Node, or mutable global state.
 */
const VARIABLES = 'ABCDEF';

function validateVariableCount(nVars) {
  if (!Number.isInteger(nVars) || nVars < 2 || nVars > 6) {
    throw new RangeError('nVars must be an integer from 2 to 6.');
  }
}

function validateIndex(value, count, name) {
  if (!Number.isInteger(value) || value < 0 || value >= count) {
    throw new RangeError(`${name} must be an integer from 0 to ${count - 1}.`);
  }
}

/** Binary-reflected Gray order, including the useful zero-bit order [0]. */
export function grayCode(bitCount) {
  if (!Number.isInteger(bitCount) || bitCount < 0 || bitCount > 2) {
    throw new RangeError('bitCount must be 0, 1, or 2.');
  }
  return Array.from({ length: 2 ** bitCount }, (_, index) => index ^ (index >> 1));
}

function grayHeaders(bitCount) {
  return grayCode(bitCount).map(value => (
    bitCount === 0 ? '' : value.toString(2).padStart(bitCount, '0')
  ));
}

/**
 * Return fresh layout/header data. Layer indices follow layerHeaders in Gray
 * order. layerPositions places those layers in the outer grid (2×2 for n=6).
 * The zero-bit layer of n=2–4 has header '' and position { row: 0, col: 0 }.
 */
export function getLayout(nVars) {
  validateVariableCount(nVars);
  const layerBits = Math.max(0, nVars - 4);
  const rowBits = nVars <= 3 ? 1 : 2;
  const columnBits = nVars - layerBits - rowBits;
  const layerOrder = grayCode(layerBits);

  return {
    layerVariables: VARIABLES.slice(0, layerBits),
    rowVariables: VARIABLES.slice(layerBits, layerBits + rowBits),
    columnVariables: VARIABLES.slice(layerBits + rowBits, nVars),
    layerCount: 2 ** layerBits,
    rowCount: 2 ** rowBits,
    columnCount: 2 ** columnBits,
    layerHeaders: grayHeaders(layerBits),
    rowHeaders: grayHeaders(rowBits),
    columnHeaders: grayHeaders(columnBits),
    layerPositions: layerOrder.map(value => ({
      row: layerBits === 2 ? value >> 1 : 0,
      col: value & 1,
    })),
  };
}

/** Map a minterm to zero-based { layer, row, col } Gray-order indices. */
export function mintermToPosition(minterm, nVars) {
  const layout = getLayout(nVars);
  validateIndex(minterm, 2 ** nVars, 'minterm');
  const columnBits = layout.columnVariables.length;
  const rowBits = layout.rowVariables.length;
  const layerValue = minterm >> (columnBits + rowBits);
  const rowValue = (minterm >> columnBits) & (layout.rowCount - 1);
  const columnValue = minterm & (layout.columnCount - 1);

  return {
    layer: grayCode(layout.layerVariables.length).indexOf(layerValue),
    row: grayCode(rowBits).indexOf(rowValue),
    col: grayCode(columnBits).indexOf(columnValue),
  };
}

/** Inverse of mintermToPosition; accepts Gray-order indices, not bit values. */
export function positionToMinterm({ layer, row, col }, nVars) {
  const layout = getLayout(nVars);
  validateIndex(layer, layout.layerCount, 'layer');
  validateIndex(row, layout.rowCount, 'row');
  validateIndex(col, layout.columnCount, 'col');
  const layerValue = grayCode(layout.layerVariables.length)[layer];
  const rowValue = grayCode(layout.rowVariables.length)[row];
  const columnValue = grayCode(layout.columnVariables.length)[col];

  return (layerValue << (layout.rowVariables.length + layout.columnVariables.length))
    | (rowValue << layout.columnVariables.length)
    | columnValue;
}

/**
 * Sorted K-map neighbors. Flipping each variable is exactly Gray adjacency:
 * it includes inner-grid wraparound and same-position neighboring layers.
 */
export function adjacentMinterms(minterm, nVars) {
  validateVariableCount(nVars);
  validateIndex(minterm, 2 ** nVars, 'minterm');
  const neighbors = [];
  for (let bit = 0; bit < nVars; bit += 1) {
    neighbors.push(minterm ^ (1 << bit));
  }
  return neighbors.sort((left, right) => left - right);
}
