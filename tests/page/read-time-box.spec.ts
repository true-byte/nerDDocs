import { expect, type Locator, type Page } from '@playwright/test';
import { expectLevel, levelsFile, litStop, pressOnSlider, stops, THREE_LEVELS } from '../support/levels.ts';
import { expectNoReload, hydrated, openLive, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

/** One word takes one minute, so each time below is a count of words. */
const speedOf = (wordsPerMinute: number) => JSON.stringify({ ...JSON.parse(THREE_LEVELS), wordsPerMinute });

const FILES = {
  'nerddocs.json': speedOf(1),
  // Overview 3, Requirements 5, Internals 6.
  'restore.md':
    '# Restore\n\n::: overview\nPick one.\n::: requirements\nA disk holds copies.\n::: internals\nA restore is one job.\n:::\n',
  // No parts: 3 at each level.
  'schedules.md': '# Schedules\n\nPlans run.\n',
  // Overview 3, and the other levels are hollow.
  'agents.md': '# Agents\n\n::: overview\nAgents run.\n:::\n',
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

const EIGHT_LEVELS = ['overview', 'requirements', 'internals', 'testers', 'managers', 'developers', 'writers', 'operators'];

const stopTimes = (page: Page) => page.locator('.stop .min');
const levelName = (page: Page) => page.locator('.b1 > span');
const timeB = (page: Page) => page.locator('#timeB');
const timeRow = (page: Page) => page.locator('#timeRow');
const titleButton = (page: Page) => page.locator('.title-line #tl-slot #tlB');
/** The one time that the level rule leaves showing in the button next to the title. */
const titleTime = (page: Page) => titleButton(page).locator('> span:not(.sr-only):visible');
const box = (page: Page) => page.locator('#time-box');

async function openBox(page: Page, opener: Locator): Promise<void> {
  await opener.click();
  await expect(box(page)).toBeVisible();
}

/** The text of each cell that shows, by row. */
const rowsIn = (page: Page) =>
  box(page)
    .locator('tbody tr')
    .evaluateAll((rows) =>
      (rows as HTMLTableRowElement[]).map((row) =>
        [...row.cells].filter((cell) => cell.checkVisibility()).map((cell) => cell.innerText.trim()),
      ),
    );

/** The level names of the rows in bold. The current row is the only one in bold. */
const boldRows = (page: Page) =>
  box(page)
    .locator('tbody tr')
    .evaluateAll((rows) =>
      (rows as HTMLTableRowElement[])
        .filter((row) => Number(getComputedStyle(row.cells[1]!).fontWeight) >= 700)
        .map((row) => row.cells[0]!.innerText.trim()),
    );

/** The color that a level has on this page, as the browser computes it. */
const colorOfLevel = (page: Page, index: number) =>
  page.evaluate((at) => {
    const probe = document.createElement('i');
    probe.style.color = `var(--l${at})`;
    document.body.append(probe);
    const { color } = getComputedStyle(probe);
    probe.remove();
    return color;
  }, index);

const expectRows = (page: Page, rows: string[][]) => expect.poll(() => rowsIn(page), OFTEN).toEqual(rows);

const RESTORE_ROWS = [
  ['Overview', '3m', '9m'],
  ['Requirements', '5m', '8m'],
  ['Internals', '6m', '9m'],
];

async function openPage(page: Page, address: string): Promise<void> {
  await page.goto(address);
  await hydrated(page);
}

test('the stops show their times under their names, and a move of the slider keeps them', async ({ page, docs }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await openPage(page, `${docs.address}restore.html`);
  await expect(page.locator('#bar')).not.toHaveClass(/compact/);
  await expect(page.locator('.stop .nm > span')).toHaveText(['Overview', 'Requirements', 'Internals']);
  await expect(stopTimes(page)).toHaveText(['3m', '5m', '6m']);
  await expect(stopTimes(page).first()).toBeVisible();
  const name = (await stops(page).first().locator('.nm').boundingBox())!;
  const time = (await stopTimes(page).first().boundingBox())!;
  expect(time.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
  await expect(timeB(page)).toBeVisible();
  await expect(titleButton(page)).toBeHidden();
  await expect(timeRow(page)).toBeHidden();

  await pressOnSlider(page, 'ArrowRight');
  await expectLevel(page, 'requirements');
  await expect(litStop(page)).toHaveText('Requirements');
  await expect(stopTimes(page)).toHaveText(['3m', '5m', '6m']);
});

test('stops with icons only show their times under the icons, and the row holds the icon and the name', async ({ page, ownSite }) => {
  const run = await ownSite({
    'nerddocs.json': levelsFile(...EIGHT_LEVELS),
    'restore.md': `# Restore\n\n::: ${EIGHT_LEVELS.join(' ')}\nPick one.\n:::\n`,
  });
  await openPage(page, `${run.address}restore.html`);
  await expect(page.locator('#bar')).toHaveClass(/compact/);
  await expect(stopTimes(page)).toHaveText(EIGHT_LEVELS.map(() => '1m'));
  await expect(stopTimes(page).first()).toBeVisible();
  const icon = (await stops(page).first().locator('svg').boundingBox())!;
  const time = (await stopTimes(page).first().boundingBox())!;
  expect(time.y).toBeGreaterThanOrEqual(icon.y + icon.height - 1);
  await expect(levelName(page)).toHaveText('Overview');
  await expect(levelName(page)).toBeVisible();
  await expect(timeRow(page)).toBeHidden();
});

test('the clock in the panel opens the box with the rows, and the current row follows the level', async ({ page, docs }) => {
  await openPage(page, `${docs.address}restore.html`);
  await expect(box(page)).toHaveCount(0);

  await openBox(page, timeB(page));
  expect(await box(page).evaluate((el) => ({ tag: el.tagName, isModal: el.matches(':modal') }))).toEqual({ tag: 'DIALOG', isModal: true });
  await expect(box(page)).toHaveAttribute('aria-label', 'Read time');
  await expect(box(page).locator('thead th')).toHaveText(['', 'This page', 'All pages']);
  await expect(box(page).locator('thead th').first()).toHaveAttribute('aria-label', 'Level');
  await expectRows(page, RESTORE_ROWS);
  expect(await boldRows(page)).toEqual(['Overview']);

  // The page behind the box does not dim.
  expect(await box(page).evaluate((el) => getComputedStyle(el, '::backdrop').backgroundColor)).toBe('rgba(0, 0, 0, 0)');

  // A trigger low in the window puts the box above the panel, with its right edge at the right of the trigger.
  const placed = (await box(page).boundingBox())!;
  const bar = (await page.locator('#bar').boundingBox())!;
  const clock = (await timeB(page).boundingBox())!;
  expect(Math.abs(placed.y + placed.height - (bar.y - 28))).toBeLessThanOrEqual(1);
  expect(Math.abs(placed.x + placed.width - (clock.x + clock.width))).toBeLessThanOrEqual(1);

  await page.keyboard.press('Escape');
  await expect(box(page)).toBeHidden();
  await expect(timeB(page)).toBeFocused();

  await pressOnSlider(page, 'ArrowRight');
  await expectLevel(page, 'requirements');
  const color = await colorOfLevel(page, 1);
  await openBox(page, timeB(page));
  await expectRows(page, RESTORE_ROWS);
  expect(await boldRows(page)).toEqual(['Requirements']);
  await expect(box(page).locator('tbody tr').nth(1).locator('td').nth(1)).toHaveCSS('color', color);

  // A click on the box leaves it open, and a click on the backdrop closes it.
  await box(page).locator('thead th').nth(1).click();
  await expect(box(page)).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(box(page)).toBeHidden();
  await expect(timeB(page)).toBeFocused();

  // A resize closes it.
  await openBox(page, timeB(page));
  await page.setViewportSize({ width: page.viewportSize()!.width - 10, height: 720 });
  await expect(box(page)).toBeHidden();
});

test('with the panel hidden, the time of the current level shows next to the title and opens the box', async ({ page, docs }) => {
  await openPage(page, `${docs.address}restore.html`);
  await pressOnSlider(page, 'ArrowRight');
  await expectLevel(page, 'requirements');
  const lastStopX = async () => (await stops(page).last().boundingBox())!.x;
  const shownX = await lastStopX();
  await page.getByRole('button', { name: 'Hide panel' }).click();
  expect(Math.abs((await lastStopX()) - shownX)).toBeLessThanOrEqual(1);

  await expect(titleButton(page)).toBeVisible();
  await expect(titleTime(page)).toHaveText('5m');
  await expect(timeB(page)).toBeHidden();

  await openBox(page, titleButton(page));
  await expectRows(page, RESTORE_ROWS);
  expect(await boldRows(page)).toEqual(['Requirements']);

  // A trigger high in the window puts the box under the trigger, with its left edge at the left of the trigger.
  const placed = (await box(page).boundingBox())!;
  const button = (await titleButton(page).boundingBox())!;
  expect(Math.abs(placed.y - (button.y + button.height + 8))).toBeLessThanOrEqual(1);
  expect(Math.abs(placed.x - button.x)).toBeLessThanOrEqual(1);

  await page.keyboard.press('Escape');
  await expect(box(page)).toBeHidden();
  await expect(titleButton(page)).toBeFocused();

  // The stored choice holds at the first paint of the next load.
  await page.reload();
  await expect(titleTime(page)).toHaveText('5m');
  await hydrated(page);

  await page.getByRole('button', { name: 'Show panel' }).click();
  expect(Math.abs((await lastStopX()) - shownX)).toBeLessThanOrEqual(1);
  await expect(titleButton(page)).toBeHidden();
  await expect(timeB(page)).toBeVisible();
});

test('a name that does not fit its stop gives icons only, also when the panel comes back after a reload', async ({ page, ownSite }) => {
  const levels = JSON.parse(THREE_LEVELS).levels;
  levels[0].name = 'Administration guide A';
  const run = await ownSite({
    'nerddocs.json': JSON.stringify({ levels }),
    'restore.md': FILES['restore.md'],
  });
  await page.setViewportSize({ width: 1400, height: 800 });
  await openPage(page, `${run.address}restore.html`);
  await expect(page.locator('#bar')).toHaveClass(/compact/);

  await page.getByRole('button', { name: 'Hide panel' }).click();
  await page.reload();
  await hydrated(page);
  await page.getByRole('button', { name: 'Show panel' }).click();
  await expect(timeB(page)).toBeVisible();
  await expect(page.locator('#bar')).toHaveClass(/compact/);
});

test('in a short window the box stays in the window, and its head shows', async ({ page, ownSite }) => {
  const run = await ownSite({
    'nerddocs.json': levelsFile(...EIGHT_LEVELS),
    'restore.md': `# Restore\n\n::: ${EIGHT_LEVELS.join(' ')}\nPick one.\n:::\n`,
  });
  await page.setViewportSize({ width: 1400, height: 420 });
  await openPage(page, `${run.address}restore.html`);
  await openBox(page, timeB(page));

  const placed = (await box(page).boundingBox())!;
  const bar = (await page.locator('#bar').boundingBox())!;
  expect(placed.y).toBeGreaterThanOrEqual(8 - 1);
  expect(Math.abs(placed.y + placed.height - (bar.y - 28))).toBeLessThanOrEqual(1);
  expect((await box(page).locator('thead').boundingBox())!.y).toBeGreaterThanOrEqual(placed.y);
  await box(page).locator('tbody tr').last().scrollIntoViewIfNeeded();
  const lastRow = (await box(page).locator('tbody tr').last().boundingBox())!;
  expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(placed.y + placed.height + 1);
});

test('a page with no parts shows the time next to the title with no action, and marks no row as current', async ({ page, docs }) => {
  await openPage(page, `${docs.address}schedules.html`);
  await expect(page.locator('#no-levels')).toBeVisible();
  await expect(timeB(page)).toHaveCount(0);
  await expect(titleButton(page)).toBeVisible();
  await expect(titleTime(page)).toHaveText('3m');

  await openBox(page, titleButton(page));
  await expectRows(page, [
    ['Overview', '3m', '9m'],
    ['Requirements', '3m', '8m'],
    ['Internals', '3m', '9m'],
  ]);
  expect(await boldRows(page)).toEqual([]);
});

test('a site with `"levels": false` shows the time next to the title with no action, and its box has no level column', async ({ page, ownSite }) => {
  const run = await ownSite({
    'nerddocs.json': '{"levels":false,"wordsPerMinute":1}',
    'restore.md': '# Restore\n\nPick one.\n',
    'schedules.md': '# Schedules\n\nPlans run now.\n',
  });
  await openPage(page, `${run.address}restore.html`);
  await expect(titleButton(page)).toBeVisible();
  await expect(titleTime(page)).toHaveText('3m');

  await openBox(page, titleButton(page));
  await expect(box(page)).toHaveClass(/\bone\b/);
  await expect(box(page).getByRole('columnheader')).toHaveText(['This page', 'All pages']);
  await expectRows(page, [['3m', '7m']]);

  await page.keyboard.press('Escape');
  await expect(box(page)).toBeHidden();
  await expect(titleButton(page)).toBeFocused();
});

test('a hollow stop has an empty time at the same height, and its row shows a dash', async ({ page, docs }) => {
  await openPage(page, `${docs.address}agents.html`);
  await expect(stops(page).nth(1)).toHaveClass(/hollow/);
  await expect(stopTimes(page)).toHaveText(['3m', '', '']);
  const heights = await stopTimes(page).evaluateAll((all) => all.map((time) => time.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);
  const tops = await page.locator('.stop .nm').evaluateAll((all) => all.map((name) => name.getBoundingClientRect().top));
  expect(new Set(tops).size).toBe(1);

  // The row names the level under the mouse, and a level with no time has no time button.
  await expect(timeRow(page)).toHaveCount(1);
  await stops(page).nth(1).hover();
  await expect(levelName(page)).toHaveText('Requirements');
  await expect(timeRow(page)).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expect(timeRow(page)).toHaveCount(1);

  await openBox(page, timeB(page));
  await expectRows(page, [
    ['Overview', '3m', '9m'],
    ['Requirements', '–', '8m'],
    ['Internals', '–', '9m'],
  ]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 500, height: 800 } });

  test('the row holds the time, which opens the box, and the clock of the panel and the times of the stops are hidden', async ({ page, docs }) => {
    await openPage(page, `${docs.address}restore.html`);
    await expect(timeB(page)).toBeHidden();
    await expect(stopTimes(page).first()).toBeHidden();
    await expect(levelName(page)).toHaveText('Overview');
    await expect(timeRow(page)).toBeVisible();
    await expect(timeRow(page)).toHaveText('3m');
    await expect(timeRow(page).locator('svg')).toBeVisible();

    await pressOnSlider(page, 'End');
    await expect(levelName(page)).toHaveText('Internals');
    await expect(timeRow(page)).toHaveText('6m');

    await openBox(page, timeRow(page));
    await expectRows(page, RESTORE_ROWS);
    expect(await boldRows(page)).toEqual(['Internals']);
    const placed = (await box(page).boundingBox())!;
    const bar = (await page.locator('#bar').boundingBox())!;
    expect(placed.x).toBeGreaterThanOrEqual(8);
    expect(placed.x + placed.width).toBeLessThanOrEqual(492);
    expect(placed.y + placed.height).toBeLessThanOrEqual(bar.y);

    await page.keyboard.press('Escape');
    await expect(box(page)).toBeHidden();
    await expect(timeRow(page)).toBeFocused();

    await page.getByRole('button', { name: 'Hide panel' }).click();
    await expect(timeRow(page)).toBeHidden();
    await expect(titleButton(page)).toBeVisible();
    await expect(titleTime(page)).toHaveText('6m');
  });
});

test('a save updates the times with no reload, on the page and in an open box on another page', async ({ page, context, ownSite }) => {
  const run = await ownSite(FILES);
  await openLive(page, `${run.address}restore.html`);
  await hydrated(page);
  await expect(stopTimes(page)).toHaveText(['3m', '5m', '6m']);

  const other = await context.newPage();
  await openLive(other, `${run.address}schedules.html`);
  await hydrated(other);
  await openBox(other, titleButton(other));
  await expectRows(other, [
    ['Overview', '3m', '9m'],
    ['Requirements', '3m', '8m'],
    ['Internals', '3m', '9m'],
  ]);

  await run.save('restore.md', FILES['restore.md'].replace('Pick one.', 'Pick one file.'));
  await expect(stopTimes(page)).toHaveText(['4m', '5m', '6m']);
  await expectRows(other, [
    ['Overview', '3m', '10m'],
    ['Requirements', '3m', '8m'],
    ['Internals', '3m', '9m'],
  ]);
  await expectNoReload(page);
  await expectNoReload(other);

  await other.close();

  // A new speed needs no new render: 4, 5 and 6 words at 2 words a minute.
  await run.save('nerddocs.json', speedOf(2));
  await expect(stopTimes(page)).toHaveText(['2m', '3m', '3m']);
  await run.save('nerddocs.json', speedOf(1));
  await expect(stopTimes(page)).toHaveText(['4m', '5m', '6m']);

  // A page that moves closes the box.
  await openBox(page, timeB(page));
  await run.move('restore.md', 'get-it-back.md');
  await expect(page).toHaveURL(/get-it-back\.html$/);
  await expect(box(page)).toBeHidden();
  await expect(timeB(page)).toBeFocused();

  // A page that loses its parts shows the time next to the title.
  await run.save('get-it-back.md', '# Restore\n\nPick one file now.\n');
  await expect(page.locator('#no-levels')).toBeVisible();
  await expect(titleButton(page)).toBeVisible();
  await expect(titleTime(page)).toHaveText('5m');
  await expectNoReload(page);
  // The save drew this button, and it still opens the box.
  await openBox(page, titleButton(page));
});

test.describe('with no script', () => {
  test.use({ javaScriptEnabled: false });

  test('the time shows next to the title, on the first level', async ({ page, docs }) => {
    await page.goto(`${docs.address}restore.html`);
    await expect(titleButton(page)).toBeVisible();
    await expect(titleTime(page)).toHaveText('3m');
  });
});
