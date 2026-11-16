import { mermaidText } from '../markdown/mermaid-text.ts';
import { blackOrWhite, themeVariables, type DiagramColors } from '../themes/diagram-colors.ts';
import type { Mode } from '../themes/types.ts';
import { WARN_PATH } from './icons.tsx';
import { holdContent } from './place-hold.ts';
import { SCROLL_BOX, watchBoxes } from './scroll-boxes.ts';
import { storedSize, storeSize, type Size } from './stored-sizes.ts';

/** The Mermaid build that a page loads. 'none' for a page with no diagram. */
export type DiagramBuild = 'none' | 'tiny' | 'full';
/** The exact version of both builds. The key of a stored size holds it. */
export const MERMAID_VERSION = '12.2.0';
/** The file of each build under `/__nerddocs/`, next to `app.js`. */
export const BUILD_FILES: Readonly<Record<'tiny' | 'full', string>> = { tiny: 'mermaid.js', full: 'mermaid-full.js' };
/** The name of the problem line of a diagram that Mermaid cannot read. The terminal never prints it. */
export const BAD_MERMAID = 'Bad Mermaid';

const ACC_TITLE = /^[ \t]*accTitle[ \t]*:[ \t]*(.*?)[ \t]*$/gm;
/** A line that names or describes the diagram, before or after its type. */
const ACC_LINE = /^acc(Title|Descr)\b/;

/** The text of the first `accTitle:` line, trimmed, or else the first word of the diagram, such as 'flowchart'. */
export function diagramName(source: string): string {
  for (const [, title] of source.matchAll(ACC_TITLE)) if (title) return title;
  for (const text of mermaidText(source).text.split('\n')) {
    const line = text.trim();
    if (!line || line.startsWith('%%') || ACC_LINE.test(line)) continue;
    return /^[^\s;]+/.exec(line)?.[0] ?? 'diagram';
  }
  return 'diagram';
}

/**
 * The line of the Markdown file that Mermaid's message names, or the fence line when it names none. Mermaid counts the
 * lines of the text that it parses, so the line of the source comes from `mermaidText`. A diagram that ends too soon
 * gets a line past its end, which becomes its last line with text.
 */
export function badLine(message: string, fenceLine: number, source: string): number {
  const line = /\bline (\d+)/i.exec(message)?.[1];
  if (line === undefined) return fenceLine;
  const { text, lines } = mermaidText(source);
  const rows = text.split('\n');
  let last = rows.length - 1;
  while (last > 0 && !rows[last]!.trim()) last--;
  return fenceLine + (lines[Math.min(Number(line) - 1, last)] ?? Number(line));
}

/** `Bad Mermaid: <file>:<line>`, or `Bad Mermaid: <line>` with no file. */
export function badMermaidLine(file: string | null, line: number): string {
  return `${BAD_MERMAID}: ${file === null ? '' : `${file}:`}${line}`;
}

/** `<theme> <mode> <build>`, as `data-drawn` holds it. */
export function drawKey(theme: string, mode: string, build: 'tiny' | 'full'): string {
  return `${theme} ${mode} ${build}`;
}

/** True when a box must draw: it has no drawing, or its drawing has another theme or look, or the tiny build drew it and the view names 'full'. */
export function needsDraw(drawn: string | null, theme: string, mode: string, wanted: DiagramBuild): boolean {
  if (drawn === null) return true;
  const [drawnTheme, drawnMode, drawnBuild] = drawn.split(' ');
  return drawnTheme !== theme || drawnMode !== mode || (drawnBuild === 'tiny' && wanted === 'full');
}

/** `mermaid 12.2.0 <hash> <theme> <mode>`. */
export function diagramSizeKey(hash: string, theme: string, mode: string): string {
  return `mermaid ${MERMAID_VERSION} ${hash} ${theme} ${mode}`;
}

/** The part of the Mermaid API that the page uses. */
interface Mermaid {
  initialize(config: Record<string, unknown>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
  mermaidAPI: { getConfig(): Record<string, unknown> };
}

/** The marks that a drawing that works gives its box, so it opens full size and reads its description. */
const OPEN_MARKS = ['data-full', 'tabindex', 'role', 'aria-label', 'aria-describedby'];
/** The marks of the build that name the place of a box in the Markdown file. A save above the box changes them. */
export const PLACE_MARKS: readonly string[] = ['data-file', 'data-line'];
/** The class that a box takes while it shows its source, the class of the wrapper of a code block. */
export const CODE_BOX = 'code';
/** The box that holds a drawing. The `pre` of a source that shows is a box that scrolls too. */
const DRAWING_BOX = `:scope > div.${SCROLL_BOX}`;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** The size of the UI font that the draw waits for and that Mermaid measures with. */
const FONT_SIZE = '15px';

let pageBuild: DiagramBuild = 'none';
/** The boxes of the page, each observed once. */
const watched = new Set<HTMLElement>();
/** The boxes within one screen of the view. */
const near = new Set<HTMLElement>();
/** The boxes that wait for a draw, in the order that they draw. */
const queue: HTMLElement[] = [];
let observer: IntersectionObserver | null = null;
let lookWatched = false;
let pumping = false;
/** The number of the last draw of the page, so each draw has ids of its own. */
let draws = 0;
/** The draw key and the UI font of the last `initialize`. */
let initialized: string | null = null;
let fullLoaded = false;
const loads: Partial<Record<'tiny' | 'full', Promise<Mermaid>>> = {};
/** Mermaid's message for each box that it could not read. */
const problems = new WeakMap<HTMLElement, string>();

const root = () => document.documentElement;
const themeNow = () => root().getAttribute('data-theme') ?? '';
const modeNow = () => (root().getAttribute('data-mode') === 'dark' ? 'dark' : 'light') satisfies Mode;
const buildNow = (): 'tiny' | 'full' => (pageBuild === 'full' || fullLoaded ? 'full' : 'tiny');
const keyNow = () => drawKey(themeNow(), modeNow(), buildNow());
const shows = (box: Element) => box.getClientRects().length > 0;
const inPage = (box: HTMLElement) => watched.has(box) && box.isConnected;
const byPageOrder = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
const round = (value: number) => Math.round(value * 100) / 100;

function wantsDraw(box: HTMLElement): boolean {
  return (
    inPage(box) && near.has(box) && shows(box) && needsDraw(box.getAttribute('data-drawn'), themeNow(), modeNow(), pageBuild)
  );
}

function enqueue(boxes: Iterable<HTMLElement>): void {
  for (const box of [...boxes].sort(byPageOrder)) if (!queue.includes(box) && wantsDraw(box)) queue.push(box);
  void pump();
}

function setSize(el: HTMLElement | SVGElement, { width, height }: Size): void {
  el.style.setProperty('--dg-w', String(width));
  el.style.setProperty('--dg-h', String(height));
}

/** The `#rrggbb` of a computed color such as `rgb(255, 153, 102)`, or of a hex color, or null for any other value. */
function hexOf(color: string): string | null {
  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${[...value.slice(1)].map((digit) => digit + digit).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
  if (!rgb) return null;
  return `#${rgb.slice(1, 4).map((channel) => Math.round(Number(channel)).toString(16).padStart(2, '0')).join('')}`;
}

function readColors(): DiagramColors {
  const style = getComputedStyle(root());
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    ink: token('--ink'),
    soft: token('--soft'),
    line: token('--line'),
    sel: token('--sel'),
    selInk: token('--sel-ink'),
    raise: token('--raise'),
    code: token('--code'),
    sheet: token('--sheet'),
    syntax: {
      keyword: token('--sx-k'),
      string: token('--sx-s'),
      function: token('--sx-f'),
      constant: token('--sx-n'),
      added: token('--sx-i'),
      removed: token('--sx-d'),
    },
    series: { orange: token('--sx-o'), teal: token('--sx-t') },
  };
}

const uiFont = () => getComputedStyle(root()).getPropertyValue('--ui').trim();

/**
 * Waits until the UI font of the theme has loaded, and gives it. Labels measured in a fallback font would be clipped once
 * the theme font loads. A theme switch during the wait waits for the font of the new theme.
 */
async function themeFontLoaded(): Promise<string> {
  for (let ui = uiFont(); ; ) {
    await document.fonts.load(`${FONT_SIZE} ${ui}`).catch(() => {});
    const now = uiFont();
    if (now === ui) return ui;
    ui = now;
  }
}

/** Loads the script of a build once, from the folder of `app.js`, and gives the Mermaid that it sets. */
function loadBuild(build: 'tiny' | 'full'): Promise<Mermaid> {
  loads[build] ??= new Promise<Mermaid>((resolve, reject) => {
    const app = document.querySelector<HTMLScriptElement>('script[src$="app.js"]');
    const script = document.createElement('script');
    script.src = new URL(BUILD_FILES[build], app?.src ?? location.href).href;
    script.addEventListener('load', () => {
      const mermaid = (globalThis as { mermaid?: Mermaid }).mermaid;
      if (!mermaid) return reject(new Error(`${BUILD_FILES[build]} set no mermaid`));
      if (build === 'full') fullLoaded = true;
      resolve(mermaid);
    });
    script.addEventListener('error', () => reject(new Error(`${BUILD_FILES[build]} did not load`)));
    document.head.append(script);
  });
  return loads[build];
}

/**
 * The source of a box that shows it scrolls sideways as a code block does: the box takes the class of the wrapper of a
 * code block, so the fades of each theme follow, and its `pre` becomes the box that scrolls.
 */
function showSourceBox(box: HTMLElement): void {
  box.classList.add(CODE_BOX);
  box.querySelector(':scope > pre')?.classList.add(SCROLL_BOX);
  watchBoxes(box);
}

/** A box that draws hides its source, which no longer scrolls. */
function hideSourceBox(box: HTMLElement): void {
  box.classList.remove(CODE_BOX);
  const pre = box.querySelector(':scope > pre');
  pre?.classList.remove(SCROLL_BOX);
  if (pre?.classList.length === 0) pre.removeAttribute('class');
}

/** With no Mermaid script, each box that has not drawn shows its source as code. */
function showSources(): void {
  const waiting = [...watched].filter((box) => box.isConnected && !box.hasAttribute('data-state'));
  if (!waiting.length) return;
  holdContent(() => {
    for (const box of waiting) {
      if (box.hasAttribute('data-state')) continue;
      box.setAttribute('data-state', 'source');
      showSourceBox(box);
    }
  });
}

function initialize(mermaid: Mermaid, key: string, mode: Mode, ui: string): void {
  const setup = `${key} ${ui}`;
  if (setup === initialized) return;
  // A diagram draws at its natural size. The page shrinks it in the column.
  const natural = Object.entries(mermaid.mermaidAPI.getConfig())
    .filter(([, value]) => typeof value === 'object' && value !== null && 'useMaxWidth' in value)
    .map(([name]) => [name, { useMaxWidth: false }]);
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'strict',
    fontFamily: ui,
    themeVariables: themeVariables(readColors(), mode, ui),
    ...Object.fromEntries(natural),
  });
  initialized = setup;
}

function sourceOf(box: HTMLElement): string {
  return box.querySelector(':scope > pre > code')?.textContent ?? '';
}

/** The text on a colored node or a pie slice turns black or white by its fill, so the author's colors stay readable. */
function fixTextColors(svg: SVGSVGElement, code: string | null): void {
  const circles = svg.querySelectorAll('.pieCircle');
  svg.querySelectorAll<SVGElement>('text.slice').forEach((text, index) => {
    const circle = circles[index];
    const fill = circle && hexOf(getComputedStyle(circle).fill);
    if (fill) text.style.setProperty('fill', blackOrWhite(fill), 'important');
  });
  for (const node of svg.querySelectorAll('g.node')) {
    const shape = node.querySelector('rect, polygon, path, circle, ellipse');
    const fill = shape && hexOf(getComputedStyle(shape).fill);
    if (!fill || fill === code) continue;
    const ink = blackOrWhite(fill);
    for (const label of node.querySelectorAll<HTMLElement | SVGElement>('.nodeLabel, .label, text, tspan, span, p')) {
      label.style.setProperty('color', ink, 'important');
      label.style.setProperty('fill', ink, 'important');
    }
  }
}

/** The size of a drawing by its `viewBox`, or by its `width` and `height` when it has none. */
function naturalSize(svg: SVGSVGElement): Size {
  const box = svg.viewBox.baseVal;
  if (box && box.width > 0 && box.height > 0) return { width: round(box.width), height: round(box.height) };
  return {
    width: round(parseFloat(svg.getAttribute('width') ?? '') || 0),
    height: round(parseFloat(svg.getAttribute('height') ?? '') || 0),
  };
}

/** A draw that ended after its box left the page or after a switch of the look shows nothing, and the box draws again. */
function isStale(box: HTMLElement, key: string): boolean {
  if (inPage(box) && key === keyNow()) return false;
  enqueue([box]);
  return true;
}

function showDrawing(box: HTMLElement, svgText: string, key: string, source: string): void {
  if (isStale(box, key)) return;
  hideSourceBox(box);
  let sbox = box.querySelector<HTMLElement>(DRAWING_BOX);
  if (!sbox) {
    sbox = document.createElement('div');
    sbox.className = SCROLL_BOX;
    const pre = box.querySelector(':scope > pre');
    if (pre) pre.after(sbox);
    else box.append(sbox);
  }
  sbox.innerHTML = svgText;
  const svg = sbox.querySelector('svg');
  box.querySelector(':scope > .problem')?.remove();
  if (!svg) return;
  const size = naturalSize(svg);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  setSize(box, size);
  setSize(svg, size);
  box.setAttribute('data-state', 'drawn');
  box.setAttribute('data-drawn', key);
  box.setAttribute('data-full', '');
  box.setAttribute('tabindex', '0');
  box.setAttribute('role', 'button');
  box.setAttribute('aria-label', diagramName(source));
  // A button reads none of its content, so the `accDescr` of the drawing describes the box.
  const description = svg.querySelector(':scope > desc[id]')?.id;
  if (description) box.setAttribute('aria-describedby', description);
  else box.removeAttribute('aria-describedby');
  problems.delete(box);
  fixTextColors(svg, hexOf(readColors().code));
  watchBoxes(box);
  const [theme = '', mode = ''] = key.split(' ');
  if (size.width > 0 && size.height > 0) storeSize(diagramSizeKey(box.dataset.dg ?? '', theme, mode), size);
}

/** The dashed box with the warning icon and the problem line, as the build writes it for a missing file. */
function problemBox(label: string, line: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'problem';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', label);
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('class', 'i');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', WARN_PATH);
  icon.append(path);
  const code = document.createElement('code');
  code.textContent = line;
  box.append(icon, code);
  return box;
}

/** The problem line of a box that Mermaid could not read, by the file and the line that the box names. */
const problemLine = (box: HTMLElement, message: string) =>
  badMermaidLine(box.dataset.file ?? null, badLine(message, Number(box.dataset.line) || 0, sourceOf(box)));

function showProblem(box: HTMLElement, message: string, key: string, source: string): void {
  if (isStale(box, key)) return;
  box.querySelector(':scope > .problem')?.remove();
  box.querySelector(DRAWING_BOX)?.remove();
  for (const name of OPEN_MARKS) box.removeAttribute(name);
  box.setAttribute('data-state', 'bad');
  box.setAttribute('data-drawn', key);
  problems.set(box, message);
  box.prepend(problemBox(diagramName(source), problemLine(box, message)));
  showSourceBox(box);
}

/**
 * Gives a box that a live update keeps the file and the line of its new copy, since a save above it moves its fence. A
 * box that Mermaid could not read then names its new line.
 */
export function takePlace(box: HTMLElement, copy: Element): void {
  for (const name of PLACE_MARKS) {
    const value = copy.getAttribute(name);
    if (value === null) box.removeAttribute(name);
    else box.setAttribute(name, value);
  }
  const message = problems.get(box);
  const line = box.querySelector(':scope > .problem > code');
  if (message !== undefined && line) line.textContent = problemLine(box, message);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : String(error);
}

async function drawBox(box: HTMLElement): Promise<void> {
  const build = buildNow();
  let mermaid: Mermaid;
  try {
    mermaid = await loadBuild(build);
  } catch {
    showSources();
    return;
  }
  const ui = await themeFontLoaded();
  if (!wantsDraw(box)) return;
  const mode = modeNow();
  const key = drawKey(themeNow(), mode, build);
  initialize(mermaid, key, mode, ui);
  const source = sourceOf(box);
  const id = `dg-${box.dataset.dg ?? ''}-${++draws}`;
  try {
    const { svg } = await mermaid.render(id, source);
    holdContent(() => showDrawing(box, svg, key, source));
  } catch (error) {
    // A failed draw leaves Mermaid's own box in the body.
    document.getElementById(`d${id}`)?.remove();
    const message = messageOf(error);
    holdContent(() => showProblem(box, message, key, source));
  }
}

/** Draws the boxes of the queue one at a time, in queue order. */
async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (let box = queue.shift(); box; box = queue.shift()) {
      if (!wantsDraw(box)) continue;
      try {
        await drawBox(box);
      } catch {
        // One box that cannot draw leaves the others to draw.
      }
    }
  } finally {
    pumping = false;
  }
}

function onIntersect(entries: IntersectionObserverEntry[]): void {
  const added: HTMLElement[] = [];
  for (const { target, isIntersecting } of entries) {
    const box = target as HTMLElement;
    if (!watched.has(box)) continue;
    if (isIntersecting) {
      near.add(box);
      added.push(box);
    } else near.delete(box);
  }
  enqueue(added);
}

function forget(box: HTMLElement): void {
  watched.delete(box);
  near.delete(box);
  observer?.unobserve(box);
  const at = queue.indexOf(box);
  if (at >= 0) queue.splice(at, 1);
}

/** Starts or updates the drawing of each `.dg` box of `#page`. Called with the `diagrams` of the page view, at start and after each live update. */
export function watchDiagrams(build: DiagramBuild): void {
  pageBuild = build;
  const page = document.getElementById('page');
  if (!lookWatched) {
    lookWatched = true;
    // A switch of the theme or the look draws the near diagrams again at once, and the rest when they come near.
    new MutationObserver(() => enqueue(near)).observe(root(), {
      attributes: true,
      attributeFilter: ['data-theme', 'data-mode'],
    });
  }
  for (const box of [...watched]) if (!box.isConnected || !page?.contains(box)) forget(box);
  const boxes = [...(page?.querySelectorAll<HTMLElement>('.dg') ?? [])].filter(
    (box) => !watched.has(box) && !box.closest('.ghost'),
  );
  if (boxes.length) observer ??= new IntersectionObserver(onIntersect, { rootMargin: '100% 0px' });
  for (const box of boxes) {
    watched.add(box);
    observer!.observe(box);
    const size = box.hasAttribute('data-state') ? null : storedSize(diagramSizeKey(box.dataset.dg ?? '', themeNow(), modeNow()));
    if (size) setSize(box, size);
  }
  // A page that turns to the full build draws its near diagrams again.
  enqueue(near);
}
