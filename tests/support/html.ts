import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches an opening tag that has each of these attributes, in any order and among others. */
export function openingTag(name: string, attributes: Record<string, string> = {}): RegExp {
  const each = Object.entries(attributes).map(([key, value]) => `(?=[^>]*\\s${escaped(key)}="${escaped(value)}")`);
  return new RegExp(`<${name}\\b${each.join('')}[^>]*>`);
}

/** The HTML of the element whose opening tag starts at `start`, up to its matching end tag. */
export function elementAt(html: string, start: number): string {
  const name = /^<([a-z][a-z0-9]*)/.exec(html.slice(start))?.[1];
  if (!name) throw new Error(`No opening tag at ${start}.`);
  const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, 'g');
  tags.lastIndex = start;
  let depth = 0;
  for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
    depth += tag[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  throw new Error(`The ${name} at ${start} has no end tag.`);
}

/** The HTML of the innermost element named `name` around the first place where `inside` shows. */
export function elementAround(html: string, name: string, inside: string | RegExp): string {
  const at = typeof inside === 'string' ? html.indexOf(inside) : html.search(inside);
  if (at < 0) throw new Error(`${String(inside)} is not in the HTML.`);
  const opening = new RegExp(`<${name}\\b`, 'g');
  let found: string | null = null;
  for (let tag = opening.exec(html); tag && tag.index < at; tag = opening.exec(html)) {
    const element = elementAt(html, tag.index);
    if (tag.index + element.length > at) found = element;
  }
  if (found === null) throw new Error(`No ${name} holds ${String(inside)}.`);
  return found;
}

const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The attributes of each table cell, as written in its opening tag, by the plain text of the cell. */
export function cells(html: string): { text: string; attributes: string }[] {
  return [...html.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(([, , attributes = '', inner = '']) => ({
    text: plain(inner),
    attributes,
  }));
}

/** The class of the only cell with this plain text, or null for a cell with no class. */
export function cellClass(html: string, text: string): string | null {
  const found = cells(html).filter((cell) => cell.text === text);
  if (found.length !== 1) throw new Error(`${found.length} cells hold '${text}'.`);
  return /\sclass="([^"]*)"/.exec(found[0]!.attributes)?.[1] ?? null;
}

const OPENING_TAG = /<([a-z][a-z0-9-]*)((?:\s+[^\s=>"']+(?:="[^"]*")?)*)\s*(\/?)>/gi;

/** The attributes of an opening tag, by name, as written. */
export function attributesOf(tag: string): Record<string, string> {
  const inner = tag.replace(/^<[a-z][a-z0-9-]*/i, '');
  return Object.fromEntries([...inner.matchAll(/\s([^\s=>"']+)(?:="([^"]*)")?/g)].map(([, name = '', value = '']) => [name, value]));
}

/** The attributes of each `img` of the HTML, in page order. */
export const imagesIn = (html: string) => [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => attributesOf(tag));

/** The HTML with the attributes of each opening tag in the order of their names, and no white space between two tags. */
export function sortedTags(html: string): string {
  return html
    .replace(OPENING_TAG, (_, name: string, attributes: string, close: string) => {
      const sorted = Object.entries(attributesOf(`<${name}${attributes}>`))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => ` ${key}="${value}"`);
      return `<${name}${sorted.join('')}${close}>`;
    })
    .replace(/>\s+</g, '><')
    .trim();
}

type HtmlNode = DefaultTreeAdapterTypes.Node;

/** The decoded attributes of each `iframe` of the HTML, in page order. The frame in a `noscript` is text, as with a script. */
function iframesOf(html: string): Record<string, string>[] {
  const found: Record<string, string>[] = [];
  const walk = (node: HtmlNode) => {
    if (!('childNodes' in node)) return;
    if ('attrs' in node && node.nodeName === 'iframe') found.push(Object.fromEntries(node.attrs.map(({ name, value }) => [name, value])));
    for (const child of node.childNodes) walk(child);
    if (node.nodeName === 'template') walk((node as DefaultTreeAdapterTypes.Template).content);
  };
  walk(parseFragment(html));
  return found;
}

/** The decoded frame document, `data-srcdoc`, of each `iframe` of the HTML, in page order. */
export const srcdocsOf = (html: string) =>
  iframesOf(html).flatMap(({ 'data-srcdoc': srcdoc }) => (srcdoc === undefined ? [] : [srcdoc]));

/** For each `iframe` of the HTML with a frame document, in page order, the text of the document at each place that its `data-urls` gives. */
export const frameAddressesOf = (html: string) =>
  iframesOf(html).flatMap(({ 'data-srcdoc': srcdoc, 'data-urls': urls }) => {
    if (srcdoc === undefined) return [];
    const at = urls ? urls.split(' ').map(Number) : [];
    return [Array.from({ length: at.length / 2 }, (_, pair) => srcdoc.slice(at[pair * 2], at[pair * 2 + 1]))];
  });
