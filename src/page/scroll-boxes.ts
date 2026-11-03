import { afterEachChange } from './level-change.ts';

/** The class of an inner box that scrolls sideways. Its parent element is its wrapper, which never scrolls. */
export const SCROLL_BOX = 'sbox';

export type Side = 'left' | 'right';

export interface BoxSizes {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
  /** The width of the first column of a table, or null for a box with no table. */
  firstColumn: number | null;
}

export interface BoxMarks {
  scrolls: boolean;
  /** The sides where content hides, in the order left, right. */
  more: Side[];
  pin: boolean;
}

/** A box scrolls once its content passes its width by more than a pixel, as a fraction of a pixel can round either way. */
const SLACK_PX = 1;
/** A first column of at most this share of the box stays in place while the box scrolls. */
const PIN_SHARE = 1 / 3;

export function boxMarks({ scrollLeft, clientWidth, scrollWidth, firstColumn }: BoxSizes): BoxMarks {
  const hidden = scrollWidth - clientWidth;
  const scrolls = hidden > SLACK_PX;
  const more: Side[] = [];
  if (scrolls && scrollLeft > SLACK_PX) more.push('left');
  if (scrolls && hidden - scrollLeft > SLACK_PX) more.push('right');
  return { scrolls, more, pin: scrolls && firstColumn !== null && firstColumn <= clientWidth * PIN_SHARE };
}

const watched = new Set<HTMLElement>();
let observer: ResizeObserver | null = null;
/** The marks that a box that scrolls carries itself. Its wrapper carries `data-more` and `data-pin`. */
const BOX_MARKS = ['role', 'tabindex', 'aria-labelledby'];

function setMark(el: Element | null, name: string, value: string | null): void {
  if (!el || el.getAttribute(name) === value) return;
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

/** A cell that spans rows or columns leaves no first column to pin. */
function firstColumnOf(box: HTMLElement): number | null {
  const table = box.querySelector<HTMLTableElement>(':scope > table');
  const first = table?.rows[0]?.cells[0];
  if (!table || !first) return null;
  for (const row of table.rows) {
    for (const cell of row.cells) if (cell.colSpan > 1 || cell.rowSpan > 1) return null;
  }
  return first.getBoundingClientRect().width;
}

const shown = (el: Element) => el.getClientRects().length > 0;

/** The headings of the text that have an id and show at this level, in page order. */
function shownHeadings(): Element[] {
  const page = document.getElementById('page');
  if (!page) return [];
  return [...page.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((heading) => heading.id && shown(heading));
}

/** The id of the nearest shown heading above the box, else of the page title, else null. */
function nameOf(box: HTMLElement, headings: Element[]): string | null {
  let id: string | null = null;
  for (const heading of headings) {
    if (!(heading.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    id = heading.id;
  }
  return id ?? (document.querySelector('main h1')?.id || null);
}

function showMore(box: HTMLElement, more: Side[]): void {
  setMark(box.parentElement, 'data-more', more.length ? more.join(' ') : null);
}

/** Sets every mark of each box. The headings are read once, and only when a box scrolls. */
function markBoxes(boxes: Iterable<HTMLElement>): void {
  let headings: Element[] | null = null;
  for (const box of boxes) {
    const { scrollLeft, clientWidth, scrollWidth } = box;
    const marks = boxMarks({ scrollLeft, clientWidth, scrollWidth, firstColumn: firstColumnOf(box) });
    showMore(box, marks.more);
    setMark(box.parentElement, 'data-pin', marks.pin ? '' : null);
    setMark(box, 'role', marks.scrolls ? 'region' : null);
    setMark(box, 'tabindex', marks.scrolls ? '0' : null);
    headings ??= marks.scrolls ? shownHeadings() : null;
    setMark(box, 'aria-labelledby', marks.scrolls && headings ? nameOf(box, headings) : null);
  }
}

/** A scroll changes only the sides where content hides. */
function onScroll(event: Event): void {
  const box = event.currentTarget as HTMLElement;
  const { scrollLeft, clientWidth, scrollWidth } = box;
  showMore(box, boxMarks({ scrollLeft, clientWidth, scrollWidth, firstColumn: null }).more);
}

/** Forgets each box that left the page or lost its class, as the source of a diagram does once the diagram draws. */
function forgetGone(): void {
  for (const box of watched) {
    if (box.isConnected && box.classList.contains(SCROLL_BOX)) continue;
    watched.delete(box);
    observer?.unobserve(box);
    if (box.firstElementChild) observer?.unobserve(box.firstElementChild);
    box.removeEventListener('scroll', onScroll);
    if (box.isConnected) for (const name of BOX_MARKS) box.removeAttribute(name);
  }
}

function markWatched(): void {
  forgetGone();
  markBoxes(watched);
}

/**
 * Watches each `.sbox` under `root` that it does not watch yet, and sets the marks of every watched box at once, since
 * a change of the text can rename a box that it keeps.
 */
export function watchBoxes(root: ParentNode = document): void {
  if (!observer) {
    observer = new ResizeObserver((entries) => {
      forgetGone();
      const boxes = new Set<HTMLElement>();
      for (const { target } of entries) {
        const box = target.classList.contains(SCROLL_BOX) ? target : target.parentElement;
        if (box instanceof HTMLElement && watched.has(box)) boxes.add(box);
      }
      markBoxes(boxes);
    });
    afterEachChange(markWatched);
  }
  for (const box of root.querySelectorAll<HTMLElement>(`.${SCROLL_BOX}`)) {
    if (watched.has(box)) continue;
    watched.add(box);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    box.addEventListener('scroll', onScroll, { passive: true });
  }
  markWatched();
}
