import type { Level } from '../site/config.ts';
import { encodeUrl } from '../site/urls.ts';
import type { LinkTarget } from '../site/view.ts';
import { formatHash, landingLevelFor, parseHash } from './address.ts';
import { levelIconHtml } from './icons.tsx';
import { openingLevelFor } from './level-memory.ts';

/** The `href` that the server wrote on a link whose `href` the page script changed. */
export const SERVER_HREF = 'data-href';
/** The level a link opens at, when it is not the current level. */
export const LINK_LEVEL = 'data-level';
/** The color of that level, as the index of its `--l` token. */
const LINK_STOP = 'data-stop';
/** The class of the icon of that level, after the text of the link. */
export const LINK_ICON = 'lk';

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export interface LinkPage {
  url: string;
  levels: Level[];
  linkLevels: Record<string, string>;
}

/** What `markLinks` needs to know about the open page: also the pages that its links target. */
export interface MarkPage extends LinkPage {
  defaultLevel: string;
  linkTargets: Record<string, LinkTarget>;
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * The address and the decoded hash of a link of the page at `url`, as `links` of a rendered page writes it, or null
 * for a link that leaves the site or names no hash.
 */
export function linkAddress(href: string, url: string): string | null {
  if (!href.includes('#') || href.startsWith('//') || HAS_SCHEME.test(href)) return null;
  const target = new URL(href, `http://site${encodeUrl(url)}`);
  if (!target.hash || target.hash === '#' || !(href.startsWith('#') || target.pathname.endsWith('.html'))) return null;
  return `${decode(target.pathname)}#${decode(target.hash.slice(1))}`;
}

/** The level a link opens at: the level in its hash, else the level of `linkLevels` from the current level, else null. */
export function linkLevel(href: string, page: LinkPage, current: string): { level: string | null; known: boolean } {
  const address = linkAddress(href, page.url);
  if (address === null) return { level: null, known: false };
  const ids = page.levels.map((level) => level.id);
  const parsed = parseHash(address.slice(address.indexOf('#')), ids);
  if (parsed.level !== null) return { level: parsed.level, known: false };
  if (Object.hasOwn(page.linkLevels, address)) {
    return { level: landingLevelFor(page.linkLevels[address]!, current, ids), known: true };
  }
  return { level: null, known: false };
}

/** The level whose icon a link shows, or null: the level of `linkLevel(href, page, current)` when it differs from `readerLevel(<the address of its target page>)`. */
export function iconLevel(
  href: string,
  page: LinkPage,
  current: string,
  readerLevel: (url: string) => string,
): string | null {
  const { level } = linkLevel(href, page, current);
  if (level === null) return null;
  const address = linkAddress(href, page.url)!;
  return level === readerLevel(address.slice(0, address.indexOf('#'))) ? null : level;
}

/**
 * The reader's level of a page: `current` for the open page, and for another page the level it opens at for this
 * reader, as `openingLevelFor` gives it. Each page is read from storage once.
 */
function readerLevels(page: MarkPage, current: string): (url: string) => string {
  const known = new Map<string, string>([[page.url, current]]);
  return (url) => {
    let level = known.get(url);
    if (level === undefined) {
      const target = Object.hasOwn(page.linkTargets, url) ? page.linkTargets[url]! : { parts: [], hasSharedText: false };
      level = openingLevelFor({ levels: page.levels, defaultLevel: page.defaultLevel, ...target }, url);
      known.set(url, level);
    }
    return level;
  };
}

/** The `href` with the level in its hash, in front of the id. */
function withLevel(href: string, level: string, ids: readonly string[]): string {
  const at = href.indexOf('#');
  const { id } = parseHash(href.slice(at), ids);
  return `${href.slice(0, at)}${formatHash(level, id)}`;
}

/**
 * Marks each link of the text that opens its target at a level other than the reader's level of that page with that
 * level and its icon, and puts the level into the `href` of each link in `linkLevels`. A link keeps its server `href`
 * in `data-href`.
 */
export function markLinks(page: MarkPage, current: string): void {
  const article = document.getElementById('page');
  if (!article) return;
  const ids = page.levels.map((level) => level.id);
  const readerLevel = readerLevels(page, current);
  for (const link of article.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (link.closest('.ghost')) continue;
    const written = link.getAttribute(SERVER_HREF) ?? link.getAttribute('href')!;
    const { level, known } = current && ids.length ? linkLevel(written, page, current) : { level: null, known: false };
    if (known && level !== null) {
      link.setAttribute(SERVER_HREF, written);
      const href = withLevel(written, level, ids);
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    } else if (link.hasAttribute(SERVER_HREF)) {
      link.setAttribute('href', written);
      link.removeAttribute(SERVER_HREF);
    }
    const shown = level !== null ? iconLevel(written, page, current, readerLevel) : null;
    const stop = shown !== null ? ids.indexOf(shown) : -1;
    if (stop < 0) {
      link.removeAttribute(LINK_LEVEL);
      link.removeAttribute(LINK_STOP);
      link.querySelector(`:scope > .${LINK_ICON}`)?.remove();
      continue;
    }
    if (link.getAttribute(LINK_LEVEL) === level) continue;
    link.setAttribute(LINK_LEVEL, level!);
    link.setAttribute(LINK_STOP, String(stop % 5));
    let icon = link.querySelector<HTMLElement>(`:scope > .${LINK_ICON}`);
    if (!icon) {
      icon = document.createElement('span');
      icon.className = LINK_ICON;
      icon.setAttribute('aria-hidden', 'true');
      link.append(icon);
    }
    icon.innerHTML = levelIconHtml(page.levels[stop]!);
  }
}

/** A copy of the node without the marks of `markLinks`, as the server wrote it. */
export function withoutLinkMarks(node: Element): void {
  for (const link of [node, ...node.querySelectorAll(`[${SERVER_HREF}], [${LINK_LEVEL}]`)]) {
    const written = link.getAttribute(SERVER_HREF);
    if (written !== null) {
      link.setAttribute('href', written);
      link.removeAttribute(SERVER_HREF);
    }
    link.removeAttribute(LINK_LEVEL);
    link.removeAttribute(LINK_STOP);
  }
  for (const icon of node.querySelectorAll(`a > .${LINK_ICON}`)) icon.remove();
}
