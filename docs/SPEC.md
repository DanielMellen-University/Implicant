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
- The live minimal expression defaults to SOP and uses prime marks for complements, as in `F = B′D′ + BD`. A visible SOP / POS switch changes the minimized form; POS minimizes zero groups and labels the result `Minimal POS`.
- Output is `0` if there are no 1s, and `1` if everything is covered.
- Quine–McCluskey finds prime implicants. X cells are usable but never required.
- Essential primes are selected first, then an exact smallest cover is chosen. The solver must stay responsive at 64 cells.
- Randomize fills the current map by giving every cell an independent 1/3 chance of 0, 1, or X. Clear sets every cell to 0.
- The minterm list reports the input ones as `F = Σm(...)` and includes `+ d(...)` only when there are don't cares.
- The truth table lists every input combination. Its F buttons update the same canonical map values, and map edits immediately update the corresponding table row.
- The collapsible explanation panel explains the kept and dropped variables for a legend group. Selecting a group outlines its cells and opens the explanation.
- The URL query stores variable count (`v`), cell values (`cells`, encoded as 0 / 1 / 2 for 0 / 1 / X), and form (`form`). State updates with `replaceState`, so painting does not fill browser history. Invalid state returns to the default four-variable example.

## Visualization

- Cell fills identify values: slate for 0, teal for 1, and amber for X. Group colors stay assigned while a term remains in the solution. A strip along the bottom of each grouped cell shows one segment per membership.
- The legend shows a swatch, term, and covered cell count. Selecting a legend row outlines its cells, including cells on other layers.
- 5- and 6-variable maps always show every layer, each with a small label above it (A=0 / A=1, or AB=00 and the other Gray-code labels). On a wide screen, 5-variable layers sit side by side and 6-variable layers use a 2×2 Gray-code arrangement. On a phone, the layers stack vertically. There are no layer tab buttons.

## UI

- The app is dark-only and uses a warm charcoal palette: background `#1f1e1d`, surface `#2c2c2a`, and text `#f1efe8`. `color-scheme: dark` and the browser theme color stay on `#1f1e1d`.
- Flat and minimal: 0.5px borders, 8px radius, generous spacing, no gradients or shadows.
- Touch targets are at least 44px. Controls have instant active feedback and do not rely on hover.
- The map and live answer are visible on load with the four-variable example. Extras are in clearly labeled collapsible panels so the demo remains immediately playable.
- The current controls are the 2–6 variable selector, 0 / 1 / X paint selector, touch Cycle taps control, Randomize, and Clear.
- The legend outlines the selected group across layers.
- The 6-variable truth table is contained in a scrollable region. Layouts fit narrow phones without reducing map cells below 44px or introducing horizontal page overflow.

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

### Milestone 4: solver extras

- SOP / POS toggle, minterm list, synchronized truth table, group explanations, and shareable URL state.

## Code quality

Code must stay readable and lightly commented. The author needs to explain the solver clearly in interviews.
