// A compact four-variable minimizer. Each cube uses 0, 1, or 2 (don't care)
// for A, B, C, and D. It has no browser or DOM dependencies.

const VARIABLE_NAMES = ['A', 'B', 'C', 'D'];
const MINTERMS = Array.from({ length: 16 }, (_, minterm) => minterm);

function bitsOf(minterm) {
  return [3, 2, 1, 0].map((shift) => (minterm >> shift) & 1);
}

function cubeCells(pattern) {
  return MINTERMS.filter((minterm) => {
    const bits = bitsOf(minterm);
    return pattern.every((bit, index) => bit === 2 || bit === bits[index]);
  });
}

function cubeTerm(pattern) {
  return pattern
    .map((bit, index) => bit === 2 ? '' : `${VARIABLE_NAMES[index]}${bit === 0 ? '′' : ''}`)
    .join('') || '1';
}

function literalCount(pattern) {
  return pattern.filter((bit) => bit !== 2).length;
}

function enumeratePrimeImplicants(values) {
  const implicants = [];

  // Four positions with three possible values gives only 3^4 = 81 cubes.
  for (let code = 0; code < 81; code += 1) {
    let remainder = code;
    const pattern = Array(4);
    for (let index = 3; index >= 0; index -= 1) {
      pattern[index] = remainder % 3;
      remainder = Math.floor(remainder / 3);
    }

    const cells = cubeCells(pattern);
    const allowed = cells.every((minterm) => values[minterm] !== 0);
    const useful = cells.some((minterm) => values[minterm] === 1);
    if (allowed && useful) implicants.push({ pattern, cells, term: cubeTerm(pattern) });
  }

  // An implicant is prime when no larger allowed cube contains all its cells.
  return implicants.filter((candidate) => !implicants.some((other) =>
    other.cells.length > candidate.cells.length &&
    candidate.cells.every((minterm) => other.cells.includes(minterm))
  ));
}

function exactCover(primes, required) {
  const requiredSet = new Set(required);
  const candidates = primes.map((prime, index) => ({
    ...prime,
    index,
    covers: prime.cells.filter((minterm) => requiredSet.has(minterm)),
    literals: literalCount(prime.pattern),
  })).filter((prime) => prime.covers.length > 0);

  const byMinterm = new Map(required.map((minterm) => [
    minterm,
    candidates.filter((candidate) => candidate.covers.includes(minterm)),
  ]));

  // Add all forced primes first. Then search only the remaining cover choices.
  const selected = new Set();
  let covered = new Set();
  for (const minterm of required) {
    const options = byMinterm.get(minterm);
    if (options.length === 1) selected.add(options[0].index);
  }
  for (const prime of candidates) {
    if (selected.has(prime.index)) {
      for (const minterm of prime.covers) covered.add(minterm);
    }
  }

  let best = null;
  let bestLiterals = Infinity;

  function search(chosen, coveredNow, literalTotal) {
    if (coveredNow.size === requiredSet.size) {
      if (best === null || chosen.length < best.length ||
          (chosen.length === best.length && literalTotal < bestLiterals)) {
        best = chosen.slice();
        bestLiterals = literalTotal;
      }
      return;
    }
    if (best && chosen.length >= best.length) return;

    // Branch on the hardest uncovered minterm (fewest available implicants).
    let targetOptions = null;
    for (const minterm of required) {
      if (coveredNow.has(minterm)) continue;
      const options = byMinterm.get(minterm).filter((candidate) => !chosen.includes(candidate));
      if (targetOptions === null || options.length < targetOptions.length) targetOptions = options;
    }
    if (!targetOptions?.length) return;

    targetOptions.sort((left, right) =>
      right.covers.filter((minterm) => !coveredNow.has(minterm)).length -
      left.covers.filter((minterm) => !coveredNow.has(minterm)).length ||
      left.literals - right.literals || left.index - right.index
    );

    for (const candidate of targetOptions) {
      const nextCovered = new Set(coveredNow);
      for (const minterm of candidate.covers) nextCovered.add(minterm);
      search([...chosen, candidate], nextCovered, literalTotal + candidate.literals);
    }
  }

  const essentialCandidates = candidates.filter((candidate) => selected.has(candidate.index));
  search(essentialCandidates, covered, essentialCandidates.reduce((sum, item) => sum + item.literals, 0));

  // The search always has a cover for valid input; this keeps a safe fallback.
  return (best ?? essentialCandidates).sort((left, right) =>
    right.cells.length - left.cells.length || left.index - right.index
  );
}

/**
 * Minimize a 16-cell map. Values are 0, 1, and 2 (X), indexed by minterm.
 * Returns chosen implicants, each with `pattern`, `cells`, and `term`, plus the
 * final expression. Don't-cares may enlarge groups but are never required.
 */
export function solve4(values) {
  if (!Array.isArray(values) || values.length !== 16 ||
      values.some((value) => value !== 0 && value !== 1 && value !== 2)) {
    throw new TypeError('solve4 expects an array of 16 values, each 0, 1, or 2.');
  }

  const required = MINTERMS.filter((minterm) => values[minterm] === 1);
  if (required.length === 0) return { groups: [], expression: '0' };
  if (values.every((value) => value !== 0)) {
    return { groups: [{ pattern: [2, 2, 2, 2], cells: MINTERMS, term: '1' }], expression: '1' };
  }

  const primes = enumeratePrimeImplicants(values);
  const groups = exactCover(primes, required);
  return {
    groups,
    expression: groups.map((group) => group.term).join(' + ') || '0',
  };
}
