import { currentLevel } from './level-change.ts';
import { LINE_AT } from './place-hold.ts';
import { rangesIn, type Hit, type HitBlock } from './search.ts';
import { read, remove, session, write } from './panel-state.ts';

/** In sessionStorage: the hit that the search box opens on another page, which that page reads and removes. */
export const FOUND_KEY = 'nerddocs-found';
/** The highlight of the matched words of a hit, in `CSS.highlights`. */
export const FOUND_HIGHLIGHT = 'nd-found';
const FOUND_MS = 2000;

/** A hit with what the page needs to find its block. */
export type Found = Hit & HitBlock;

/** Writes the hit for the page that it opens. */
export function keepFound(found: Found): void {
  write(session, FOUND_KEY, JSON.stringify(found));
}

const isFound = (value: unknown): value is Found => {
  const found = value as Found;
  return (
    typeof found === 'object' &&
    found !== null &&
    typeof found.url === 'string' &&
    typeof found.text === 'string' &&
    Array.isArray(found.query) &&
    Array.isArray(found.matched)
  );
};

/** Reads and removes the hit that the search box wrote for the page at `url`. A hit for another page counts as none. */
export function takeFound(url: string): Found | null {
  const text = read(session, FOUND_KEY);
  if (text === null) return null;
  remove(session, FOUND_KEY);
  try {
    const found: unknown = JSON.parse(text);
    return isFound(found) && found.url === url ? found : null;
  } catch {
    return null;
  }
}

/** A block whose text is one search unit, as `src/markdown/page-index.ts` reads the page. */
const UNIT_TAGS = new Set(['P', 'LI', 'TR', 'PRE', 'H2', 'H3', 'H4', 'H5', 'H6', 'DT', 'DD', 'SUMMARY']);
const INNER_BLOCKS = new Set([
  'UL',
  'OL',
  'DL',
  'TABLE',
  'PRE',
  'BLOCKQUOTE',
  'DETAILS',
  'DIV',
  'SECTION',
  'FIGURE',
  'LI',
  'TR',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);
const NO_TEXT_TAGS = new Set(['SVG', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'TEMPLATE', 'BUTTON', 'IMG']);

function givesNoText(el: Element): boolean {
  if (NO_TEXT_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.classList.contains('dg') || el.classList.contains('wf') || el.classList.contains('marks')) return true;
  if (el.tagName === 'PRE' && el.classList.contains('box')) return true;
  return el.hasAttribute('data-footnote-backref') || el.hasAttribute('data-footnote-ref');
}

/** One character of the text of a block, and the place in a text node that it comes from, if any. */
interface Char {
  char: string;
  node: Text | null;
  at: number;
}

function charsIn(node: Element, skipBlocks: boolean, out: Char[]): Char[] {
  for (const child of node.childNodes) {
    if (child instanceof Text) {
      for (let at = 0; at < child.data.length; at++) out.push({ char: child.data[at]!, node: child, at });
    } else if (child instanceof Element) {
      if (givesNoText(child) || (skipBlocks && INNER_BLOCKS.has(child.tagName))) continue;
      if (child.tagName === 'BR') out.push({ char: ' ', node: null, at: 0 });
      else charsIn(child, skipBlocks, out);
    }
  }
  return out;
}

/** Each run of white space as one space, trimmed. */
function spaced(chars: Char[]): Char[] {
  const out: Char[] = [];
  for (const char of chars) {
    if (/\s/.test(char.char)) {
      if (out.length && out.at(-1)!.char !== ' ') out.push({ ...char, char: ' ' });
    } else out.push(char);
  }
  if (out.at(-1)?.char === ' ') out.pop();
  return out;
}

/** The text of a unit block, with the place of each character. */
function blockChars(el: Element): Char[] {
  if (el.tagName === 'TR') {
    const cells = [...el.children].filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH');
    const joined: Char[] = [];
    cells.forEach((cell, at) => {
      if (at) for (const char of ' · ') joined.push({ char, node: null, at: 0 });
      joined.push(...spaced(charsIn(cell, false, [])));
    });
    return spaced(joined);
  }
  return spaced(charsIn(el, el.tagName !== 'PRE', []));
}

const textOf = (chars: Char[]) => chars.map((char) => char.char).join('');

/** True when the element gives a unit of its own, and is no paragraph inside a list item or another unit. */
function isUnit(el: Element, page: Element): boolean {
  if (!UNIT_TAGS.has(el.tagName) || el.classList.contains('sr-only') || el.closest('.ghost')) return false;
  for (let up = el.parentElement; up && up !== page; up = up.parentElement) {
    if (givesNoText(up)) return false;
    if (INNER_BLOCKS.has(up.tagName)) return true;
    if (UNIT_TAGS.has(up.tagName)) return false;
  }
  return true;
}

/** The levels string of an element as the page shows it, or null at every level. */
export function levelsOfElement(el: Element, levels: readonly string[]): string | null {
  let shown = [...levels];
  for (let up: Element | null = el; up && up.id !== 'page'; up = up.parentElement) {
    const part = up.classList.contains('part') ? up.getAttribute('data-l') : null;
    const shows = up.getAttribute('data-shows');
    for (const value of [part, shows]) if (value !== null) shown = shown.filter((id) => value.split(' ').includes(id));
  }
  return shown.length === levels.length ? null : shown.join(' ');
}

/** True when the element shows at the level, by the parts and the shared headings and details around it. */
export function showsAt(el: Element, level: string): boolean {
  for (let up: Element | null = el; up && up.id !== 'page'; up = up.parentElement) {
    const part = up.classList.contains('part') ? up.getAttribute('data-l') : null;
    const shows = up.getAttribute('data-shows');
    for (const value of [part, shows]) if (value !== null && !value.split(' ').includes(level)) return false;
  }
  return true;
}

/** The block of a hit on the open page: the unit with its text and levels, after as many like it as come before. */
export function blockFor(found: Pick<Found, 'text' | 'levels' | 'before'>, levels: readonly string[]): HTMLElement | null {
  const page = document.getElementById('page');
  if (!page) return null;
  const same = [...page.querySelectorAll<HTMLElement>('p, li, tr, pre, h2, h3, h4, h5, h6, dt, dd, summary')].filter(
    (el) => isUnit(el, page) && levelsOfElement(el, levels) === found.levels && textOf(blockChars(el)) === found.text,
  );
  return same[Math.min(found.before, same.length - 1)] ?? null;
}

/** Opens each closed details around the element, so it shows. */
export function openAround(el: Element): void {
  for (let up = el.parentElement?.closest('details'); up; up = up.parentElement?.closest('details')) {
    if (!up.open) up.open = true;
  }
}

let fadeTimer: ReturnType<typeof setTimeout> | undefined;

/** Marks the matched words of the block with the highlight `nd-found` for about 2 s. */
function markWords(el: Element, query: readonly string[], matched: readonly string[]): void {
  if (typeof CSS === 'undefined' || !('highlights' in CSS) || typeof Highlight !== 'function') return;
  const chars = blockChars(el);
  const ranges: Range[] = [];
  for (const [start, end] of rangesIn(textOf(chars), query, matched)) {
    const inside = chars.slice(start, end).filter((char) => char.node);
    const first = inside[0];
    const last = inside.at(-1);
    if (!first?.node || !last?.node) continue;
    const range = document.createRange();
    range.setStart(first.node, first.at);
    range.setEnd(last.node, last.at + 1);
    ranges.push(range);
  }
  clearTimeout(fadeTimer);
  CSS.highlights.set(FOUND_HIGHLIGHT, new Highlight(...ranges));
  fadeTimer = setTimeout(() => CSS.highlights.delete(FOUND_HIGHLIGHT), FOUND_MS);
}

/** Scrolls so the top of the element sits on the line 30% down the window, or as near as the page can scroll. */
export function putOnLine(el: Element): void {
  scrollTo(0, scrollY + el.getBoundingClientRect().top - innerHeight * LINE_AT);
}

/**
 * Shows the block of a hit at the current level: it opens a closed details around it, puts its top on the line and
 * marks its matched words. Without its block, the heading of the hit goes on the line. Gives false when neither shows.
 */
export function showFound(found: Found, levels: readonly string[]): boolean {
  const block = blockFor(found, levels);
  const heading = found.headingId ? document.getElementById(found.headingId) : null;
  const el = block ?? (heading && showsAt(heading, currentLevel()) ? heading : null);
  if (!el) return false;
  openAround(el);
  putOnLine(el);
  if (block) markWords(block, found.query, found.matched);
  return true;
}
