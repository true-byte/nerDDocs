import { afterEachChange, aroundLevelSet } from './level-change.ts';

/** The line that picks the bold row, as a share of the window height. */
const LINE_AT = 0.3;
/** A scroll this far from where a jump left the window is the reader's own. */
const MOVE_PX = 1;
/** The window counts as at the end of the page this close to it. */
const END_PX = 2;

/** A heading of an outline row, with its top from the top of the window in px. */
export interface HeadingPlace {
  id: string;
  top: number;
  shown: boolean;
}

export interface BoldInput {
  /** In page order. `shown` is false for a heading with no box at this level. */
  headings: readonly HeadingPlace[];
  /** 30% of the window height, in px. */
  line: number;
  windowHeight: number;
  /** The window is at the end of a page that scrolls. */
  atEnd: boolean;
  /** The row that the reader clicked last, or null. */
  clicked: string | null;
}

/** The id of the bold row, or null. */
export function boldRow({ headings, line, windowHeight, atEnd, clicked }: BoldInput): string | null {
  const shown = headings.filter((heading) => heading.shown);
  if (clicked !== null && shown.some((heading) => heading.id === clicked)) return clicked;
  if (atEnd) {
    const onScreen = shown.findLast((heading) => heading.top < windowHeight);
    if (onScreen) return onScreen.id;
  }
  return shown.findLast((heading) => heading.top <= line)?.id ?? null;
}

export interface Span {
  top: number;
  bottom: number;
}

/** The scrollTop that shows `row` in `box` with the least scroll. Both spans are in window px. */
export function scrollToShow(scrollTop: number, row: Span, box: Span): number {
  if (row.top < box.top) return scrollTop - (box.top - row.top);
  if (row.bottom > box.bottom) return scrollTop + (row.bottom - box.bottom);
  return scrollTop;
}

/** The scrollTop of the tree when the phone menu opens. Both tops are from the top of the tree content. */
export function menuScrollTop(pageRowTop: number, boldRowBottom: number | null, boxHeight: number): number {
  return boldRowBottom === null ? pageRowTop : Math.max(pageRowTop, boldRowBottom - boxHeight);
}

let watching = false;
let frame = 0;
/** The row that the reader clicked last, and the scroll where its jump left the window, once a frame has seen it. */
let clicked: string | null = null;
let jumpY: number | null = null;
/** The bold row that the tree last followed. */
let boldId: string | null = null;
/** The top of the bold row from the top of the tree, kept through a level change. */
let keptTop: number | null = null;

/** The rows of the open page. A row of another page links to that page, and it is never bold. */
const OPEN_ROWS = '.lr.on + .ol a.oln';

const hasBox = (el: Element) => el.getClientRects().length > 0;
const tree = () => document.getElementById('tree');

function placeOf(row: HTMLAnchorElement): HeadingPlace {
  const id = row.getAttribute('href')?.slice(1) ?? '';
  const heading = id ? document.getElementById(id) : null;
  const shown = !!heading && hasBox(heading);
  return { id, top: shown ? heading.getBoundingClientRect().top : 0, shown };
}

function atEnd(): boolean {
  return scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - END_PX;
}

/** Sets the mark of the bold row and gives its row. With `follow`, the tree scrolls to a row that is new. */
function mark(follow: boolean): HTMLAnchorElement | null {
  const box = tree();
  const rows = box ? [...box.querySelectorAll<HTMLAnchorElement>(OPEN_ROWS)] : [];
  const places = rows.map(placeOf);
  const id = boldRow({ headings: places, line: innerHeight * LINE_AT, windowHeight: innerHeight, atEnd: atEnd(), clicked });
  let bold: HTMLAnchorElement | null = null;
  for (const [at, row] of rows.entries()) {
    if (!bold && id !== null && places[at]!.id === id) {
      bold = row;
      if (row.getAttribute('aria-current') !== 'location') row.setAttribute('aria-current', 'location');
    } else if (row.hasAttribute('aria-current')) {
      row.removeAttribute('aria-current');
    }
  }
  const isNew = id !== boldId;
  boldId = id;
  if (follow && isNew && bold && box && hasBox(box) && hasBox(bold)) {
    box.scrollTop = scrollToShow(box.scrollTop, bold.getBoundingClientRect(), box.getBoundingClientRect());
  }
  return bold;
}

/** Picks the bold row now, sets its mark, and scrolls the tree to it when it is a new row. */
export function markOutline(): void {
  mark(true);
}

function onFrame(): void {
  frame = 0;
  if (clicked !== null) {
    if (jumpY === null) jumpY = scrollY;
    else if (Math.abs(scrollY - jumpY) > MOVE_PX) clicked = null;
  }
  markOutline();
}

function schedule(): void {
  if (!frame) frame = requestAnimationFrame(onFrame);
}

/** A click on the outline row of `id`, or null for a click on the current page row. */
export function rowClicked(id: string | null): void {
  clicked = id;
  jumpY = null;
  markOutline();
  // The jump of the link comes after the click, and the next frame takes the place where it left the window.
  if (id !== null) schedule();
}

/** The bold row keeps its height in the tree through a level change, in the same task as the text. */
function keepRow(): void {
  const box = tree();
  const row = box?.querySelector('a.oln[aria-current="location"]');
  keptTop = box && row && hasBox(box) && hasBox(row) ? row.getBoundingClientRect().top - box.getBoundingClientRect().top : null;
}

function putRowBack(): void {
  const kept = keptTop;
  keptTop = null;
  const row = mark(false);
  const box = tree();
  if (kept === null || !row || !box || !hasBox(row)) return;
  box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - kept;
}

/** Starts the scroll and resize listeners and the hold of a level change. A second call does nothing. */
export function watchOutline(): void {
  if (watching) return;
  watching = true;
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  aroundLevelSet(keepRow, putRowBack);
  afterEachChange(markOutline);
}
