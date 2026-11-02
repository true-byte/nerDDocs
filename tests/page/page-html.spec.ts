import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { folderWith, withConfig } from '../support/folder.ts';
import { rowOf, test } from '../support/page.ts';
import { REPO } from '../support/run-command.ts';
import { scanSite } from '../../src/site/scan.ts';
import { viewOf } from '../../src/site/view.ts';
import { renderPage } from '../../src/page/page-html.tsx';

test.describe('with no script', () => {
  test.use({ javaScriptEnabled: false });

  test('the text and the nav read, and a nav link opens its page', async ({ page, site }) => {
    await page.goto(`${site.address}backups/restore.html`);
    await expect(page.locator('h1')).toHaveText('Restore a file');
    await expect(page.locator('#page')).toContainText('Pick a file and a day.');
    for (const control of ['Hide contents', 'Show contents', 'Contents']) {
      await expect(page.getByRole('button', { name: control, exact: true })).toBeHidden();
    }
    await rowOf(page, 'Team plan').click();
    await expect(page).toHaveURL(/\/backups\/plans\/team\.html$/);
    await expect(page.locator('#page')).toContainText('Every 6 hours.');
  });
});

test('a page opened from disk runs with no live update and needs no fetch', async ({ page }) => {
  const source = await folderWith(
    withConfig({
      'backups/restore.md': '# Restore a file\n\nPick a file.',
      'storage.md': '# Storage',
    }),
  );
  const site = await scanSite(source);
  const out = await folderWith({});
  await mkdir(join(out, 'backups'));
  await mkdir(join(out, '__nerddocs'));
  for (const name of ['app.js', 'app.css']) {
    await writeFile(join(out, '__nerddocs', name), await readFile(join(REPO, 'dist/client', name)));
  }
  for (const item of site.pages) {
    await writeFile(join(out, item.url), renderPage(viewOf(site, item.url), { live: false }));
  }

  await page.addInitScript(() => {
    const record = window as unknown as { streams: number; fetches: number };
    record.streams = 0;
    record.fetches = 0;
    const NativeSource = window.EventSource;
    window.EventSource = class extends NativeSource {
      constructor(url: string | URL) {
        super(url);
        record.streams++;
      }
    };
    const nativeFetch = window.fetch;
    window.fetch = (...args) => {
      record.fetches++;
      return nativeFetch(...args);
    };
  });

  await page.goto(`file://${join(out, 'backups/restore.html')}`);
  await expect(page.locator('#page')).toContainText('Pick a file.');
  await page.getByRole('button', { name: 'Hide contents' }).click();
  await expect(page.locator('#panel')).toBeHidden();
  await page.getByRole('button', { name: 'Show contents' }).click();
  await page.locator('#panel').getByRole('link', { name: 'Storage' }).click();
  await expect(page.locator('main h1')).toHaveText('Storage');

  expect(await page.evaluate(() => (window as unknown as { streams: number }).streams)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { fetches: number }).fetches)).toBe(0);
});
