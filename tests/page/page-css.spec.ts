import { expect, type Locator, type Page } from '@playwright/test';
import { MODE_KEY, THEME_KEY } from '../../src/page/theme-memory.ts';
import { THEMES } from '../../src/themes/index.ts';
import { MOVE_MS, openOnStoppedClock, pressOnSlider, SIGNALS_MS, THREE_LEVELS } from '../support/levels.ts';
import { hydrated, panel, rowOf, test as pageTest } from '../support/page.ts';
import { rgbOf } from '../support/css.ts';
import { pngFile } from '../support/images.ts';
import { CODE_SITE, JOB_JSON, LONG_SH, RESTORE_PAGE, SCHEDULES_SITE, SETTINGS_PAGE } from '../support/page-content.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';
import { columns, storeWidth } from '../support/text-width.ts';

/** A page with a block image and the problem box of a missing image. */
const IMAGE_FILES = {
  'restore.md': '# Restore a file\n\n![Restore window](restore-window.png)\n\n![Old window](restore-window-old.png)\n',
  'restore-window.png': pngFile(1280, 720),
};

/**
 * Tests that only read 'Schedules' share one command on it, tests that only read 'Restore by script' another, and tests
 * that only read the page with an image a third.
 */
const test = pageTest.extend<object, { schedules: RunningCommand; code: RunningCommand; images: RunningCommand }>({
  images: [
    async ({}, use) => {
      const run = await runCommand(IMAGE_FILES);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
  schedules: [
    async ({}, use) => {
      const run = await runCommand(SCHEDULES_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
  code: [
    async ({}, use) => {
      const run = await runCommand(CODE_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

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

const sideways = (page: Page, selector: string) =>
  page.locator(selector).evaluate((box) => box.scrollWidth - box.clientWidth);

for (const width of [320, 360, 390, 560, 580, 1440]) {
  test(`at ${width} wide, the text column does not scroll sideways`, async ({ page, site }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${site.address}long-names.html`);
    expect(await sideways(page, 'main')).toBe(0);
    await page.goto(`${site.address}backups/schedules.html`);
    expect(await sideways(page, 'main')).toBe(0);
  });
}

test('a long title wraps in the panel, and code and tables keep their own sideways scroll', async ({ page, site }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${site.address}long-names.html`);
  expect(await sideways(page, '.code > pre')).toBeGreaterThan(0);
  expect(await sideways(page, '.code')).toBe(0);
  await expect(page.locator('.code')).toHaveCSS('overflow-x', 'visible');
  expect(await sideways(page, '.wide > .sbox')).toBeGreaterThan(0);
  expect(await sideways(page, '.wide')).toBe(0);
  await expect(page.locator('.wide')).toHaveCSS('overflow-x', 'visible');

  await page.setViewportSize({ width: 1440, height: 800 });
  expect(await sideways(page, '#tree')).toBe(0);
});

test('a table column keeps the alignment that the Markdown sets', async ({ page, site }) => {
  await page.goto(`${site.address}long-names.html`);
  const cells = page.locator('tbody td');
  await expect(cells.nth(0)).toHaveCSS('text-align', /left/);
  await expect(cells.nth(1)).toHaveCSS('text-align', /right/);
  await expect(cells.nth(2)).toHaveCSS('text-align', /center/);
});

test('at 960 wide the panel sits beside the text, and at 959 wide the menu button takes its place', async ({ page, site }) => {
  await page.setViewportSize({ width: 960, height: 700 });
  await page.goto(`${site.address}backups/restore.html`);
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Contents', exact: true })).toBeHidden();

  await page.setViewportSize({ width: 959, height: 700 });
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Contents', exact: true })).toBeVisible();
});

test('the scroll anchoring of the browser stays on, for content that loads late above the reader', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  for (const selector of ['html', 'body', 'main', '#page']) await expect(page.locator(selector), selector).toHaveCSS('overflow-anchor', 'auto');
});

test.describe('the frame', () => {
  test('with the panel hidden, the text takes the whole window', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Hide contents' }).click();
    await expect(panel(page)).toBeHidden();

    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect((await page.locator('main').boundingBox())!.width).toBe(width);
  });

  test('with the panel hidden on a wide window, the free space keeps 48 px at each side', async ({ page, site }) => {
    await page.setViewportSize({ width: 960, height: 700 });
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Hide contents' }).click();
    await expect(panel(page)).toBeHidden();
    await expect(page.locator('main')).toHaveCSS('padding-left', '48px');
    await expect(page.locator('main')).toHaveCSS('padding-right', '48px');

    await page.setViewportSize({ width: 959, height: 700 });
    await expect(page.locator('main')).toHaveCSS('padding-left', '16px');
    await expect(page.locator('main')).toHaveCSS('padding-right', '16px');
  });

  test('the panel stays on screen when the text scrolls', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await page.evaluate(() => window.scrollTo(0, 1000));
    expect((await panel(page).boundingBox())!.y).toBe(0);
  });

  test('with the panel hidden, the button that shows it floats over the text', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Hide contents' }).click();
    await page.evaluate(() => window.scrollTo(0, 1000));
    await expect(page.getByRole('button', { name: 'Show contents' })).toBeInViewport();
  });

  test('an icon draws its lines', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    for (const icon of [page.getByRole('button', { name: 'Hide contents' }).locator('svg'), page.locator('.chev svg').first()]) {
      await expect(icon).toHaveCSS('stroke', /^rgb/);
      await expect(icon).toHaveCSS('fill', 'none');
    }
  });

  test('a keyboard user sees which control has focus', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveCSS('outline-style', 'solid');
    await expect(page.locator(':focus')).toHaveCSS('outline-width', '2px');
  });

  test('a reader who asks for reduced motion gets section arrows that do not animate', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await expect(page.locator('.chev svg').first()).toHaveCSS('transition-duration', '0.2s');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.chev svg').first()).toHaveCSS('transition-duration', '0s');
  });
});

test.describe('the panel rows', () => {
  test('the row of the current page has a highlight and bold text, and the other rows do not', async ({ page, site }) => {
    await page.goto(`${site.address}backups/restore.html`);
    const current = rowOf(page, 'Restore a file');
    const other = rowOf(page, 'Schedules');

    await expect(current.locator('..')).toHaveCSS('background-color', 'rgb(227, 233, 239)');
    await expect(other.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(current).toHaveCSS('font-weight', '700');
    await expect(other).toHaveCSS('font-weight', '400');
  });

  test('the arrow of a closed section turns', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    const backups = panel(page).getByRole('button', { name: 'Backups' });
    await expect(backups.locator('svg')).toHaveCSS('transform', 'none');

    await backups.click();
    await expect(backups.locator('svg')).not.toHaveCSS('transform', 'none');
  });

  test('the rows of a subsection sit further in than their parent rows', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    const parent = await panel(page).getByRole('button', { name: 'Backups' }).boundingBox();
    const child = await panel(page).getByRole('button', { name: 'Plans' }).boundingBox();
    expect(child!.x).toBeGreaterThan(parent!.x);
  });

  test('the rows have no bullets and no underline', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await expect(page.locator('#tree li').first()).toHaveCSS('list-style-type', 'none');
    await expect(rowOf(page, 'Schedules')).toHaveCSS('text-decoration-line', 'none');
  });

  test('in each theme, the glyph in the slot of the outline arrow shows at each level where the arrow hides', async ({ page, ownSite }) => {
    const run = await ownSite({
      'nerddocs.json': THREE_LEVELS,
      'backups/restore.md': RESTORE_PAGE,
      'backups/script.md': SCRIPT_PAGE,
      'backups/schedules.md': '# Schedules\n\nA plan says how often.',
    });
    const arrow = panel(page).getByRole('button', { name: 'Outline', exact: true });
    /** The glyph in the slot of the current page row, and the glyph that the theme draws there with no arrow. */
    const glyphs = () =>
      page.locator('#tree .lr.on .nochev').evaluate((slot) => {
        const glyph = () => {
          const style = getComputedStyle(slot, '::before');
          return style.display === 'none' ? 'none' : style.content;
        };
        const now = glyph();
        const fold = slot.querySelector('.fold')!;
        fold.remove();
        const bare = glyph();
        slot.append(fold);
        return { now, bare };
      });

    await page.goto(`${run.address}backups/script.html`);
    for (const theme of THEMES) {
      await page.evaluate(([key, id]) => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem(key, id);
      }, [THEME_KEY, theme.id] as const);
      await page.goto(`${run.address}backups/script.html`);
      await hydrated(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
      await expect(arrow, theme.name).toBeHidden();
      const atOverview = await glyphs();
      expect(atOverview.now, theme.name).toBe(atOverview.bare);

      await pressOnSlider(page, 'End');
      await expect(arrow, theme.name).toBeVisible();
      expect((await glyphs()).now, theme.name).toBe('none');

      // The rows of 'Restore a file' show at every level, so its arrow shows at every level.
      await page.goto(`${run.address}backups/restore.html`);
      await expect(arrow, theme.name).toBeVisible();
      expect((await glyphs()).now, theme.name).toBe('none');
    }
  });
});

test.describe('the text', () => {
  test('on a wide window the text column sits in the middle of the free space, with room at each side', async ({ page, site }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto(`${site.address}storage.html`);
    const { free, freeLeft, col, colLeft } = await columns(page);
    expect(col).toBeLessThan(free - 100);
    expect(Math.abs(colLeft - freeLeft - (freeLeft + free - (colLeft + col)))).toBeLessThanOrEqual(1);
  });

  test('on a short page, a link to a heading near the end brings that heading 32 px from the top', async ({ page, site }) => {
    await page.goto(`${site.address}backups/schedules.html#weekly-plan`);
    await expect
      .poll(() => page.locator('#weekly-plan').evaluate((heading) => Math.round(heading.getBoundingClientRect().top)), OFTEN)
      .toBe(32);
  });

  test('a table header with no alignment in the Markdown starts at the left', async ({ page, site }) => {
    await page.goto(`${site.address}restore-checklist.html`);
    await expect(page.locator('th').first()).toHaveCSS('text-align', 'left');
  });

  test('a big image fits the column', async ({ page, site }) => {
    await page.goto(`${site.address}restore-checklist.html`);
    const image = page.getByAltText('Wide window');
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(3000);

    expect((await image.boundingBox())!.width).toBeLessThanOrEqual((await page.locator('#page').boundingBox())!.width);
    expect(await sideways(page, 'main')).toBe(0);
  });

  test('a code block sits in a shaded box, and a quote has a side bar', async ({ page, site }) => {
    await page.goto(`${site.address}restore-checklist.html`);
    await expect(page.locator('.code > pre')).toHaveCSS('background-color', 'rgb(237, 241, 244)');
    await expect(page.locator('blockquote')).toHaveCSS('border-left-width', '3px');
    await expect(page.locator('blockquote')).toHaveCSS('border-left-style', 'solid');
  });

  test('the Footnotes heading is for a screen reader and takes no room on the page', async ({ page, site }) => {
    await page.goto(`${site.address}restore-checklist.html`);
    const box = await page.locator('h2.sr-only').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(1);
    expect(box!.height).toBeLessThanOrEqual(1);
  });
});

test.describe('under 960px wide', () => {
  test.use({ viewport: { width: 800, height: 700 } });

  test('the open contents layer hides the text behind it and covers the menu bar', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Contents', exact: true }).click();

    await expect(panel(page)).toHaveCSS('background-color', 'rgb(246, 248, 250)');
    const layer = Number(await panel(page).evaluate((element) => getComputedStyle(element).zIndex));
    const bar = Number(await page.locator('#bar').evaluate((element) => getComputedStyle(element).zIndex));
    expect(layer).toBeGreaterThan(bar);
  });

  test('the menu button stays at the bottom of the window', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    const box = await page.locator('#bar').boundingBox();
    expect(box!.y + box!.height).toBe(700);
  });

  test('with the panel hidden, only the menu button shows', async ({ page, site }) => {
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Hide contents' }).click();
    await expect(page.getByRole('button', { name: 'Show contents' })).toBeVisible();

    await page.setViewportSize({ width: 800, height: 700 });
    await expect(page.getByRole('button', { name: 'Show contents' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Contents', exact: true })).toBeVisible();
  });
});

test.describe('tables', () => {
  const PHONE_SIZE = { width: 390, height: 844 };
  const WIDE_SIZE = { width: 1440, height: 900 };
  const SCHEDULES = 'backups/schedules.html';
  const settingsTable = (page: Page) => page.locator('#all-plan-settings + .wide');
  const sidewaysOf = (box: Locator) => box.evaluate((element) => element.scrollWidth - element.clientWidth);
  /** The line boxes that the text of an element takes. */
  const linesOf = (cell: Locator) =>
    cell.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });

  async function openSchedules(page: Page, address: string): Promise<void> {
    await page.goto(`${address}${SCHEDULES}`);
    await hydrated(page);
    await page.evaluate(() => document.fonts.ready);
  }

  test('a table of two columns fits the column and never scrolls', async ({ page, site }) => {
    for (const size of [PHONE_SIZE, WIDE_SIZE]) {
      await page.setViewportSize(size);
      await page.goto(`${site.address}restore-checklist.html`);
      await hydrated(page);
      const box = page.locator('#page .wide > .sbox');
      await expect(box, `${size.width} wide`).toHaveCount(1);
      expect(await sidewaysOf(box), `${size.width} wide`).toBe(0);
      await expect(box, `${size.width} wide`).not.toHaveAttribute('role');
    }
  });

  test("at the text width 'full', the 10-column table fits a 1440 px window", async ({ page, schedules }) => {
    await storeWidth(page, 'full');
    await page.setViewportSize(WIDE_SIZE);
    await openSchedules(page, schedules.address);
    const box = settingsTable(page).locator(':scope > .sbox');
    await expect(box).toHaveCount(1);
    await expect.poll(() => sidewaysOf(box), OFTEN).toBeLessThanOrEqual(1);
  });

  test('a short cell stays on one line, a long cell wraps at its spaces, and code in a cell never breaks', async ({ page, schedules }) => {
    await page.setViewportSize(PHONE_SIZE);
    await openSchedules(page, schedules.address);
    const settings = settingsTable(page);
    expect(await linesOf(settings.locator('th', { hasText: 'Copies kept' }))).toBe(1);
    expect(await linesOf(settings.locator('td', { hasText: 'AES-256 with a company key' }))).toBeGreaterThan(1);
    const code = page.locator('#page td code').filter({ hasText: /^PLAN-1$/ });
    expect(await code.evaluate((element) => element.getClientRects().length)).toBe(1);

    const long = settings.locator('td.long').first();
    await expect(long).toHaveCount(1);
    const { minWidth, zeros } = await long.evaluate((cell) => {
      const style = getComputedStyle(cell);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return { minWidth: parseFloat(style.minWidth), zeros: 12 * context.measureText('0').width };
    });
    expect(Math.abs(minWidth - zeros)).toBeLessThanOrEqual(1);
  });

  for (const theme of THEMES) {
    test(`in '${theme.name}', a wide table stays inside the text column on a phone and on a wide window`, async ({ page, schedules }) => {
      await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, theme.id] as const);
      for (const size of [PHONE_SIZE, WIDE_SIZE]) {
        await page.setViewportSize(size);
        await openSchedules(page, schedules.address);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
        const outside = await page.evaluate(() => {
          const column = document.getElementById('page')!.getBoundingClientRect();
          return [...document.querySelectorAll('#page .wide')]
            .map((wide) => wide.getBoundingClientRect())
            .filter((box) => box.left < column.left - 0.5 || box.right > column.right + 0.5).length;
        });
        expect(outside, `${size.width} wide`).toBe(0);
        expect(await sideways(page, 'main'), `${size.width} wide`).toBe(0);
        if (size === PHONE_SIZE) {
          const box = settingsTable(page).locator(':scope > .sbox');
          await expect(box).toHaveCount(1);
          expect(await sidewaysOf(box)).toBeGreaterThan(1);
        }
      }
    });
  }

  test('while a part shows its tint, its pinned cells and fade let the tint through', async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'backups/settings.md': SETTINGS_PAGE });
    await page.setViewportSize(PHONE_SIZE);
    await openOnStoppedClock(page, `${run.address}backups/settings.html`);
    await pressOnSlider(page, 'ArrowRight');
    await page.clock.runFor(MOVE_MS);

    const part = page.locator('#page .part[data-l="requirements internals"]');
    const wide = part.locator('.wide');
    const firstHeader = wide.locator('th').first();
    const fade = () => wide.evaluate((element) => getComputedStyle(element, '::after').opacity);
    await expect(part).toHaveClass(/\bflash\b/);
    await expect(wide).toHaveAttribute('data-pin', '');
    await expect(wide).toHaveAttribute('data-more', 'right');
    await expect(firstHeader).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect(await fade()).toBe('0');

    await page.clock.runFor(SIGNALS_MS);
    await expect(part).not.toHaveClass(/\bflash\b/);
    await expect(firstHeader).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect(await fade()).toBe('1');
  });
});

test.describe('images', () => {
  for (const theme of THEMES) {
    test(`in '${theme.name}', a block image and a problem box stay inside the text column on a phone and on a wide window`, async ({ page, images }) => {
      await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, theme.id] as const);
      for (const size of [
        { width: 390, height: 844 },
        { width: 1440, height: 900 },
      ]) {
        const at = `${size.width} wide`;
        await page.setViewportSize(size);
        await page.goto(`${images.address}restore.html`);
        await hydrated(page);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
        const image = page.locator('#page img[data-full]');
        const box = page.locator('#page .problem');
        await expect(image, at).toHaveCount(1);
        await expect(box, at).toHaveCount(1);
        const outside = await page.evaluate(() => {
          const column = document.getElementById('page')!.getBoundingClientRect();
          return [...document.querySelectorAll('#page img, #page .problem')]
            .map((element) => element.getBoundingClientRect())
            .filter((rect) => rect.left < column.left - 0.5 || rect.right > column.right + 0.5).length;
        });
        expect(outside, at).toBe(0);
        expect(await sideways(page, 'main'), at).toBe(0);
        await expect(image, at).toHaveCSS('cursor', 'zoom-in');
        await expect(image, at).toHaveCSS('border-top-width', '1px');
        await expect(box, at).toHaveCSS('border-top-style', 'dashed');
      }
    });
  }

  test('in every theme, the line of a problem box is code at 0.86 of the size of its text, with no padding and no background', async ({ page, images }) => {
    const found: Record<string, string> = {};
    for (const theme of THEMES) {
      const stored = await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, theme.id] as const);
      await page.goto(`${images.address}restore.html`);
      await stored.dispose();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
      found[theme.name] = await page.locator('#page .problem code').evaluate((code) => {
        const own = getComputedStyle(code);
        const text = parseFloat(getComputedStyle(code.parentElement!).fontSize);
        return [
          `size ${(parseFloat(own.fontSize) / text).toFixed(3)}`,
          `padding ${own.padding}`,
          `background ${own.backgroundColor}`,
        ].join(', ');
      });
    }
    const wanted = 'size 0.860, padding 0px, background rgba(0, 0, 0, 0)';
    expect(found).toEqual(Object.fromEntries(THEMES.map((theme) => [theme.name, wanted])));
  });
});

test.describe('code blocks', () => {
  const SCRIPT = 'backups/restore-by-script.html';

  for (const theme of THEMES) {
    test(`in '${theme.name}', in both looks, code tokens take the syntax colors, comments take the soft color, and the copy square takes the background of the code`, async ({ page, code }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${code.address}${SCRIPT}`);
      for (const mode of ['light', 'dark'] as const) {
        const look = `${theme.name} ${mode}`;
        await page.evaluate(
          ([themeKey, id, modeKey, setting]) => {
            localStorage.setItem(themeKey, id);
            localStorage.setItem(modeKey, setting);
          },
          [THEME_KEY, theme.id, MODE_KEY, mode] as const,
        );
        await page.reload();
        await expect(page.locator('html'), look).toHaveAttribute('data-theme', theme.id);
        await expect(page.locator('html'), look).toHaveAttribute('data-mode', mode);

        await expect(page.locator('#page pre .k').first(), look).toHaveCSS('color', rgbOf(theme[mode].syntax.keyword));
        await expect(page.locator('#page pre .c').first(), look).toHaveCSS('color', rgbOf(theme[mode].soft));
        const copy = page.locator('#page .copy').first();
        await expect(copy, look).toHaveCSS('color', rgbOf(theme[mode].soft));
        /** 'same' when the copy square has the background of its pre, or of the column behind a pre with none. */
        const square = () =>
          copy.evaluate((button) => {
            const pre = getComputedStyle(button.closest('.code')!.querySelector(':scope > pre')!).backgroundColor;
            const column = getComputedStyle(document.querySelector('.col')!).backgroundColor;
            const want = pre === 'rgba(0, 0, 0, 0)' ? column : pre;
            const have = getComputedStyle(button).backgroundColor;
            return have === want ? 'same' : `${have} on ${want}`;
          });
        await expect.poll(square, { ...OFTEN, message: look }).toBe('same');
        await expect(page.locator('#page code').first(), look).toHaveCSS('font-variant-ligatures', 'none');
        const outside = await page.evaluate(() => {
          const column = document.getElementById('page')!.getBoundingClientRect();
          return [...document.querySelectorAll('#page .code')]
            .filter((block) => block.getClientRects().length > 0)
            .map((block) => block.getBoundingClientRect())
            .filter((box) => box.left < column.left - 0.5 || box.right > column.right + 0.5).length;
        });
        expect(outside, look).toBe(0);
      }
    });
  }

  test("in 'I'm in' at 1440 px, the copy icon of a one-line code block sits level with the line", async ({ page, code }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${code.address}${SCRIPT}`);
    await page.evaluate(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, 'im-in'] as const);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'im-in');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    for (const text of [JOB_JSON, LONG_SH, 'some text in a language that does not ship']) {
      const block = page.locator('#page .code').filter({ hasText: text });
      await expect(block).toHaveCount(1);
      const centers = await block.evaluate((element) => {
        const icon = element.querySelector('.copy')!.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element.querySelector(':scope > pre > code')!);
        const line = range.getBoundingClientRect();
        return { icon: icon.top + icon.height / 2, line: line.top + line.height / 2 };
      });
      expect(Math.abs(centers.icon - centers.line), `${text}: the icon at ${centers.icon}, the line at ${centers.line}`).toBeLessThanOrEqual(2);
    }
  });

  test.describe('on a phone', () => {
    test.use({ hasTouch: true });

    test('a long code block stays in the text column and scrolls sideways under a fade, and the copy icon stays at its top right with a 44 px hit area', async ({ page, code }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${code.address}${SCRIPT}`);
      await hydrated(page);
      const block = page.locator('#page .code').filter({ hasText: LONG_SH });
      const pre = block.locator(':scope > pre');
      const copy = block.locator('.copy');
      await expect(block).toHaveCount(1);

      const inColumn = await block.evaluate((element) => {
        const column = document.getElementById('page')!.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return box.left >= column.left - 0.5 && box.right <= column.right + 0.5;
      });
      expect(inColumn).toBe(true);
      expect(await sideways(page, 'main')).toBe(0);
      expect(await pre.evaluate((box) => box.scrollWidth - box.clientWidth)).toBeGreaterThan(1);
      await expect(pre).toHaveCSS('white-space', 'pre');
      await expect(pre).toHaveCSS('overscroll-behavior-x', 'contain');
      const lines = await pre.locator('code').evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(element).lineHeight),
      }));
      expect(Math.abs(lines.height - lines.line), `${lines.height} for a line of ${lines.line}`).toBeLessThanOrEqual(1);

      await expect(block).toHaveAttribute('data-more', 'right');
      const after = (property: string) => block.evaluate((element, name) => getComputedStyle(element, '::after').getPropertyValue(name), property);
      expect(await after('content')).toBe('""');
      expect(await after('width')).toBe('40px');

      const corner = async () => {
        const [button, box] = [(await copy.boundingBox())!, (await block.boundingBox())!];
        return { width: button.width, top: button.y - box.y, right: box.x + box.width - (button.x + button.width), x: button.x, y: button.y };
      };
      const start = await corner();
      expect(Math.abs(start.width - 28), `${start.width}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(start.top - 6), `${start.top}`).toBeLessThanOrEqual(1);
      expect(Math.abs(start.right - 6), `${start.right}`).toBeLessThanOrEqual(1);

      await pre.evaluate((box) => {
        box.scrollLeft = 100;
      });
      await expect(block).toHaveAttribute('data-more', 'left right');
      const scrolled = await corner();
      for (const side of ['width', 'x', 'y'] as const) {
        expect(Math.abs(scrolled[side] - start[side]), `${side}: ${start[side]} then ${scrolled[side]}`).toBeLessThanOrEqual(0.5);
      }
      expect(await copy.evaluate((button) => getComputedStyle(button, '::before').width)).toBe('44px');
    });
  });
});
