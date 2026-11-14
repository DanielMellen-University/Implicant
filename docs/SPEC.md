# Implicant specification

Implicant is an interactive Karnaugh map solver with a live GitHub Pages demo.

## Stack

- HTML, CSS, and vanilla JavaScript. No framework and no build step.
- `index.html` is the app shell.
- `solver.js` is pure logic with no DOM. It is an ES module usable from the browser and Node.
- Rendering and UI behavior stay in `ui.js`.
- Tests use `node --test` with no dependencies.

## Variables and layouts

The app supports 2, 3, 4, 5, and 6 variables. The header's segmented control selects the map size, with four variables selected at first load.

| Variables | Layout |
|-----------|--------|
| 2 | 2×2. A rows, B columns. |
| 3 | 2×4. A rows, BC columns. |
| 4 | 4×4. AB rows, CD columns. |
| 5 | Two 4×4 layers, A=0 and A=1. Same-position cells are adjacent across layers; BC rows and DE columns. |
| 6 | Four 4×4 layers in a 2×2 arrangement labeled AB in Gray-code order. CD rows and EF columns. |

Every axis uses Gray-code headers. Map cells use `positionToMinterm` and `mintermToPosition` so displayed minterm numbers and solver inputs stay aligned. Wraparound applies to all edges within a layer, and layer adjacency follows the solver's Gray layout.

## Cells and interaction

- The 0 / 1 / X selector chooses a paint value. Mouse clicks and click-drag paint cells with that value. Touch devices can toggle Cycle taps or choose a paint value to paint; the paint selector stays available.
- Changing the variable count creates a cleared map. The initial four-variable map starts with an interesting example.
- Each cell shows its minterm number, small, at the top-left.
- The live minimal SOP output uses prime marks for complements, as in `F = B′D′ + BD`.
- Output is `0` if there are no 1s, and `1` if everything is covered.
- Quine–McCluskey finds prime implicants. X cells are usable but never required.
- Essential primes are selected first, then an exact smallest cover is chosen. The solver must stay responsive at 64 cells.
- Randomize fills the current map with mostly 0 and 1 values and a few X values. Clear sets every cell to 0.

## Visualization

- Each chosen group has its own color.
- Grouped cells get a tint plus a small colored dot per group membership. Overlapping groups are allowed, so a cell may have several dots.
- The legend shows a swatch, term, and covered cell count. Selecting a legend row outlines its cells, including cells on other layers.
- Layer tabs are at least 44px tall. On narrow screens, 5- and 6-variable maps show one layer at a time; tabs mark layers that contain outlined cells. On wide screens, both 5-variable layers and all four 6-variable layers are visible.

## UI

- The app uses a warm charcoal palette: background `#1f1e1d`, surface `#2c2c2a`, and text `#f1efe8`.
- Flat and minimal: 0.5px borders, 8px radius, generous spacing, no gradients or shadows.
- Touch targets are at least 44px. Controls have instant active feedback and do not rely on hover.
- The map and live answer are visible on load. A new user can solve something in under 10 seconds without instructions.
- SOP / POS toggle, minterm list, truth table, explanations, and shareable URL state are later milestone features.

## Future solver validation and CI

- Solver checked against a brute-force minimal cover for every 2- and 3-variable function, including don't cares where feasible.
- Known 4-, 5-, and 6-variable cases.
- Adjacency and Gray-code tests.
- POS tests.
- CI runs the tests with GitHub Actions (`node --test`).

## Milestones

### Milestone 1: playable four-variable app and Pages

- A root-level `index.html`, separate CSS and UI JavaScript, and a small solver module.
- A playable 4×4 map with cell editing, live minimal SOP, exact smallest cover, colored groups, and selectable group rows.
- GitHub Pages deployment on pushes to `main`, publishing the browser app files.

### Milestone 3: maps for 2–6 variables

- Gray-code layouts for 2, 3, 4, 5, and 6 variables using the shared solver helpers.
- Variable-count and paint selectors, touch cycling, map randomization and clearing, responsive layer layouts, and live SOP output.

### Later extras

- SOP / POS toggle, minterm list, truth table, explanations, and shareable URL state.

## Code quality

Code must stay readable and lightly commented. The author needs to explain the solver clearly in interviews.
