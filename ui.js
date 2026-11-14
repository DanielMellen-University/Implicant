import { getLayout, mintermToPosition, positionToMinterm, solve } from './solver.js';
import { colorsForGroups, randomizeValues } from './helpers.js';
const initialValues = [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0];
let nVars = 4;
let values = [...initialValues];
let selectedGroup = -1;
let selectedPaint = 0;
let paintingPointer = null;
let pendingTouch = null;
let cycleTaps = true;
let form = 'SOP';
const colorSeed = (Math.random() * 0xffffffff) >>> 0;
let groupColors = [];

const map = document.querySelector('#kmap');
const expression = document.querySelector('#expression');
const legend = document.querySelector('#legend');
const variableControl = document.querySelector('#variable-count');
const truthTable = document.querySelector('#truth-table');
const mintermList = document.querySelector('#minterm-list');
const explanation = document.querySelector('#explanation');

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


function groupTint(color) {
  return `color-mix(in srgb, ${color} 32%, var(--bg))`;
}

function cellBackground(memberships) {
  const colors = memberships.map((index) => groupTint(groupColors[index]));
  if (colors.length === 1) return colors[0];
  const stops = colors.map((color, index) => {
    const start = (index / colors.length) * 100;
    const end = ((index + 1) / colors.length) * 100;
    return `${color} ${start}% ${end}%`;
  });
  // Hard stops, not a soft blend, so each group gets an equal flat slice.
  return `linear-gradient(to right, ${stops.join(', ')})`;
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

function buildLayer(layout, layerIndex, groups) {
  const layer = element('section', 'map-layer');
  layer.dataset.layer = String(layerIndex);
  layer.setAttribute('aria-label', layout.layerCount === 1 ? 'Karnaugh map' : `${layout.layerVariables} = ${layout.layerHeaders[layerIndex]} layer`);
  if (layout.layerCount > 1) {
    layer.append(element('h2', 'layer-title', `${layout.layerVariables}=${layout.layerHeaders[layerIndex]}`));
  }

  const grid = element('div', 'layer-grid');
  grid.style.setProperty('--cols', String(layout.columnCount));
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
      const position = mintermToPosition(minterm, nVars);
      const memberships = groups.flatMap((group, index) => group.minterms.includes(minterm) ? [index] : []);
      const cell = element('button', 'cell');
      cell.type = 'button';
      cell.dataset.minterm = String(minterm);
      cell.dataset.layer = String(position.layer);
      cell.setAttribute('aria-label', `Minterm ${minterm}: ${values[minterm] === 2 ? 'don’t care' : values[minterm]}`);
      cell.setAttribute('aria-pressed', String(values[minterm] !== 0));
      if (memberships.length) {
        cell.style.background = cellBackground(memberships);
      }
      if (selectedGroup >= 0 && memberships.includes(selectedGroup)) {
        cell.style.outline = `2px solid ${groupColors[selectedGroup]}`;
        cell.style.outlineOffset = '-2px';
      }
      cell.append(element('span', 'cell-number', String(minterm)));
      cell.append(element('span', 'cell-value', values[minterm] === 2 ? 'X' : String(values[minterm])));
      if (memberships.length) {
        const dots = element('span', 'cell-dots');
        dots.setAttribute('aria-hidden', 'true');
        for (const index of memberships) {
          const dot = element('i', 'cell-dot');
          dot.style.backgroundColor = groupColors[index];
          dots.append(dot);
        }
        cell.append(dots);
      }
      grid.append(cell);
    }
  }
  layer.append(grid);
  return layer;
}

function buildMap(layout, groups) {
  map.replaceChildren();
  map.dataset.vars = String(nVars);
  layout.layerHeaders.forEach((_, index) => {
    const layer = buildLayer(layout, index, groups);
    const position = layout.layerPositions[index];
    if (layout.layerCount === 4) {
      layer.style.setProperty('--layer-row', String(position.row + 1));
      layer.style.setProperty('--layer-col', String(position.col + 1));
    }
    map.append(layer);
  });
}

function buildLegend(groups) {
  legend.replaceChildren();
  groups.forEach((group, index) => {
    const row = element('button', 'legend-row');
    row.type = 'button';
    row.dataset.group = String(index);
    row.setAttribute('aria-pressed', String(selectedGroup === index));
    row.setAttribute('aria-label', `${displayExpression(group.term)}, covers ${group.minterms.length} cell${group.minterms.length === 1 ? '' : 's'}`);
    if (selectedGroup === index) row.style.borderColor = groupColors[index];
    const swatch = element('span', 'legend-swatch');
    swatch.style.backgroundColor = groupColors[index];
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
  headerRow.append(element('th', '', 'F'));
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
    button.setAttribute('aria-label', `Minterm ${minterm}, output ${value === 2 ? 'don’t care' : value}`);
    valueCell.append(button);
    row.append(valueCell);
    body.append(row);
  });
  truthTable.append(body);
}

function buildExplanation(groups) {
  explanation.replaceChildren();
  const panel = document.querySelector('#explanation-panel');
  if (selectedGroup < 0 || !groups[selectedGroup]) {
    explanation.append(element('p', '', 'Tap a group in the legend to see which variables it keeps and why the others drop out.'));
    return;
  }
  panel.open = true;
  const group = groups[selectedGroup];
  explanation.append(element('p', 'explanation-term', `${displayExpression(group.term)} covers ${group.minterms.length} map cell${group.minterms.length === 1 ? '' : 's'}.`));
  const kept = element('section', 'explanation-section');
  kept.append(element('h3', '', 'Kept in the term'));
  if (group.explanation.kept.length === 0) kept.append(element('p', '', 'No variables are needed; this group covers the whole map.'));
  for (const item of group.explanation.kept) {
    kept.append(element('p', '', `${item.variable} stays as ${displayExpression(item.literal)} because every cell in this group has ${item.variable} = ${item.value}.`));
  }
  const dropped = element('section', 'explanation-section');
  dropped.append(element('h3', '', 'Dropped from the term'));
  if (group.explanation.dropped.length === 0) dropped.append(element('p', '', 'No variables drop out in this group.'));
  for (const item of group.explanation.dropped) {
    dropped.append(element('p', '', `${item.variable} drops out because the group includes both ${item.variable} = 0 and ${item.variable} = 1.`));
  }
  explanation.append(kept, dropped);
}

function sizeMap() {
  if (!window.matchMedia('(min-width: 900px)').matches) {
    map.style.removeProperty('--cell');
    return;
  }
  const vars = Number(map.dataset.vars) || nVars;
  const layersX = vars >= 5 ? 2 : 1;
  const layersY = vars >= 6 ? 2 : 1;
  const rows = vars <= 3 ? 2 : 4;
  const cols = vars === 2 ? 2 : 4;
  const label = 22;
  const gap = 3;
  const headH = 16;
  const layerGap = 10;
  const titleH = vars >= 5 ? 22 : 0;
  const width = map.clientWidth;
  const height = map.clientHeight;
  if (width < 2 || height < 2) return;
  const cellWidth = (width - (layersX - 1) * layerGap - layersX * (label + gap * cols)) / (layersX * cols);
  const cellHeight = (height - (layersY - 1) * layerGap - layersY * (titleH + headH + gap * rows)) / (layersY * rows);
  let cell = Math.floor(Math.min(cellWidth, cellHeight) * 2) / 2; // half-pixel slack
  if (!Number.isFinite(cell)) return;
  cell = Math.max(16, cell);
  map.style.setProperty('--cell', `${cell}px`);
  // If labels or rounding still overflow the box, shrink until every cell fits.
  void map.offsetHeight;
  const box = map.getBoundingClientRect();
  let overflow = 0;
  map.querySelectorAll('.cell').forEach((node) => {
    const rect = node.getBoundingClientRect();
    overflow = Math.max(overflow, rect.right - box.right, rect.bottom - box.bottom, box.left - rect.left, box.top - rect.top);
  });
  if (overflow > 0.5) {
    cell = Math.max(16, Math.floor(cell - Math.ceil(overflow)));
    map.style.setProperty('--cell', `${cell}px`);
  }
}

function render() {
  const layout = getLayout(nVars);
  const result = solve(cellsForSolver(), nVars, { form });
  if (selectedGroup >= result.groups.length) selectedGroup = -1;
  groupColors = colorsForGroups(result.groups.map((group) => group.term), colorSeed);
  const focusedMinterm = document.activeElement?.dataset?.minterm;
  const focusedGroup = document.activeElement?.dataset?.group;
  const focusedTruth = document.activeElement?.dataset?.truthMinterm;
  buildMap(layout, result.groups);
  document.querySelector('#answer-label').textContent = `Minimal ${form}`;
  expression.textContent = `F = ${displayExpression(result.expression)}`;
  buildLegend(result.groups);
  mintermList.textContent = result.mintermList;
  buildTruthTable();
  buildExplanation(result.groups);
  document.querySelectorAll('[data-form]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.form === form)));
  document.querySelectorAll('[data-paint]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.paint) === selectedPaint));
  });
  document.querySelector('#cycle-mode').setAttribute('aria-pressed', String(cycleTaps));
  if (focusedMinterm !== undefined) map.querySelector(`[data-minterm="${focusedMinterm}"]`)?.focus();
  else if (focusedGroup !== undefined) legend.querySelector(`[data-group="${focusedGroup}"]`)?.focus();
  else if (focusedTruth !== undefined) truthTable.querySelector(`[data-truth-minterm="${focusedTruth}"]`)?.focus();
  sizeMap();
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

renderVariableControl();
render();

document.querySelector('.form-control').addEventListener('click', (event) => {
  const button = event.target.closest('[data-form]');
  if (!button) return;
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
  if (!button) return;
  const focusedCount = button.dataset.vars;
  nVars = Number(button.dataset.vars);
  values = Array(2 ** nVars).fill(0);
  selectedGroup = -1;
  renderVariableControl();
  render();
  variableControl.querySelector(`[data-vars="${focusedCount}"]`)?.focus();
});

document.querySelector('.paint-control').addEventListener('click', (event) => {
  const button = event.target.closest('[data-paint]');
  if (!button) return;
  selectedPaint = Number(button.dataset.paint);
  cycleTaps = false;
  document.querySelectorAll('[data-paint]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  document.querySelector('#cycle-mode').setAttribute('aria-pressed', 'false');
});

document.querySelector('#cycle-mode').addEventListener('click', (event) => {
  cycleTaps = !cycleTaps;
  event.currentTarget.setAttribute('aria-pressed', String(cycleTaps));
});

map.addEventListener('pointerdown', (event) => {
  const cell = event.target.closest('[data-minterm]');
  if (!cell) return;
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

const mapResize = new ResizeObserver(() => sizeMap());
mapResize.observe(map);
window.addEventListener('resize', sizeMap);
