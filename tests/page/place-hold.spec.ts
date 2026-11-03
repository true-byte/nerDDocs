import { expect, type Page } from '@playwright/test';
import { expectLevel, pressOnSlider, scrollPage, THREE_LEVELS } from '../support/levels.ts';
import { failOnPageError, hydrated, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';
import {
  colWidth,
  expectCharWidthSettled,
  expectMarkAt,
  expectWidthSnaps,
  markLine,
  markNearLine,
  markOffset,
  noScrollAnchoring,
  pressOnWidth,
  prosePage,
  ruler,
  scrollToMiddle,
  showRuler,
  storeWidth,
  widthSlider,
} from '../support/text-width.ts';

/** A long page of shared text that ends with a part at each level, below the middle of the page. */
const FILES = {
  'nerddocs.json': THREE_LEVELS,
  'guide.md': `${prosePage('Backup guide', 6)}\n::: overview\nA plan keeps a copy of each file.\n::: internals\nThe agent locks each block with the key of the account before it sends the block.\n:::\n`,
};

const test = pageTest.extend<object, { docs: RunningCommand }>({
  docs: [
    async ({}, use) => {
      const run = await runCommand(FILES);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

test.use({ viewport: { width: 1300, height: 900 }, reducedMotion: 'reduce' });

async function open(page: Page, address: string): Promise<void> {
  await page.goto(address);
  await hydrated(page);
  await noScrollAnchoring(page);
  await scrollToMiddle(page);
}

/** Opens a page, waits until it has settled its text width, and puts it at its top. */
async function openAtTop(page: Page, address: string): Promise<void> {
  await page.goto(address);
  await hydrated(page);
  await noScrollAnchoring(page);
  await expectCharWidthSettled(page);
  await scrollPage(page, 0);
  expect(await page.evaluate(() => scrollY), 'the page at its top').toBe(0);
}

/** Expects the page at its top, and the marked character more than 2 px below where it was, as a narrower text moves it. */
async function expectTopStays(page: Page, before: number, what: string): Promise<void> {
  expect(await page.evaluate(() => scrollY), `${what}: the page stays at its top`).toBe(0);
  expect((await markOffset(page)) - before, `${what}: the text on the line moves down`).toBeGreaterThan(2);
}

test('at the top of a long page, a key on the ruler that narrows the text keeps the page at its top', async ({ page, docs }) => {
  const errors = failOnPageError(page);
  await openAtTop(page, `${docs.address}guide.html`);
  await showRuler(page);
  const before = await markNearLine(page);
  const width = await colWidth(page);
  await pressOnWidth(page, 'PageDown');
  await expectWidthSnaps(page, width, 'PageDown');
  await expectTopStays(page, before, 'PageDown');
  expect(errors).toEqual([]);
});

test('at the top of a long page, a drag of the ruler that narrows the text keeps the page at its top through the drag', async ({ page, docs }) => {
  const errors = failOnPageError(page);
  await openAtTop(page, `${docs.address}guide.html`);
  await showRuler(page);
  const before = await markNearLine(page);
  const handle = (await widthSlider(page).boundingBox())!;
  const rulerBox = (await ruler(page).boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = rulerBox.y + rulerBox.height / 2;
  const width = await colWidth(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 40, y, { steps: 2 });
  await expectWidthSnaps(page, width, 'the first moves of the drag');
  expect(await page.evaluate(() => scrollY), 'the first moves of the drag: the page stays at its top').toBe(0);

  const narrower = await colWidth(page);
  await page.mouse.move(x - 100, y, { steps: 3 });
  await expectWidthSnaps(page, narrower, 'the next moves of the drag');
  await page.mouse.up();
  await expectTopStays(page, before, 'the drag');
  expect(errors).toEqual([]);
});

/** Gives the window a new size, and comes back after the page has heard of it. */
async function resizeWindow(page: Page, size: { width: number; height: number }): Promise<void> {
  // This listener runs after the one of the page, which it added at hydration.
  await page.evaluate(() => {
    const seen = window as unknown as { resized?: boolean };
    seen.resized = false;
    addEventListener('resize', () => (seen.resized = true), { once: true });
  });
  await page.setViewportSize(size);
  await expect.poll(() => page.evaluate(() => (window as unknown as { resized: boolean }).resized), OFTEN).toBe(true);
}

test('at the top of a long page, a narrower window and then a wider one keep the page at its top', async ({ page, docs }) => {
  const errors = failOnPageError(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await storeWidth(page, 'full');
  await openAtTop(page, `${docs.address}guide.html`);
  const before = await markNearLine(page);

  const wide = await colWidth(page);
  await resizeWindow(page, { width: 1100, height: 900 });
  await expectWidthSnaps(page, wide, 'a window 1100 px wide');
  await expectTopStays(page, before, 'a window 1100 px wide');

  const narrow = await colWidth(page);
  await resizeWindow(page, { width: 1440, height: 900 });
  await expectWidthSnaps(page, narrow, 'a window 1440 px wide again');
  expect(await page.evaluate(() => scrollY), 'a window 1440 px wide again: the page stays at its top').toBe(0);
  expect(errors).toEqual([]);
});

test('a little way down a long page, a key on the ruler that narrows the text still holds the line 30% down the window', async ({ page, docs }) => {
  const errors = failOnPageError(page);
  await openAtTop(page, `${docs.address}guide.html`);
  await scrollPage(page, 200);
  await showRuler(page);
  const before = await markLine(page);
  const scrolled = await page.evaluate(() => scrollY);
  const width = await colWidth(page);
  await pressOnWidth(page, 'PageDown');
  await expectWidthSnaps(page, width, 'PageDown');
  await expectMarkAt(page, before, 'PageDown');
  expect(await page.evaluate(() => scrollY), 'PageDown: the page scrolls with the text').toBeGreaterThan(scrolled);
  expect(errors).toEqual([]);
});

test('a new window height alone moves no line of the text, so the page keeps its scroll', async ({ page, docs }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await open(page, `${docs.address}guide.html`);
  const before = await page.evaluate(() => scrollY);
  // This listener runs after the one of the page, which it added at hydration.
  await page.evaluate(() =>
    addEventListener('resize', () => ((window as unknown as { afterResize: number }).afterResize = scrollY), { once: true }),
  );

  await page.setViewportSize({ width: 390, height: 756 });
  const after = () => page.evaluate(() => (window as unknown as { afterResize?: number }).afterResize);
  await expect.poll(after, OFTEN).toEqual(expect.any(Number));
  expect(await after()).toBe(before);
  expect(await page.evaluate(() => scrollY)).toBe(before);
});

test('a resize after a level change that scrolls nothing holds the line 30% down the window', async ({ page, docs }) => {
  const errors = failOnPageError(page);
  await storeWidth(page, 'full');
  await open(page, `${docs.address}guide.html`);
  const before = await markLine(page);
  const scrolled = await page.evaluate(() => scrollY);

  // The parts at the end of the page change, so the text on the line stays where it is.
  await pressOnSlider(page, 'ArrowRight');
  await expectLevel(page, 'requirements');
  await pressOnSlider(page, 'ArrowRight');
  await expectLevel(page, 'internals');
  await expectMarkAt(page, before, 'the level change');
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);

  const width = await colWidth(page);
  await page.setViewportSize({ width: 1000, height: 900 });
  await expectWidthSnaps(page, width, 'a resize');
  await expectMarkAt(page, before, 'a resize after the level change');
  expect(errors).toEqual([]);
});

test('a level change during a drag of the ruler leaves the next moves of the drag holding the line', async ({ page, docs }) => {
  const errors = failOnPageError(page);
  await open(page, `${docs.address}guide.html`);
  await showRuler(page);
  const handle = (await widthSlider(page).boundingBox())!;
  const rulerBox = (await ruler(page).boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = rulerBox.y + rulerBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 10, y);

  await pressOnSlider(page, 'ArrowRight');
  await expectLevel(page, 'requirements');
  const before = await markLine(page);
  const width = await colWidth(page);
  await page.mouse.move(x + 60, y, { steps: 5 });
  await expectWidthSnaps(page, width, 'the drag after the level change');
  await expectMarkAt(page, before, 'the drag after the level change');
  await page.mouse.up();
  expect(errors).toEqual([]);
});
