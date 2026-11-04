import { holdContent } from './place-hold.ts';
import { storedSize, storeSize } from './stored-sizes.ts';

/** A post of a wireframe, as `readFramePost` reads it. */
export type FramePost = { kind: 'height'; height: number; width: number; acted: boolean } | { kind: 'escape' };

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * The post in a message, or null. The data is an object with `nerddocs: 'frame'`. `escape: true` gives an escape post. A
 * finite number `height` gives a height post, with `width` when it is a finite number and else 0, and `acted` true only
 * for `acted: true`. Any other data, an ask among them, gives null.
 */
export function readFramePost(data: unknown): FramePost | null {
  if (typeof data !== 'object' || data === null) return null;
  const post = data as Record<string, unknown>;
  if (post.nerddocs !== 'frame') return null;
  if (post.escape === true) return { kind: 'escape' };
  if (!isNumber(post.height)) return null;
  return { kind: 'height', height: post.height, width: isNumber(post.width) ? post.width : 0, acted: post.acted === true };
}

/** The text of an attribute value in a frame document, as the build writes it in double quotes, and back. */
const attributeText = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const attributeValue = (text: string) => text.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/**
 * The frame document `source` with each address that `places` lists made absolute: the base against `page`, and each
 * other address against the base. `places` holds the start and the end of each address in `source`, the base first, as
 * `data-urls` of a frame holds them. Places that do not fit `source`, or an address that does not resolve, give `source`.
 *
 * A preload scanner reads a frame document before its parser does, and asks for the files that it names against the
 * page, not the base: Chromium does so for a relative base, and Firefox for any base. Absolute addresses ask for the
 * right files in both.
 */
export function absoluteSrcdoc(source: string, places: string, page: string): string {
  const numbers = places.split(' ').map(Number);
  if (numbers.length < 2 || numbers.length % 2) return source;
  const spans = Array.from({ length: numbers.length / 2 }, (_, at) => ({ start: numbers[at * 2]!, end: numbers[at * 2 + 1]!, isBase: at === 0 }));
  try {
    const first = spans[0]!;
    const base = new URL(attributeValue(source.slice(first.start, first.end)), page).href;
    let html = '';
    let from = 0;
    for (const { start, end, isBase } of spans.sort((a, b) => a.start - b.start)) {
      if (!(from <= start && start <= end && end <= source.length)) return source;
      const url = isBase ? base : new URL(attributeValue(source.slice(start, end)), base).href;
      html += source.slice(from, start) + attributeText(url);
      from = end;
    }
    return html + source.slice(from);
  } catch {
    return source;
  }
}

/** `wireframe <file>`, the key of the stored size of the wireframe whose `data-wf` is `file`. */
export function frameSizeKey(file: string): string {
  return `wireframe ${file}`;
}

/** The posts in a row whose same excess stops a frame. */
export const LOOP_RUN = 4;

/**
 * The excess of the last post over the frame height, in whole px, the posts in a row with that excess, and the height
 * of the frame at the first post of the run.
 */
export interface FrameRun {
  excess: number;
  count: number;
  from: number;
}

export const NO_RUN: FrameRun = { excess: 0, count: 0, from: 0 };

/**
 * The run after a post of `posted` px on a frame that is `shown` px tall. A run of `LOOP_RUN` stays, unless `acted`.
 * Else, with excess = Math.round(posted - shown): an excess of 0 or less gives a count of 0, an acted post gives 1, the
 * same excess as the run gives count + 1 and keeps `from`, and any other gives 1. A new count of 0 or 1 sets `from` to
 * `shown`. The page takes a post only while the count is under `LOOP_RUN`, and a run that reaches it stores `from`.
 */
export function nextRun(run: FrameRun, posted: number, shown: number, acted: boolean): FrameRun {
  if (run.count >= LOOP_RUN && !acted) return run;
  // `|| 0` turns -0 into 0.
  const excess = Math.round(posted - shown) || 0;
  if (excess <= 0) return { excess, count: 0, from: shown };
  if (acted || excess !== run.excess) return { excess, count: 1, from: shown };
  return { excess, count: run.count + 1, from: run.from };
}

/** The mark of an open `.wf` on a page whose scrollbar takes room, so the page keeps that room under the view. */
const GUTTER_MARK = 'data-gutter';

/** The marks of the box of an open `.wf`, which make it a modal dialog named after its frame. */
const DIALOG_MARKS = ['role', 'aria-modal', 'aria-label'];

/** The element itself, when it matches, and each element inside it that matches. */
const allOf = (copy: Element, selector: string) => [...(copy.matches(selector) ? [copy] : []), ...copy.querySelectorAll(selector)];

/**
 * Strips what `watchFrames` adds from a copy, the copy itself too: the `full` class and the `style` of each `.wf`, the
 * dialog marks of each `.wf-box`, and the `style` and the `srcdoc` of each `.wf-frame`.
 */
export function withoutFrameState(copy: Element): void {
  for (const wf of allOf(copy, '.wf')) {
    wf.classList.remove('full');
    wf.removeAttribute('style');
    wf.removeAttribute(GUTTER_MARK);
  }
  for (const box of allOf(copy, '.wf-box')) for (const name of DIALOG_MARKS) box.removeAttribute(name);
  for (const frame of allOf(copy, '.wf-frame')) for (const name of ['style', 'srcdoc']) frame.removeAttribute(name);
}

const FRAMES = '#page iframe.wf-frame';
const ASK = { nerddocs: 'frame', ask: true };
const FOCUS_LAST = { nerddocs: 'frame', focusLast: true };

let listening = false;
/** The frames that `watchFrames` has started. */
const seen = new WeakSet<HTMLIFrameElement>();
/** The run of each frame, for the loop guard. */
const runs = new WeakMap<HTMLIFrameElement, FrameRun>();
/** The last height that the page took for each frame, which a level change can hold in the queue of the content hold. */
const taken = new WeakMap<HTMLIFrameElement, number>();

/** The frame of `#page` whose window is `source`, or null. */
function frameOf(source: MessageEventSource | null): HTMLIFrameElement | null {
  if (!source) return null;
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(FRAMES)) {
    if (frame.contentWindow === source) return frame;
  }
  return null;
}

/** The `.wf` that shows full size, or null. */
const openBlock = () => document.querySelector<HTMLElement>('#page .wf.full');

/** Shows a wireframe in the whole window in place, so its frame keeps its state. Its box keeps its height in the page. */
function openFull(wf: HTMLElement): void {
  const open = openBlock();
  if (open === wf) return;
  if (open) closeFull(open);
  wf.style.height = `${wf.getBoundingClientRect().height}px`;
  // The page stops scrolling under the view. A scrollbar that takes room leaves its room, so the text keeps its width.
  wf.toggleAttribute(GUTTER_MARK, innerWidth > document.documentElement.clientWidth);
  wf.classList.add('full');
  const box = wf.querySelector<HTMLElement>('.wf-box');
  if (box) {
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', wf.querySelector('iframe.wf-frame')?.getAttribute('title') ?? '');
  }
  wf.querySelector<HTMLElement>('.wf-close')?.focus({ preventScroll: true });
}

/** Puts a wireframe back in the page, and asks its frame for its height there. */
function closeFull(wf: HTMLElement): void {
  wf.classList.remove('full');
  wf.removeAttribute(GUTTER_MARK);
  const box = wf.querySelector<HTMLElement>('.wf-box');
  for (const name of DIALOG_MARKS) box?.removeAttribute(name);
  wf.style.removeProperty('height');
  if (!wf.getAttribute('style')) wf.removeAttribute('style');
  wf.querySelector<HTMLElement>('.wf-open')?.focus({ preventScroll: true });
  wf.querySelector<HTMLIFrameElement>('iframe.wf-frame')?.contentWindow?.postMessage(ASK, '*');
}

const storeHeight = (frame: HTMLIFrameElement, wf: HTMLElement, height: number) =>
  storeSize(frameSizeKey(wf.dataset.wf ?? ''), { width: frame.clientWidth, height });

/**
 * Takes a height that a frame posted, through the content hold, and stores it. A run that stops stores the height from
 * before the run, so the next visit does not grow the frame again.
 */
function takeHeight(frame: HTMLIFrameElement, wf: HTMLElement, height: number, acted: boolean): void {
  if (wf.classList.contains('full') || !frame.getClientRects().length || height <= 0) return;
  // A post of the height that the frame has, such as the answer to an ask, changes nothing and ends no run.
  const last = taken.get(frame);
  if (last === undefined ? frame.style.height === `${height}px` : last === height) return;
  const before = runs.get(frame) ?? NO_RUN;
  const run = nextRun(before, height, frame.getBoundingClientRect().height, acted);
  runs.set(frame, run);
  if (run.count >= LOOP_RUN) {
    if (before.count < LOOP_RUN) storeHeight(frame, wf, run.from);
    return;
  }
  taken.set(frame, height);
  holdContent(() => {
    frame.style.height = `${height}px`;
    // A run that stopped while this change waited for a level change keeps the height that it stored.
    if ((runs.get(frame) ?? NO_RUN).count < LOOP_RUN) storeHeight(frame, wf, height);
  });
}

function listen(): void {
  addEventListener('message', (event) => {
    const post = readFramePost(event.data);
    const frame = post && frameOf(event.source);
    const wf = frame?.closest<HTMLElement>('.wf');
    if (!post || !frame || !wf) return;
    if (post.kind === 'escape') {
      if (wf.classList.contains('full')) closeFull(wf);
      return;
    }
    takeHeight(frame, wf, post.height, post.acted);
  });
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('.wf-open, .wf-close') : null;
    const wf = button?.closest<HTMLElement>('.wf');
    if (!button || !wf || wf.closest('.ghost') || !document.getElementById('page')?.contains(wf)) return;
    if (button.matches('.wf-open')) openFull(wf);
    else closeFull(wf);
  });
  document.addEventListener('keydown', (event) => {
    const open = openBlock();
    if (event.key === 'Escape' && open) closeFull(open);
  });
  // The view takes the whole window, so focus that leaves it comes back. Focus that leaves its close icon backward goes
  // to the last control of the wireframe, and any other focus that leaves goes to the close icon.
  document.addEventListener('focusin', (event) => {
    const open = openBlock();
    if (!open || (event.target instanceof Node && open.contains(event.target))) return;
    const close = open.querySelector<HTMLElement>('.wf-close');
    const frame = open.querySelector<HTMLIFrameElement>('iframe.wf-frame');
    if (close && event.relatedTarget === close && frame) {
      frame.focus({ preventScroll: true });
      frame.contentWindow?.postMessage(FOCUS_LAST, '*');
    } else close?.focus({ preventScroll: true });
  });
}

/**
 * Starts the frames of `#page`, also those that a live update adds: each frame gets its stored height, then its frame
 * document with absolute addresses, so it loads only now. Its listeners start once.
 */
export function watchFrames(): void {
  if (!listening) {
    listening = true;
    listen();
  }
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(FRAMES)) {
    if (seen.has(frame) || frame.closest('.ghost')) continue;
    seen.add(frame);
    const file = frame.closest<HTMLElement>('.wf')?.dataset.wf;
    const size = !frame.style.height && file !== undefined ? storedSize(frameSizeKey(file)) : null;
    if (size) frame.style.height = `${size.height}px`;
    const source = frame.dataset.srcdoc;
    if (source !== undefined) frame.srcdoc = absoluteSrcdoc(source, frame.dataset.urls ?? '', document.baseURI);
  }
}
