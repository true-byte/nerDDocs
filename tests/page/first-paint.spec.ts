import { expect } from '@playwright/test';
import { THEME_KEY } from '../../src/page/theme-memory.ts';
import { DEFAULT_THEME, themeById } from '../../src/themes/index.ts';
import { RESTORE } from '../support/dimensions.ts';
import { THREE_LEVELS } from '../support/levels.ts';
import { barButtons, holdPageScript, hydrated, panel, rowOf, test, TOGGLES } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import {
  columns,
  expectCharWidthSettled,
  expectFull,
  expectTextWidth,
  storedCharWidths,
  storeWidth,
  textWidth,
} from '../support/text-width.ts';

const LEVEL_FILES = {
  'nerddocs.json': THREE_LEVELS,
  'restore.md':
    '# Restore a file\n\nA restore never changes the copy.\n\n::: overview\nPick a file and a day.\n::: internals\nA restore is a job.\n:::\n',
};

test.describe('with no script', () => {
  test.use({ javaScriptEnabled: false });

  test('under 960px the text comes first and the nav follows', async ({ page, site }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto(`${site.address}storage.html`);
    await expect(rowOf(page, 'Team plan')).toBeVisible();
    const text = await page.locator('main').boundingBox();
    const nav = await panel(page).boundingBox();
    expect(nav!.y).toBeGreaterThanOrEqual(text!.y + text!.height);
  });

  test('the text of the default level reads, with no slider and no marks', async ({ page, ownSite }) => {
    const run = await ownSite(LEVEL_FILES);
    await page.goto(`${run.address}restore.html`);
    await expect(page.getByText('Pick a file and a day.')).toBeVisible();
    await expect(page.getByText('A restore is a job.')).toBeHidden();
    await expect(page.locator('#bar')).toBeHidden();
    await expect(page.locator('.part:visible .marks')).toBeHidden();
  });

  test("the text holds the default number of characters, from the character width of the theme", async ({ page, site }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${site.address}storage.html`);
    const size = await page.locator('.col').evaluate((col) => parseFloat(getComputedStyle(col).fontSize));
    const { text } = await columns(page);
    expect(Math.abs(text - 75 * themeById(DEFAULT_THEME)!.charWidth * size), `${text} px`).toBeLessThanOrEqual(2);
  });

  test('the text holds the number of characters that "textWidth" in nerddocs.json sets', async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': '{"levels":false,"textWidth":60}', 'storage.md': '# Storage\n\nBlocks are stored once.\n' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${run.address}storage.html`);
    const size = await page.locator('.col').evaluate((col) => parseFloat(getComputedStyle(col).fontSize));
    const { text } = await columns(page);
    expect(Math.abs(text - 60 * themeById(DEFAULT_THEME)!.charWidth * size), `${text} px`).toBeLessThanOrEqual(2);
  });

  test('sections show no arrows, since an arrow would do nothing', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await expect(rowOf(page, 'Team plan')).toBeVisible();
    await expect(page.locator('.chev svg').first()).toBeHidden();
  });

  test('the button of the dimensions hides, and the list shows its links in the panel above the tree', async ({ page, dimensionSite }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(`${dimensionSite.address}${RESTORE.slice(1)}`);
    const list = page.getByRole('list', { name: 'Dimensions' });
    const administration = list.getByRole('link', { name: 'Administration', exact: true });
    await expect(list.getByRole('link')).toHaveText(['User guide', 'Administration', 'Legal and privacy']);
    await expect(page.locator('#dimB')).toBeHidden();
    await expect(administration).toHaveAttribute('href', '../../administration/01-install.html');
    const shown = (await page.locator('#dimL').boundingBox())!;
    const tree = (await page.locator('#tree').boundingBox())!;
    expect(shown.y + shown.height).toBeLessThanOrEqual(tree.y);

    await administration.click();
    await expect(page).toHaveURL(/\/administration\/01-install\.html$/);
  });
});

test('a closed section shows closed before the page script runs', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await panel(page).getByRole('button', { name: 'Backups' }).click();
  await expect(rowOf(page, 'Restore a file')).toBeHidden();

  const release = await holdPageScript(page);
  await page.reload({ waitUntil: 'commit' });
  await expect(rowOf(page, 'Storage')).toBeVisible();
  await expect(rowOf(page, 'Restore a file')).toBeHidden();

  release();
  await hydrated(page);
  await expect(page.locator('#nd-shut')).toHaveCount(0);
  await expect(rowOf(page, 'Restore a file')).toBeHidden();
});

test('the arrow of a closed section shows turned before the page script runs', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await panel(page).getByRole('button', { name: 'Backups' }).click();
  await expect(rowOf(page, 'Restore a file')).toBeHidden();

  const release = await holdPageScript(page);
  await page.reload({ waitUntil: 'commit' });
  await expect(rowOf(page, 'Storage')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Backups' }).locator('svg')).not.toHaveCSS('transform', 'none');
  release();
});

test('a hidden panel shows hidden before the page script runs', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await page.getByRole('button', { name: 'Hide contents' }).click();
  await expect(panel(page)).toBeHidden();

  const release = await holdPageScript(page);
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('h1')).toHaveText('Storage');
  await expect(panel(page)).toBeHidden();

  release();
  await hydrated(page);
  await expect(panel(page)).toBeHidden();
});

test('the level and a hidden slider panel hold before the page script runs, and nothing slides at the first paint', async ({ page, ownSite }) => {
  const run = await ownSite(LEVEL_FILES);
  await page.goto(`${run.address}restore.html`);
  await hydrated(page);
  await page.getByRole('button', { name: 'Hide panel' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-slider', 'off');

  const release = await holdPageScript(page);
  await page.reload({ waitUntil: 'commit' });
  await expect(page.getByText('Pick a file and a day.')).toBeVisible();
  await expect(page.getByText('A restore is a job.')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-slider', 'off');
  await expect(page.locator('.part:visible .marks')).toBeHidden();
  const place = () =>
    page.locator('#bar').evaluate((bar) => ({ top: bar.getBoundingClientRect().top, screen: innerHeight, sliding: bar.getAnimations().length }));
  const beforeScript = await place();
  expect(beforeScript.top).toBeGreaterThanOrEqual(beforeScript.screen);
  expect(beforeScript.sliding).toBe(0);

  release();
  await hydrated(page);
  await expect(page.getByRole('button', { name: 'Show panel' })).toBeVisible();
  await expect(page.locator('#stopsWrap')).toHaveAttribute('inert');
  expect(await place()).toEqual(beforeScript);
});

test('a page with no parts holds its narrower panel and its label before the page script runs, with no change after it', async ({ page, ownSite }) => {
  const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'storage.md': '# Storage\n\nBlocks are stored once.\n' });
  const release = await holdPageScript(page);
  await page.goto(`${run.address}storage.html`, { waitUntil: 'commit' });
  await expect(page.locator('#no-levels')).toHaveText('No levels on this page');
  await expect(page.locator('#no-levels')).toBeVisible();
  await expect(page.locator('.stop, .track, #thumb')).toHaveCount(0);
  const beforeScript = await page.locator('#bar').boundingBox();

  release();
  await hydrated(page);
  await expect(page.locator('#no-levels')).toBeVisible();
  expect(await page.locator('#bar').boundingBox()).toEqual(beforeScript);
});

test('a page with no levels has no slider before the page script runs either', async ({ page, ownSite }) => {
  const run = await ownSite({ 'restore.md': '# Restore a file\n\nPick a file and a day.\n' });
  const release = await holdPageScript(page);
  await page.goto(`${run.address}restore.html`, { waitUntil: 'commit' });
  await expect(page.getByText('Pick a file and a day.')).toBeVisible();
  await expect.poll(() => barButtons(page), OFTEN).toEqual(TOGGLES);
  await expect(page.locator('#tab, #thumb')).toHaveCount(0);
  release();
  await hydrated(page);
  await expect.poll(() => barButtons(page), OFTEN).toEqual(TOGGLES);
});

test('the button and the tree hold their place when the page script runs', async ({ page, dimensionSite }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const release = await holdPageScript(page);
  await page.goto(`${dimensionSite.address}${RESTORE.slice(1)}`, { waitUntil: 'commit' });
  await expect(page.locator('#dimB')).toBeVisible();
  const boxes = async () => ({
    '#dimB': (await page.locator('#dimB').boundingBox())!,
    'the current page row': (await page.locator('#tree [aria-current="page"]').boundingBox())!,
  });
  const beforeScript = await boxes();

  release();
  await hydrated(page);
  const afterScript = await boxes();
  for (const name of ['#dimB', 'the current page row'] as const) {
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(afterScript[name][key] - beforeScript[name][key]), `${key} of ${name}`).toBeLessThanOrEqual(0.5);
    }
  }
});

test.describe('the text width before the page script runs', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a stored number of characters shows at the width that the page script gives it', async ({ page, site }) => {
    await storeWidth(page, '100');
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    // The page script measures the font, and keeps its character width for the next first paint.
    await expect.poll(async () => (await storedCharWidths(page)).themelessness, OFTEN).toEqual(expect.any(Number));
    const hundred = await textWidth(page);

    const release = await holdPageScript(page);
    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('h1')).toHaveText('Storage');
    await expect(page.locator('#nd-width')).toHaveCount(1);
    await expectTextWidth(page, hundred, 'the text before the page script runs', 1.5);

    release();
    await hydrated(page);
    await expectTextWidth(page, hundred, 'the text after the page script runs', 1.5);
  });

  for (const theme of ['themelessness', 'i-love-msdos'].map((id) => themeById(id)!)) {
    test(`with fresh storage, the text in '${theme.name}', which has system fonts only, shows before the page script runs at the width that it has after the page settles`, async ({ page, site }) => {
      if (theme.id !== DEFAULT_THEME) await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, theme.id] as const);
      const release = await holdPageScript(page);
      await page.goto(`${site.address}storage.html`, { waitUntil: 'commit' });
      await expect(page.locator('h1')).toHaveText('Storage');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
      const beforeScript = await textWidth(page);

      release();
      await hydrated(page);
      await expectCharWidthSettled(page);
      const settled = await textWidth(page);
      expect(Math.abs(settled - beforeScript), `${beforeScript} px before the page script, ${settled} px after it`).toBeLessThanOrEqual(2);
    });
  }

  test("a stored 'full' fills the free space", async ({ page, site }) => {
    await storeWidth(page, 'full');
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await expectFull(page);

    const release = await holdPageScript(page);
    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('h1')).toHaveText('Storage');
    await expect(page.locator('html')).toHaveAttribute('data-width', 'full');
    await expectFull(page, 'the column before the page script runs');

    release();
    await hydrated(page);
    await expectFull(page, 'the column after the page script runs');
  });
});
