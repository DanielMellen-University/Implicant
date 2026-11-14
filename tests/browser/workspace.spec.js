import { expect, test } from '@playwright/test';

const layerExample = '0120120011020121001101000012010011100201000212010110012021210001';
const checkerboard = Array.from({ length: 64 }, (_, index) => (
  index.toString(2).replaceAll('0', '').length % 2
)).join('');

function mapCell(page, minterm) {
  return page.locator(`.cell[data-minterm="${minterm}"]`);
}

test('map and truth table edit the same output and restore it from the URL', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paint one', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cycle', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await mapCell(page, 2).click();

  await page.getByRole('button', { name: 'Truth Table', exact: true }).click();
  const output = page.getByRole('button', { name: 'Minterm 2, output 1', exact: true });
  await expect(output).toHaveText('1');

  if (isMobile) {
    await page.getByRole('button', { name: "Paint output don't care", exact: true }).click();
  } else {
    await page.getByRole('button', { name: "Paint don't care", exact: true }).click();
  }
  await output.click();
  await expect(page.getByRole('button', { name: 'Minterm 2, output don’t care' })).toHaveText('X');

  await page.getByRole('button', { name: 'POS', exact: true }).click();
  await page.reload();
  await expect(mapCell(page, 2)).toHaveAttribute('data-value', '2');
  await expect(page.getByRole('button', { name: 'POS', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Cycle advances once per activation and selecting a value exits Cycle', async ({ page, isMobile }) => {
  await page.goto('/');
  const cycle = page.getByRole('button', { name: 'Cycle', exact: true });
  if (!isMobile) await cycle.click();
  await expect(cycle).toHaveAttribute('aria-pressed', 'true');

  const cell = mapCell(page, 2);
  for (const value of ['1', '2', '0']) {
    if (isMobile) await cell.tap();
    else await cell.click();
    await expect(cell).toHaveAttribute('data-value', value);
  }

  const paintOne = page.getByRole('button', { name: 'Paint one', exact: true });
  await paintOne.click();
  await expect(cycle).toHaveAttribute('aria-pressed', 'false');
  await expect(paintOne).toHaveAttribute('aria-pressed', 'true');
});

test('three-way splits survive group selection and highlight across layers', async ({ page, isMobile }) => {
  await page.goto(`/?v=6&cells=${layerExample}&form=SOP`);
  await expect(page.locator('.map-layer')).toHaveCount(4);
  const overlap = mapCell(page, 5);
  const dots = overlap.locator('.cell-dot');
  await expect(dots).toHaveCount(3);
  await expect(overlap.locator('.cell-fill')).toHaveCSS('background-image', /^linear-gradient/);
  const colors = await dots.evaluateAll(items => items.map(item => item.style.backgroundColor));
  expect(new Set(colors).size).toBe(3);

  const groupsTab = page.getByRole('button', { name: 'Groups', exact: true });
  if (isMobile) await groupsTab.click();
  const group = page.getByRole('button', { name: 'A′DE′F, covers 4 cells', exact: true });
  await group.click();
  await expect(overlap).toHaveAttribute('data-highlighted', '');
  await expect(page.locator('.map-layer:has(.cell[data-highlighted])')).toHaveCount(2);
  await expect(mapCell(page, 0)).toHaveCSS('opacity', '0.55');
  expect(await dots.evaluateAll(items => items.map(item => item.style.backgroundColor))).toEqual(colors);

  if (isMobile) await groupsTab.click();
  await group.click();
  if (isMobile) await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.locator('.cell[data-highlighted]')).toHaveCount(0);
  await expect(mapCell(page, 0)).toHaveCSS('opacity', '1');
});

test('a 32-term SOP or POS expression wraps without scrolling inside the result', async ({ page }) => {
  await page.goto(`/?v=6&cells=${checkerboard}&form=SOP`);
  const expression = page.locator('#expression');
  await expect(expression).toHaveText(/^F = /);
  expect((await expression.innerText()).split(' + ')).toHaveLength(32);

  for (const form of ['SOP', 'POS']) {
    await page.getByRole('button', { name: form, exact: true }).click();
    await expect(page.getByText(`Minimal ${form}`, { exact: true })).toBeVisible();
    const dimensions = await expression.evaluate(node => ({
      innerHeight: node.clientHeight,
      fullHeight: node.scrollHeight,
      innerWidth: node.clientWidth,
      fullWidth: node.scrollWidth,
    }));
    expect(dimensions.fullHeight).toBe(dimensions.innerHeight);
    expect(dimensions.fullWidth).toBe(dimensions.innerWidth);
  }
  await expect(expression.locator('.expression-factor')).toHaveCount(32);
});
