import { expect, type Page } from '@playwright/test';
import { THREE_LEVELS } from '../support/levels.ts';
import { hydrated, panel, test } from '../support/page.ts';

/** Every page error fails the test, a hydration mismatch among them. */
function failOnPageError(page: Page): Error[] {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(new Error(message.text()));
  });
  return errors;
}

test('the page hydrates with no error and loads no file from elsewhere', async ({ page, site }) => {
  const errors = failOnPageError(page);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().endsWith('favicon.ico')) requests.push(request.url());
  });

  await page.goto(`${site.address}backups/restore.html`);
  await hydrated(page);

  expect(errors).toEqual([]);
  expect(requests.every((url) => url.startsWith(site.address))).toBe(true);
});

test('a reader with a hidden panel and a closed section hydrates with no error', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await panel(page).getByRole('button', { name: 'Backups' }).click();
  await page.getByRole('button', { name: 'Hide contents' }).click();

  const errors = failOnPageError(page);
  await page.reload();
  await hydrated(page);

  expect(errors).toEqual([]);
});

test('a page in an empty folder hydrates with no error', async ({ page, ownSite }) => {
  const run = await ownSite({});
  const errors = failOnPageError(page);
  await page.goto(run.address);
  await hydrated(page);
  expect(errors).toEqual([]);
});

test('a page with no parts on a site with levels hydrates with no error', async ({ page, ownSite }) => {
  const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'storage.md': '# Storage\n\nBlocks are stored once.\n' });
  const errors = failOnPageError(page);
  await page.goto(`${run.address}storage.html`);
  await hydrated(page);
  await expect(page.locator('#no-levels')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a page with a broken or a missing config hydrates with no error', async ({ page, ownSite }) => {
  const errors = failOnPageError(page);
  const broken = await ownSite({ 'nerddocs.json': '{not json', 'restore.md': '# Restore a file\n' });
  await page.goto(`${broken.address}restore.html`);
  await hydrated(page);
  await expect(page.getByRole('alertdialog')).toBeVisible();
  const missing = await ownSite({ 'restore.md': '# Restore a file\n' }, { noConfig: true });
  await page.goto(`${missing.address}restore.html`);
  await hydrated(page);
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(errors).toEqual([]);
});
