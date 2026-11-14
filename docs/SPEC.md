# How Implicant Works

[Repository overview](../README.md) · [User Guide](GUIDE.md)

## Architecture

| Component | Responsibility |
| --- | --- |
| [`index.html`](../index.html) and [`styles.css`](../styles.css) | Controls, responsive layout, and map presentation. |
| [`ui.js`](../ui.js) | Map and truth-table editing, URL state, and rendering of the current solution. |
| [`solver.js`](../solver.js) | Gray-code layouts, prime generation, exact cover, expression formatting, and group explanations. |
| [`helpers.js`](../helpers.js) | Overlap-aware group colors and random fill. |

```text
Map or truth-table edit
          ↓
Canonical array indexed by minterm
          ↓
Quine-McCluskey primes → exact minimum cover
          ↓
Expression, highlighted groups, minterms, and explanations
```

The browser owns the input state. Both editors update the same array, where each index is a binary input interpreted as an integer with `A` as the most significant bit. The pure solver accepts `0`, `1`, and `'X'`, and returns plain data that can be rendered in the browser or checked in Node.js.

## Layout and adjacency

| Variables | Map | Layer labels | Rows | Columns |
| --- | --- | --- | --- | --- |
| 2 | One 2 × 2 grid | | A | B |
| 3 | One 2 × 4 grid | | A | BC |
| 4 | One 4 × 4 grid | | AB | CD |
| 5 | Two 4 × 4 grids | A | BC | DE |
| 6 | Four 4 × 4 grids | AB | CD | EF |

A two-bit axis runs `00, 01, 11, 10`. The position helpers translate between these display coordinates and the numeric minterm. For example, in a four-variable map, row `01` and column `10` give binary `0110`, or minterm 6. Neighbors differ by one bit and may wrap around an edge or cross layers.

## Minimization

1. **Build prime groups.** Quine-McCluskey starts with single cells for the required value and any don't-cares. It merges patterns that agree in every fixed bit except one and already omit the same variables. A group that cannot merge further is a prime. It must cover at least one required cell.
2. **Cover the required cells.** A required cell covered by a single prime makes that prime essential. After choosing the essentials, the solver drops candidates that cover a subset at equal or higher literal cost. A greedy cover provides an initial upper bound. The exact search branches on the uncovered cell with the fewest remaining choices and prunes branches whose lower bounds cannot improve the current best result.
3. **Write the expression.** The solver minimizes the number of terms, then the total number of literals. It returns one deterministic minimum cover. SOP groups the ones and uses complemented literals for fixed zeros. POS groups the zeros and uses complemented literals for fixed ones. A variable that changes within a group drops out in either form.

Coverage uses `BigInt` bitsets internally so all 64 positions fit. Expressions, terms, minterms, and explanation data remain JSON-compatible.

### Worked example

Start with [the four-variable example](https://danielmellen-university.github.io/Implicant/?v=4&cells=1100110011110000&form=SOP), where the ones are at `0, 1, 4, 5, 8, 9, 10, 11`.

| Group | Binary pattern | Fixed variables | SOP term |
| --- | --- | --- | --- |
| `0, 1, 4, 5` | `0-0-` | `A = 0`, `C = 0` | `A′C′` |
| `8, 9, 10, 11` | `10--` | `A = 1`, `B = 0` | `AB′` |

The sum is `F = A′C′ + AB′`. For the same inputs, grouping the zeros gives `F = (A + C′)(A′ + B′)`. Use **Why-Groups** to inspect the fixed variables behind each term.

## Visual groups and shared URLs

The view retains a surviving term's color while you edit. New groups use palette order unless they overlap a colored group. In that case, the view chooses the unused tint with the greatest OKLab distance from its closest overlapping neighbor. A cell covered by multiple terms divides its fill into one equal segment per group.

A URL such as `?v=4&cells=1100110011110000&form=SOP` stores the variable count, outputs in minterm order, and expression form. In the URL, `2` encodes a don't-care. A fresh visit or invalid state opens a cleared four-variable map. The app replaces the current history entry as you edit so a drag does not create a series of Back entries.

## Verification

| Suite | What it checks |
| --- | --- |
| [Solver tests](../tests/solver.test.js) | All 6,642 possible two- and three-variable `0/1/X` assignments in both forms against an independent minimum-cover implementation. Also checks seeded larger cases, expression equivalence, Gray-code adjacency, constants, and layer-spanning groups. |
| [Helper tests](../tests/helpers.test.js) | Stable color assignments, reuse of freed colors, overlap separation, random fill, and unique colors for the 32-term checkerboard. |
| [Browser tests](../tests/browser/workspace.spec.js) | Map and truth-table synchronization, URL restoration, Cycle, group selection across layers, and full rendering of 32-term SOP and POS. Runs in desktop Chromium and with a mobile touch profile. |

The independent solver enumerates all possible cubes and computes the least expensive cover of the required cells. That gives the small-map tests a reference independent of Implicant's prime generation and branch-and-bound search.

Implicant supports single-output functions with two to six variables and returns one minimum cover for the requested form.
