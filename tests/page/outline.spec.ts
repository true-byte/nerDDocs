import { expect, type Page } from '@playwright/test';
import { MOVE_MS, openOnStoppedClock, pressOnSlider, scrollPage, THREE_LEVELS } from '../support/levels.ts';
import { expectNoReload, hydrated, openLive, panel, rowOf, test as pageTest } from '../support/page.ts';
import { OUTLINE_SITE, RESTORE_PAGE } from '../support/page-content.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

/** Tests that only read the site share one command on it. */
const test = pageTest.extend<object, { outline: RunningCommand }>({
  outline: [
    async ({}, use) => {
      const run = await runCommand(OUTLINE_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

const RESTORE = 'backups/restore.html';

/** The rows of the outline that are bold. */
const boldRows = (page: Page) => page.locator('#tree a.oln[aria-current="location"]');
/** The outline row of a heading, also while its level hides it. */
const outlineRow = (page: Page, id: string) => page.locator(`#tree a.oln[href="#${id}"]`);
/** The arrow 'Outline' of the row of a page. */
const arrowOf = (page: Page, title: string) =>
  page
    .locator('#tree li.pg')
    .filter({ has: page.locator('a.leaf', { hasText: new RegExp(`^${title}$`) }) })
    .getByRole('button', { name: 'Outline', exact: true });

const topOf = (page: Page, id: string) =>
  page.locator(`#${id}`).evaluate((heading) => Math.round(heading.getBoundingClientRect().top));

/** Scrolls the window so the heading has this top, in px from the top of the window. */
async function putHeadingAt(page: Page, id: string, top: number): Promise<void> {
  const now = await page.locator(`#${id}`).evaluate((heading) => heading.getBoundingClientRect().top + scrollY);
  await scrollPage(page, now - top);
}

/** The bold rows, the top of the first one from the top of the tree, and the scroll of the tree. */
const treePlace = (page: Page) =>
  page.evaluate(() => {
    const tree = document.getElementById('tree')!;
    const bold = [...tree.querySelectorAll('a.oln[aria-current="location"]')];
    return {
      bold: bold.map((row) => row.textContent),
      top: bold[0] ? bold[0].getBoundingClientRect().top - tree.getBoundingClientRect().top : null,
      scrollTop: tree.scrollTop,
    };
  });

test('a scroll bolds the row on the line, and the tree scrolls the least to show it', async ({ page, outline }) => {
  await page.setViewportSize({ width: 1200, height: 500 });
  // The live connection starts after the panel has set its own scroll.
  await openLive(page, `${outline.address}${RESTORE}`);
  const below = await page.evaluate(() => {
    const tree = document.getElementById('tree')!;
    tree.scrollTop = 0;
    const row = tree.querySelector('a.oln[href="#pick-a-day"]')!;
    return row.getBoundingClientRect().top >= tree.getBoundingClientRect().bottom;
  });
  expect(below, 'the outline rows sit below the view of the tree').toBe(true);

  await putHeadingAt(page, 'pick-a-day', 100);
  await expect(boldRows(page)).toHaveText(['Pick a day']);
  const { row, tree } = await page.evaluate(() => ({
    row: document.querySelector('#tree a.oln[href="#pick-a-day"]')!.getBoundingClientRect().bottom,
    tree: document.getElementById('tree')!.getBoundingClientRect().bottom,
  }));
  expect(Math.abs(row - tree)).toBeLessThanOrEqual(1);

  await scrollPage(page, await page.evaluate(() => document.documentElement.scrollHeight - innerHeight));
  await expect(boldRows(page)).toHaveText(['Check the result']);
});

test('a level change shows the new rows in the same task as the text, and the bold row keeps its height', async ({ page, outline }) => {
  await page.setViewportSize({ width: 1200, height: 500 });
  await openOnStoppedClock(page, `${outline.address}${RESTORE}`);
  await putHeadingAt(page, 'pick-a-day', 100);
  await page.clock.runFor(100);
  await expect(boldRows(page)).toHaveText(['Pick a day']);
  await expect(outlineRow(page, 'search-index')).toBeHidden();
  const kept = await treePlace(page);

  await pressOnSlider(page, 'End');
  const now = await page.evaluate(() => {
    const tree = document.getElementById('tree')!;
    const item = tree.querySelector('a.oln[href="#search-index"]')!.closest('li')!;
    const part = document.querySelector('#page .part[data-l="internals"]')!;
    const bold = [...tree.querySelectorAll('a.oln[aria-current="location"]')];
    return {
      item: getComputedStyle(item).display,
      part: getComputedStyle(part).display,
      bold: bold.map((row) => row.textContent),
      top: bold[0] ? bold[0].getBoundingClientRect().top - tree.getBoundingClientRect().top : null,
      scrollTop: tree.scrollTop,
    };
  });
  expect(now.item).not.toBe('none');
  expect(now.part).not.toBe('none');
  expect(now.bold).toEqual(['Pick a day']);
  expect(Math.abs(now.top! - kept.top!)).toBeLessThanOrEqual(1);
  expect(now.scrollTop).toBeGreaterThan(kept.scrollTop);

  await page.clock.runFor(MOVE_MS);
  const after = await treePlace(page);
  expect(after.bold).toEqual(['Pick a day']);
  expect(Math.abs(after.top! - kept.top!)).toBeLessThanOrEqual(1);
});

test('a click on a row puts its heading 32 px from the top at once, and a click on the page row goes to the top with no reload', async ({ page, outline }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await openLive(page, `${outline.address}${RESTORE}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');

  await rowOf(page, 'Pick a day').click();
  await expect(page).toHaveURL(/#pick-a-day$/);
  expect(await topOf(page, 'pick-a-day')).toBe(32);
  await expect(boldRows(page)).toHaveText(['Pick a day']);

  await putHeadingAt(page, 'check-the-result', 100);
  await expect(boldRows(page)).toHaveText(['Check the result']);

  await scrollPage(page, 1500);
  await rowOf(page, 'Restore a file').click();
  await expect.poll(() => page.evaluate(() => scrollY), OFTEN).toBe(0);
  await expect(page).toHaveURL(/\/backups\/restore\.html$/);
  await expectNoReload(page);
});

test('the arrow folds the rows, and the next page open shows them', async ({ page, outline }) => {
  await page.goto(`${outline.address}${RESTORE}`);
  await hydrated(page);
  const arrow = panel(page).getByRole('button', { name: 'Outline', exact: true });
  const rows = page.locator('#tree ul.ol');
  await expect(rows).toBeVisible();

  await arrow.click();
  await expect(arrow).toHaveClass('fold shut');
  await expect(rows).toHaveAttribute('hidden', '');
  await expect(rows).toBeHidden();
  await expect(arrow).toHaveAttribute('aria-expanded', 'false');

  await page.reload();
  await hydrated(page);
  await expect(rows).toBeVisible();
  await expect(arrow).toHaveAttribute('aria-expanded', 'true');
});

test('the arrow of another page opens its rows under its row, and a click on a row opens that page at its heading', async ({ page, site }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await openLive(page, `${site.address}backups/restore.html`);
  await hydrated(page);
  const storage = arrowOf(page, 'Storage');
  const schedules = arrowOf(page, 'Schedules');
  await expect(storage).toHaveAttribute('aria-expanded', 'false');
  await expect(rowOf(page, 'Blocks')).toHaveCount(0);

  await storage.click();
  await expect(storage).toHaveAttribute('aria-expanded', 'true');
  await expect(rowOf(page, 'Blocks')).toBeVisible();
  await expect(rowOf(page, 'Blocks')).toHaveAttribute('href', '../storage.html#blocks');
  await schedules.click();
  await expect(rowOf(page, 'Weekly plan')).toBeVisible();
  await expect(boldRows(page)).toHaveCount(0);
  await storage.click();
  await expect(rowOf(page, 'Blocks')).toHaveCount(0);
  await expect(page).toHaveURL(/\/backups\/restore\.html$/);
  await expect(page.locator('[aria-current="page"]')).toHaveText('Restore a file');
  await expectNoReload(page);

  await storage.click();
  await rowOf(page, 'Blocks').click();
  await expect(page).toHaveURL(/\/storage\.html#blocks$/);
  await expect(page.locator('[aria-current="page"]')).toHaveText('Storage');
  await hydrated(page);
  await expect(arrowOf(page, 'Storage')).toHaveAttribute('aria-expanded', 'true');
  await expect(boldRows(page)).toHaveText(['Blocks']);
  await expect(arrowOf(page, 'Schedules')).toHaveAttribute('aria-expanded', 'false');
  await expect(rowOf(page, 'Weekly plan')).toHaveCount(0);
  await expect(page.locator('#blocks')).toBeInViewport();
});

test('on a phone the menu opens with the page row at the top and the bold row in view, and a tap on a row closes the menu at its heading', async ({ page, outline }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${outline.address}${RESTORE}`);
  await hydrated(page);
  await putHeadingAt(page, 'pick-a-day', 100);
  await expect(boldRows(page)).toHaveText(['Pick a day']);

  await page.getByRole('button', { name: 'Contents', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const tree = document.getElementById('tree')!.getBoundingClientRect();
          const pageRow = document.querySelector('#tree .lr.on')!.getBoundingClientRect();
          const bold = document.querySelector('#tree a.oln[aria-current="location"]')!.getBoundingClientRect();
          return { pageRowAtTop: Math.abs(pageRow.top - tree.top) <= 1, boldInView: bold.bottom <= tree.bottom };
        }),
      OFTEN,
    )
    .toEqual({ pageRowAtTop: true, boldInView: true });

  await rowOf(page, 'Check the result').click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('#menuB')).not.toBeFocused();
  await expect.poll(() => topOf(page, 'check-the-result'), OFTEN).toBe(16);
  await expect(boldRows(page)).toHaveText(['Check the result']);
});

test('a save that adds, renames or removes a heading changes the rows at once, and the bold row stays', async ({ page, ownSite }) => {
  const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'backups/restore.md': RESTORE_PAGE });
  await openLive(page, `${run.address}${RESTORE}`);
  await putHeadingAt(page, 'pick-a-day', 100);
  await expect(boldRows(page)).toHaveText(['Pick a day']);
  const withHeading = (name: string) => `${RESTORE_PAGE}\n\n## ${name}\n\nAn undo puts the old file back.`;

  await run.save('backups/restore.md', withHeading('Undo a restore'));
  await expect(rowOf(page, 'Undo a restore')).toBeVisible();
  await expect(boldRows(page)).toHaveText(['Pick a day']);

  await run.save('backups/restore.md', withHeading('Cancel a restore'));
  await expect(rowOf(page, 'Cancel a restore')).toBeVisible();
  await expect(rowOf(page, 'Undo a restore')).toHaveCount(0);

  await run.save('backups/restore.md', RESTORE_PAGE);
  await expect(rowOf(page, 'Cancel a restore')).toHaveCount(0);
  await expectNoReload(page);
});

test('a save that adds or removes the headings of another page shows or hides its arrow at once', async ({ page, ownSite }) => {
  const plain = '# Schedules\n\nA plan says how often.';
  const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'backups/restore.md': RESTORE_PAGE, 'backups/schedules.md': plain });
  await openLive(page, `${run.address}${RESTORE}`);
  await hydrated(page);
  const arrow = arrowOf(page, 'Schedules');
  await expect(arrow).toHaveCount(0);

  await run.save('backups/schedules.md', `${plain}\n\n## Weekly plan\n\nA weekly plan runs on Sunday.`);
  await expect(arrow).toHaveAttribute('aria-expanded', 'false');
  await arrow.click();
  await expect(rowOf(page, 'Weekly plan')).toBeVisible();

  await run.save('backups/schedules.md', `${plain}\n\n## Daily plan\n\nA daily plan runs at 02:00.`);
  await expect(rowOf(page, 'Daily plan')).toBeVisible();
  await expect(rowOf(page, 'Weekly plan')).toHaveCount(0);

  await run.save('backups/schedules.md', plain);
  await expect(arrow).toHaveCount(0);
  await expect(rowOf(page, 'Daily plan')).toHaveCount(0);
  await expectNoReload(page);
});
