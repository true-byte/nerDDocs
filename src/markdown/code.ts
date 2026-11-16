import c from '@shikijs/langs/c';
import csharp from '@shikijs/langs/csharp';
import css from '@shikijs/langs/css';
import diff from '@shikijs/langs/diff';
import docker from '@shikijs/langs/docker';
import go from '@shikijs/langs/go';
import html from '@shikijs/langs/html';
import ini from '@shikijs/langs/ini';
import java from '@shikijs/langs/java';
import javascript from '@shikijs/langs/javascript';
import json from '@shikijs/langs/json';
import jsonc from '@shikijs/langs/jsonc';
import markdown from '@shikijs/langs/markdown';
import powershell from '@shikijs/langs/powershell';
import python from '@shikijs/langs/python';
import rust from '@shikijs/langs/rust';
import shellscript from '@shikijs/langs/shellscript';
import shellsession from '@shikijs/langs/shellsession';
import sql from '@shikijs/langs/sql';
import toml from '@shikijs/langs/toml';
import typescript from '@shikijs/langs/typescript';
import xml from '@shikijs/langs/xml';
import yaml from '@shikijs/langs/yaml';
import type { Element, ElementContent, Nodes, Root } from 'hast';
import { createCssVariablesTheme, createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { CHECK_PATH } from '../page/icons.tsx';
import { SCROLL_BOX } from '../page/scroll-boxes.ts';

/**
 * The grammars that ship. Each one adds to the size of the command, so a language joins only on request. A grammar
 * that another one embeds, such as the JavaScript of HTML, comes with it.
 */
const GRAMMARS = [
  shellscript,
  shellsession,
  powershell,
  json,
  jsonc,
  yaml,
  toml,
  ini,
  xml,
  html,
  css,
  javascript,
  typescript,
  python,
  go,
  rust,
  java,
  c,
  csharp,
  sql,
  diff,
  docker,
  markdown,
].flat();

/** Shiki writes the color of each token as a CSS variable of this one theme, which the class of the token replaces. */
const THEME = 'nd';

const highlighter = createHighlighterCoreSync({
  themes: [createCssVariablesTheme({ name: THEME, variablePrefix: '--sx-', fontStyle: false })],
  langs: GRAMMARS,
  engine: createJavaScriptRegexEngine(),
});

/** The fence words that get code colors: the names and aliases of the 23 grammars, in lower case. */
export const LANGUAGES: ReadonlySet<string> = new Set(highlighter.getLoadedLanguages().map((word) => word.toLowerCase()));

/** The class of a token by the CSS variable of its color. A token of any other variable keeps the ink. */
const TOKEN_CLASS: Readonly<Record<string, string>> = {
  '--sx-token-keyword': 'k',
  '--sx-token-changed': 'k',
  '--sx-token-string': 's',
  '--sx-token-string-expression': 's',
  '--sx-token-link': 's',
  '--sx-token-function': 'f',
  '--sx-token-constant': 'n',
  '--sx-token-comment': 'c',
  '--sx-token-inserted': 'i',
  '--sx-token-deleted': 'd',
};

/** Mermaid draws this block itself, so it keeps the HTML that remark writes. */
const MERMAID = 'mermaid';

const BOX_CHARACTER = /[─-╿]/;

/** True when the text holds a box character, from U+2500 to U+257F. */
export function isBoxText(text: string): boolean {
  return BOX_CHARACTER.test(text);
}

function textOf(node: Nodes): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map(textOf).join('');
  return '';
}

function classesOf(element: Element): string[] {
  const classes = element.properties.className;
  return Array.isArray(classes) ? classes.map(String) : [];
}

/** The word of the `language-<word>` class, in lower case, or null. */
function wordOf(code: Element): string | null {
  const name = classesOf(code).find((name) => name.startsWith('language-'));
  return name ? name.slice('language-'.length).toLowerCase() : null;
}

/** The `code` of a `pre` whose only element child is a `code`. */
function codeOf(pre: Element): Element | null {
  const elements = pre.children.filter((child) => child.type === 'element');
  const [code] = elements;
  return elements.length === 1 && code?.tagName === 'code' ? code : null;
}

/** Each token keeps one short class, and the line spans and the tokens in ink become their text. */
function tokenNodes(nodes: readonly ElementContent[]): ElementContent[] {
  return nodes.flatMap((node): ElementContent[] => {
    if (node.type !== 'element') return [node];
    const variable = /var\((--sx-[a-z-]+)\)/.exec(String(node.properties.style ?? ''))?.[1];
    const name = variable === undefined ? undefined : TOKEN_CLASS[variable];
    const children = tokenNodes(node.children);
    if (node.tagName !== 'span' || !name) return children;
    return [{ type: 'element', tagName: 'span', properties: { className: [name] }, children }];
  });
}

/**
 * Shiki's tokens of the text, without its own `pre` and `code`. With no time limit per line, the tokens are the same on
 * a slow machine: Shiki's default limit gives the rest of a line that runs out of time as one token.
 */
function colored(text: string, word: string): ElementContent[] {
  const root = highlighter.codeToHast(text, { lang: word, theme: THEME, tokenizeTimeLimit: 0 });
  const pre = root.children.find((child) => child.type === 'element');
  const code = pre && codeOf(pre);
  return code ? tokenNodes(code.children) : [{ type: 'text', value: text }];
}

/** Drops one line break at the end of the last text node, when that node ends the code. */
function dropLastBreak(node: Element): void {
  const last = node.children.at(-1);
  if (last?.type === 'element') dropLastBreak(last);
  if (last?.type !== 'text' || !last.value.endsWith('\n')) return;
  last.value = last.value.slice(0, -1);
  if (!last.value) node.children.pop();
}

function svg(children: Element[]): Element {
  return {
    type: 'element',
    tagName: 'svg',
    properties: { className: ['i'], viewBox: '0 0 24 24', ariaHidden: 'true' },
    children,
  };
}

const shape = (tagName: string, properties: Element['properties']): Element => ({
  type: 'element',
  tagName,
  properties,
  children: [],
});

/** The copy icon, and the 'check' icon that shows in its place once the code is copied. */
function copyButton(): Element {
  return {
    type: 'element',
    tagName: 'button',
    properties: { type: 'button', className: ['copy'], ariaLabel: 'Copy' },
    children: [
      svg([
        shape('rect', { x: '8', y: '8', width: '12', height: '12', rx: '2' }),
        shape('path', { d: 'M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2' }),
      ]),
      svg([shape('path', { d: CHECK_PATH })]),
    ],
  };
}

/** The box of a block, with its copy icon, or null for a `pre` that keeps the HTML of remark. */
function codeBox(pre: Element): Element | null {
  const code = codeOf(pre);
  const word = code && wordOf(code);
  if (!code || word === MERMAID) return null;
  const text = textOf(code).replace(/\n$/, '');
  if (word !== null && LANGUAGES.has(word)) code.children = colored(text, word);
  else dropLastBreak(code);
  pre.properties.className = [...classesOf(pre), SCROLL_BOX, ...(isBoxText(text) ? ['box'] : [])];
  return { type: 'element', tagName: 'div', properties: { className: ['code'] }, children: [pre, copyButton()] };
}

function visit(node: Root | Element): void {
  node.children = node.children.map((child) => {
    if (child.type !== 'element') return child;
    if (child.tagName === 'pre') return codeBox(child) ?? child;
    visit(child);
    return child;
  }) as typeof node.children;
}

/** Colors each code block under `root`, marks each box diagram, and puts each block in a box with its copy icon. */
export function highlightCode(root: Root): void {
  visit(root);
}
