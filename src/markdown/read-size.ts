import type { Element, Root } from 'hast';

export interface TextSize {
  words: number;
  images: number;
}

const NOT_TEXT = ['script', 'style', 'template'];
const HEADING = /^h[1-6]$/;
const HOLDS_WORD = /[\p{L}\p{N}]/u;

function wordsIn(text: string): number {
  return text.split(/\s+/).filter((token) => HOLDS_WORD.test(token)).length;
}

function hasClass(element: Element, name: string): boolean {
  const classes = element.properties.className;
  return Array.isArray(classes) && classes.includes(name);
}

const listsLevel = (value: unknown, level: string) => typeof value !== 'string' || value.split(/\s+/).includes(level);

/** What the CSS rule `levelRule` shows. The level '' has no rule. */
function showsAt(element: Element, level: string): boolean {
  if (!level) return true;
  const { dataL, dataShows } = element.properties;
  return (!hasClass(element, 'part') || listsLevel(dataL, level)) && listsLevel(dataShows, level);
}

function addText(node: Root | Element, level: string, inFootnotes: boolean, size: TextSize): void {
  for (const child of node.children) {
    if (child.type === 'text') size.words += wordsIn(child.value);
    if (child.type !== 'element' || NOT_TEXT.includes(child.tagName) || child.properties.hidden) continue;
    if (!showsAt(child, level)) continue;
    if (inFootnotes && HEADING.test(child.tagName) && hasClass(child, 'sr-only')) continue;
    if (child.tagName === 'img') size.images++;
    addText(child, level, inFootnotes || 'dataFootnotes' in child.properties, size);
  }
}

function sizeAt(root: Root, title: string, level: string): TextSize {
  const size: TextSize = { words: 0, images: 0 };
  addText(root, level, false, size);
  if (size.words || size.images) size.words += wordsIn(title);
  return size;
}

/** One entry per listed level id, and the entry '' for all text with no level rule. */
export function textSizes(root: Root, title: string, listed: readonly string[]): Record<string, TextSize> {
  return Object.fromEntries(['', ...listed].map((level) => [level, sizeAt(root, title, level)]));
}
