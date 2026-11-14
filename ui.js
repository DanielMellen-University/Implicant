import { getLayout, positionToMinterm, solve } from './solver.js';
import { colorsForGroups, randomizeValues } from './helpers.js?v=3';
const initialValues = [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0];
let nVars = 4;
let values = [...initialValues];
let selectedGroup = -1;
let selectedPaint = 0;
let paintingPointer = null;
let pendingActivation = null;
let form = 'SOP';
let groupColors = new Map();
let activeView = 'groups';
let mapCells = [];

const narrowLayout = window.matchMedia('(max-width: 879px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let cycleMode = window.matchMedia('(any-pointer: coarse)').matches;
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
const paintButtons = document.querySelectorAll('[data-paint]');
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

function groupFill(colors) {
  const tints = colors.map(color => `color-mix(in srgb, var(--stage), ${color} 38%)`);
  if (tints.length <= 1) return tints[0] ?? '';
  const stops = tints.map((tint, index) => {
    const start = (index / colors.length) * 100;
    const end = ((index + 1) / colors.length) * 100;
    return `${tint} ${start}% ${end}%`;
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
  paintButtons.forEach((button) => {
    const selected = Number(button.dataset.paint) === selectedPaint;
    button.setAttribute('aria-pressed', String(selected && !(cycleMode && mapPanel.contains(button))));
  });
  cycleButton.setAttribute('aria-pressed', String(cycleMode));
  mapHint.textContent = cycleMode
    ? 'Click or tap a cell to cycle through 0, 1, and X. X means don’t care.'
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
      const dots = element('span', 'cell-dots');
      dots.setAttribute('aria-hidden', 'true');
      cell.append(fill, fade, element('span', 'cell-number', String(minterm)), value, dots);
      mapCells[minterm] = { cell, fill, fade, value, dots, colors: '' };
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
    const { cell, fill, fade, value, dots } = state;
    const output = values[minterm];
    const colors = memberships[minterm].sort();
    const key = colors.join(',');
    if (animate && state.colors !== key) {
      tintAnimations.get(fade)?.cancel();
      fade.style.background = fill.style.background || getComputedStyle(cell).backgroundColor;
      tintAnimations.set(fade, fade.animate(
        [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out' },
      ));
    }
    cell.dataset.value = String(output);
    value.textContent = output === 2 ? 'X' : String(output);
    cell.setAttribute('aria-label', `Minterm ${minterm}: ${output === 2 ? 'don’t care' : output}`);
    cell.style.setProperty('--highlight', highlightedGroup?.minterms.includes(minterm)
      ? groupColors.get(highlightedGroup.term) : 'transparent');

    if (state.colors === key) return;
    cell.toggleAttribute('data-grouped', colors.length > 0);
    fill.style.background = groupFill(colors);
    dots.replaceChildren(...colors.map(color => {
      const dot = element('span', 'cell-dot');
      dot.style.backgroundColor = color;
      return dot;
    }));
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
  if (expression.textContent !== formula) {
    expression.toggleAttribute('data-long', result.termCount > 8);
    if (form === 'POS' && result.termCount > 1) {
      expression.replaceChildren('F = ');
      result.groups.forEach((group, index) => {
        if (index > 0) expression.append(element('wbr'));
        expression.append(element('span', 'expression-factor', displayExpression(group.term)));
      });
    } else {
      expression.textContent = formula;
    }
  }
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

function editMapCell(cell) {
  const minterm = Number(cell.dataset.minterm);
  setCell(minterm, cycleMode ? (values[minterm] + 1) % 3 : selectedPaint);
}

showView(narrowLayout.matches ? 'map' : 'groups');
renderVariableControl();
updatePaintControls();
render();

narrowLayout.addEventListener('change', () => {
  showView(narrowLayout.matches ? 'map' : activeView === 'map' ? 'groups' : activeView);
});
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

paintButtons.forEach(button => button.addEventListener('click', () => {
  selectedPaint = Number(button.dataset.paint);
  cycleMode = false;
  updatePaintControls();
}));

cycleButton.addEventListener('click', () => {
  cycleMode = !cycleMode;
  updatePaintControls();
});

map.addEventListener('pointerdown', (event) => {
  const cell = event.target.closest('[data-minterm]');
  if (!cell || event.button !== 0 || !event.isPrimary) return;
  // Confirm a tap or click before cycling or applying paint on touch.
  // Mouse and pen can still drag-paint a fixed value.
  if (cycleMode || event.pointerType === 'touch') {
    pendingActivation = {
      pointerId: event.pointerId,
      minterm: Number(cell.dataset.minterm),
      startX: event.clientX,
      startY: event.clientY,
    };
    return;
  }
  paintingPointer = event.pointerId;
  editMapCell(cell);
  event.preventDefault();
});

map.addEventListener('pointermove', (event) => {
  if (!pendingActivation || event.pointerId !== pendingActivation.pointerId) return;
  const distance = Math.hypot(event.clientX - pendingActivation.startX, event.clientY - pendingActivation.startY);
  if (distance > 10) pendingActivation = null;
});

map.addEventListener('pointerover', (event) => {
  if (cycleMode || paintingPointer === null || event.pointerId !== paintingPointer || !event.buttons) return;
  const cell = event.target.closest('[data-minterm]');
  if (cell) editMapCell(cell);
});

function endPointer(event) {
  if (pendingActivation && event.pointerId === pendingActivation.pointerId) {
    const { minterm, startX, startY } = pendingActivation;
    pendingActivation = null;
    if (event.type === 'pointerup') {
      const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-minterm]');
      const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (cell && Number(cell.dataset.minterm) === minterm && distance <= 10) {
        editMapCell(cell);
      }
    }
  }
  if (event.pointerId === paintingPointer) paintingPointer = null;
}

window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

map.addEventListener('click', (event) => {
  // Keep keyboard activation available; pointer input is handled above.
  if (event.detail !== 0) return;
  const cell = event.target.closest('[data-minterm]');
  if (cell) editMapCell(cell);
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
