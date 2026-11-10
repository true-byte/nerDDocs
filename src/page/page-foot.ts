import type { Neighbor } from '../site/neighbors.ts';
import { hrefTo } from '../site/urls.ts';
import type { PageView } from '../site/view.ts';
import { iconHtml } from './icons.tsx';
import { openingLevelFor } from './level-memory.ts';
import { formatMinutes } from './read-time.ts';

/** The id of the foot of the page, which links to the page before and the page after it. */
export const FOOT_ID = 'pgFoot';
const MINUTES = 'm';

type FootPage = Pick<PageView, 'url' | 'levels' | 'neighbors'>;
type ShownFootPage = FootPage & Pick<PageView, 'defaultLevel' | 'linkTargets'>;

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const escapeAttribute = (text: string) => escapeText(text).replace(/"/g, '&quot;');

/** The minutes of each level, each shown by the level rule at its level only. A site with no levels has one time. */
function minutesHtml(neighbor: Neighbor, page: FootPage): string {
  if (!page.levels.length) return formatMinutes(neighbor.minutes[''] ?? 0);
  return page.levels
    .map((level) => `<span data-shows="${escapeAttribute(level.id)}">${formatMinutes(neighbor.minutes[level.id] ?? 0)}</span>`)
    .join('');
}

function linkHtml(neighbor: Neighbor, page: FootPage, side: 'pv' | 'nx'): string {
  const href = escapeAttribute(hrefTo(page.url, neighbor.url));
  const text = `<span class="t">${escapeText(neighbor.title)}</span><span class="${MINUTES}">${minutesHtml(neighbor, page)}</span>`;
  const arrow = iconHtml('arrow');
  return `<a class="${side}" href="${href}">${side === 'pv' ? arrow + text : text + arrow}</a>`;
}

/** The foot of the page as HTML, or '' for a page with neither a page before it nor a page after it. */
export function pageFootHtml(page: FootPage): string {
  const { previous, next } = page.neighbors;
  if (!previous && !next) return '';
  const links = (previous ? linkHtml(previous, page, 'pv') : '') + (next ? linkHtml(next, page, 'nx') : '');
  return `<nav id="${FOOT_ID}" class="pg-foot" aria-label="Pages">${links}</nav>`;
}

/**
 * The level that the page of a neighbor opens at for this reader. A neighbor that a link also targets has its parts.
 * Otherwise a level with no minutes counts as a level with no text.
 */
function readerLevelOf(neighbor: Neighbor, page: ShownFootPage): string {
  const target = Object.hasOwn(page.linkTargets, neighbor.url)
    ? page.linkTargets[neighbor.url]!
    : { parts: page.levels.filter((level) => neighbor.minutes[level.id]).map((level) => level.id), hasSharedText: false };
  return openingLevelFor({ levels: page.levels, defaultLevel: page.defaultLevel, ...target }, neighbor.url);
}

/** Shows the minutes of each link of the foot at the reader's level of its page, in place of the minutes of each level. */
export function showFootMinutes(page: ShownFootPage): void {
  const foot = document.getElementById(FOOT_ID);
  if (!foot || !page.levels.length) return;
  const sides = [
    ['pv', page.neighbors.previous],
    ['nx', page.neighbors.next],
  ] as const;
  for (const [side, neighbor] of sides) {
    const minutes = foot.querySelector(`:scope > a.${side} > .${MINUTES}`);
    if (!minutes || !neighbor) continue;
    const text = formatMinutes(neighbor.minutes[readerLevelOf(neighbor, page)] ?? 0);
    if (minutes.children.length || minutes.textContent !== text) minutes.textContent = text;
  }
}
