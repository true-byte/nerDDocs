import { expect, type Locator, type Page } from '@playwright/test';
import { openLive, openLiveOnStoppedClock } from './page.ts';
import { OFTEN } from './poll.ts';
import type { StartedCommand } from './run-command.ts';

/** How long `hold` lasts after a level change, after a scroll alone, and when nothing moved. */
export const HOLD_AFTER_LEVEL_MS = 650;
export const HOLD_AFTER_SCROLL_MS = 320;
export const HOLD_STILL_MS = 160;
/** How long the scroll of `move` lasts. */
export const SAVE_SCROLL_MS = 380;
/** How long after the start of `change` the new words of a text come, when some words leave. */
export const NEW_WORDS_MS = 520;

/** Opens the author address of the command, so that the browser of the page holds the author cookie. */
export async function becomeAuthor(page: Page, run: StartedCommand): Promise<void> {
  await page.goto(await run.authorAddress(), { waitUntil: 'commit' });
}

/** Opens a page of the command live in the author browser. */
export async function openAuthorLive(page: Page, run: StartedCommand, path: string): Promise<void> {
  await becomeAuthor(page, run);
  await openLive(page, `${run.address}${path}`);
}

/** Opens a page of the command live in the author browser, with its clock stopped. */
export async function openAuthorLiveOnStoppedClock(page: Page, run: StartedCommand, path: string): Promise<void> {
  await becomeAuthor(page, run);
  await openLiveOnStoppedClock(page, `${run.address}${path}`);
}

/** The page at one stage of a save show: the moment that `data-save` of `#page` took this value. */
export interface StageEntry {
  /** The value of `data-save`, or null once it went. */
  stage: string | null;
  /** The time of the page clock. */
  t: number;
  level: string | null;
  y: number;
  /** The text of `#page`, every level in it. */
  text: string;
}

/**
 * Records each value that `data-save` of `#page` takes, on each page that the browser opens from now on. A value that
 * the page sets and takes back within one task still counts.
 */
export async function recordSaveStages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: unknown[] = [];
    (window as unknown as { saveLog: unknown[] }).saveLog = log;
    let last: string | null = null;
    const entry = (stage: string | null) => ({
      stage,
      t: performance.now(),
      level: document.getElementById('nd-level')?.getAttribute('data-level') ?? null,
      y: scrollY,
      text: document.getElementById('page')?.textContent ?? '',
    });
    new MutationObserver((records) => {
      const mine = records.filter((record) => (record.target as Element).id === 'page');
      if (!mine.length) return;
      // Each record holds the value before it, so the value after one is the value before the next.
      const values = [...mine.slice(1).map((record) => record.oldValue), (mine[0]!.target as Element).getAttribute('data-save')];
      for (const value of values) {
        if (value === last) continue;
        last = value;
        log.push(entry(value));
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-save'], attributeOldValue: true });
  });
}

export const saveLog = (page: Page) => page.evaluate(() => (window as unknown as { saveLog: StageEntry[] }).saveLog);
export const stagesOf = (log: StageEntry[]) => log.map((entry) => entry.stage);

/** The first entry of a stage from the entry `from` on. */
export const entryOf = (log: StageEntry[], stage: string | null, from = 0) => log.slice(from).find((entry) => entry.stage === stage);

/** How long the first `stage` from the entry `from` on lasted, on the page clock. */
export function durationOf(log: StageEntry[], stage: string, from = 0): number {
  const at = log.findIndex((entry, index) => index >= from && entry.stage === stage);
  expect(at, `${stage} in ${JSON.stringify(stagesOf(log))}`).toBeGreaterThanOrEqual(0);
  expect(log[at + 1], `the stage after ${stage}`).toBeDefined();
  return log[at + 1]!.t - log[at]!.t;
}

/** Expects a duration within `by` ms of the wanted one. */
export function expectAbout(value: number, wanted: number, by: number, name = ''): void {
  expect(value, `${name} ${value}, about ${wanted}`).toBeGreaterThanOrEqual(wanted - by);
  expect(value, `${name} ${value}, about ${wanted}`).toBeLessThanOrEqual(wanted + by);
}

/** Runs the stopped clock of the page in steps until the check holds. Each step gives real time too, for an image or a drawing. */
export async function runUntil(page: Page, check: () => Promise<boolean>, step = 20): Promise<void> {
  await expect
    .poll(async () => {
      if (await check()) return true;
      await page.clock.runFor(step);
      return check();
    }, OFTEN)
    .toBe(true);
}

/** Runs the stopped clock until `#page` has reached the stage, from the entry `from` of the log on. Null is the end of a show. */
export const runUntilStage = (page: Page, stage: string | null, step = 20, from = 0) =>
  runUntil(page, async () => entryOf(await saveLog(page), stage, from) !== undefined, step);

/** Waits on a running clock until `#page` has reached the stage, from the entry `from` of the log on. */
export const waitForStage = (page: Page, stage: string | null, from = 0) =>
  expect.poll(async () => entryOf(await saveLog(page), stage, from) !== undefined, OFTEN).toBe(true);

/** The computed value of a color, such as `var(--l2)`, on the page. */
export const computedColor = (page: Page, color: string) =>
  page.evaluate((value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.append(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return computed;
  }, color);

/** The alpha of a computed color, 0 for none. */
export function alphaOf(color: string): number {
  if (color === 'transparent') return 0;
  const slash = /\/\s*([\d.]+%?)\s*\)$/.exec(color);
  if (slash) return slash[1]!.endsWith('%') ? parseFloat(slash[1]!) / 100 : parseFloat(slash[1]!);
  const rgba = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(color);
  return rgba ? parseFloat(rgba[1]!) : 1;
}

/** What a paragraph of the page shows: its text, its HTML, the text of each element in it, and the text of each element in it on a tint. */
export interface Paragraph {
  text: string;
  html: string;
  inner: string[];
  tinted: string[];
}

/** Each paragraph of `#page` whose text starts with `start`, in page order, also a copy that a show adds. */
export const paragraphs = (page: Page, start: string, selector = 'p') =>
  page.evaluate(
    ([begin, query]) => {
      const alpha = (color: string) => {
        const slash = /\/\s*([\d.]+)\s*\)$/.exec(color);
        if (slash) return parseFloat(slash[1]!);
        const rgba = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(color);
        return color === 'transparent' ? 0 : rgba ? parseFloat(rgba[1]!) : 1;
      };
      const tinted = (el: Element) => {
        const style = getComputedStyle(el);
        return alpha(style.backgroundColor) > 0 || style.backgroundImage !== 'none';
      };
      return [...document.querySelectorAll(`#page ${query}`)]
        .filter((el) => (el.textContent ?? '').trimStart().startsWith(begin))
        .map((el) => ({
          text: (el.textContent ?? '').trim(),
          html: el.innerHTML.trim(),
          inner: [...el.querySelectorAll('*')].map((inner) => inner.textContent ?? ''),
          tinted: [...el.querySelectorAll('*')].filter(tinted).map((inner) => inner.textContent ?? ''),
        }));
    },
    [start, selector] as const,
  );

/** The only paragraph of `#page` whose text starts with `start`. */
export async function paragraph(page: Page, start: string, selector = 'p'): Promise<Paragraph> {
  const found = await paragraphs(page, start, selector);
  expect(found, `paragraphs that start with '${start}'`).toHaveLength(1);
  return found[0]!;
}

/** The bar left of the block of `#page` that holds the text: its width and color, or null while it shows none. */
export const barOf = (page: Page, text: string) =>
  page.evaluate((inside) => {
    const block = [...document.querySelectorAll('#page > *')].find((el) => el.textContent?.includes(inside));
    if (!block) return null;
    const style = getComputedStyle(block, '::before');
    if (style.content === 'none' || style.display === 'none' || style.width !== '3px' || Number(style.opacity) === 0) return null;
    return { width: style.width, color: style.backgroundColor };
  }, text);

/** The top and the bottom of the block of `#page` that holds the text, on the screen, and the line 30% down the window. */
export const placeOf = (page: Page, text: string) =>
  page.evaluate((inside) => {
    const blocks = [...document.querySelectorAll<HTMLElement>('#page > *')].filter(
      (el) => el.textContent?.includes(inside) && el.getClientRects().length > 0,
    );
    const rect = blocks[0]?.getBoundingClientRect();
    return { top: rect?.top ?? null, bottom: rect?.bottom ?? null, line: innerHeight * 0.3, count: blocks.length };
  }, text);

/** True when the block of `#page` that holds the text is in view: its top 60px below the top of the window, and its bottom 140px above the bottom. */
export const inView = (page: Page, text: string) =>
  page.evaluate((inside) => {
    const block = [...document.querySelectorAll('#page > *')].find((el) => el.textContent?.includes(inside) && el.getClientRects().length);
    if (!block) return false;
    const { top, bottom } = block.getBoundingClientRect();
    return top >= 60 && bottom <= innerHeight - 140;
  }, text);

/** Records each height that each new child of `#page` takes, by the start of its text: once at once, then at each frame. */
export async function recordNewHeights(page: Page): Promise<void> {
  await page.evaluate(() => {
    const heights: Record<string, number[]> = {};
    (window as unknown as { newHeights: Record<string, number[]> }).newHeights = heights;
    const keyOf = (el: Element) => (el.textContent ?? '').trim().slice(0, 40);
    const sizes = new ResizeObserver((entries) => {
      for (const entry of entries) (heights[keyOf(entry.target)] ??= []).push(entry.target.getBoundingClientRect().height);
    });
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          (heights[keyOf(node)] ??= []).push(node.getBoundingClientRect().height);
          sizes.observe(node);
        }
      }
    }).observe(document.getElementById('page')!, { childList: true });
  });
}

/** The heights that the new block whose text starts with `start` took, in order. */
export const newHeightsOf = (page: Page, start: string) =>
  page.evaluate(
    (begin) =>
      Object.entries((window as unknown as { newHeights: Record<string, number[]> }).newHeights)
        .filter(([key]) => key.startsWith(begin))
        .flatMap(([, list]) => list),
    start,
  );

/** Gives each child of `#page` a JS property, so that a test can tell a kept node from a new one. */
export const markBlocks = (page: Page) =>
  page.evaluate(() => {
    for (const block of document.getElementById('page')!.children) (block as unknown as { kept: boolean }).kept = true;
  });

/** True when the block of `#page` that holds the text carries the property of `markBlocks`. */
export const isKept = (page: Page, text: string) =>
  page.evaluate(
    (inside) =>
      (([...document.querySelectorAll('#page > *')].find((el) => el.textContent?.includes(inside)) as unknown as { kept?: boolean }) ?? {})
        .kept === true,
    text,
  );

/** The signs that a level move shows, which the move of a save show leaves out: a tint, a bar, a seam, a tick or the chip. */
export const moveSigns = (page: Page) =>
  page.evaluate(() => {
    const shows = (el: Element, pseudo?: string) => {
      const style = getComputedStyle(el, pseudo);
      return style.display !== 'none' && style.visibility !== 'hidden' && (!pseudo || style.content !== 'none');
    };
    const chip = document.getElementById('chip');
    return {
      tint: [...document.querySelectorAll('#page .flash > .bd')].some((bd) => getComputedStyle(bd).animationName !== 'none'),
      bar: [...document.querySelectorAll('#page .flash')].some((el) => shows(el, '::before')),
      seam: [...document.querySelectorAll('#page .seam')].some((el) => el.getClientRects().length > 0 && shows(el, '::after')),
      tick: [...document.querySelectorAll('#ticks i')].some((el) => el.getClientRects().length > 0 && shows(el)),
      chip: !!chip && chip.getClientRects().length > 0 && shows(chip),
    };
  });

export const NO_MOVE_SIGNS = { tint: false, bar: false, seam: false, tick: false, chip: false };

/** The dashed icons that the page shows, from the top of the page down: each `button.hollow` of `#hollow` with a box, seen through every layer around it. */
export const shownIcons = async (page: Page) =>
  (await page.locator('#hollow button.hollow').evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        if (!button.getClientRects().length || getComputedStyle(button).visibility === 'hidden') return false;
        for (let el: Element | null = button; el; el = el.parentElement) {
          const style = getComputedStyle(el);
          if (style.display === 'none' || Number(style.opacity) === 0) return false;
        }
        return true;
      })
      .map((button) => {
        const { left, top, width, height } = button.getBoundingClientRect();
        return { level: button.getAttribute('data-level'), x: left + width / 2, y: top + height / 2, top, width, height };
      }),
  )).sort((a, b) => a.top - b.top || a.x - b.x);

/** Waits until the page has painted after its fonts loaded, so that a test can tell that a thing does not show. */
export const settled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) => {
        void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => done())));
      }),
  );

/** The `span.unseen` dot of a row of 'Contents' or of the list of dimensions, by the name of the row, or null. */
export const dotOf = (page: Page, name: string) =>
  page.evaluate((title) => {
    const own = (row: Element) => [...row.querySelectorAll('span.unseen')];
    const rows: Element[] = [];
    for (const row of document.querySelectorAll('#panel div.lr')) {
      if (row.querySelector('a')?.textContent?.trim() === title) rows.push(row);
    }
    for (const section of document.querySelectorAll('#panel li.sec')) {
      const button = section.querySelector(':scope > button.topic');
      if (button?.textContent?.trim() === title) rows.push(button, ...[...section.children].filter((el) => el.matches('span.unseen')));
    }
    for (const item of document.querySelectorAll('#dimL li')) {
      if (item.querySelector('a')?.textContent?.trim() === title) rows.push(item);
    }
    const dots = rows.flatMap((row) => (row.matches('span.unseen') ? [row] : own(row)));
    const dot = dots.find((el) => el.getClientRects().length > 0);
    if (!dot) return null;
    const rect = dot.getBoundingClientRect();
    // The end of the name of the row, to tell that the dot sits after it.
    const row = rows.find((el) => el.contains(dot) || el.parentElement === dot.parentElement)!;
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let textEnd = -Infinity;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      textEnd = Math.max(textEnd, range.getBoundingClientRect().right);
    }
    return { width: rect.width, height: rect.height, left: rect.left, textEnd, color: getComputedStyle(dot).backgroundColor };
  }, name);

/** A locator of each dashed icon of a level. */
export const iconsOf = (page: Page, level: string): Locator => page.locator(`#hollow button.hollow[data-level="${level}"]`);
