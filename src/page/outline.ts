import type { OutlineRow } from '../markdown/render.ts';
import type { TreeNode } from '../site/scan.ts';
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

/** The outline rows of the page at `url`, a page or the page of a folder. A page with no headings has none. */
export function outlineOf(nodes: readonly TreeNode[], url: string): OutlineRow[] {
  for (const node of nodes) {
    if (node.url === url) return node.outline ?? [];
    if (node.kind === 'section') {
      const rows = outlineOf(node.children, url);
      if (rows.length) return rows;
    }
  }
  return [];
}

/**
 * The levels at which the outline shows, as `data-shows` writes them: each level of `levels` at which a row shows. A
 * row that shows at every level, or a site with no levels, gives undefined, since the outline then always shows.
 */
export function outlineLevels(rows: readonly OutlineRow[], levels: readonly string[]): string | undefined {
  if (!levels.length || rows.some((row) => row.shows === null)) return undefined;
  const ids = new Set(rows.flatMap((row) => row.shows!.split(' ')));
  return levels.filter((id) => ids.has(id)).join(' ');
}

let watching = false;
let frame = 0;
/** The row that the reader clicked last, and the scroll where its jump left the window, once a frame has seen it. */
let clicked: string | null = null;
let jumpY: number | null = null;
/** The bold row that the column last followed. */
let boldId: string | null = null;
/** The top of the bold row from the top of the column, kept through a level change. */
let keptTop: number | null = null;

const ROWS = '#toc a.oln';
const BOLD_ROW = 'a.oln[aria-current="location"]';

const hasBox = (el: Element) => el.getClientRects().length > 0;
/** The box of the rows that scrolls. It has no box while the layer of a narrow window is closed. */
const column = () => document.getElementById('tocS');

function placeOf(row: HTMLAnchorElement): HeadingPlace {
  const id = row.getAttribute('href')?.slice(1) ?? '';
  const heading = id ? document.getElementById(id) : null;
  const shown = !!heading && hasBox(heading);
  return { id, top: shown ? heading.getBoundingClientRect().top : 0, shown };
}

function atEnd(): boolean {
  return scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - END_PX;
}

/** Sets the mark of the bold row and gives its row. With `follow`, the column scrolls to a row that is new. */
function mark(follow: boolean): HTMLAnchorElement | null {
  const box = column();
  const rows = [...document.querySelectorAll<HTMLAnchorElement>(ROWS)];
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

/** Picks the bold row now, sets its mark, and scrolls the column to it when it is a new row. */
export function markOutline(): void {
  mark(true);
}

/** Scrolls the column the least to show the bold row, as when the layer opens. */
export function showBoldRow(): void {
  const box = column();
  const row = box?.querySelector(BOLD_ROW);
  if (box && row && hasBox(box) && hasBox(row)) {
    box.scrollTop = scrollToShow(box.scrollTop, row.getBoundingClientRect(), box.getBoundingClientRect());
  }
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

/** The bold row keeps its height in the column through a level change, in the same task as the text. */
function keepRow(): void {
  const box = column();
  const row = box?.querySelector(BOLD_ROW);
  keptTop = box && row && hasBox(box) && hasBox(row) ? row.getBoundingClientRect().top - box.getBoundingClientRect().top : null;
}

function putRowBack(): void {
  const kept = keptTop;
  keptTop = null;
  const row = mark(false);
  const box = column();
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
