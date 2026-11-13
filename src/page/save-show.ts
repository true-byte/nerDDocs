import { pairBlocks, type BlockChange } from './block-pairs.ts';
import { stripReaderState, takePlaces, withoutNoScript, withoutReaderState } from './block-state.ts';
import { tellMove } from './level-address.ts';
import {
  afterEachChange,
  beforeEachChange,
  changeLevel,
  changeRunning,
  currentLevel,
  ease,
  finishChange,
} from './level-change.ts';
import { colorOf, sameMarks } from './levels.ts';
import { LINE_AT } from './place-hold.ts';
import { diffTokens, diffWords, type WordPart } from './word-diff.ts';

/** The scroll that brings the saved block to the line. */
export const SAVE_SCROLL_MS = 380;
/** How long every block still shows its old copy: after a level change, after a scroll alone, and when nothing moved. */
export const HOLD_MS = { level: 650, scroll: 320, still: 160 } as const;
/** The line through the words that leave draws in 280 ms, and the new words come this long after it starts. */
const STRIKE_MS = 520;
/** The tint of new text, the bands of new lines, the rings of new nodes and the bar settle over this time. */
const SETTLE_MS = 3000;
/** With reduced motion, the bar and the tints stay this long, then go. */
const STILL_SIGNS_MS = 1500;
const GLIDE_MS = 300;
const FADE_MS = 500;
const GROW_MS = 320;
const LEAVE_MS = 240;
const CLOSE_MS = 260;
/** A new drawing that is not drawn in this time shows at once. A new image waits as long for its load. */
const DRAW_WAIT_MS = 2000;
/** A block is in view when its top is this far below the top of the window and its bottom this far above the bottom. */
const VIEW_TOP_PX = 60;
const VIEW_BOTTOM_PX = 140;

/** The stage of a show, which `#page` carries in `data-save`. */
type Stage = 'move' | 'hold' | 'change';

/** A block that changes during a show. `finish` puts it in its final state at once, and does nothing a second time. */
interface Step {
  finish(): void;
}

interface Box {
  top: number;
  bottom: number;
}

interface Show {
  /** Ends the show at once in its final state. */
  end(): void;
}

/** One edit of a text node of a block: its words, and the text that it ends with. */
interface TextEdit {
  node: Text;
  parts: WordPart[];
  data: string;
}

type ChangeKind = 'text' | 'code' | 'image' | 'diagram' | 'other';

let running: Show | null = null;
/** True while the show moves the level itself, so its own move does not end it. */
let ownMove = false;
/** What runs when the level change of a show ends. */
let onLevelEnd: (() => void) | null = null;
let watching = false;
/** The level ids in the order of the stops. */
let levelOrder: string[] = [];
const starts = new Set<() => void>();
const ends = new Set<() => void>();

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const partLevels = (el: Element) => (el.matches('div.part') ? (el.getAttribute('data-l')?.split(' ') ?? null) : null);
const kindOf = (el: Element) => `${el.tagName}|${el.getAttribute('data-l') ?? ''}`;
const signatureOf = (el: Node) => `${el.nodeName}|${el instanceof Element ? (el.getAttribute('data-l') ?? '') : ''}|${el.textContent}`;
const boxOf = (el: Element): Box | null => {
  if (!el.isConnected || !el.getClientRects().length) return null;
  const { top, bottom } = el.getBoundingClientRect();
  return { top, bottom };
};
const inView = ({ top, bottom }: Box) => top >= VIEW_TOP_PX && bottom <= innerHeight - VIEW_BOTTOM_PX;
/** More than one window height away from the view, or not shown at all. */
const isFar = (box: Box | null) => !box || box.bottom < -innerHeight || box.top > 2 * innerHeight;
const reflow = (el: Element) => void el.getBoundingClientRect();

/** Sets inline styles, and gives the function that puts back what they were. It works once. */
function setStyles(el: HTMLElement, styles: Record<string, string>): () => void {
  const before = Object.keys(styles).map((name) => [name, el.style.getPropertyValue(name)] as const);
  for (const [name, value] of Object.entries(styles)) el.style.setProperty(name, value);
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const [name, value] of before) {
      if (value) el.style.setProperty(name, value);
      else el.style.removeProperty(name);
    }
    if (!el.getAttribute('style')) el.removeAttribute('style');
  };
}

/** Takes off classes and the color of the signs, and the `class` attribute when nothing is left. */
function dropSigns(el: Element, ...names: string[]): void {
  el.classList.remove(...names);
  if (el.classList.length === 0) el.removeAttribute('class');
  if (el instanceof HTMLElement || el instanceof SVGElement) {
    el.style.removeProperty('--fc');
    if (!el.getAttribute('style')) el.removeAttribute('style');
  }
}

/** Sets the level order of the stops, which the target level and the colors follow. */
export function setSaveLevels(ids: string[]): void {
  levelOrder = ids;
}

/** True while a save show runs. */
export function saveRunning(): boolean {
  return running !== null;
}

/** Runs `start` when each save show starts, and `end` when it ends. */
export function aroundEachSave(start: () => void, end: () => void): void {
  starts.add(start);
  ends.add(end);
}

/** Ends a running save show at once, in its final state. */
export function endSave(): void {
  running?.end();
}

function watchMoves(): void {
  if (watching) return;
  watching = true;
  // A level move by the reader during a show ends the show at once.
  beforeEachChange(() => {
    if (!ownMove) endSave();
  });
  afterEachChange(() => {
    const next = onLevelEnd;
    onLevelEnd = null;
    next?.();
  });
}

/** The level that shows a block with these levels: the current level, else the nearest lower stop, else the nearest higher one. */
function targetLevel(levels: string[] | null): string {
  const current = currentLevel();
  if (!levels || !levelOrder.length || levels.includes(current)) return current;
  const at = levelOrder.indexOf(current);
  for (let n = at - 1; n >= 0; n--) if (levels.includes(levelOrder[n]!)) return levelOrder[n]!;
  for (let n = at + 1; n < levelOrder.length; n++) if (levels.includes(levelOrder[n]!)) return levelOrder[n]!;
  return current;
}

/** The marks say nothing with no shared text and one kind of part at the level, as `sameMarks` says for the page. */
function marksSame(article: Element, level: string): boolean {
  const blocks = [...article.children];
  const parts = new Set(blocks.map((el) => el.getAttribute('data-l')).filter((value) => value !== null && value !== undefined));
  const hasShared = blocks.some((el) => !el.matches('div.part'));
  return sameMarks({ parts: [...parts] as string[], hasShared }, level);
}

/** The one element that a block shows: the block itself, or the only element of the text of a part. */
function contentOf(block: Element): Element | null {
  if (!block.matches('div.part')) return block;
  const text = block.querySelector(':scope > .bd');
  return text?.children.length === 1 ? text.children[0]! : null;
}

const isDiagram = (el: Element | null) => !!el?.matches('.dg');
const isCode = (el: Element | null) => !!el?.matches('.code') && !!el.querySelector(':scope > pre > code');
const isImage = (el: Element | null) =>
  !!el?.matches('p') && el.children.length > 0 && [...el.children].every((child) => child.matches('img, picture')) && !el.textContent?.trim();

/** A deep copy of a node, and the text node of `node` that each text node of the copy comes from. */
function copyWithTexts(node: Node, texts: Map<Node, Text>): Node {
  const copy = node.cloneNode(false);
  if (node instanceof Text) texts.set(copy, node);
  for (const child of node.childNodes) copy.appendChild(copyWithTexts(child, texts));
  return copy;
}

/** True when two nodes have the same elements and attributes. Each pair of text nodes that differ joins `changed`. */
function sameShape(a: Node, b: Node, changed: [Node, Text][]): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a instanceof Text) {
    if (a.data !== (b as Text).data) changed.push([a, b as Text]);
    return true;
  }
  if (a instanceof Element && b instanceof Element) {
    if (a.namespaceURI !== b.namespaceURI || a.localName !== b.localName || a.attributes.length !== b.attributes.length) {
      return false;
    }
    for (const attr of a.attributes) if (b.getAttributeNS(attr.namespaceURI, attr.localName) !== attr.value) return false;
  } else if (!a.isEqualNode(b)) return false;
  if (a.childNodes.length !== b.childNodes.length) return false;
  for (let at = 0; at < a.childNodes.length; at++) if (!sameShape(a.childNodes[at]!, b.childNodes[at]!, changed)) return false;
  return true;
}

/** Text that a word diff cannot mark: a drawing, a diagram source, code of a script or a style. */
const UNMARKED = 'svg, .dg, script, style, textarea, title';

/**
 * The word edits that turn the old block into its new copy, when both have the same elements and attributes and differ
 * only in text. Null for any other change.
 */
function textEdits(old: Element, copy: Element): TextEdit[] | null {
  const texts = new Map<Node, Text>();
  const plain = copyWithTexts(old, texts);
  stripReaderState(plain);
  const changed: [Node, Text][] = [];
  if (!sameShape(plain, copy, changed)) return null;
  const edits: TextEdit[] = [];
  for (const [from, to] of changed) {
    const node = texts.get(from);
    if (!node || node.parentElement?.closest(UNMARKED)) return null;
    const parts = diffWords(node.data, to.data);
    if (!parts) return null;
    edits.push({ node, parts, data: to.data });
  }
  return edits;
}

/** The lines of new code that a code block gains, by their index in the new code. */
function newLines(before: string, after: string): number[] {
  const lines = (text: string) => text.split('\n').map((line) => `${line}\n`);
  const parts = diffTokens(lines(before), lines(after));
  if (!parts) return [];
  const found: number[] = [];
  let at = 0;
  for (const { text, op } of parts) {
    const count = text.split('\n').length - 1;
    if (op === 'new') for (let line = 0; line < count; line++) found.push(at + line);
    if (op !== 'gone') at += count;
  }
  return found;
}

/** The ids of the nodes of a drawing, without the id of the draw and the count that Mermaid adds. */
function nodeIds(box: Element): Set<string> {
  const svg = box.querySelector('svg');
  const ids = new Set<string>();
  for (const node of svg?.querySelectorAll('g.node') ?? []) ids.add(nodeId(svg!, node));
  return ids;
}

function nodeId(svg: Element, node: Element): string {
  const id = node.getAttribute('data-id') ?? node.id;
  const own = svg.id && id.startsWith(`${svg.id}-`) ? id.slice(svg.id.length + 1) : id;
  return own.replace(/-\d+$/, '');
}

/**
 * Shows a save of the open page in the author browser: the page moves to the level and the place of the first changed
 * block, holds the old text for a moment, then changes each block. `done` runs once the new blocks are in the page.
 * The stages show in `data-save` of `#page`.
 */
export function showSave(article: HTMLElement, html: string, done: () => void): void {
  watchMoves();
  endSave();
  const template = document.createElement('template');
  template.innerHTML = html;
  withoutNoScript(template.content);
  const nodes = [...template.content.childNodes];
  const oldBlocks = [...article.children] as HTMLElement[];
  const newBlocks = nodes.filter((node): node is HTMLElement => node instanceof HTMLElement);
  const oldPlain = oldBlocks.map((el) => withoutReaderState(el));
  const newPlain = newBlocks.map((el) => withoutReaderState(el));
  const oldKeys = oldPlain.map(signatureOf);
  const newKeys = newPlain.map(signatureOf);
  const changes = pairBlocks(
    oldBlocks.length,
    newBlocks.length,
    (i, j) => oldKeys[i] === newKeys[j] && oldPlain[i]!.isEqualNode(newPlain[j]!),
    (i) => kindOf(oldBlocks[i]!),
    (j) => kindOf(newBlocks[j]!),
  );
  /** The element that each new block ends as. */
  const finals: HTMLElement[] = [];
  for (const change of changes) if (change.kind === 'same') finals[change.after] = oldBlocks[change.before]!;
  /** Puts the new order of the page in place, with the white space of the new copy between the blocks. */
  const arrange = () => {
    let at = 0;
    const order = nodes.map((node) => (node instanceof HTMLElement ? finals[at++]! : node));
    let cursor = article.firstChild;
    for (const node of order) {
      if (node === cursor) cursor = cursor.nextSibling;
      else article.insertBefore(node, cursor);
    }
    while (cursor) {
      const next: ChildNode | null = cursor.nextSibling;
      cursor.remove();
      cursor = next;
    }
  };

  const moving = changes.filter((change) => change.kind !== 'same');
  if (!moving.length) {
    for (const change of changes) if (change.kind === 'same') takePlaces(oldBlocks[change.before]!, newBlocks[change.after]!);
    arrange();
    done();
    return;
  }

  const still = reduced();
  const target = moving.find((change) => change.kind !== 'removed') ?? moving[0]!;
  const targetBlock = target.kind === 'removed' ? oldBlocks[target.before]! : newBlocks[target.after]!;
  const level = targetLevel(partLevels(targetBlock));
  const partColor = levelOrder.includes(level) ? colorOf(levelOrder.indexOf(level)) : 'var(--soft)';
  const colorFor = (block: Element) => (block.matches('div.part') ? partColor : 'var(--soft)');

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const frames = new Set<number>();
  const stops = new Set<() => void>();
  const steps: Step[] = [];
  let stage: Stage = 'move';
  let pending = 0;
  let doneCalled = false;
  let over = false;

  const later = (ms: number, run: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id);
      run();
    }, ms);
    timers.add(id);
  };
  const setStage = (next: Stage) => {
    stage = next;
    article.setAttribute('data-save', next);
  };
  const callDone = () => {
    if (doneCalled) return;
    doneCalled = true;
    done();
  };

  /** Where a change sits in the old page: its old copy, or for an added block the place where it goes. */
  function placeOf(change: BlockChange): Box | null {
    if (change.kind !== 'added') return boxOf(oldBlocks[change.before]!);
    const at = changes.indexOf(change);
    for (const next of changes.slice(at + 1)) {
      const box = 'before' in next ? boxOf(oldBlocks[next.before]!) : null;
      if (box) return { top: box.top, bottom: box.top };
    }
    for (const back of changes.slice(0, at).reverse()) {
      const box = 'before' in back ? boxOf(oldBlocks[back.before]!) : null;
      if (box) return { top: box.bottom, bottom: box.bottom };
    }
    return null;
  }

  function finalize(): void {
    if (over) return;
    over = true;
    for (const id of timers) clearTimeout(id);
    for (const id of frames) cancelAnimationFrame(id);
    for (const stop of stops) stop();
    arrange();
    article.removeAttribute('data-save');
    if (running === show) running = null;
    callDone();
    for (const end of ends) end();
  }

  /** Counts a step until its `finish` runs, by itself at the end of its signs or at the end of the show. */
  function track(final: () => void): Step {
    let finished = false;
    pending++;
    const step = {
      finish() {
        if (finished) return;
        finished = true;
        final();
        pending--;
        if (pending === 0 && stage === 'change' && running === show) finalize();
      },
    };
    steps.push(step);
    return step;
  }

  /** The block keeps its old height, then glides to the new one. */
  function glide(block: HTMLElement, from: number): void {
    if (still) return;
    const to = block.getBoundingClientRect().height;
    if (Math.abs(from - to) < 0.5) return;
    const restore = setStyles(block, { height: `${from}px`, 'overflow-y': 'clip', 'box-sizing': 'border-box' });
    reflow(block);
    const moving = setStyles(block, { transition: `height ${GLIDE_MS}ms ease`, height: `${to}px` });
    const undo = () => {
      moving();
      restore();
    };
    stops.add(undo);
    later(GLIDE_MS + 30, undo);
  }

  /** The bar beside a changed block, in its color. */
  function markBar(block: HTMLElement): void {
    block.style.setProperty('--fc', colorFor(block));
    block.classList.add('save-bar');
  }

  /** Each text node of the edits shows its runs: the same text, and the runs of one kind wrapped in `tag`. */
  function showRuns(edits: TextEdit[], shown: Map<Text, Node[]>, op: 'gone' | 'new'): void {
    const tag = op === 'gone' ? 'del' : 'ins';
    for (const { node, parts } of edits) {
      for (const old of shown.get(node) ?? []) (old as ChildNode).remove();
      const added: Node[] = [];
      for (const { text, op: partOp } of parts) {
        if (partOp === 'same') added.push(document.createTextNode(text));
        else if (partOp === op) {
          const [, lead = '', body = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];
          if (lead) added.push(document.createTextNode(lead));
          if (body) {
            const wrap = document.createElement(tag);
            wrap.className = op === 'gone' ? 'save-gone' : 'save-new';
            wrap.textContent = body;
            added.push(wrap);
          }
          if (trail) added.push(document.createTextNode(trail));
        }
      }
      node.data = '';
      node.after(...added);
      shown.set(node, added);
    }
  }

  function textStep(block: HTMLElement, edits: TextEdit[], far: boolean): void {
    if (far) {
      for (const { node, data } of edits) node.data = data;
      return;
    }
    const shown = new Map<Text, Node[]>();
    const step = track(() => {
      for (const { node, data } of edits) {
        for (const added of shown.get(node) ?? []) (added as ChildNode).remove();
        node.data = data;
      }
      dropSigns(block, 'save-bar', 'save-strike');
    });
    markBar(block);
    const words = () => {
      const from = block.getBoundingClientRect().height;
      block.classList.remove('save-strike');
      showRuns(edits, shown, 'new');
      glide(block, from);
      later(still ? STILL_SIGNS_MS : SETTLE_MS, step.finish);
    };
    const leaves = edits.some(({ parts }) => parts.some(({ op }) => op === 'gone'));
    if (!leaves || still) {
      words();
      return;
    }
    showRuns(edits, shown, 'gone');
    reflow(block);
    block.classList.add('save-strike');
    later(STRIKE_MS, words);
  }

  /** Bands of the tint behind each new line of the code of a block. */
  function bandLines(block: HTMLElement, lines: number[]): () => void {
    const pre = block.querySelector<HTMLElement>('.code > pre');
    const code = pre?.querySelector('code');
    if (!pre || !code || !lines.length) return () => {};
    const style = getComputedStyle(pre);
    const height = parseFloat(getComputedStyle(code).lineHeight) || parseFloat(style.fontSize) * 1.45;
    const top = parseFloat(style.paddingTop) || 0;
    const bands = document.createElement('span');
    bands.className = 'save-bands';
    bands.setAttribute('aria-hidden', 'true');
    bands.style.width = `${pre.scrollWidth}px`;
    for (const line of lines) {
      const band = document.createElement('i');
      band.style.top = `${top + line * height}px`;
      band.style.height = `${height}px`;
      bands.append(band);
    }
    pre.classList.add('save-banded');
    pre.prepend(bands);
    return () => {
      bands.remove();
      pre.classList.remove('save-banded');
    };
  }

  function codeStep(old: HTMLElement, block: HTMLElement, far: boolean): void {
    const from = old.getBoundingClientRect().height;
    const before = old.querySelector('.code > pre > code')?.textContent ?? '';
    old.replaceWith(block);
    if (far) return;
    const after = block.querySelector('.code > pre > code')?.textContent ?? '';
    const unband = bandLines(block, newLines(before, after));
    const step = track(() => {
      unband();
      dropSigns(block, 'save-bar');
    });
    markBar(block);
    glide(block, from);
    later(still ? STILL_SIGNS_MS : SETTLE_MS, step.finish);
  }

  /**
   * The new copy fades in over the old one as the old one fades out, once `ready` calls back. Until then the old copy
   * shows, and the new one holds its height. `onShow` runs as the new copy starts to show, and `go(true)` shows it with no fade. `onEnd` runs
   * when the signs go.
   */
  function crossfade(
    old: HTMLElement,
    block: HTMLElement,
    ready: (go: (atOnce?: boolean) => void) => void,
    onShow: () => void = () => {},
    onEnd: () => void = () => {},
  ): void {
    const from = old.getBoundingClientRect().height;
    const place = { top: old.offsetTop, left: old.offsetLeft, width: old.offsetWidth };
    old.before(block);
    setStyles(old, {
      position: 'absolute',
      top: `${place.top}px`,
      left: `${place.left}px`,
      width: `${place.width}px`,
      height: `${from}px`,
      margin: '0',
      'overflow-y': 'clip',
      'z-index': '0',
      'pointer-events': 'none',
    });
    old.setAttribute('aria-hidden', 'true');
    const held = setStyles(block, {
      position: 'relative',
      'z-index': '1',
      opacity: '0',
      height: `${from}px`,
      'overflow-y': 'clip',
      'box-sizing': 'border-box',
      transition: 'none',
    });
    let shown = false;
    const step = track(() => {
      old.remove();
      held();
      dropSigns(block, 'save-bar');
      onEnd();
    });
    markBar(block);
    ready((atOnce = false) => {
      if (shown || running !== show) return;
      shown = true;
      // The natural height of the new copy, measured with its held height off for a moment.
      block.style.removeProperty('height');
      const to = block.getBoundingClientRect().height;
      block.style.height = `${from}px`;
      reflow(block);
      const fade = atOnce || still ? 0 : FADE_MS;
      const glides = still ? 0 : GLIDE_MS;
      block.style.transition = `opacity ${fade}ms ease, height ${glides}ms ease`;
      old.style.transition = `opacity ${fade}ms ease, height ${glides}ms ease`;
      old.style.opacity = '0';
      block.style.opacity = '1';
      block.style.height = `${to}px`;
      old.style.height = `${to}px`;
      onShow();
      later(Math.max(fade, glides) + 20, () => {
        old.remove();
        held();
      });
      later(still ? STILL_SIGNS_MS : SETTLE_MS, step.finish);
    });
  }

  /** Calls `go` once each image of the block has loaded or failed, or after the wait. */
  function imagesReady(block: HTMLElement, go: () => void): void {
    const images = [...block.querySelectorAll('img')].filter((img) => !img.complete);
    if (!images.length) return go();
    let left = images.length;
    const loaded = () => {
      if (--left === 0) go();
    };
    for (const img of images) {
      img.addEventListener('load', loaded, { once: true });
      img.addEventListener('error', loaded, { once: true });
      stops.add(() => {
        img.removeEventListener('load', loaded);
        img.removeEventListener('error', loaded);
      });
    }
    later(DRAW_WAIT_MS, go);
  }

  function diagramStep(old: HTMLElement, block: HTMLElement): void {
    const oldBox = contentOf(old)!;
    const box = contentOf(block) as HTMLElement;
    const had = nodeIds(oldBox);
    const rings: Element[] = [];
    const dropRings = () => {
      for (const ring of rings.splice(0)) dropSigns(ring, 'save-ring');
    };
    crossfade(
      old,
      block,
      (go) => {
        const check = () => {
          const state = box.getAttribute('data-state');
          if (state === 'drawn') go();
          else if (state === 'bad') go(true);
        };
        const watch = new MutationObserver(check);
        watch.observe(box, { attributes: true, attributeFilter: ['data-state'] });
        stops.add(() => watch.disconnect());
        later(DRAW_WAIT_MS, () => go(true));
        check();
      },
      () => {
        const svg = box.querySelector('svg');
        if (!svg || box.getAttribute('data-state') !== 'drawn') return;
        for (const node of svg.querySelectorAll<SVGGElement>('g.node')) {
          if (had.has(nodeId(svg, node))) continue;
          node.style.setProperty('--fc', colorFor(block));
          node.classList.add('save-ring');
          rings.push(node);
        }
      },
      dropRings,
    );
  }

  function addedStep(block: HTMLElement, far: boolean): void {
    if (far) return;
    let undo = () => {};
    const step = track(() => {
      undo();
      dropSigns(block, 'save-bar', 'save-added');
    });
    markBar(block);
    block.classList.add('save-added');
    if (!still) {
      const style = getComputedStyle(block);
      const height = block.getBoundingClientRect().height;
      const margins = { top: style.marginTop, bottom: style.marginBottom };
      const restore = setStyles(block, {
        height: '0px',
        opacity: '0',
        'overflow-y': 'clip',
        'box-sizing': 'border-box',
        'margin-top': '0px',
        'margin-bottom': '0px',
      });
      reflow(block);
      const grow = setStyles(block, {
        transition: `height ${GROW_MS}ms ease, margin ${GROW_MS}ms ease, opacity 300ms ease 120ms`,
        height: `${height}px`,
        opacity: '1',
        'margin-top': margins.top,
        'margin-bottom': margins.bottom,
      });
      undo = () => {
        grow();
        restore();
      };
      stops.add(undo);
      later(GROW_MS + 140, undo);
    }
    later(still ? STILL_SIGNS_MS : SETTLE_MS, step.finish);
  }

  function removedStep(old: HTMLElement, far: boolean): void {
    if (far || still) {
      old.remove();
      return;
    }
    const step = track(() => old.remove());
    markBar(old);
    const height = old.getBoundingClientRect().height;
    setStyles(old, { transition: `opacity ${LEAVE_MS}ms ease`, opacity: '0' });
    later(LEAVE_MS, () => {
      setStyles(old, {
        height: `${height}px`,
        'overflow-y': 'clip',
        'box-sizing': 'border-box',
        transition: 'none',
      });
      reflow(old);
      setStyles(old, {
        transition: `height ${CLOSE_MS}ms ease, margin ${CLOSE_MS}ms ease, padding ${CLOSE_MS}ms ease`,
        height: '0px',
        'margin-top': '0px',
        'margin-bottom': '0px',
        'padding-top': '0px',
        'padding-bottom': '0px',
      });
      later(CLOSE_MS, step.finish);
    });
  }

  function kindOfChange(old: HTMLElement, block: HTMLElement): { kind: ChangeKind; edits?: TextEdit[] } {
    const before = contentOf(old);
    const after = contentOf(block);
    if (isDiagram(before) && isDiagram(after)) return { kind: 'diagram' };
    if (isCode(before) && isCode(after)) return { kind: 'code' };
    if (isImage(before) && isImage(after)) return { kind: 'image' };
    const edits = textEdits(old, block);
    return edits ? { kind: 'text', edits } : { kind: 'other' };
  }

  /** Changes each block, the far ones at once, with the view held on the first changed block. */
  function change(): void {
    setStage('change');
    for (const node of [...article.childNodes]) if (!(node instanceof Element)) node.remove();
    const far = new Map(moving.map((item) => [item, isFar(placeOf(item))]));
    const anchorTop = placeOf(target)?.top;
    const nextOld = (at: number) => {
      for (const next of changes.slice(at + 1)) if ('before' in next) return oldBlocks[next.before]!;
      return null;
    };
    changes.forEach((item, at) => {
      if (item.kind === 'same') {
        takePlaces(oldBlocks[item.before]!, newBlocks[item.after]!);
        return;
      }
      const isFarAway = far.get(item)!;
      if (item.kind === 'removed') {
        removedStep(oldBlocks[item.before]!, isFarAway);
        return;
      }
      const block = newBlocks[item.after]!;
      if (item.kind === 'added') {
        finals[item.after] = block;
        article.insertBefore(block, nextOld(at));
        addedStep(block, isFarAway);
        return;
      }
      const old = oldBlocks[item.before]!;
      const { kind, edits } = kindOfChange(old, block);
      if (kind === 'text') {
        finals[item.after] = old;
        takePlaces(old, block);
        textStep(old, edits!, isFarAway);
        return;
      }
      finals[item.after] = block;
      if (isFarAway || (still && kind !== 'code')) {
        old.replaceWith(block);
        if (!isFarAway) {
          const step = track(() => dropSigns(block, 'save-bar'));
          markBar(block);
          later(STILL_SIGNS_MS, step.finish);
        }
      } else if (kind === 'code') codeStep(old, block, false);
      else if (kind === 'diagram') diagramStep(old, block);
      else if (kind === 'image') crossfade(old, block, (go) => imagesReady(block, () => go()));
      else crossfade(old, block, (go) => go());
    });
    // A far block above the view changes at once, so the view keeps its place on the first changed block.
    const anchor = target.kind === 'removed' ? oldBlocks[target.before]! : finals[target.after];
    const anchorNow = anchor ? boxOf(anchor)?.top : undefined;
    if (anchorTop !== undefined && anchorNow !== undefined && Math.abs(anchorNow - anchorTop) > 0.5) {
      scrollBy(0, anchorNow - anchorTop);
    }
    callDone();
    if (running === show && pending === 0) finalize();
  }

  function hold(ms: number): void {
    setStage('hold');
    if (still || ms <= 0) change();
    else later(ms, change);
  }

  /** Scrolls so the top of the block sits on the line, over `SAVE_SCROLL_MS`, then runs `then`. */
  function scrollToLine(box: Box, then: () => void): void {
    const max = document.documentElement.scrollHeight - innerHeight;
    const from = scrollY;
    const to = Math.max(0, Math.min(max, scrollY + box.top - innerHeight * LINE_AT));
    if (still || Math.abs(to - from) < 1) {
      scrollTo(0, to);
      then();
      return;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      if (running !== show) return;
      const t = Math.min(1, (now - startedAt) / SAVE_SCROLL_MS);
      scrollTo(0, from + (to - from) * ease(t));
      if (t < 1) frames.add(requestAnimationFrame(step));
      else then();
    };
    frames.add(requestAnimationFrame(step));
  }

  function afterLevel(levelMoved: boolean): void {
    if (running !== show) return;
    // With no tint over the parts that the move swapped, the edge of the text can keep a sliver of the old text in
    // Chromium, so the page takes a layer of its own for one frame and paints again.
    if (levelMoved) {
      const repaint = setStyles(article, { 'will-change': 'transform' });
      stops.add(repaint);
      frames.add(requestAnimationFrame(repaint));
    }
    const box = placeOf(target);
    if (box && !inView(box)) scrollToLine(box, () => hold(levelMoved ? HOLD_MS.level : HOLD_MS.scroll));
    else hold(levelMoved ? HOLD_MS.level : HOLD_MS.still);
  }

  const show: Show = {
    end() {
      if (running !== show) return;
      // The show's own level change ends first, so the blocks it moves are plain again.
      onLevelEnd = null;
      if (changeRunning()) finishChange();
      if (stage !== 'change') {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        stage = 'change';
        changeAtOnce();
        return;
      }
      for (const step of [...steps]) step.finish();
      finalize();
    },
  };

  /** The final state of every block, with no signs. */
  function changeAtOnce(): void {
    for (const node of [...article.childNodes]) if (!(node instanceof Element)) node.remove();
    for (const item of changes) {
      if (item.kind === 'same') takePlaces(oldBlocks[item.before]!, newBlocks[item.after]!);
      else if (item.kind === 'removed') oldBlocks[item.before]!.remove();
      else if (item.kind === 'added') finals[item.after] = newBlocks[item.after]!;
      else {
        const old = oldBlocks[item.before]!;
        const block = newBlocks[item.after]!;
        const edits = kindOfChange(old, block).edits;
        if (edits) {
          takePlaces(old, block);
          for (const { node, data } of edits) node.data = data;
          finals[item.after] = old;
        } else {
          old.replaceWith(block);
          finals[item.after] = block;
        }
      }
    }
    finalize();
  }

  running = show;
  for (const start of starts) start();
  setStage('move');
  const from = currentLevel();
  if (level !== from) {
    ownMove = true;
    try {
      changeLevel({
        to: level,
        color: partColor,
        sameMarks: marksSame(article, level),
        quiet: true,
      });
    } finally {
      ownMove = false;
    }
    tellMove();
    if (running !== show) return;
    if (changeRunning()) onLevelEnd = () => afterLevel(true);
    else afterLevel(true);
  } else afterLevel(false);
}
