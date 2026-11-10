import { expect, type Page } from '@playwright/test';
import { THEME_KEY } from '../../src/page/theme-memory.ts';
import { DEFAULT_THEME, THEMES } from '../../src/themes/index.ts';
import { THREE_LEVELS } from '../support/levels.ts';
import { barButtons, expectNoReload, failOnPageError, hydrated, openLive, panel, test as pageTest, TOGGLES } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';
import {
  applyButton,
  colWidth,
  columns,
  expectCharsALine,
  expectCharWidthSettled,
  expectColWidth,
  expectFull,
  expectMarkAt,
  expectPlaceHolds,
  expectTextWidth,
  leftHandle,
  menuItem,
  noScrollAnchoring,
  pressOnWidth,
  prosePage,
  restoreButton,
  ruler,
  rulerNumber,
  scrollToMiddle,
  setWidthByKeys,
  shortParagraphsPage,
  showRuler,
  storedCharWidths,
  storedWidthOf,
  storeOutlineHidden,
  storeWidth,
  textWidth,
  widthButton,
  widthMenu,
  widthSlider,
  type Columns,
} from '../support/text-width.ts';

const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 800, height: 700 };

const FILES = {
  'nerddocs.json': THREE_LEVELS,
  'restore.md': prosePage('Restore a file'),
  'guide.md': prosePage('Backup guide', 6),
  'notes.md': shortParagraphsPage('Backup notes'),
  'schedules.md': '# Schedules\n\n::: overview\nA plan says how often.\n::: internals\nThe scheduler adds a delay.\n:::\n',
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

test.use({ viewport: WIDE });

async function open(page: Page, address: string): Promise<void> {
  await page.goto(address);
  await hydrated(page);
}

const sideways = (page: Page) => page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth);
const mainPadding = (page: Page) =>
  page.locator('main').evaluate((main) => {
    const style = getComputedStyle(main);
    return [style.paddingLeft, style.paddingRight];
  });

/** How far the middle of the column sits from the middle of the free space. */
const offCenter = ({ colLeft, col, freeLeft, free }: Columns) => Math.abs(colLeft + col / 2 - (freeLeft + free / 2));

/** The width of one character, from the text of a page at the default of 75 characters on a wide window. */
const charPx = async (page: Page) => (await textWidth(page)) / 75;

/** The vertical middle of the ruler, where a reader presses on it. */
const rulerY = async (page: Page) => {
  const box = (await ruler(page).boundingBox())!;
  return box.y + box.height / 2;
};

async function drag(page: Page, x: number, y: number, by: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by, y, { steps: 5 });
  await page.mouse.up();
}

/** Drags the right handle of the ruler sideways by the given px. */
async function dragRight(page: Page, by: number): Promise<void> {
  const handle = (await widthSlider(page).boundingBox())!;
  await drag(page, handle.x + handle.width / 2, await rulerY(page), by);
}

async function applyTheme(page: Page, id: string): Promise<void> {
  await page.locator('#thmB').click();
  await expect(page.locator('#theme-box')).toBeVisible();
  await page.locator(`#theme-opt-${id}`).click();
  await page.locator('#theme-apply').click();
  await expect(page.locator('#theme-box')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-theme', id);
}

/** The px of one character of a run of 100 in the body font of the text, and the font size of the text. */
const renderedChar = (page: Page) =>
  page.locator('#page').evaluate((text) => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;white-space:nowrap;visibility:hidden';
    probe.textContent = 'Restore a file. '.repeat(7).slice(0, 100);
    text.append(probe);
    const charPx = probe.getBoundingClientRect().width / 100;
    const size = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return { charPx, size };
  });

const hideContents = (page: Page) => page.getByRole('button', { name: 'Hide contents' }).click();
const showContents = (page: Page) => page.getByRole('button', { name: 'Show contents' }).click();

for (const theme of THEMES) {
  test(`a full line holds about 75 characters by default in '${theme.name}'`, async ({ page, docs }) => {
    await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, theme.id] as const);
    await open(page, `${docs.address}restore.html`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
    await expectCharsALine(page, 68, 77, 78, theme.name);
  });

  test(`with fresh storage, a long page opened at its top in '${theme.name}' is still at its top after the page settles`, async ({ page, docs }) => {
    if (theme.id !== DEFAULT_THEME) await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, theme.id] as const);
    await open(page, `${docs.address}notes.html`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
    await expectCharWidthSettled(page);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });
}

test('"textWidth" in nerddocs.json sets the characters of a line, and a save of it changes the width with no reload', async ({ page, ownSite }) => {
  const run = await ownSite({ 'nerddocs.json': '{"levels":false,"textWidth":60}', 'restore.md': prosePage('Restore a file') });
  await openLive(page, `${run.address}restore.html`);
  await hydrated(page);
  await expectCharsALine(page, 54, 61);
  const sixty = await textWidth(page);

  await run.save('nerddocs.json', '{"levels":false,"textWidth":90}');
  await expectTextWidth(page, (sixty / 60) * 90, 'the text of 90 characters', 2);
  await expectNoReload(page);
});

test('the column narrows with the window to 288 px, which a 320 px window holds, and below that main scrolls sideways', async ({ page, docs }) => {
  await open(page, `${docs.address}restore.html`);
  const wide = await columns(page);
  expect(wide.col, 'room at the sides of the column on a wide window').toBeLessThan(wide.free - 100);
  expect(offCenter(wide), 'the column in the middle of the free space').toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(panel(page)).toBeVisible();
  await expect
    .poll(async () => {
      const shown = await columns(page);
      return Math.abs(shown.col - Math.min(shown.free, wide.col));
    }, OFTEN)
    .toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: Math.round(wide.col) - 68, height: 900 });
  await expectFull(page, 'a window narrower than the column');

  await page.setViewportSize({ width: 320, height: 900 });
  await expectColWidth(page, 288);
  expect(await sideways(page)).toBe(0);

  await page.setViewportSize({ width: 300, height: 900 });
  await expectColWidth(page, 288);
  await expect.poll(() => sideways(page), OFTEN).toBeGreaterThan(0);
});

test("the 'Text width' button sits before 'Defaults', or before 'Themes' on a site with no levels, and a phone shows no button and no ruler", async ({ page, docs, site }) => {
  await open(page, `${docs.address}schedules.html`);
  await expect.poll(async () => (await barButtons(page)).slice(-5), OFTEN).toEqual(['timeB', 'widthB', 'dflB', 'thmB', 'lnkB']);
  for (const [name, value] of [
    ['aria-label', 'Text width'],
    ['title', 'Text width'],
    ['aria-pressed', 'false'],
    ['aria-haspopup', 'menu'],
  ] as const) {
    await expect(widthButton(page), name).toHaveAttribute(name, value);
  }
  // The ruler icon of the approved mock.
  await expect(widthButton(page).locator('svg rect[x="3"][y="8"][width="18"][height="8"]')).toHaveCount(1);
  await expect(widthButton(page).locator('svg path[d="M7 8v3M11 8v4M15 8v3"]')).toHaveCount(1);
  await expect(ruler(page)).toBeHidden();

  await open(page, `${site.address}storage.html`);
  await expect.poll(() => barButtons(page), OFTEN).toEqual(TOGGLES);

  await showRuler(page);
  await page.setViewportSize(PHONE);
  await expect(widthButton(page)).toBeHidden();
  await expect(ruler(page)).toBeHidden();

  await open(page, `${docs.address}schedules.html`);
  await expect(page.locator('#menuB')).toBeVisible();
  await expect(widthButton(page)).toBeHidden();
  await expect(ruler(page)).toBeHidden();
});

test("the button opens a menu with 'Show ruler' and 'Restore default' above it, which Esc, a click outside and the arrow keys work", async ({ page, docs }) => {
  const errors = failOnPageError(page);
  await open(page, `${docs.address}restore.html`);
  await expect(widthMenu(page)).toBeHidden();

  await widthButton(page).click();
  await expect(widthMenu(page)).toBeVisible();
  await expect(widthMenu(page)).toHaveAttribute('role', 'menu');
  await expect(widthMenu(page)).toHaveAttribute('aria-label', 'Text width');
  await expect(widthMenu(page).getByRole('menuitem')).toHaveText(['Show ruler', 'Restore default']);
  await expect(menuItem(page, 'Restore default')).toBeDisabled();
  await expect(menuItem(page, 'Show ruler')).toBeFocused();
  await expect(widthButton(page)).toHaveAttribute('aria-pressed', 'false');

  // The menu sits above the bar, with its right edge at the right of the button.
  const menu = (await widthMenu(page).boundingBox())!;
  const bar = (await page.locator('#bar').boundingBox())!;
  const button = (await widthButton(page).boundingBox())!;
  expect(menu.y + menu.height).toBeLessThanOrEqual(bar.y);
  expect(Math.abs(menu.x + menu.width - (button.x + button.width))).toBeLessThanOrEqual(1);

  await page.keyboard.press('Escape');
  await expect(widthMenu(page)).toBeHidden();
  await expect(widthButton(page)).toBeFocused();

  await widthButton(page).click();
  await expect(widthMenu(page)).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(widthMenu(page)).toBeHidden();
  await expect(widthButton(page)).toBeFocused();

  await setWidthByKeys(page, 'ArrowRight', 1, '80');
  await widthButton(page).click();
  await expect(menuItem(page, 'Restore default')).toBeEnabled();
  await expect(menuItem(page, 'Show ruler')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menuItem(page, 'Restore default')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menuItem(page, 'Show ruler')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(widthMenu(page)).toBeHidden();
  await expect(widthButton(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test("'Show ruler' shows the ruler at the top of the window with a handle at each edge of the text, 75 in the middle, and no 'Restore' or 'Apply'", async ({ page, docs }) => {
  const errors = failOnPageError(page);
  await open(page, `${docs.address}restore.html`);
  await showRuler(page);
  await expect(widthMenu(page)).toBeHidden();
  await expect(widthButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(widthSlider(page)).toBeFocused();
  await expect(widthSlider(page)).toHaveAttribute('tabindex', '0');
  await expect(rulerNumber(page)).toHaveText('75');
  await expect(widthSlider(page)).toHaveAttribute('aria-valuenow', '75');
  await expect(widthSlider(page)).toHaveAttribute('aria-valuetext', '75 characters');
  const least = Number(await widthSlider(page).getAttribute('aria-valuemin'));
  const most = Number(await widthSlider(page).getAttribute('aria-valuemax'));
  expect(Number.isInteger(least) && Number.isInteger(most), `${least} to ${most}`).toBe(true);
  expect(least).toBeLessThan(75);
  expect(most).toBeGreaterThan(75);
  await expect(restoreButton(page)).toBeHidden();
  await expect(applyButton(page)).toBeHidden();

  // The ruler is 24 px tall and runs across the free space, from the left edge of the text at full width to its right edge.
  const box = (await ruler(page).boundingBox())!;
  const shown = await columns(page);
  const { textLeft, textRight, text } = shown;
  const strip = textLeft - shown.colLeft;
  const after = shown.colLeft + shown.col - textRight;
  expect(box.y).toBe(0);
  expect(box.height).toBe(24);
  expect(Math.abs(box.x - (shown.freeLeft + strip)), `ruler left ${box.x}`).toBeLessThanOrEqual(1);
  expect(Math.abs(box.x + box.width - (shown.freeLeft + shown.free - after)), `ruler right ${box.x + box.width}`).toBeLessThanOrEqual(1);

  // A handle at each edge of the text, and the band over the text.
  const right = (await widthSlider(page).boundingBox())!;
  const left = (await leftHandle(page).boundingBox())!;
  expect(Math.abs(right.x + right.width / 2 - textRight), 'the right handle on the right edge').toBeLessThanOrEqual(1);
  expect(Math.abs(left.x + left.width / 2 - textLeft), 'the left handle on the left edge').toBeLessThanOrEqual(1);
  const band = (await ruler(page).locator('.rband').boundingBox())!;
  expect(Math.abs(band.x - textLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(band.width - text)).toBeLessThanOrEqual(1);

  // A short tick every 5 characters of width and a tall tick every 25, counted from the middle of the text.
  const cw = text / 75;
  const ticks = await ruler(page).evaluate((el) => {
    const style = getComputedStyle(el);
    return { short: parseFloat(style.getPropertyValue('--s')), tall: parseFloat(style.getPropertyValue('--S')), middle: parseFloat(style.getPropertyValue('--o')) };
  });
  expect(Math.abs(ticks.short - 2.5 * cw), `short ticks ${ticks.short} px apart`).toBeLessThanOrEqual(0.1);
  expect(Math.abs(ticks.tall - 12.5 * cw), `tall ticks ${ticks.tall} px apart`).toBeLessThanOrEqual(0.3);
  expect(Math.abs(ticks.middle - ((textLeft + textRight) / 2 - box.x)), `ticks from ${ticks.middle} px`).toBeLessThanOrEqual(1);
  const number = (await rulerNumber(page).boundingBox())!;
  expect(Math.abs(number.x + number.width / 2 - (textLeft + textRight) / 2)).toBeLessThanOrEqual(2);

  // A press on the number sets nothing, and the slider keeps the focus.
  await rulerNumber(page).click();
  await expect(widthSlider(page)).toBeFocused();
  await expect(rulerNumber(page)).toHaveText('75');
  await expect(restoreButton(page)).toBeHidden();

  // The ruler stays at the top when the page scrolls.
  await page.evaluate(() => scrollTo(0, 400));
  expect((await ruler(page).boundingBox())!.y).toBe(0);
  expect(errors).toEqual([]);
});

test('a drag of either handle and a click on the ruler set the width, and both edges of the text move', async ({ page, docs }) => {
  const errors = failOnPageError(page);
  await open(page, `${docs.address}restore.html`);
  const cw = await charPx(page);
  await showRuler(page);
  const start = await columns(page);

  await dragRight(page, 50);
  await expect.poll(() => textWidth(page), OFTEN).toBeGreaterThan(start.text + 100 - cw);
  const right = await columns(page);
  expect(right.text).toBeLessThan(start.text + 100 + cw);
  expect(start.textLeft - right.textLeft, 'the left edge moves out').toBeGreaterThan(40);
  expect(right.textRight - start.textRight, 'the right edge moves out').toBeGreaterThan(40);
  expect(offCenter(right)).toBeLessThanOrEqual(1);
  await expect.poll(async () => Number(await rulerNumber(page).textContent()), OFTEN).toBeGreaterThan(80);
  await expect(restoreButton(page)).toBeVisible();
  await expect(applyButton(page)).toBeVisible();

  const left0 = (await leftHandle(page).boundingBox())!;
  await drag(page, left0.x + left0.width / 2, await rulerY(page), -40);
  await expect.poll(() => textWidth(page), OFTEN).toBeGreaterThan(right.text + 80 - cw);
  const left = await columns(page);
  expect(left.text).toBeLessThan(right.text + 80 + cw);
  expect(right.textLeft - left.textLeft, 'the left edge moves out').toBeGreaterThan(30);
  expect(left.textRight - right.textRight, 'the right edge moves out').toBeGreaterThan(30);
  expect(offCenter(left)).toBeLessThanOrEqual(1);
  await expect.poll(async () => Number(await rulerNumber(page).textContent()), OFTEN).toBeGreaterThan(90);

  // A click on the ruler puts the right edge of the text at the click, and the left edge as far from the middle.
  const half = (start.text - 150) / 2;
  await page.mouse.click((left.textLeft + left.textRight) / 2 + half, await rulerY(page));
  await expectTextWidth(page, 2 * half, 'the text from the click', cw / 2 + 2);
  expect(offCenter(await columns(page))).toBeLessThanOrEqual(1);
  await expect(rulerNumber(page)).toHaveText(String(Math.round((await textWidth(page)) / cw)));
  expect(errors).toEqual([]);
});

test("'Restore' goes back to the width that the ruler opened with, and 'Apply' and the button close the ruler and keep the width", async ({ page, docs }) => {
  await open(page, `${docs.address}restore.html`);
  const cw = await charPx(page);
  await showRuler(page);
  await pressOnWidth(page, 'ArrowRight', 5);
  await expect(rulerNumber(page)).toHaveText('100');
  await expect(widthSlider(page)).toHaveAttribute('aria-valuenow', '100');
  await expect(widthSlider(page)).toHaveAttribute('aria-valuetext', '100 characters');
  await expectTextWidth(page, 100 * cw, 'the text of 100 characters');
  await expect(restoreButton(page)).toBeVisible();
  await expect(applyButton(page)).toBeVisible();
  const hundred = await textWidth(page);

  await applyButton(page).click();
  await expect(ruler(page)).toBeHidden();
  await expect(widthButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expectTextWidth(page, hundred);
  await expect.poll(() => storedWidthOf(page), OFTEN).toBe('100');

  await showRuler(page);
  await expect(rulerNumber(page)).toHaveText('100');
  await expect(restoreButton(page)).toBeHidden();
  await expect(applyButton(page)).toBeHidden();
  await pressOnWidth(page, 'ArrowLeft', 2);
  await expect(rulerNumber(page)).toHaveText('90');
  await expect(restoreButton(page)).toBeVisible();
  await restoreButton(page).click();
  await expect(rulerNumber(page)).toHaveText('100');
  await expectTextWidth(page, hundred);
  await expect(restoreButton(page)).toBeHidden();
  await expect(applyButton(page)).toBeHidden();
  await expect(ruler(page)).toBeVisible();
  // 'Restore' hides itself, and the focus goes on to the slider, so the keys keep working.
  await expect(widthSlider(page)).toBeFocused();

  // By keyboard: Tab goes from the slider to 'Restore', and Enter on it gives the focus back to the slider.
  await page.keyboard.press('ArrowLeft');
  await expect(rulerNumber(page)).toHaveText('95');
  await page.keyboard.press('Tab');
  await expect(restoreButton(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rulerNumber(page)).toHaveText('100');
  await expect(widthSlider(page)).toBeFocused();

  // Moving back onto the opening width hides both buttons too.
  await page.keyboard.press('ArrowRight');
  await expect(rulerNumber(page)).toHaveText('105');
  await expect(applyButton(page)).toBeVisible();
  await pressOnWidth(page, 'ArrowLeft');
  await expect(rulerNumber(page)).toHaveText('100');
  await expect(restoreButton(page)).toBeHidden();
  await expect(applyButton(page)).toBeHidden();

  await pressOnWidth(page, 'ArrowRight');
  await expect(rulerNumber(page)).toHaveText('105');
  await widthButton(page).click();
  await expect(ruler(page)).toBeHidden();
  await expect(widthMenu(page)).toBeHidden();
  await expect(widthButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expectTextWidth(page, (hundred / 100) * 105);
  await expect.poll(() => storedWidthOf(page), OFTEN).toBe('105');
});

test('a set width holds on another page and after a reload', async ({ page, docs }) => {
  await open(page, `${docs.address}restore.html`);
  await setWidthByKeys(page, 'ArrowRight', 5, '100');
  const hundred = await textWidth(page);

  await open(page, `${docs.address}guide.html`);
  await expectTextWidth(page, hundred, 'another page');
  await page.reload();
  await hydrated(page);
  await expectTextWidth(page, hundred, 'after a reload');
  await showRuler(page);
  await expect(rulerNumber(page)).toHaveText('100');
});

test("'Restore default' gives the default width again, and is then disabled", async ({ page, docs }) => {
  await open(page, `${docs.address}restore.html`);
  const fallback = await textWidth(page);
  await setWidthByKeys(page, 'PageUp', 1, '100');
  await expect.poll(() => textWidth(page), OFTEN).toBeGreaterThan(fallback + 10);

  await widthButton(page).click();
  await expect(menuItem(page, 'Restore default')).toBeEnabled();
  await menuItem(page, 'Restore default').click();
  await expect(widthMenu(page)).toBeHidden();
  await expectTextWidth(page, fallback, 'the default width');
  await expect.poll(() => storedWidthOf(page), OFTEN).toBeNull();

  await widthButton(page).click();
  await expect(menuItem(page, 'Restore default')).toBeDisabled();
});

test('on the slider, End fills the free space and Home gives a column of 288 px', async ({ page, docs }) => {
  await open(page, `${docs.address}restore.html`);
  const cw = await charPx(page);
  await showRuler(page);

  await pressOnWidth(page, 'End');
  await expectFull(page);
  const most = (await widthSlider(page).getAttribute('aria-valuemax'))!;
  await expect(widthSlider(page)).toHaveAttribute('aria-valuenow', most);
  await expect(rulerNumber(page)).toHaveText(most);

  // Home asks for the narrowest text, and the width rounds to whole characters.
  await pressOnWidth(page, 'Home');
  await expect.poll(() => colWidth(page), OFTEN).toBeLessThanOrEqual(288 + cw / 2 + 0.5);
  expect(await colWidth(page)).toBeGreaterThanOrEqual(287.5);
  const least = (await widthSlider(page).getAttribute('aria-valuemin'))!;
  await expect(widthSlider(page)).toHaveAttribute('aria-valuenow', least);
  await expect(rulerNumber(page)).toHaveText(least);
});

test("'full' fills the free space at any window size and with the panel hidden", async ({ page, docs }) => {
  await open(page, `${docs.address}restore.html`);
  await showRuler(page);
  await pressOnWidth(page, 'End');
  await applyButton(page).click();
  await expect(ruler(page)).toBeHidden();
  await expectFull(page);
  await expect.poll(() => storedWidthOf(page), OFTEN).toBe('full');

  await page.setViewportSize({ width: 1700, height: 900 });
  await expectFull(page, 'a wider window');
  await page.setViewportSize({ width: 1100, height: 900 });
  await expectFull(page, 'a narrower window');

  await hideContents(page);
  await expect(panel(page)).toBeHidden();
  await expectFull(page, 'the panel hidden');
  expect(await mainPadding(page)).toEqual(['48px', '48px']);
});

test('a width of 100 holds when the window grows, shows at the window width in a narrower window and comes back, and holds with the panel hidden', async ({ page, docs }) => {
  await storeOutlineHidden(page);
  await storeWidth(page, '100');
  await open(page, `${docs.address}restore.html`);
  await showRuler(page);
  await expect(rulerNumber(page)).toHaveText('100');
  await widthButton(page).click();
  await expect(ruler(page)).toBeHidden();
  const hundred = await columns(page);
  expect(hundred.col).toBeLessThan(hundred.free);

  await page.setViewportSize({ width: 1700, height: 900 });
  await expectTextWidth(page, hundred.text, 'a wider window');

  // The free space of any window narrower than the column is narrower than the column.
  await page.setViewportSize({ width: Math.round(hundred.col) - 68, height: 900 });
  await expectFull(page, 'a window narrower than the width');

  await page.setViewportSize(WIDE);
  await expectTextWidth(page, hundred.text, 'the window as wide as before');

  await hideContents(page);
  await expect(panel(page)).toBeHidden();
  await expectTextWidth(page, hundred.text, 'the panel hidden');
  expect(await mainPadding(page)).toEqual(['48px', '48px']);
  expect(offCenter(await columns(page))).toBeLessThanOrEqual(1);
  await showContents(page);
  await expectTextWidth(page, hundred.text, 'the panel shown again');
});

test('a theme change keeps the number of characters of a set width, and the page keeps the character width of each theme', async ({ page, docs }) => {
  const errors = failOnPageError(page);
  await storeOutlineHidden(page);
  await storeWidth(page, '100');
  await open(page, `${docs.address}restore.html`);
  await expectCharsALine(page, 91, 101, 104, 'themelessness at 100');
  await expect.poll(async () => (await storedCharWidths(page)).themelessness, OFTEN).toEqual(expect.any(Number));
  const themelessness = (await storedCharWidths(page)).themelessness as number;
  expect(themelessness).toBeGreaterThanOrEqual(0.3);
  expect(themelessness).toBeLessThanOrEqual(0.8);

  // A monospace font: every character renders at one width, so a line holds at most 100 characters.
  await applyTheme(page, 'im-in');
  await expectCharsALine(page, 92, 100, 100, 'im-in at 100');
  await expect.poll(async () => (await storedCharWidths(page))['im-in'], OFTEN).toEqual(expect.any(Number));
  const imIn = (await storedCharWidths(page))['im-in'] as number;
  // The text shows the width that the page measured, not only stores it.
  await expect
    .poll(() => page.evaluate((em) => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--char-w')) - em), imIn), OFTEN)
    .toBeLessThanOrEqual(0.0005);
  // The page stores the width as the font renders: 0.6 em, which a browser can round to a whole px.
  const { charPx: monoPx, size } = await renderedChar(page);
  expect(Math.abs(monoPx - 0.6 * size), `${monoPx} px a character at ${size} px`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(imIn - monoPx / size), `${imIn} em stored, ${monoPx / size} em rendered`).toBeLessThanOrEqual(0.002);
  expect((await storedCharWidths(page)).themelessness).toBe(themelessness);
  await showRuler(page);
  await expect(rulerNumber(page)).toHaveText('100');
  expect(errors).toEqual([]);
});

test("a width that shows at the narrowest text stays the opening width when the ruler asks for the narrowest text", async ({ page, docs }) => {
  await storeWidth(page, '5');
  await open(page, `${docs.address}restore.html`);
  await showRuler(page);
  const least = (await widthSlider(page).getAttribute('aria-valuemin'))!;
  await expect(rulerNumber(page)).toHaveText(least);

  await pressOnWidth(page, 'Home');
  await expect(rulerNumber(page)).toHaveText(least);
  expect(await storedWidthOf(page), 'Home').toBe('5');
  await expect(restoreButton(page)).toBeHidden();

  // A click near the middle asks for less than the narrowest text.
  const box = (await ruler(page).boundingBox())!;
  const { textLeft, textRight } = await columns(page);
  await page.mouse.click((textLeft + textRight) / 2 + 80, box.y + box.height / 2);
  await expect(widthSlider(page)).toBeFocused();
  expect(await storedWidthOf(page), 'a click near the middle').toBe('5');
  await expect(restoreButton(page)).toBeHidden();
  await expect(applyButton(page)).toBeHidden();
});

test('a width set in one tab shows in the other tabs of the site', async ({ page, docs, context }) => {
  await open(page, `${docs.address}restore.html`);
  const fallback = await textWidth(page);
  const other = await context.newPage();
  await open(other, `${docs.address}guide.html`);

  await setWidthByKeys(page, 'ArrowRight', 5, '100');
  const hundred = await textWidth(page);
  await expectTextWidth(other, hundred, 'the other tab');
  await widthButton(other).click();
  await expect(menuItem(other, 'Restore default')).toBeEnabled();

  await menuItem(other, 'Restore default').click();
  await expectTextWidth(other, fallback, 'the default in the other tab');
  await expectTextWidth(page, fallback, 'the default in the first tab');
  await widthButton(page).click();
  await expect(menuItem(page, 'Restore default')).toBeDisabled();
});

test("with forced colors, the pressed 'Text width' button shows in the colors of a selection", async ({ page, docs }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await open(page, `${docs.address}restore.html`);
  const colors = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.backgroundColor, style.color];
    });
  const selection = await page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.cssText = 'forced-color-adjust:none;background:Highlight;color:HighlightText';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const both = [style.backgroundColor, style.color];
    probe.remove();
    return both;
  });
  expect(await colors('#widthB')).not.toEqual(selection);

  await showRuler(page);
  await expect(widthButton(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await colors('#widthB')).toEqual(selection);
  expect(await colors('#thmB')).not.toEqual(selection);
});

test.describe('the line 30% down the window holds its place', () => {
  test("through 'Show ruler' with a stored width, a drag, a key, 'Restore' and 'Restore default'", async ({ page, docs }) => {
    const errors = failOnPageError(page);
    await storeWidth(page, '100');
    await open(page, `${docs.address}guide.html`);
    await noScrollAnchoring(page);
    await scrollToMiddle(page);

    await expectPlaceHolds(page, "'Show ruler'", () => showRuler(page), () => expect(widthSlider(page)).toBeFocused());
    await expectPlaceHolds(page, 'a drag', () => dragRight(page, 40));
    await expectPlaceHolds(page, 'a key', () => pressOnWidth(page, 'ArrowLeft'));
    await expect(rulerNumber(page)).not.toHaveText('100');
    // A click on the ruler between the middle and the right handle.
    const { textRight } = await columns(page);
    await expectPlaceHolds(page, 'a click on the ruler', async () => page.mouse.click(textRight - 60, await rulerY(page)));
    await expectPlaceHolds(page, "'Restore'", () => restoreButton(page).click());
    await expect(rulerNumber(page)).toHaveText('100');

    await widthButton(page).click();
    await expect(ruler(page)).toBeHidden();
    await expectPlaceHolds(page, "'Restore default'", async () => {
      await widthButton(page).click();
      await menuItem(page, 'Restore default').click();
    });
    expect(errors).toEqual([]);
  });

  test('through a save of nerddocs.json with a new "textWidth"', async ({ page, ownSite }) => {
    const errors = failOnPageError(page);
    const run = await ownSite({ 'nerddocs.json': '{"levels":false,"textWidth":60}', 'guide.md': prosePage('Backup guide', 6) });
    await openLive(page, `${run.address}guide.html`);
    await hydrated(page);
    await noScrollAnchoring(page);
    await scrollToMiddle(page);
    await expectPlaceHolds(page, 'a save of nerddocs.json', () => run.save('nerddocs.json', '{"levels":false,"textWidth":90}'));
    await expectNoReload(page);
    expect(errors).toEqual([]);
  });

  test('through a key to full, the panel, a resize and a theme change', async ({ page, docs }) => {
    const errors = failOnPageError(page);
    await open(page, `${docs.address}guide.html`);
    await noScrollAnchoring(page);
    await scrollToMiddle(page);

    await showRuler(page);
    await expectPlaceHolds(page, 'End', () => pressOnWidth(page, 'End'));
    await applyButton(page).click();
    await expect(ruler(page)).toBeHidden();
    await expectPlaceHolds(page, 'hiding the panel', () => hideContents(page));
    await expectPlaceHolds(page, 'showing the panel', () => showContents(page));
    await expectPlaceHolds(page, 'a resize', () => page.setViewportSize({ width: 1200, height: WIDE.height }));

    await widthButton(page).click();
    await menuItem(page, 'Restore default').click();
    await expect.poll(() => storedWidthOf(page), OFTEN).toBeNull();
    const offset = await expectPlaceHolds(page, 'a theme change', () => applyTheme(page, 'im-in'));
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await expectMarkAt(page, offset, 'the fonts of the theme loaded');
    expect(errors).toEqual([]);
  });
});
