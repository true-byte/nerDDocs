import { expect, type Page } from '@playwright/test';
import { THREE_LEVELS } from '../support/levels.ts';
import { hydrated, panel, rowOf, test } from '../support/page.ts';

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

  test('sections show no arrows, since an arrow would do nothing', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await expect(rowOf(page, 'Team plan')).toBeVisible();
    await expect(page.locator('.chev svg').first()).toBeHidden();
  });
});

/** Holds the page script back until the returned function runs. */
async function holdPageScript(page: Page): Promise<() => void> {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/app.js', async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

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

test('a page with no levels has no slider before the page script runs either', async ({ page, ownSite }) => {
  const run = await ownSite({ 'restore.md': '# Restore a file\n\nPick a file and a day.\n' });
  const release = await holdPageScript(page);
  await page.goto(`${run.address}restore.html`, { waitUntil: 'commit' });
  await expect(page.getByText('Pick a file and a day.')).toBeVisible();
  await expect(page.locator('#bar')).toBeHidden();
  await expect(page.locator('#tab, #thumb')).toHaveCount(0);
  release();
  await hydrated(page);
  await expect(page.locator('#bar')).toBeHidden();
});
