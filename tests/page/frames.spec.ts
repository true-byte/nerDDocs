import { pathToFileURL } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';
import { frameSizeKey } from '../../src/page/frames.ts';
import { SIZES_KEY } from '../../src/page/stored-sizes.ts';
import { MODE_KEY, THEME_KEY } from '../../src/page/theme-memory.ts';
import { storeLook } from '../support/diagrams.ts';
import { expectLevel, MOVE_MS, openOnStoppedClock, pressOnSlider, scrollPage, SIGNALS_MS } from '../support/levels.ts';
import { hydrated, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';
import {
  askedFiles,
  clickInFrame,
  DESKTOP,
  diskAddress,
  expectFrameFits,
  frameHeight,
  frameMessagesSettled,
  frameOf,
  framePosts,
  heldFramePosts,
  holdFramePosts,
  innerFrame,
  isFrameMarked,
  LOOP,
  markFrame,
  neededHeight,
  recordFrameLoads,
  recordFramePosts,
  siteOnDisk,
  WIREFRAME_FILES,
  WIREFRAMES_SITE,
  wireframeOf,
  WIZARD,
  type FrameMessage,
} from '../support/wireframes.ts';

/**
 * The tests only read the pages of the wireframes, so they share one folder of them, built as pages on disk, and one
 * command that serves them.
 */
const test = pageTest.extend<object, { disk: string; served: RunningCommand }>({
  disk: [async ({}, use) => use(await siteOnDisk(WIREFRAMES_SITE)), { scope: 'worker' }],
  served: [
    async ({}, use) => {
      const run = await runCommand(WIREFRAMES_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const PHONE = { width: 390, height: 844 };
const FULL = /(^|\s)full(\s|$)/;

/** Opens a page of the folder on disk, at a hash when one is given, and waits for its script. */
async function open(page: Page, disk: string, address = 'design/decisions.html', hash = ''): Promise<void> {
  await page.goto(diskAddress(disk, address) + hash);
  await hydrated(page);
}

const boxOf = async (element: Locator) => (await element.boundingBox())!;
const fullSizeButton = (page: Page, file = WIZARD) => wireframeOf(page, file).getByRole('button', { name: 'Full size', exact: true });
const closeButton = (page: Page, file = WIZARD) => wireframeOf(page, file).getByRole('button', { name: 'Close', exact: true });
const pageWidth = async (page: Page) => (await boxOf(page.locator('#page'))).width;
const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const windowSize = (page: Page) =>
  page.evaluate(() => ({ width: document.documentElement.clientWidth, height: innerHeight }));
/** The width of the frame × 3 / 5. */
const fiveByThree = (page: Page, file: string) => frameOf(page, file).evaluate((frame) => (frame.getBoundingClientRect().width * 3) / 5);
const ownHeight = (page: Page, file: string) => frameOf(page, file).evaluate((frame: HTMLElement) => frame.style.height);
const flashes = (page: Page) => page.locator('#page .flash');
const movingParts = (page: Page) =>
  page.locator('#page .part').evaluateAll((parts) => parts.filter((part) => (part as HTMLElement).style.clipPath).length);

/** Expects a box to cover the window, within 1 px. */
async function expectFillsWindow(page: Page, element: Locator, what: string): Promise<void> {
  const box = await boxOf(element);
  const window = await windowSize(page);
  expect(Math.abs(box.x), what).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y), what).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - window.width), what).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - window.height), what).toBeLessThanOrEqual(1);
}

/** Expects the block of the wireframe to sit inside the text, within 0.5 px on each side. */
async function expectInsideText(page: Page, file: string): Promise<void> {
  const block = await boxOf(wireframeOf(page, file));
  const text = await boxOf(page.locator('#page'));
  expect(block.x, file).toBeGreaterThanOrEqual(text.x - 0.5);
  expect(block.x + block.width, file).toBeLessThanOrEqual(text.x + text.width + 0.5);
}

/** Scrolls so the top of the block of the wireframe sits 100 px below the top of the window. */
async function scrollBlockNearTop(page: Page, file = WIZARD): Promise<void> {
  const top = await wireframeOf(page, file).evaluate((block) => block.getBoundingClientRect().top + scrollY - 100);
  await scrollPage(page, top);
}

/** Clicks 'Next' in 'Restore wizard', and waits until step 2 shows and the frame fits it. */
async function goToStepTwo(page: Page): Promise<void> {
  await (await innerFrame(page, WIZARD)).locator('#go').click();
  await expect((await innerFrame(page, WIZARD)).locator('#step-2')).toBeVisible();
  await expectFrameFits(page, WIZARD);
}

test("'Design decisions' shows 'Restore wizard' live in a bordered box as wide as the text, with a bar above a frame as tall as the wireframe", async ({ page, disk }) => {
  const asked: string[] = [];
  page.on('request', (request) => asked.push(request.url()));
  await open(page, disk);
  const block = wireframeOf(page, WIZARD);
  await expect(frameOf(page, WIZARD)).toHaveAttribute('title', 'Restore wizard');
  await expectFrameFits(page, WIZARD);

  const box = block.locator('.wf-box');
  const shown = await boxOf(box);
  expect(Math.abs(shown.width - (await pageWidth(page))), 'the box is as wide as the text').toBeLessThanOrEqual(1);
  await expect(box).toHaveCSS('border-top-style', 'solid');
  await expect(box).toHaveCSS('border-top-width', '1px');
  const bar = await boxOf(block.locator('.wf-bar'));
  const frame = await boxOf(frameOf(page, WIZARD));
  expect(Math.abs(bar.height - 30), 'the bar is 30 px tall').toBeLessThanOrEqual(0.5);
  expect(Math.abs(frame.y - (bar.y + bar.height)), 'the frame starts below the bar').toBeLessThanOrEqual(0.5);

  const inner = await innerFrame(page, WIZARD);
  const loaded = await inner.evaluate(() => ({
    style: document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')!.href,
    script: document.querySelector<HTMLScriptElement>('script[src]')!.src,
    padding: getComputedStyle(document.body).paddingTop,
    next: typeof (window as unknown as { next?: unknown }).next,
  }));
  expect(loaded.style).toMatch(/^file:\/\/.*\/design\/wireframes\/wizard\.css\?v=\d+$/);
  expect(loaded.script).toMatch(/^file:\/\/.*\/design\/wireframes\/wizard\.js\?v=\d+$/);
  expect(loaded.padding, 'the style of the wireframe applies').toBe('16px');
  expect(loaded.next, 'the script of the wireframe runs').toBe('function');
  await expect.poll(() => inner.evaluate(() => document.querySelector('img')!.naturalWidth), OFTEN).toBe(1280);
  expect(asked.filter((url) => !url.startsWith('file://'))).toEqual([]);
});

for (const where of ['over the server', 'from disk'] as const) {
  test(`${where}, the frames of 'Design decisions' ask only for the files of their wireframes, and no request fails and no error shows`, async ({ page, disk, served }) => {
    const loads = recordFrameLoads(page);
    const folder = where === 'from disk' ? `${pathToFileURL(disk).href}/` : served.address;
    await page.goto(`${folder}design/decisions.html`);
    await hydrated(page);
    await expectFrameFits(page, WIZARD);
    await expectFrameFits(page, DESKTOP);
    await expect.poll(async () => (await innerFrame(page, WIZARD)).evaluate(() => document.querySelector('img')!.naturalWidth), OFTEN).toBe(1280);
    await expect.poll(() => loads.waiting(), { ...OFTEN, message: 'each request of a frame has ended' }).toBe(0);

    expect(askedFiles(loads, folder), 'the files that the frames ask for').toEqual(WIREFRAME_FILES);
    expect(loads.failed, 'the requests that fail').toEqual([]);
    expect(loads.errors, 'the errors of the console').toEqual([]);
  });
}

test.describe('with no script', () => {
  test.use({ javaScriptEnabled: false });

  for (const where of ['over the server', 'from disk'] as const) {
    test(`${where}, 'Restore wizard' shows its own file with its style and its image, and no request fails`, async ({ page, disk, served }) => {
      const loads = recordFrameLoads(page);
      const folder = where === 'from disk' ? `${pathToFileURL(disk).href}/` : served.address;
      await page.goto(`${folder}design/decisions.html`);
      const block = wireframeOf(page, WIZARD);
      await expect(block.locator('iframe[data-srcdoc]'), 'the frame that the script fills').toBeHidden();
      const own = block.locator('noscript iframe');
      await expect(own).toBeVisible();
      await expect(own).toHaveAttribute('title', 'Restore wizard');
      const inner = own.contentFrame();
      await expect(inner.locator('body'), 'the style of the wireframe applies').toHaveCSS('padding-top', '16px');
      await expect(inner.locator('img')).toHaveJSProperty('naturalWidth', 1280);
      await expect.poll(() => loads.waiting(), { ...OFTEN, message: 'each request of a frame has ended' }).toBe(0);

      expect(askedFiles(loads, folder).filter((file) => !(file in WIREFRAMES_SITE)), 'the files that are not in the folder').toEqual([]);
      expect(loads.failed, 'the requests that fail').toEqual([]);
      expect(loads.errors, 'the errors of the console').toEqual([]);
    });
  }
});

test("a click on 'Next' shows step 2 and the frame grows to fit, and the theme of the wireframe changes nothing on the page", async ({ page, disk }) => {
  await open(page, disk);
  await expectFrameFits(page, WIZARD);
  const first = await frameHeight(page, WIZARD);
  await goToStepTwo(page);
  await expect((await innerFrame(page, WIZARD)).locator('#step-1')).toBeHidden();
  expect(await frameHeight(page, WIZARD), 'the frame grows').toBeGreaterThan(first + 20);

  await scrollBlockNearTop(page);
  const pageState = () =>
    page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      mode: document.documentElement.getAttribute('data-mode'),
      scroll: scrollY,
    }));
  const before = await pageState();
  const inner = await innerFrame(page, WIZARD);
  await inner.locator('#theme').click();
  await expect(inner.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await pageState()).toEqual(before);
});

test("a click on 'Pick a day' shows step 2 in the same frame, and the address of the page keeps its hash", async ({ page, disk }) => {
  await open(page, disk, 'design/decisions.html', '#restore-wizard');
  await expectFrameFits(page, WIZARD);
  await markFrame(page, WIZARD);
  const inner = await innerFrame(page, WIZARD);
  await inner.locator('#skip').click();
  await expect(inner.locator('#step-2')).toBeVisible();
  expect(await inner.evaluate(() => location.href)).toBe('about:srcdoc#step-2');
  expect(await isFrameMarked(page, WIZARD), 'the same document').toBe(true);
  expect(await page.evaluate(() => location.hash)).toBe('#restore-wizard');
});

test("'Desktop' scrolls sideways inside its frame, with no scroll down, and the page does not scroll sideways", async ({ page, disk }) => {
  await open(page, disk);
  await expectFrameFits(page, DESKTOP);
  const inner = await innerFrame(page, DESKTOP);
  const scroll = await inner.evaluate(() => {
    const root = document.scrollingElement!;
    root.scrollLeft = 120;
    return { wide: root.scrollWidth, shown: root.clientWidth, tall: root.scrollHeight, high: root.clientHeight, left: root.scrollLeft };
  });
  expect(scroll.wide).toBeGreaterThanOrEqual(960);
  expect(scroll.wide).toBeGreaterThan(scroll.shown);
  expect(scroll.left, 'the frame scrolls sideways').toBeGreaterThan(0);
  expect(scroll.tall, 'no scroll down inside the frame').toBeLessThanOrEqual(scroll.high);
  expect(await scrollsSideways(page)).toBe(false);
});

test("'Full size' shows the wireframe in the whole window in the same state, and Esc or 'Close' puts it back", async ({ page, disk }) => {
  await open(page, disk);
  await expectFrameFits(page, WIZARD);
  await markFrame(page, WIZARD);
  await scrollBlockNearTop(page);
  const block = wireframeOf(page, WIZARD);
  await expect(closeButton(page)).toBeHidden();
  const width = await pageWidth(page);
  let scroll = await page.evaluate(() => scrollY);

  const dialog = page.getByRole('dialog', { name: 'Restore wizard', exact: true });
  const openView = async (what: string) => {
    await fullSizeButton(page).click();
    await expect(block, what).toHaveClass(FULL);
    await expect(closeButton(page), what).toBeFocused();
    await expect(dialog, `${what}: the modal view`).toHaveAttribute('aria-modal', 'true');
  };
  const expectClosed = async (what: string) => {
    await expect(block, what).not.toHaveClass(FULL);
    await expect(dialog, `${what}: no modal view`).toHaveCount(0);
    await expect(fullSizeButton(page), what).toBeFocused();
    expect(await page.evaluate(() => scrollY), `${what}: the scroll of the page`).toBe(scroll);
  };

  // 'File' is part of step 1.
  await openView('the view at step 1');
  const file = (await innerFrame(page, WIZARD)).locator('#file');
  await file.focus();
  await expect(file, "'File' in the frame").toBeFocused();
  await page.keyboard.press('Escape');
  await expect(file).toHaveValue('');
  await frameMessagesSettled(page, WIZARD);
  await expect(block, "Esc in 'File' leaves the view open").toHaveClass(FULL);
  await closeButton(page).click();
  await expectClosed("'Close' after Esc in 'File'");

  await clickInFrame(page, WIZARD, '#go');
  await expect((await innerFrame(page, WIZARD)).locator('#step-2')).toBeVisible();
  await expectFrameFits(page, WIZARD);
  scroll = await page.evaluate(() => scrollY);

  await openView('the view at step 2');
  await expectFillsWindow(page, block.locator('.wf-box'), 'the box');
  const bar = await boxOf(block.locator('.wf-bar'));
  const frame = await boxOf(frameOf(page, WIZARD));
  const window = await windowSize(page);
  expect(Math.abs(frame.y - (bar.y + bar.height)), 'the frame starts below the bar').toBeLessThanOrEqual(1);
  expect(Math.abs(frame.y + frame.height - window.height), 'the frame reaches the bottom of the window').toBeLessThanOrEqual(1);
  expect(Math.abs(frame.width - window.width), 'the frame is as wide as the window').toBeLessThanOrEqual(1);
  await expect((await innerFrame(page, WIZARD)).locator('#step-2')).toBeVisible();
  expect(await isFrameMarked(page, WIZARD), 'the same document').toBe(true);
  expect(Math.abs((await pageWidth(page)) - width), 'the width of the text').toBeLessThanOrEqual(0.5);
  await expect(page.locator('html'), 'the page under the view does not scroll').toHaveCSS('overflow-y', 'hidden');

  await page.keyboard.press('Escape');
  await expectClosed('Esc on the page');

  await openView('the view after Esc');
  const theme = (await innerFrame(page, WIZARD)).locator('#theme');
  await theme.focus();
  await expect(theme, "'Theme' in the frame").toBeFocused();
  await page.keyboard.press('Escape');
  await expectClosed("Esc in 'Theme'");

  await openView("the view after Esc in 'Theme'");
  await closeButton(page).click();
  await expectClosed("'Close'");
  await expect((await innerFrame(page, WIZARD)).locator('#step-2')).toBeVisible();
  expect(await isFrameMarked(page, WIZARD), 'the same document').toBe(true);
});

test("Tab goes to 'Full size', through the wireframe, then to the text after it, and stays in the full-size view", async ({ page, disk }) => {
  await open(page, disk);
  await expectFrameFits(page, WIZARD);
  const inner = await innerFrame(page, WIZARD);
  await page.locator('#page').getByRole('link', { name: 'Restore a file', exact: true }).focus();

  await page.keyboard.press('Tab');
  await expect(fullSizeButton(page)).toBeFocused();
  for (const id of ['theme', 'file', 'go', 'skip']) {
    await page.keyboard.press('Tab');
    await expect(inner.locator(`#${id}`), id).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(page.locator('#page').getByRole('link', { name: 'Schedules', exact: true })).toBeFocused();

  await fullSizeButton(page).click();
  await expect(closeButton(page)).toBeFocused();
  const scroll = await page.evaluate(() => scrollY);
  await page.keyboard.press('Shift+Tab');
  await expect(inner.locator('#skip'), "a Shift+Tab from 'Close' in the full-size view").toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton(page), "a Tab past 'Pick a day' in the full-size view").toBeFocused();
  await page.keyboard.press('Tab');
  await expect(inner.locator('#theme'), "a Tab from 'Close' in the full-size view").toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(closeButton(page), "a Shift+Tab from 'Theme' in the full-size view").toBeFocused();
  expect(await page.evaluate(() => scrollY), 'the scroll of the page under the view').toBe(scroll);
});

test("a wireframe sees the light or dark setting of the computer, and not the look of the theme", async ({ page, disk }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await storeLook(page, 'original-nerd', 'dark');
  await open(page, disk);
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  const dark = () => innerFrame(page, WIZARD).then((inner) => inner.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches));
  expect(await dark(), "'Original Nerd' dark on a light computer").toBe(false);
  await expect(frameOf(page, WIZARD)).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  await page.emulateMedia({ colorScheme: 'dark' });
  // A script that runs before the page stores the look, since a write just before a reload can reach the next page late.
  await page.addInitScript(
    ([themeKey, modeKey]) => {
      localStorage.setItem(themeKey, 'themelessness');
      localStorage.setItem(modeKey, 'light');
    },
    [THEME_KEY, MODE_KEY] as const,
  );
  await page.reload();
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'themelessness');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  expect(await dark(), "'Themelessness' light on a dark computer").toBe(true);
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test("each wireframe stays in the text and scrolls in its frame, and 'Full size' covers the whole phone", async ({ page, disk }) => {
    await storeLook(page, 'original-nerd', 'dark');
    await open(page, disk);
    for (const file of [WIZARD, DESKTOP]) {
      await expectFrameFits(page, file);
      await expectInsideText(page, file);
    }
    expect(await scrollsSideways(page), 'the page scrolls sideways').toBe(false);
    const desktop = await innerFrame(page, DESKTOP);
    expect(await desktop.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth)).toBe(true);

    const block = wireframeOf(page, WIZARD);
    await fullSizeButton(page).tap();
    await expect(block).toHaveClass(FULL);
    await expectFillsWindow(page, block.locator('.wf-box'), 'the box on a phone');
    const overBar = await page.evaluate(() => {
      const bar = document.getElementById('bar')!.getBoundingClientRect();
      return !!document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2)?.closest('.wf-box');
    });
    expect(overBar, 'the box lies over the bar of the page').toBe(true);

    await closeButton(page).tap();
    await expect(block).not.toHaveClass(FULL);
    await expectInsideText(page, WIZARD);
  });
});

/** The height stored for a key, or null. */
const storedHeight = (page: Page, key: string) =>
  page.evaluate(
    ([sizesKey, name]) =>
      (JSON.parse(localStorage.getItem(sizesKey) ?? '[]') as [string, number, number][]).find(([stored]) => stored === name)?.[2] ?? null,
    [SIZES_KEY, key] as const,
  );

test('a frame holds the height that this browser last measured for it, or else 5:3 of the text width, before any post', async ({ page, disk }) => {
  await open(page, disk);
  await expectFrameFits(page, WIZARD);
  const height = await frameHeight(page, WIZARD);
  await expect.poll(() => storedHeight(page, frameSizeKey(WIZARD)), OFTEN).toBe(height);
  expect(Math.abs(height - (await fiveByThree(page, WIZARD))), 'the wireframe is not 5:3').toBeGreaterThan(20);

  const release = await holdFramePosts(page);
  try {
    await page.reload();
    await hydrated(page);
    await expect.poll(() => frameHeight(page, WIZARD), OFTEN).toBe(height);
    await expect.poll(() => heldFramePosts(page), OFTEN).toBeGreaterThan(0);
    expect(await frameHeight(page, WIZARD), 'the stored height after a post').toBe(height);

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await hydrated(page);
    await expect.poll(() => heldFramePosts(page), OFTEN).toBeGreaterThan(0);
    expect(await ownHeight(page, WIZARD), 'no height of its own').toBe('');
    expect(Math.abs((await frameHeight(page, WIZARD)) - (await fiveByThree(page, WIZARD))), 'the frame at 5:3').toBeLessThanOrEqual(1);
  } finally {
    await release();
  }
});

test('a wireframe that is always taller than its frame stops growing after four posts, at the same height on each visit', async ({ page, disk }) => {
  await recordFramePosts(page);
  await open(page, disk, 'design/loop.html');
  const first = await fiveByThree(page, LOOP);
  /** The last height post that reached the page, less the height of the frame, read in one go. */
  const lastExcess = () =>
    frameOf(page, LOOP).evaluate((frame) => {
      const posts = ((window as unknown as { framePosts: FrameMessage[] }).framePosts ?? []).filter((post) => typeof post.height === 'number');
      const last = posts[posts.length - 1];
      return last ? last.height! - frame.getBoundingClientRect().height : null;
    });
  /** Waits until the frame stops, and gives its height. */
  const stoppedHeight = async (what: string) => {
    await expect.poll(lastExcess, { ...OFTEN, message: `${what}: a post 16 px above the frame, which only a dropped post leaves` }).toBe(16);
    return frameHeight(page, LOOP);
  };
  const height = await stoppedHeight('the first visit');
  expect(height, 'the frame grows less than 100 px').toBeLessThan(first + 100);

  const seen = (await framePosts(page)).length;
  await frameOf(page, LOOP).evaluate((frame: HTMLIFrameElement) => frame.contentWindow!.postMessage({ nerddocs: 'frame', ask: true }, '*'));
  await expect.poll(async () => (await framePosts(page)).length, OFTEN).toBeGreaterThan(seen);
  expect(await frameHeight(page, LOOP), 'the frame stays after one more post').toBe(height);

  for (const visit of ['the second visit', 'the third visit']) {
    await page.reload();
    await hydrated(page);
    expect(Math.abs((await stoppedHeight(visit)) - height), visit).toBeLessThanOrEqual(1);
  }
});

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  /** The part that holds 'Restore wizard'. */
  const wizardPart = (page: Page) => page.locator('#page .part:has(.wf)');
  /** True when 'Restore wizard' is at step 2, also in a part that the level hides. */
  const showsStepTwo = async (page: Page) =>
    (await innerFrame(page, WIZARD)).evaluate(() => !document.getElementById('step-2')!.hidden && document.getElementById('step-1')!.hidden);

  test('a level change that shows a wireframe keeps its motion and its signals, and the frame takes its height once the text is still', async ({ page, disk }) => {
    await recordFramePosts(page);
    await openOnStoppedClock(page, diskAddress(disk, 'design/shown.html'));
    await expect.poll(async () => (await innerFrame(page, WIZARD)).evaluate(() => document.readyState), OFTEN).toBe('complete');
    await markFrame(page, WIZARD);
    expect(await ownHeight(page, WIZARD), 'a hidden frame has no height of its own').toBe('');
    const seen = (await framePosts(page)).length;

    await pressOnSlider(page, 'ArrowRight');
    await expect
      .poll(
        async () => {
          const needed = await neededHeight(await innerFrame(page, WIZARD));
          return (await framePosts(page)).slice(seen).some((post) => post.height === needed);
        },
        { ...OFTEN, message: 'the frame posts the height that it needs' },
      )
      .toBe(true);
    expect(await movingParts(page), 'the parts that move').toBeGreaterThan(0);
    expect(await ownHeight(page, WIZARD), 'the frame during the change').toBe('');
    expect(Math.abs((await frameHeight(page, WIZARD)) - (await fiveByThree(page, WIZARD))), 'the reserved 5:3').toBeLessThanOrEqual(1);

    await page.clock.runFor(MOVE_MS);
    await expectLevel(page, 'requirements');
    await expectFrameFits(page, WIZARD);
    await expect(flashes(page), 'the tint after the change').not.toHaveCount(0);
    expect(await isFrameMarked(page, WIZARD), 'the frame loaded once').toBe(true);

    await page.clock.runFor(SIGNALS_MS);
    await expect(flashes(page)).toHaveCount(0);
  });

  test('a level change that moves the part of a wireframe keeps its frame and its step', async ({ page, disk }) => {
    await openOnStoppedClock(page, diskAddress(disk, 'design/moved.html'));
    await expectFrameFits(page, WIZARD);
    await clickInFrame(page, WIZARD, '#go');
    await expect((await innerFrame(page, WIZARD)).locator('#step-2')).toBeVisible();
    await markFrame(page, WIZARD);

    await pressOnSlider(page, 'ArrowRight');
    expect(await movingParts(page), 'the parts that move').toBeGreaterThan(0);
    expect(
      await wizardPart(page).evaluate((part) => part.previousElementSibling?.getAttribute('data-l') ?? null),
      'the part moves after the part of the next level',
    ).toBe('requirements internals');

    await page.clock.runFor(MOVE_MS);
    await expectLevel(page, 'requirements');
    expect(await isFrameMarked(page, WIZARD), 'the same document').toBe(true);
    expect(await showsStepTwo(page), 'step 2').toBe(true);
  });

  test.describe('in a browser with no moveBefore', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        Reflect.deleteProperty(Element.prototype, 'moveBefore');
      });
    });

    test('a level change keeps the part of a wireframe in its place, with its frame and its step', async ({ page, disk }) => {
      await openOnStoppedClock(page, diskAddress(disk, 'design/moved.html'));
      expect(await page.evaluate(() => typeof (document.body as unknown as { moveBefore?: unknown }).moveBefore)).toBe('undefined');
      await expectFrameFits(page, WIZARD);
      await clickInFrame(page, WIZARD, '#go');
      await expect((await innerFrame(page, WIZARD)).locator('#step-2')).toBeVisible();
      await markFrame(page, WIZARD);
      await wizardPart(page).evaluate((part) => {
        (part.previousElementSibling as unknown as { before: boolean }).before = true;
      });

      await pressOnSlider(page, 'ArrowRight');
      expect(await movingParts(page), 'the parts that move').toBeGreaterThan(0);
      expect(
        await wizardPart(page).evaluate((part) => (part.previousElementSibling as unknown as { before?: boolean } | null)?.before === true),
        'the part keeps its place',
      ).toBe(true);

      await page.clock.runFor(MOVE_MS);
      await expectLevel(page, 'requirements');
      expect(await isFrameMarked(page, WIZARD), 'the same document').toBe(true);
      expect(await showsStepTwo(page), 'step 2').toBe(true);
    });
  });

  test('a level change that pairs the part of a wireframe shows an empty box of its size in the ghost', async ({ page, disk }) => {
    await openOnStoppedClock(page, diskAddress(disk, 'design/ghost.html'));
    await expectFrameFits(page, WIZARD);
    await markFrame(page, WIZARD);
    const height = await frameHeight(page, WIZARD);

    await pressOnSlider(page, 'ArrowRight');
    const ghost = page.locator('#page .ghost');
    await expect(ghost).toHaveCount(1);
    await expect(ghost.locator('iframe'), 'a frame in the ghost').toHaveCount(0);
    const box = ghost.locator('div.wf-frame');
    await expect(box).toHaveCount(1);
    expect(Math.abs((await box.evaluate((element) => element.getBoundingClientRect().height)) - height), 'the box has the height of the frame').toBeLessThanOrEqual(1);

    await page.clock.runFor(MOVE_MS);
    await expectLevel(page, 'requirements');
    await expect(ghost).toHaveCount(0);
    expect(await isFrameMarked(page, WIZARD), 'the same document').toBe(true);
  });
});
