import type { PageView } from '../site/view.ts';
import { encodeUrl } from '../site/urls.ts';
import type { ContentsData } from './contents.tsx';
import { currentLevel, finishChange, jumpToLevel } from './level-change.ts';
import { wantedLevel } from './level-memory.ts';
import { levelAfterUpdate, sameMarks } from './levels.ts';
import { hasNoSlider, titleTimeHtml } from './read-time.ts';

/** A copy without what the reader changes: open details, and the focus mark that 'Go to text' sets. */
function withoutReaderState(node: Node): Node {
  const copy = node.cloneNode(true);
  if (copy instanceof Element) {
    copy.removeAttribute('tabindex');
    copy.removeAttribute('open');
    for (const details of copy.querySelectorAll('details')) details.removeAttribute('open');
  }
  return copy;
}

function sameBlock(before: Node, after: Node): boolean {
  return before.isEqualNode(after) || withoutReaderState(before).isEqualNode(withoutReaderState(after));
}

/** Replaces only the top-level blocks that changed, so images and open details stay. */
export function swapBlocks(article: Element, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html;
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

  const kept = before[before.length - tail] ?? null;
  for (const node of before.slice(head, before.length - tail)) node.remove();
  for (const node of after.slice(head, after.length - tail)) article.insertBefore(node, kept);
}

/**
 * Keeps the reader's place through a change. A block on screen that did not change stays at
 * the same height on the screen, also when text above it grew. Otherwise the scroll stays.
 * A save can pass through an empty or short file, which pulls the page up. Until the reader
 * scrolls, the next change puts the reader back.
 */
let pulledUp: { wanted: number; landed: number } | null = null;

function holdPlace(article: Element, change: () => void): void {
  const wanted = pulledUp?.landed === scrollY ? pulledUp.wanted : null;
  const top = wanted ?? scrollY;
  const anchor = [...article.children].find((block) => block.getBoundingClientRect().bottom > 0);
  const anchorTop = anchor?.getBoundingClientRect().top ?? 0;
  change();
  pulledUp = null;
  if (wanted === null && top > 0 && anchor?.isConnected && anchor.getClientRects().length) {
    scrollBy(0, anchor.getBoundingClientRect().top - anchorTop);
    return;
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
  });
}

/**
 * Listens for updates from the command. A hidden tab drops its connection, since a browser
 * allows few connections to one address, and gets the current view when it shows again.
 */
export function startLive(first: ContentsData, onData: (data: ContentsData) => void): () => void {
  let url = first.url;
  let rev = first.rev;
  let source: EventSource | null = null;

  function connect(): void {
    source?.close();
    source = new EventSource(`/__nerddocs/events?page=${encodeURIComponent(url)}`);
    source.onmessage = (event: MessageEvent<string>) => {
      const view = JSON.parse(event.data) as PageView;
      if (view.rev === rev) return;
      rev = view.rev;
      const moved = view.url !== url;
      url = view.url;
      if (moved) history.replaceState(null, '', encodeUrl(view.url) + location.hash);
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
