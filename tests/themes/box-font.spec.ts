import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { expect, type Page, type Request, type Response } from '@playwright/test';
import { renderPage } from '../../src/page/page-html.tsx';
import { THEME_KEY } from '../../src/page/theme-memory.ts';
import { scanSite } from '../../src/site/scan.ts';
import { viewOf } from '../../src/site/view.ts';
import { BOX_FACES, BOX_FAMILY } from '../../src/themes/box-font.ts';
import { THEMES } from '../../src/themes/index.ts';
import { folderWith } from '../support/folder.ts';
import { hydrated, test as pageTest } from '../support/page.ts';
import { CODE_SITE } from '../support/page-content.ts';
import { OFTEN } from '../support/poll.ts';
import { REPO, runCommand, type RunningCommand } from '../support/run-command.ts';

/** The tests only read 'Architecture', 'Inside the storage server' and 'Restore by script', so they share one command on them. */
const test = pageTest.extend<object, { code: RunningCommand }>({
  code: [
    async ({}, use) => {
      const run = await runCommand(CODE_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

const ARCHITECTURE = 'backups/architecture.html';
const BOX_FILES = BOX_FACES.map((face) => basename(face.file));
const isBoxFile = (url: string) => url.includes('/__nerddocs/fonts/fira-code-');
const fileOf = (url: string) => basename(new URL(url).pathname);

/** The width of each line of the text node in the first `pre.box code`, measured with a Range. */
const lineWidths = (page: Page) =>
  page
    .locator('#page pre.box code')
    .first()
    .evaluate((code) => {
      if (code.childNodes.length !== 1 || !(code.firstChild instanceof Text)) throw new Error('The diagram is not one text node.');
      const text = code.firstChild;
      const widths: number[] = [];
      let start = 0;
      for (const line of text.data.split('\n')) {
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, start + line.length);
        widths.push(range.getBoundingClientRect().width);
        start += line.length + 1;
      }
      return widths;
    });

/** The status of each face of the box family, such as 'unloaded' or 'loaded'. */
const boxFaceStatuses = (page: Page) =>
  page.evaluate(
    (family) => [...document.fonts].filter((face) => face.family.replace(/["']/g, '') === family).map((face) => face.status),
    BOX_FAMILY,
  );

/** Waits until each face of the box family has loaded. */
async function boxFontLoaded(page: Page): Promise<void> {
  await expect
    .poll(() => boxFaceStatuses(page), OFTEN)
    .toEqual(BOX_FACES.map(() => 'loaded'));
}

/** The widest line less the narrowest one. */
const spread = (widths: number[]) => Math.max(...widths) - Math.min(...widths);

const sideways = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((box) => box.scrollWidth - box.clientWidth);

test('in every theme, the lines of the Architecture diagram join, and the diagram scrolls in the text column on a phone', async ({ page, code }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${code.address}${ARCHITECTURE}`);
  const pre = page.locator('#page pre.box');
  for (const theme of THEMES) {
    await page.evaluate(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, theme.id] as const);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
    await boxFontLoaded(page);

    await expect(pre, theme.name).toHaveCSS('font-size', '13.333px');
    await expect(pre, theme.name).toHaveCSS('line-height', '16px');
    expect(await pre.evaluate((element) => getComputedStyle(element).fontFamily), theme.name).toMatch(/^"nd box",/);
    const widths = await lineWidths(page);
    expect(widths, theme.name).toHaveLength(4);
    expect(spread(widths), `${theme.name}: ${widths.join(' ')}`).toBeLessThanOrEqual(0.5);
    const height = (await pre.locator('code').boundingBox())!.height;
    expect(Math.abs(height - 64), `${theme.name}: ${height}`).toBeLessThanOrEqual(0.5);
    expect(await sideways(page, '#page pre.box'), theme.name).toBeGreaterThan(1);
    const outside = await page.evaluate(() => {
      const column = document.getElementById('page')!.getBoundingClientRect();
      const box = document.querySelector('#page pre.box')!.closest('.code')!.getBoundingClientRect();
      return box.left < column.left - 0.5 || box.right > column.right + 0.5;
    });
    expect(outside, theme.name).toBe(false);
  }
});

test('in every theme at 1440 px, a box diagram that fits its box less 32 px does not scroll, and the copy icon sits above its first line', async ({ page, code }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${code.address}backups/storage-server.html`);
  const block = page.locator('#page .code:has(pre.box)');
  const pre = block.locator(':scope > pre');
  for (const theme of THEMES) {
    await page.evaluate(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, theme.id] as const);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
    await hydrated(page);
    await boxFontLoaded(page);

    const fit = await pre.evaluate((box) => {
      const range = document.createRange();
      range.selectNodeContents(box.querySelector('code')!);
      return { diagram: range.getBoundingClientRect().width, room: box.clientWidth - 32 };
    });
    expect(fit.diagram, `${theme.name}: a diagram of ${fit.diagram} in ${fit.room}`).toBeLessThan(fit.room);
    const marks = () =>
      pre.evaluate((box) => ({ hidden: box.scrollWidth - box.clientWidth, more: box.parentElement!.getAttribute('data-more') }));
    await expect.poll(marks, { ...OFTEN, message: theme.name }).toEqual({ hidden: 0, more: null });

    const gap = await block.evaluate((element) => {
      const button = element.querySelector('.copy')!.getBoundingClientRect();
      const text = element.querySelector('pre code')!.firstChild as Text;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, text.data.indexOf('\n'));
      return range.getBoundingClientRect().top - button.bottom;
    });
    expect(gap, `${theme.name}: the first line starts ${gap} px below the copy icon`).toBeGreaterThan(0);
  }
});

test('the box font files load only on a page with a box diagram, and a late font leaves the height of the diagram as it was', async ({ page, code }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const requests: Request[] = [];
  const responses: Response[] = [];
  page.on('request', (request) => isBoxFile(request.url()) && requests.push(request));
  page.on('response', (response) => isBoxFile(response.url()) && responses.push(response));

  await page.goto(`${code.address}backups/restore-by-script.html`);
  await hydrated(page);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect(requests).toHaveLength(0);
  expect(await boxFaceStatuses(page)).toEqual(BOX_FACES.map(() => 'unloaded'));

  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/__nerddocs/fonts/fira-code-*', async (route) => {
    await held;
    await route.continue();
  });
  // A font that loads holds the load event, so the page opens up to its first paint.
  await page.goto(`${code.address}${ARCHITECTURE}`, { waitUntil: 'domcontentloaded' });
  await hydrated(page);
  await expect.poll(() => requests.map((request) => fileOf(request.url())).sort(), OFTEN).toEqual([...BOX_FILES].sort());
  const pre = page.locator('#page pre.box');
  const after = page.locator('#page .code:has(pre.box) + p');
  const before = { height: (await pre.boundingBox())!.height, top: (await after.boundingBox())!.y };

  release();
  await boxFontLoaded(page);
  await expect.poll(() => responses.length, OFTEN).toBe(BOX_FILES.length);
  for (const response of responses) {
    expect(response.status(), response.url()).toBe(200);
    expect(response.headers()['content-type'], response.url()).toBe('font/woff2');
  }
  expect(responses.map((response) => fileOf(response.url())).sort()).toEqual([...BOX_FILES].sort());
  const height = (await pre.boundingBox())!.height;
  const top = (await after.boundingBox())!.y;
  expect(Math.abs(height - before.height), `${before.height} then ${height}`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(top - before.top), `${before.top} then ${top}`).toBeLessThanOrEqual(0.5);
});

test('a box diagram opened from disk keeps its lines joined', async ({ page }) => {
  const site = await scanSite(await folderWith(CODE_SITE));
  const out = await folderWith({});
  await mkdir(join(out, 'backups'));
  await mkdir(join(out, '__nerddocs', 'fonts'), { recursive: true });
  for (const name of ['app.js', 'app.css']) await copyFile(join(REPO, 'dist/client', name), join(out, '__nerddocs', name));
  for (const face of BOX_FACES) await copyFile(join(REPO, 'node_modules', face.file), join(out, '__nerddocs/fonts', basename(face.file)));
  await writeFile(join(out, ARCHITECTURE), renderPage(viewOf(site, `/${ARCHITECTURE}`), { live: false }));

  await page.goto(`file://${join(out, ARCHITECTURE)}`);
  await boxFontLoaded(page);
  const widths = await lineWidths(page);
  expect(widths).toHaveLength(4);
  expect(spread(widths), widths.join(' ')).toBeLessThanOrEqual(0.5);
});
