import type { Problem } from '../site/problems.ts';
import type { TreeNode } from '../site/scan.ts';
import { encodeUrl } from '../site/urls.ts';
import { landingLevelFor } from './address.ts';
import type { ContentsData } from './contents.tsx';
import { openAround } from './found.ts';
import { levelIconHtml } from './icons.tsx';
import { moveLevel } from './level-address.ts';
import { aroundLevelSet, currentLevel, ease } from './level-change.ts';
import { colorOf } from './levels.ts';
import { local, read, remove, session, write } from './panel-state.ts';
import { LINE_AT } from './place-hold.ts';
import { pathLabel, problemChanges, problemGroups, startsFolded } from './problem-list.ts';
import { aroundEachSave } from './save-show.ts';

/** In sessionStorage: 'open' while the panel is open, so a page that opens in the same tab keeps it. */
export const OPEN_KEY = 'nerddocs-problems-open';
/** In localStorage: 'off' while 'Pop up' is unchecked. */
export const POPUP_KEY = 'nerddocs-popup';
/** In sessionStorage: the key of the row that a click opened on another page, which that page runs and removes. */
export const GO_KEY = 'nerddocs-problem-go';
/** The address that opens a file of the docs in the editor. */
const OPEN_URL = '/__nerddocs/open';

const WARN = '<path d="M12 4L2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>';
const CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
const CHEV = '<path d="M7 10l5 5 5-5"/>';
const svg = (paths: string, name: string) => `<svg class="i ${name}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

/** The times of E13 of the design, in ms. */
const STRIKE_MS = 520;
const GATHER_MS = 340;
const FLY_MS = 520;
const FLY_STEP_MS = 50;
const CLOSE_ROW_MS = 320;
const ROLL_MS = 420;
const GROW_MS = 340;
const FIRST_ROW_MS = 120;
const OPEN_MS = 400;
const SHUT_FADE_MS = 100;
const SHUT_MS = 380;
const FRESH_MS = 2600;
const NEW_ROW_MS = 2400;
const CLEAR_MS = 1000;
const FLASH_MS = 1600;
/** A list that waits for a save show applies this long after the show reaches its 'change' stage. */
const AFTER_CHANGE_MS = 600;
const SCROLL_MS = 380;
/** A mark is in view when its top is this far below the top of the window and its bottom this far above the bottom. */
const VIEW_TOP_PX = 60;
const VIEW_BOTTOM_PX = 140;
/** The room between the pill and the bar, and between the box and the edges of the window. */
const BAR_GAP_PX = 10;
const EDGE_PX = 16;
const PILL_PX = 32;

let data: ContentsData | null = null;
/** The list that the panel shows, or moves to. */
let shown: Problem[] = [];
/** The newest list that came while a save show ran, until the show reaches its 'change' stage. */
let waiting: Problem[] | null = null;
/** The time at which the running save show reached its 'change' stage, or null. */
let changeAt: number | null = null;
let waitTimer: ReturnType<typeof setTimeout> | undefined;
let box: HTMLElement | null = null;
let list: HTMLElement;
let pill: HTMLElement;
let count: HTMLElement;
let auto: HTMLInputElement;
let isOpen = false;
/** The fold of each group that the panel has shown, by its key, until the page closes. */
const folds = new Map<string, boolean>();
/** The JSON of the problem that each row shows. */
const filled = new WeakMap<Element, string>();
/** Each change of the list counts up, and the steps of an older change stop. */
let change = 0;
const timers = new Set<ReturnType<typeof setTimeout>>();
let morphTimer: ReturnType<typeof setTimeout> | undefined;
/** The marks that the page shows, as JSON, or null when the page shows none. */
let drawn: string | null = null;
let freshTimer: ReturnType<typeof setTimeout> | undefined;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const reflow = (el: Element) => void el.getBoundingClientRect();
const article = () => document.getElementById('page');

/** Runs `run` after `ms`, unless a newer change of the list came first. */
function later(ms: number, run: () => void): void {
  const own = change;
  const id = setTimeout(() => {
    timers.delete(id);
    if (own === change) run();
  }, ms);
  timers.add(id);
}

const wait = (ms: number) => new Promise<boolean>((done) => later(reduced() ? 0 : ms, () => done(true)));

function titlesOf(nodes: readonly TreeNode[], found: Record<string, string> = {}): Record<string, string> {
  for (const node of nodes) {
    if (node.kind === 'page') found[node.url] = node.title;
    else {
      if (node.url) found[node.url] = node.title;
      titlesOf(node.children, found);
    }
  }
  return found;
}

// The box

function build(): void {
  box = document.createElement('div');
  box.id = 'ck';
  box.innerHTML =
    '<div class="ck-body"><div class="ck-list"></div></div>' +
    '<div class="ck-foot"><label class="ck-pop"><input type="checkbox" id="ck-auto">Pop up</label>' +
    '<button type="button" class="ck-pill" title="Problems" aria-label="Problems" aria-expanded="false">' +
    `<span class="ck-ico">${svg(WARN, 'ck-warn-i')}${svg(CHECK, 'ck-ok-i')}</span>` +
    `<span class="ck-num"><b>0</b></span>${svg(CHEV, 'ck-chev')}</button></div>`;
  list = box.querySelector('.ck-list')!;
  pill = box.querySelector('.ck-pill')!;
  count = box.querySelector('.ck-num')!;
  auto = box.querySelector('#ck-auto')!;
  auto.checked = read(local, POPUP_KEY) !== 'off';
  auto.addEventListener('change', () => write(local, POPUP_KEY, auto.checked ? 'on' : 'off'));
  pill.addEventListener('click', () => (isOpen ? shut() : open()));
  list.addEventListener('click', onListClick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) shut();
  });
  document.body.append(box);
}

/** The box sits above the bar only when the bar shows and the shut pill would touch it, as on a phone. */
function place(): void {
  if (!box) return;
  const bar = document.getElementById('bar')?.getBoundingClientRect();
  const width = pill.offsetWidth;
  const pillTop = innerHeight - EDGE_PX - PILL_PX;
  const shows = !!bar && bar.height > 0 && bar.top < innerHeight - 4;
  const touches =
    shows &&
    bar.right > innerWidth - EDGE_PX - width - BAR_GAP_PX &&
    bar.left < innerWidth - EDGE_PX + BAR_GAP_PX &&
    bar.top < innerHeight - EDGE_PX + BAR_GAP_PX &&
    bar.bottom > pillTop - BAR_GAP_PX;
  box.style.bottom = touches ? `${innerHeight - bar.top + BAR_GAP_PX}px` : '';
}

function watchBar(): void {
  addEventListener('resize', place);
  const bar = document.getElementById('bar');
  if (bar) new ResizeObserver(place).observe(bar);
  new MutationObserver(place).observe(document.documentElement, { attributes: true });
  document.addEventListener('transitionend', (event) => {
    if (event.target instanceof Element && event.target.id === 'bar') place();
  });
  place();
}

/** Runs `change`, then glides the box from its old size to its new one. */
function morph(run: () => void, ms: number): void {
  if (!box) return;
  const w0 = box.offsetWidth;
  const h0 = box.offsetHeight;
  box.classList.remove('morph');
  box.style.width = '';
  box.style.height = '';
  run();
  const w1 = box.offsetWidth;
  const h1 = box.offsetHeight;
  if (reduced() || (w0 === w1 && h0 === h1)) return;
  box.style.width = `${w0}px`;
  box.style.height = `${h0}px`;
  reflow(box);
  box.classList.add('morph');
  box.style.width = `${w1}px`;
  box.style.height = `${h1}px`;
  clearTimeout(morphTimer);
  morphTimer = setTimeout(() => {
    box?.classList.remove('morph');
    box?.style.removeProperty('width');
    box?.style.removeProperty('height');
  }, ms);
}

function open(): void {
  if (!box || isOpen) return;
  isOpen = true;
  pill.setAttribute('aria-expanded', 'true');
  write(session, OPEN_KEY, 'open');
  morph(() => {
    box!.classList.remove('closing');
    box!.classList.add('open');
  }, OPEN_MS + 20);
}

function shut(): void {
  if (!box || !isOpen) return;
  isOpen = false;
  pill.setAttribute('aria-expanded', 'false');
  write(session, OPEN_KEY, 'shut');
  box.classList.add('closing');
  setTimeout(
    () => {
      if (isOpen) return;
      morph(() => box!.classList.remove('open', 'closing'), SHUT_MS);
    },
    reduced() ? 0 : SHUT_FADE_MS + 10,
  );
}

/** A number that rolls up or down to its new value. */
function roll(to: number): void {
  const olds = [...count.querySelectorAll('b')];
  const old = olds.pop()!;
  for (const extra of olds) extra.remove();
  for (const animation of old.getAnimations()) animation.cancel();
  const from = Number(old.textContent);
  if (from === to) return;
  const next = document.createElement('b');
  next.textContent = String(to);
  if (reduced()) {
    old.replaceWith(next);
    return;
  }
  count.append(next);
  const step = to > from ? 1 : -1;
  const timing = { duration: ROLL_MS, easing: 'cubic-bezier(0.3, 1.3, 0.5, 1)' };
  old.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-100 * step}%)`, opacity: 0 }], timing);
  next.animate([{ transform: `translateY(${100 * step}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], timing).onfinish =
    () => old.remove();
}

/** Rolls the count, and turns the pill to the check when it reaches 0. */
function setCount(total: number, grew: boolean): void {
  if (!box) return;
  roll(total);
  const zero = total === 0;
  if (zero !== box.classList.contains('ok')) {
    const turn = () => {
      box!.classList.toggle('ok', zero);
      box!.classList.toggle('fresh', zero);
    };
    if (isOpen) turn();
    else morph(turn, OPEN_MS + 20);
    clearTimeout(freshTimer);
    if (zero) freshTimer = setTimeout(() => box?.classList.remove('fresh'), FRESH_MS);
  }
  if (grew && !reduced()) {
    pill.classList.remove('bump');
    reflow(pill);
    pill.classList.add('bump');
  }
}

// The rows

/** A text that breaks after each '/' and '#'. */
function breakable(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const piece of text.split(/(?<=[/#])/)) {
    fragment.append(piece);
    if (/[/#]$/.test(piece)) fragment.append(document.createElement('wbr'));
  }
  return fragment;
}

function openHref(problem: Problem): string {
  const query = new URLSearchParams({ file: problem.file });
  if (problem.line !== null) query.set('line', String(problem.line));
  return `${OPEN_URL}?${query}`;
}

function fillRow(row: HTMLElement, problem: Problem): void {
  const json = JSON.stringify(problem);
  if (filled.get(row) === json) return;
  filled.set(row, json);
  const inner = document.createElement('div');
  inner.className = 'ck-in';
  const name = document.createElement('span');
  name.className = 'ck-name';
  name.textContent = problem.name;
  const levels = document.createElement('span');
  levels.className = 'ck-lv';
  const siteLevels = data?.levels ?? [];
  for (const id of problem.levels) {
    const stop = siteLevels.findIndex((level) => level.id === id);
    if (stop < 0) continue;
    const icon = document.createElement('span');
    icon.className = 'ck-l';
    icon.title = siteLevels[stop]!.name;
    icon.style.color = colorOf(stop);
    icon.innerHTML = levelIconHtml(siteLevels[stop]!);
    levels.append(icon);
  }
  const value = document.createElement('span');
  value.className = 'ck-val';
  value.append(breakable(problem.value || (problem.text ?? '').trimEnd()));
  const at = document.createElement('a');
  at.className = 'ck-at';
  at.href = openHref(problem);
  at.title = 'Open in editor';
  at.textContent = pathLabel(problem);
  inner.append(name, levels, value, at);
  row.replaceChildren(inner);
}

function groupElement(key: string): HTMLElement | null {
  return [...list.querySelectorAll<HTMLElement>(':scope > .ck-grp')].find((el) => el.dataset.group === key) ?? null;
}

function rowElement(key: string): HTMLElement | null {
  return [...list.querySelectorAll<HTMLElement>('.ck-row')].find((el) => el.dataset.key === key) ?? null;
}

function setFold(group: HTMLElement, folded: boolean): void {
  group.classList.toggle('shut', folded);
  group.querySelector(':scope > .ck-pg')?.setAttribute('aria-expanded', String(!folded));
}

/** Clears what a running change left: the copies, the heights, the signs of the rows and the check. */
function stopChange(): void {
  change++;
  for (const id of timers) clearTimeout(id);
  timers.clear();
  for (const ghost of document.querySelectorAll('.ck-ghost')) ghost.remove();
  if (!box) return;
  for (const el of list.querySelectorAll<HTMLElement>('.ck-grp, .ck-row, .ck-rows')) {
    el.style.removeProperty('height');
    el.style.removeProperty('transition');
    el.style.removeProperty('display');
    if (!el.getAttribute('style')) el.removeAttribute('style');
  }
  for (const el of list.querySelectorAll('.ck-in')) (el as HTMLElement).style.removeProperty('visibility');
  for (const el of list.querySelectorAll('.ck-row.gone')) el.remove();
  for (const el of list.querySelectorAll('.ck-row')) el.classList.remove('fixed', 'new');
}

/** Puts the rows of a list in the panel at once. Gives the rows and the groups that it added. */
function settle(next: readonly Problem[]): { rows: HTMLElement[]; groups: HTMLElement[] } {
  const added = { rows: [] as HTMLElement[], groups: [] as HTMLElement[] };
  if (!box || !data) return added;
  const groups = problemGroups(next, data.url, titlesOf(data.tree));
  const kept: HTMLElement[] = [];
  for (const group of groups) {
    let el = groupElement(group.key);
    if (!el) {
      el = document.createElement('div');
      el.className = 'ck-grp';
      el.dataset.group = group.key;
      el.innerHTML = `<button type="button" class="ck-pg">${svg(CHEV, 'ck-fold')}<span class="ck-lb"></span><span class="ck-n"></span></button><div class="ck-rows"></div>`;
      if (!folds.has(group.key)) folds.set(group.key, startsFolded(group, next.length, data.url));
      added.groups.push(el);
    }
    setFold(el, folds.get(group.key)!);
    el.querySelector('.ck-lb')!.textContent = group.label || '/';
    el.querySelector('.ck-n')!.textContent = String(group.problems.length);
    const rows = el.querySelector<HTMLElement>(':scope > .ck-rows')!;
    const order = group.problems.map((problem) => {
      let row = rowElement(problem.key);
      if (!row) {
        row = document.createElement('div');
        row.className = 'ck-row';
        row.dataset.key = problem.key;
        added.rows.push(row);
      }
      fillRow(row, problem);
      return row;
    });
    rows.replaceChildren(...order);
    kept.push(el);
  }
  if (!next.length) {
    const clear = list.querySelector('.ck-clear') ?? Object.assign(document.createElement('div'), { className: 'ck-clear' });
    clear.innerHTML = svg(CHECK, 'ck-big');
    kept.push(clear as HTMLElement);
  }
  list.replaceChildren(...kept);
  return added;
}

/** Shows a list at once, with no movement. */
function showNow(next: Problem[], before: readonly Problem[]): void {
  settle(next);
  setCount(next.length, false);
  if (!next.length && isOpen && before.length) later(CLEAR_MS, shut);
}

/** Copies of the fixed rows gather on the first one, then fly out to the right, the top one first. */
async function fly(rows: HTMLElement[]): Promise<void> {
  const ghosts = rows.map((row) => {
    const inner = row.querySelector<HTMLElement>('.ck-in')!;
    const rect = inner.getBoundingClientRect();
    const ghost = inner.cloneNode(true) as HTMLElement;
    ghost.classList.add('ck-ghost');
    Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    document.body.append(ghost);
    inner.style.visibility = 'hidden';
    return { ghost, top: rect.top };
  });
  const top = ghosts[0]!.top;
  const stacked = (at: number, from: number) => `translate(${at * 6}px, ${top - from + at * 7}px) rotate(${at * 1.5}deg)`;
  await Promise.all(
    ghosts.map(({ ghost, top: from }, at) =>
      ghost.animate([{ transform: 'none' }, { transform: stacked(at, from) }], {
        duration: ghosts.length > 1 ? GATHER_MS : 0,
        easing: 'cubic-bezier(0.5, 0, 0.2, 1)',
        fill: 'forwards',
      }).finished.catch(() => {}),
    ),
  );
  await Promise.all(
    ghosts.map(({ ghost, top: from }, at) => {
      const start = stacked(at, from);
      return ghost
        .animate(
          [
            { transform: start, opacity: 1, filter: 'blur(0)' },
            { transform: `${start} translateX(-18px)`, opacity: 1, offset: 0.25 },
            { transform: `${start} translateX(130%) rotate(4deg)`, opacity: 0, filter: 'blur(3px)' },
          ],
          {
            duration: FLY_MS,
            delay: (ghosts.length - 1 - at) * FLY_STEP_MS,
            easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)',
            fill: 'forwards',
          },
        )
        .finished.catch(() => {})
        .then(() => ghost.remove());
    }),
  );
}

/** Closes the place of an element, then takes it out. */
function closeUp(el: HTMLElement): void {
  el.style.height = `${el.offsetHeight}px`;
  reflow(el);
  el.style.transition = `height ${CLOSE_ROW_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
  el.style.height = '0px';
  later(CLOSE_ROW_MS + 20, () => el.remove());
}

/** Grows an element from no height to its height. */
function grow(el: HTMLElement): void {
  el.style.removeProperty('height');
  const height = el.offsetHeight;
  el.style.height = '0px';
  reflow(el);
  el.style.transition = `height ${GROW_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1)`;
  el.style.height = `${height}px`;
  later(GROW_MS + 20, () => {
    el.style.removeProperty('height');
    el.style.removeProperty('transition');
    if (!el.getAttribute('style')) el.removeAttribute('style');
  });
}

/** Shows a new list: the fixed rows go first, then the new rows come. */
async function apply(next: Problem[]): Promise<void> {
  const before = shown;
  stopChange();
  settle(before);
  shown = next;
  // During a save show, the marks wait for its end, so they never wrap words that the show changes.
  if (!article()?.hasAttribute('data-save')) drawMarks();
  const own = change;
  const { added, gone } = problemChanges(before, next);
  if (reduced() || (!added.length && !gone.length)) {
    if (added.length && auto.checked) open();
    showNow(next, before);
    return;
  }

  if (gone.length) {
    const rows = gone.map(rowElement).filter((row): row is HTMLElement => !!row);
    const seen = isOpen ? rows.filter((row) => !row.closest('.ck-grp.shut')) : [];
    for (const row of seen) row.classList.add('fixed');
    later(STRIKE_MS, () => setCount(next.length - added.length, false));
    if (seen.length) {
      await wait(STRIKE_MS);
      if (own !== change) return;
      await fly(seen);
      if (own !== change) return;
      for (const row of rows) {
        const group = row.closest<HTMLElement>('.ck-grp')!;
        row.classList.add('gone');
        const left = group.querySelectorAll('.ck-row:not(.gone)').length;
        group.querySelector('.ck-n')!.textContent = String(left);
        closeUp(left ? row : group);
      }
      await wait(CLOSE_ROW_MS + 20);
      if (own !== change) return;
    } else {
      for (const row of rows) row.remove();
      if (added.length) await wait(STRIKE_MS);
      if (own !== change) return;
    }
  }

  if (!next.length) {
    if (isOpen) {
      morph(() => settle(next), OPEN_MS);
      later(CLEAR_MS, shut);
    } else settle(next);
    return;
  }

  if (added.length && auto.checked) open();
  const shownCount = Number(count.lastElementChild?.textContent);
  const made = settle(next);
  if (added.length) setCount(next.length, next.length > shownCount);
  if (!isOpen) return;
  const moving = made.rows.filter((row) => !row.closest('.ck-grp.shut') || made.groups.includes(row.closest('.ck-grp')!));
  for (const group of made.groups) group.style.height = '0px';
  for (const row of moving) if (!made.groups.includes(row.closest('.ck-grp')!)) row.style.height = '0px';
  const gap = Math.min(140, 600 / added.length);
  const grown = new Set<HTMLElement>();
  moving.forEach((row, at) =>
    later(FIRST_ROW_MS + at * gap, () => {
      const group = row.closest<HTMLElement>('.ck-grp')!;
      const folded = group.classList.contains('shut');
      if (made.groups.includes(group) && !grown.has(group)) {
        grown.add(group);
        grow(group);
      } else if (!folded) grow(row);
      if (!folded) {
        row.classList.add('new');
        later(NEW_ROW_MS, () => row.classList.remove('new'));
      }
    }),
  );
  // A new group whose rows are folded still grows.
  for (const group of made.groups) {
    if (!moving.some((row) => row.closest('.ck-grp') === group)) later(FIRST_ROW_MS, () => grow(group));
  }
}

// The marks

/** The style that hides the line of each mark at a level that is not one of the levels of its problem. */
function markRule(): void {
  let style = document.getElementById('ck-level');
  if (!style) {
    style = document.createElement('style');
    style.id = 'ck-level';
    document.head.append(style);
  }
  const level = currentLevel();
  style.textContent = level ? `#page .ck-bad[data-ck-l]:not([data-ck-l~="${CSS.escape(level)}"]){text-decoration:none}` : '';
}

/** Takes every mark out of the text, and joins the text that the marks split. */
export function clearMarks(): void {
  const page = article();
  if (!page) return;
  const parents = new Set<Node>();
  for (const span of page.querySelectorAll('span.ck-bad[data-key]')) {
    if (span.parentNode) parents.add(span.parentNode);
    span.replaceWith(...span.childNodes);
  }
  drawn = null;
  for (const el of page.querySelectorAll('.ck-bad[data-key]')) {
    el.classList.remove('ck-bad');
    el.removeAttribute('data-key');
    el.removeAttribute('data-ck-l');
    if (!el.classList.length) el.removeAttribute('class');
  }
  for (const parent of parents) parent.normalize();
}

/** The element of the page that a mark names, or null. */
function markTarget(problem: Problem): HTMLElement | null {
  const page = article();
  const mark = problem.mark;
  if (!page || !mark) return null;
  const blocks = [...page.children].filter((el) => !el.matches('.seam')) as HTMLElement[];
  const block = blocks[mark.block];
  if (!block || mark.inner === null) return block ?? null;
  const body = block.querySelector(':scope > .bd');
  return (body?.children[mark.inner] as HTMLElement | undefined) ?? null;
}

/** The text nodes of an element that a reader sees, in page order. */
function textNodes(el: Element): Text[] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('svg, script, style, noscript, .marks, span.ck-bad') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  return nodes;
}

/** Wraps the first match of the words in the text of the element in marks. False when the text lacks them. */
function wrapWords(el: HTMLElement, words: string, key: string, levels: string): boolean {
  const nodes = textNodes(el);
  const text = nodes.map((node) => node.data).join('');
  const source = words.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  // The words in their own case come first, and the words in any case after them.
  const found = new RegExp(source, 'u').exec(text) ?? new RegExp(source, 'iu').exec(text);
  if (!found) return false;
  const start = found.index;
  const end = start + found[0].length;
  let at = 0;
  const pieces: { node: Text; from: number; to: number }[] = [];
  for (const node of nodes) {
    const from = Math.max(start, at) - at;
    const to = Math.min(end, at + node.data.length) - at;
    if (from < to) pieces.push({ node, from, to });
    at += node.data.length;
  }
  for (const { node, from, to } of pieces) {
    let piece = node;
    if (from > 0) piece = piece.splitText(from);
    if (to - from < piece.data.length) piece.splitText(to - from);
    const span = document.createElement('span');
    span.className = 'ck-bad';
    span.dataset.key = key;
    if (levels) span.dataset.ckL = levels;
    piece.replaceWith(span);
    span.append(piece);
  }
  return true;
}

/** Draws the marks of the problems of the open page. Marks that are already in the page stay, so a flash goes on. */
export function drawMarks(): void {
  if (!box || !data) return;
  const url = data.url;
  const marked = shown.filter((problem) => problem.page === url && problem.mark);
  const json = JSON.stringify(marked.map(({ key, mark, levels }) => [key, mark, levels]));
  if (json === drawn) return;
  clearMarks();
  drawn = json;
  markRule();
  for (const problem of marked) {
    if (!problem.mark) continue;
    const el = markTarget(problem);
    if (!el) continue;
    const levels = problem.levels.join(' ');
    const { words } = problem.mark;
    if (words && wrapWords(el, words, problem.key, levels)) continue;
    if (words === null && !el.classList.contains('ck-bad')) {
      el.classList.add('ck-bad');
      el.dataset.key = problem.key;
      if (levels) el.dataset.ckL = levels;
    }
  }
}

// The clicks

function openInEditor(problem: Problem): void {
  void fetch(openHref(problem)).catch(() => {});
}

const inView = (el: Element) => {
  const { top, bottom } = el.getBoundingClientRect();
  return top >= VIEW_TOP_PX && bottom <= innerHeight - VIEW_BOTTOM_PX;
};

/** Scrolls so the top of the element sits on the line, over `SCROLL_MS` with a cubic ease-in-out. */
function scrollToLine(el: Element, then: () => void): void {
  const from = scrollY;
  const to = Math.max(0, scrollY + el.getBoundingClientRect().top - innerHeight * LINE_AT);
  if (reduced()) {
    scrollTo(0, to);
    then();
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / SCROLL_MS);
    scrollTo(0, from + (to - from) * ease(t));
    if (t < 1) requestAnimationFrame(step);
    else then();
  };
  requestAnimationFrame(step);
}

/** The marks of a problem in the page, else the element that its mark names, else none. */
function marksOf(problem: Problem): HTMLElement[] {
  const page = article();
  const marks = page ? [...page.querySelectorAll<HTMLElement>('.ck-bad[data-key]')].filter((el) => el.dataset.key === problem.key) : [];
  return marks.length ? marks : [markTarget(problem)].filter((el): el is HTMLElement => !!el);
}

function flash(problem: Problem): void {
  for (const el of marksOf(problem)) {
    el.classList.remove('ck-flash');
    reflow(el);
    el.classList.add('ck-flash');
    setTimeout(() => el.classList.remove('ck-flash'), FLASH_MS);
  }
}

/** Moves the open page to a level of the problem, brings its mark to the line when it is not in view, and flashes it. */
function showMark(problem: Problem): void {
  const ids = data?.levels.map((level) => level.id) ?? [];
  const to = ids.length ? landingLevelFor(problem.levels.join(' ') || null, currentLevel(), ids) : null;
  moveLevel(to, () => {
    const el = markTarget(problem);
    if (!el) return;
    openAround(el);
    const first = marksOf(problem)[0] ?? el;
    if (inView(first)) flash(problem);
    else scrollToLine(first, () => flash(problem));
  });
}

function goTo(problem: Problem): void {
  if (!data) return;
  if (problem.page !== null && problem.page !== data.url) {
    write(session, GO_KEY, problem.key);
    location.assign(encodeUrl(problem.page));
  } else if (problem.page !== null && problem.mark) showMark(problem);
  else openInEditor(problem);
}

function onListClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  const folder = target?.closest<HTMLElement>('button.ck-pg');
  if (folder) {
    const group = folder.closest<HTMLElement>('.ck-grp')!;
    const folded = !group.classList.contains('shut');
    folds.set(group.dataset.group ?? '', folded);
    setFold(group, folded);
    return;
  }
  const row = target?.closest<HTMLElement>('.ck-row');
  const problem = shown.find((item) => item.key === row?.dataset.key);
  if (target?.closest('a.ck-at')) {
    event.preventDefault();
    if (problem) openInEditor(problem);
    return;
  }
  if (problem && target?.closest('.ck-in')) goTo(problem);
}

// The start

/** Hides the marks before a live update changes the blocks of the page, so the blocks compare as the server wrote them. */
export function beforeView(): void {
  if (box) clearMarks();
}

/** Applies the waiting list: at once with no save show, and `AFTER_CHANGE_MS` after the 'change' stage of a show. */
function applyWaiting(): void {
  clearTimeout(waitTimer);
  if (!waiting) return;
  const stage = article()?.getAttribute('data-save') ?? null;
  const run = () => {
    const next = waiting;
    waiting = null;
    if (next) void apply(next);
  };
  if (stage === null) run();
  else if (stage === 'change' && changeAt !== null) {
    waitTimer = setTimeout(run, Math.max(0, changeAt + AFTER_CHANGE_MS - performance.now()));
  }
}

/** Follows the stage of each save show on `#page`, which sets when a waiting list applies. */
function watchStages(): void {
  const page = article();
  if (!page) return;
  new MutationObserver(() => {
    const stage = page.getAttribute('data-save');
    if (stage !== 'change') changeAt = null;
    else changeAt ??= performance.now();
    applyWaiting();
  }).observe(page, { attributes: true, attributeFilter: ['data-save'] });
}

/** Draws the marks again once the new blocks are in the page, and applies a list that still waits. */
export function afterView(): void {
  if (!box) return;
  if (article()?.hasAttribute('data-save')) return;
  if (waiting) applyWaiting();
  else drawMarks();
}

/** Gives the panel the data of the open page after a live update. */
export function setProblemsPage(next: ContentsData): void {
  const moved = data !== null && data.url !== next.url;
  data = next;
  if (box && moved) settle(shown);
}

/**
 * Shows a new list of the problems of the docs. While a save show runs, the list waits until `AFTER_CHANGE_MS` after
 * its 'change' stage.
 */
export function setProblems(problems: Problem[]): void {
  if (!box) {
    shown = problems;
    return;
  }
  waiting = problems;
  applyWaiting();
}

/** Runs the row of the key that a click on another page wrote for this page. */
function runStoredRow(): void {
  const key = read(session, GO_KEY);
  if (key === null) return;
  remove(session, GO_KEY);
  const problem = shown.find((item) => item.key === key);
  if (problem && data && problem.page === data.url) requestAnimationFrame(() => goTo(problem));
}

/** Starts the pill and the panel of the problems, and the marks of the open page. Only the author browser runs it. */
export function startProblems(first: ContentsData): void {
  data = first;
  if (box) return;
  shown = first.author?.problems ?? [];
  build();
  // A page with no problem opens with the panel shut.
  if (!shown.length) write(session, OPEN_KEY, 'shut');
  else if (read(session, OPEN_KEY) === 'open') {
    isOpen = true;
    box!.classList.add('open');
    pill.setAttribute('aria-expanded', 'true');
  }
  settle(shown);
  count.firstElementChild!.textContent = String(shown.length);
  box!.classList.toggle('ok', !shown.length);
  watchBar();
  aroundLevelSet(() => {}, markRule);
  aroundEachSave(clearMarks, afterView);
  watchStages();
  drawMarks();
  runStoredRow();
}
