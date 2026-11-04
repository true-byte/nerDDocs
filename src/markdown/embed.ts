import type { Element, ElementContent, Root, RootContent } from 'hast';
import { posix } from 'node:path';
import type { ErrorName } from '../cli/terminal-error.ts';
import { WARN_PATH } from '../page/icons.tsx';
import { isPublicName, labelFromName } from '../site/names.ts';
import { embedImages } from './images.ts';
import { embedApis } from './openapi/embed.ts';
import { embedWireframes } from './wireframes.ts';

/** One file of the docs folder, as the build of a page reads it. */
export interface FolderFile {
  /** The time of the last change of the file, in whole ms: `Math.trunc(stat.mtimeMs)`. The page writes it as `?v=`. */
  version: number;
  /** The first `length` bytes of the file, or the whole file when `length` is left out. */
  bytes(length?: number): Uint8Array;
}

/** The files of the docs folder, as the build of one page sees them. */
export interface PageFiles {
  /** The path of the Markdown file of the page in the docs folder, with `/`, such as `backups/restore.md`. */
  page: string;
  /** The path that the terminal and the watcher use for a path in the docs folder: the folder joined with it. */
  fullPath(path: string): string;
  /**
   * The file at `path`, a path in the docs folder with `/`. Null when it is missing or is no file, or when a part of
   * `path` or of its real path in the real folder is a dot name or `node_modules`, or the real path leaves the folder.
   */
  find(path: string): FolderFile | null;
}

/** A file that a page embeds, also a missing one. */
export interface UsedFile {
  /** The path in the docs folder, with `/`. */
  file: string;
  /** `fullPath(file)`, which the watcher matches. */
  path: string;
  /** The version when the page was built, or null when the file was missing. */
  version: number | null;
}

/** A block that cannot show, as the terminal prints it. */
export interface PageProblem {
  name: ErrorName;
  /** The value of the line, such as `restore-window-old.png /home/ana/docs/restore.md`. */
  value: string;
}

export interface Embeds {
  /** One entry per file: the files of images first, then of wireframes, then of API references, each in page order. */
  uses: UsedFile[];
  /** One entry per different line, in order of first use. */
  problems: PageProblem[];
  /** The ids that the embed pass gave to elements of the text, which no heading takes. */
  ids: string[];
}

export type EmbedKind = 'image' | 'wireframe' | 'api';

const KINDS: Record<string, EmbedKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  avif: 'image',
  html: 'wireframe',
  yaml: 'api',
  yml: 'api',
  json: 'api',
};

export type Child = RootContent | ElementContent;

/** Elements that sit inside a line of text, so a raw image next to one is part of that line. */
const PHRASING = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'button', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'img', 'input',
  'ins', 'kbd', 'label', 'mark', 'picture', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'svg', 'time',
  'u', 'var', 'wbr',
]);

/** The `src` of an img, or ''. */
export const targetOf = (img: Element) => (typeof img.properties.src === 'string' ? img.properties.src : '');
/** The `alt` of an img, or ''. */
export const altOf = (img: Element) => (typeof img.properties.alt === 'string' ? img.properties.alt : '');
/** A comment, or a text of white space only. */
export const isBlank = (node: Child) => node.type === 'comment' || (node.type === 'text' && !node.value.trim());
/** Nothing next to a raw element makes it part of a line of text: no node, a blank, or an element outside `PHRASING`. */
export const standsAlone = (node: Child | undefined) =>
  !node || isBlank(node) || (node.type === 'element' && !PHRASING.has(node.tagName));

/** The target up to its first `?` or `#`. */
export const pathPart = (target: string) => /^[^?#]*/.exec(target)![0];

/** The kind that the file type of a target picks, by the extension of its path in any case, or null. */
export function embedKind(target: string): EmbedKind | null {
  const name = pathPart(target).split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return KINDS[name.slice(dot + 1).toLowerCase()] ?? null;
}

export type Resolved =
  /** A target with a scheme, such as `https:` or `data:`, or one that starts with `//`. The build never reads it. */
  | { kind: 'remote' }
  /** A target that leaves the docs folder, or passes a dot name or `node_modules`. */
  | { kind: 'outside' }
  /** A path in the docs folder, with `/`, decoded, with no `.` or `..` part. */
  | { kind: 'file'; path: string };

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** The decoded path of a target. A bad escape keeps the path as written. */
export function decodedPath(target: string): string {
  const path = pathPart(target);
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Where a target points from the Markdown file `page`. */
export function resolveTarget(target: string, page: string): Resolved {
  if (HAS_SCHEME.test(target) || target.startsWith('//')) return { kind: 'remote' };
  const path = decodedPath(target);
  const fromRoot = path.startsWith('/');
  const joined = posix.normalize(posix.join(fromRoot ? '.' : posix.dirname(page), path.replace(/^\/+/, '')));
  if (joined === '..' || joined.startsWith('../')) return { kind: 'outside' };
  if (!joined.split('/').every((part) => part !== '' && isPublicName(part))) return { kind: 'outside' };
  return { kind: 'file', path: joined };
}

/** The name of a file from its target: the last part of the decoded path, without its extension, by `labelFromName`. */
export function nameOf(target: string): string {
  const file = decodedPath(target).split('/').pop() ?? '';
  return labelFromName(file.replace(/\.[^.]*$/, ''));
}

/** The dashed box that takes the place of a block that cannot show. */
export function problemBox(label: string, line: string): Element {
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['problem'], role: 'img', ariaLabel: label },
    children: [
      {
        type: 'element',
        tagName: 'svg',
        properties: { className: ['i'], viewBox: '0 0 24 24', ariaHidden: 'true' },
        children: [{ type: 'element', tagName: 'path', properties: { d: WARN_PATH }, children: [] }],
      },
      { type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: line }] },
    ],
  };
}

const element = (tagName: string, properties: Element['properties'], children: Element['children'] = []): Element => ({
  type: 'element',
  tagName,
  properties,
  children,
});

/** A link to a target with a label as its text. */
export const linkTo = (target: string, label: string) => element('a', { href: target }, [{ type: 'text', value: label }]);

/** The label of an embedded file: the alt of its img, or the name of its file. */
export const labelOf = (img: Element) => altOf(img) || nameOf(targetOf(img));

/**
 * Puts the block of each embed line of a kind in place of its paragraph, or of its raw img that stands alone in the
 * root, a `div` or a `details`. An image of that kind inside a link gives its label, since the link stays, and any
 * other image of that kind becomes a link to its file. `onElement` sees each other element in page order, before the
 * elements inside it.
 */
export function embedLines(
  root: Root,
  kind: EmbedKind,
  blockOf: (img: Element) => Element,
  onElement: (element: Element) => void = () => {},
): void {
  const imgOf = (node: Child | undefined): Element | null =>
    node?.type === 'element' && node.tagName === 'img' && embedKind(targetOf(node)) === kind ? node : null;

  function visit(parent: Root | Element, inLink: boolean): void {
    const kids = parent.children as Child[];
    const canWrap = parent.type === 'root' || parent.tagName === 'div' || parent.tagName === 'details';
    const out: Child[] = [];
    for (let at = 0; at < kids.length; at++) {
      const child = kids[at]!;
      if (child.type !== 'element') {
        out.push(child);
        continue;
      }
      if (imgOf(child)) {
        if (inLink) out.push({ type: 'text', value: labelOf(child) });
        else if (canWrap && standsAlone(kids[at - 1]) && standsAlone(kids[at + 1])) out.push(blockOf(child));
        else out.push(linkTo(targetOf(child), labelOf(child)));
        continue;
      }
      if (!inLink && child.tagName === 'p') {
        const content = child.children.filter((node) => !isBlank(node));
        const only = content.length === 1 ? imgOf(content[0]) : null;
        if (only) {
          out.push(blockOf(only));
          continue;
        }
      }
      onElement(child);
      visit(child, inLink || child.tagName === 'a');
      out.push(child);
    }
    parent.children = out as typeof parent.children;
  }

  visit(root, false);
}

/** Adds a problem once per different line. */
export function addProblem(embeds: Embeds, problem: PageProblem): void {
  if (!embeds.problems.some((seen) => seen.name === problem.name && seen.value === problem.value)) {
    embeds.problems.push(problem);
  }
}

/** Adds a used file once per file. */
export function addUse(embeds: Embeds, used: UsedFile): void {
  if (!embeds.uses.some((seen) => seen.file === used.file)) embeds.uses.push(used);
}

/** Embeds the files that the text names, and gives what the page uses and what cannot show. */
export function embedFiles(root: Root, files: PageFiles): Embeds {
  const embeds: Embeds = { uses: [], problems: [], ids: [] };
  embedImages(root, files, embeds);
  embedWireframes(root, files, embeds);
  embedApis(root, files, embeds);
  return embeds;
}
