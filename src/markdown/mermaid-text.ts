/**
 * What Mermaid 12.2.0 reads of a source before it parses it. Mermaid drops the front matter with the blank lines after
 * it, then each `%%{…}%%` directive, then each comment line with the blank lines before it, then the white space at the
 * start. A line number in its message counts the lines of what is left.
 */
export interface MermaidText {
  /** The text that Mermaid parses. */
  text: string;
  /** The line of the source, from 1, that each line of `text` starts on. */
  lines: number[];
  /** The body of the front matter, or null with none. */
  frontMatter: string | null;
  /** Each directive, as the source writes it. */
  directives: string[];
}

/** A `%%{…}%%` directive, as Mermaid matches it. */
const DIRECTIVE = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;
/** A comment line with the white space before it, as Mermaid matches it. */
const COMMENT = /^\s*%%(?!{)[^\n]+\n?/gm;
const SPACE = /\s/;

const isBreak = (char: string | undefined) => char === '\n' || char === '\r';

/** The index of the last line break in the run of white space that starts at `from`, or -1. */
function lastBreakIn(text: string, from: number): number {
  let last = -1;
  for (let at = from; at < text.length && SPACE.test(text[at]!); at++) if (isBreak(text[at])) last = at;
  return last;
}

/** The front matter at the start of the text, as Mermaid finds it: its body, and its length with the white space after it. */
function findFrontMatter(text: string): { body: string; length: number } | null {
  let start = 0;
  while (start < text.length && SPACE.test(text[start]!) && !isBreak(text[start])) start++;
  if (!text.startsWith('---', start)) return null;
  const opening: number[] = [];
  for (let at = start + 3; at < text.length && SPACE.test(text[at]!); at++) if (isBreak(text[at])) opening.push(at);
  if (!opening.length) return null;
  const fence = `${text.slice(0, start)}---`;
  /** The index of the last line break after a closing fence that starts after the break at `at`, or -1. */
  const closingEnd = (at: number) => (isBreak(text[at]) && text.startsWith(fence, at + 1) ? lastBreakIn(text, at + 1 + fence.length) : -1);
  let last = -1;
  for (let at = opening[0]! + 1; at < text.length; at++) if (closingEnd(at) !== -1) last = at;
  if (last === -1) return null;
  let open = opening[0]!;
  for (const at of opening) if (at < last) open = at;
  for (let at = open + 1; at <= last; at++) {
    const end = closingEnd(at);
    if (end !== -1) return { body: text.slice(open + 1, at), length: end + 1 };
  }
  return null;
}

/** A text with the line of the source of each of its characters. */
interface Tracked {
  text: string;
  lines: number[];
}

/** The text without the ranges, each `[start, end)`, in order and apart. */
function drop(from: Tracked, ranges: [number, number][]): Tracked {
  let text = '';
  const lines: number[] = [];
  let at = 0;
  for (const [start, end] of [...ranges, [from.text.length, from.text.length] as [number, number]]) {
    text += from.text.slice(at, start);
    lines.push(...from.lines.slice(at, start));
    at = end;
  }
  return { text, lines };
}

const matchesOf = (from: Tracked, pattern: RegExp): [number, number][] =>
  [...from.text.matchAll(pattern)].map((match) => [match.index, match.index + match[0].length]);

/** What Mermaid parses of a source, with the line of the source that each of its lines starts on. */
export function mermaidText(source: string): MermaidText {
  const text = source.replace(/\r\n?/g, '\n');
  const lines: number[] = [];
  for (let at = 0, line = 1; at < text.length; at++) {
    lines.push(line);
    if (text[at] === '\n') line++;
  }
  let tracked: Tracked = { text, lines };
  const front = findFrontMatter(text);
  if (front) tracked = drop(tracked, [[0, front.length]]);
  const directives = [...tracked.text.matchAll(DIRECTIVE)].map(([directive]) => directive);
  tracked = drop(tracked, matchesOf(tracked, DIRECTIVE));
  tracked = drop(tracked, matchesOf(tracked, COMMENT));
  tracked = drop(tracked, [[0, tracked.text.length - tracked.text.trimStart().length]]);

  const starts: number[] = [];
  tracked.text.split('\n').reduce((at, line) => {
    // An empty last line starts on the line after the last line break.
    starts.push(tracked.lines[at] ?? (tracked.lines[at - 1] ?? 0) + 1);
    return at + line.length + 1;
  }, 0);
  return { text: tracked.text, lines: tracked.text ? starts : [], frontMatter: front?.body ?? null, directives };
}
