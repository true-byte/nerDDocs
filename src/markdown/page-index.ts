import type { Element, Root } from 'hast';
import type { SearchUnit } from './render.ts';

/** The level ids at which an element shows, in the order of the listed levels. */
type Shown = readonly string[];

const HEADING = /^h[1-6]$/;
/** A block whose text is one search unit. */
const UNIT_TAGS = new Set(['p', 'li', 'tr', 'pre', 'h2', 'h3', 'h4', 'h5', 'h6', 'dt', 'dd', 'summary']);
/** An element inside a unit that holds units of its own, so its text is not part of the unit around it. */
const INNER_BLOCKS = new Set([
  'ul',
  'ol',
  'dl',
  'table',
  'pre',
  'blockquote',
  'details',
  'div',
  'section',
  'figure',
  'li',
  'tr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);
/** Elements that hold no text a reader reads. */
const NO_TEXT_TAGS = new Set(['svg', 'script', 'style', 'noscript', 'iframe', 'template', 'button', 'img']);

const classesOf = (element: Element): string[] => {
  const value = element.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
};

/** A diagram, a wireframe, a box diagram, a footnote mark or an element with no text gives no search text. */
function givesNoText(element: Element): boolean {
  if (NO_TEXT_TAGS.has(element.tagName)) return true;
  const classes = classesOf(element);
  if (classes.includes('dg') || classes.includes('wf')) return true;
  if (element.tagName === 'pre' && classes.includes('box')) return true;
  return element.properties.dataFootnoteBackref !== undefined || element.properties.dataFootnoteRef !== undefined;
}

/** Stands for the one state of a site with no levels, where every element shows. */
const NO_LEVELS: Shown = ['*'];

/** The levels that an element itself limits its content to: its `data-l` as a part, and its `data-shows`. */
function ownLevels(element: Element, around: Shown): Shown {
  if (around === NO_LEVELS) return around;
  let shown = around;
  const { dataL, dataShows } = element.properties;
  if (classesOf(element).includes('part') && typeof dataL === 'string') {
    const ids = dataL.split(' ');
    shown = shown.filter((id) => ids.includes(id));
  }
  if (typeof dataShows === 'string') {
    const ids = dataShows.split(' ');
    shown = shown.filter((id) => ids.includes(id));
  }
  return shown;
}

const spaced = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The text of an element, without the text of the inner blocks when `skipBlocks`. A line break is a space. */
function textIn(node: Element, skipBlocks: boolean): string {
  let text = '';
  for (const child of node.children) {
    if (child.type === 'text') text += child.value;
    else if (child.type === 'element') {
      if (givesNoText(child) || (skipBlocks && INNER_BLOCKS.has(child.tagName))) continue;
      text += child.tagName === 'br' ? ' ' : textIn(child, skipBlocks);
    }
  }
  return text;
}

/** The text of a unit block: a row joins its cells with ' · ', and a list item leaves out the lists inside it. */
function unitText(element: Element): string {
  if (element.tagName === 'tr') {
    const cells = element.children.filter(
      (child): child is Element => child.type === 'element' && (child.tagName === 'td' || child.tagName === 'th'),
    );
    return spaced(cells.map((cell) => spaced(textIn(cell, false))).join(' · '));
  }
  if (element.tagName === 'pre') return spaced(textIn(element, false));
  return spaced(textIn(element, true));
}

const isSrOnly = (element: Element) => classesOf(element).includes('sr-only');

interface Heading {
  id: string;
  text: string;
  shown: Shown;
}

export interface PageIndex {
  anchors: Record<string, string>;
  search: SearchUnit[];
}

/**
 * The levels of each element id that shows at some levels only, and the search units of the page, from the tree as
 * the page shows it. `title` is the heading that gives the page title, when it stays in the text.
 */
export function indexPage(root: Root, listed: readonly string[], title?: Element): PageIndex {
  const levelsOf = (shown: Shown): string | null =>
    shown === NO_LEVELS || shown.length === listed.length ? null : listed.filter((id) => shown.includes(id)).join(' ');

  const ids: { id: string; shown: Shown; text: string | null }[] = [];
  const search: SearchUnit[] = [];
  const headings: Heading[] = [];

  const nearestHeading = (shown: Shown): Heading | null => {
    for (let at = headings.length - 1; at >= 0; at--) {
      const heading = headings[at]!;
      if (heading.shown.some((id) => shown.includes(id))) return heading;
    }
    return null;
  };

  function addUnit(element: Element, shown: Shown): void {
    if (!shown.length) return;
    const text = unitText(element);
    if (!text) return;
    const isHeading = HEADING.test(element.tagName);
    const own = isHeading ? headings.at(-1) : null;
    const heading = own && own.id === element.properties.id ? own : nearestHeading(shown);
    search.push({ text, levels: levelsOf(shown), headingId: heading?.id ?? null, heading: heading?.text ?? null });
  }

  /** Walks the children of a unit block for the blocks inside it that give units of their own. */
  function walkInside(node: Element, shown: Shown): void {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      const inner = ownLevels(child, shown);
      collectId(child, inner);
      if (givesNoText(child)) collectIdsIn(child, inner);
      else if (INNER_BLOCKS.has(child.tagName)) visit(child, inner);
      else walkInside(child, inner);
    }
  }

  function collectId(element: Element, shown: Shown): void {
    const { id } = element.properties;
    if (typeof id !== 'string' || !id) return;
    const text = HEADING.test(element.tagName) ? spaced(textIn(element, false)) : null;
    ids.push({ id, shown, text });
  }

  function visit(element: Element, shown: Shown): void {
    const tag = element.tagName;
    if (HEADING.test(tag) && element !== title && !isSrOnly(element)) {
      const { id } = element.properties;
      const text = spaced(textIn(element, false));
      if (typeof id === 'string' && text) headings.push({ id, text, shown });
    }
    if (UNIT_TAGS.has(tag) && !isSrOnly(element) && element !== title) {
      addUnit(element, shown);
      if (tag !== 'pre' && tag !== 'tr') walkInside(element, shown);
      else if (tag === 'tr') collectIdsIn(element, shown);
      return;
    }
    walkChildren(element, shown);
  }

  /** The ids inside a row or another block whose text is whole, with no unit inside it. */
  function collectIdsIn(node: Element, shown: Shown): void {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      const inner = ownLevels(child, shown);
      collectId(child, inner);
      collectIdsIn(child, inner);
    }
  }

  function walkChildren(node: Root | Element, shown: Shown): void {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      const inner = ownLevels(child, shown);
      collectId(child, inner);
      if (givesNoText(child)) collectIdsIn(child, inner);
      else visit(child, inner);
    }
  }

  walkChildren(root, listed.length ? listed : NO_LEVELS);

  // Headings with the same text count as one target, at the levels of all of them.
  const byText = new Map<string, Set<string>>();
  for (const { text, shown } of ids) {
    if (text === null) continue;
    const union = byText.get(text) ?? new Set<string>();
    for (const id of shown) union.add(id);
    byText.set(text, union);
  }
  const anchors: Record<string, string> = {};
  for (const { id, shown, text } of ids) {
    const all = text === null ? shown : [...byText.get(text)!];
    if (shown === NO_LEVELS || !all.length || Object.hasOwn(anchors, id)) continue;
    const levels = levelsOf(listed.filter((level) => all.includes(level)));
    if (levels !== null) anchors[id] = levels;
  }
  return { anchors, search };
}
