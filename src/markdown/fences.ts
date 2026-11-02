import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { isLevelId } from '../site/config.ts';

const parser = unified().use(remarkParse).use(remarkGfm);

const OPENING = /^ {0,3}:::[ \t]+(\S.*?)[ \t]*$/;
const CLOSING = /^ {0,3}:::[ \t]*$/;
const CODE_OPENING = /^ {0,3}(`{3,}|~{3,})/;
/** Raw HTML whose lines Markdown leaves alone until its end tag. */
const RAW_BLOCKS: [RegExp, RegExp][] = [
  [/^ {0,3}<pre(\s|>|$)/i, /<\/pre>/i],
  [/^ {0,3}<script(\s|>|$)/i, /<\/script>/i],
  [/^ {0,3}<style(\s|>|$)/i, /<\/style>/i],
  [/^ {0,3}<textarea(\s|>|$)/i, /<\/textarea>/i],
  [/^ {0,3}<!--/, /-->/],
];

const isBlank = (line: string) => !line.trim();

function levelIdsOf(line: string): string[] | null {
  const ids = OPENING.exec(line)?.[1]?.split(/[ \t]+/);
  return ids?.every(isLevelId) ? [...new Set(ids)] : null;
}

interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  position?: { start: { line: number }; end: { line: number } };
}

/** The lines of code blocks, as Markdown reads them, also in a list or a quote. */
function codeLines(node: MarkdownNode, lines = new Set<number>()): Set<number> {
  if (node.type === 'code' && node.position) {
    for (let line = node.position.start.line; line <= node.position.end.line; line++) lines.add(line);
  }
  for (const child of node.children ?? []) codeLines(child, lines);
  return lines;
}

/** The mark that ends a top-level code block still open at the end of the file, if there is one. */
function openCodeMark(root: MarkdownNode, lines: string[]): string {
  const last = root.children?.at(-1);
  if (last?.type !== 'code' || !last.position) return '';
  const { start, end } = last.position;
  const mark = CODE_OPENING.exec(lines[start.line - 1] ?? '')?.[1];
  if (!mark) return '';
  const closing = new RegExp(`^ {0,3}${mark[0]}{${mark.length},}[ \\t]*$`);
  return end.line > start.line && closing.test(lines[end.line - 1] ?? '') ? '' : mark;
}

/**
 * Turns each fence whose words are all listed into an HTML wrapper with blank lines around it,
 * so Markdown inside a part still renders. A fence line that does not count stays text on its own
 * line, and its unlisted words come back in unknownLevels. Every other line stays as written.
 */
export function wrapFences(file: string, listed: readonly string[]): { markdown: string; unknownLevels: string[] } {
  const source = file.replace(/^\uFEFF/, '');
  if (!source.includes(':::')) return { markdown: source, unknownLevels: [] };
  const lines = source.split(/\r\n?|\n/);
  const root: MarkdownNode = parser.parse(source);
  const code = codeLines(root);
  const out: string[] = [];
  const unknownLevels = new Set<string>();
  let partStart = -1;
  let skipUntil: RegExp | null = null;

  function closePart(): void {
    if (partStart < 0) return;
    if (out.slice(partStart + 1).every(isBlank)) out.length = partStart;
    else out.push('', '</div></div>', '');
    partStart = -1;
  }

  for (const [index, line] of lines.entries()) {
    if (skipUntil) {
      out.push(line);
      if (skipUntil.test(line)) skipUntil = null;
      continue;
    }
    const raw = RAW_BLOCKS.find(([start]) => start.test(line));
    const ids = levelIdsOf(line);
    if (code.has(index + 1)) {
      out.push(line);
    } else if (raw) {
      if (!raw[1].test(line)) skipUntil = raw[1];
      out.push(line);
    } else if (CLOSING.test(line) && partStart >= 0) {
      closePart();
    } else if (ids?.every((id) => listed.includes(id))) {
      closePart();
      out.push('');
      partStart = out.length;
      out.push(`<div class="part" data-l="${ids.join(' ')}"><div class="bd">`, '');
    } else if (ids || CLOSING.test(line)) {
      if (listed.length) for (const id of ids ?? []) if (!listed.includes(id)) unknownLevels.add(id);
      out.push('', line, '');
    } else {
      out.push(line);
    }
  }
  // A code block still open at the end of the file ends there, and the part after it.
  const codeMark = openCodeMark(root, lines);
  if (codeMark && partStart >= 0) out.push(codeMark);
  closePart();
  return { markdown: out.join('\n'), unknownLevels: [...unknownLevels] };
}
