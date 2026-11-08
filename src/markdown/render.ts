import type { Element, ElementContent, Nodes, Root, RootContent } from 'hast';
import { posix } from 'node:path';
import { PAGE_IDS } from '../page/page-ids.ts';
import { SCROLL_BOX } from '../page/scroll-boxes.ts';
import { isLevelId } from '../site/config.ts';
import { isMarkdownName } from '../site/names.ts';
import { encodeUrl, hrefTo, pageUrl as addressOf } from '../site/urls.ts';
import type { DiagramBuild } from '../page/diagrams.ts';
import { highlightCode } from './code.ts';
import { wrapDiagrams } from './diagrams.ts';
import { embedFiles, type PageFiles, type PageProblem, type UsedFile } from './embed.ts';
import { wrapFences } from './fences.ts';
import { indexPage } from './page-index.ts';
import { parseMarkdown, processor } from './parse.ts';
import { textSizes, type TextSize } from './read-size.ts';

/** A heading that the contents panel lists under the open page. */
export interface OutlineRow {
  /** The id of the heading. */
  id: string;
  /** The plain text of the heading, trimmed. */
  text: string;
  /** The rank of the heading, 1 for h1 to 6 for h6. */
  rank: number;
  /** The levels at which the heading shows, as `data-shows` writes them, or null when it shows at every level. */
  shows: string | null;
}

export interface SearchUnit {
  /** The text of the block, with each run of white space as one space, trimmed. */
  text: string;
  /** The levels string of the block, or null when it shows at every level. */
  levels: string | null;
  /** The id and the text of the nearest heading above the block, the page title excluded, or null. */
  headingId: string | null;
  heading: string | null;
}

export interface RenderedPage {
  title: string;
  titleId: string;
  html: string;
  /** The words of fence lines that look like level ids and are not listed, in order of first use. */
  unknownLevels: string[];
  /** Each different data-l value of the page, in order of first use. */
  parts: string[];
  /** True when the page has text outside its parts. */
  hasShared: boolean;
  /** True when the text outside the parts is more than headings and details that hold only parts. */
  hasSharedText: boolean;
  /** The words and images of the text that each level shows. */
  sizes: Record<string, TextSize>;
  /** The rows of the outline in page order. */
  outline: OutlineRow[];
  /** Every file that the page embeds, missing ones too. Empty without `files`. */
  uses: UsedFile[];
  /** Every block that cannot show, as terminal lines. Empty without `files`. */
  problems: PageProblem[];
  /** The Mermaid build that the page loads. */
  diagrams: DiagramBuild;
  /** Each element id of `html` that shows at some levels only, with its levels string. Headings with the same text share the union of their levels. An id that shows at every level is absent. */
  anchors: Record<string, string>;
  /** Each link of the page to a page of the site with a hash, as the address of the target page and its hash, decoded, such as '/user-guide/backups/restore.html#pick-a-day'. A link to '#id' on the same page gives the page's own address. In page order, without repeats. */
  links: string[];
  /** The search units of the page, in page order. */
  search: SearchUnit[];
}

const HEADING = /^h[1-6]$/;

function textOf(node: Nodes): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map(textOf).join('');
  return '';
}

function visitElements(node: Root | Element, visit: (element: Element) => void): void {
  for (const child of node.children) {
    if (child.type === 'element') {
      visit(child);
      visitElements(child, visit);
    }
  }
}

function isTitleHeading(element: Element): boolean {
  const classes = element.properties.className;
  const isFootnoteHeading = Array.isArray(classes) && classes.includes('sr-only');
  return HEADING.test(element.tagName) && !isFootnoteHeading && textOf(element).trim() !== '';
}

/** The data-l value of a part that a fence made. */
function partLevels(node: RootContent): string | null {
  if (node.type !== 'element' || node.tagName !== 'div') return null;
  const { className, dataL } = node.properties;
  if (!Array.isArray(className) || !className.includes('part') || typeof dataL !== 'string') return null;
  return dataL.split(' ').every(isLevelId) ? dataL : null;
}

/** A heading inside a part shows at some levels only, so it never gives the page title. */
function firstHeading(node: Root | Element): Element | undefined {
  for (const child of node.children) {
    if (child.type !== 'element' || partLevels(child) !== null) continue;
    const found = isTitleHeading(child) ? child : firstHeading(child);
    if (found) return found;
  }
  return undefined;
}

function isBlank(node: RootContent): boolean {
  return node.type === 'comment' || node.type === 'doctype' || (node.type === 'text' && !node.value.trim());
}

/** The heading that opens the file shows as the page title, so the text drops it. */
function dropOpeningHeading(root: Root, heading: Element): boolean {
  const opening = root.children.find((node) => !isBlank(node));
  if (opening !== heading) return false;
  root.children.splice(root.children.indexOf(heading), 1);
  return true;
}

/** The id of a text before a number makes it unique: lowercase, with letters, marks, digits, `_` and `-`, spaces as `-`. */
export function slugBase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

class Slugger {
  private seen = new Set<string>();

  reserve(id: string): void {
    this.seen.add(id);
  }

  slug(text: string): string {
    const base = slugBase(text);
    let id = base;
    for (let n = 1; this.seen.has(id); n++) id = `${base}-${n}`;
    this.seen.add(id);
    return id;
  }
}

function addHeadingIds(root: Root, slugger: Slugger): void {
  const headings: Element[] = [];
  visitElements(root, (element) => {
    if (!HEADING.test(element.tagName)) return;
    const { id } = element.properties;
    if (typeof id === 'string' && !PAGE_IDS.includes(id)) slugger.reserve(id);
    else headings.push(element);
  });
  for (const heading of headings) heading.properties.id = slugger.slug(textOf(heading));
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** The path in the docs folder, with `/` first, that a link path points to from the file `page`, or null when it leaves the folder. */
function docsPath(path: string, page: string): string | null {
  const decoded = decodePath(path);
  if (decoded.startsWith('/')) return posix.normalize(decoded);
  const joined = posix.normalize(posix.join(posix.dirname(page), decoded));
  if (joined === '..' || joined.startsWith('../')) return null;
  return `/${joined.replace(/^\.(\/|$)/, '')}`;
}

const folderOf = (url: string) => url.slice(0, url.lastIndexOf('/') + 1);

/**
 * A link to a Markdown file points to the address of its page. A link to any other file keeps the path of the file on
 * disk, from the address of the page. With no `files`, and for a path that leaves the docs folder, a link stays as
 * written, with `.html` for `.md`.
 */
function rewriteLink(value: string, pageUrl: string, files?: PageFiles): string {
  if (!value || value.startsWith('#') || value.startsWith('//') || HAS_SCHEME.test(value)) {
    return value;
  }
  const [, path = '', suffix = ''] = /^([^?#]*)(.*)$/s.exec(value) ?? [];
  const target = files && path ? docsPath(path, files.page) : null;
  if (!files || target === null) {
    let written = path.replace(/\.md$/i, '.html');
    if (written.startsWith('/')) written = hrefTo(pageUrl, decodePath(written)) || './';
    return written + suffix;
  }
  if (isMarkdownName(target)) {
    const file = target.slice(1);
    return (hrefTo(pageUrl, files.address?.(file) ?? addressOf(file)) || './') + suffix;
  }
  // A page whose address sits in the folder of its file reaches the file by the path as written.
  if (!path.startsWith('/') && folderOf(pageUrl) === folderOf(`/${files.page}`)) return value;
  return (hrefTo(pageUrl, target) || './') + suffix;
}

/** Each URL of a `srcset`, with its size kept. */
function rewriteSrcset(value: string, rewrite: (url: string) => string): string {
  return value
    .split(',')
    .map((candidate) => candidate.replace(/^(\s*)(\S+)/, (_whole, space: string, url: string) => space + rewrite(url)))
    .join(',');
}

/**
 * The address and the decoded hash that a link to a page of the site opens, or null for a link with no hash or to
 * anything else. `written` is the link as the file has it, and `href` the link as the page has it.
 */
function pageLink(written: string, href: string, pageUrl: string, files?: PageFiles): string | null {
  const hash = /#(.+)$/s.exec(written)?.[1];
  if (!hash || written.startsWith('//') || HAS_SCHEME.test(written)) return null;
  if (!written.startsWith('#')) {
    const path = /^[^?#]*/.exec(written)![0];
    const target = files ? docsPath(path, files.page) : decodePath(path);
    if (!path || target === null || !isMarkdownName(target)) return null;
  }
  const resolved = new URL(href, `http://site${encodeUrl(pageUrl)}`);
  return `${decodePath(resolved.pathname)}#${decodePath(hash)}`;
}

function rewriteLinks(root: Root, pageUrl: string, files?: PageFiles): string[] {
  const rewrite = (value: string) => rewriteLink(value, pageUrl, files);
  const links = new Set<string>();
  visitElements(root, (element) => {
    const { href } = element.properties;
    if (element.tagName === 'a' && typeof href === 'string') {
      const link = pageLink(href, rewrite(href), pageUrl, files);
      if (link) links.add(link);
    }
    for (const property of ['href', 'src', 'poster']) {
      const value = element.properties[property];
      if (typeof value === 'string') element.properties[property] = rewrite(value);
    }
    const { srcSet } = element.properties;
    if (typeof srcSet === 'string') element.properties.srcSet = rewriteSrcset(srcSet, rewrite);
  });
  return [...links];
}

/** A cell with more characters than this wraps at its spaces. A shorter cell stays on one line. */
const SHORT_CELL = 12;

/** The cells of a table, without the cells of a table inside one of them. */
function cellsOf(node: Element, found: Element[] = []): Element[] {
  for (const child of node.children) {
    if (child.type !== 'element' || child.tagName === 'table') continue;
    if (child.tagName === 'th' || child.tagName === 'td') found.push(child);
    else cellsOf(child, found);
  }
  return found;
}

function markLongCells(table: Element): void {
  for (const cell of cellsOf(table)) {
    const text = textOf(cell).replace(/\s+/g, ' ').trim();
    if ([...text].length <= SHORT_CELL) continue;
    const classes = cell.properties.className;
    cell.properties.className = [...(Array.isArray(classes) ? classes.map(String) : []), 'long'];
  }
}

/**
 * A table sits in an outer box that never scrolls and holds the fades, around an inner box that scrolls sideways with
 * all its columns.
 */
function wrapTables(node: Root | Element): void {
  node.children = node.children.map((child) => {
    if (child.type !== 'element') return child;
    wrapTables(child);
    if (child.tagName !== 'table') return child;
    markLongCells(child);
    const scroller: Element = {
      type: 'element',
      tagName: 'div',
      properties: { className: [SCROLL_BOX] },
      children: [child as ElementContent],
    };
    const wrapper: Element = {
      type: 'element',
      tagName: 'div',
      properties: { className: ['wide'] },
      children: [scroller],
    };
    return wrapper;
  }) as typeof node.children;
}

function isFootnotes(node: RootContent): boolean {
  return node.type === 'element' && node.tagName === 'section' && 'dataFootnotes' in node.properties;
}

function isPartBody(element: Element): boolean {
  const classes = element.properties.className;
  return Array.isArray(classes) && classes.includes('bd');
}

/** The levels with text in a block. A heading is no text, and shared content is text at the levels of `around`. */
function textLevels(node: RootContent, around: readonly string[]): readonly string[] {
  if (isBlank(node) || isFootnotes(node)) return [];
  if (node.type !== 'element') return around;
  if (HEADING.test(node.tagName) || node.tagName === 'summary') return [];
  const part = partLevels(node)?.split(' ');
  if (!part && node.tagName !== 'details' && !isPartBody(node)) return around;
  return node.children.flatMap((child) => textLevels(child, part ?? around));
}

const headingRank = (node: RootContent) =>
  node.type === 'element' && HEADING.test(node.tagName) ? Number(node.tagName[1]) : null;

/**
 * A top-level shared heading or details shows only at the levels with text in its section, when
 * another level has none. The section of a heading runs to the next one of the same or higher rank.
 */
function limitSharedHeadings(root: Root, listed: readonly string[]): void {
  root.children.forEach((node, at) => {
    const rank = headingRank(node);
    if (node.type !== 'element' || (rank === null && node.tagName !== 'details')) return;
    let section: RootContent[] = [node];
    if (rank !== null) {
      const rest = root.children.slice(at + 1);
      const end = rest.findIndex((next) => (headingRank(next) ?? Infinity) <= rank);
      section = end < 0 ? rest : rest.slice(0, end);
    }
    const withText = new Set(section.flatMap((block) => textLevels(block, listed)));
    const shown = listed.filter((id) => withText.has(id));
    if (shown.length && shown.length < listed.length) node.properties.dataShows = shown.join(' ');
  });
}

/** The plain text of a heading, without its footnote references. */
function headingText(node: Nodes): string {
  if (node.type === 'element' && node.properties.dataFootnoteRef !== undefined) return '';
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map(headingText).join('');
  return '';
}

/** Each heading that can have a row, in page order. A closed details cannot be jumped to, so its headings have none. */
function outlineHeadings(node: Root | Element, around: string | null, listed: readonly string[], found: OutlineRow[]): void {
  for (const child of node.children) {
    if (child.type !== 'element' || child.tagName === 'details' || isFootnotes(child)) continue;
    const levels = partLevels(child) ?? around;
    const rank = headingRank(child);
    if (rank === null) {
      outlineHeadings(child, levels, listed, found);
      continue;
    }
    const text = headingText(child).trim();
    const { id, dataShows } = child.properties;
    if (!text || typeof id !== 'string') continue;
    const shows = levels ?? (typeof dataShows === 'string' ? dataShows : null);
    const everyLevel = shows !== null && listed.every((level) => shows.split(' ').includes(level));
    found.push({ id, text, rank, shows: everyLevel ? null : shows });
  }
}

/** The outline lists the headings of the two highest ranks that the text uses, counted over all levels. */
function outlineOf(root: Root, listed: readonly string[]): OutlineRow[] {
  const headings: OutlineRow[] = [];
  outlineHeadings(root, null, listed, headings);
  const ranks = [...new Set(headings.map((row) => row.rank))].sort((a, b) => a - b).slice(0, 2);
  return headings.filter((row) => ranks.includes(row.rank));
}

/** Not a level id, so it stands for text that shows at every level. */
const EVERY_LEVEL = '*';

/** A part can sit inside a wrapper such as a details, and the rule that hides parts reaches it there. */
function levelsOfPage(root: Root): Pick<RenderedPage, 'parts' | 'hasShared' | 'hasSharedText'> {
  const values: string[] = [];
  visitElements(root, (element) => {
    const value = partLevels(element);
    if (value !== null) values.push(value);
  });
  return {
    parts: [...new Set(values)],
    hasShared: root.children.some((node) => partLevels(node) === null && !isBlank(node) && !isFootnotes(node)),
    hasSharedText: root.children.some((node) => textLevels(node, [EVERY_LEVEL]).includes(EVERY_LEVEL)),
  };
}

/** The levels of the part around each footnote reference, by the id of the reference. */
function footnoteReferences(node: Root | Element, around: string | null, found: Map<string, string | null>): void {
  for (const child of node.children) {
    if (child.type !== 'element' || isFootnotes(child)) continue;
    const levels = partLevels(child) ?? around;
    const { id, dataFootnoteRef } = child.properties;
    if (dataFootnoteRef !== undefined && typeof id === 'string') found.set(id, levels);
    footnoteReferences(child, levels, found);
  }
}

function markPart(element: Element, levels: string[]): void {
  const classes = element.properties.className;
  element.properties.className = [...(Array.isArray(classes) ? classes.map(String) : []), 'part'];
  element.properties.dataL = levels.join(' ');
}

/**
 * A footnote shows only at the levels of the parts that reference it. Its number stays,
 * since a hidden item of a list takes no number.
 */
function limitFootnotes(root: Root): void {
  const section = root.children.find(isFootnotes) as Element | undefined;
  if (!section) return;
  const references = new Map<string, string | null>();
  footnoteReferences(root, null, references);

  const items: Element[] = [];
  visitElements(section, (element) => {
    if (element.tagName === 'li') items.push(element);
  });
  const limited = new Set<string>();
  let everyLimited = true;
  for (const item of items) {
    const links: { link: Element; levels: string | null }[] = [];
    visitElements(item, (element) => {
      if (element.properties.dataFootnoteBackref === undefined) return;
      const { href } = element.properties;
      const levels = typeof href === 'string' ? (references.get(href.slice(1)) ?? null) : null;
      links.push({ link: element, levels });
    });
    if (!links.length || links.some(({ levels }) => levels === null)) {
      everyLimited = false;
      continue;
    }
    const ids = [...new Set(links.flatMap(({ levels }) => levels!.split(' ')))];
    for (const { link, levels } of links) {
      if (levels!.split(' ').length < ids.length) markPart(link, levels!.split(' '));
    }
    markPart(item, ids);
    for (const id of ids) limited.add(id);
  }
  if (!limited.size) return;
  items.forEach((item, index) => {
    item.properties.value = String(index + 1);
  });
  if (!everyLimited) return;
  markPart(section, [...limited]);
  section.children = [
    { type: 'element', tagName: 'div', properties: { className: ['bd'] }, children: section.children },
  ];
}

/** With no `files`, no embed pass runs and each image stays as today, as the theme preview needs. */
export function renderMarkdown(
  source: string,
  pageUrl: string,
  fallbackTitle: string,
  listed: readonly string[],
  files?: PageFiles,
): RenderedPage {
  const { markdown, unknownLevels, fileLines } = wrapFences(source, listed);
  const root = parseMarkdown(markdown);

  const heading = firstHeading(root);
  const title = heading ? textOf(heading).trim() : fallbackTitle;
  const opening = heading ? dropOpeningHeading(root, heading) : false;
  const { uses, problems, ids } = files ? embedFiles(root, files, pageUrl) : { uses: [], problems: [], ids: [] };
  const slugger = new Slugger();
  for (const id of PAGE_IDS) slugger.reserve(id);
  // The anchors of an API reference keep their ids, so a heading of the page takes another.
  for (const id of ids) slugger.reserve(id);
  const ownId = heading?.properties.id;
  const titleId = opening && typeof ownId === 'string' && !PAGE_IDS.includes(ownId) ? ownId : slugger.slug(title);
  slugger.reserve(titleId);

  addHeadingIds(root, slugger);
  const links = rewriteLinks(root, pageUrl, files);
  wrapTables(root);
  const diagrams = wrapDiagrams(root, files?.page ?? null, fileLines);
  highlightCode(root);

  const levels = levelsOfPage(root);
  limitSharedHeadings(root, listed);
  const outline = outlineOf(root, listed);
  limitFootnotes(root);
  const sizes = textSizes(root, title, listed);
  const { anchors, search } = indexPage(root, listed, heading && !opening ? heading : undefined);
  const html = processor.stringify(root).trim();
  return { title, titleId, html, unknownLevels, sizes, outline, uses, problems, diagrams, anchors, links, search, ...levels };
}
