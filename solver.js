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

function validateCells(cells, nVars) {
  validateVariableCount(nVars);
  if (!Array.isArray(cells) || cells.length !== 2 ** nVars) {
    throw new TypeError('cells must be an array of length 2 ** nVars.');
  }
  for (const value of cells) {
    if (value !== 0 && value !== 1 && value !== 'X') {
      throw new TypeError("Each cell must be 0, 1, or 'X'.");
    }
  }
}

function validateForm(form) {
  if (form !== 'SOP' && form !== 'POS') {
    throw new RangeError("form must be 'SOP' or 'POS'.");
  }
}

function countBits(value) {
  let count = 0;
  while (value !== 0) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

function cubeKey(bits, mask) {
  return `${bits}/${mask}`;
}

function cubeContains(cube, minterm) {
  return (minterm & ~cube.mask) === cube.bits;
}

function describeCube(cube, nVars) {
  let pattern = '';
  for (let index = 0; index < nVars; index += 1) {
    const bit = 1 << (nVars - index - 1);
    pattern += (cube.mask & bit) !== 0 ? '-' : String((cube.bits & bit) !== 0 ? 1 : 0);
  }
  const minterms = [];
  for (let minterm = 0; minterm < 2 ** nVars; minterm += 1) {
    if (cubeContains(cube, minterm)) minterms.push(minterm);
  }
  return {
    bits: cube.bits,
    mask: cube.mask,
    pattern,
    minterms,
    literalCount: nVars - countBits(cube.mask),
  };
}

/**
 * Quine–McCluskey prime implicants. cells[minterm] is 0, 1, or 'X'.
 * SOP groups 1s; POS groups 0s. X cells may enlarge either kind of group.
 * A cube has fixed `bits` and a `mask` whose set bits are dropped variables;
 * masked bits in `bits` are always zero. `pattern` lists A…F as 0/1/-.
 * `minterms` includes every cell in the cube, including any X cells.
 * Only maximal cubes containing at least one required cell are returned.
 */
export function findPrimeImplicants(cells, nVars, { form = 'SOP' } = {}) {
  validateCells(cells, nVars);
  validateForm(form);
  const target = form === 'SOP' ? 1 : 0;
  const required = [];
  let current = new Map();

  // Stage 1: start with singleton cubes for required cells and don't cares.
  for (let minterm = 0; minterm < cells.length; minterm += 1) {
    if (cells[minterm] === target) required.push(minterm);
    if (cells[minterm] === target || cells[minterm] === 'X') {
      current.set(cubeKey(minterm, 0), { bits: minterm, mask: 0 });
    }
  }
  if (required.length === 0) return [];

  const primes = [];
  while (current.size > 0) {
    const combined = new Set();
    const next = new Map();

    // Stage 2: merge cubes with identical dashes and one differing fixed bit.
    // Look up the partner with one additional 1; each pair is visited once.
    for (const [key, cube] of current) {
      for (let index = 0; index < nVars; index += 1) {
        const bit = 1 << index;
        if (((cube.bits | cube.mask) & bit) !== 0) continue;
        const partnerKey = cubeKey(cube.bits | bit, cube.mask);
        if (!current.has(partnerKey)) continue;

        combined.add(key);
        combined.add(partnerKey);
        const merged = { bits: cube.bits, mask: cube.mask | bit };
        // Different merge paths can create the same cube. Keep it only once.
        next.set(cubeKey(merged.bits, merged.mask), merged);
      }
    }

    // Stage 3: unmerged cubes are prime. X-only primes are never required.
    for (const [key, cube] of current) {
      if (!combined.has(key) && required.some(minterm => cubeContains(cube, minterm))) {
        primes.push(describeCube(cube, nVars));
      }
    }
    current = next;
  }

  // Numeric ordering makes repeat calls deterministic, including tied covers.
  return primes.sort((left, right) => left.bits - right.bits || left.mask - right.mask);
}

function mintermMask(minterms) {
  let mask = 0n;
  for (const minterm of minterms) mask |= 1n << BigInt(minterm);
  return mask;
}

function countCovered(mask) {
  let count = 0;
  while (mask !== 0n) {
    mask &= mask - 1n;
    count += 1;
  }
  return count;
}

function hasBetterCost(terms, literals, otherTerms, otherLiterals) {
  return terms < otherTerms || (terms === otherTerms && literals < otherLiterals);
}

/** Exact prime-chart covering: essentials first, then bounded search. */
function selectMinimumCover(primes, required) {
  // BigInt keeps all 64 minterm bits exact; JS number bitwise operations stop
  // at 32 bits. These masks stay internal, so result data is JSON-compatible.
  let remaining = mintermMask(required);
  const candidates = primes.map((prime, index) => ({
    index,
    coverage: mintermMask(prime.minterms) & remaining,
    literals: prime.literalCount,
  }));
  const chart = required.map(minterm => {
    const bit = 1n << BigInt(minterm);
    return { bit, choices: candidates.filter(candidate => (candidate.coverage & bit) !== 0n) };
  });

  // Stage 1: a cell with only one covering prime forces that essential prime.
  const essentials = new Set();
  for (const row of chart) {
    if (row.choices.length === 1) essentials.add(row.choices[0].index);
  }
  for (const index of essentials) remaining &= ~candidates[index].coverage;
  if (remaining === 0n) return [...essentials].map(index => primes[index]);

  // Stage 2: discard candidates dominated on the remaining required cells.
  // A superset at no greater literal cost can always replace a subset.
  const useful = candidates.filter(candidate => (candidate.coverage & remaining) !== 0n);
  const reduced = useful.filter(candidate => !useful.some(other => {
    if (other.index === candidate.index || other.literals > candidate.literals) return false;
    const coverage = candidate.coverage & remaining;
    const otherCoverage = other.coverage & remaining;
    if ((coverage | otherCoverage) !== otherCoverage) return false;
    return coverage !== otherCoverage || other.literals < candidate.literals || other.index < candidate.index;
  }));
  const rows = chart.filter(row => (row.bit & remaining) !== 0n).map(row => {
    const choices = reduced.filter(candidate => (candidate.coverage & row.bit) !== 0n);
    return { bit: row.bit, choices, choiceMask: mintermMask(choices.map(candidate => candidate.index)) };
  });
  rows.sort((left, right) => left.choices.length - right.choices.length);

  function rankedChoices(choices, uncovered) {
    return choices.map(candidate => ({ candidate, gain: countCovered(candidate.coverage & uncovered) }))
      .sort((left, right) => right.gain - left.gain || left.candidate.literals - right.candidate.literals)
      .map(entry => entry.candidate);
  }

  // Stage 3: a quick greedy cover gives an upper bound, never the final rule.
  let greedyRemaining = remaining;
  let best = [];
  let bestLiterals = 0;
  while (greedyRemaining !== 0n) {
    const candidate = rankedChoices(reduced, greedyRemaining)[0];
    best.push(candidate.index);
    bestLiterals += candidate.literals;
    greedyRemaining &= ~candidate.coverage;
  }

  // Stage 4: branch on the most constrained uncovered cell. Every valid cover
  // contains one of its primes, so exploring all these branches is exact.
  const visited = new Map();
  const cheapestLiteralCount = Math.min(...reduced.map(candidate => candidate.literals));
  function search(uncovered, chosen, literals) {
    if (uncovered === 0n) {
      if (hasBetterCost(chosen.length, literals, best.length, bestLiterals)) {
        best = [...chosen];
        bestLiterals = literals;
      }
      return;
    }
    if (chosen.length >= best.length) return;

    // Reaching the same remaining chart at a worse cost cannot improve it.
    const previous = visited.get(uncovered);
    if (previous && !hasBetterCost(chosen.length, literals, previous.terms, previous.literals)) return;
    visited.set(uncovered, { terms: chosen.length, literals });

    // Lower bounds: maximum possible gain, plus a packing of cells whose
    // covering-prime sets are disjoint (each needs a distinct new term).
    let largestGain = 0;
    for (const candidate of reduced) {
      largestGain = Math.max(largestGain, countCovered(candidate.coverage & uncovered));
    }
    let packedTerms = 0;
    let packedLiterals = 0;
    let usedChoices = 0n;
    let branchRow;
    for (const row of rows) {
      if ((row.bit & uncovered) === 0n) continue;
      if (!branchRow) branchRow = row;
      if ((row.choiceMask & usedChoices) === 0n) {
        packedTerms += 1;
        packedLiterals += Math.min(...row.choices.map(candidate => candidate.literals));
        usedChoices |= row.choiceMask;
      }
    }
    const minimumTerms = Math.max(packedTerms, Math.ceil(countCovered(uncovered) / largestGain));
    const minimumLiterals = Math.max(packedLiterals, minimumTerms * cheapestLiteralCount);
    if (!hasBetterCost(chosen.length + minimumTerms, literals + minimumLiterals, best.length, bestLiterals)) return;

    for (const candidate of rankedChoices(branchRow.choices, uncovered)) {
      chosen.push(candidate.index);
      search(uncovered & ~candidate.coverage, chosen, literals + candidate.literals);
      chosen.pop();
    }
  }
  search(remaining, [], 0);
  return [...essentials, ...best].sort((left, right) => left - right).map(index => primes[index]);
}

/** Format a cube's fixed bits as an SOP term or a parenthesized POS clause. */
export function formatImplicant({ bits, mask }, nVars, { form = 'SOP' } = {}) {
  validateVariableCount(nVars);
  validateForm(form);
  validateIndex(bits, 2 ** nVars, 'bits');
  validateIndex(mask, 2 ** nVars, 'mask');
  if ((bits & mask) !== 0) throw new RangeError('Masked bits must be zero in bits.');
  const literals = [];
  for (let index = 0; index < nVars; index += 1) {
    const bit = 1 << (nVars - index - 1);
    if ((mask & bit) !== 0) continue;
    const value = (bits & bit) !== 0 ? 1 : 0;
    const complemented = form === 'SOP' ? value === 0 : value === 1;
    literals.push(VARIABLES[index] + (complemented ? "'" : ''));
  }
  if (literals.length === 0) return form === 'SOP' ? '1' : '0';
  return form === 'SOP' ? literals.join('') : `(${literals.join(' + ')})`;
}

/** Conventional sum-of-minterms notation; an empty d(...) part is omitted. */
export function formatMintermList(cells, nVars) {
  validateCells(cells, nVars);
  const ones = [];
  const dontCares = [];
  for (let minterm = 0; minterm < cells.length; minterm += 1) {
    if (cells[minterm] === 1) ones.push(minterm);
    if (cells[minterm] === 'X') dontCares.push(minterm);
  }
  const suffix = dontCares.length === 0 ? '' : ` + d(${dontCares.join(', ')})`;
  return `F = Σm(${ones.join(', ')})${suffix}`;
}

function explainGroup(prime, nVars, form) {
  const kept = [];
  const dropped = [];
  for (let index = 0; index < nVars; index += 1) {
    const variable = VARIABLES[index];
    const value = prime.pattern[index];
    if (value === '-') {
      dropped.push({
        variable,
        values: [0, 1],
        reason: `The group includes both 0 and 1 for ${variable}; its bit is dashed.`,
      });
    } else {
      const complemented = form === 'SOP' ? value === '0' : value === '1';
      kept.push({
        variable,
        value: Number(value),
        literal: variable + (complemented ? "'" : ''),
        reason: `Every cell in the group has ${variable}=${value}.`,
      });
    }
  }
  return { kept, dropped };
}

/**
 * Minimize cells[minterm] (0, 1, or 'X'), using ABCDEF from most to least
 * significant bit. form defaults to 'SOP'; 'POS' minimizes the zero groups.
 * Cost is fewest groups, then fewest total literals; equal-cost ties are
 * deterministic. Groups include bits/mask/pattern/minterms/literalCount,
 * their formatted term, and explanations with kept/dropped variable data.
 * An empty target set has no groups (SOP '0', POS '1'). A full-map group has
 * one term and zero literals (SOP '1', POS '0'). X cells are never required.
 * mintermList always describes the input ones, including when form is POS.
 */
export function solve(cells, nVars, { form = 'SOP' } = {}) {
  const primes = findPrimeImplicants(cells, nVars, { form });
  const target = form === 'SOP' ? 1 : 0;
  const required = [];
  for (let minterm = 0; minterm < cells.length; minterm += 1) {
    if (cells[minterm] === target) required.push(minterm);
  }
  const selected = selectMinimumCover(primes, required);
  const groups = selected.map(prime => ({
    ...prime,
    term: formatImplicant(prime, nVars, { form }),
    explanation: explainGroup(prime, nVars, form),
  }));
  const expression = groups.length === 0
    ? (form === 'SOP' ? '0' : '1')
    : groups.map(group => group.term).join(form === 'SOP' ? ' + ' : '');
  return {
    form,
    expression,
    groups,
    termCount: groups.length,
    literalCount: groups.reduce((total, group) => total + group.literalCount, 0),
    mintermList: formatMintermList(cells, nVars),
  };
}
