import { expect } from '@playwright/test';
import { hydrated, panel, rowOf, test } from '../support/page.ts';

test('the current page is marked in the panel, and a link there moves the mark', async ({ page, site }) => {
  await page.goto(`${site.address}backups/restore.html`);
  await expect(page.locator('[aria-current="page"]')).toHaveText('Restore a file');
  await rowOf(page, 'Schedules').click();
  await expect(page).toHaveURL(/schedules\.html$/);
  await expect(page.locator('[aria-current="page"]')).toHaveText('Schedules');
});

test('the contents panel hides and shows again, also on the next page', async ({ page, site }) => {
  await page.goto(`${site.address}backups/restore.html`);
  await hydrated(page);

  await page.getByRole('button', { name: 'Hide contents' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show contents' })).toBeFocused();

  await page.goto(`${site.address}storage.html`);
  await expect(panel(page)).toBeHidden();
  await hydrated(page);
  await expect(panel(page)).toBeHidden();

  await page.getByRole('button', { name: 'Show contents' }).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show contents' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Hide contents' })).toBeFocused();

  await page.reload();
  await expect(panel(page)).toBeVisible();
});

test('a section arrow closes and opens its subsections', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  const backups = panel(page).getByRole('button', { name: 'Backups' });

  await expect(backups).toHaveAttribute('aria-expanded', 'true');
  await expect(rowOf(page, 'Restore a file')).toBeVisible();

  await backups.click();
  await expect(backups).toHaveAttribute('aria-expanded', 'false');
  await expect(rowOf(page, 'Restore a file')).toBeHidden();
  await expect(rowOf(page, 'Team plan')).toBeHidden();

  await backups.click();
  await expect(rowOf(page, 'Restore a file')).toBeVisible();

  const plans = panel(page).getByRole('button', { name: 'Plans' });
  await plans.click();
  await expect(rowOf(page, 'Team plan')).toBeHidden();
  await expect(rowOf(page, 'Restore a file')).toBeVisible();
});

test('a closed section stays closed on the next page', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await panel(page).getByRole('button', { name: 'Backups' }).click();
  await expect(rowOf(page, 'Restore a file')).toBeHidden();

  await page.goto(`${site.address}README.html`);
  await hydrated(page);
  await expect(rowOf(page, 'Restore a file')).toBeHidden();
});

test('a closed section opens when its page opens', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await panel(page).getByRole('button', { name: 'Backups' }).click();
  await expect(rowOf(page, 'Restore a file')).toBeHidden();

  await page.goto(`${site.address}backups/restore.html`);
  await expect(rowOf(page, 'Restore a file')).toBeVisible();
  await hydrated(page);
  await expect(rowOf(page, 'Restore a file')).toBeVisible();
  await expect(page.locator('[aria-current="page"]')).toBeVisible();
});

test('a closed section that opened for its page stays open on the next page', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await panel(page).getByRole('button', { name: 'Backups' }).click();
  await expect(rowOf(page, 'Restore a file')).toBeHidden();

  await page.goto(`${site.address}backups/restore.html`);
  await hydrated(page);
  await expect(rowOf(page, 'Restore a file')).toBeVisible();

  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await expect(rowOf(page, 'Restore a file')).toBeVisible();
});

test('with storage blocked, the panel still hides and sections still close', async ({ page, site }) => {
  await page.addInitScript(() => {
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, name, {
        get() {
          throw new Error('The browser blocks storage.');
        },
      });
    }
  });
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));

  await page.goto(`${site.address}storage.html`);
  await hydrated(page);

  await panel(page).getByRole('button', { name: 'Backups' }).click();
  await expect(rowOf(page, 'Restore a file')).toBeHidden();
  await page.getByRole('button', { name: 'Hide contents' }).click();
  await expect(panel(page)).toBeHidden();
  await page.getByRole('button', { name: 'Show contents' }).click();
  await expect(panel(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('with more pages than the panel can show', () => {
  const LONG_PANEL = Object.fromEntries(
    Array.from({ length: 60 }, (_, n) => [`plans/plan-${String(n + 1).padStart(2, '0')}.md`, `# Team plan ${n + 1}`]),
  );

  test.use({ viewport: { width: 1200, height: 500 } });

  test('the row of the current page shows with no scrolling', async ({ page, ownSite }) => {
    const run = await ownSite(LONG_PANEL);
    await page.goto(`${run.address}plans/plan-60.html`);
    await hydrated(page);
    await expect(page.locator('[aria-current="page"]')).toBeInViewport();
  });

  test('with the panel scrolled down, the row of a page higher in the list shows', async ({ page, ownSite }) => {
    const run = await ownSite(LONG_PANEL);
    await page.goto(`${run.address}plans/plan-60.html`);
    await hydrated(page);
    await expect(page.locator('[aria-current="page"]')).toBeInViewport();

    await page.goto(`${run.address}plans/plan-01.html`);
    await hydrated(page);
    await expect(page.locator('[aria-current="page"]')).toBeInViewport();
  });

  test('under 960px wide, the layer opens with the row of the current page on screen', async ({ page, ownSite }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    const run = await ownSite(LONG_PANEL);
    await page.goto(`${run.address}plans/plan-60.html`);
    await hydrated(page);

    await page.getByRole('button', { name: 'Contents', exact: true }).click();

    await expect(page.locator('[aria-current="page"]')).toBeInViewport();
  });

  test('the panel keeps its scroll on the next page', async ({ page, ownSite }) => {
    const run = await ownSite(LONG_PANEL);
    await page.goto(`${run.address}plans/plan-30.html`);
    await hydrated(page);
    const next = rowOf(page, 'Team plan 31');
    await next.evaluate((row) => row.scrollIntoView({ block: 'center' }));
    const scrollTop = () => page.locator('#tree').evaluate((box) => box.scrollTop);
    const before = await scrollTop();
    expect(before).toBeGreaterThan(0);

    await next.click();
    await expect(page).toHaveURL(/plan-31\.html$/);
    await hydrated(page);

    await expect.poll(scrollTop).toBe(before);
  });
});

test.describe('under 960px wide', () => {
  test.use({ viewport: { width: 800, height: 700 } });

  test('the menu button opens the panel as a full-height layer', async ({ page, site }) => {
    await page.goto(`${site.address}backups/restore.html`);
    await hydrated(page);
    await expect(panel(page)).toBeHidden();

    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await expect(panel(page)).toBeVisible();
    expect(await panel(page).boundingBox()).toEqual({ x: 0, y: 0, width: 800, height: 700 });
    await expect(page.getByRole('button', { name: 'Hide contents' })).toBeFocused();
    await expect(page.locator('main')).toHaveAttribute('inert');
    await expect(page.locator('#bar')).toHaveAttribute('inert');

    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Contents', exact: true })).toBeFocused();
    await expect(page.locator('main')).not.toHaveAttribute('inert');
    await expect(page.locator('#bar')).not.toHaveAttribute('inert');

    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await page.getByRole('button', { name: 'Hide contents' }).click();
    await expect(panel(page)).toBeHidden();

    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await rowOf(page, 'Schedules').click();
    await expect(page).toHaveURL(/schedules\.html$/);
    await expect(panel(page)).toBeHidden();
  });

  test('the layer closes when the window grows wide', async ({ page, site }) => {
    await page.goto(`${site.address}backups/restore.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await expect(panel(page)).toBeVisible();

    await page.setViewportSize({ width: 1200, height: 700 });
    await expect(page.locator('main')).not.toHaveAttribute('inert');
    const box = await panel(page).boundingBox();
    expect(box!.width).toBe(264);
  });
});
