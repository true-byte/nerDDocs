import { expect } from '@playwright/test';
import { diagramBox, expectDrawn, mermaidBlock, SHORT_FLOW } from '../support/diagrams.ts';
import type { FileContent } from '../support/folder.ts';
import { pngFile, svgImage } from '../support/images.ts';
import { BACKUP_SPEC, INTERNALS_FIRST } from '../support/openapi.ts';
import { STEPS } from '../support/page-content.ts';
import { hydrated, test } from '../support/page.ts';
import { expectFrameFits, innerFrame, recordFrameLoads, WIZARD_CSS, WIZARD_HTML, WIZARD_JS } from '../support/wireframes.ts';

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

test.describe('a page in folders with order prefixes', () => {
  /** 'Backups' at user-guide/01-backups/index.md, with an image, a log file, a wireframe, a diagram and an API file of its folder. */
  const FILES: Record<string, FileContent> = {
    'nerddocs.json': INTERNALS_FIRST,
    'user-guide/01-backups/index.md': [
      '# Backups',
      '![Restore window](restore-window.svg)',
      '[Restore log](restore.log) and [Restore a file](01-restore.md#pick-a-day)',
      '![Restore wizard](wireframes/restore-wizard.html)',
      mermaidBlock(SHORT_FLOW),
      '![Backup API](api/openapi.yaml)',
    ].join('\n\n'),
    'user-guide/01-backups/01-restore.md': `# Restore a file\n\n${STEPS}\n\n## Pick a day\n\n${STEPS}\n`,
    'user-guide/01-backups/restore-window.svg': svgImage('width="120" height="40"'),
    'user-guide/01-backups/restore.log': 'Restored report.docx',
    'user-guide/01-backups/wireframes/restore-wizard.html': WIZARD_HTML,
    'user-guide/01-backups/wireframes/wizard.css': WIZARD_CSS,
    'user-guide/01-backups/wireframes/wizard.js': WIZARD_JS,
    'user-guide/01-backups/wireframes/step.png': pngFile(1280, 720),
    'user-guide/01-backups/api/openapi.yaml': BACKUP_SPEC,
  };
  const WIREFRAME = 'user-guide/01-backups/wireframes/restore-wizard.html';

  test('every image, file, wireframe, diagram and API file of the page loads at its address without the prefixes', async ({ page, ownSite }) => {
    const run = await ownSite(FILES);
    const loads = recordFrameLoads(page);
    await page.goto(`${run.address}user-guide/backups/index.html`);
    await hydrated(page);

    await expect.poll(() => page.getByAltText('Restore window').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(120);
    const log = await page.locator('#page').getByRole('link', { name: 'Restore log' }).evaluate((link: HTMLAnchorElement) => link.href);
    expect((await page.request.get(log)).status()).toBe(200);
    await expectFrameFits(page, WIREFRAME);
    expect(await (await innerFrame(page, WIREFRAME)).evaluate(() => getComputedStyle(document.body).paddingTop)).toBe('16px');
    await expectDrawn(diagramBox(page, SHORT_FLOW));
    await expect(page.locator('#page section.api')).toBeVisible();
    expect(loads.failed).toEqual([]);
  });

  test('a link to a Markdown file opens its page at its new address and at its heading', async ({ page, ownSite }) => {
    const run = await ownSite(FILES);
    await page.goto(`${run.address}user-guide/backups/index.html`);
    await page.locator('#page').getByRole('link', { name: 'Restore a file' }).click();
    await expect(page).toHaveURL(/\/user-guide\/backups\/restore\.html#pick-a-day$/);
    await expect(page.locator('h1')).toHaveText('Restore a file');
    await expect(page.locator('#pick-a-day')).toBeInViewport();
  });
});
