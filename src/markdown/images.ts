import type { Element, ElementContent, Properties, Root } from 'hast';
import {
  addProblem,
  addUse,
  altOf,
  embedKind,
  isBlank,
  nameOf,
  pathPart,
  problemBox,
  resolveTarget,
  standsAlone,
  targetOf,
  type Child,
  type Embeds,
  type FolderFile,
  type PageFiles,
} from './embed.ts';
import { imageSizeOf, type ImageSize } from './image-size.ts';

type Look = 'light' | 'dark';
type Parent = Root | Element;

const LOOK_MEDIA: Record<string, Look> = {
  '(prefers-color-scheme:dark)': 'dark',
  '(prefers-color-scheme:light)': 'light',
};
const FRAGMENTS: Record<string, Look> = { '#gh-light-mode-only': 'light', '#gh-dark-mode-only': 'dark' };
const isImage = (node: Child | undefined): node is Element =>
  node?.type === 'element' && node.tagName === 'img' && embedKind(targetOf(node)) === 'image';

/** The first URL of a `srcset`. */
function firstUrl(srcset: unknown): string | null {
  const url = typeof srcset === 'string' ? /^\s*(\S+)/.exec(srcset)?.[1]?.replace(/,+$/, '') : undefined;
  return url || null;
}

/** Digits only gives the number, no value gives undefined, and any other value gives null. */
function digitsOf(value: Properties[string]): number | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : null;
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null;
}

/** The size that the page reserves: an author's own size wins, and one side gives the other by the ratio. */
function sizeOf(img: Element, file: FolderFile): ImageSize | null {
  const width = digitsOf(img.properties.width);
  const height = digitsOf(img.properties.height);
  if (width === null || height === null) return null;
  if (width !== undefined && height !== undefined) return { width, height };
  const own = imageSizeOf((length) => file.bytes(length));
  if (!own || !own.width || !own.height) return null;
  if (width !== undefined) return { width, height: Math.round((width * own.height) / own.width) };
  if (height !== undefined) return { width: Math.round((height * own.width) / own.height), height };
  return own;
}

/** The two copies of a `<picture>` whose sources pick a look only, or null for any other `<picture>`. */
function pictureCopies(picture: Element): [Element, Element] | null {
  const sources: Element[] = [];
  let img: Element | undefined;
  for (const child of picture.children) {
    if (isBlank(child)) continue;
    if (child.type !== 'element') return null;
    if (child.tagName === 'source') sources.push(child);
    else if (child.tagName === 'img') img ??= child;
    else return null;
  }
  if (!img) return null;
  const urls: Partial<Record<Look, string>> = {};
  for (const source of sources) {
    const { media, type, sizes, srcSet } = source.properties;
    const look = typeof media === 'string' ? LOOK_MEDIA[media.replace(/\s+/g, '').toLowerCase()] : undefined;
    const url = firstUrl(srcSet);
    if (!look || type !== undefined || sizes !== undefined || !url) return null;
    urls[look] ??= url;
  }
  const light = urls.light ?? targetOf(img);
  const dark = urls.dark;
  if (!dark || embedKind(light) !== 'image' || embedKind(dark) !== 'image') return null;
  /** A copy of the img with this URL. The `srcset` and `sizes` of the img stay only on the copy of its own `src`. */
  const copy = (src: string, look: Look, ownSrc: boolean): Element => {
    const properties = { ...structuredClone(img.properties), src, dataLook: look };
    if (!ownSrc) {
      delete properties.srcSet;
      delete properties.sizes;
    }
    return { type: 'element', tagName: 'img', properties, children: [] };
  };
  return [copy(light, 'light', urls.light === undefined), copy(dark, 'dark', false)];
}

const fragmentLook = (node: Child | undefined): Look | null => {
  if (!isImage(node)) return null;
  const hash = /#[^#]*$/.exec(targetOf(node))?.[0];
  return (hash && FRAGMENTS[hash]) || null;
};

/** Sets up each image of the text whose file type is an image, and adds what it uses and what cannot show to `embeds`. */
export function embedImages(root: Root, files: PageFiles, embeds: Embeds): void {
  /** The dark copy of each pair, by its light copy. */
  const pairs = new Map<Element, Element>();
  /** A `<picture>` that makes no pair stays as written, with nothing below it. */
  const kept = new Set<Element>();

  /** Turns each pair into an image per look, light first. */
  function pairUp(parent: Parent): void {
    const out: Child[] = [];
    for (const child of parent.children) {
      if (child.type === 'element' && child.tagName === 'picture') {
        const copies = pictureCopies(child);
        if (copies) {
          pairs.set(...copies);
          out.push(...copies);
        } else {
          kept.add(child);
          out.push(child);
        }
        continue;
      }
      if (child.type === 'element') pairUp(child);
      out.push(child);
    }
    parent.children = out as typeof parent.children;
    if (parent.type === 'element' && parent.tagName === 'p') pairFragments(parent);
  }

  /** GitHub's mode fragments on two images with only white space between them make a pair. */
  function pairFragments(p: Element): void {
    const kids = p.children;
    const out: ElementContent[] = [];
    for (let at = 0; at < kids.length; at++) {
      const first = kids[at]!;
      const look = fragmentLook(first);
      let next = at + 1;
      while (next < kids.length && kids[next]!.type === 'text' && isBlank(kids[next]!)) next++;
      const second = kids[next];
      const other = fragmentLook(second);
      if (!look || !other || look === other || pairs.has(first as Element) || pairs.has(second as Element)) {
        out.push(first);
        continue;
      }
      const [light, dark] = (look === 'light' ? [first, second] : [second, first]) as [Element, Element];
      light.properties.dataLook = 'light';
      dark.properties.dataLook = 'dark';
      pairs.set(light, dark);
      out.push(light, dark);
      at = next;
    }
    p.children = out;
  }

  /** Sets the address, the size and the use of one copy. False when its file is missing. */
  function setUp(img: Element): boolean {
    const target = targetOf(img);
    const resolved = resolveTarget(target, files.page);
    if (resolved.kind === 'remote') return true;
    const file = resolved.kind === 'file' ? files.find(resolved.path) : null;
    if (resolved.kind === 'file') {
      addUse(embeds, { file: resolved.path, path: files.fullPath(resolved.path), version: file?.version ?? null });
    }
    if (!file) {
      addProblem(embeds, { name: 'Missing file', value: `${target} ${files.fullPath(files.page)}` });
      return false;
    }
    img.properties.src = `${pathPart(target)}?v=${file.version}`;
    const size = sizeOf(img, file);
    if (size) {
      img.properties.width = size.width;
      img.properties.height = size.height;
      img.properties.loading = 'lazy';
    }
    return true;
  }

  /** A block image opens full size, or leaves the problem box in place of its paragraph. */
  function embedBlock(copies: Element[], p: Element): Element {
    const name = nameOf(targetOf(copies[0]!));
    const missing: string[] = [];
    for (const copy of copies) {
      const target = targetOf(copy);
      if (!setUp(copy)) missing.push(target);
    }
    if (missing.length) {
      const label = copies.map(altOf).find(Boolean) ?? name;
      return problemBox(label, `Missing file: ${missing[0]} ${files.page}`);
    }
    for (const copy of copies) {
      if (!altOf(copy)) copy.properties.alt = name;
      Object.assign(copy.properties, { dataFull: '', tabIndex: 0, role: 'button' });
    }
    return p;
  }

  /** The copies of a paragraph that holds only one image or one pair, white space aside. */
  function blockCopies(p: Element): Element[] | null {
    const content = p.children.filter((child) => !isBlank(child));
    const [first, second] = content;
    if (content.length === 1 && isImage(first) && !pairs.has(first)) return [first];
    if (content.length === 2 && isImage(first) && pairs.get(first) === second) return [first, second as Element];
    return null;
  }

  function visit(parent: Parent): void {
    const kids = parent.children as Child[];
    const canWrap = parent.type === 'root' || parent.tagName === 'div' || parent.tagName === 'details';
    const out: Child[] = [];
    for (let at = 0; at < kids.length; at++) {
      const child = kids[at]!;
      if (child.type !== 'element' || kept.has(child)) {
        out.push(child);
        continue;
      }
      if (child.tagName === 'p') {
        const copies = blockCopies(child);
        if (copies) {
          out.push(embedBlock(copies, child));
          continue;
        }
      }
      if (isImage(child)) {
        const partner = pairs.get(child);
        const copies = partner ? [child, partner] : [child];
        const whole = !partner || kids[at + 1] === partner;
        if (canWrap && whole && standsAlone(kids[at - 1]) && standsAlone(kids[at + copies.length])) {
          out.push(embedBlock(copies, { type: 'element', tagName: 'p', properties: {}, children: copies }));
          at += copies.length - 1;
          continue;
        }
        setUp(child);
        out.push(child);
        continue;
      }
      visit(child);
      out.push(child);
    }
    parent.children = out as typeof parent.children;
  }

  pairUp(root);
  visit(root);
}
