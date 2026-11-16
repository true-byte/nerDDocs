import { expect, type Page } from '@playwright/test';
import { applyLook, diagramBox, DIAGRAMS_SITE, expectDrawn, holdBuilds, RESTORE_FLOW, storeLook } from '../support/diagrams.ts';
import { PAIR_FILES, PLAN_PICTURE } from '../support/images.ts';
import { expectLevel, MOVE_MS, pressOnSlider, scrollPage, SIGNALS_MS, THREE_LEVELS } from '../support/levels.ts';
import { STEPS } from '../support/page-content.ts';
import { failOnPageError, hydrated, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';
import {
  colWidth,
  expectCharWidthSettled,
  expectMarkAt,
  expectWidthSnaps,
  leftHandle,
  LINE_AT,
  markLine,
  markNearLine,
  markOffset,
  noScrollAnchoring,
  PROSE,
  pressOnWidth,
  prosePage,
  ruler,
  scrollToMiddle,
  showRuler,
  storeOutlineHidden,
  storeWidth,
  widthSlider,
} from '../support/text-width.ts';
import { clickInFrame, DESKTOP, expectFrameFits, frameHeight, frameOf, WIREFRAMES_SITE, wireframeOf, WIZARD } from '../support/wireframes.ts';

/** A long page of shared text that ends with a part at each level, below the middle of the page. */
const FILES = {
  'nerddocs.json': THREE_LEVELS,
  'guide.md': `${prosePage('Backup guide', 6)}\n::: overview\nA plan keeps a copy of each file.\n::: internals\nThe agent locks each block with the key of the account before it sends the block.\n:::\n`,
};

/**
 * A long page of shared text with the image 'Flow' after its second paragraph and two parts in its middle. 'Flow' is
 * an SVG file with no size, which the browser draws at 300 by 150.
 */
const FLOW_FILES = {
  'nerddocs.json': THREE_LEVELS,
  'guide.md': prosePage('Backup guide', 6)
    .replace(`${PROSE[1]}\n\n`, `${PROSE[1]}\n\n![Flow](flow.svg)\n\n`)
    .replace(
      '## Part 4',
      '::: overview\nA plan keeps a copy of each file.\n::: requirements internals\nThe agent locks each block with the key of the account before it sends the block.\n:::\n\n## Part 4',
    ),
  'flow.svg': '<svg xmlns="http://www.w3.org/2000/svg"><rect width="300" height="150"/></svg>',
};

/** A page with the light and dark copies of 'Restore window' twice, with steps around them. */
const PAIRS_FILES = {
  'guide.md': `# Backup guide\n\n${STEPS}\n\n${PLAN_PICTURE}\n\n${STEPS}\n\n${PLAN_PICTURE}\n\n${STEPS}\n`,
  ...PAIR_FILES,
};

const test = pageTest.extend<
  object,
  { docs: RunningCommand; flowDocs: RunningCommand; pairDocs: RunningCommand; diagrams: RunningCommand; wireframes: RunningCommand }
>({
  docs: [
    async ({}, use) => {
      const run = await runCommand(FILES);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
  flowDocs: [
    async ({}, use) => {
      const run = await runCommand(FLOW_FILES);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
  pairDocs: [
    async ({}, use) => {
      const run = await runCommand(PAIRS_FILES);
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
  wireframes: [
    async ({}, use) => {
      const run = await runCommand(WIREFRAMES_SITE);
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
  // With no outline column in the wide window, the narrower window takes enough width to move the lines above the mark.
  await storeOutlineHidden(page);
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

test.describe('on a short page in a window 720 px high', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('a key on the ruler before the page hears of a scroll, with no text on the line, keeps the page where the scroll put it', async ({ page, site }) => {
    const errors = failOnPageError(page);
    await openAtTop(page, `${site.address}backups/schedules.html`);
    await showRuler(page);
    // At the top of 'Schedules' the line 30% down the window falls on its text, so the page takes a place there.
    await markNearLine(page);
    const heading = page.locator('#weekly-plan');
    const top = await heading.evaluate((h2) => Math.round(h2.getBoundingClientRect().top + scrollY - 32));
    const width = await colWidth(page);

    // The scroll event of a scroll comes in a later task, so the key comes first, as after a jump to a heading.
    const scrolled = await page.evaluate(
      ([y, share]) => {
        scrollTo({ top: y, behavior: 'instant' });
        const at = scrollY;
        const text = document.querySelector('#page')!.lastElementChild!.getBoundingClientRect().bottom;
        const slider = document.querySelector('#ruler [role="slider"]')!;
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
        return { at, gap: innerHeight * share - text };
      },
      [top, LINE_AT] as const,
    );
    expect(scrolled.at, "the scroll brings 'Weekly plan' 32 px from the top").toBe(top);
    expect(scrolled.gap, 'the text ends well above the line 30% down the window').toBeGreaterThan(50);

    await expectWidthSnaps(page, width, 'PageDown');
    await expect.poll(() => page.evaluate(() => scrollY), { ...OFTEN, message: 'the page stays where the scroll put it' }).toBe(top);
    expect(errors).toEqual([]);
  });
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

test.describe('content that changes its size by itself', () => {
  const flow = (page: Page) => page.getByAltText('Flow', { exact: true });
  const flowWidth = (page: Page) => flow(page).evaluate((image: HTMLImageElement) => image.naturalWidth);
  const flashes = (page: Page) => page.locator('#page .flash');
  const ticks = (page: Page) => page.locator('#ticks > i');
  const entering = (page: Page) => page.locator('#page .part[data-l="requirements internals"]');

  /** Holds the response of 'flow.svg' until the returned function runs. */
  async function holdFlow(page: Page): Promise<() => void> {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname.endsWith('/flow.svg'),
      async (route) => {
        await held;
        await route.continue().catch(() => {});
      },
    );
    return release;
  }

  /** Opens the page while 'Flow' waits for its file, which holds back the load event of the page. */
  async function openWhileFlowWaits(page: Page, address: string, stoppedClock = false): Promise<void> {
    if (stoppedClock) await page.clock.install({ time: 0 });
    await page.goto(`${address}guide.html`, { waitUntil: 'domcontentloaded' });
    await hydrated(page);
    if (stoppedClock) await page.clock.pauseAt(3_600_000);
    await noScrollAnchoring(page);
    await expect(flow(page)).not.toHaveAttribute('width');
    expect(await flowWidth(page), 'the image waits for its file').toBe(0);
  }

  /** Scrolls so the first part starts 100 px below the window. */
  async function scrollPartBelowWindow(page: Page): Promise<void> {
    const top = await page
      .locator('#page .part')
      .first()
      .evaluate((part) => part.getBoundingClientRect().top + scrollY - innerHeight - 100);
    await scrollPage(page, top);
  }

  const tickTop = (page: Page) => ticks(page).evaluate((tick: HTMLElement) => parseFloat(tick.style.top));
  /** The place of a tick for the part, as a share of the page height in steps of half a percent. */
  const tickTopFor = (page: Page) =>
    entering(page).evaluate(
      (part) => Math.round(((part.getBoundingClientRect().top + scrollY) / document.documentElement.scrollHeight) * 200) / 2,
    );

  test('an image with no size that loads above the line keeps the line', async ({ page, flowDocs }) => {
    const errors = failOnPageError(page);
    const release = await holdFlow(page);
    try {
      await openWhileFlowWaits(page, flowDocs.address);
      await scrollToMiddle(page);
      const before = await markLine(page);

      release();
      await expect.poll(() => flowWidth(page), OFTEN).toBe(300);
      await expectMarkAt(page, before, 'the load of the image');
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });

  test.describe('with motion', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('an image with no size that loads during a level change leaves the change and its signals, and the change holds its line', async ({ page, flowDocs }) => {
      const release = await holdFlow(page);
      try {
        await openWhileFlowWaits(page, flowDocs.address, true);
        await scrollPartBelowWindow(page);
        const before = await markLine(page);
        await pressOnSlider(page, 'ArrowRight');
        await expect(flashes(page)).not.toHaveCount(0);

        release();
        await expect.poll(() => flowWidth(page), OFTEN).toBe(300);
        await expect(flashes(page), 'the tint after the load').not.toHaveCount(0);
        const moving = await page.locator('#page .part').evaluateAll((parts) => parts.filter((part) => (part as HTMLElement).style.clipPath).length);
        expect(moving, 'the parts that still move after the load').toBeGreaterThan(0);

        await page.clock.runFor(MOVE_MS);
        await expectLevel(page, 'requirements');
        await expectMarkAt(page, before, 'the level change');
        await expect(flashes(page), 'the tint after the change').not.toHaveCount(0);

        await page.clock.runFor(SIGNALS_MS);
        await expect(flashes(page)).toHaveCount(0);
      } finally {
        release();
      }
    });
  });

  test('an image with no size that loads while the ticks show leaves them and moves each to its part', async ({ page, flowDocs }) => {
    const release = await holdFlow(page);
    try {
      await openWhileFlowWaits(page, flowDocs.address, true);
      await scrollPartBelowWindow(page);
      await pressOnSlider(page, 'ArrowRight');
      await expectLevel(page, 'requirements');
      await expect(ticks(page)).toHaveCount(1);
      await expect(entering(page)).toHaveClass(/flash/);
      const before = await tickTop(page);
      expect(before).toBe(await tickTopFor(page));
      const shown = await ticks(page).elementHandle();

      release();
      await expect.poll(() => flowWidth(page), OFTEN).toBe(300);
      await expect(ticks(page)).toHaveCount(1);
      await expect.poll(async () => (await tickTop(page)) - (await tickTopFor(page)), OFTEN).toBe(0);
      expect(await tickTop(page), 'the tick moves with its part').not.toBe(before);
      expect(await shown!.evaluate((tick) => tick.isConnected), 'the same tick moves, so its fade goes on').toBe(true);
      await expect(entering(page)).toHaveClass(/flash/);
    } finally {
      release();
    }
  });

  test('with the line on the second of two pairs of different sizes, a look switch keeps the top of that image on the line', async ({ page, pairDocs }) => {
    const errors = failOnPageError(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`${pairDocs.address}guide.html`);
    await hydrated(page);
    await noScrollAnchoring(page);
    await expectCharWidthSettled(page);
    const pairs = page.locator('#page p:has(> img[data-look])');
    await expect(pairs).toHaveCount(2);
    const second = pairs.nth(1);
    const top = await second.evaluate((pair, share) => pair.getBoundingClientRect().top + scrollY - innerHeight * share + 100, LINE_AT);
    await scrollPage(page, top);
    const offset = () => second.evaluate((pair, share) => pair.getBoundingClientRect().top - innerHeight * share, LINE_AT);
    const before = await offset();
    expect(before, 'the line falls inside the second pair').toBeLessThan(0);

    await page.locator('#thmB').click();
    await page.locator('#theme-mode [data-look="dark"]').click();
    await page.locator('#theme-apply').click();

    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    for (const copy of await page.locator('#page img[data-look="dark"]').all()) await expect(copy).toBeVisible();
    await expect.poll(async () => Math.abs((await offset()) - before), OFTEN).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});

test.describe('a Mermaid diagram that draws', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const flowOf = (page: Page) => diagramBox(page, RESTORE_FLOW);
  const heightOf = (page: Page) => flowOf(page).evaluate((box) => box.getBoundingClientRect().height);
  /** The offset of the top of the box from the line 30% down the window. */
  const topOffset = (page: Page) => flowOf(page).evaluate((box, share) => box.getBoundingClientRect().top - innerHeight * share, LINE_AT);

  /** Opens 'Restore guide' in 'Themelessness' light, with no scroll anchoring. */
  async function openGuide(page: Page, address: string): Promise<void> {
    await storeLook(page, 'themelessness', 'light');
    await page.goto(`${address}flow-guide.html`);
    await hydrated(page);
    await noScrollAnchoring(page);
  }

  /** Scrolls so the bottom of the box sits 60 px above the line, and marks the text on the line after it. */
  async function markTextAfterBox(page: Page): Promise<number> {
    const top = await flowOf(page).evaluate(
      (box, share) => box.getBoundingClientRect().bottom + scrollY - innerHeight * share + 60,
      LINE_AT,
    );
    await scrollPage(page, top);
    const before = await markLine(page);
    const bottom = await flowOf(page).evaluate((box) => box.getBoundingClientRect().bottom / innerHeight);
    expect(bottom, 'the box ends inside the window, above the line').toBeGreaterThan(0);
    expect(bottom, 'the box ends inside the window, above the line').toBeLessThan(LINE_AT);
    return before;
  }

  test('a diagram that draws above the line keeps the line', async ({ page, diagrams }) => {
    const errors = failOnPageError(page);
    const gate = await holdBuilds(page);
    try {
      await openGuide(page, diagrams.address);
      await expect(flowOf(page)).not.toHaveAttribute('data-state');
      const before = await markTextAfterBox(page);
      const reserved = await heightOf(page);

      gate.release();
      await expectDrawn(flowOf(page));
      expect(Math.abs((await heightOf(page)) - reserved), 'the draw changes the height of the box').toBeGreaterThan(20);
      await expectMarkAt(page, before, 'the draw');
      expect(errors).toEqual([]);
    } finally {
      gate.release();
    }
  });

  test('a look switch with a diagram above the line keeps the text on the line through the redraw', async ({ page, diagrams }) => {
    await openGuide(page, diagrams.address);
    await expectDrawn(flowOf(page));
    const before = await markTextAfterBox(page);
    const drawn = await heightOf(page);

    await applyLook(page, 'im-in', 'dark');
    await expect(flowOf(page)).toHaveAttribute('data-drawn', 'im-in dark tiny');
    expect(Math.abs((await heightOf(page)) - drawn), 'the redraw changes the height of the box').toBeGreaterThan(10);
    await expectMarkAt(page, before, 'the redraw');
  });

  test('a look switch with the line on a diagram keeps its top on the line through the redraw', async ({ page, diagrams }) => {
    await openGuide(page, diagrams.address);
    await expectDrawn(flowOf(page));
    const top = await flowOf(page).evaluate(
      (box, share) => box.getBoundingClientRect().top + scrollY - innerHeight * share + 100,
      LINE_AT,
    );
    await scrollPage(page, top);
    const before = await topOffset(page);
    expect(before, 'the line falls inside the box').toBeLessThan(0);
    const drawn = await heightOf(page);

    await applyLook(page, 'im-in', 'dark');
    await expect(flowOf(page)).toHaveAttribute('data-drawn', 'im-in dark tiny');
    expect(Math.abs((await heightOf(page)) - drawn), 'the redraw changes the height of the box').toBeGreaterThan(10);
    await expect.poll(async () => Math.abs((await topOffset(page)) - before), OFTEN).toBeLessThanOrEqual(1);
  });
});

test.describe('a wireframe that changes its height', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /** Opens 'Design decisions' with no scroll anchoring, and waits until 'Restore wizard' fits its frame. */
  async function openDecisions(page: Page, address: string): Promise<void> {
    await page.goto(`${address}design/decisions.html`);
    await hydrated(page);
    await noScrollAnchoring(page);
    await expectFrameFits(page, WIZARD);
  }

  /** Scrolls so the bottom of the frame sits 60 px above the line, and marks the text on the line after it. */
  async function markTextAfterFrame(page: Page): Promise<number> {
    const top = await frameOf(page, WIZARD).evaluate(
      (frame, share) => frame.getBoundingClientRect().bottom + scrollY - innerHeight * share + 60,
      LINE_AT,
    );
    await scrollPage(page, top);
    const before = await markLine(page);
    const bottom = await frameOf(page, WIZARD).evaluate((frame) => frame.getBoundingClientRect().bottom / innerHeight);
    expect(bottom, 'the frame ends inside the window, above the line').toBeGreaterThan(0);
    expect(bottom, 'the frame ends inside the window, above the line').toBeLessThan(LINE_AT);
    return before;
  }

  /** Clicks 'Next' in the wireframe, and waits until the frame has grown to fit step 2. */
  async function growWizard(page: Page): Promise<void> {
    const height = await frameHeight(page, WIZARD);
    await clickInFrame(page, WIZARD, '#go');
    await expect.poll(() => frameHeight(page, WIZARD), OFTEN).toBeGreaterThan(height + 20);
    await expectFrameFits(page, WIZARD);
  }

  test('a wireframe that grows above the line keeps the line', async ({ page, wireframes }) => {
    await openDecisions(page, wireframes.address);
    const before = await markTextAfterFrame(page);
    await growWizard(page);
    await expectMarkAt(page, before, 'the growth of the wireframe');
  });

  test('with the line on a wireframe, its growth keeps its top on the line', async ({ page, wireframes }) => {
    await openDecisions(page, wireframes.address);
    const top = await frameOf(page, WIZARD).evaluate(
      (frame, share) => frame.getBoundingClientRect().top + scrollY - innerHeight * share + 100,
      LINE_AT,
    );
    await scrollPage(page, top);
    const offset = () =>
      wireframeOf(page, WIZARD).evaluate((block, share) => block.getBoundingClientRect().top - innerHeight * share, LINE_AT);
    const before = await offset();
    expect(before, 'the line falls inside the frame').toBeLessThan(-100);

    await growWizard(page);
    await expect.poll(async () => Math.abs((await offset()) - before), OFTEN).toBeLessThanOrEqual(1);
  });

  test('with the line on a wireframe, the growth of a wireframe above it keeps its top on the line', async ({ page, wireframes }) => {
    await openDecisions(page, wireframes.address);
    await expectFrameFits(page, DESKTOP);
    const top = await frameOf(page, DESKTOP).evaluate(
      (frame, share) => frame.getBoundingClientRect().top + scrollY - innerHeight * share + 100,
      LINE_AT,
    );
    await scrollPage(page, top);
    const offset = () =>
      wireframeOf(page, DESKTOP).evaluate((block, share) => block.getBoundingClientRect().top - innerHeight * share, LINE_AT);
    const before = await offset();
    expect(before, 'the line falls inside the frame').toBeLessThan(-100);
    const wizardBottom = await frameOf(page, WIZARD).evaluate((frame, share) => frame.getBoundingClientRect().bottom - innerHeight * share, LINE_AT);
    expect(wizardBottom, "'Restore wizard' ends above the line").toBeLessThan(0);

    await growWizard(page);
    await expect.poll(async () => Math.abs((await offset()) - before), OFTEN).toBeLessThanOrEqual(1);
  });

  test('a ruler drag with a wireframe above the line keeps the line', async ({ page, wireframes }) => {
    await openDecisions(page, wireframes.address);
    await showRuler(page);
    const before = await markTextAfterFrame(page);
    const height = await frameHeight(page, WIZARD);
    const width = await colWidth(page);
    const handle = (await leftHandle(page).boundingBox())!;
    const rulerBox = (await ruler(page).boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = rulerBox.y + rulerBox.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y, { steps: 8 });
    await page.mouse.up();
    await expectWidthSnaps(page, width, 'the drag');
    await expect.poll(async () => Math.abs((await frameHeight(page, WIZARD)) - height), OFTEN).toBeGreaterThan(20);
    await expectFrameFits(page, WIZARD);
    await expectMarkAt(page, before, 'the drag with a wireframe above the line');
  });
});
