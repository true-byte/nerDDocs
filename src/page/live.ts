import type { PageView } from '../site/view.ts';
import { encodeUrl } from '../site/urls.ts';
import type { ContentsData } from './contents.tsx';
import { CODE_BOX, PLACE_MARKS, takePlace, watchDiagrams } from './diagrams.ts';
import { currentLevel, finishChange, jumpToLevel } from './level-change.ts';
import { wantedLevel } from './level-memory.ts';
import { withoutLinkMarks } from './level-links.ts';
import { levelAfterUpdate, sameMarks } from './levels.ts';
import { watchFrames, withoutFrameState } from './frames.ts';
import { forgetPlace, LINE_AT } from './place-hold.ts';
import { hasNoSlider, titleTimeHtml } from './read-time.ts';
import { SCROLL_BOX, watchBoxes } from './scroll-boxes.ts';

const BOX_MARKS = ['role', 'tabindex', 'aria-labelledby'];
const WRAPPER_MARKS = ['data-more', 'data-pin'];
/** The check of a copy icon. */
const COPY_MARK = 'data-done';
/**
 * What the page script adds to the box of a diagram: its state, its full-size marks, its description and its size. The
 * place marks of the build join them, since a save above the box moves its fence and leaves the diagram the same.
 */
const DIAGRAM_MARKS = [
  'data-state',
  'data-drawn',
  'data-full',
  'tabindex',
  'role',
  'aria-label',
  'aria-describedby',
  'style',
  ...PLACE_MARKS,
];

/** Each diagram box in a block, the block itself too, in page order. */
const diagramsIn = (block: Element) => [...(block.matches('.dg') ? [block] : []), ...block.querySelectorAll('.dg')];

/** Removes each `noscript` inside a node. Its content shows only with no script. */
function withoutNoScript(node: Node): void {
  if (node instanceof Element || node instanceof DocumentFragment) for (const fallback of node.querySelectorAll('noscript')) fallback.remove();
}

/**
 * A copy without what the reader changes and what the page script adds: open details, the focus mark that 'Go to
 * text' sets, the marks of sideways boxes, the check of a copy icon, the drawing, the problem box, the source box and
 * the marks of a diagram, and the height, the full-size view and the frame document of a wireframe. It also has no
 * `noscript`, as a block of a live update has none.
 */
function withoutReaderState(node: Node): Node {
  const copy = node.cloneNode(true);
  withoutNoScript(copy);
  if (copy instanceof Element) {
    for (const box of diagramsIn(copy)) {
      for (const name of DIAGRAM_MARKS) box.removeAttribute(name);
      box.classList.remove(CODE_BOX);
      for (const child of box.querySelectorAll(`:scope > div.${SCROLL_BOX}, :scope > .problem`)) child.remove();
      const pre = box.querySelector(':scope > pre');
      pre?.classList.remove(SCROLL_BOX);
      if (pre?.classList.length === 0) pre.removeAttribute('class');
      for (const name of BOX_MARKS) pre?.removeAttribute(name);
    }
    copy.removeAttribute('tabindex');
    copy.removeAttribute('open');
    for (const details of copy.querySelectorAll('details')) details.removeAttribute('open');
    for (const el of [copy, ...copy.querySelectorAll('[data-more], [data-pin]')]) {
      for (const name of WRAPPER_MARKS) el.removeAttribute(name);
    }
    const boxes = [...(copy.matches(`.${SCROLL_BOX}`) ? [copy] : []), ...copy.querySelectorAll(`.${SCROLL_BOX}`)];
    for (const box of boxes) for (const name of BOX_MARKS) box.removeAttribute(name);
    for (const el of [copy, ...copy.querySelectorAll(`[${COPY_MARK}]`)]) el.removeAttribute(COPY_MARK);
    withoutFrameState(copy);
    withoutLinkMarks(copy);
  }
  return copy;
}

function sameBlock(before: Node, after: Node): boolean {
  return before.isEqualNode(after) || withoutReaderState(before).isEqualNode(withoutReaderState(after));
}

/** A kept block takes the place marks of each diagram box of its new copy. */
function takePlaces(kept: Node, copy: Node): void {
  if (!(kept instanceof Element) || !(copy instanceof Element)) return;
  const copies = diagramsIn(copy);
  diagramsIn(kept).forEach((box, at) => {
    const from = copies[at];
    if (box instanceof HTMLElement && from) takePlace(box, from);
  });
}

/**
 * Replaces only the top-level blocks that changed, so images and open details stay. The new blocks come without their
 * `noscript`: a template can read its content as elements, and a frame in it would load.
 */
export function swapBlocks(article: Element, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html;
  withoutNoScript(template.content);
  const before = [...article.childNodes];
  const after = [...template.content.childNodes];
  const shorter = Math.min(before.length, after.length);

  let head = 0;
  while (head < shorter && sameBlock(before[head]!, after[head]!)) head++;
  let tail = 0;
  while (
    tail < shorter - head &&
    sameBlock(before[before.length - 1 - tail]!, after[after.length - 1 - tail]!)
  ) {
    tail++;
  }

  for (let at = 0; at < head; at++) takePlaces(before[at]!, after[at]!);
  for (let at = 1; at <= tail; at++) takePlaces(before[before.length - at]!, after[after.length - at]!);
  const kept = before[before.length - tail] ?? null;
  for (const node of before.slice(head, before.length - tail)) node.remove();
  for (const node of after.slice(head, after.length - tail)) article.insertBefore(node, kept);
}

/**
 * Keeps the reader's place through a change. A block on screen that did not change stays at
 * the same height on the screen, also when text above it grew. When that block changed, the
 * heading with an id nearest above the line stays, so a save deep in a long block, such as an
 * API reference, keeps the reader near the line. Otherwise the scroll stays.
 * A save can pass through an empty or short file, which pulls the page up. Until the reader
 * scrolls, the next change puts the reader back.
 */
let pulledUp: { wanted: number; landed: number } | null = null;

/** The id and the top of the last heading with an id at or above the line that holds still. */
function headingAboveLine(article: Element): { id: string; top: number } | null {
  const line = innerHeight * LINE_AT;
  let found: { id: string; top: number } | null = null;
  for (const heading of article.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')) {
    if (!heading.getClientRects().length) continue;
    const { top } = heading.getBoundingClientRect();
    if (top <= line) found = { id: heading.id, top };
  }
  return found;
}

function holdPlace(article: Element, change: () => void): void {
  const wanted = pulledUp?.landed === scrollY ? pulledUp.wanted : null;
  const top = wanted ?? scrollY;
  const anchor = [...article.children].find((block) => block.getBoundingClientRect().bottom > 0);
  const anchorTop = anchor?.getBoundingClientRect().top ?? 0;
  const heading = headingAboveLine(article);
  change();
  pulledUp = null;
  if (wanted === null && top > 0) {
    if (anchor?.isConnected && anchor.getClientRects().length) {
      scrollBy(0, anchor.getBoundingClientRect().top - anchorTop);
      return;
    }
    const same = heading ? document.getElementById(heading.id) : null;
    if (heading && same && article.contains(same) && same.getClientRects().length) {
      scrollBy(0, same.getBoundingClientRect().top - heading.top);
      return;
    }
  }
  scrollTo(0, top);
  if (scrollY < top) pulledUp = { wanted: top, landed: scrollY };
}

function showView(view: PageView, moved: boolean): void {
  const article = document.getElementById('page');
  const heading = document.querySelector('main h1');
  if (!article || !heading) return;
  document.title = view.docTitle;
  finishChange();
  holdPlace(article, () => {
    heading.textContent = view.title;
    heading.id = view.titleId;
    const timeSlot = document.getElementById('tl-slot');
    // An unchanged button stays, and with it the focus.
    if (timeSlot) swapBlocks(timeSlot, titleTimeHtml(view.readTimes, hasNoSlider(view)));
    swapBlocks(article, view.html);
    const level = levelAfterUpdate(currentLevel(), view, moved, wantedLevel(view, view.url));
    if (moved || level !== currentLevel()) jumpToLevel(level);
    article.classList.toggle('samemarks', sameMarks(view, level));
    // The boxes take their names from the headings that show at the new level.
    watchBoxes(article);
    watchDiagrams(view.diagrams);
    watchFrames();
  });
  forgetPlace();
}

/**
 * Listens for updates from the command. A hidden tab drops its connection, since a browser
 * allows few connections to one address, and gets the current view when it shows again.
 */
export function startLive(
  first: ContentsData,
  onData: (data: ContentsData) => void,
  /** Runs when the text of any page of the site changed, also a page other than the open one. */
  onSiteText: () => void = () => {},
): () => void {
  let url = first.url;
  let rev = first.rev;
  let source: EventSource | null = null;

  function connect(): void {
    source?.close();
    source = new EventSource(`/__nerddocs/events?page=${encodeURIComponent(url)}`);
    source.addEventListener('search', onSiteText);
    source.onmessage = (event: MessageEvent<string>) => {
      const view = JSON.parse(event.data) as PageView;
      if (view.rev === rev) return;
      rev = view.rev;
      const moved = view.url !== url;
      url = view.url;
      if (moved) history.replaceState(history.state, '', encodeUrl(view.url) + location.hash);
      showView(view, moved);
      onData({
        url,
        rev,
        siteName: view.siteName,
        tree: view.tree,
        live: true,
        levels: view.levels,
        defaultLevel: view.defaultLevel,
        parts: view.parts,
        hasShared: view.hasShared,
        hasSharedText: view.hasSharedText,
        configProblem: view.configProblem,
        readTimes: view.readTimes,
        textWidth: view.textWidth,
        diagrams: view.diagrams,
        dimensions: view.dimensions,
        anchors: view.anchors,
        linkLevels: view.linkLevels,
      });
      // A dropped connection reconnects to the address it started with, so start a new one.
      if (moved) connect();
    };
  }

  function onVisibility(): void {
    if (document.hidden) {
      source?.close();
      source = null;
    } else if (!source) {
      // A hidden tab hears of no save, so the text of the site may have changed.
      onSiteText();
      connect();
    }
  }

  document.addEventListener('visibilitychange', onVisibility);
  if (!document.hidden) connect();

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    source?.close();
  };
}
