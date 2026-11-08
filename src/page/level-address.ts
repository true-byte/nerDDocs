import type { Level } from '../site/config.ts';
import { formatHash, landingLevelFor, parseHash } from './address.ts';
import { showFound, showsAt, takeFound, type Found } from './found.ts';
import {
  afterEachChange,
  aroundLevelSet,
  changeLevel,
  changeRunning,
  currentLevel,
  finishChange,
  jumpToLevel,
} from './level-change.ts';
import { keepLevel } from './level-memory.ts';
import { markLinks } from './level-links.ts';
import { colorOf, isFlat, openingLevel, sameMarks } from './levels.ts';

/** What the address needs to know about the open page. */
export interface AddressPage {
  url: string;
  levels: Level[];
  parts: string[];
  hasShared: boolean;
  hasSharedText: boolean;
  defaultLevel: string;
  anchors: Record<string, string>;
  linkLevels: Record<string, string>;
}

let page: AddressPage | null = null;
let started = false;
/** What runs once the running level change ends. */
let pending: (() => void) | null = null;
const moveListeners = new Set<() => void>();

const levelIds = () => page?.levels.map((level) => level.id) ?? [];
/** A page with parts writes its level into the hash. A flat page and a site with no levels never do. */
const writesLevel = () => !!page && page.levels.length > 0 && !isFlat(page);
const HEADING = /^H[1-6]$/;

/** True for a history entry that the page has seen, so Back, Forward and a reload keep the scroll of the browser. */
function entrySeen(): boolean {
  const state: unknown = history.state;
  return typeof state === 'object' && state !== null && (state as { nerddocs?: unknown }).nerddocs === 1;
}

/** Replaces the address of the current history entry, and marks the entry as seen. */
export function replaceAddress(url: string): void {
  const state: unknown = history.state;
  const kept = typeof state === 'object' && state !== null ? state : {};
  try {
    history.replaceState({ ...kept, nerddocs: 1 }, '', url);
  } catch {
    // A page from disk can refuse a new address. The page then keeps its address.
  }
}

/** The address without its hash. */
const withoutHash = () => location.pathname + location.search;

/** The text of a heading, without its footnote references. */
function headingText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const ref of copy.querySelectorAll('[data-footnote-ref]')) ref.remove();
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The element that an id names at the level. Headings with the same text count as one target, so a heading that does
 * not show at the level gives the heading with its text that does.
 */
export function targetAt(id: string, level: string): HTMLElement | null {
  const el = document.getElementById(id);
  if (!el || !level || showsAt(el, level) || !HEADING.test(el.tagName)) return el;
  const text = headingText(el);
  const headings = document.querySelectorAll<HTMLElement>('#page :is(h1, h2, h3, h4, h5, h6)');
  return [...headings].find((heading) => heading.id && showsAt(heading, level) && headingText(heading) === text) ?? el;
}

/** Writes the current level into the hash, and keeps the id of the hash when it names an element. */
function writeLevel(): void {
  if (!page) return;
  markLinks(page, currentLevel());
  if (!writesLevel()) return;
  const { id } = parseHash(location.hash, levelIds());
  const target = id ? targetAt(id, currentLevel()) : null;
  const hash = formatHash(currentLevel(), target ? target.id : null);
  if (hash !== location.hash) replaceAddress(withoutHash() + hash);
}

/** Puts an element at the top of the window, as the browser does for a plain `#id`. */
function putAtTop(el: HTMLElement): void {
  for (let up = el.parentElement?.closest('details'); up; up = up.parentElement?.closest('details')) up.open = true;
  el.scrollIntoView({ block: 'start' });
}

/** Tells the listeners that the open page moved to another level from outside the slider. */
function tellMove(): void {
  for (const listener of moveListeners) listener();
}

/** Runs `listener` after each level move that the address or a hit makes. Gives the function that stops it. */
export function onLevelMove(listener: () => void): () => void {
  moveListeners.add(listener);
  return () => moveListeners.delete(listener);
}

/**
 * Moves the open page to a level with the usual animation, keeps the level for the page in this tab, and runs `then`
 * once the text is still. A page already at the level runs `then` at once. A running level change ends first, so its
 * hold of the reader's place cannot scroll the page after `then`.
 */
export function moveLevel(to: string | null, then: () => void): void {
  if (changeRunning()) finishChange();
  if (!page || to === null || !page.levels.some((level) => level.id === to) || to === currentLevel()) {
    then();
    return;
  }
  keepLevel(page, page.url, to);
  if (isFlat(page)) {
    jumpToLevel(to);
    tellMove();
    then();
    return;
  }
  pending = then;
  const stop = page.levels.findIndex((level) => level.id === to);
  changeLevel({ to, color: colorOf(stop), sameMarks: sameMarks(page, to) });
  tellMove();
}

function runPending(): void {
  const run = pending;
  pending = null;
  run?.();
}

/** The level that the hash opens the page at, and the id it names, or null for a hash that names nothing known. */
function readHash(): { level: string; id: string | null; named: boolean } | null {
  if (!page) return null;
  const { level, id } = parseHash(location.hash, levelIds());
  if (id !== null && !document.getElementById(id)) return null;
  const current = currentLevel();
  if (!page.levels.length) return { level: current, id, named: false };
  if (level !== null) return { level: openingLevel(page, level), id, named: true };
  if (id !== null && Object.hasOwn(page.anchors, id)) {
    return { level: landingLevelFor(page.anchors[id]!, current, levelIds()), id, named: true };
  }
  return { level: current, id, named: false };
}

/** A hash change on the open page: from a link, an outline row, a typed address, Back or Forward. */
function onHashChange(): void {
  if (!page) return;
  const isNew = !entrySeen();
  const read = readHash();
  if (!read) {
    if (writesLevel()) replaceAddress(withoutHash() + formatHash(currentLevel(), null));
    else replaceAddress(location.href);
    return;
  }
  const land = () => {
    const target = read.id ? targetAt(read.id, currentLevel()) : null;
    if (writesLevel()) replaceAddress(withoutHash() + formatHash(currentLevel(), target?.id ?? null));
    else replaceAddress(location.href);
    if (isNew && target) putAtTop(target);
  };
  if (read.named && writesLevel()) keepLevel(page, page.url, read.level);
  moveLevel(read.level, land);
}

/** Opens the hit that the search box wrote for this page: its block goes on the line, with its words marked. */
function arriveAtFound(found: Found): boolean {
  return !!page && showFound(found, levelIds());
}

/** Gives the address the data of the open page after a live update, and marks the links again. */
export function setAddressPage(next: AddressPage): void {
  page = next;
  if (started) markLinks(next, currentLevel());
}

/**
 * Starts the address of the open page. The head script has already set the level of the hash. The hash then starts
 * with the current level, a new arrival at an id puts its element at the top of the window, and a hit of the search
 * box puts its block on the line. Each level change writes the level into the hash, and each hash change opens its
 * level and its id.
 */
export function startAddress(first: AddressPage): void {
  page = first;
  if (started) return;
  started = true;
  aroundLevelSet(() => {}, writeLevel);
  afterEachChange(runPending);
  const isNew = !entrySeen();
  const found = takeFound(first.url);
  const read = readHash();
  if (read?.named && writesLevel()) keepLevel(first, first.url, currentLevel());
  const target = read?.id ? targetAt(read.id, currentLevel()) : null;
  markLinks(first, currentLevel());
  if (writesLevel()) replaceAddress(withoutHash() + formatHash(currentLevel(), target?.id ?? null));
  else replaceAddress(location.href);
  const shown = found ? arriveAtFound(found) : false;
  if (!shown && isNew && target) putAtTop(target);
  addEventListener('hashchange', onHashChange);
}
