import { expect, type Page } from '@playwright/test';
import {
  expectLevel,
  levelsFile,
  litStop,
  liveRegion,
  openOnStoppedClock,
  pressOnSlider,
  stopPoint,
  stops,
  THREE_LEVELS,
  thumb,
  thumbCenter,
  trackPoint,
} from '../support/levels.ts';
import { hydrated, rowOf, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

const EIGHT_LEVELS = JSON.stringify({
  levels: [
    { id: 'overview', name: 'Overview', icon: 'eye' },
    { id: 'requirements', name: 'Requirements', icon: 'list' },
    { id: 'internals', name: 'Internals', icon: 'cpu' },
    { id: 'testers', name: 'Testers', icon: 'flask' },
    { id: 'managers', name: 'Managers', icon: 'brief' },
    { id: 'developers', name: 'Developers', icon: 'code' },
    { id: 'writers', name: 'Writers', icon: 'book' },
    { id: 'operators', name: 'Operators', icon: 'clock' },
  ],
});

const test = pageTest.extend<object, { docs: RunningCommand; manyLevels: RunningCommand }>({
  docs: [
    async ({}, use) => {
      const run = await runCommand({
        'nerddocs.json': THREE_LEVELS,
        'restore.md':
          '# Restore a file\n\nA restore never changes the copy.\n\n::: overview\nPick a file and a day.\n::: requirements\nThe app restores any file.\n::: internals\nA restore is a job.\n:::\n',
        'schedules.md': '# Schedules\n\n::: overview\nA plan says how often.\n::: internals\nThe scheduler adds a delay.\n:::\n',
        'storage.md': '# Storage\n\nBlocks are stored once.\n',
        'licenses.md': '# Licenses\n\n::: internals\nThe key holds an end date.\n:::\n',
        'shared-text.md': '# Shared text\n\nA restore never changes the copy.\n\n::: internals\nA restore is a job.\n:::\n',
        'only-headings.md': '# Only headings\n\n## Job details\n\n::: internals\nA restore is a job.\n:::\n',
        'only-details.md': '# Only details\n\n<details open>\n<summary>More</summary>\n\n::: internals\nA restore is a job.\n:::\n\n</details>\n',
      });
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
  manyLevels: [
    async ({}, use) => {
      const run = await runCommand({
        'nerddocs.json': EIGHT_LEVELS,
        'restore.md':
          '# Restore a file\n\nA restore never changes the copy.\n\n::: overview requirements internals testers managers\nPick a file and a day.\n::: developers writers operators\nA restore is a job.\n:::\n',
      });
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

const pageText = (page: Page) => page.locator('#page');
const namesOfStops = (page: Page) => page.locator('.stop .nm > span');
const levelRow = (page: Page) => page.locator('.b1');
/** The name in the row. The row also holds the time, in a button of its own. */
const levelRowName = (page: Page) => levelRow(page).locator('> span');
const noLevels = (page: Page) => page.locator('#no-levels');

/** The center of the words of an element, whatever the width of its box. */
const wordsCenter = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const { left, width } = range.getBoundingClientRect();
    return left + width / 2;
  });

const PHONE = { width: 500, height: 800 };

test('stops show their names when they fit, and a click or a key moves to a level and says its name', async ({ page, docs }) => {
  await page.goto(`${docs.address}restore.html`);
  await hydrated(page);
  await expect(namesOfStops(page)).toHaveText(['Overview', 'Requirements', 'Internals']);
  for (const name of await namesOfStops(page).all()) await expect(name).toBeVisible();
  await expect(page.locator('#bar')).not.toHaveClass(/compact/);
  await expect(levelRow(page)).toBeHidden();
  await expect(litStop(page)).toHaveText('Overview');
  await expect(thumb(page)).toHaveAttribute('aria-valuenow', '1');
  await expect(thumb(page)).toHaveAttribute('aria-valuemax', '3');
  await expect(thumb(page)).toHaveAttribute('aria-valuetext', 'Overview');
  await expect(liveRegion(page)).toHaveText('');

  await stops(page).nth(2).click();
  await expectLevel(page, 'internals');
  await expect(pageText(page)).toContainText('A restore is a job.');
  await expect(page.locator('[data-l="overview"]')).toBeHidden();
  await expect(litStop(page)).toHaveText('Internals');
  await expect(thumb(page)).toBeFocused();
  await expect(thumb(page)).toHaveAttribute('aria-valuenow', '3');
  await expect(thumb(page)).toHaveAttribute('aria-valuetext', 'Internals');
  await expect(thumb(page)).toHaveAttribute('style', /left: 83\.3/);
  await expect(liveRegion(page)).toHaveText('Internals');

  const steps: [string, string][] = [
    ['ArrowRight', 'internals'],
    ['ArrowLeft', 'requirements'],
    ['ArrowDown', 'overview'],
    ['ArrowLeft', 'overview'],
    ['ArrowUp', 'requirements'],
    ['End', 'internals'],
    ['Home', 'overview'],
    ['2', 'requirements'],
    ['9', 'requirements'],
    ['Control+1', 'requirements'],
    ['Alt+1', 'requirements'],
    ['a', 'requirements'],
  ];
  for (const [key, level] of steps) {
    await pressOnSlider(page, key);
    await expectLevel(page, level);
  }
  await expect(liveRegion(page)).toHaveText('Requirements');
});

test('a hollow stop cannot be picked by click, key or drag', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}schedules.html`);
  const requirements = stops(page).nth(1);
  await expect(requirements).toHaveClass(/hollow/);
  await expect(requirements).toHaveAttribute('aria-disabled', 'true');

  await requirements.click({ force: true });
  await expectLevel(page, 'overview');

  await pressOnSlider(page, '2');
  await expectLevel(page, 'overview');
  await pressOnSlider(page, 'ArrowRight');
  await expectLevel(page, 'internals');
  await pressOnSlider(page, 'ArrowLeft');
  await expectLevel(page, 'overview');

  // A drag onto the hollow stop lights the nearest stop with text, and the thumb still follows.
  const from = await stopPoint(page, 0, 3);
  const over = await stopPoint(page, 1, 3);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(over.x, over.y);
  await expect(litStop(page)).toHaveText('Internals');
  await expect(requirements).not.toHaveClass(/\bon\b/);
  await expect.poll(() => thumbCenter(page), OFTEN).toBeCloseTo(over.x, 0);
  await page.mouse.up();
  await expectLevel(page, 'internals');
});

test('during a drag the thumb follows the pointer, and the text changes after a rest of 0.15 s', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}restore.html`);
  const from = await stopPoint(page, 0, 3);
  const over = await trackPoint(page, 0.45);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(over.x, over.y);

  await expect(thumb(page)).toHaveClass('drag');
  await expect.poll(() => thumbCenter(page), OFTEN).toBeCloseTo(over.x, 0);
  await expect(litStop(page)).toHaveText('Requirements');
  await expectLevel(page, 'overview');
  await expect(page.getByText('Pick a file and a day.')).toBeVisible();

  await page.clock.runFor(149);
  await expectLevel(page, 'overview');

  // Each move starts the rest again.
  await page.mouse.move(over.x + 4, over.y);
  await page.clock.runFor(149);
  await expectLevel(page, 'overview');

  await page.clock.runFor(1);
  await expectLevel(page, 'requirements');
  await expect(page.getByText('The app restores any file.')).toBeVisible();
  await expect(thumb(page)).toHaveClass('drag');
  await expect.poll(() => thumbCenter(page), OFTEN).toBeCloseTo(over.x + 4, 0);

  await page.mouse.up();
  await expect(thumb(page)).not.toHaveClass('drag');
  await expect(thumb(page)).toHaveAttribute('style', /left: 50%/);
  await expect(thumb(page)).toBeFocused();
  await expectLevel(page, 'requirements');
});

test('on a running clock, a rest during a drag changes the text with the pointer still down', async ({ page, docs }) => {
  await page.goto(`${docs.address}restore.html`);
  await hydrated(page);
  const from = await stopPoint(page, 0, 3);
  const last = await stopPoint(page, 2, 3);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(last.x, last.y);
  await expect(page.getByText('A restore is a job.')).toBeVisible();
  await expect(thumb(page)).toHaveClass('drag');
  await page.mouse.up();
});

test('a release moves the text with no rest, a small slip is a tap, and a cancel leaves the level', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}restore.html`);
  const first = await stopPoint(page, 0, 3);
  const last = await stopPoint(page, 2, 3);

  // A drag past the end of the track keeps the thumb on the center of the last stop.
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(last.x + 900, last.y + 200);
  await expect.poll(() => thumbCenter(page), OFTEN).toBeCloseTo(last.x, 0);
  await expect(litStop(page)).toHaveText('Internals');
  await expectLevel(page, 'overview');
  await page.mouse.up();
  await expectLevel(page, 'internals');

  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(first.x + 2, first.y);
  await page.clock.runFor(1000);
  await expectLevel(page, 'internals');
  await expect(thumb(page)).not.toHaveClass('drag');
  await page.mouse.up();
  await expectLevel(page, 'overview');
  await expect(thumb(page)).toBeFocused();

  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(last.x, last.y);
  await expect(thumb(page)).toHaveClass('drag');
  await page.evaluate(() => dispatchEvent(new PointerEvent('pointercancel')));
  await expect(thumb(page)).not.toHaveClass('drag');
  await expect(litStop(page)).toHaveText('Overview');
  await page.clock.runFor(1000);
  await page.mouse.up();
  await expectLevel(page, 'overview');
});

test('names that do not fit leave icons and one row that names the current or hovered level', async ({ page, manyLevels }) => {
  await page.goto(`${manyLevels.address}restore.html`);
  await hydrated(page);
  await expect(page.locator('#bar')).toHaveClass(/compact/);
  await expect(stops(page)).toHaveCount(8);
  await expect(namesOfStops(page).first()).toBeHidden();
  await expect(stops(page).first().locator('svg')).toBeVisible();
  await expect(levelRowName(page)).toHaveText('Overview');
  await expect(levelRow(page)).not.toHaveClass(/peek/);

  await stops(page).nth(6).hover();
  await expect(levelRowName(page)).toHaveText('Writers');
  await expect(levelRow(page)).toHaveClass(/peek/);
  await expect(litStop(page)).toHaveText('Overview');

  await page.mouse.move(0, 0);
  await expect(levelRowName(page)).toHaveText('Overview');
  await expect(levelRow(page)).not.toHaveClass(/peek/);

  await stops(page).nth(5).click();
  await page.mouse.move(0, 0);
  await expectLevel(page, 'developers');
  await expect(levelRowName(page)).toHaveText('Developers');
  await expect(page.getByText('A restore is a job.')).toBeVisible();

  // A part at more than three levels shows three icons, then a '+'.
  await stops(page).nth(0).click();
  const marks = page.locator('.part:visible .marks');
  await expect(marks.locator('svg')).toHaveCount(3);
  await expect(marks.locator('.more')).toHaveText('+');
  await expect(marks.locator('.more')).toBeVisible();
});

test('five short names show, though the first paint guessed icons for five levels', async ({ page, ownSite }) => {
  const short = await ownSite({
    'nerddocs.json': levelsFile('a', 'b', 'c', 'd', 'e'),
    'restore.md': '::: a\nOne.\n::: b\nTwo.\n::: c\nThree.\n::: d\nFour.\n::: e\nFive.\n:::\n',
  });
  await page.goto(`${short.address}restore.html`);
  await hydrated(page);
  await expect(page.locator('#bar')).not.toHaveClass(/compact/);
  await expect(namesOfStops(page).first()).toBeVisible();
});

test('the choice of names or icons follows the room that the contents panel leaves', async ({ page, ownSite }) => {
  const run = await ownSite({
    'nerddocs.json': levelsFile('overview', 'requirements', 'internals', 'managers'),
    'restore.md': '::: overview\nOne.\n::: requirements\nTwo.\n::: internals\nThree.\n::: managers\nFour.\n:::\n',
  });
  await page.setViewportSize({ width: 960, height: 700 });
  await page.goto(`${run.address}restore.html`);
  await hydrated(page);
  await expect(page.locator('#bar')).not.toHaveClass(/compact/);

  // A wider panel makes the gap between the two widths of the bar far larger than any font's names.
  await page.addStyleTag({ content: ':root:not([data-panel="off"]){--pw:600px}' });
  await page.setViewportSize({ width: 961, height: 700 });
  await expect(page.locator('#bar')).toHaveClass(/compact/);

  await page.getByRole('button', { name: 'Hide contents' }).click();
  await expect(page.locator('#bar')).not.toHaveClass(/compact/);
  await expect(levelRow(page)).toBeHidden();

  await page.getByRole('button', { name: 'Show contents' }).click();
  await expect(page.locator('#bar')).toHaveClass(/compact/);
  await expect(levelRow(page)).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the stops always show icons and one row names the level', async ({ page, docs }) => {
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await expect(namesOfStops(page).first()).toBeHidden();
    await expect(stops(page).first().locator('svg')).toBeVisible();
    await expect(levelRow(page)).toBeVisible();
    await expect(levelRowName(page)).toHaveText('Overview');
    await pressOnSlider(page, 'End');
    await expect(levelRowName(page)).toHaveText('Internals');
  });

  for (const width of [PHONE.width, 320]) {
    test(`a page with no parts keeps the bar at full width at ${width} wide, with its label centered on the bar and clear of the menu button`, async ({ page, docs }) => {
      await page.setViewportSize({ width, height: PHONE.height });
      await page.goto(`${docs.address}storage.html`);
      await hydrated(page);
      await expect(noLevels(page)).toHaveText('No levels on this page');
      await expect(noLevels(page)).toBeVisible();
      await expect(stops(page)).toHaveCount(0);
      await expect(page.locator('#menuB')).toBeVisible();
      await expect.poll(async () => {
        const box = (await page.locator('#bar').boundingBox())!;
        return [box.x, box.width];
      }).toEqual([0, width]);
      const center = await wordsCenter(page, '#no-levels');
      expect(Math.abs(center - width / 2)).toBeLessThan(2);
      const wordsLeft = await page.locator('#no-levels').evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect().left;
      });
      const menu = (await page.locator('#menuB').boundingBox())!;
      expect(wordsLeft).toBeGreaterThanOrEqual(menu.x + menu.width);
    });
  }

  test('a stored hidden panel hides the label of a page with no parts, and the menu button stays', async ({ page, docs }) => {
    await page.addInitScript(() => localStorage.setItem('nerddocs-slider', 'off'));
    await page.goto(`${docs.address}storage.html`);
    await hydrated(page);
    await expect(noLevels(page)).toBeHidden();
    await expect(page.locator('#menuB')).toBeVisible();

    await page.getByRole('button', { name: 'Show panel' }).click();
    await expect(noLevels(page)).toBeVisible();
  });

  test('the bar has the same height and spacing at three levels as at eight', async ({ page, docs, manyLevels }) => {
    const sizes = () =>
      page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const stop = getComputedStyle(document.querySelector('.stop')!);
        return {
          bar: box('#bar').height,
          stop: box('.stop').height,
          row: box('.b1').height,
          padding: stop.padding,
          fromTrackToStops: box('.stops').top - box('.track').bottom,
        };
      });
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    const three = await sizes();
    await page.goto(`${manyLevels.address}restore.html`);
    await hydrated(page);
    expect(await sizes()).toEqual(three);
  });
});

test('#bar floats over the text on a wide window and is the bottom bar on a phone', async ({ page, docs }) => {
  await page.goto(`${docs.address}restore.html`);
  await hydrated(page);
  const bar = page.locator('#bar');
  const box = async () => (await bar.boundingBox())!;
  const tab = page.locator('#tab');
  const viewport = page.viewportSize()!;
  await page.evaluate(() => ((document.getElementById('bar') as HTMLElement).dataset.sameElement = 'yes'));

  await expect(bar).toHaveCSS('position', 'fixed');
  await expect(page.locator('#menuB')).toBeHidden();
  await expect.poll(async () => viewport.height - ((await box()).y + (await box()).height)).toBeCloseTo(14, 0);
  const mainBox = (await page.locator('main').boundingBox())!;
  const middle = (await box()).x + (await box()).width / 2;
  expect(Math.abs(middle - (mainBox.x + mainBox.width / 2))).toBeLessThan(10);

  // The tab slides the panel off the window. Marks go with it, and the stops take no focus.
  await expect(page.locator('.part:visible .marks')).toBeVisible();
  await page.getByRole('button', { name: 'Hide panel' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-slider', 'off');
  await expect.poll(async () => (await box()).y).toBeGreaterThanOrEqual(viewport.height);
  await expect(tab).toBeInViewport();
  await expect(page.locator('#stopsWrap')).toHaveAttribute('inert');
  await expect(page.locator('.part:visible .marks')).toBeHidden();

  await page.setViewportSize(PHONE);
  await expect(bar).toHaveAttribute('data-same-element', 'yes');
  await expect(page.locator('#stopsWrap .track')).toBeHidden();
  await expect(page.locator('#menuB')).toBeVisible();
  await page.getByRole('button', { name: 'Show panel' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-slider');
  await expect(page.locator('.track')).toBeVisible();
  await expect(page.locator('#stopsWrap')).not.toHaveAttribute('inert');
  await expect.poll(async () => {
    const { x, y, width, height } = await box();
    return [x, width, Math.round(y + height)];
  }).toEqual([0, PHONE.width, PHONE.height]);
});

test('on a page with no text at its default level, the page opens at the first level with text', async ({ page, docs }) => {
  await page.goto(`${docs.address}licenses.html`);
  await hydrated(page);
  await expectLevel(page, 'internals');
  await expect(litStop(page)).toHaveText('Internals');
  await expect(page.getByText('The key holds an end date.')).toBeVisible();
});

test('a page with no parts shows a narrower panel, with its label centered in place of the stops', async ({ page, docs }) => {
  await page.goto(`${docs.address}restore.html`);
  await hydrated(page);
  await expect(noLevels(page)).toHaveCount(0);
  const withStops = (await page.locator('#bar').boundingBox())!;

  await page.goto(`${docs.address}storage.html`);
  await hydrated(page);
  await expect(noLevels(page)).toHaveText('No levels on this page');
  await expect(noLevels(page)).toBeVisible();
  await expect(page.locator('.stop, .track, #thumb')).toHaveCount(0);
  await expect(page.getByText('Blocks are stored once.')).toBeVisible();

  const bar = (await page.locator('#bar').boundingBox())!;
  expect(bar.width).toBeLessThan(withStops.width);
  expect(Math.abs((await wordsCenter(page, '#no-levels')) - (bar.x + bar.width / 2))).toBeLessThan(2);
  const mainBox = (await page.locator('main').boundingBox())!;
  expect(Math.abs(bar.x + bar.width / 2 - (mainBox.x + mainBox.width / 2))).toBeLessThan(10);
});

test('a level with no part on a page with shared text is a stop with text', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}shared-text.html`);
  await expectLevel(page, 'overview');
  await expect(stops(page).nth(1)).not.toHaveClass(/hollow/);
  await expect(page.getByText('A restore is a job.')).toBeHidden();
  await pressOnSlider(page, '2');
  await expectLevel(page, 'requirements');
  await expect(page.getByText('A restore never changes the copy.')).toBeVisible();
});

test('a level with no part is hollow when the page holds only headings or a details of parts', async ({ page, docs }) => {
  for (const file of ['only-headings', 'only-details']) {
    await page.goto(`${docs.address}${file}.html`);
    await hydrated(page);
    await expectLevel(page, 'internals');
    await expect(stops(page).nth(0), file).toHaveClass(/hollow/);
    await expect(stops(page).nth(1), file).toHaveClass(/hollow/);
    await expect(stops(page).nth(2), file).not.toHaveClass(/hollow/);
  }
});

test('a site with one level shows no slider and no label, also with the slider stored as hidden', async ({ page, ownSite }) => {
  const run = await ownSite({
    'nerddocs.json': levelsFile('overview'),
    'restore.md': '# Restore a file\n\n::: overview\nPick a file and a day.\n:::\n',
    'storage.md': '# Storage\n\nBlocks are stored once.\n',
  });
  await page.addInitScript(() => localStorage.setItem('nerddocs-slider', 'off'));
  for (const file of ['restore', 'storage']) {
    await page.goto(`${run.address}${file}.html`);
    await hydrated(page);
    await expect(page.locator('#bar')).toBeHidden();
    await expect(page.locator('#thumb, #tab, #no-levels, .marks')).toHaveCount(0);
  }
  await page.goto(`${run.address}restore.html`);
  await expect(page.getByText('Pick a file and a day.')).toBeVisible();
});

test('a site with `"levels": false` draws no panel, also with the slider stored as hidden, and each fence line shows as text', async ({ page, ownSite }) => {
  const run = await ownSite({
    'nerddocs.json': '{"levels":false}',
    'restore.md': '# Restore a file\n\n::: overview\nPick a file and a day.\n:::\n',
  });
  await page.addInitScript(() => localStorage.setItem('nerddocs-slider', 'off'));
  await page.goto(`${run.address}restore.html`);
  await hydrated(page);
  await expect(page.locator('#bar')).toBeHidden();
  await expect(page.locator('#thumb, #tab, #no-levels, .marks')).toHaveCount(0);
  await expect(page.locator('#page')).toContainText('::: overview');
  await expect(page.getByText('Pick a file and a day.')).toBeVisible();

  await page.setViewportSize(PHONE);
  await expect(page.locator('#menuB')).toBeVisible();
  await expect(page.locator('#bar')).not.toHaveClass(/levels/);
});

test("'Go to text' moves focus to the block on the line, and the block takes no lasting mark", async ({ page, docs }) => {
  await page.goto(`${docs.address}restore.html`);
  await hydrated(page);
  await pressOnSlider(page, 'End');
  const link = page.getByRole('link', { name: 'Go to text' });
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  await expect(link).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#page > :focus')).toHaveCount(1);
  await expect(page.locator('#page > :focus')).toHaveAttribute('tabindex', '-1');
  await thumb(page).focus();
  await expect(page.locator('#page [tabindex]')).toHaveCount(0);
});

test('a reload and a move to another page open at the opening level of the page', async ({ page, docs }) => {
  await page.goto(`${docs.address}restore.html`);
  await hydrated(page);
  await pressOnSlider(page, 'End');
  await expectLevel(page, 'internals');

  await page.reload();
  await hydrated(page);
  await expectLevel(page, 'overview');
  await expect(litStop(page)).toHaveText('Overview');
  await expect(page.getByText('Pick a file and a day.')).toBeVisible();

  await pressOnSlider(page, 'End');
  await rowOf(page, 'Schedules').click();
  await expect(page.locator('main h1')).toHaveText('Schedules');
  await hydrated(page);
  await expectLevel(page, 'overview');
  await expect(page.getByText('A plan says how often.')).toBeVisible();
});
