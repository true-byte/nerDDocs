import { expect, type Locator, type Page } from '@playwright/test';
import { FULL_VIEW_ID } from '../../src/page/full-view.ts';
import { MODE_KEY } from '../../src/page/theme-memory.ts';
import {
  diagramBox,
  DIAGRAMS_SITE,
  drawingOf,
  expectDrawn,
  holdBuilds,
  isMarked,
  markDrawing,
  RESTORE_FLOW,
  storeLook,
} from '../support/diagrams.ts';
import { IMAGES_SITE, pngFile } from '../support/images.ts';
import { failOnPageError, hydrated, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

/** The page 'Restore log', with one image that is taller than any window, and one wider than the window at 1440×900. */
const SHAPES_PAGE = '# Restore log\n\n![Restore log](restore-log.png)\n\n![Full screen](full-screen.png)\n';

/** The tests only read 'Restore a file', 'Restore log' and 'User flows', so they share a command on the images and one on the diagrams. */
const test = pageTest.extend<object, { images: RunningCommand; diagrams: RunningCommand }>({
  images: [
    async ({}, use) => {
      const run = await runCommand({
        ...IMAGES_SITE,
        'log.md': SHAPES_PAGE,
        'restore-log.png': pngFile(600, 2400),
        'full-screen.png': pngFile(2560, 1600),
      });
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
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

const darkCopy = (page: Page) => page.locator('#page img[data-look="dark"]');
const view = (page: Page) => page.locator(`#${FULL_VIEW_ID}`);
const viewImage = (page: Page) => view(page).locator('img');

/** Opens 'Restore a file' in the dark look, so the dark copy of 'Restore window' shows. */
async function openDark(page: Page, address: string): Promise<void> {
  await page.addInitScript(([key]) => localStorage.setItem(key, 'dark'), [MODE_KEY] as const);
  await page.goto(`${address}restore.html`);
  await hydrated(page);
  await expect(darkCopy(page)).toBeVisible();
  await expect.poll(() => darkCopy(page).evaluate((image: HTMLImageElement) => image.naturalWidth), OFTEN).toBe(1280);
}

const expectOpen = (page: Page) => expect(view(page)).toHaveAttribute('open', '');
const expectClosed = (page: Page) => expect(view(page)).not.toHaveAttribute('open');

/** Opens each image of 'Restore log' full size, and expects it whole inside the window, with no scroll in the view. */
async function expectEachFits(page: Page, address: string, width: number, height: number): Promise<void> {
  await page.goto(`${address}log.html`);
  await hydrated(page);
  for (const [alt, naturalWidth] of [
    ['Restore log', 600],
    ['Full screen', 2560],
  ] as const) {
    const image = page.getByAltText(alt, { exact: true });
    await image.scrollIntoViewIfNeeded();
    await image.click();
    await expectOpen(page);
    await expect.poll(() => viewImage(page).evaluate((shown: HTMLImageElement) => shown.naturalWidth), OFTEN).toBe(naturalWidth);
    const shown = (await viewImage(page).boundingBox())!;
    expect(shown.height, alt).toBeGreaterThan(0);
    expect(shown.x, alt).toBeGreaterThanOrEqual(0);
    expect(shown.y, alt).toBeGreaterThanOrEqual(0);
    expect(shown.x + shown.width, alt).toBeLessThanOrEqual(width);
    expect(shown.y + shown.height, alt).toBeLessThanOrEqual(height);
    expect(await view(page).evaluate((dialog) => dialog.scrollHeight - dialog.clientHeight), alt).toBe(0);
    await page.keyboard.press('Escape');
    await expectClosed(page);
  }
}

/** The red, green, blue and alpha of a computed color, in the sRGB form or the rgb() form. */
function channels(color: string): number[] {
  const srgb = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/.exec(color);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, Number(srgb[4] ?? 1)];
  const rgb = /^rgba?\((\d+(?:\.\d+)?), (\d+(?:\.\d+)?), (\d+(?:\.\d+)?)(?:, ([\d.]+))?\)$/.exec(color);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)];
  throw new Error(`An unknown color: ${color}`);
}

test('a click opens the copy of the look full size on the background at 95%, and a click anywhere closes it with the focus back', async ({ page, images }) => {
  const errors = failOnPageError(page);
  await openDark(page, images.address);
  await darkCopy(page).click();

  await expectOpen(page);
  expect(await view(page).boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  await expect(view(page)).toHaveAttribute('aria-label', 'Restore window');
  await expect(viewImage(page)).toHaveCount(1);
  const opened = await darkCopy(page).evaluate((image: HTMLImageElement) => image.currentSrc);
  expect(await viewImage(page).evaluate((image: HTMLImageElement) => image.src)).toBe(opened);
  await expect(viewImage(page)).toHaveAttribute('alt', 'Restore window');
  expect(await view(page).evaluate((dialog: HTMLElement) => dialog.innerText.trim())).toBe('');

  const { backdrop, bg } = await view(page).evaluate((dialog) => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--bg)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return { backdrop: getComputedStyle(dialog, '::backdrop').backgroundColor, bg: color };
  });
  const [r, g, b, alpha] = channels(backdrop);
  const [bgR, bgG, bgB] = channels(bg);
  expect(Math.abs(r! - bgR!), backdrop).toBeLessThanOrEqual(1);
  expect(Math.abs(g! - bgG!), backdrop).toBeLessThanOrEqual(1);
  expect(Math.abs(b! - bgB!), backdrop).toBeLessThanOrEqual(1);
  expect(Math.abs(alpha! - 0.95), backdrop).toBeLessThanOrEqual(0.005);

  await page.mouse.click(2, 2);
  await expectClosed(page);
  await expect(viewImage(page)).toHaveCount(0);
  await expect(darkCopy(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test('Enter opens and Esc closes, and Space opens with no scroll', async ({ page, images }) => {
  await openDark(page, images.address);
  await darkCopy(page).focus();
  const scrolled = await page.evaluate(() => scrollY);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), 'the page can scroll').toBeGreaterThan(0);

  await page.keyboard.press('Enter');
  await expectOpen(page);
  await page.keyboard.press('Escape');
  await expectClosed(page);
  await expect(darkCopy(page)).toBeFocused();

  await page.keyboard.press('Space');
  await expectOpen(page);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
});

test('an image taller or wider than the window shows whole inside it', async ({ page, images }) => {
  await expectEachFits(page, images.address, 1440, 900);
});

test('an image in a line of text or in a link opens no view, and a click on the linked image follows its link', async ({ page, images }) => {
  await openDark(page, images.address);
  await expect(darkCopy(page)).toHaveAttribute('data-full', '');
  const button = page.getByAltText('Restore', { exact: true });
  const linked = page.getByAltText('Schedules window', { exact: true });
  await expect(button).not.toHaveAttribute('data-full');
  await expect(linked).not.toHaveAttribute('data-full');

  await button.click();
  await expect(page.locator(`#${FULL_VIEW_ID}[open]`)).toHaveCount(0);

  await linked.click();
  await expect(page).toHaveURL(/\/schedules\.html$/);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a tap opens the view and a tap closes it', async ({ page, images }) => {
    await openDark(page, images.address);
    await darkCopy(page).tap();
    await expectOpen(page);
    const shown = (await viewImage(page).boundingBox())!;
    expect(shown.width).toBeGreaterThan(0);
    expect(shown.x).toBeGreaterThanOrEqual(0);
    expect(shown.y).toBeGreaterThanOrEqual(0);
    expect(shown.x + shown.width).toBeLessThanOrEqual(390);
    expect(shown.y + shown.height).toBeLessThanOrEqual(844);

    await viewImage(page).tap();
    await expectClosed(page);
  });

  test('an image taller or wider than the window shows whole inside it', async ({ page, images }) => {
    await expectEachFits(page, images.address, 390, 844);
  });
});

test.describe('a Mermaid diagram', () => {
  const flowOf = (page: Page) => diagramBox(page, RESTORE_FLOW);

  /** Opens 'User flows' in 'Themelessness' light, and waits until 'Restore a file' is drawn. */
  async function openFlows(page: Page, address: string): Promise<void> {
    await storeLook(page, 'themelessness', 'light');
    await page.goto(`${address}user-flows.html`);
    await hydrated(page);
    await expectDrawn(flowOf(page));
  }

  /** The box of the drawing in the window, and the window. */
  const placeOf = (element: Locator) =>
    element.evaluate((node) => ({ ...node.getBoundingClientRect().toJSON(), innerWidth, innerHeight }) as Record<string, number>);

  function expectInsideWindow(place: Record<string, number>): void {
    expect(place.width, 'the width of the drawing').toBeGreaterThan(0);
    expect(place.left).toBeGreaterThanOrEqual(0);
    expect(place.top).toBeGreaterThanOrEqual(0);
    expect(place.right).toBeLessThanOrEqual(place.innerWidth!);
    expect(place.bottom).toBeLessThanOrEqual(place.innerHeight!);
  }

  test('a click opens a drawn diagram full size and keeps its box, and a click closes it and puts the drawing back', async ({ page, diagrams }) => {
    const errors = failOnPageError(page);
    await openFlows(page, diagrams.address);
    const flow = flowOf(page);
    await markDrawing(flow);
    const height = await flow.evaluate((box) => box.getBoundingClientRect().height);

    await flow.click();
    await expectOpen(page);
    await expect(view(page)).toHaveAttribute('aria-label', 'Restore a file');
    const shown = view(page).locator(':scope > *');
    await expect(shown).toHaveCount(1);
    expect(await shown.evaluate((node) => node.tagName.toLowerCase())).toBe('svg');
    expect(await isMarked(shown), 'the drawing itself').toBe(true);
    expectInsideWindow(await placeOf(shown));
    expect(Math.abs((await flow.evaluate((box) => box.getBoundingClientRect().height)) - height), 'the box keeps its height').toBeLessThanOrEqual(0.5);
    const marker = await shown.evaluate((svg) => svg.querySelector('marker')!.id);
    expect(await page.evaluate((id) => document.querySelectorAll(`#${CSS.escape(id)}`).length, marker)).toBe(1);

    await page.mouse.click(2, 2);
    await expectClosed(page);
    expect(await isMarked(drawingOf(flow)), 'the drawing is back in its box').toBe(true);
    expect(await flow.evaluate((box: HTMLElement) => box.style.height)).toBe('');
    await expect(flow).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('Enter and Space open a drawn diagram, and a box before its draw opens nothing', async ({ page, diagrams }) => {
    await openFlows(page, diagrams.address);
    const flow = flowOf(page);
    await flow.focus();
    const scrolled = await page.evaluate(() => scrollY);

    await page.keyboard.press('Enter');
    await expectOpen(page);
    await page.keyboard.press('Escape');
    await expectClosed(page);
    await expect(flow).toBeFocused();

    await page.keyboard.press('Space');
    await expectOpen(page);
    expect(await page.evaluate(() => scrollY)).toBe(scrolled);
    await page.keyboard.press('Escape');
    await expectClosed(page);

    const gate = await holdBuilds(page);
    try {
      await page.reload();
      await hydrated(page);
      await expect(flow).not.toHaveAttribute('data-state');
      await expect(flow).not.toHaveAttribute('tabindex');
      await flow.click();
      await expect(page.locator(`#${FULL_VIEW_ID}[open]`)).toHaveCount(0);
    } finally {
      gate.release();
    }
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('a tap opens a drawn diagram and a tap closes it', async ({ page, diagrams }) => {
      await openFlows(page, diagrams.address);
      const flow = flowOf(page);
      await markDrawing(flow);
      await flow.tap();
      await expectOpen(page);
      const shown = view(page).locator(':scope > svg');
      expectInsideWindow(await placeOf(shown));

      await shown.tap();
      await expectClosed(page);
      expect(await isMarked(drawingOf(flow)), 'the drawing is back in its box').toBe(true);
    });
  });
});
