import type { Element, ElementContent, Nodes, Root, RootContent } from 'hast';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { hrefTo } from '../site/urls.ts';

export interface RenderedPage {
  title: string;
  titleId: string;
  html: string;
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

function firstHeading(root: Root): Element | undefined {
  let first: Element | undefined;
  visitElements(root, (element) => {
    if (!first && isTitleHeading(element)) first = element;
  });
  return first;
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

export function renderMarkdown(source: string, pageUrl: string, fallbackTitle: string): RenderedPage {
  const root = processor.runSync(processor.parse(source)) as Root;

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

  return { title, titleId, html: processor.stringify(root).trim() };
}
