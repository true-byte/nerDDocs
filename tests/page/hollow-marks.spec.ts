import { expect, type Page } from '@playwright/test';
import {
  alphaOf,
  computedColor,
  iconsOf,
  openAuthorLive,
  openAuthorLiveOnStoppedClock,
  recordSaveStages,
  runUntil,
  runUntilStage,
  settled,
  shownIcons,
} from '../support/author.ts';
import { saveAtOnce } from '../support/folder.ts';
import { expectLevel, levelsFile, MOVE_MS, pressOnSlider, scrollPage, THREE_LEVELS } from '../support/levels.ts';
import { hydrated, openLive, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import type { RunningCommand } from '../support/run-command.ts';

const steps = (name: string, count: number) => Array.from({ length: count }, (_, n) => `${name} ${n} of the restore.`).join('\n\n');

/**
 * The 'Restore a file' page. At 'Overview', the part 'The app shows each day with a copy.' has the icons of
 * 'Requirements' and 'Internals' under its marks, and the gap between 'A restore never changes the copy.' and 'Keep the
 * restored file.' has the icon of 'Internals'.
 */
const RESTORE = `# Restore a file

${steps('Step', 20)}

<details><summary>Restore steps</summary>

Pick a day.

</details>

Pick a file and a day.

::: overview
The app shows each day with a copy.
::: requirements
The app keeps a copy for 30 days.
::: internals
The agent asks the server for the copy list.
:::

A restore never changes the copy.

::: internals
The server pins the blocks of the copy.
:::

Keep the restored file.

${steps('Note', 30)}
`;

const FILES = {
  'nerddocs.json': THREE_LEVELS,
  'restore.md': RESTORE,
  'storage.md': `# Storage\n\n${steps('Block', 10)}\n`,
};

/** Each test has a command of its own, since a test may save. */
const test = pageTest.extend<{ run: RunningCommand }>({
  run: async ({ ownSite }, use) => {
    await use(await ownSite(FILES));
  },
});

/** The block of `#page` whose text starts with this text. */
const block = (page: Page, text: string) => page.locator('#page > *').filter({ hasText: text }).first();

/** The center of the mark strip, and the bottom of the last icon of the marks, of the part that holds the text. */
const marksOf = (page: Page, text: string) =>
  block(page, text).evaluate((part) => {
    const marks = part.querySelector(':scope > .marks')!;
    const strip = marks.getBoundingClientRect();
    const last = marks.lastElementChild!;
    return {
      x: strip.left + strip.width / 2,
      iconBottom: last.querySelector('svg')!.getBoundingClientRect().bottom,
      markBottom: last.getBoundingClientRect().bottom,
      /** The bottom of the last icon of the marks in the page, apart from the scroll. */
      inPage: last.getBoundingClientRect().bottom + scrollY,
    };
  });

const rectOf = (page: Page, text: string) =>
  block(page, text).evaluate((el) => {
    const { top, bottom } = el.getBoundingClientRect();
    return { top, bottom };
  });

/** Opens the page in the author browser and scrolls the part with the icons to the middle of the window. */
async function openAuthorAtParts(page: Page, run: RunningCommand): Promise<void> {
  await openAuthorLive(page, run, 'restore.html');
  await hydrated(page);
  await scrollToParts(page);
}

async function scrollToParts(page: Page): Promise<void> {
  const top = await block(page, 'The app shows each day').evaluate((el) => el.getBoundingClientRect().top + scrollY);
  await scrollPage(page, top - 300);
}

const expectIcons = (page: Page, levels: string[]) =>
  expect.poll(async () => (await shownIcons(page)).map((icon) => icon.level), OFTEN).toEqual(levels);

test('each icon is a dashed 16px circle in the color of its level, in a layer outside the text, and hover and focus fill it', async ({ page, run }) => {
  await openAuthorAtParts(page, run);
  await expectIcons(page, ['requirements', 'internals', 'internals']);

  const icon = iconsOf(page, 'requirements');
  await expect(icon).toHaveAttribute('aria-label', 'Requirements');
  await expect(icon).toHaveAttribute('title', 'Requirements');
  await expect(icon).toHaveAttribute('tabindex', '-1');
  expect(await icon.evaluate((button) => ({ inPage: !!button.closest('#page'), inLayer: !!button.closest('#hollow') }))).toEqual({
    inPage: false,
    inLayer: true,
  });
  const look = () =>
    icon.evaluate((button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      const svg = button.querySelector('svg')!.getBoundingClientRect();
      return {
        size: [box.width, box.height],
        svg: [svg.width, svg.height],
        radius: style.borderTopLeftRadius,
        border: [style.borderTopStyle, style.borderTopColor],
        // Chromium draws a border in whole pixels, so the width that the rules of the icon give is the one to check.
        width: [...document.styleSheets]
          .flatMap(function inner(holder: { cssRules: CSSRuleList }): CSSRule[] {
            return [...holder.cssRules].flatMap((rule) => ['cssRules' in rule ? inner(rule as CSSGroupingRule) : [], rule].flat());
          })
          .filter(
            (rule): rule is CSSStyleRule =>
              rule instanceof CSSStyleRule && rule.selectorText.includes('.hollow') && button.matches(rule.selectorText),
          )
          // A shorthand with var() in it leaves its longhands empty.
          .map((rule) => rule.style.borderTopWidth || /(?:^|\s)([\d.]+px)(?:\s|$)/.exec(rule.style.border)?.[1])
          .filter(Boolean)
          .at(-1),
        opacity: style.opacity,
        fill: style.backgroundColor,
      };
    });
  const color = await computedColor(page, 'var(--l1)');
  const still = await look();
  expect(still.size).toEqual([16, 16]);
  expect(still.svg).toEqual([10, 10]);
  expect(['50%', '8px']).toContain(still.radius);
  expect(still.border).toEqual(['dashed', color]);
  expect(still.width).toBe('1.5px');
  expect(still.opacity).toBe('0.55');
  expect(alphaOf(still.fill)).toBe(0);
  expect((await iconsOf(page, 'internals').first().evaluate((button) => getComputedStyle(button).borderTopColor))).toBe(
    await computedColor(page, 'var(--l2)'),
  );

  // A key press first, so that a focus by script shows as a focus from the keyboard.
  const focus = async () => {
    await page.keyboard.press('Shift');
    await icon.focus();
  };
  for (const reach of [() => icon.hover(), focus]) {
    await reach();
    await expect.poll(async () => (await look()).opacity, OFTEN).toBe('1');
    const lit = await look();
    expect(lit.border[0]).toBe('solid');
    expect(alphaOf(lit.fill)).toBeCloseTo(0.14, 2);
    await page.mouse.move(0, 0);
    await icon.evaluate((button) => button.blur());
    await expect.poll(async () => (await look()).opacity, OFTEN).toBe('0.55');
  }
});

test('each icon takes clicks 12px around its center', async ({ page, run }) => {
  await openAuthorAtParts(page, run);
  await expectIcons(page, ['requirements', 'internals', 'internals']);
  const hits = await iconsOf(page, 'requirements').evaluate((button) => {
    const { left, top, width, height } = button.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const hit = (dx: number, dy: number) => button.contains(document.elementFromPoint(x + dx, y + dy));
    return { inside: [hit(-11, 0), hit(11, 0), hit(0, -11)], outside: [hit(-14, 0), hit(14, 0)] };
  });
  expect(hits).toEqual({ inside: [true, true, true], outside: [false, false] });
});

test('the icons of a part sit centered in its mark strip from 3px below its last level icon, 19px apart, and the icons of a gap sit halfway between the blocks around it', async ({
  page,
  run,
}) => {
  await openAuthorAtParts(page, run);
  await expectIcons(page, ['requirements', 'internals', 'internals']);
  const [requirements, internals, gap] = await shownIcons(page);
  const marks = await marksOf(page, 'The app shows each day');

  expect(Math.abs(requirements!.x - marks.x)).toBeLessThan(1);
  expect(Math.abs(internals!.x - marks.x)).toBeLessThan(1);
  expect(requirements!.top).toBeGreaterThanOrEqual(marks.iconBottom + 3 - 1);
  expect(requirements!.top).toBeLessThanOrEqual(marks.markBottom + 3 + 1);
  expect(internals!.top - requirements!.top).toBeCloseTo(19, 0);

  const above = await rectOf(page, 'A restore never changes');
  const below = await rectOf(page, 'Keep the restored file.');
  const middle = (above.bottom + below.top) / 2;
  expect(Math.abs(gap!.x - marks.x)).toBeLessThan(1);
  expect(gap!.top).toBeGreaterThanOrEqual(middle - 10);
  expect(gap!.top).toBeLessThanOrEqual(middle + 1);
});

test('a click on an icon moves to its level and puts the first part of the spot at that level where the icon was', async ({ page, run }) => {
  await openAuthorAtParts(page, run);
  await expectIcons(page, ['requirements', 'internals', 'internals']);
  const { x, y, top } = (await shownIcons(page))[1]!;

  await page.mouse.click(x, y);

  await expectLevel(page, 'internals');
  await expect.poll(async () => Math.abs((await rectOf(page, 'The agent asks the server')).top - top) <= 8, OFTEN).toBe(true);
});

test('a click on the icon of a gap puts the part of the gap where the icon was', async ({ page, run }) => {
  await openAuthorAtParts(page, run);
  await expectIcons(page, ['requirements', 'internals', 'internals']);
  const { x, y, top } = (await shownIcons(page))[2]!;

  await page.mouse.click(x, y);

  await expectLevel(page, 'internals');
  await expect.poll(async () => Math.abs((await rectOf(page, 'The server pins the blocks')).top - top) <= 8, OFTEN).toBe(true);
});

test('the icons hide while a level change runs, and come back for the new level when it ends', async ({ page, run }) => {
  await openAuthorLiveOnStoppedClock(page, run, 'restore.html');
  await scrollToParts(page);
  await runUntil(page, async () => (await shownIcons(page)).length === 3, 50);

  await pressOnSlider(page, '2');

  expect(await shownIcons(page)).toEqual([]);
  await page.clock.runFor(MOVE_MS);
  await expectLevel(page, 'requirements');
  await runUntil(page, async () => (await shownIcons(page)).length === 3, 50);
  expect((await shownIcons(page)).map((icon) => icon.level)).toEqual(['overview', 'internals', 'internals']);
  const [overview] = await shownIcons(page);
  const marks = await marksOf(page, 'The app keeps a copy');
  expect(Math.abs(overview!.x - marks.x)).toBeLessThan(1);
});

test('the icons hide while a save show runs, and a save that adds a spot adds its icon', async ({ page, run }) => {
  await recordSaveStages(page);
  await openAuthorLiveOnStoppedClock(page, run, 'restore.html');
  await scrollToParts(page);
  await runUntil(page, async () => (await shownIcons(page)).length === 3, 50);

  await saveAtOnce(
    run.folder,
    'restore.md',
    RESTORE.replace('Keep the restored file.\n', 'Keep the restored file.\n\n::: overview\nThe app keeps the copy list.\n::: internals\nThe server keeps the copy list.\n:::\n'),
  );

  await runUntilStage(page, 'hold');
  expect(await shownIcons(page)).toEqual([]);
  await runUntilStage(page, null, 100);
  await runUntil(page, async () => (await shownIcons(page)).length === 4, 50);
  expect((await shownIcons(page)).map((icon) => icon.level)).toEqual(['requirements', 'internals', 'internals', 'internals']);
});

test('the icons follow their parts when the window changes size and when the page grows', async ({ page, run }) => {
  await openAuthorAtParts(page, run);
  await expectIcons(page, ['requirements', 'internals', 'internals']);
  const wide = await marksOf(page, 'The app shows each day');

  await page.setViewportSize({ width: 1100, height: 720 });
  await expect.poll(async () => (await marksOf(page, 'The app shows each day')).x, OFTEN).not.toBe(wide.x);
  await expect
    .poll(async () => {
      const [icon] = await shownIcons(page);
      const marks = await marksOf(page, 'The app shows each day');
      return !!icon && Math.abs(icon.x - marks.x) < 1 && Math.abs(icon.top - (marks.markBottom + 3)) < 6;
    }, OFTEN)
    .toBe(true);

  const before = (await marksOf(page, 'The app shows each day')).inPage;
  await page.getByText('Restore steps', { exact: true }).click();
  await expect(page.getByText('Pick a day.', { exact: true })).toBeVisible();
  expect((await marksOf(page, 'The app shows each day')).inPage).toBeGreaterThan(before + 10);
  await expect
    .poll(async () => {
      const [icon] = await shownIcons(page);
      const marks = await marksOf(page, 'The app shows each day');
      return !!icon && Math.abs(icon.top - (marks.markBottom + 3)) < 6;
    }, OFTEN)
    .toBe(true);
});

test('the icons hide with the panel, and come back with it', async ({ page, run }) => {
  await openAuthorAtParts(page, run);
  await expectIcons(page, ['requirements', 'internals', 'internals']);

  await page.getByRole('button', { name: 'Hide panel' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-slider', 'off');
  await expectIcons(page, []);

  await page.getByRole('button', { name: 'Show panel' }).click();
  await expectIcons(page, ['requirements', 'internals', 'internals']);
});

test('a page with no parts has no icons', async ({ page, run }) => {
  await openAuthorAtParts(page, run);
  await expectIcons(page, ['requirements', 'internals', 'internals']);

  await openLive(page, `${run.address}storage.html`);
  await hydrated(page);
  await settled(page);
  expect(await shownIcons(page)).toEqual([]);
});

test('a site with one level has no icons', async ({ page, ownSite }) => {
  const run = await ownSite({
    'nerddocs.json': levelsFile('overview'),
    'restore.md': '# Restore a file\n\nPick a file.\n\n::: overview\nThe app shows each day with a copy.\n:::\n\nKeep the file.\n',
  });
  await openAuthorLive(page, run, 'restore.html');
  await hydrated(page);
  await settled(page);
  expect(await shownIcons(page)).toEqual([]);
});

test('a reader browser shows no icons, also after a level change', async ({ page, run, browser }) => {
  const author = await browser.newPage();
  try {
    await openAuthorAtParts(author, run);
    await expectIcons(author, ['requirements', 'internals', 'internals']);
  } finally {
    await author.close();
  }

  await openLive(page, `${run.address}restore.html`);
  await hydrated(page);
  await scrollToParts(page);
  await settled(page);
  await expect(page.locator('#hollow button.hollow')).toHaveCount(0);
  await pressOnSlider(page, '2');
  await expectLevel(page, 'requirements');
  await expect(page.locator('#page')).not.toHaveAttribute('style', /padding-bottom/);
  await settled(page);
  await expect(page.locator('#hollow button.hollow')).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('each icon keeps its size', async ({ page, run }) => {
    await openAuthorAtParts(page, run);
    await expectIcons(page, ['requirements', 'internals', 'internals']);
    const sizes = await page.locator('#hollow button.hollow').evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        const svg = button.querySelector('svg')!.getBoundingClientRect();
        return [box.width, box.height, svg.width, svg.height];
      }),
    );
    expect(sizes).toEqual([
      [16, 16, 10, 10],
      [16, 16, 10, 10],
      [16, 16, 10, 10],
    ]);
  });
});
