import { createHash } from 'node:crypto';
import type { DiagramBuild } from '../page/diagrams.ts';
import { parseHash } from '../page/address.ts';
import { levelIconHtml } from '../page/icons.tsx';
import { colorOf } from '../page/levels.ts';
import type { SiteAddresses } from './addresses.ts';
import { DEFAULT_TEXT_WIDTH, type ConfigProblem, type Dimension, type Level } from './config.ts';
import { isMarkdownName } from './names.ts';
import { neighbors, type Neighbor } from './neighbors.ts';
import { readRows, type ReadRow } from './read-time.ts';
import type { Page, Site, TreeNode } from './scan.ts';

/** What the slider needs to know about one page. */
export interface PageLevels {
  /** The levels of the site. A site with fewer than two levels has none here and draws no slider. */
  levels: Level[];
  defaultLevel: string;
  /** Each different data-l value of the page. A page with none shows 'No levels on this page'. */
  parts: string[];
  hasShared: boolean;
  /** True when the text outside the parts is more than headings and details that hold only parts. */
  hasSharedText: boolean;
}

/** What one open page shows. The page holds it as HTML, and a live update sends it again. */
export interface PageView extends PageLevels {
  url: string;
  /** Two views with the same rev show the same thing. */
  rev: string;
  siteName: string;
  /** The pages and folders of the site. Each page holds the rows of its outline, which the outline of the open page lists. */
  tree: TreeNode[];
  docTitle: string;
  title: string;
  titleId: string;
  html: string;
  configProblem: ConfigProblem | null;
  /** One row per level, or one row below two levels. */
  readTimes: ReadRow[];
  /** The characters of a line of text by default. A view with none takes `DEFAULT_TEXT_WIDTH`. */
  textWidth?: number;
  /** The Mermaid build that the page loads, 'none' for a page with no diagram. */
  diagrams: DiagramBuild;
  /** The dimensions of the site. With one or more, `tree` holds one section per dimension. */
  dimensions: Dimension[];
  /** Each element id of the page that shows at some levels only, with its levels string. */
  anchors: Record<string, string>;
  /** Each link of the page whose target shows at some levels only, with the levels of the target. */
  linkLevels: Record<string, string>;
  /** Each page other than this one that an entry of `links` targets, by its address, with what its opening level needs. */
  linkTargets: Record<string, LinkTarget>;
  /** The page before and the page after this one, in the order of the tree, inside the dimension of the page. */
  neighbors: { previous: Neighbor | null; next: Neighbor | null };
}

/** What the level that a page opens at needs to know about the page, besides the levels of the site. */
export interface LinkTarget {
  parts: string[];
  hasSharedText: boolean;
}

export function hasPage(site: Site, url: string): boolean {
  return site.pages.some((page) => page.url === url);
}

const MAX_MARKS = 3;
const PART_OPENING = /<div class="part" data-l="([^"]*)"><div class="bd">/g;

function marksHtml(levels: Level[], value: string): string {
  const ids = value.split(' ');
  if (ids.length >= levels.length) return '';
  const shown = levels
    .map((level, index) => ({ level, index }))
    .filter(({ level }) => ids.includes(level.id));
  const icons = shown
    .slice(0, MAX_MARKS)
    .map(({ level, index }) => `<span style="--mc:${colorOf(index)}">${levelIconHtml(level)}</span>`);
  const more = shown.length > MAX_MARKS ? '<span class="more">+</span>' : '';
  return `<div class="marks" aria-hidden="true">${icons.join('')}${more}</div>`;
}

/** Each part gets the icons of its levels, unless it shows at every level of the site. */
function withMarks(html: string, levels: Level[]): string {
  if (!levels.length) return html;
  const known = new Map<string, string>();
  return html.replace(PART_OPENING, (_opening, value: string) => {
    if (!known.has(value)) known.set(value, marksHtml(levels, value));
    return `<div class="part" data-l="${value}">${known.get(value)}<div class="bd">`;
  });
}

/**
 * Each link of the page whose hash names an id that shows at some levels only on its target page, with those levels.
 * A link whose hash names a level opens at that level, so it is not here.
 */
function linkLevelsOf(site: Site, page: Page | undefined): Record<string, string> {
  const ids = site.levels.map((level) => level.id);
  const found: Record<string, string> = {};
  for (const link of page?.links ?? []) {
    const at = link.indexOf('#');
    const { level, id } = parseHash(link.slice(at), ids);
    if (level !== null || id === null) continue;
    const target = site.pages.find((candidate) => candidate.url === link.slice(0, at));
    const levels = target?.anchors && Object.hasOwn(target.anchors, id) ? target.anchors[id] : undefined;
    if (levels !== undefined) found[link] = levels;
  }
  return found;
}

/** Each page other than the page itself that a link of the page targets, by its address. */
function linkTargetsOf(site: Site, page: Page | undefined, levels: Level[]): Record<string, LinkTarget> {
  const found: Record<string, LinkTarget> = {};
  for (const link of page?.links ?? []) {
    const url = link.slice(0, link.indexOf('#'));
    if (url === page!.url || Object.hasOwn(found, url)) continue;
    const target = site.pages.find((candidate) => candidate.url === url);
    if (target) found[url] = { parts: levels.length ? target.parts : [], hasSharedText: target.hasSharedText };
  }
  return found;
}

function makeView(site: Site, url: string, title: string, titleId: string, page?: Page): PageView {
  const docTitle = title === site.name ? title : `${title} - ${site.name}`;
  const levels = site.levels.length >= 2 ? site.levels : [];
  const content = {
    url,
    siteName: site.name,
    tree: site.tree,
    docTitle,
    title,
    titleId,
    html: withMarks(page?.html ?? '', levels),
    levels,
    defaultLevel: levels.length ? site.defaultLevel : '',
    parts: levels.length ? (page?.parts ?? []) : [],
    hasShared: page?.hasShared ?? false,
    hasSharedText: page?.hasSharedText ?? false,
    configProblem: site.configProblem,
    readTimes: readRows(site, levels, page),
    textWidth: site.textWidth ?? DEFAULT_TEXT_WIDTH,
    diagrams: page?.diagrams ?? 'none',
    dimensions: site.dimensions,
    anchors: page?.anchors ?? {},
    linkLevels: linkLevelsOf(site, page),
    linkTargets: linkTargetsOf(site, page, levels),
    neighbors: neighbors(site, url),
  };
  const rev = createHash('sha1').update(JSON.stringify(content)).digest('hex');
  return { ...content, rev };
}

/** The site root shows the first page. An unknown address shows 404 and keeps the address. */
export function viewOf(site: Site, url: string): PageView {
  const page = url === '/' ? site.pages[0] : site.pages.find((candidate) => candidate.url === url);
  if (page) return makeView(site, page.url, page.title, page.titleId, page);
  if (url === '/') return makeView(site, url, site.name, '');
  return makeView(site, url, '404', '');
}

/**
 * The address of the page that an old address opens: the address of a page or of its Markdown file with the order
 * prefixes in its names, or the address of a folder with them. Null when it opens no page.
 */
export function movedUrl(site: Site, addresses: SiteAddresses, path: string): string | null {
  const disk = path.slice(1);
  if (isMarkdownName(disk) || /\.html$/i.test(disk)) {
    const url = addresses.pageUrl(disk.replace(/\.html$/i, '.md'));
    return url !== path && hasPage(site, url) ? url : null;
  }
  const folder = `${addresses.folderUrl(disk.replace(/\/+$/, ''))}/`;
  return site.pages.find((page) => page.url.startsWith(folder))?.url ?? null;
}

function findRenamed(before: Site, after: Site, gone: Page): Page | undefined {
  const added = after.pages.filter((page) => !hasPage(before, page.url));
  return (
    added.find((page) => page.source === gone.source) ??
    added.find((page) => page.title === gone.title)
  );
}

/** Where a reader on `url` goes when the site changes. */
export function nextUrl(before: Site, after: Site, url: string): string {
  const index = before.pages.findIndex((page) => page.url === url);
  if (index < 0 || hasPage(after, url)) return url;

  const renamed = findRenamed(before, after, before.pages[index]!);
  if (renamed) return renamed.url;

  const nearby = [...before.pages.slice(index + 1), ...before.pages.slice(0, index).reverse()];
  return nearby.find((page) => hasPage(after, page.url))?.url ?? '/';
}
