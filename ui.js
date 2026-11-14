import { solve4 } from './solve4.js';

const GROUP_COLORS = ['#7F77DD', '#1D9E75', '#D85A30', '#378ADD', '#BA7517', '#D4537E', '#639922', '#888780'];
const GRAY_ORDER = [0, 1, 3, 2];
const PRESETS = {
  corners: { ones: [0, 2, 8, 10], dontCares: [] },
  'two-groups': { ones: [0, 2, 5, 7, 8, 10, 13, 15], dontCares: [] },
  'dont-cares': { ones: [1, 3, 7, 11, 15], dontCares: [0, 2, 5] },
  concept: { ones: [0, 1, 4, 5, 6, 8, 9, 10, 11], dontCares: [] },
  clear: { ones: [], dontCares: [] },
};

let values = Array(16).fill(0);
let selectedGroup = -1;

const map = document.querySelector('#kmap');
const expression = document.querySelector('#expression');
const legend = document.querySelector('#legend');
const themeToggle = document.querySelector('#theme-toggle');
const initialTheme = document.documentElement.dataset.theme ||
  (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
themeToggle.setAttribute('aria-label', `Switch to ${initialTheme === 'dark' ? 'light' : 'dark'} theme`);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildMap(groups) {
  map.replaceChildren();
  map.append(element('div', 'map-heading corner', 'AB\\CD'));
  for (const column of GRAY_ORDER) map.append(element('div', 'map-heading', column.toString(2).padStart(2, '0')));

  for (const row of GRAY_ORDER) {
    map.append(element('div', 'map-heading', row.toString(2).padStart(2, '0')));
    for (const column of GRAY_ORDER) {
      const minterm = row * 4 + column;
      const memberships = groups.flatMap((group, index) => group.cells.includes(minterm) ? [index] : []);
      const cell = element('button', 'cell');
      cell.type = 'button';
      cell.dataset.minterm = String(minterm);
      cell.setAttribute('aria-label', `Minterm ${minterm}: ${values[minterm] === 2 ? 'don’t care' : values[minterm]}`);
      cell.setAttribute('aria-pressed', String(values[minterm] !== 0));
      if (memberships.length) {
        cell.style.backgroundColor = `color-mix(in srgb, ${GROUP_COLORS[memberships[0] % GROUP_COLORS.length]} 18%, var(--bg))`;
      }
      if (selectedGroup >= 0 && memberships.includes(selectedGroup)) {
        cell.style.outline = `2px solid ${GROUP_COLORS[selectedGroup % GROUP_COLORS.length]}`;
        cell.style.outlineOffset = '-2px';
      }

      cell.append(element('span', 'cell-number', String(minterm)));
      cell.append(element('span', 'cell-value', values[minterm] === 2 ? 'X' : String(values[minterm])));
      if (memberships.length) {
        const dots = element('span', 'cell-dots');
        dots.setAttribute('aria-hidden', 'true');
        for (const index of memberships) {
          const dot = element('i', 'cell-dot');
          dot.style.backgroundColor = GROUP_COLORS[index % GROUP_COLORS.length];
          dots.append(dot);
        }
        cell.append(dots);
      }
      map.append(cell);
    }
  }
}

function buildLegend(groups) {
  legend.replaceChildren();
  groups.forEach((group, index) => {
    const row = element('button', 'legend-row');
    row.type = 'button';
    row.dataset.group = String(index);
    row.setAttribute('aria-pressed', String(selectedGroup === index));
    row.setAttribute('aria-label', `${group.term}, covers ${group.cells.length} cell${group.cells.length === 1 ? '' : 's'}`);
    if (selectedGroup === index) row.style.borderColor = GROUP_COLORS[index % GROUP_COLORS.length];
    const swatch = element('span', 'legend-swatch');
    swatch.style.backgroundColor = GROUP_COLORS[index % GROUP_COLORS.length];
    row.append(swatch, element('span', 'legend-term', group.term));
    row.append(element('span', 'legend-count', `covers ${group.cells.length} cell${group.cells.length === 1 ? '' : 's'}`));
    legend.append(row);
  });
}

function render() {
  const result = solve4(values);
  if (selectedGroup >= result.groups.length) selectedGroup = -1;
  const focusedMinterm = document.activeElement?.dataset?.minterm;
  const focusedGroup = document.activeElement?.dataset?.group;
  buildMap(result.groups);
  expression.textContent = `F = ${result.expression}`;
  buildLegend(result.groups);
  if (focusedMinterm !== undefined) {
    map.querySelector(`[data-minterm="${focusedMinterm}"]`)?.focus();
  } else if (focusedGroup !== undefined) {
    legend.querySelector(`[data-group="${focusedGroup}"]`)?.focus();
  }
}

map.addEventListener('click', (event) => {
  const cell = event.target.closest('[data-minterm]');
  if (!cell) return;
  const minterm = Number(cell.dataset.minterm);
  values[minterm] = (values[minterm] + 1) % 3;
  selectedGroup = -1;
  render();
});

legend.addEventListener('click', (event) => {
  const row = event.target.closest('[data-group]');
  if (!row) return;
  const group = Number(row.dataset.group);
  selectedGroup = selectedGroup === group ? -1 : group;
  render();
});

document.querySelector('.presets').addEventListener('click', (event) => {
  const button = event.target.closest('[data-preset]');
  if (!button) return;
  const preset = PRESETS[button.dataset.preset];
  values = Array(16).fill(0);
  for (const minterm of preset.ones) values[minterm] = 1;
  for (const minterm of preset.dontCares) values[minterm] = 2;
  selectedGroup = -1;
  render();
});

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  themeToggle.setAttribute('aria-label', `Switch to ${next === 'dark' ? 'light' : 'dark'} theme`);
});

values = [...PRESETS['two-groups'].ones].reduce((state, minterm) => {
  state[minterm] = 1;
  return state;
}, Array(16).fill(0));
render();
