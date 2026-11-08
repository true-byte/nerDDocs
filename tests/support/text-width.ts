import { expect, type Page } from '@playwright/test';
import { OUTLINE_KEY } from '../../src/page/panel-state.ts';
import { CHAR_KEY, CHAR_SAMPLE, WIDTH_KEY } from '../../src/page/text-width.ts';
import { OFTEN } from './poll.ts';

/** Long paragraphs of plain English, each one text with no markup, so a test can count the characters of each line. */
export const PROSE = [
  'The backup app keeps a copy of every file that you choose, and it keeps older copies for as long as your plan says. When you open the restore window, the app shows the folders of the computer as they were on the day that you pick. You can move back one day at a time, or you can type a date in the box at the top of the window. Each file in the list shows its size, the time of its last change and the name of the computer that sent it. A file that was deleted shows in grey, so you can tell at a glance which files are still on the disk.',
  'A restore never changes the copy in storage. The app reads the blocks of each file, checks them against the list of blocks that it wrote on the day of the backup, and writes a new file next to the old one. If the old file is still there, the app keeps it and adds the date to the name of the new file, so nothing is lost by mistake. When a block fails its check, the app reads it again from the second copy in storage. Only when both copies fail does the restore stop, and then the window names the file and the block that could not be read.',
  'Schedules decide how often the app looks for changes. The default plan runs every hour while the computer is awake, and it waits for the computer to be idle before it starts. A laptop on battery power waits until it is plugged in again, unless you change that rule in the settings. You can add a second plan for a folder that changes often, such as the folder where you keep your notes, and run it every ten minutes. Each run sends only the blocks that changed since the last run, so a short run takes little time and little space.',
  'Storage holds each block once, even when many files share it. Two copies of the same photo in different folders take the space of one photo, and a long report that changed by one page takes the space of that page. The app counts the space that each computer uses and shows the total on the first page of the settings. When the total comes close to the limit of your plan, the app sends a note to the owner of the account, and it starts to remove the oldest copies that the plan no longer needs to keep.',
  'Agents run on each computer that sends files to storage. An agent starts with the computer, watches the folders in its list and sends its changes on the schedule of its plan. It keeps a small log of what it did, which the support team can read when something goes wrong. When you install an agent on a new computer, it asks for the name of the account and a code from the settings page. The code works once and only for one hour, so a lost code cannot be used to add a stranger to your account.',
  'Keys protect the files in storage. Each account has its own key, and the agent uses it to lock every block before the block leaves the computer. The key never travels with the blocks, so a person who reads the storage sees only noise. If you choose to keep the key yourself, the app asks you to write it down or print it, and it cannot help you if the key is lost. Most teams let the app keep the key in a safe store and give each person a password of their own, so a person who leaves the team loses access at once.',
];

/** A page of the prose, with a title. */
export const prosePage = (title: string, repeat = 1) =>
  `# ${title}\n\n${Array.from({ length: repeat }, (_, round) => `## Part ${round + 1}\n\n${PROSE.join('\n\n')}`).join('\n\n')}\n`;

/**
 * Paragraphs of about 80 characters. A line of 75 characters, the default, wraps each one into two lines, and a line
 * a few characters longer holds each one in a line. A small change of the character width then moves every line.
 */
export const SHORT_PARAGRAPHS = [
  'A plan keeps a copy of each file that you choose, for as long as your plan says.',
  'The agent sends only the blocks that changed since the last run of its schedule.',
  'A restore writes a new file next to the old one, so nothing is lost by mistake.',
  'Each account has its own key, and the key never travels with the blocks it locks.',
];

/** A long page of the short paragraphs, with a title. */
export const shortParagraphsPage = (title: string) =>
  `# ${title}\n\n${Array.from({ length: 10 }, () => SHORT_PARAGRAPHS.join('\n\n')).join('\n\n')}\n`;

export const widthButton = (page: Page) => page.locator('#widthB');
export const widthMenu = (page: Page) => page.locator('#width-menu');
export const menuItem = (page: Page, name: 'Show ruler' | 'Restore default') =>
  widthMenu(page).getByRole('menuitem', { name, exact: true });
export const ruler = (page: Page) => page.locator('#ruler');
/** The right handle of the ruler. */
export const widthSlider = (page: Page) => ruler(page).getByRole('slider', { name: 'Text width', exact: true });
/** The left handle of the ruler, which has no role of its own. */
export const leftHandle = (page: Page) => ruler(page).locator('.rh:not([role])');
export const rulerNumber = (page: Page) => page.locator('#ruler-num');
export const restoreButton = (page: Page) => ruler(page).getByRole('button', { name: 'Restore', exact: true });
export const applyButton = (page: Page) => ruler(page).getByRole('button', { name: 'Apply', exact: true });

/** Where the free space, the column and the text of the column are, in px. */
export interface Columns {
  /** The width of the content box of `main`. */
  free: number;
  freeLeft: number;
  col: number;
  colLeft: number;
  /** The width of the content box of `.col`, which holds the lines. */
  text: number;
  textLeft: number;
  textRight: number;
}

export function columns(page: Page): Promise<Columns> {
  return page.evaluate(() => {
    const px = (value: string) => parseFloat(value) || 0;
    const main = document.querySelector('main')!;
    const col = document.querySelector('.col')!;
    const ms = getComputedStyle(main);
    const cs = getComputedStyle(col);
    const m = main.getBoundingClientRect();
    const c = col.getBoundingClientRect();
    const textLeft = c.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
    const text = c.width - px(cs.borderLeftWidth) - px(cs.paddingLeft) - px(cs.paddingRight) - px(cs.borderRightWidth);
    return {
      free: m.width - px(ms.borderLeftWidth) - px(ms.paddingLeft) - px(ms.paddingRight) - px(ms.borderRightWidth),
      freeLeft: m.left + px(ms.borderLeftWidth) + px(ms.paddingLeft),
      col: c.width,
      colLeft: c.left,
      text,
      textLeft,
      textRight: textLeft + text,
    };
  });
}

export const textWidth = async (page: Page) => (await columns(page)).text;
export const colWidth = async (page: Page) => (await columns(page)).col;

/** Waits until the width of `.col` is the given width, to a px. */
export async function expectColWidth(page: Page, width: number, because = `a column of ${width} px`): Promise<void> {
  await expect.poll(async () => Math.abs((await colWidth(page)) - width), { ...OFTEN, message: because }).toBeLessThanOrEqual(1);
}

/** Waits until the text of `.col` is the given width, to a px or to the given tolerance. */
export async function expectTextWidth(page: Page, width: number, because = `text of ${width} px`, within = 1): Promise<void> {
  await expect.poll(async () => Math.abs((await textWidth(page)) - width), { ...OFTEN, message: because }).toBeLessThanOrEqual(within);
}

/** Waits until `.col` fills the free space of `main`. */
export async function expectFull(page: Page, because = 'the column fills the free space'): Promise<void> {
  await expect
    .poll(async () => {
      const { free, col } = await columns(page);
      return Math.abs(free - col);
    }, { ...OFTEN, message: because })
    .toBeLessThanOrEqual(1);
}

/** The number of characters of each full line of each paragraph of the text: every line but the last of each. */
export function fullLines(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const counts: number[] = [];
    for (const paragraph of document.querySelectorAll('#page p')) {
      const node = paragraph.firstChild;
      if (paragraph.childNodes.length !== 1 || !(node instanceof Text)) continue;
      const range = document.createRange();
      const lines: string[] = [];
      let start = 0;
      let top: number | null = null;
      for (let at = 0; at < node.length; at++) {
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        const box = range.getClientRects()[0];
        if (!box || !box.height) continue;
        if (top === null) top = box.top;
        else if (box.top > top + box.height / 2) {
          lines.push(node.data.slice(start, at));
          start = at;
          top = box.top;
        }
      }
      counts.push(...lines.map((line) => line.trim().length));
    }
    return counts;
  });
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Waits until the full lines of the text hold from `low` to `high` characters at the median, and none holds more than `most`. */
export async function expectCharsALine(page: Page, low: number, high: number, most = Infinity, because = ''): Promise<void> {
  await expect(async () => {
    const lines = await fullLines(page);
    const shown = `${because} lines: ${lines.join(' ')}`;
    expect(lines.length, shown).toBeGreaterThanOrEqual(20);
    expect(median(lines), shown).toBeGreaterThanOrEqual(low);
    expect(median(lines), shown).toBeLessThanOrEqual(high);
    expect(Math.max(...lines), shown).toBeLessThanOrEqual(most);
  }).toPass({ intervals: [20], timeout: 15_000 });
}

/** Opens the 'Text width' menu and picks 'Show ruler'. */
export async function showRuler(page: Page): Promise<void> {
  await widthButton(page).click();
  await expect(widthMenu(page)).toBeVisible();
  await menuItem(page, 'Show ruler').click();
  await expect(ruler(page)).toBeVisible();
}

/** Presses a key on the right handle of the ruler. */
export async function pressOnWidth(page: Page, key: string, times = 1): Promise<void> {
  await widthSlider(page).focus();
  for (let press = 0; press < times; press++) await page.keyboard.press(key);
}

/** Sets a width with the ruler, as a reader does, and closes the ruler with 'Apply'. */
export async function setWidthByKeys(page: Page, key: string, times: number, shown: string): Promise<void> {
  await showRuler(page);
  await pressOnWidth(page, key, times);
  await expect(rulerNumber(page)).toHaveText(shown);
  await applyButton(page).click();
  await expect(ruler(page)).toBeHidden();
}

/** The value that the page stores for the reader's width. */
export const storedWidthOf = (page: Page) => page.evaluate((key) => localStorage.getItem(key), WIDTH_KEY);

/** Stores a reader's width before each page of the test loads. */
export const storeWidth = (page: Page, width: string) =>
  page.addInitScript(([key, value]) => localStorage.setItem(key, value), [WIDTH_KEY, width] as const);

/** Stores the outline column hidden for the pages of the test, so the text takes the space of a window with no column. */
export const storeOutlineHidden = (page: Page) => page.addInitScript((key) => localStorage.setItem(key, 'off'), OUTLINE_KEY);

/** The character widths that the page stores, by theme id. */
export const storedCharWidths = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>, CHAR_KEY);

/**
 * Waits until the page has settled its text width: no font loads, and the page shows and stores the character width
 * that the body font of the theme that shows renders now, as the page measures it.
 */
export async function expectCharWidthSettled(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ([key, sample]) => {
            if (document.fonts.status !== 'loaded') return 'a font loads';
            const probe = document.createElement('p');
            probe.style.cssText = 'position:absolute;left:0;top:0;width:max-content;margin:0;padding:0;white-space:nowrap;visibility:hidden';
            probe.textContent = sample;
            document.getElementById('page')!.append(probe);
            const size = parseFloat(getComputedStyle(probe).fontSize);
            const rendered = Math.round((probe.getBoundingClientRect().width / sample.length / size) * 10000) / 10000;
            probe.remove();
            const root = document.documentElement;
            const theme = root.getAttribute('data-theme')!;
            const stored: unknown = (JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>)[theme];
            const shown = parseFloat(getComputedStyle(root).getPropertyValue('--char-w'));
            if (typeof stored !== 'number' || Math.abs(stored - rendered) > 0.0005) return `${rendered} em renders, ${String(stored)} em stored`;
            return Math.abs(shown - stored) <= 0.0005 ? 'settled' : `${shown} em shows, ${stored} em stored`;
          },
          [CHAR_KEY, CHAR_SAMPLE] as const,
        ),
      { ...OFTEN, message: 'the page shows and stores the character width of the font' },
    )
    .toBe('settled');
}

/** The share of the window height of the line that a width change holds in place. */
export const LINE_AT = 0.3;

/**
 * Takes a Range of one character of text on the line 30% down the window, keeps it in the page, and gives the
 * offset of its top from that line. Where the line falls between two lines of text, the page first scrolls a little.
 */
export async function markLine(page: Page): Promise<number> {
  for (let tries = 0; tries < 40; tries++) {
    const offset = await page.evaluate((share) => {
      const line = innerHeight * share;
      const col = document.querySelector('.col')!;
      const style = getComputedStyle(col);
      const x = col.getBoundingClientRect().left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + 12;
      const caret = document.caretPositionFromPoint(x, line);
      const node = caret?.offsetNode;
      if (!caret || !(node instanceof Text) || !document.querySelector('#page')!.contains(node)) return null;
      if (caret.offset >= node.length || !node.data[caret.offset]!.trim()) return null;
      const range = document.createRange();
      range.setStart(node, caret.offset);
      range.setEnd(node, caret.offset + 1);
      const box = range.getBoundingClientRect();
      if (box.top > line || box.bottom <= line) return null;
      (window as unknown as { heldRange: Range }).heldRange = range;
      return box.top - line;
    }, LINE_AT);
    if (offset !== null) return offset;
    await scrollBy(page, 7);
  }
  throw new Error('No text on the line 30% down the window.');
}

/**
 * Takes a Range of one character of text on the line 30% down the window, or on a line near it, with no scroll, keeps
 * it in the page as `markLine` does, and gives the offset of its top from that line.
 */
export async function markNearLine(page: Page): Promise<number> {
  const offset = await page.evaluate((share) => {
    const line = innerHeight * share;
    const col = document.querySelector('.col')!;
    const style = getComputedStyle(col);
    const x = col.getBoundingClientRect().left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + 12;
    for (let at = 0; at < 12; at++) {
      const caret = document.caretPositionFromPoint(x, line + (at % 2 ? 1 : -1) * Math.ceil(at / 2) * 7);
      const node = caret?.offsetNode;
      if (!caret || !(node instanceof Text) || !document.querySelector('#page')!.contains(node)) continue;
      if (caret.offset >= node.length || !node.data[caret.offset]!.trim()) continue;
      const range = document.createRange();
      range.setStart(node, caret.offset);
      range.setEnd(node, caret.offset + 1);
      (window as unknown as { heldRange: Range }).heldRange = range;
      return range.getBoundingClientRect().top - line;
    }
    return null;
  }, LINE_AT);
  if (offset === null) throw new Error('No text near the line 30% down the window.');
  return offset;
}

/** Scrolls by the given px, and comes back after the page has seen the scroll. */
function scrollBy(page: Page, px: number): Promise<void> {
  return page.evaluate(
    (by) =>
      new Promise<void>((done) => {
        const top = Math.min(scrollY + by, document.documentElement.scrollHeight - innerHeight);
        if (Math.abs(scrollY - top) < 1) return done();
        addEventListener('scroll', () => done(), { once: true });
        scrollTo(0, top);
      }),
    px,
  );
}

/** The offset of the top of the marked character from the line 30% down the window. */
export function markOffset(page: Page): Promise<number> {
  return page.evaluate(
    (share) => (window as unknown as { heldRange: Range }).heldRange.getBoundingClientRect().top - innerHeight * share,
    LINE_AT,
  );
}

/** Turns off the scroll anchoring of Chromium, since Safari has none, and the page must hold the place itself. */
export const noScrollAnchoring = (page: Page) => page.addStyleTag({ content: '* { overflow-anchor: none; }' });

/** Scrolls to the middle of the page, and comes back after the page has seen the scroll. */
export async function scrollToMiddle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const top = Math.round((document.documentElement.scrollHeight - innerHeight) / 2);
        if (Math.abs(scrollY - top) < 1) return done();
        addEventListener('scroll', () => done(), { once: true });
        scrollTo(0, top);
      }),
  );
}

/**
 * Waits until the width of `.col` differs from `width`, and expects it to snap there: no animation changes the size of
 * the column, and two reads in a row give the same width.
 */
export async function expectWidthSnaps(page: Page, width: number, what: string): Promise<void> {
  await expect.poll(() => colWidth(page), { ...OFTEN, message: `${what}: the width changes` }).not.toBe(width);
  const sizing = await page.locator('.col').evaluate((col) =>
    col
      .getAnimations()
      .filter((animation) =>
        (animation.effect as KeyframeEffect | null)
          ?.getKeyframes()
          .some((frame) => ['width', 'minWidth', 'maxWidth', 'paddingLeft'].some((name) => name in frame)),
      ).length,
  );
  expect(sizing, `${what}: animations of the size of the column`).toBe(0);
  let last = NaN;
  await expect
    .poll(
      async () => {
        const now = await colWidth(page);
        const same = now === last;
        last = now;
        return same;
      },
      { ...OFTEN, message: `${what}: the width stays` },
    )
    .toBe(true);
}

/**
 * Marks the character on the line 30% down the window, makes a change, waits until the change shows,
 * by default until the width of `.col` snapped to a new width, and expects the character within 2 px of where it was.
 */
export async function expectPlaceHolds(
  page: Page,
  what: string,
  change: () => Promise<unknown>,
  shows?: () => Promise<unknown>,
): Promise<number> {
  const before = await markLine(page);
  const width = await colWidth(page);
  await change();
  if (shows) await shows();
  else await expectWidthSnaps(page, width, what);
  await expectMarkAt(page, before, what);
  return before;
}

/** Waits until the marked character is within 2 px of the given offset from the line 30% down the window. */
export async function expectMarkAt(page: Page, offset: number, what: string): Promise<void> {
  await expect
    .poll(async () => Math.abs((await markOffset(page)) - offset), { ...OFTEN, message: `${what}: the place holds` })
    .toBeLessThanOrEqual(2);
}
