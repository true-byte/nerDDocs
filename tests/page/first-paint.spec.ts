import { expect, type Page } from '@playwright/test';
import { hydrated, panel, rowOf, test } from '../support/page.ts';

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
