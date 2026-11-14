import type { Problem } from '../site/problems.ts';
import type { PageView } from '../site/view.ts';
import { encodeUrl } from '../site/urls.ts';
import type { AuthorData, ContentsData } from './contents.tsx';
import { titleSlotHtml } from './copy-link.tsx';
import { sameBlock, takePlaces, withoutNoScript } from './block-state.ts';
import { watchDiagrams } from './diagrams.ts';
import { showLinkLevels } from './level-address.ts';
import { currentLevel, finishChange, jumpToLevel } from './level-change.ts';
import { wantedLevel } from './level-memory.ts';
import { levelAfterUpdate, sameMarks } from './levels.ts';
import { watchFrames } from './frames.ts';
import { FOOT_ID, pageFootHtml } from './page-foot.ts';
import { forgetPlace, LINE_AT } from './place-hold.ts';
import { afterView, beforeView } from './problems.ts';
import { endSave, setSaveLevels, showSave } from './save-show.ts';
import { watchBoxes } from './scroll-boxes.ts';

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

/** The HTML of the foot of the page that the server last wrote. */
let footHtml = '';

/** The foot of the page after the text, replaced only when it changed. A page with neither neighbor has none. */
function swapFoot(article: Element, view: PageView): void {
  const html = pageFootHtml(view);
  if (html === footHtml) return;
  footHtml = html;
  document.getElementById(FOOT_ID)?.remove();
  if (html) article.insertAdjacentHTML('afterend', html);
}

/** The level, the marks and the watchers of the page, once the new blocks of a view are in the page. */
function settleBlocks(article: HTMLElement, view: PageView, moved: boolean): void {
  const level = levelAfterUpdate(currentLevel(), view, moved, wantedLevel(view, view.url));
  if (moved || level !== currentLevel()) jumpToLevel(level);
  article.classList.toggle('samemarks', sameMarks(view, currentLevel()));
  // The boxes take their names from the headings that show at the new level.
  watchBoxes(article);
  watchDiagrams(view.diagrams);
  watchFrames();
}

/**
 * Shows a new view of the open page. In the author browser, a save of the same page shows its change with
 * `showSave`, which moves the blocks after the title and the foot.
 */
function showView(view: PageView, moved: boolean, author: boolean): void {
  const article = document.getElementById('page');
  const heading = document.querySelector('main h1');
  if (!article || !heading) return;
  const shows = author && !moved;
  if (author) {
    endSave();
    // The marks of the problems are no text of the server, so the old blocks compare as the server wrote them.
    beforeView();
  }
  document.title = view.docTitle;
  finishChange();
  holdPlace(article, () => {
    heading.textContent = view.title;
    heading.id = view.titleId;
    const timeSlot = document.getElementById('tl-slot');
    // An unchanged button stays, and with it the focus.
    if (timeSlot) swapBlocks(timeSlot, titleSlotHtml(view));
    if (!shows) {
      swapBlocks(article, view.html);
      settleBlocks(article, view, moved);
    }
    swapFoot(article, view);
  });
  forgetPlace();
  if (!shows) {
    if (author) afterView();
    return;
  }
  setSaveLevels(view.levels.map((level) => level.id));
  showSave(article, view.html, () => {
    settleBlocks(article, view, false);
    showLinkLevels();
    afterView();
  });
}

/** What a save tells the author browser: the pages that it changed, and every page that the author has not seen. */
export interface SavedPages {
  pages: string[];
  unseen: string[];
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
  /** Runs on each save in the author browser, after the view of the open page. */
  onSaved: (saved: SavedPages) => void = () => {},
  /** Runs on each new list of the problems of the docs in the author browser, after `onSaved`. */
  onProblems: (problems: Problem[]) => void = () => {},
): () => void {
  const author: AuthorData | undefined = first.author;
  let url = first.url;
  let rev = first.rev;
  footHtml = pageFootHtml(first);
  let source: EventSource | null = null;

  function connect(): void {
    source?.close();
    source = new EventSource(`/__nerddocs/events?page=${encodeURIComponent(url)}`);
    source.addEventListener('search', onSiteText);
    if (author) {
      source.addEventListener('saved', (event) => onSaved(JSON.parse((event as MessageEvent<string>).data) as SavedPages));
      source.addEventListener('problems', (event) => {
        onProblems((JSON.parse((event as MessageEvent<string>).data) as { problems: Problem[] }).problems);
      });
    }
    source.onmessage = (event: MessageEvent<string>) => {
      const view = JSON.parse(event.data) as PageView;
      if (view.rev === rev) return;
      rev = view.rev;
      const moved = view.url !== url;
      url = view.url;
      if (moved) history.replaceState(history.state, '', encodeUrl(view.url) + location.hash);
      showView(view, moved, !!author);
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
        linkTargets: view.linkTargets,
        neighbors: view.neighbors,
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
