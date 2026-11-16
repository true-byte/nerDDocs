import { afterEachChange, changeRunning, currentLevel, finishChange, moveTicks } from './level-change.ts';

/** The line that holds still, as a share of the window height. */
export const LINE_AT = 0.3;
/** The points tried above and below the line, for a line that falls between two lines of text. */
const TRIES = 12;
const TRY_STEP_PX = 7;
/** The point sits this far into the text, past the left edge of the line. */
const INTO_TEXT_PX = 10;
/** A space at the point gives way to the next character that is not a space, this far on at most. */
const SPACE_SKIP = 3;
/** The box of a Mermaid diagram. */
const DIAGRAM = '.dg';
/** A block whose top the place holds when the line falls on it: a Mermaid diagram or a wireframe. */
const HELD_BLOCK = '.dg, .wf';

/** One character of the text, or an image or a diagram when the line falls on one, and the offset of its top from the line. */
interface Place {
  mark: Range | HTMLElement;
  offset: number;
  /** The level that showed when the place was taken. A level change moves the text with a hold of its own. */
  level: string;
  /** The page was at its top when the place was taken, so a new window width keeps the page at the top. */
  atTop: boolean;
}

/** The place after the reader's last scroll or the page's last change, which a new window size puts back. */
let place: Place | null = null;
/** The scroll position that `place` belongs to. A scroll away from it is the reader's, or a change of the text. */
let placeY = 0;
let seenWidth = 0;
let seenHeight = 0;
let watching = false;
/** The content changes that wait for a running level change to end. */
const queued: (() => void)[] = [];
let queueWatched = false;
let loadsWatched = false;

const lineY = () => innerHeight * LINE_AT;
const px = (value: string) => parseFloat(value) || 0;
/** A page this close to its top stays at the top through a change, as a level change keeps it there. */
const atTop = () => scrollY < 2;

function caretAt(x: number, y: number): Range | null {
  if (typeof document.caretRangeFromPoint === 'function') return document.caretRangeFromPoint(x, y);
  if (typeof document.caretPositionFromPoint !== 'function') return null;
  const caret = document.caretPositionFromPoint(x, y);
  if (!caret) return null;
  const range = document.createRange();
  range.setStart(caret.offsetNode, caret.offset);
  return range;
}

/** The first character at or after `at` that is not a space, or -1. A space can end a line and leave it. */
function letterAt(node: Text, at: number): number {
  for (let next = at; next < Math.min(node.length, at + SPACE_SKIP + 1); next++) {
    if (node.data[next]!.trim()) return next;
  }
  return -1;
}

/** The character of the text at the start of the line 30% down the window, or of a line near it. */
function grab(): Place | null {
  const page = document.getElementById('page');
  const col = page?.closest<HTMLElement>('.col');
  if (!page || !col) return null;
  const style = getComputedStyle(col);
  const x = col.getBoundingClientRect().left + px(style.borderLeftWidth) + px(style.paddingLeft) + INTO_TEXT_PX;
  const line = lineY();
  for (let at = 0; at < TRIES; at++) {
    const y = line + (at % 2 ? 1 : -1) * Math.ceil(at / 2) * TRY_STEP_PX;
    const range = caretAt(x, y);
    const node = range?.startContainer;
    if (!range || !(node instanceof Text) || !page.contains(node)) continue;
    // The text of a diagram moves with its drawing, so it holds no place.
    if (node.parentElement?.closest(DIAGRAM)) continue;
    const letter = letterAt(node, range.startOffset);
    if (letter < 0) continue;
    range.setStart(node, letter);
    range.setEnd(node, letter + 1);
    const box = range.getBoundingClientRect();
    if (box.height) return { mark: range, offset: box.top - line, level: currentLevel(), atTop: atTop() };
  }
  return blockAt(page, line);
}

/**
 * The diagram, the wireframe or the image on the line, when no text is there. The place holds the top of a diagram box
 * or of a wireframe, since a draw or a step changes what is inside it. It holds the paragraph of a block image or of a
 * light and dark pair, since a look switch shows the other copy in it, and else the image.
 */
function blockAt(page: HTMLElement, line: number): Place | null {
  const box = page.getBoundingClientRect();
  const found = document.elementFromPoint(box.left + box.width / 2, line);
  const held = found?.closest<HTMLElement>(HELD_BLOCK);
  let mark: HTMLElement;
  if (held && page.contains(held)) mark = held;
  else if (found instanceof HTMLImageElement && page.contains(found)) {
    const block = found.hasAttribute('data-full') || found.hasAttribute('data-look');
    const parent = found.parentElement;
    mark = block && parent instanceof HTMLParagraphElement ? parent : found;
  } else return null;
  return { mark, offset: mark.getBoundingClientRect().top - line, level: currentLevel(), atTop: atTop() };
}

/** A place whose character or image still shows in the text, at the level that shows. */
function isLive(held: Place | null): held is Place {
  if (!held || held.level !== currentLevel()) return false;
  const page = document.getElementById('page');
  const { mark } = held;
  if (mark instanceof HTMLElement) return mark.isConnected && !!page?.contains(mark) && mark.getClientRects().length > 0;
  const node = mark.startContainer;
  return (
    node instanceof Text &&
    node.isConnected &&
    !mark.collapsed &&
    !!page?.contains(node) &&
    mark.getBoundingClientRect().height > 0
  );
}

/**
 * The place of the last record, while the page is still where it was taken. A scroll since, such as a jump to a heading
 * whose scroll event has not come yet, leaves it stale.
 */
function storedPlace(): Place | null {
  return Math.abs(scrollY - placeY) <= 1 && isLive(place) ? place : null;
}

function record(): void {
  place = grab();
  placeY = scrollY;
}

/** Scrolls so the character or the image of the place is back at its offset from the line. */
function put(held: Place | null): void {
  if (!isLive(held)) return;
  const off = held.mark.getBoundingClientRect().top - lineY() - held.offset;
  if (Math.abs(off) > 0.5) scrollTo(0, scrollY + off);
  placeY = scrollY;
}

/**
 * Records the place after each scroll and after each level change, and puts it back after each change of the window
 * width. A place taken at the top of the page keeps the page at the top. A scroll that lands where the page put the
 * reader is the page's own. A scroll during a change of the window size waits for it.
 */
export function watchPlace(): void {
  if (watching) return;
  watching = true;
  seenWidth = innerWidth;
  seenHeight = innerHeight;
  record();
  addEventListener(
    'scroll',
    () => {
      if (Math.abs(scrollY - placeY) <= 1 || innerWidth !== seenWidth || innerHeight !== seenHeight) return;
      record();
    },
    { passive: true },
  );
  addEventListener('resize', () => {
    const widthChanged = innerWidth !== seenWidth;
    seenWidth = innerWidth;
    seenHeight = innerHeight;
    // A level change holds a place of its own while its text moves.
    if (changeRunning()) return;
    // A new height alone, such as the address bar of a phone, moves no line of the text, so the page stays.
    if (widthChanged && place?.atTop) {
      if (scrollY !== 0) scrollTo(0, 0);
      record();
    } else if (widthChanged && isLive(place)) put(place);
    else record();
  });
  afterEachChange(record);
}

/** Drops the place after a change that holds the reader's place in its own way, such as a live update. */
export function forgetPlace(): void {
  place = null;
}

/**
 * Makes the change and puts the held place back. The place is then the character at the start of the line that the
 * held place put back, as a scroll would take it, so a new window size holds the line that the reader sees now.
 */
function holdThrough(held: Place | null, change: () => void): void {
  change();
  put(held);
  place = grab() ?? held;
  placeY = scrollY;
}

/** Makes a change at the top of the page with no scroll, and takes the place that the change leaves. */
function stayAtTop(change: () => void): void {
  change();
  record();
}

/**
 * Makes a change that moves the lines of the text, such as a new text width, and keeps the character on the line 30%
 * down the window at its place. A page at its top stays at the top. The change first ends a running level change.
 */
export function keepPlace(change: () => void): void {
  watchPlace();
  finishChange();
  if (atTop()) return stayAtTop(change);
  const held = grab();
  holdThrough(held ?? storedPlace(), change);
}

/**
 * The same, for a change that the text has already begun before the page hears of it, such as a font that loaded:
 * the place is the one from before, unless the reader scrolled since.
 */
export function keepPlaceFromBefore(change: () => void): void {
  watchPlace();
  finishChange();
  if (atTop()) return stayAtTop(change);
  if (Math.abs(scrollY - placeY) > 1 || !isLive(place)) record();
  holdThrough(place, change);
}

/**
 * Takes the place once for a run of changes, such as the moves of a drag, and gives the function that makes each
 * change. Each change keeps the same character, so the place never drifts through the text in the run. A level change
 * in the run takes the place again. A run that starts at the top of the page keeps the page at the top.
 */
export function holdForRun(): (change: () => void) => void {
  watchPlace();
  finishChange();
  if (atTop()) {
    return (change) => {
      finishChange();
      stayAtTop(change);
    };
  }
  let held = grab() ?? storedPlace();
  return (change) => {
    finishChange();
    // A level change in the run shows other text, so the run holds the character that shows now.
    if (!isLive(held)) held = grab();
    holdThrough(held, change);
  };
}

/** Takes the place for a change of content, makes the change and puts the place back. It keeps the level signals. */
function holdThroughContent(change: () => void): void {
  watchPlace();
  if (atTop()) stayAtTop(change);
  else holdThrough(grab() ?? storedPlace(), change);
  moveTicks();
}

function runQueued(): void {
  if (!queued.length) return;
  const changes = queued.splice(0);
  holdThroughContent(() => {
    for (const change of changes) change();
  });
}

/**
 * Makes a change of size that page content makes by itself, such as a diagram draw or a frame height, and keeps the
 * place on the line 30% down the window. While a level change runs, the change waits in a queue, and the queued
 * changes run in order under one hold once the text is still. It never ends a level change or its signals.
 */
export function holdContent(change: () => void): void {
  watchPlace();
  if (!changeRunning()) return holdThroughContent(change);
  queued.push(change);
  if (queueWatched) return;
  queueWatched = true;
  // After the place record of `watchPlace`, so the queue runs once the change has scrolled to its target.
  afterEachChange(runQueued);
}

/**
 * Puts back the place from before a change of size that has already happened, such as an image with no size that
 * loaded. While a level change runs it does nothing, since the change holds its own place. It never ends the signals.
 */
export function holdLoadedContent(): void {
  watchPlace();
  if (changeRunning()) return;
  if (atTop()) record();
  else {
    if (Math.abs(scrollY - placeY) > 1 || !isLive(place)) record();
    put(place);
  }
  moveTicks();
}

/**
 * Runs `holdLoadedContent` on each `load` and `error` of an `img` in `#page` with no `width` or no `height`. A second
 * call does nothing.
 */
export function watchImageLoads(): void {
  const page = document.getElementById('page');
  if (loadsWatched || !page) return;
  loadsWatched = true;
  const onLoad = (event: Event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement && (!img.hasAttribute('width') || !img.hasAttribute('height'))) {
      holdLoadedContent();
    }
  };
  page.addEventListener('load', onLoad, true);
  page.addEventListener('error', onLoad, true);
}
