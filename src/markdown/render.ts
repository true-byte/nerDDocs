import type { Element, ElementContent, Nodes, Root, RootContent } from 'hast';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { PAGE_IDS } from '../page/page-ids.ts';
import { isLevelId } from '../site/config.ts';
import { hrefTo } from '../site/urls.ts';
import { wrapFences } from './fences.ts';
import { textSizes, type TextSize } from './read-size.ts';

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
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeStringify);

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

class Slugger {
  private seen = new Set<string>();

  reserve(id: string): void {
    this.seen.add(id);
  }

  slug(text: string): string {
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
      .replace(/ /g, '-');
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

function rewriteLink(value: string, pageUrl: string): string {
  if (!value || value.startsWith('#') || value.startsWith('//') || HAS_SCHEME.test(value)) {
    return value;
  }
  const [, path = '', suffix = ''] = /^([^?#]*)(.*)$/s.exec(value) ?? [];
  let target = path.replace(/\.md$/i, '.html');
  if (target.startsWith('/')) target = hrefTo(pageUrl, decodePath(target)) || './';
  return target + suffix;
}

function rewriteLinks(root: Root, pageUrl: string): void {
  visitElements(root, (element) => {
    for (const property of ['href', 'src']) {
      const value = element.properties[property];
      if (typeof value === 'string') element.properties[property] = rewriteLink(value, pageUrl);
    }
  });
}

/** A wide table scrolls sideways in its own box, with all its columns. */
function wrapTables(node: Root | Element): void {
  node.children = node.children.map((child) => {
    if (child.type !== 'element') return child;
    wrapTables(child);
    if (child.tagName !== 'table') return child;
    const wrapper: Element = {
      type: 'element',
      tagName: 'div',
      properties: { className: ['wide'] },
      children: [child as ElementContent],
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

export function renderMarkdown(
  source: string,
  pageUrl: string,
  fallbackTitle: string,
  listed: readonly string[],
): RenderedPage {
  const { markdown, unknownLevels } = wrapFences(source, listed);
  const root = processor.runSync(processor.parse(markdown)) as Root;

  const heading = firstHeading(root);
  const title = heading ? textOf(heading).trim() : fallbackTitle;
  const opening = heading ? dropOpeningHeading(root, heading) : false;
  const slugger = new Slugger();
  for (const id of PAGE_IDS) slugger.reserve(id);
  const ownId = heading?.properties.id;
  const titleId = opening && typeof ownId === 'string' && !PAGE_IDS.includes(ownId) ? ownId : slugger.slug(title);
  slugger.reserve(titleId);

  addHeadingIds(root, slugger);
  rewriteLinks(root, pageUrl);
  wrapTables(root);

  const levels = levelsOfPage(root);
  limitSharedHeadings(root, listed);
  limitFootnotes(root);
  const sizes = textSizes(root, title, listed);
  return { title, titleId, html: processor.stringify(root).trim(), unknownLevels, sizes, ...levels };
}
