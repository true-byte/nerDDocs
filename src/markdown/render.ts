import type { Element, ElementContent, Nodes, Root, RootContent } from 'hast';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { isLevelId } from '../site/config.ts';
import { hrefTo } from '../site/urls.ts';
import { wrapFences } from './fences.ts';

export interface RenderedPage {
  title: string;
  titleId: string;
  html: string;
  /** The level ids of the page, in order of first use. */
  levelIds: string[];
  /** Each different data-l value of the page, in order of first use. */
  parts: string[];
  /** True when the page has text outside its parts. */
  hasShared: boolean;
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
    if (typeof element.properties.id === 'string') slugger.reserve(element.properties.id);
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

/** A part can sit inside a wrapper such as a details, and the rule that hides parts reaches it there. */
function levelsOfPage(root: Root): Pick<RenderedPage, 'levelIds' | 'parts' | 'hasShared'> {
  const values: string[] = [];
  visitElements(root, (element) => {
    const value = partLevels(element);
    if (value !== null) values.push(value);
  });
  const parts = [...new Set(values)];
  return {
    levelIds: [...new Set(parts.flatMap((value) => value.split(' ')))],
    parts,
    hasShared: root.children.some((node) => partLevels(node) === null && !isBlank(node) && !isFootnotes(node)),
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

export function renderMarkdown(source: string, pageUrl: string, fallbackTitle: string): RenderedPage {
  const root = processor.runSync(processor.parse(wrapFences(source))) as Root;

  const heading = firstHeading(root);
  const title = heading ? textOf(heading).trim() : fallbackTitle;
  const opening = heading ? dropOpeningHeading(root, heading) : false;
  const slugger = new Slugger();
  const titleId =
    opening && typeof heading?.properties.id === 'string' ? heading.properties.id : slugger.slug(title);
  slugger.reserve(titleId);

  addHeadingIds(root, slugger);
  rewriteLinks(root, pageUrl);
  wrapTables(root);

  const levels = levelsOfPage(root);
  limitFootnotes(root);
  return { title, titleId, html: processor.stringify(root).trim(), ...levels };
}
