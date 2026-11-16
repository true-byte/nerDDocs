import { expect, type Page } from '@playwright/test';
import { MODE_KEY, THEME_KEY, type LookSetting } from '../../src/page/theme-memory.ts';
import { DEFAULT_THEME, THEMES } from '../../src/themes/index.ts';
import type { Mode } from '../../src/themes/types.ts';
import { rgbOf } from '../support/css.ts';
import { levelsFile, THREE_LEVELS } from '../support/levels.ts';
import { barButtons, expectNoReload, failOnPageError, holdPageScript, hydrated, test as pageTest, TOGGLES } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

const PHONE = { width: 500, height: 800 };

const FILES = {
  'nerddocs.json': THREE_LEVELS,
  'restore.md':
    '# Restore a file\n\nA restore never changes the copy.\n\n::: overview\nPick a file and a day.\n::: internals\nA restore is a job.\n:::\n',
  'storage.md': '# Storage\n\nBlocks are stored once.\n',
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

const themeOf = (id: string) => THEMES.find((theme) => theme.id === id)!;
const DEFAULT = themeOf(DEFAULT_THEME);
const SERIOUS = themeOf('im-a-serious-person');
const IM_IN = themeOf('im-in');
/** The theme after the default theme in the list. */
const NEXT = THEMES[THEMES.findIndex((theme) => theme.id === DEFAULT_THEME) + 1]!;

const root = (page: Page) => page.locator('html');
const body = (page: Page) => page.locator('body');
const themeButton = (page: Page) => page.locator('#thmB');
const themeBox = (page: Page) => page.locator('#theme-box');
const search = (page: Page) => page.locator('#theme-search');
const list = (page: Page) => page.locator('#theme-list');
const rows = (page: Page) => list(page).locator('[role="option"]');
const row = (page: Page, id: string) => page.locator(`#theme-opt-${id}`);
const chips = (page: Page) => list(page).locator('[data-theme]');
const lookSwitch = (page: Page) => page.locator('#theme-mode');
const lookButtons = (page: Page) => lookSwitch(page).locator('button[role="radio"]');
const lookButton = (page: Page, look: LookSetting) => lookSwitch(page).locator(`[data-look="${look}"]`);
const cancel = (page: Page) => page.locator('#theme-cancel');
const apply = (page: Page) => page.locator('#theme-apply');
const preview = (page: Page) => page.locator('#theme-preview');
const previewRoot = (page: Page) => page.frameLocator('#theme-preview').locator('html');
const previewBody = (page: Page) => page.frameLocator('#theme-preview').locator('body');

const rowIds = (page: Page) => rows(page).evaluateAll((items) => items.map((item) => [item.id, item.getAttribute('data-id')]));
const shownIds = (page: Page) =>
  rows(page).evaluateAll((items) =>
    items.filter((item) => item.checkVisibility({ visibilityProperty: true })).map((item) => item.getAttribute('data-id')),
  );
const selectedIds = (page: Page) =>
  rows(page).evaluateAll((items) =>
    items.filter((item) => item.getAttribute('aria-selected') === 'true').map((item) => item.getAttribute('data-id')),
  );
/** The `aria-checked` of each button of the look switch, in order. */
const lookChecks = (page: Page) => lookButtons(page).evaluateAll((items) => items.map((item) => item.getAttribute('aria-checked')));
/** The `data-mode` values that the chips of the list carry, each once. */
const chipModes = (page: Page) =>
  chips(page).evaluateAll((items) => [...new Set(items.map((item) => item.getAttribute('data-mode')))]);
/** The theme and the look setting in the storage of the page. */
const stored = (page: Page) =>
  page.evaluate(
    ([theme, mode]) => ({ theme: localStorage.getItem(theme), look: localStorage.getItem(mode) }),
    [THEME_KEY, MODE_KEY] as const,
  );

/** The `aria-checked` values of the look switch when the given setting is checked. */
function checkedAt(look: LookSetting): string[] {
  return (['light', 'dark', 'system'] as const).map((each) => String(each === look));
}

/**
 * The ids of the rows that paint a mark that the other rows lack: the check mark. A mark is a shown element outside
 * the chip with no more than one character of text, such as an icon, or a `::before` or an `::after`.
 */
const checkedIds = (page: Page) =>
  rows(page).evaluateAll((items) => {
    const shown = { opacityProperty: true, visibilityProperty: true };
    const marks = items.map((item) => {
      const chip = item.querySelector('[data-theme]');
      let count = 0;
      for (const element of [item, ...item.querySelectorAll('*')]) {
        if (chip?.contains(element) || !element.checkVisibility(shown)) continue;
        const { width, height } = element.getBoundingClientRect();
        const glyph = (element.textContent ?? '').trim().length <= 1;
        if (element !== item && element.childElementCount === 0 && width > 0 && height > 0 && glyph) count++;
        for (const pseudo of ['::before', '::after']) {
          const { content, display } = getComputedStyle(element, pseudo);
          if (content !== 'none' && content !== 'normal' && display !== 'none') count++;
        }
      }
      return count;
    });
    const fewest = Math.min(...marks);
    return items.filter((_, at) => marks[at]! > fewest).map((item) => item.getAttribute('data-id'));
  });

/** Counts the requests for the preview page, so a test sees whether the frame loaded again. */
function previewLoads(page: Page): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/theme-preview.html')) count++;
  });
  return () => count;
}

async function openAt(page: Page, address: string): Promise<void> {
  await page.goto(address);
  await hydrated(page);
}

/** The selected row: the search points at it, it carries the class `on`, and the preview shows its theme. */
async function expectSelected(page: Page, id: string, because = id): Promise<void> {
  await expect(search(page), because).toHaveAttribute('aria-activedescendant', `theme-opt-${id}`);
  await expect(row(page, id), because).toHaveClass(/(^|\s)on(\s|$)/);
  await expect(previewRoot(page), because).toHaveAttribute('data-theme', id);
}

/** The page shows the theme in the look, with the background of that look. */
async function expectPageShows(page: Page, id: string, mode: Mode, because = `${id} ${mode}`): Promise<void> {
  await expect(root(page), because).toHaveAttribute('data-theme', id);
  await expect(root(page), because).toHaveAttribute('data-mode', mode);
  await expect(body(page), because).toHaveCSS('background-color', rgbOf(themeOf(id)[mode].bg));
}

/** Opens the box, selects a theme and, if given, a look setting, and applies them. */
async function applyTheme(page: Page, id: string, look?: LookSetting): Promise<void> {
  await themeButton(page).click();
  await expect(themeBox(page)).toBeVisible();
  await row(page, id).click();
  if (look) await lookButton(page, look).click();
  await apply(page).click();
  await expect(themeBox(page)).toBeHidden();
  await expect(root(page)).toHaveAttribute('data-theme', id);
}

/**
 * Starts to watch the computer's look in the page, and gives a wait for its next change. The page's own watch
 * started first, so the page has handled the change when the wait ends.
 */
async function watchComputerLook(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    (window as unknown as { lookChanged: Promise<void> }).lookChanged = new Promise((resolve) =>
      query.addEventListener('change', () => resolve(), { once: true }),
    );
  });
  return () => page.evaluate(() => (window as unknown as { lookChanged: Promise<void> }).lookChanged);
}

test("the 'Themes' button opens the box with the focus in the search, every theme in order, the page's theme selected and checked, and Cancel and Apply in place of a close button", async ({ page, docs }) => {
  await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, SERIOUS.id] as const);
  await openAt(page, `${docs.address}restore.html`);
  expect(await page.locator('#bar .b2 button').evaluateAll((buttons) => buttons.slice(-2).map((each) => each.id))).toEqual(['thmB', 'lnkB']);
  for (const [name, value] of [['aria-label', 'Themes'], ['title', 'Themes'], ['aria-haspopup', 'dialog']] as const) {
    await expect(themeButton(page)).toHaveAttribute(name, value);
  }

  await themeButton(page).click();
  await expect(themeBox(page)).toBeVisible();
  await expect(search(page)).toBeFocused();
  for (const [part, name, value] of [
    [themeBox(page), 'aria-label', 'Themes'],
    [search(page), 'type', 'search'],
    [search(page), 'aria-label', 'Search themes'],
    [list(page), 'role', 'listbox'],
    [list(page), 'aria-label', 'Themes'],
    [preview(page), 'title', 'Theme preview'],
  ] as const) {
    await expect(part).toHaveAttribute(name, value);
  }
  await expect(rows(page)).toHaveCount(THEMES.length);
  expect(await rowIds(page)).toEqual(THEMES.map(({ id }) => [`theme-opt-${id}`, id]));
  await expect(rows(page)).toContainText(THEMES.map((theme) => theme.name));
  await expectSelected(page, SERIOUS.id);
  await expect.poll(() => selectedIds(page), OFTEN).toEqual([SERIOUS.id]);
  await expect.poll(() => checkedIds(page), OFTEN).toEqual([SERIOUS.id]);

  await expect(page.locator('#theme-close')).toHaveCount(0);
  await expect(cancel(page)).toHaveText('Cancel');
  await expect(apply(page)).toHaveText('Apply');
  for (const part of [lookSwitch(page), cancel(page), apply(page)]) await expect(part).toBeInViewport({ ratio: 1 });
  await expect
    .poll(async () => {
      const [look, frame, rest, no, yes] = await Promise.all(
        [lookSwitch, preview, list, cancel, apply].map((part) => part(page).boundingBox()),
      );
      return {
        lookRightOfList: look!.x >= rest!.x + rest!.width - 1,
        lookAbovePreview: look!.y + look!.height <= frame!.y + 1,
        buttonsUnderList: Math.min(no!.y, yes!.y) >= rest!.y + rest!.height - 1,
        applyRightOfCancel: yes!.x >= no!.x + no!.width - 1,
      };
    }, OFTEN)
    .toEqual({ lookRightOfList: true, lookAbovePreview: true, buttonsUnderList: true, applyRightOfCancel: true });
});

test("typing 'nerd' in the search leaves only 'Original Nerd', and clearing the search shows every theme again", async ({ page, docs }) => {
  await openAt(page, `${docs.address}restore.html`);
  await themeButton(page).click();
  await search(page).fill('nerd');
  const nerds = THEMES.filter(({ name }) => name.toLowerCase().includes('nerd')).map(({ id }) => id);
  expect(nerds).toContain('original-nerd');
  await expect.poll(() => shownIds(page), OFTEN).toEqual(nerds);
  await search(page).fill('');
  await expect.poll(() => shownIds(page), OFTEN).toEqual(THEMES.map((theme) => theme.id));
});

test("a click on 'I'm in' shows it in the preview only, and hovering another row leaves the preview as it is", async ({ page, docs }) => {
  const loads = previewLoads(page);
  await openAt(page, `${docs.address}restore.html`);
  await page.evaluate(() => {
    (window as unknown as { sameWindow: boolean }).sameWindow = true;
  });
  await themeButton(page).click();
  await expect(page.frameLocator('#theme-preview').locator('h1')).toHaveText('Restore a file');

  await row(page, IM_IN.id).click();
  await expectSelected(page, IM_IN.id);
  await expect(root(page)).toHaveAttribute('data-theme', DEFAULT_THEME);
  await expect.poll(() => checkedIds(page), OFTEN).toEqual([DEFAULT_THEME]);
  await expect(themeBox(page)).toBeVisible();
  await expect(search(page), 'the search keeps the focus after a click, so the arrow keys still work').toBeFocused();

  await row(page, SERIOUS.id).hover();
  // The click after the hover changes the frame, so the frame then shows the row that the hover left selected.
  await lookButton(page, 'dark').click();
  await expect(previewRoot(page)).toHaveAttribute('data-mode', 'dark');
  await expectSelected(page, IM_IN.id, 'the selected row after a hover on another row');
  await expect(root(page)).toHaveAttribute('data-theme', DEFAULT_THEME);
  expect(loads(), 'the loads of the preview page').toBe(1);
  await expectNoReload(page);
});

test("the look switch opens at 'System', and 'Dark' on a light computer turns the preview and the chips dark, not the page", async ({ page, docs }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const loads = previewLoads(page);
  await openAt(page, `${docs.address}restore.html`);
  await themeButton(page).click();

  await expect(lookSwitch(page)).toHaveAttribute('role', 'radiogroup');
  await expect(lookSwitch(page)).toHaveAttribute('aria-label', 'Look');
  await expect(lookButtons(page)).toHaveText(['Light', 'Dark', 'System']);
  expect(
    await lookButtons(page).evaluateAll((items) =>
      items.map((item) => [item.getAttribute('data-look'), item.getAttribute('type'), item.querySelectorAll('svg').length]),
    ),
  ).toEqual([
    ['light', 'button', 1],
    ['dark', 'button', 1],
    ['system', 'button', 1],
  ]);
  await expect.poll(() => lookChecks(page), OFTEN).toEqual(checkedAt('system'));
  await expect(previewRoot(page)).toHaveAttribute('data-mode', 'light');
  await expect.poll(() => chipModes(page), OFTEN).toEqual(['light']);

  await lookButton(page, 'dark').click();
  await expect.poll(() => lookChecks(page), OFTEN).toEqual(checkedAt('dark'));
  await expect(previewRoot(page)).toHaveAttribute('data-mode', 'dark');
  await expect(previewRoot(page)).toHaveAttribute('data-theme', DEFAULT_THEME);
  await expect(previewBody(page)).toHaveCSS('background-color', rgbOf(DEFAULT.dark.bg));
  await expect.poll(() => chipModes(page), OFTEN).toEqual(['dark']);
  for (const theme of THEMES) {
    await expect(row(page, theme.id).locator('[data-theme]'), theme.name).toHaveCSS('background-color', rgbOf(theme.dark.bg));
  }
  await expectPageShows(page, DEFAULT_THEME, 'light', 'the page behind the box');

  for (const [look, mode] of [['light', 'light'], ['dark', 'dark'], ['system', 'light']] as const) {
    await lookButton(page, look).click();
    await expect.poll(() => lookChecks(page), { ...OFTEN, message: look }).toEqual(checkedAt(look));
    await expect(previewRoot(page), look).toHaveAttribute('data-mode', mode);
    await expect.poll(() => chipModes(page), { ...OFTEN, message: look }).toEqual([mode]);
  }
  await expect(root(page)).toHaveAttribute('data-mode', 'light');
  expect(loads(), 'the loads of the preview page').toBe(1);
});

test("Apply after 'I'm in' and 'Dark' closes the box and shows both on the page, and both hold after a reload and on another page from the first paint", async ({ page, docs }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openAt(page, `${docs.address}restore.html`);
  await themeButton(page).click();
  await row(page, IM_IN.id).click();
  await lookButton(page, 'dark').click();
  await expect(previewRoot(page)).toHaveAttribute('data-mode', 'dark');
  await expectPageShows(page, DEFAULT_THEME, 'light', 'the page before Apply');

  await apply(page).click();
  await expect(themeBox(page)).toBeHidden();
  await expect(themeButton(page)).toBeFocused();
  await expectPageShows(page, IM_IN.id, 'dark');
  expect(await stored(page)).toEqual({ theme: IM_IN.id, look: 'dark' });

  const visits = [() => page.reload({ waitUntil: 'commit' }), () => page.goto(`${docs.address}storage.html`, { waitUntil: 'commit' })];
  for (const visit of visits) {
    const release = await holdPageScript(page);
    await visit();
    await expect(page.locator('body > #art:first-child')).toHaveCount(1);
    await expectPageShows(page, IM_IN.id, 'dark', `${page.url()} before the page script runs`);
    release();
    await hydrated(page);
  }

  await expectPageShows(page, IM_IN.id, 'dark');
  await themeButton(page).click();
  await expectSelected(page, IM_IN.id);
  await expect.poll(() => checkedIds(page), OFTEN).toEqual([IM_IN.id]);
  await expect.poll(() => lookChecks(page), OFTEN).toEqual(checkedAt('dark'));
  await expect(previewRoot(page)).toHaveAttribute('data-mode', 'dark');
});

test('Cancel, Esc and a click on the backdrop close the box and change nothing, and the next open starts from the page', async ({ page, docs }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openAt(page, `${docs.address}restore.html`);
  const ways = {
    Cancel: () => cancel(page).click(),
    Esc: () => page.keyboard.press('Escape'),
    backdrop: () => page.mouse.click(4, 4),
  };
  for (const [way, close] of Object.entries(ways)) {
    await themeButton(page).click();
    await expect(themeBox(page), way).toBeVisible();
    await expectSelected(page, DEFAULT_THEME, `the open before ${way}`);
    await expect.poll(() => lookChecks(page), { ...OFTEN, message: `the open before ${way}` }).toEqual(checkedAt('system'));
    await expect(previewRoot(page), `the open before ${way}`).toHaveAttribute('data-mode', 'light');

    await row(page, IM_IN.id).click();
    await lookButton(page, 'dark').click();
    await expectSelected(page, IM_IN.id, way);
    await expect(previewRoot(page), way).toHaveAttribute('data-mode', 'dark');

    await close();
    await expect(themeBox(page), way).toBeHidden();
    await expect(themeButton(page), way).toBeFocused();
    await expectPageShows(page, DEFAULT_THEME, 'light', `the page after ${way}`);
    expect(await stored(page), way).toEqual({ theme: null, look: null });
  }

  await themeButton(page).click();
  await expectSelected(page, DEFAULT_THEME, 'the open after each close');
  await expect.poll(() => checkedIds(page), OFTEN).toEqual([DEFAULT_THEME]);
  await expect.poll(() => lookChecks(page), OFTEN).toEqual(checkedAt('system'));
  await expect(previewRoot(page)).toHaveAttribute('data-mode', 'light');
  await expect.poll(() => chipModes(page), OFTEN).toEqual(['light']);
});

test('ArrowDown then Enter in the search applies the next theme and closes the box', async ({ page, docs }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openAt(page, `${docs.address}restore.html`);
  await themeButton(page).click();
  await expect(search(page)).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expectSelected(page, NEXT.id);
  await expect(root(page)).toHaveAttribute('data-theme', DEFAULT_THEME);

  await page.keyboard.press('Enter');
  await expect(themeBox(page)).toBeHidden();
  await expect(themeButton(page)).toBeFocused();
  await expectPageShows(page, NEXT.id, 'light');
  expect(await stored(page)).toEqual({ theme: NEXT.id, look: 'system' });
});

test("with 'System' stored, a change of the computer's look changes the look of the page and of the open box at once, and with 'Light' stored it does not", async ({ page, docs }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'system'), MODE_KEY);
  await page.emulateMedia({ colorScheme: 'light' });
  await openAt(page, `${docs.address}restore.html`);
  await expectPageShows(page, DEFAULT_THEME, 'light');

  for (const mode of ['dark', 'light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode });
    await expectPageShows(page, DEFAULT_THEME, mode, `'System' on a computer set to ${mode}`);
  }

  await themeButton(page).click();
  await expect.poll(() => lookChecks(page), OFTEN).toEqual(checkedAt('system'));
  for (const mode of ['light', 'dark'] as const) {
    const look = `'System' in the box on a computer set to ${mode}`;
    await page.emulateMedia({ colorScheme: mode });
    await expect(previewRoot(page), look).toHaveAttribute('data-mode', mode);
    await expect.poll(() => chipModes(page), { ...OFTEN, message: look }).toEqual([mode]);
  }
  await cancel(page).click();
  await expect(themeBox(page)).toBeHidden();

  await applyTheme(page, DEFAULT_THEME, 'light');
  await expectPageShows(page, DEFAULT_THEME, 'light', "'Light' on a dark computer");
  expect(await stored(page)).toEqual({ theme: DEFAULT_THEME, look: 'light' });
  for (const mode of ['light', 'dark'] as const) {
    const changed = await watchComputerLook(page);
    await page.emulateMedia({ colorScheme: mode });
    await changed();
    await expectPageShows(page, DEFAULT_THEME, 'light', `'Light' on a computer set to ${mode}`);
  }
});

test.describe('on a computer set to dark', () => {
  test.use({ colorScheme: 'dark' });

  test("'System' shows the dark look from the first paint, and 'Light' shows the light look, also from the first paint after a reload", async ({ page, docs }) => {
    const firstOpen = await holdPageScript(page);
    await page.goto(`${docs.address}restore.html`, { waitUntil: 'commit' });
    await expectPageShows(page, DEFAULT_THEME, 'dark', 'nothing stored, before the page script runs');
    firstOpen();
    await hydrated(page);

    await applyTheme(page, SERIOUS.id);
    await expectPageShows(page, SERIOUS.id, 'dark');

    await themeButton(page).click();
    await expect.poll(() => lookChecks(page), OFTEN).toEqual(checkedAt('system'));
    await expect(previewRoot(page)).toHaveAttribute('data-mode', 'dark');
    await expect.poll(() => chipModes(page), OFTEN).toEqual(['dark']);
    await lookButton(page, 'light').click();
    await apply(page).click();
    await expect(themeBox(page)).toBeHidden();
    await expectPageShows(page, SERIOUS.id, 'light', "'Light' on a dark computer");

    const reload = await holdPageScript(page);
    await page.reload({ waitUntil: 'commit' });
    await expectPageShows(page, SERIOUS.id, 'light', "'Light' before the page script runs");
    reload();
    await hydrated(page);
    await expectPageShows(page, SERIOUS.id, 'light');
  });
});

test('on a site with "levels": false, the bar holds the text width button and the theme button, and the theme button opens the box', async ({ page, site }) => {
  await openAt(page, `${site.address}storage.html`);
  await expect(page.locator('#bar')).toBeVisible();
  await expect.poll(() => barButtons(page), OFTEN).toEqual(TOGGLES);
  await themeButton(page).click();
  await expect(themeBox(page)).toBeVisible();
});

test('the theme button shows on a page with no parts, with one level, and with a missing or broken nerddocs.json', async ({ page, docs, ownSite }) => {
  const restore = '# Restore a file\n\n::: overview\nPick a file and a day.\n:::\n';
  const [oneLevel, noConfig, broken] = await Promise.all([
    ownSite({ 'nerddocs.json': levelsFile('overview'), 'restore.md': restore }),
    ownSite({ 'restore.md': restore }, { noConfig: true }),
    ownSite({ 'nerddocs.json': '{"levels":', 'restore.md': restore }),
  ]);
  for (const address of [
    `${docs.address}storage.html`,
    `${oneLevel!.address}restore.html`,
    `${noConfig!.address}restore.html`,
    `${broken!.address}restore.html`,
  ]) {
    await openAt(page, address);
    await expect(themeButton(page), address).toBeVisible();
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test("the 'Themes' button sits after Defaults at the foot of the contents panel, and opens the box with the preview, the look switch, the search, the list, Cancel and Apply from top to bottom", async ({ page, docs }) => {
    await openAt(page, `${docs.address}restore.html`);
    await expect(themeButton(page)).toBeHidden();
    await page.locator('#menuB').click();

    const button = page.locator('#panel .p-foot #thm2');
    await expect(button).toBeVisible();
    for (const [name, value] of [['aria-label', 'Themes'], ['title', 'Themes']] as const) await expect(button).toHaveAttribute(name, value);
    expect(await page.locator('#panel .p-foot button').evaluateAll((buttons) => buttons.map((each) => each.id))).toEqual(['dfl2', 'thm2', 'lnk2']);

    await button.click();
    await expect(themeBox(page)).toBeVisible();
    for (const part of [preview(page), lookSwitch(page), search(page), list(page)]) await expect(part).toBeInViewport();
    for (const part of [cancel(page), apply(page)]) await expect(part).toBeInViewport({ ratio: 1 });
    await expect
      .poll(async () => {
        const [top, look, find, rest, no, yes] = await Promise.all(
          [preview, lookSwitch, search, list, cancel, apply].map((part) => part(page).boundingBox()),
        );
        const above = (upper: typeof top, lower: typeof top) => upper!.y + upper!.height <= lower!.y + 1;
        return {
          previewAboveLook: above(top, look),
          lookAboveSearch: above(look, find),
          searchAboveList: above(find, rest),
          listAboveButtons: above(rest, no) && above(rest, yes),
          previewFitsScreen: top!.width <= PHONE.width + 1,
        };
      }, OFTEN)
      .toEqual({ previewAboveLook: true, lookAboveSearch: true, searchAboveList: true, listAboveButtons: true, previewFitsScreen: true });

    await page.keyboard.press('Escape');
    await expect(themeBox(page)).toBeHidden();
    await expect(button).toBeFocused();
  });

  test('on a site with "levels": false, the theme button shows at the foot of the contents panel', async ({ page, site }) => {
    await openAt(page, `${site.address}storage.html`);
    await page.locator('#menuB').click();
    await expect(page.locator('#panel #thm2')).toBeVisible();
    await expect(page.locator('#dfl2')).toHaveCount(0);
    await page.locator('#panel #thm2').click();
    await expect(themeBox(page)).toBeVisible();
  });
});

test("each theme, applied with 'Light' and with 'Dark' on a light computer, shows with no error and its sheet behind the text", async ({ page, docs }) => {
  const errors = failOnPageError(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await openAt(page, `${docs.address}restore.html`);
  for (const mode of ['light', 'dark'] as const) {
    for (const theme of THEMES) {
      const look = `'${theme.name}' ${mode}`;
      await applyTheme(page, theme.id, mode);
      await expectPageShows(page, theme.id, mode, look);
      await expect(page.locator('.col'), look).toHaveCSS('background-color', rgbOf(theme[mode].sheet));
      const failedFonts = await page.evaluate(async () => {
        void document.body.offsetHeight;
        await document.fonts.ready;
        return [...document.fonts].filter((face) => face.status === 'error').map((face) => face.family);
      });
      expect(failedFonts, look).toEqual([]);
      expect(errors, look).toEqual([]);
    }
  }
});
