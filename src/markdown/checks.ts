import type { Element, ElementContent, Nodes, Root, RootContent } from 'hast';
import type { PageProblem, ProblemMark } from '../site/problems.ts';

export interface CheckSource {
  file: string;
  lines: string[];
  fileLines: readonly number[];
  titleLine: number | null;
}

const HEADING = /^h[1-6]$/;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first and the last line of the file that an element comes from, or null. A8 of the design. */
export function elementLines(node: Nodes, fileLines: readonly number[]): { first: number; last: number } | null {
  const position = positionOf(node);
  if (!position) return null;
  const first = fileLines[position.start.line - 1] ?? position.start.line;
  const last = fileLines[position.end.line - 1] ?? first;
  return { first, last: Math.max(first, last) };
}

/** The position of a node, else of its first descendant that has one. */
function positionOf(node: Nodes): Element['position'] {
  if (node.position) return node.position;
  if (!('children' in node)) return undefined;
  for (const child of node.children) {
    const found = positionOf(child);
    if (found) return found;
  }
  return undefined;
}

/**
 * The line, the column and the length of marked text in the lines of an element: the first line from `first` to `last`
 * that holds it, in any case. With none, the first line and no column.
 */
export function markedPlace(
  lines: readonly string[],
  first: number,
  last: number,
  marked: string | null,
): { line: number; column: number | null; length: number; text: string | null } {
  if (marked) {
    const rule = new RegExp(escapeRegExp(marked), 'iu');
    for (let line = first; line <= last; line++) {
      const found = rule.exec(lines[line - 1] ?? '');
      if (found) return { line, column: found.index + 1, length: found[0].length, text: lines[line - 1] ?? null };
    }
  }
  return { line: first, column: null, length: 0, text: lines[first - 1] ?? null };
}

const classesOf = (element: Element): string[] => {
  const value = element.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
};

const isElement = (node: RootContent | ElementContent): node is Element => node.type === 'element';
const isHeading = (element: Element) => HEADING.test(element.tagName);
const rankOf = (element: Element) => Number(element.tagName[1]);

/** A top-level `div.part`: the levels of its `data-l`, and its `div.bd`. */
function partOf(element: Element): { levels: string[]; body: Element | null } | null {
  const { dataL } = element.properties;
  if (element.tagName !== 'div' || !classesOf(element).includes('part') || typeof dataL !== 'string') return null;
  const body = element.children.find((child): child is Element => isElement(child) && classesOf(child).includes('bd'));
  return { levels: dataL.split(' '), body: body ?? null };
}

const isFootnotes = (element: Element) => element.tagName === 'section' && 'dataFootnotes' in element.properties;

function contains(node: Element, target: Element): boolean {
  if (node === target) return true;
  return node.children.some((child) => isElement(child) && contains(child, target));
}

/** The place of an element of the text on the page: the element child of `#page` that holds it, and its place in a part. */
export function markOf(root: Root, node: Element, words: string | null): ProblemMark | null {
  const blocks = root.children.filter(isElement);
  for (const [block, top] of blocks.entries()) {
    if (!contains(top, node)) continue;
    const part = partOf(top);
    if (part?.body && top !== node && part.body !== node) {
      const inner = part.body.children.filter(isElement).findIndex((child) => contains(child, node));
      if (inner >= 0) return { block, inner, words };
    }
    return { block, inner: null, words };
  }
  return null;
}

/** An element of the page, with where it sits and where it shows. */
interface Item {
  el: Element;
  block: number;
  inner: number | null;
  /** The top-level element of the item: its part, or the item itself. */
  top: Top;
  levels: readonly string[];
}

/** A top-level element of the page. */
interface Top {
  el: Element;
  isPart: boolean;
}

/** Stands for the one state of a site with no levels. */
const ONE_LEVEL = ['*'];

/** The 'Empty page' and 'Empty heading' problems of a rendered page. */
export function pageChecks(root: Root, source: CheckSource, listed: readonly string[]): PageProblem[] {
  const all = listed.length ? listed : ONE_LEVEL;
  const { lines, fileLines, titleLine, file } = source;
  const linesOf = (node: Element) => elementLines(node, fileLines);
  const lineText = (line: number) => lines[line - 1] ?? null;
  const levelsOut = (levels: readonly string[]) =>
    !listed.length || all.every((id) => levels.includes(id)) ? [] : listed.filter((id) => levels.includes(id));

  const items: Item[] = [];
  root.children.filter(isElement).forEach((el, block) => {
    if (isFootnotes(el)) return;
    if (titleLine !== null && isHeading(el) && linesOf(el)?.first === titleLine) return;
    const part = listed.length ? partOf(el) : null;
    const shows = el.properties.dataShows;
    const levels = part ? part.levels : typeof shows === 'string' && listed.length ? shows.split(' ') : all;
    const top: Top = { el, isPart: !!part };
    if (!part) {
      items.push({ el, block, inner: null, top, levels });
      return;
    }
    const inside = part.body?.children.filter(isElement) ?? [];
    inside.forEach((child, inner) => items.push({ el: child, block, inner, top, levels }));
  });

  const problems: PageProblem[] = [];
  const base = (name: PageProblem['name']): PageProblem => ({
    name,
    file,
    line: null,
    column: null,
    length: 0,
    text: null,
    fence: null,
    value: '',
    levels: [],
    mark: null,
  });
  const fenceOf = (top: Top | undefined): PageProblem['fence'] => {
    const line = top && linesOf(top.el)?.first;
    return line ? { line, text: lineText(line) ?? '' } : null;
  };
  /** The line and the length of the whole line of an element, from column 1, without its end spaces. */
  const wholeLine = (line: number) => {
    const text = lineText(line);
    return { line, column: 1, length: (text ?? '').trimEnd().length, text };
  };

  const empty = !items.some((item) => !isHeading(item.el));
  if (empty) {
    const line = titleLine ?? 1;
    const place = titleLine !== null ? wholeLine(line) : { line, column: null, length: 0, text: lineText(line) };
    problems.push({ ...base('Empty page'), ...place });
  }

  items.forEach((item, at) => {
    if (empty || !isHeading(item.el)) return;
    const rank = rankOf(item.el);
    const breaks = item.levels.filter((level) => {
      for (const next of items.slice(at + 1)) {
        if (!next.levels.includes(level)) continue;
        if (!isHeading(next.el)) return false;
        if (rankOf(next.el) <= rank) return true;
      }
      return true;
    });
    if (!breaks.length) return;
    let fence: Top | undefined;
    for (const next of items.slice(at + 1)) {
      if (next.top.isPart && next.top !== item.top) {
        fence = next.top;
        break;
      }
      if (isHeading(next.el) && rankOf(next.el) <= rank) break;
    }
    const line = linesOf(item.el)?.first ?? 1;
    problems.push({
      ...base('Empty heading'),
      ...wholeLine(line),
      fence: fenceOf(fence),
      levels: levelsOut(breaks),
      mark: { block: item.block, inner: item.inner, words: null },
    });
  });
  return problems;
}
