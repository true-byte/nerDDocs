import type { PageView } from '../site/view.ts';
import { encodeUrl } from '../site/urls.ts';
import type { ContentsData } from './contents.tsx';

/** A copy with each details closed, since the reader opens and closes those. */
function withDetailsClosed(node: Node): Node {
  const copy = node.cloneNode(true);
  if (copy instanceof Element) {
    copy.removeAttribute('open');
    for (const details of copy.querySelectorAll('details')) details.removeAttribute('open');
  }
  return copy;
}

function sameBlock(before: Node, after: Node): boolean {
  return before.isEqualNode(after) || withDetailsClosed(before).isEqualNode(withDetailsClosed(after));
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
  if (wanted === null && top > 0 && anchor?.isConnected) {
    scrollBy(0, anchor.getBoundingClientRect().top - anchorTop);
    return;
  }
  scrollTo(0, top);
  if (scrollY < top) pulledUp = { wanted: top, landed: scrollY };
}

function showView(view: PageView): void {
  const article = document.getElementById('page');
  const heading = document.querySelector('main h1');
  if (!article || !heading) return;
  document.title = view.docTitle;
  holdPlace(article, () => {
    heading.textContent = view.title;
    heading.id = view.titleId;
    swapBlocks(article, view.html);
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
      showView(view);
      onData({ url, rev, siteName: view.siteName, tree: view.tree, live: true });
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
