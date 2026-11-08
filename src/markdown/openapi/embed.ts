import type { Element, ElementContent, Nodes, Root } from 'hast';
import { PAGE_IDS } from '../../page/page-ids.ts';
import {
  addProblem,
  addUse,
  embedLines,
  labelOf,
  linkTo,
  problemBox,
  resolveTarget,
  targetOf,
  type Embeds,
  type PageFiles,
} from '../embed.ts';
import { parseMarkdown } from '../parse.ts';
import { apiMarkdown } from './markdown.ts';
import { openSpec } from './read.ts';

const HEADING = /^h[1-6]$/;

const element = (tagName: string, properties: Element['properties'], children: Element['children'] = []): Element => ({
  type: 'element',
  tagName,
  properties,
  children,
});

/** The tag after the first `#` of a target, decoded, or null when it is empty or absent. A bad escape stays. */
function tagOf(target: string): string | null {
  const hash = target.indexOf('#');
  const tag = hash < 0 ? '' : target.slice(hash + 1);
  if (!tag) return null;
  try {
    return decodeURIComponent(tag);
  } catch {
    return tag;
  }
}

/** Each id that an element of the tree has. */
function idsIn(node: Root | Element, found: Set<string>): Set<string> {
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    if (typeof child.properties.id === 'string') found.add(child.properties.id);
    idsIn(child, found);
  }
  return found;
}

/** The nodes without their place in the Markdown of the reference, which is no place in the page's file. */
function withoutPositions(node: Nodes): void {
  delete node.position;
  if ('children' in node) for (const child of node.children) withoutPositions(child);
}

/** A line that defines a link, an image or a footnote, which a text anywhere in the Markdown can use. */
const DEFINITION = /^ {0,3}\[[^\]]+\]:/m;
const ATX_HEADING = /^#{1,6}(?=[ \t]|$)/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
/** The start of each HTML block that runs past a blank line and a heading, with the text that ends it. */
const HTML_BLOCKS: [RegExp, RegExp][] = [
  [/^ {0,3}<(script|pre|style|textarea)(\s|>|$)/i, /<\/(script|pre|style|textarea)>/i],
  [/^ {0,3}<!--/, /-->/],
  [/^ {0,3}<\?/, /\?>/],
  [/^ {0,3}<!\[CDATA\[/, /\]\]>/],
  [/^ {0,3}<![a-z]/i, />/],
];
/** The heading pieces of a reference join up to this many characters before they parse. */
const PIECE = 32_000;

/**
 * The Markdown of a reference cut before each heading that starts a line outside a fenced code block and an HTML block
 * that runs on, with the pieces joined up to `PIECE` characters. No other block runs past a heading, and no text uses a
 * definition, so the pieces parse to the blocks of the whole.
 */
function piecesOf(markdown: string): string[] {
  const pieces: string[] = [];
  let piece: string[] = [];
  let size = 0;
  let fence: string | null = null;
  let htmlEnd: RegExp | null = null;
  for (const line of markdown.split('\n')) {
    const found = FENCE.exec(line);
    if (htmlEnd !== null) {
      if (htmlEnd.test(line)) htmlEnd = null;
    } else if (fence !== null) {
      if (found && found[1]![0] === fence[0] && found[1]!.length >= fence.length && !found[2]!.trim()) fence = null;
    } else if (found && !(found[1]!.startsWith('`') && found[2]!.includes('`'))) {
      fence = found[1]!;
    } else if (ATX_HEADING.test(line) && size >= PIECE) {
      pieces.push(piece.join('\n'));
      piece = [];
      size = 0;
    } else {
      const html = HTML_BLOCKS.find(([start]) => start.test(line));
      if (html && !html[1].test(line.slice(html[0].exec(line)![0].length))) htmlEnd = html[1];
    }
    piece.push(line);
    size += line.length + 1;
  }
  pieces.push(piece.join('\n'));
  return pieces;
}

/**
 * The blocks of the Markdown of a reference. The parse of a long Markdown text takes time that grows faster than its
 * length, so a long reference parses in pieces, with the line break between two blocks of the whole between pieces.
 */
export function referenceBlocks(markdown: string): ElementContent[] {
  const pieces = DEFINITION.test(markdown) ? [markdown] : piecesOf(markdown);
  const blocks: ElementContent[] = [];
  for (const piece of pieces) {
    const tree = parseMarkdown(piece);
    withoutPositions(tree);
    if (blocks.length && tree.children.length) blocks.push({ type: 'text', value: '\n' });
    blocks.push(...(tree.children as ElementContent[]));
  }
  return blocks;
}

/**
 * Turns each embed line of a `.yaml`, `.yml` or `.json` file into its reference, each other image of one into a link,
 * and adds the uses, the problems and the anchor ids.
 */
export function embedApis(root: Root, files: PageFiles, embeds: Embeds): void {
  const ids = idsIn(root, new Set(PAGE_IDS));
  /** The rank of the last heading of the author's text so far, in page order, or 1 when there is none. */
  let lastRank = 1;

  /** The block of an embed line: the reference, the link of a remote file, or the problem box. */
  function embedBlock(img: Element): Element {
    const target = targetOf(img);
    const label = labelOf(img);
    const resolved = resolveTarget(target, files.page);
    if (resolved.kind === 'remote') return element('p', {}, [linkTo(target, label)]);
    const missing = () => {
      addProblem(embeds, { name: 'Missing file', value: `${target} ${files.fullPath(files.page)}` });
      return problemBox(label, `Missing file: ${target} ${files.page}`);
    };
    if (resolved.kind === 'outside') return missing();
    const opened = openSpec(files, resolved.path);
    if (opened.kind === 'missing') {
      addUse(embeds, { file: resolved.path, path: files.fullPath(resolved.path), version: null });
      return missing();
    }
    const badOpenApi = (file: string, line: number) => {
      addProblem(embeds, { name: 'Bad OpenAPI', value: `${files.fullPath(file)}:${line}` });
      return problemBox(label, `Bad OpenAPI: ${file}:${line}`);
    };
    if (opened.kind === 'bad') {
      for (const used of opened.uses) addUse(embeds, used);
      return badOpenApi(opened.file, opened.line);
    }
    const { spec } = opened;
    const tag = tagOf(target);
    const before = new Set(ids);
    const written = apiMarkdown(spec, { tag, rank: Math.min(6, lastRank + 1), ids });
    for (const used of spec.uses) addUse(embeds, used);
    for (const id of ids) if (!before.has(id)) embeds.ids.push(id);
    if (written.kind === 'bad') return badOpenApi(written.file, written.line);
    if (written.kind === 'unknown-tag') {
      addProblem(embeds, { name: 'Unknown tag', value: `${tag} ${files.fullPath(files.page)}` });
      return problemBox(label, `Unknown tag: ${tag} ${files.page}`);
    }
    for (const place of written.unresolved) {
      addProblem(embeds, { name: 'Unresolved ref', value: `${place.ref} ${files.fullPath(place.file)}:${place.line}` });
    }
    const section = { className: ['api'], ariaLabel: label, dataApi: resolved.path };
    return element('section', section, referenceBlocks(written.markdown));
  }

  embedLines(root, 'api', embedBlock, (seen) => {
    if (HEADING.test(seen.tagName)) lastRank = Number(seen.tagName[1]);
  });
}
