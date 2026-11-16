import type { Element, Nodes, Root } from 'hast';
import { createHash } from 'node:crypto';
import type { DiagramBuild } from '../page/diagrams.ts';
import { mermaidText } from './mermaid-text.ts';

/** A type of diagram that only the full build draws, by the start of the text that Mermaid parses. Case counts. */
const FULL_TYPE = /^(?:mindmap|architecture|flowchart-elk)/;
/** The ELK layout, as a word of the front matter or of a directive, such as `layout: elk` or `layout: elk.stress`. */
const ELK = /\belk\b/;
/** Math, which only the full build draws. */
const MATH = '$$';

/** True when a Mermaid source needs the full build: a mindmap, an architecture diagram, the ELK layout or math. */
export function needsFullBuild(source: string): boolean {
  if (source.includes(MATH)) return true;
  const { text, frontMatter, directives } = mermaidText(source);
  return FULL_TYPE.test(text) || [frontMatter ?? '', ...directives].some((setting) => ELK.test(setting));
}

const MERMAID_CLASS = 'language-mermaid';

/** The first 12 hex digits of the sha1 of the source, without its last line break. */
export function diagramHash(source: string): string {
  return createHash('sha1').update(source.replace(/\r?\n$/, '')).digest('hex').slice(0, 12);
}

function textOf(node: Nodes): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map(textOf).join('');
  return '';
}

/** The text of a Mermaid block: a `pre` whose only element child is a `code` with the class `language-mermaid`, in any case. */
function mermaidSource(pre: Element): string | null {
  const elements = pre.children.filter((child) => child.type === 'element');
  const [code] = elements;
  if (elements.length !== 1 || code?.tagName !== 'code') return null;
  const classes = code.properties.className;
  const names = Array.isArray(classes) ? classes.map((name) => String(name).toLowerCase()) : [];
  return names.includes(MERMAID_CLASS) ? textOf(code) : null;
}

/** Wraps each Mermaid block under `root` in its box, and gives the build that the page loads. */
export function wrapDiagrams(root: Root, file: string | null, fileLines: readonly number[]): DiagramBuild {
  let build: DiagramBuild = 'none';
  const visit = (node: Root | Element) => {
    node.children = node.children.map((child) => {
      if (child.type !== 'element') return child;
      const source = child.tagName === 'pre' ? mermaidSource(child) : null;
      if (source === null) {
        visit(child);
        return child;
      }
      if (build !== 'full') build = needsFullBuild(source) ? 'full' : 'tiny';
      const start = child.position?.start.line;
      const line = start === undefined ? undefined : fileLines[start - 1];
      const box: Element = {
        type: 'element',
        tagName: 'div',
        properties: {
          className: ['dg'],
          dataDg: diagramHash(source),
          ...(file === null ? {} : { dataFile: file }),
          ...(line === undefined ? {} : { dataLine: String(line) }),
        },
        children: [child],
      };
      return box;
    }) as typeof node.children;
  };
  visit(root);
  return build;
}
