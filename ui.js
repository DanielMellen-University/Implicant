import { getLayout, positionToMinterm, solve } from './solver.js';
import { colorsForGroups, randomizeValues } from './helpers.js?v=3';
const initialValues = [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0];
let nVars = 4;
let values = [...initialValues];
let selectedGroup = -1;
let selectedPaint = 0;
let paintingPointer = null;
let pendingTouch = null;
let cycleTaps = true;
let form = 'SOP';
let groupColors = new Map();
let activeView = 'groups';
let mapCells = [];

const narrowLayout = window.matchMedia('(max-width: 879px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const touchLayout = window.matchMedia('(any-pointer: coarse)');
const tintAnimations = new WeakMap();
const viewButtons = document.querySelectorAll('[data-view]');
const viewBar = document.querySelector('.views');
const mapPanel = document.querySelector('#map-panel');
const panels = new Map([...viewButtons].map(button => [
  button.dataset.view, document.getElementById(button.getAttribute('aria-controls')),
]));

const map = document.querySelector('#kmap');
const expression = document.querySelector('#expression');
const legend = document.querySelector('#legend');
const variableControl = document.querySelector('#variable-count');
const truthTable = document.querySelector('#truth-table');
const mintermList = document.querySelector('#minterm-list');
const explanation = document.querySelector('#explanation');
const groupHint = document.querySelector('#group-hint');
const whyHint = document.querySelector('#why-hint');
const mapHint = document.querySelector('#map-hint');
const truthHint = document.querySelector('#truth-hint');
const cycleButton = document.querySelector('#cycle-mode');
const answerLabel = document.querySelector('#answer-label');

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  if (![...params.keys()].some((key) => ['v', 'cells', 'form'].includes(key))) return null;
  const vars = Number(params.get('v'));
  const encoded = params.get('cells');
  const stateForm = params.get('form');
  if (!Number.isInteger(vars) || vars < 2 || vars > 6 || !encoded || encoded.length !== 2 ** vars
      || !/^[012]+$/.test(encoded) || !['SOP', 'POS'].includes(stateForm)) return null;
  return { nVars: vars, values: [...encoded].map(Number), form: stateForm };
}

const urlState = readUrlState();
if (urlState) {
  nVars = urlState.nVars;
  values = urlState.values;
  form = urlState.form;
} else if (window.location.search) {
  window.history.replaceState(null, '', window.location.pathname);
}

function updateUrl() {
  const params = new URLSearchParams();
  params.set('v', String(nVars));
  params.set('cells', values.join(''));
  params.set('form', form);
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function groupBand(colors) {
  if (colors.length <= 1) return colors[0] ?? '';
  const stops = colors.map((color, index) => {
    const start = (index / colors.length) * 100;
    const end = ((index + 1) / colors.length) * 100;
    return `${color} ${start}% ${end}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function showView(view, animate = false) {
  const wasPinned = animate && narrowLayout.matches
    && viewBar.getBoundingClientRect().top <= parseFloat(getComputedStyle(viewBar).top) + 1;
  activeView = view;
  for (const button of viewButtons) {
    const selected = button.dataset.view === view;
    button.setAttribute('aria-pressed', String(selected));
    if (button.dataset.view === 'map') continue;
    panels.get(button.dataset.view).hidden = !selected;
  }
  mapPanel.hidden = narrowLayout.matches && view !== 'map';
  if (wasPinned) viewBar.scrollIntoView({ block: 'start' });
  if (animate && !reducedMotion.matches) {
    panels.get(view).animate([{ opacity: .65 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
  }
}

function updatePaintControls() {
  document.querySelectorAll('[data-paint]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.paint) === selectedPaint));
  });
  cycleButton.setAttribute('aria-pressed', String(cycleTaps));
  mapHint.textContent = touchLayout.matches && cycleTaps
    ? 'Tap a cell to cycle through 0, 1, and X. X means don’t care.'
    : 'Choose 0, 1, or X to paint. X means don’t care.';
  truthHint.textContent = `Select an output to paint it ${selectedPaint === 2 ? 'X' : selectedPaint}.`;
}

function cellsForSolver() {
  return values.map((value) => (value === 2 ? 'X' : value));
}

function displayExpression(value) {
  return value.replaceAll("'", '′');
}

function renderVariableControl() {
  variableControl.replaceChildren();
  for (let count = 2; count <= 6; count += 1) {
    const button = element('button', '', String(count));
    button.type = 'button';
    button.dataset.vars = String(count);
    button.setAttribute('aria-pressed', String(count === nVars));
    variableControl.append(button);
  }
}

function buildLayer(layout, layerIndex) {
  const layer = element('section', 'map-layer');
  layer.dataset.layer = String(layerIndex);
  layer.setAttribute('aria-label', layout.layerCount === 1 ? 'Karnaugh map' : `${layout.layerVariables} = ${layout.layerHeaders[layerIndex]} layer`);
  if (layout.layerCount > 1) {
    layer.append(element('h3', 'layer-title', `${layout.layerVariables} = ${layout.layerHeaders[layerIndex]}`));
  }

  const grid = element('div', 'layer-grid');
  const rowLabel = layout.rowVariables || '·';
  const columnLabel = layout.columnVariables || '·';
  grid.append(element('div', 'map-heading corner', `${rowLabel}\\${columnLabel}`));
  for (let col = 0; col < layout.columnCount; col += 1) {
    grid.append(element('div', 'map-heading', layout.columnHeaders[col]));
  }

  for (let row = 0; row < layout.rowCount; row += 1) {
    grid.append(element('div', 'map-heading', layout.rowHeaders[row]));
    for (let col = 0; col < layout.columnCount; col += 1) {
      const minterm = positionToMinterm({ layer: layerIndex, row, col }, nVars);
      const cell = element('button', 'cell');
      cell.type = 'button';
      cell.dataset.minterm = String(minterm);
      const fill = element('span', 'cell-fill');
      const fade = element('span', 'cell-fade');
      const value = element('span', 'cell-value');
      cell.append(fill, fade, element('span', 'cell-number', String(minterm)), value);
      mapCells[minterm] = { cell, fill, fade, value, colors: '' };
      grid.append(cell);
    }
  }
  layer.append(grid);
  return layer;
}

function buildMap(layout) {
  map.replaceChildren();
  mapCells = [];
  map.dataset.vars = String(nVars);
  layout.layerHeaders.forEach((_, index) => {
    const layer = buildLayer(layout, index);
    const position = layout.layerPositions[index];
    if (layout.layerCount === 4) {
      layer.style.setProperty('--layer-row', String(position.row + 1));
      layer.style.setProperty('--layer-col', String(position.col + 1));
    }
    map.append(layer);
  });
}

function updateMap(groups, animate) {
  const memberships = values.map(() => []);
  for (const group of groups) {
    for (const minterm of group.minterms) memberships[minterm].push(groupColors.get(group.term));
  }
  const highlightedGroup = groups[selectedGroup];
  mapCells.forEach((state, minterm) => {
    const { cell, fill, fade, value } = state;
    const output = values[minterm];
    cell.dataset.value = String(output);
    value.textContent = output === 2 ? 'X' : String(output);
    cell.setAttribute('aria-label', `Minterm ${minterm}: ${output === 2 ? 'don’t care' : output}`);
    cell.style.setProperty('--highlight', highlightedGroup?.minterms.includes(minterm)
      ? groupColors.get(highlightedGroup.term) : 'transparent');

    const colors = memberships[minterm].sort();
    const key = colors.join(',');
    if (state.colors === key) return;
    if (animate) {
      tintAnimations.get(fade)?.cancel();
      const oldBand = fill.style.background;
      if (oldBand) {
        fade.style.background = oldBand;
        tintAnimations.set(fade, fade.animate(
          [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out' },
        ));
      } else {
        tintAnimations.set(fade, fill.animate(
          [{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' },
        ));
      }
    }
    fill.style.background = groupBand(colors);
    state.colors = key;
  });
}

function buildLegend(groups) {
  legend.replaceChildren();
  groupHint.textContent = groups.length
    ? 'Select a group to highlight its cells on the map.'
    : `There are no ${form === 'SOP' ? '1s' : '0s'} to group.`;
  groups.forEach((group, index) => {
    const row = element('button', 'legend-row');
    row.type = 'button';
    row.dataset.group = String(index);
    row.setAttribute('aria-pressed', String(selectedGroup === index));
    row.setAttribute('aria-label', `${displayExpression(group.term)}, covers ${group.minterms.length} cell${group.minterms.length === 1 ? '' : 's'}`);
    row.style.setProperty('--group-color', groupColors.get(group.term));
    const swatch = element('span', 'legend-swatch');
    row.append(swatch, element('span', 'legend-term', displayExpression(group.term)));
    row.append(element('span', 'legend-count', `covers ${group.minterms.length} cell${group.minterms.length === 1 ? '' : 's'}`));
    legend.append(row);
  });
}

function buildTruthTable() {
  truthTable.replaceChildren();
  const head = element('thead');
  const headerRow = element('tr');
  for (let index = 0; index < nVars; index += 1) headerRow.append(element('th', '', 'ABCDEF'[index]));
  headerRow.append(element('th', '', 'F out'));
  head.append(headerRow);
  truthTable.append(head);
  const body = element('tbody');
  values.forEach((value, minterm) => {
    const row = element('tr');
    for (let index = 0; index < nVars; index += 1) {
      row.append(element('td', 'truth-bit', String((minterm >> (nVars - index - 1)) & 1)));
    }
    const valueCell = element('td');
    const button = element('button', 'truth-value', value === 2 ? 'X' : String(value));
    button.type = 'button';
    button.dataset.truthMinterm = String(minterm);
    button.dataset.value = String(value);
    button.setAttribute('aria-label', `Minterm ${minterm}, output ${value === 2 ? 'don’t care' : value}`);
    valueCell.append(button);
    row.append(valueCell);
    body.append(row);
  });
  truthTable.append(body);
}

function buildExplanation(groups) {
  explanation.replaceChildren();
  const chosen = groups[selectedGroup];
  whyHint.textContent = chosen
    ? 'Showing the highlighted group. Select it again in Groups to see all groups.'
    : groups.length
      ? 'A variable drops out when its value changes within a group.'
      : `There are no ${form === 'SOP' ? '1s' : '0s'} to group.`;

  for (const group of chosen ? [chosen] : groups) {
    const card = element('div', 'explanation-group');
    card.style.setProperty('--group-color', groupColors.get(group.term));
    const title = element('h4', 'explanation-heading');
    title.append(element('span', 'legend-swatch'), element('span', '', displayExpression(group.term)));
    card.append(title);

    const { kept, dropped } = group.explanation;
    const fixed = kept.map(item => `${item.variable} = ${item.value}`).join(', ');
    card.append(element('p', '', kept.length ? `Fixed in every cell: ${fixed}.` : 'The group spans all variables.'));
    if (dropped.length) {
      const variables = dropped.map(item => item.variable).join(', ');
      card.append(element('p', '', `Both 0 and 1 occur for ${variables}, so ${dropped.length === 1 ? 'it drops' : 'they drop'} out.`));
    }
    explanation.append(card);
  }
}

function render() {
  const result = solve(cellsForSolver(), nVars, { form });
  groupColors = colorsForGroups(result.groups.map(group => group.term), groupColors);
  const focused = document.activeElement;
  const focusedGroup = focused?.dataset.group;
  const focusedTruth = focused?.dataset.truthMinterm;
  const layoutChanged = map.dataset.vars !== String(nVars);
  if (layoutChanged) buildMap(getLayout(nVars));
  updateMap(result.groups, !layoutChanged && !mapPanel.hidden && !reducedMotion.matches);
  if (layoutChanged && !mapPanel.hidden && !reducedMotion.matches) {
    map.animate([{ opacity: .65 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  }
  const label = `Minimal ${form}`;
  const formula = `F = ${displayExpression(result.expression)}`;
  if (answerLabel.textContent !== label) answerLabel.textContent = label;
  if (expression.textContent !== formula) expression.textContent = formula;
  buildLegend(result.groups);
  mintermList.textContent = result.mintermList;
  buildTruthTable();
  buildExplanation(result.groups);
  document.querySelectorAll('[data-form]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.form === form)));
  if (focusedGroup !== undefined) legend.querySelector(`[data-group="${focusedGroup}"]`)?.focus({ preventScroll: true });
  if (focusedTruth !== undefined) truthTable.querySelector(`[data-truth-minterm="${focusedTruth}"]`)?.focus({ preventScroll: true });
  updateUrl();
}

function setCell(minterm, value) {
  if (values[minterm] === value) return;
  values[minterm] = value;
  selectedGroup = -1;
  render();
}

function paintCell(cell, pointerType) {
  const minterm = Number(cell.dataset.minterm);
  if (pointerType === 'touch' && cycleTaps) setCell(minterm, (values[minterm] + 1) % 3);
  else setCell(minterm, selectedPaint);
}

showView(narrowLayout.matches ? 'map' : 'groups');
renderVariableControl();
updatePaintControls();
render();

narrowLayout.addEventListener('change', () => {
  showView(narrowLayout.matches ? 'map' : activeView === 'map' ? 'groups' : activeView);
});
touchLayout.addEventListener('change', updatePaintControls);
viewButtons.forEach(button => button.addEventListener('click', () => {
  if (activeView === button.dataset.view) return;
  showView(button.dataset.view, true);
}));

document.querySelector('.form-control').addEventListener('click', (event) => {
  const button = event.target.closest('[data-form]');
  if (!button || button.dataset.form === form) return;
  form = button.dataset.form;
  selectedGroup = -1;
  render();
});

truthTable.addEventListener('click', (event) => {
  const button = event.target.closest('[data-truth-minterm]');
  if (!button) return;
  setCell(Number(button.dataset.truthMinterm), selectedPaint);
});

variableControl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-vars]');
  if (!button || Number(button.dataset.vars) === nVars) return;
  const focusedCount = button.dataset.vars;
  nVars = Number(focusedCount);
  groupColors = new Map();
  values = Array(2 ** nVars).fill(0);
  selectedGroup = -1;
  renderVariableControl();
  if (narrowLayout.matches && activeView !== 'map') showView('map', true);
  render();
  variableControl.querySelector(`[data-vars="${focusedCount}"]`)?.focus();
});

document.querySelectorAll('[data-paint]').forEach(button => button.addEventListener('click', () => {
  selectedPaint = Number(button.dataset.paint);
  cycleTaps = false;
  updatePaintControls();
}));

cycleButton.addEventListener('click', () => {
  cycleTaps = !cycleTaps;
  updatePaintControls();
});

map.addEventListener('pointerdown', (event) => {
  const cell = event.target.closest('[data-minterm]');
  if (!cell || event.button !== 0 || !event.isPrimary) return;
  // Touch: wait for a confirmed tap so a scroll starting on a cell
  // does not change the map. Mouse and pen still paint immediately
  // and can drag across cells.
  if (event.pointerType === 'touch') {
    pendingTouch = {
      pointerId: event.pointerId,
      minterm: Number(cell.dataset.minterm),
      startX: event.clientX,
      startY: event.clientY,
    };
    return;
  }
  paintingPointer = event.pointerId;
  paintCell(cell, event.pointerType);
  event.preventDefault();
});

map.addEventListener('pointermove', (event) => {
  if (!pendingTouch || event.pointerId !== pendingTouch.pointerId) return;
  const distance = Math.hypot(event.clientX - pendingTouch.startX, event.clientY - pendingTouch.startY);
  if (distance > 10) pendingTouch = null;
});

map.addEventListener('pointerover', (event) => {
  if (paintingPointer === null || event.pointerId !== paintingPointer || !event.buttons) return;
  const cell = event.target.closest('[data-minterm]');
  if (cell) paintCell(cell, event.pointerType);
});

function endPointer(event) {
  if (pendingTouch && event.pointerId === pendingTouch.pointerId) {
    if (event.type === 'pointerup') {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const cell = target && target.closest ? target.closest('[data-minterm]') : null;
      const distance = Math.hypot(event.clientX - pendingTouch.startX, event.clientY - pendingTouch.startY);
      if (cell && Number(cell.dataset.minterm) === pendingTouch.minterm && distance <= 10) {
        paintCell(cell, 'touch');
      }
    }
    pendingTouch = null;
  }
  if (event.pointerId === paintingPointer) paintingPointer = null;
}

window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

map.addEventListener('click', (event) => {
  // Keep keyboard activation available; pointer input is handled above.
  if (event.detail !== 0) return;
  const cell = event.target.closest('[data-minterm]');
  if (cell) setCell(Number(cell.dataset.minterm), selectedPaint);
});

legend.addEventListener('click', (event) => {
  const row = event.target.closest('[data-group]');
  if (!row) return;
  const group = Number(row.dataset.group);
  selectedGroup = selectedGroup === group ? -1 : group;
  render();
  if (narrowLayout.matches && selectedGroup !== -1) {
    showView('map', true);
    document.querySelector('[data-view="map"]').focus({ preventScroll: true });
  }
});

document.querySelector('#randomize').addEventListener('click', () => {
  values = randomizeValues(2 ** nVars);
  selectedGroup = -1;
  render();
});

document.querySelector('#clear').addEventListener('click', () => {
  values = Array(2 ** nVars).fill(0);
  selectedGroup = -1;
  render();
});
