import type { Element, Root } from 'hast';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import { CLOSE_PATH, FULL_PATH } from '../page/icons.tsx';
import { hrefTo } from '../site/urls.ts';
import {
  addProblem,
  addUse,
  embedLines,
  labelOf,
  linkTo,
  pathPart,
  problemBox,
  resolveTarget,
  targetOf,
  type Embeds,
  type FolderFile,
  type PageFiles,
  type UsedFile,
} from './embed.ts';

type FrameNode = DefaultTreeAdapterTypes.Node;
type FrameElement = DefaultTreeAdapterTypes.Element;

/** The script that the build puts first in each wireframe, as the text inside its `<script>` tag. */
export const FRAME_SCRIPT = [
  '(function () {',
  '  if (parent === window) return;',
  '  var last = null;',
  '  var acted = false;',
  // The room of a sideways scrollbar inside the frame joins the height, so the scrollbar hides no content.
  '  function post(always) {',
  '    var root = document.documentElement;',
  '    var height = Math.ceil(root.getBoundingClientRect().height) + Math.max(0, innerHeight - root.clientHeight);',
  '    var width = root.scrollWidth;',
  '    if (!always && last && last.height === height && last.width === width) return;',
  '    last = { height: height, width: width };',
  "    var data = { nerddocs: 'frame', height: height, width: width, acted: acted };",
  '    acted = false;',
  "    parent.postMessage(data, '*');",
  '  }',
  '  function act() { acted = true; }',
  "  addEventListener('pointerdown', act, true);",
  "  addEventListener('keydown', act, true);",
  '  new ResizeObserver(function () { post(false); }).observe(document.documentElement);',
  "  addEventListener('load', function () { post(false); });",
  // The page asks for the last control when the reader goes back from 'Close' in the full-size view.
  '  function focusLast() {',
  "    var all = document.querySelectorAll('a[href], area[href], button, input, select, textarea, iframe, summary, [tabindex], [contenteditable]');",
  '    for (var i = all.length - 1; i >= 0; i--) {',
  '      if (all[i].tabIndex < 0 || !all[i].getClientRects().length) continue;',
  '      all[i].focus();',
  '      if (document.activeElement === all[i]) return;',
  '    }',
  '  }',
  "  addEventListener('message', function (event) {",
  '    var data = event.data;',
  "    if (event.source !== parent || !data || data.nerddocs !== 'frame') return;",
  '    if (data.ask === true) post(true);',
  '    if (data.focusLast === true) focusLast();',
  '  });',
  // The base of the frame would send a link to a step to the folder of the wireframe, so the script sets the hash.
  "  addEventListener('click', function (event) {",
  '    var target = event.target;',
  "    var link = !event.defaultPrevented && target instanceof Element ? target.closest(\"a[href^='#']\") : null;",
  '    if (!link) return;',
  '    event.preventDefault();',
  "    location.hash = link.getAttribute('href');",
  '  });',
  "  addEventListener('keydown', function (event) {",
  "    if (event.key === 'Escape' && !event.defaultPrevented) parent.postMessage({ nerddocs: 'frame', escape: true }, '*');",
  '  });',
  '})();',
].join('\n');

/** A value of an attribute, as the frame document writes it in double quotes. */
const attributeText = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** The white space that a browser drops at both ends of a URL. */
const URL_SPACE = /^[\t\n\f\r ]+|[\t\n\f\r ]+$/g;

const isElement = (node: FrameNode): node is FrameElement => 'tagName' in node;

/** Each element of a parsed document in tree order, the content of each `<template>` too. */
function elementsOf(node: FrameNode, found: FrameElement[] = []): FrameElement[] {
  const children = 'childNodes' in node ? node.childNodes : [];
  for (const child of children) {
    if (!isElement(child)) continue;
    found.push(child);
    elementsOf(child, found);
    if ('content' in child) elementsOf(child.content, found);
  }
  return found;
}

/** The place for the part that the build puts first: after the start tag of `<head>`, else of `<html>`, else after a doctype, else 0. */
function insertAt(document: DefaultTreeAdapterTypes.Document): number {
  const html = document.childNodes.find((node): node is FrameElement => isElement(node) && node.tagName === 'html');
  const head = html?.childNodes.find((node): node is FrameElement => isElement(node) && node.tagName === 'head');
  const doctype = document.childNodes.find((node) => node.nodeName === '#documentType');
  return (
    head?.sourceCodeLocation?.startTag?.endOffset ??
    html?.sourceCodeLocation?.startTag?.endOffset ??
    doctype?.sourceCodeLocation?.endOffset ??
    0
  );
}

/** A change of the text of a wireframe: the bytes from `start` to `end` give way to `text`. */
interface Edit {
  start: number;
  end: number;
  text: string;
  /** The file that an attribute names, which the page uses. */
  use?: UsedFile;
  /** Where the address sits in `text`, from its first character to the one after its last. */
  url?: [number, number];
}

/**
 * The frame document of a wireframe, the files that it names in a tag, in document order, and the place of each address
 * that the build writes in it: the start and the end of the base, then of each `src` and `href` with a version. The page
 * script makes these addresses absolute, as `absoluteSrcdoc` says.
 */
interface Frame {
  html: string;
  uses: UsedFile[];
  urls: number[];
}

/** The edit that writes `name="<value>"`, with the place of the value in it. */
function attributeEdit(start: number, end: number, name: string, value: string, use?: UsedFile): Edit {
  const written = attributeText(value);
  return { start, end, text: `${name}="${written}"`, use, url: [name.length + 2, name.length + 2 + written.length] };
}

/**
 * The frame document: the text of the wireframe with the base and the frame script first, and `?v=` on each `src` and
 * `href` that names a file of the folder, with a path from the docs folder made relative. Every other byte stays.
 */
function frameOf(text: string, file: string, base: string, files: PageFiles): Frame {
  const document = parse(text, { sourceCodeLocationInfo: true });
  const at = insertAt(document);
  const baseTag = '<base href="';
  const href = attributeText(base);
  const baseEdit: Edit = {
    start: at,
    end: at,
    text: `${baseTag}${href}"><script>${FRAME_SCRIPT}</script>`,
    url: [baseTag.length, baseTag.length + href.length],
  };
  const edits: Edit[] = [baseEdit];
  for (const element of elementsOf(document)) {
    // The first base of a document counts, so the base of the build wins and the author's stays as written.
    if (element.tagName === 'base') continue;
    for (const attribute of element.attrs) {
      if ((attribute.name !== 'src' && attribute.name !== 'href') || attribute.prefix) continue;
      const span = element.sourceCodeLocation?.attrs?.[attribute.name];
      const value = attribute.value.replace(URL_SPACE, '');
      if (!span || !value || value.startsWith('#') || value.startsWith('?')) continue;
      const resolved = resolveTarget(value, file);
      if (resolved.kind !== 'file') continue;
      const found = files.find(resolved.path);
      const use = { file: resolved.path, path: files.fullPath(resolved.path), version: found?.version ?? null };
      if (!found) {
        edits.push({ start: span.startOffset, end: span.startOffset, text: '', use });
        continue;
      }
      const hash = value.indexOf('#');
      const fragment = hash < 0 ? '' : value.slice(hash);
      // A path from the docs folder becomes a path from the folder of the wireframe, so it also loads from disk.
      const path = value.startsWith('/') ? hrefTo(`/${file}`, `/${resolved.path}`) : pathPart(value);
      edits.push(attributeEdit(span.startOffset, span.endOffset, attribute.name, `${path}?v=${found.version}${fragment}`, use));
    }
  }
  edits.sort((a, b) => a.start - b.start);
  let html = '';
  let from = 0;
  const places = new Map<Edit, number[]>();
  for (const edit of edits) {
    html += text.slice(from, edit.start);
    if (edit.url) places.set(edit, [html.length + edit.url[0], html.length + edit.url[1]]);
    html += edit.text;
    from = edit.end;
  }
  html += text.slice(from);
  const urls = [baseEdit, ...edits.filter((edit) => edit !== baseEdit)].flatMap((edit) => places.get(edit) ?? []);
  return { html, uses: edits.flatMap((edit) => (edit.use ? [edit.use] : [])), urls };
}

const element = (tagName: string, properties: Element['properties'], children: Element['children'] = []): Element => ({
  type: 'element',
  tagName,
  properties,
  children,
});

const icon = (d: string) =>
  element('svg', { className: ['i'], viewBox: '0 0 24 24', ariaHidden: 'true' }, [element('path', { d })]);

/**
 * Turns each embed line of an `.html` file into a frame, each other image of one into a link, and adds the uses and the
 * problems. `pageUrl` is the address of the page, which can differ from the path of its file.
 */
export function embedWireframes(root: Root, files: PageFiles, embeds: Embeds, pageUrl: string): void {
  /** The frame of each wireframe that the page shows, by its path, so a wireframe shown twice is read once. */
  const frames = new Map<string, Frame>();

  /** The frame of a wireframe that `files.find` finds. The base is the folder of the wireframe, from the page. */
  function frameFor(path: string, file: FolderFile): Frame {
    const known = frames.get(path);
    if (known) return known;
    const base = hrefTo(pageUrl, `/${path}`).replace(/[^/]*$/, '') || './';
    const frame = frameOf(new TextDecoder().decode(file.bytes()), path, base, files);
    frames.set(path, frame);
    return frame;
  }

  /** The block of an embed line: the frame with its bar, the link of a remote wireframe, or the problem box. */
  function embedBlock(img: Element): Element {
    const target = targetOf(img);
    const label = labelOf(img);
    const resolved = resolveTarget(target, files.page);
    if (resolved.kind === 'remote') return element('p', {}, [linkTo(target, label)]);
    const found = resolved.kind === 'file' ? files.find(resolved.path) : null;
    if (resolved.kind === 'file') {
      addUse(embeds, { file: resolved.path, path: files.fullPath(resolved.path), version: found?.version ?? null });
    }
    if (resolved.kind !== 'file' || !found) {
      const box = problemBox(label, `Missing file: ${target} ${files.page}`);
      addProblem(embeds, { name: 'Missing file', value: target, node: box, source: img, marked: target });
      return box;
    }
    const frame = frameFor(resolved.path, found);
    for (const used of frame.uses) addUse(embeds, used);
    const bar = element('div', { className: ['wf-bar'] }, [
      element('button', { type: 'button', className: ['wf-open'], ariaLabel: 'Full size' }, [icon(FULL_PATH)]),
      element('button', { type: 'button', className: ['wf-close'], ariaLabel: 'Close' }, [icon(CLOSE_PATH)]),
    ]);
    // The page script gives the frame its `srcdoc`. With no script, the frame in `noscript` shows the file itself, by
    // a path from the file of the page, which the links of the page then take to the address of the page.
    const iframe = element('iframe', { className: ['wf-frame'], title: label, dataSrcdoc: frame.html, dataUrls: frame.urls.join(' ') });
    const own = element('iframe', { className: ['wf-frame'], title: label, src: hrefTo(`/${files.page}`, `/${resolved.path}`) });
    return element('div', { className: ['wf'], dataWf: resolved.path }, [
      element('div', { className: ['wf-box'] }, [bar, iframe, element('noscript', {}, [own])]),
    ]);
  }

  embedLines(root, 'wireframe', embedBlock);
}
