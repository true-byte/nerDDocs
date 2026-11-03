import { afterEachChange, changeRunning, currentLevel, finishChange } from './level-change.ts';

/** The line that holds still, as a share of the window height. */
const LINE_AT = 0.3;
/** The points tried above and below the line, for a line that falls between two lines of text. */
const TRIES = 12;
const TRY_STEP_PX = 7;
/** The point sits this far into the text, past the left edge of the line. */
const INTO_TEXT_PX = 10;
/** A space at the point gives way to the next character that is not a space, this far on at most. */
const SPACE_SKIP = 3;

/** One character of the text, and the offset of its top from the line. */
interface Place {
  range: Range;
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
    const letter = letterAt(node, range.startOffset);
    if (letter < 0) continue;
    range.setStart(node, letter);
    range.setEnd(node, letter + 1);
    const box = range.getBoundingClientRect();
    if (box.height) return { range, offset: box.top - line, level: currentLevel(), atTop: atTop() };
  }
  return null;
}

/** A place whose character still shows in the text, at the level that shows. */
function isLive(held: Place | null): held is Place {
  const node = held?.range.startContainer;
  return (
    !!held &&
    held.level === currentLevel() &&
    node instanceof Text &&
    node.isConnected &&
    !held.range.collapsed &&
    !!document.getElementById('page')?.contains(node) &&
    held.range.getBoundingClientRect().height > 0
  );
}

function record(): void {
  place = grab();
  placeY = scrollY;
}

/** Scrolls so the character of the place is back at its offset from the line. */
function put(held: Place | null): void {
  if (!isLive(held)) return;
  const off = held.range.getBoundingClientRect().top - lineY() - held.offset;
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

function holdThrough(held: Place | null, change: () => void): void {
  change();
  put(held);
  place = held;
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
  holdThrough(held ?? (isLive(place) ? place : null), change);
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
  let held = grab() ?? (isLive(place) ? place : null);
  return (change) => {
    finishChange();
    // A level change in the run shows other text, so the run holds the character that shows now.
    if (!isLive(held)) held = grab();
    holdThrough(held, change);
  };
}
