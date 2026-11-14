# Implicant specification

Interactive Karnaugh map solver. A genuinely nice, simple, touch-friendly portfolio piece with a live GitHub Pages demo.

Visual direction (from the approved concept): dark theme, minterm numbers in the top-left of each cell, tinted group cells with colored dots, live output like `F = A'C' + AB' + A'BD'`, and a group legend with a swatch, term, and cell count.

## Stack

- HTML, CSS, and vanilla JavaScript. No framework and no build step.
- `index.html` is the app shell.
- `solver.js` is pure logic with no DOM. It is an ES module usable from both the browser and Node.
- Render / UI JavaScript is kept in a separate file from the solver.
- Tests use `node --test` with no dependencies.

## Variables and layouts

Support 2, 3, 4, 5, and 6 variables.

| Variables | Layout |
|-----------|--------|
| 2 | 2x2. A rows, B columns. |
| 3 | 2x4. A rows, BC columns. |
| 4 | 4x4. AB rows, CD columns. |
| 5 | Two 4x4 layers, A=0 and A=1. Same-position cells are adjacent across layers. |
| 6 | Four 4x4 layers in a 2x2 arrangement labeled AB in Gray-code order. Gray-adjacent layers are neighbors, with wraparound. |

Gray-code headers everywhere. Wraparound on all edges within a layer.

## Cells and interaction

- Tap a cell to cycle `0`, `1`, `X` (don't care).
- Each cell shows its minterm number, small, typically in the top-left.
- Live minimal SOP output updates on every tap, in the style `F = B'D' + BD`: prime marks for complements, `' + '` joins.
- Output is `'0'` if there are no 1s, and `'1'` if everything is covered.
- Quine-McCluskey finds prime implicants. Don't cares (`X`) are usable but never required.
- Essential primes first, then a smallest exact cover (Petrick's method or branch and bound). This must stay lag-free at 64 cells.

## Visualization

- Each chosen group has its own color.
- Grouped cells get a tint plus a small colored dot per group membership. Overlapping groups are allowed, so a cell may have several dots.
- Legend below the map: color swatch, term, and cell count.
- Tapping a legend group outlines its cells.
- Presets for each variable count, plus a Clear button.

## Must-have extras

- SOP / POS toggle (POS groups 0s).
- Minterm list in the form `F = Σm(...) + d(...)`.
- Truth table view, synced both ways with the map.
- Explanation panel showing why each group drops each variable.

## UI

- Mobile-first.
- Light and dark themes via CSS variables, following `prefers-color-scheme`, plus a manual toggle.
- Flat and minimal: 0.5px borders, rounded corners, generous spacing. No gradients or shadows.
- Touch targets at least 44px. Instant tap feedback. No hover-only controls.
- The 6-variable map on a phone uses layer tabs or swipe, not shrunken cells.
- Map and answer are visible on load with no setup. Variable count is one segmented row. Extras live in collapsible panels. A new user can solve something in under 10 seconds without instructions.
- Optional: shareable URL state.

## Tests and CI

- Solver checked against a brute-force minimal cover for every 2- and 3-variable function, including don't cares where feasible.
- Known 4-, 5-, and 6-variable cases.
- Adjacency and Gray-code tests.
- POS tests.
- CI runs the tests with GitHub Actions (`node --test`).

## Later milestones (not part of the first solver or mockup PRs)

- GitHub Pages deploy workflow on every merge to `main`.
- README in the bandctl style: badges, one-line pitch, live demo link, hero GIF or screenshot, feature bullets, how the solver works (QM + cover), architecture sketch, screenshots for light / dark / phone, honest limitations, MIT license.
- `v1.0.0` release.

## Code quality

Code must stay readable and well commented. The author needs to explain the solver clearly in interviews.
