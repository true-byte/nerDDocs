import { expect } from '@playwright/test';
import { test } from '../support/page.ts';

test('a relative link to a Markdown file opens that page at its heading', async ({ page, site }) => {
  await page.goto(`${site.address}backups/restore.html`);
  await page.locator('#page').getByRole('link', { name: 'Storage' }).click();
  await expect(page).toHaveURL(/\/storage\.html#blocks$/);
  await expect(page.locator('h1')).toHaveText('Storage');
  await expect(page.locator('#blocks')).toBeInViewport();
});

test('an image of the folder shows', async ({ page, site }) => {
  await page.goto(`${site.address}backups/restore.html`);
  await expect
    .poll(() => page.getByAltText('Restore window').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(120);
});
