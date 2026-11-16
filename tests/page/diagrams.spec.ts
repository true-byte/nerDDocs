import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { renderPage } from '../../src/page/page-html.tsx';
import { MODE_KEY, THEME_KEY } from '../../src/page/theme-memory.ts';
import { BUILD_SOURCES } from '../../src/server/diagram-builds.ts';
import { scanSite } from '../../src/site/scan.ts';
import { viewOf } from '../../src/site/view.ts';
import { blackOrWhite, seriesColors } from '../../src/themes/diagram-colors.ts';
import { THEMES, themeById } from '../../src/themes/index.ts';
import type { Mode } from '../../src/themes/types.ts';
import { rgbOf } from '../support/css.ts';
import {
  applyLook,
  BACKUP_RUN,
  BACKUP_SYSTEM,
  BROKEN_FLOW,
  diagramBox,
  DIAGRAMS_SITE,
  drawingOf,
  expectDrawn,
  hashOf,
  holdBuilds,
  isMarked,
  recordBuilds,
  RESTORE_FLOW,
  RESTORE_FLOW_DESCRIPTION,
  RESTORE_JOB,
  RESTORE_MAP,
  RESTORES_BY_DAY,
  storeLook,
  STYLED_FLOW,
} from '../support/diagrams.ts';
import { folderWith } from '../support/folder.ts';
import { MOVE_MS, openOnStoppedClock, pressOnSlider, scrollPage, SIGNALS_MS } from '../support/levels.ts';
import { failOnPageError, hydrated, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { REPO, runCommand, type RunningCommand } from '../support/run-command.ts';
import { expectMarkAt, markLine, noScrollAnchoring } from '../support/text-width.ts';

/** The tests only read the diagram pages, so they share one command on them. */
const test = pageTest.extend<object, { diagrams: RunningCommand }>({
  diagrams: [
    async ({}, use) => {
      const run = await runCommand(DIAGRAMS_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

test.use({ viewport: { width: 1440, height: 900 } });

const PHONE = { width: 390, height: 844 };

/** Opens a page in a stored theme and look, and waits for its script. */
async function open(page: Page, address: string, theme = 'themelessness', mode: Mode = 'light', waitUntil: 'load' | 'domcontentloaded' = 'load') {
  await storeLook(page, theme, mode);
  await page.goto(address, { waitUntil });
  await hydrated(page);
}

const styleOf = (element: Locator, name: string) =>
  element.evaluate((node, property) => getComputedStyle(node).getPropertyValue(property), name);
const heightOf = (element: Locator) => element.evaluate((node) => node.getBoundingClientRect().height);
const widthOf = (element: Locator) => element.evaluate((node) => node.getBoundingClientRect().width);
const twoFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/** The `#rrggbb` of a computed color such as `rgb(255, 153, 102)`. */
function hexOf(color: string): string {
  const channels = /^rgba?\((\d+), (\d+), (\d+)/.exec(color);
  if (!channels) throw new Error(`An unknown color: ${color}`);
  return `#${channels.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`;
}

/** Waits until the height of the box is its width × 3 / 5, within 1 px. */
async function expectFiveByThree(box: Locator, what: string): Promise<void> {
  await expect
    .poll(async () => Math.abs((await heightOf(box)) - ((await widthOf(box)) * 3) / 5), { ...OFTEN, message: what })
    .toBeLessThanOrEqual(1);
}

/** True when a box sits more than one screen below the view, where the page does not draw it. */
const isFar = (box: Locator) => box.evaluate((node) => node.getBoundingClientRect().top > 2 * innerHeight);

/** True when every box that shows within one screen of the view has a drawing with this key. */
const nearBoxesDrawn = (page: Page, key: string) =>
  page.evaluate(
    (drawn) =>
      [...document.querySelectorAll<HTMLElement>('#page .dg')]
        .filter((box) => {
          const { top, bottom } = box.getBoundingClientRect();
          return box.getClientRects().length > 0 && top < 2 * innerHeight && bottom > -innerHeight;
        })
        .every((box) => box.dataset.drawn === drawn),
    key,
  );

/** The keys of the stored sizes of the page. */
const storedKeys = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('nerddocs-sizes') ?? '[]') as [string, number, number][]).map(([key]) => key));

/** Waits until the width of the drawing is `clamp(0.75 × --dg-w, the width of its .sbox, --dg-w)`, within 1 px. */
async function expectShrinkRule(box: Locator, what: string): Promise<void> {
  const miss = () =>
    box.evaluate((node) => {
      const sbox = node.querySelector<HTMLElement>(':scope > .sbox')!;
      const svg = sbox.querySelector('svg')!;
      const natural = parseFloat(svg.style.getPropertyValue('--dg-w'));
      const wanted = Math.min(Math.max(0.75 * natural, sbox.clientWidth), natural);
      return Math.abs(svg.getBoundingClientRect().width - wanted);
    });
  await expect.poll(miss, { ...OFTEN, message: what }).toBeLessThanOrEqual(1);
}

test('a diagram draws in the theme colors and UI font from the tiny build, and gets the full-size marks', async ({ page, diagrams }) => {
  const errors = failOnPageError(page);
  const asked = recordBuilds(page);
  const colors = themeById('themelessness')!.light;
  await open(page, `${diagrams.address}user-flows.html`);
  const flow = diagramBox(page, RESTORE_FLOW);
  await expectDrawn(flow);
  await expect(flow).toHaveAttribute('data-drawn', 'themelessness light tiny');
  expect(asked).toEqual(['mermaid.js']);

  const svg = drawingOf(flow);
  expect(await styleOf(svg.locator('g.node rect').first(), 'fill')).toBe(rgbOf(colors.code));
  const label = svg.locator('.nodeLabel').first();
  expect(await styleOf(label, 'color')).toBe(rgbOf(colors.ink));
  expect(await styleOf(label, 'font-family')).toMatch(/^system-ui/);
  expect(await styleOf(svg.locator('.flowchart-link').first(), 'stroke')).toBe(rgbOf(colors.soft));
  await expect(svg).not.toHaveAttribute('width');
  await expect(svg).not.toHaveAttribute('height');
  await expect(flow).toHaveAttribute('data-full', '');
  await expect(flow).toHaveAttribute('tabindex', '0');
  await expect(flow).toHaveAttribute('role', 'button');
  await expect(flow).toHaveAttribute('aria-label', 'Restore a file');
  await expect(flow).toHaveAccessibleName('Restore a file');
  await expect(flow).toHaveAccessibleDescription(RESTORE_FLOW_DESCRIPTION);

  for (const [source, name] of [
    [RESTORES_BY_DAY, 'pie'],
    [BACKUP_RUN, 'flowchart'],
  ] as const) {
    const box = diagramBox(page, source);
    await box.scrollIntoViewIfNeeded();
    await expectDrawn(box);
    await expect(box).toHaveAttribute('aria-label', name);
  }
  expect(asked).toEqual(['mermaid.js']);
  expect(errors).toEqual([]);
});

test('the pie takes the eight series colors with black or white text, and a colored node keeps its color with black text', async ({ page, diagrams }) => {
  const colors = themeById('im-in')!.dark;
  await open(page, `${diagrams.address}user-flows.html`, 'im-in', 'dark');
  const pie = diagramBox(page, RESTORES_BY_DAY);
  await pie.scrollIntoViewIfNeeded();
  await expectDrawn(pie);
  const { slices, texts } = await drawingOf(pie).evaluate((svg) => ({
    slices: [...svg.querySelectorAll('.pieCircle')].map((slice) => getComputedStyle(slice).fill),
    texts: [...svg.querySelectorAll('text.slice')].map((text) => getComputedStyle(text).fill),
  }));
  const series = seriesColors(colors).slice(0, 8).map(rgbOf);
  expect([...slices].sort()).toEqual([...series].sort());
  expect(texts).toHaveLength(8);
  texts.forEach((fill, at) => expect(fill, `the text of slice ${at + 1}`).toBe(rgbOf(blackOrWhite(hexOf(slices[at]!)))));

  await page.goto(`${diagrams.address}styled-flow.html`);
  const styled = diagramBox(page, STYLED_FLOW);
  await expectDrawn(styled);
  const node = (id: string) => drawingOf(styled).locator(`g.node[id*="-flowchart-${id}-"]`);
  expect(await styleOf(node('B').locator('rect').first(), 'fill')).toBe('rgb(255, 153, 102)');
  expect(await styleOf(node('B').locator('.nodeLabel').first(), 'color')).toBe('rgb(0, 0, 0)');
  expect(await styleOf(node('A').locator('.nodeLabel').first(), 'color')).toBe(rgbOf(colors.ink));
});

test('an architecture diagram takes its lines and its group border from the theme', async ({ page, diagrams }) => {
  const colors = themeById('original-nerd')!.dark;
  await open(page, `${diagrams.address}backup-system.html`, 'original-nerd', 'dark');
  const system = diagramBox(page, BACKUP_SYSTEM);
  await expectDrawn(system);
  await expect(system).toHaveAttribute('data-drawn', 'original-nerd dark full');
  const strokes = await drawingOf(system).evaluate((svg) => ({
    groups: [...svg.querySelectorAll('.node-bkg')].map((group) => getComputedStyle(group).stroke),
    edges: [...svg.querySelectorAll('.edge')].map((edge) => getComputedStyle(edge).stroke),
  }));
  expect(strokes.groups, 'the group border').toEqual([rgbOf(colors.soft)]);
  expect(strokes.edges.length, 'the edges').toBeGreaterThan(0);
  for (const stroke of strokes.edges) expect(stroke, 'an edge').toBe(rgbOf(colors.soft));
});

test('a theme switch draws the near diagrams again at once, and a far one when it comes near', async ({ page, diagrams }) => {
  await open(page, `${diagrams.address}user-flows.html`);
  const flow = diagramBox(page, RESTORE_FLOW);
  const run = diagramBox(page, BACKUP_RUN);
  await expectDrawn(flow);
  await scrollPage(page, await page.evaluate(() => document.documentElement.scrollHeight - innerHeight));
  await expectDrawn(run);
  await scrollPage(page, 0);
  expect(await isFar(run), "'Backup run' is more than one screen below the view").toBe(true);
  await page
    .locator('#page .dg[data-state="drawn"] > .sbox > svg')
    .evaluateAll((svgs) => svgs.forEach((svg) => ((svg as unknown as { kept: boolean }).kept = true)));

  await applyLook(page, 'im-in', 'dark');
  await expect(flow).toHaveAttribute('data-drawn', 'im-in dark tiny');
  expect(await isMarked(drawingOf(flow)), 'a new drawing').toBe(false);
  expect(await styleOf(drawingOf(flow).locator('g.node rect').first(), 'fill')).toBe(rgbOf(themeById('im-in')!.dark.code));
  await expect.poll(() => nearBoxesDrawn(page, 'im-in dark tiny'), OFTEN).toBe(true);
  await expect(run).toHaveAttribute('data-drawn', 'themelessness light tiny');

  await run.scrollIntoViewIfNeeded();
  await expect(run).toHaveAttribute('data-drawn', 'im-in dark tiny');
});

test('a page loads Mermaid only for a diagram that shows within one screen of the view', async ({ page, diagrams }) => {
  const asked = recordBuilds(page);
  await open(page, `${diagrams.address}schedules.html`);
  await twoFrames(page);
  expect(asked, 'a page with no diagram').toEqual([]);

  await page.goto(`${diagrams.address}restore-job.html`);
  await hydrated(page);
  await twoFrames(page);
  expect(asked, 'a diagram at another level').toEqual([]);
  const job = diagramBox(page, RESTORE_JOB);
  await expect(job).not.toHaveAttribute('data-state');
  expect(await job.evaluate((box) => box.getClientRects().length)).toBe(0);
  await pressOnSlider(page, 'End');
  await expectDrawn(job);
  expect(asked).toEqual(['mermaid.js']);
  expect(await job.evaluate((box) => parseFloat(box.style.getPropertyValue('--dg-w')))).toBeGreaterThan(100);

  asked.length = 0;
  await page.goto(`${diagrams.address}long-flow.html`);
  await hydrated(page);
  await twoFrames(page);
  const flow = diagramBox(page, RESTORE_FLOW);
  expect(await isFar(flow), 'the diagram is more than one screen below the view').toBe(true);
  expect(asked, 'a diagram far below the view').toEqual([]);
  await scrollPage(page, await flow.evaluate((box) => box.getBoundingClientRect().top + scrollY - innerHeight * 1.5));
  await expectDrawn(flow);
  expect(asked).toEqual(['mermaid.js']);
});

test('a mindmap loads the full build only', async ({ page, diagrams }) => {
  const asked = recordBuilds(page);
  await open(page, `${diagrams.address}restore-map.html`);
  const map = diagramBox(page, RESTORE_MAP);
  await expectDrawn(map);
  await expect(map).toHaveAttribute('data-drawn', / full$/);
  expect(asked).toEqual(['mermaid-full.js']);
});

test('each box holds 5:3 of the column before its first draw, and the size that this browser last drew in the same theme and look', async ({ page, diagrams }) => {
  const gate = await holdBuilds(page);
  try {
    const asked = recordBuilds(page);
    const flow = diagramBox(page, RESTORE_FLOW);
    /** Reloads with the build held, and waits until the page asks for it. */
    const reloadHeld = async () => {
      gate.hold();
      asked.length = 0;
      await page.reload();
      await hydrated(page);
      await expect.poll(() => asked.length, OFTEN).toBe(1);
      await expect(flow).not.toHaveAttribute('data-state');
    };

    await open(page, `${diagrams.address}user-flows.html`);
    await expect.poll(() => asked.length, OFTEN).toBe(1);
    await expect(flow).not.toHaveAttribute('data-state');
    await expectFiveByThree(flow, 'a first visit');

    gate.release();
    await expectDrawn(flow);
    const drawn = await heightOf(flow);
    await expect.poll(() => storedKeys(page), OFTEN).toContain(`mermaid 12.2.0 ${hashOf(RESTORE_FLOW)} themelessness light`);

    await reloadHeld();
    expect(Math.abs((await heightOf(flow)) - drawn), 'the stored size').toBeLessThanOrEqual(1);

    await page.evaluate((key) => localStorage.setItem(key, 'dark'), MODE_KEY);
    await reloadHeld();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expectFiveByThree(flow, 'a look with no stored size');
  } finally {
    gate.release();
  }
});

test('a level change that shows a diagram keeps its motion and its signals, and the diagram draws once the text is still', async ({ page, diagrams }) => {
  // Mermaid draws in a box `#d<id>` of the body, and takes it away when the draw ends.
  await page.addInitScript(() => {
    const record = window as unknown as { renders: number };
    record.renders = 0;
    new MutationObserver((mutations) => {
      for (const { target, removedNodes } of mutations) {
        if (target !== document.body) continue;
        for (const node of removedNodes) if (node instanceof Element && node.id.startsWith('ddg-')) record.renders++;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await storeLook(page, 'themelessness', 'light');
  await openOnStoppedClock(page, `${diagrams.address}flow-levels.html`);
  await noScrollAnchoring(page);
  const flow = diagramBox(page, RESTORE_FLOW);
  const flashes = page.locator('#page .flash');

  // The part shows at 'Requirements' and 'Internals'. Its place sits 10% down the window, above the line.
  const place = await page
    .locator('#page .part:has(.dg)')
    .evaluate((part) => part.nextElementSibling!.getBoundingClientRect().top + scrollY - innerHeight * 0.1);
  await scrollPage(page, place);
  const before = await markLine(page);

  await pressOnSlider(page, 'ArrowRight');
  await expect.poll(() => page.evaluate(() => (window as unknown as { renders: number }).renders), OFTEN).toBe(1);
  await expect(flow).not.toHaveAttribute('data-state');
  await expectFiveByThree(flow, 'the box during the change');
  const reserved = await heightOf(flow);
  await expect(flashes).not.toHaveCount(0);
  const moving = await page
    .locator('#page .part')
    .evaluateAll((parts) => parts.filter((part) => (part as HTMLElement).style.clipPath).length);
  expect(moving, 'the parts that move').toBeGreaterThan(0);

  await page.clock.runFor(MOVE_MS);
  await expectDrawn(flow);
  expect(Math.abs((await heightOf(flow)) - reserved), 'the draw changes the height of the box').toBeGreaterThan(20);
  await expectMarkAt(page, before, 'the draw after the change');
  await expect(flashes).not.toHaveCount(0);

  await page.clock.runFor(SIGNALS_MS);
  await expect(flashes).toHaveCount(0);
});

test('a wide diagram shrinks to three quarters of its size, then scrolls sideways in the text column', async ({ page, diagrams }) => {
  await open(page, `${diagrams.address}user-flows.html`);
  const run = diagramBox(page, BACKUP_RUN);
  const sbox = run.locator(':scope > .sbox');
  await run.scrollIntoViewIfNeeded();
  await expectDrawn(run);
  await expectShrinkRule(run, 'at 1440×900');

  await page.setViewportSize(PHONE);
  await expectShrinkRule(run, 'at 390×844');
  expect(await sbox.evaluate((box) => box.scrollWidth - box.clientWidth), 'the box scrolls').toBeGreaterThan(1);
  await expect(run).toHaveAttribute('data-more', 'right');
  await expect(sbox).toHaveAttribute('role', 'region');

  for (const theme of THEMES) {
    await page.evaluate(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, theme.id] as const);
    await page.reload();
    await hydrated(page);
    await run.scrollIntoViewIfNeeded();
    await expect(run).toHaveAttribute('data-drawn', `${theme.id} light tiny`);
    const sides = await run.evaluate((box) => {
      const own = box.getBoundingClientRect();
      const text = document.getElementById('page')!.getBoundingClientRect();
      const main = document.querySelector('main')!;
      return { left: own.left - text.left, right: text.right - own.right, sideways: main.scrollWidth - main.clientWidth };
    });
    expect(sides.left, `${theme.id}: the left of the box`).toBeGreaterThanOrEqual(-0.5);
    expect(sides.right, `${theme.id}: the right of the box`).toBeGreaterThanOrEqual(-0.5);
    expect(sides.sideways, `${theme.id}: the sideways scroll of main`).toBeLessThanOrEqual(0);
  }
});

test('a broken diagram shows its source under Bad Mermaid with the line of the file, and leaves no node in the body', async ({ page, diagrams }) => {
  await open(page, `${diagrams.address}broken-files.html`);
  const broken = diagramBox(page, BROKEN_FLOW);
  await expect(broken).toHaveAttribute('data-state', 'bad');
  const problem = broken.locator(':scope > .problem:first-child');
  await expect(problem).toHaveCount(1);
  await expect(problem).toHaveAttribute('aria-label', 'flowchart');
  await expect(problem.locator('code')).toHaveText('Bad Mermaid: broken-files.md:8');
  const pre = broken.locator(':scope > pre');
  await expect(pre).toBeVisible();
  await expect(pre).toContainText('B -->> C[Restored file]');
  await expect(broken).not.toHaveAttribute('data-full');
  await expect(page.locator('body > [id^="ddg-"]')).toHaveCount(0);
});

test('with scripts off, or a build that does not load, the source shows as code', async ({ browser, page, diagrams }) => {
  const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  try {
    const plain = await noScript.newPage();
    await plain.goto(`${diagrams.address}user-flows.html`);
    const box = plain.locator('#page .dg').first();
    const pre = box.locator(':scope > pre');
    await expect(pre).toBeVisible();
    await expect(pre).toContainText('flowchart TD');
    expect(Math.abs((await heightOf(box)) - (await heightOf(pre))), 'the box is as tall as its source').toBeLessThanOrEqual(1);
  } finally {
    await noScript.close();
  }

  await page.route(
    (url) => url.pathname.endsWith('/__nerddocs/mermaid.js'),
    (route) => route.abort(),
  );
  await page.setViewportSize(PHONE);
  await open(page, `${diagrams.address}user-flows.html`);
  const flow = diagramBox(page, RESTORE_FLOW);
  await expect(flow).toHaveAttribute('data-state', 'source');
  await expect(flow.locator(':scope > pre')).toBeVisible();

  // A long line of the source scrolls sideways in its own box, as a line of code does.
  const run = diagramBox(page, BACKUP_RUN);
  const source = run.locator(':scope > pre');
  await expect(run).toHaveAttribute('data-state', 'source');
  await expect(source).toHaveAttribute('role', 'region');
  await expect(source).toHaveAttribute('tabindex', '0');
  const heading = await page.locator('#page h2', { hasText: 'Backup run' }).getAttribute('id');
  await expect(source).toHaveAttribute('aria-labelledby', heading!);
  await expect(run).toHaveAttribute('data-more', 'right');
  expect(await styleOf(source, 'overscroll-behavior-x')).toBe('contain');
});

test('a draw waits for the UI font of the theme', async ({ page, diagrams }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => url.pathname.includes('/__nerddocs/fonts/saira-condensed-'),
    async (route) => {
      await held;
      await route.continue().catch(() => {});
    },
  );
  try {
    await open(page, `${diagrams.address}flow-guide.html`, 'i-fly-spaceships', 'light', 'domcontentloaded');
    const flow = diagramBox(page, RESTORE_FLOW);
    await page.waitForFunction(() => (window as unknown as { mermaid?: unknown }).mermaid !== undefined);
    await expect(flow).not.toHaveAttribute('data-state');

    release();
    await expectDrawn(flow);
    expect(await styleOf(drawingOf(flow).locator('.nodeLabel').first(), 'font-family')).toMatch(/^"Saira Condensed"/);
  } finally {
    release();
  }
});

test('a theme switch while a draw waits for the UI font draws in the font of the new theme', async ({ page, diagrams }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => url.pathname.includes('/__nerddocs/fonts/saira-condensed-'),
    async (route) => {
      await held;
      await route.continue().catch(() => {});
    },
  );
  try {
    await open(page, `${diagrams.address}flow-guide.html`, 'i-fly-spaceships', 'light', 'domcontentloaded');
    const flow = diagramBox(page, RESTORE_FLOW);
    await page.waitForFunction(() => (window as unknown as { mermaid?: unknown }).mermaid !== undefined);
    await expect(flow).not.toHaveAttribute('data-state');
    await applyLook(page, 'i-void-warranties', 'light');

    release();
    await expect(flow).toHaveAttribute('data-drawn', 'i-void-warranties light tiny');
    const families = await drawingOf(flow)
      .locator('.nodeLabel')
      .evaluateAll((labels) => labels.map((label) => getComputedStyle(label).fontFamily));
    expect(families.length, 'the labels').toBeGreaterThan(0);
    for (const family of families) expect(family).toMatch(/^"Share Tech Mono"/);
  } finally {
    release();
  }
});

test('two diagrams of one source draw with ids of their own', async ({ page, diagrams }) => {
  await open(page, `${diagrams.address}restore-twice.html`);
  const boxes = diagramBox(page, RESTORE_FLOW);
  await expect(boxes).toHaveCount(2);
  for (const box of await boxes.all()) await expectDrawn(box);
  const ids = await boxes.evaluateAll((all) => all.map((box) => box.querySelector(':scope > .sbox > svg')!.id));
  expect(new Set(ids).size).toBe(2);
  const markers = await page.evaluate(() =>
    [...document.querySelectorAll('#page .dg svg marker')].map((marker) => ({
      id: marker.id,
      count: document.querySelectorAll(`#${CSS.escape(marker.id)}`).length,
    })),
  );
  expect(markers.length, 'the arrow markers').toBeGreaterThan(0);
  expect(markers.filter(({ count }) => count !== 1)).toEqual([]);
});

test('a diagram opened from disk draws with no request outside the folder', async ({ page }) => {
  const site = await scanSite(await folderWith(DIAGRAMS_SITE));
  const out = await folderWith({});
  await mkdir(join(out, '__nerddocs'));
  for (const name of ['app.js', 'app.css']) await copyFile(join(REPO, 'dist/client', name), join(out, '__nerddocs', name));
  await copyFile(join(REPO, 'node_modules', BUILD_SOURCES.tiny), join(out, '__nerddocs/mermaid.js'));
  await writeFile(join(out, 'user-flows.html'), renderPage(viewOf(site, '/user-flows.html'), { live: false }));

  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  await page.goto(`file://${join(out, 'user-flows.html')}`);
  await expectDrawn(diagramBox(page, RESTORE_FLOW));
  expect(urls.filter((url) => !url.startsWith('file://'))).toEqual([]);
});
