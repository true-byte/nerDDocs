import { expect, type Page } from '@playwright/test';
import { MODE_KEY, THEME_KEY } from '../../src/page/theme-memory.ts';
import { THEMES } from '../../src/themes/index.ts';
import { openOnStoppedClock, pressOnSlider, scrollPage, THREE_LEVELS } from '../support/levels.ts';
import { expectNoReload, holdPageScript, hydrated, openLive, panel, rowOf, test as pageTest } from '../support/page.ts';
import { RESTORE_PAGE, STEPS } from '../support/page-content.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';
import { expectPlaceHolds, noScrollAnchoring, scrollToMiddle, storeWidth } from '../support/text-width.ts';

/** A long page with no headings. */
const PLAIN_PAGE = `# Plain steps\n\n${STEPS}\n\n${STEPS}\n`;

/** A page whose one heading shows only at 'Internals'. */
const SCRIPT_PAGE = `# Restore by script

::: overview
A script restores a file with no window.
::: requirements
The script restores any file that the app keeps.
::: internals
## Script flags

The flag \`--day\` picks the day.
:::
`;

/** A page with 30 headings, more rows than a short window shows. */
const STEPS_PAGE = `# Restore steps\n\nEach step of a restore.\n\n${Array.from({ length: 30 }, (_, n) => `## Step ${n + 1}\n\n${STEPS}`).join('\n\n')}\n`;

const SITE = {
  'nerddocs.json': THREE_LEVELS,
  'backups/restore.md': RESTORE_PAGE,
  'backups/plain.md': PLAIN_PAGE,
  'backups/script.md': SCRIPT_PAGE,
  'backups/steps.md': STEPS_PAGE,
};

/** Tests that only read the site share one command on it. */
const test = pageTest.extend<object, { docs: RunningCommand }>({
  docs: [
    async ({}, use) => {
      const run = await runCommand(SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

const RESTORE = 'backups/restore.html';
const PLAIN = 'backups/plain.html';
const SCRIPT = 'backups/script.html';
const STEPS_ADDRESS = 'backups/steps.html';
const OUTLINE_KEY = 'nerddocs-outline';

/** The outline: a column on a wide window, and a layer on a narrow one. */
const outline = (page: Page) => page.locator('aside[aria-label="Outline"]');
/** The row of a heading in the outline, also while it hides. */
const row = (page: Page, name: string) => outline(page).getByRole('link', { name, exact: true, includeHidden: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** The text of each row of the outline in bold that shows. */
const boldRows = (page: Page) =>
  outline(page)
    .locator('a')
    .evaluateAll((links) =>
      links.filter((link) => link.checkVisibility() && Number(getComputedStyle(link).fontWeight) >= 700).map((link) => link.textContent?.trim()),
    );

const topOf = (page: Page, id: string) =>
  page.locator(`#${id}`).evaluate((heading) => Math.round(heading.getBoundingClientRect().top));

/** Scrolls the window so the heading has this top, in px from the top of the window. */
async function putHeadingAt(page: Page, id: string, top: number): Promise<void> {
  const now = await page.locator(`#${id}`).evaluate((heading) => heading.getBoundingClientRect().top + scrollY);
  await scrollPage(page, now - top);
}

/**
 * The middle of the text column and of the bar, and the middle of the space between 'Contents' and the outline
 * column, or between 'Contents' and the right side of the window while no column shows.
 */
const middles = (page: Page) =>
  page.evaluate(() => {
    const middle = (rect: DOMRect) => (rect.left + rect.right) / 2;
    const column = document.querySelector('aside[aria-label="Outline"]');
    const right = column?.checkVisibility() ? column.getBoundingClientRect().left : document.documentElement.clientWidth;
    const left = document.getElementById('panel')!.getBoundingClientRect().right;
    return {
      text: middle(document.querySelector('.col')!.getBoundingClientRect()),
      bar: middle(document.getElementById('bar')!.getBoundingClientRect()),
      space: (left + right) / 2,
    };
  });

/** How far the text and the bar sit from the middle of their space, in px. */
async function offsets(page: Page): Promise<{ text: number; bar: number }> {
  const { text, bar, space } = await middles(page);
  return { text: text - space, bar: bar - space };
}

/** Whether the bold row sits inside the part of the outline that shows. */
const boldRowInView = (page: Page) =>
  outline(page).evaluate((column) => {
    const bold = [...column.querySelectorAll('a')].find((link) => link.checkVisibility() && Number(getComputedStyle(link).fontWeight) >= 700);
    if (!bold) return null;
    const row = bold.getBoundingClientRect();
    for (let box: Element | null = bold.parentElement; box && column.contains(box); box = box.parentElement) {
      const shown = box.getBoundingClientRect();
      if (row.top < shown.top - 1 || row.bottom > shown.bottom + 1) return false;
    }
    return row.top >= -1 && row.bottom <= innerHeight + 1;
  });

test("'Contents' shows no headings and no arrow 'Outline', also in the menu of a narrow window", async ({ page, docs }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${docs.address}${RESTORE}`);
  await hydrated(page);
  await expect(rowOf(page, 'Restore a file')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Outline', exact: true })).toHaveCount(0);
  for (const name of ['Pick a file', 'Pick a day', 'Check the result']) await expect(panel(page).getByRole('link', { name, exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await button(page, 'Contents').click();
  await expect(panel(page)).toBeVisible();
  await expect(rowOf(page, 'Restore a file')).toBeVisible();
  for (const name of ['Pick a file', 'Pick a day', 'Check the result']) await expect(panel(page).getByRole('link', { name, exact: true })).toHaveCount(0);
});

test.describe('in a window 1200 px wide or wider', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the headings of the open page sit in a column on the right with no title, and the text and the bar center between Contents and the column', async ({ page, docs }) => {
    await page.goto(`${docs.address}${RESTORE}`);
    await hydrated(page);
    await expect(outline(page)).toBeVisible();
    await expect(outline(page).getByRole('link')).toHaveText(['Pick a file', 'Pick a day', 'Check the result']);
    const lines = await outline(page).evaluate((column) => (column as HTMLElement).innerText.split('\n').map((line) => line.trim()).filter(Boolean));
    expect(lines).toEqual(['Pick a file', 'Pick a day', 'Check the result']);

    const column = (await outline(page).boundingBox())!;
    const text = (await page.locator('.col').boundingBox())!;
    expect(column.x).toBeGreaterThanOrEqual(text.x + text.width);
    expect(column.x + column.width).toBeLessThanOrEqual(1280);

    const { text: textOff, bar: barOff } = await offsets(page);
    expect(Math.abs(textOff), 'the text centers between Contents and the column').toBeLessThanOrEqual(2);
    expect(Math.abs(barOff), 'the bar centers between Contents and the column').toBeLessThanOrEqual(2);
  });

  test('a scroll bolds the row of the heading on the line, and the column scrolls to keep the bold row in view', async ({ page, docs }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    // The live connection starts after the page has set its own scroll.
    await openLive(page, `${docs.address}${STEPS_ADDRESS}`);
    await hydrated(page);
    expect(await row(page, 'Step 30').evaluate((link) => link.getBoundingClientRect().top >= innerHeight), 'the last rows sit below the window').toBe(true);

    for (const step of [20, 30, 3]) {
      await putHeadingAt(page, `step-${step}`, 100);
      await expect.poll(() => boldRows(page), OFTEN).toEqual([`Step ${step}`]);
      await expect.poll(() => boldRowInView(page), { ...OFTEN, message: `the row of Step ${step} shows` }).toBe(true);
    }

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${docs.address}${RESTORE}`);
    await hydrated(page);
    await putHeadingAt(page, 'pick-a-day', 100);
    await expect.poll(() => boldRows(page), OFTEN).toEqual(['Pick a day']);
    await scrollPage(page, await page.evaluate(() => document.documentElement.scrollHeight - innerHeight));
    await expect.poll(() => boldRows(page), OFTEN).toEqual(['Check the result']);
  });

  test('a click on a row puts its heading 32 px from the top at once and bolds the row, and a click on the page row goes to the top with no reload', async ({ page, docs }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLive(page, `${docs.address}${RESTORE}`);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');

    await row(page, 'Pick a day').click();
    await expect(page).toHaveURL(/#pick-a-day$/);
    expect(await topOf(page, 'pick-a-day')).toBe(32);
    await expect.poll(() => boldRows(page), OFTEN).toEqual(['Pick a day']);

    await putHeadingAt(page, 'check-the-result', 100);
    await expect.poll(() => boldRows(page), OFTEN).toEqual(['Check the result']);

    await scrollPage(page, 1500);
    await rowOf(page, 'Restore a file').click();
    await expect.poll(() => page.evaluate(() => scrollY), OFTEN).toBe(0);
    await expect(page).toHaveURL(/\/backups\/restore\.html$/);
    await expectNoReload(page);
  });

  test('a row of a heading that shows at some levels only hides at the other levels, shows in the same task as its text, and sits one step in below the top rank', async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}${RESTORE}`);
    await expect(row(page, 'Pick a file')).toBeVisible();
    await expect(row(page, 'Search index')).toBeHidden();
    await expect(row(page, 'The copy rule')).toBeHidden();

    await pressOnSlider(page, 'End');
    const shown = await page.evaluate(() => {
      const column = document.querySelector('aside[aria-label="Outline"]')!;
      const link = [...column.querySelectorAll('a')].find((each) => each.textContent?.trim() === 'Search index')!;
      return { row: link.checkVisibility(), part: document.querySelector('#page .part[data-l="internals"]')!.checkVisibility() };
    });
    expect(shown).toEqual({ row: true, part: true });

    /** The left edge of the text of a row, inside its padding. */
    const textLeft = (name: string) =>
      row(page, name).evaluate((link) => {
        const range = document.createRange();
        range.selectNodeContents(link);
        return range.getBoundingClientRect().left;
      });
    expect(await textLeft('Search index')).toBeGreaterThan(await textLeft('Pick a file'));
    expect(await textLeft('Pick a day')).toBe(await textLeft('Pick a file'));
  });

  test("'Hide outline' hides the column, the text and the bar center as on a page with no column, and 'Show outline' in the top right corner brings it back", async ({ page, docs }) => {
    await page.goto(`${docs.address}${PLAIN}`);
    await hydrated(page);
    const noColumn = await offsets(page);

    await page.goto(`${docs.address}${RESTORE}`);
    await hydrated(page);
    await expect(button(page, 'Show outline')).toBeHidden();
    await button(page, 'Hide outline').click();
    await expect(outline(page)).toBeHidden();
    await expect(button(page, 'Hide outline')).toBeHidden();
    const show = button(page, 'Show outline');
    await expect(show).toBeVisible();
    const corner = (await show.boundingBox())!;
    expect(corner.x + corner.width).toBeGreaterThan(1280 - 64);
    expect(corner.y).toBeLessThan(64);

    const hidden = await offsets(page);
    expect(Math.abs(hidden.text - noColumn.text), 'the text centers as on a page with no column').toBeLessThanOrEqual(1);
    expect(Math.abs(hidden.bar - noColumn.bar), 'the bar centers as on a page with no column').toBeLessThanOrEqual(1);

    await show.click();
    await expect(outline(page)).toBeVisible();
    await expect(show).toBeHidden();
    await expect(button(page, 'Hide outline')).toBeVisible();
  });

  test('the outline stays hidden on every page and after a reload, under the key nerddocs-outline, and shows the right state at the first paint', async ({ page, docs }) => {
    await page.goto(`${docs.address}${RESTORE}`);
    await hydrated(page);
    await button(page, 'Hide outline').click();
    await expect(outline(page)).toBeHidden();
    const hiddenValue = await page.evaluate((key) => localStorage.getItem(key), OUTLINE_KEY);
    expect(hiddenValue).not.toBeNull();

    await page.goto(`${docs.address}${STEPS_ADDRESS}`);
    await hydrated(page);
    await expect(outline(page)).toBeHidden();
    await expect(button(page, 'Show outline')).toBeVisible();

    let release = await holdPageScript(page);
    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('h1')).toHaveText('Restore steps');
    await expect(outline(page)).toBeHidden();
    await expect(button(page, 'Show outline')).toBeVisible();
    release();
    await hydrated(page);
    await expect(outline(page)).toBeHidden();

    await button(page, 'Show outline').click();
    await expect(outline(page)).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), OUTLINE_KEY)).not.toBe(hiddenValue);

    release = await holdPageScript(page);
    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('h1')).toHaveText('Restore steps');
    await expect(outline(page)).toBeVisible();
    await expect(button(page, 'Show outline')).toBeHidden();
    release();
    await hydrated(page);
    await expect(outline(page)).toBeVisible();
  });

  test('the reading place holds when the outline hides and shows', async ({ page, docs }) => {
    // A full text width fills the space, so the lines change when the column goes.
    await storeWidth(page, 'full');
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(`${docs.address}${RESTORE}`);
    await hydrated(page);
    await noScrollAnchoring(page);
    await scrollToMiddle(page);

    await expectPlaceHolds(page, 'hiding the outline', () => button(page, 'Hide outline').click());
    await expectPlaceHolds(page, 'showing the outline', () => button(page, 'Show outline').click());
  });

  test('a page with no headings has no column and no outline buttons, and its text sits as on a page without a column', async ({ page, docs }) => {
    await page.goto(`${docs.address}${PLAIN}`);
    await hydrated(page);
    await expect(outline(page)).toBeHidden();
    for (const name of ['Hide outline', 'Show outline', 'Outline']) await expect(button(page, name)).toBeHidden();
    const { text, bar } = await offsets(page);
    expect(Math.abs(text)).toBeLessThanOrEqual(1);
    expect(Math.abs(bar)).toBeLessThanOrEqual(1);
  });

  test('at a level where none of its headings shows, a page has no column and no outline buttons, and its text sits as on a page without a column', async ({ page, docs }) => {
    await page.goto(`${docs.address}${PLAIN}`);
    await hydrated(page);
    const noColumn = await offsets(page);

    await page.goto(`${docs.address}${SCRIPT}`);
    await hydrated(page);
    await expect(outline(page)).toBeHidden();
    for (const name of ['Hide outline', 'Show outline', 'Outline']) await expect(button(page, name)).toBeHidden();
    const atOverview = await offsets(page);
    expect(Math.abs(atOverview.text - noColumn.text)).toBeLessThanOrEqual(1);
    expect(Math.abs(atOverview.bar - noColumn.bar)).toBeLessThanOrEqual(1);

    await pressOnSlider(page, 'End');
    await expect(outline(page)).toBeVisible();
    await expect(row(page, 'Script flags')).toBeVisible();
    await button(page, 'Hide outline').click();
    await expect(button(page, 'Show outline')).toBeVisible();

    await pressOnSlider(page, 'Home');
    await expect(button(page, 'Show outline')).toBeHidden();
    await pressOnSlider(page, 'End');
    await expect(button(page, 'Show outline')).toBeVisible();
  });
});

test.describe('in a window narrower than 1200 px', () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test("there is no column, and the button 'Outline' in the bar opens the headings as a layer at the right side", async ({ page, docs }) => {
    await page.goto(`${docs.address}${RESTORE}`);
    await hydrated(page);
    await expect(outline(page)).toBeHidden();
    await expect(button(page, 'Hide outline')).toBeHidden();
    await expect(button(page, 'Show outline')).toBeHidden();
    const open = page.locator('#bar').getByRole('button', { name: 'Outline', exact: true });
    await expect(open).toBeVisible();

    await open.click();
    await expect(outline(page)).toBeVisible();
    const layer = (await outline(page).boundingBox())!;
    expect(Math.abs(layer.x + layer.width - 1000)).toBeLessThanOrEqual(1);
    expect(layer.width).toBeLessThan(1000);
    expect(
      await outline(page).evaluate((column) => {
        const rect = column.getBoundingClientRect();
        return column.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      }),
      'the layer sits over the text',
    ).toBe(true);
    await expect(row(page, 'Pick a day')).toBeVisible();
  });

  test("'Close outline' and Escape close the layer and give the focus back to 'Outline', and a click on a row closes it at its heading", async ({ page, docs }) => {
    await page.goto(`${docs.address}${RESTORE}`);
    await hydrated(page);
    const open = button(page, 'Outline');

    await open.click();
    await outline(page).getByRole('button', { name: 'Close outline', exact: true }).click();
    await expect(outline(page)).toBeHidden();
    await expect(open).toBeFocused();

    await open.click();
    await expect(outline(page)).toBeVisible();
    await row(page, 'Pick a day').focus();
    await page.keyboard.press('Escape');
    await expect(outline(page)).toBeHidden();
    await expect(open).toBeFocused();

    await open.click();
    await row(page, 'Check the result').click();
    await expect(outline(page)).toBeHidden();
    await expect(page).toHaveURL(/#check-the-result$/);
    await expect.poll(() => topOf(page, 'check-the-result'), OFTEN).toBe(32);
  });

  test('under 960 px wide the layer fills the window', async ({ page, docs }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.goto(`${docs.address}${RESTORE}`);
    await hydrated(page);
    await button(page, 'Outline').click();
    await expect(outline(page)).toBeVisible();
    expect(await outline(page).boundingBox()).toEqual({ x: 0, y: 0, width: 800, height: 700 });
    await expect(outline(page).getByRole('button', { name: 'Close outline', exact: true })).toBeVisible();
  });

  test("a page with no headings has no button 'Outline'", async ({ page, docs }) => {
    await page.goto(`${docs.address}${PLAIN}`);
    await hydrated(page);
    await expect(button(page, 'Contents')).toBeHidden();
    await expect(button(page, 'Outline')).toBeHidden();
    await page.setViewportSize({ width: 800, height: 700 });
    await expect(button(page, 'Contents')).toBeVisible();
    await expect(button(page, 'Outline')).toBeHidden();
  });
});

test('a save that adds, renames or removes a heading changes the rows of the outline at once, and the bold row stays', async ({ page, ownSite }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'backups/restore.md': RESTORE_PAGE, 'backups/plain.md': PLAIN_PAGE });
  await openLive(page, `${run.address}${RESTORE}`);
  await putHeadingAt(page, 'pick-a-day', 100);
  await expect.poll(() => boldRows(page), OFTEN).toEqual(['Pick a day']);
  const withHeading = (name: string) => `${RESTORE_PAGE}\n\n## ${name}\n\nAn undo puts the old file back.`;

  await run.save('backups/restore.md', withHeading('Undo a restore'));
  await expect(row(page, 'Undo a restore')).toBeVisible();
  await expect.poll(() => boldRows(page), OFTEN).toEqual(['Pick a day']);

  await run.save('backups/restore.md', withHeading('Cancel a restore'));
  await expect(row(page, 'Cancel a restore')).toBeVisible();
  await expect(row(page, 'Undo a restore')).toHaveCount(0);

  await run.save('backups/restore.md', RESTORE_PAGE);
  await expect(row(page, 'Cancel a restore')).toHaveCount(0);
  await expectNoReload(page);

  await openLive(page, `${run.address}${PLAIN}`);
  await expect(outline(page)).toBeHidden();
  await run.save('backups/plain.md', `${PLAIN_PAGE}\n## Undo a restore\n\nAn undo puts the old file back.\n`);
  await expect(row(page, 'Undo a restore')).toBeVisible();
  await expect(button(page, 'Hide outline')).toBeVisible();
  await run.save('backups/plain.md', PLAIN_PAGE);
  await expect(outline(page)).toBeHidden();
  await expect(button(page, 'Hide outline')).toBeHidden();
  await expectNoReload(page);
});

for (const theme of THEMES) {
  test(`in '${theme.name}', light and dark, the outline column takes the colors and the fonts of the theme`, async ({ page, docs }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${docs.address}${RESTORE}`);
    for (const mode of ['light', 'dark'] as const) {
      await page.evaluate(
        ([themeKey, modeKey, id, look]) => {
          localStorage.setItem(themeKey, id);
          localStorage.setItem(modeKey, look);
        },
        [THEME_KEY, MODE_KEY, theme.id, mode] as const,
      );
      await page.reload();
      await hydrated(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      await expect(outline(page)).toBeVisible();
      const looks = await page.evaluate(() => {
        const look = (element: Element) => {
          const style = getComputedStyle(element);
          return { color: style.color, font: style.fontFamily };
        };
        const plain = (links: Iterable<Element>) =>
          [...links].find((link) => link.checkVisibility() && !link.hasAttribute('aria-current') && Number(getComputedStyle(link).fontWeight) < 700)!;
        return {
          outline: look(plain(document.querySelectorAll('aside[aria-label="Outline"] a'))),
          contents: look(plain(document.querySelectorAll('#panel #tree a'))),
        };
      });
      expect(looks.outline, `${theme.name} ${mode}`).toEqual(looks.contents);
    }
  });
}
