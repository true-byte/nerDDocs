import { counterpartIn, levelRule, pairRuns } from './levels.ts';

const DURATION_MS = 560;
const SIGNAL_MS = 2800;
const LINE_AT = 0.3;
const CLIP = 'inset(-6px -40px -6px -40px)';

export interface LevelMove {
  to: string;
  color: string;
  sameMarks: boolean;
}

interface Place {
  el: HTMLElement;
  level: string;
  offset: number;
  fraction: number;
  height: number;
  atTop: boolean;
}

interface Box {
  top: number;
  height: number;
}

let running: { end(): void } | null = null;
let signalTimer: ReturnType<typeof setTimeout> | undefined;
/** An empty element that draws the line where text went away, also before a block that clips. */
let seamLine: HTMLElement | null = null;
/** Where the page's own last scroll left it. A scroll event that finds the page elsewhere is the reader's. */
let ownScrollY = 0;
let scrolled = false;
let watching = false;
/** Where the reader was when the current run of moves began. */
let origin: Place | null = null;
/** A tick at the right edge, and the changed parts off screen at its place. */
interface Tick {
  el: HTMLElement;
  parts: HTMLElement[];
}

/** The ticks of the last level change, until the signals end. */
let ticked: Tick[] | null = null;

function partLevels(el: Element): string[] | null {
  return el.classList.contains('part') ? (el.getAttribute('data-l')?.split(' ') ?? null) : null;
}

function shows(el: Element, level: string): boolean {
  const ids = partLevels(el) ?? el.getAttribute('data-shows')?.split(' ');
  return !ids || ids.includes(level);
}

const lineY = () => innerHeight * LINE_AT;
const heightOf = (el: Element) => el.getBoundingClientRect().height;
const levelStyle = () => document.getElementById('nd-level');
const blocksOf = (page: HTMLElement) => [...page.children].filter((el) => el !== seamLine) as HTMLElement[];

function watchScroll(): void {
  if (watching) return;
  watching = true;
  addEventListener(
    'scroll',
    () => {
      if (Math.abs(scrollY - ownScrollY) > 1) scrolled = true;
    },
    { passive: true },
  );
}

export function currentLevel(): string {
  return levelStyle()?.dataset.level ?? '';
}

function setRule(level: string): void {
  const style = levelStyle();
  if (!style) return;
  style.dataset.level = level;
  style.textContent = levelRule(level);
}

/** The block on the line 30% down the screen, or the first block below it. */
function placeOf(blocks: HTMLElement[], level: string): Place | null {
  const line = lineY();
  let found: HTMLElement | null = null;
  let last: HTMLElement | null = null;
  for (const el of blocks) {
    if (!shows(el, level)) continue;
    last = el;
    const box = el.getBoundingClientRect();
    if (box.bottom > line) {
      found = el;
      break;
    }
  }
  const el = found ?? last;
  if (!el) return null;
  const box = el.getBoundingClientRect();
  return {
    el,
    level,
    offset: box.top - line,
    fraction: box.height ? Math.max(0, (line - box.top) / box.height) : 0,
    height: box.height,
    atTop: scrollY < 2,
  };
}

/** A short level still scrolls far enough to hold the place, until the next change. */
function scrollHolding(page: HTMLElement, y: number): void {
  const over = y - (document.documentElement.scrollHeight - innerHeight);
  if (over > 0) page.style.minHeight = `${page.getBoundingClientRect().height + over}px`;
  scrollTo(0, y);
  ownScrollY = scrollY;
}

function clearRoom(page: HTMLElement | null): void {
  page?.style.removeProperty('padding-bottom');
  page?.style.removeProperty('min-height');
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function nextShown(blocks: HTMLElement[], from: HTMLElement, level: string): HTMLElement | null {
  const at = blocks.indexOf(from);
  for (let n = at + 1; n < blocks.length; n++) {
    if (shows(blocks[n]!, level)) return blocks[n]!;
  }
  for (let n = at - 1; n >= 0; n--) {
    if (shows(blocks[n]!, level)) return blocks[n]!;
  }
  return null;
}

function clearStyle(el: HTMLElement, ...names: string[]): void {
  for (const name of names) el.style.removeProperty(name);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

function ticksBox(): HTMLElement {
  let box = document.getElementById('ticks');
  if (!box) {
    box = document.createElement('div');
    box.id = 'ticks';
    box.setAttribute('aria-hidden', 'true');
    document.body.append(box);
  }
  return box;
}

/** The place of a changed part as a share of the page height in steps of half a percent, or null while it is on screen. */
function tickPlace(part: HTMLElement, height: number): number | null {
  const { top, bottom } = part.getBoundingClientRect();
  if (bottom >= 0 && top <= innerHeight) return null;
  return Math.round(((top + scrollY) / height) * 200) / 2;
}

/** Short lines at the right edge show changed parts that are off screen, one line for each place. */
function showTicks(changed: HTMLElement[], color: string): Tick[] {
  const box = ticksBox();
  box.textContent = '';
  const height = document.documentElement.scrollHeight;
  const at = new Map<number, Tick>();
  for (const part of changed) {
    const percent = tickPlace(part, height);
    if (percent === null) continue;
    const found = at.get(percent);
    if (found) {
      found.parts.push(part);
      continue;
    }
    const el = document.createElement('i');
    el.style.setProperty('--fc', color);
    el.style.top = `${percent}%`;
    box.append(el);
    at.set(percent, { el, parts: [part] });
  }
  return [...at.values()];
}

/**
 * Puts each tick of the last level change at the new place of its parts, while the ticks show. Each tick keeps its
 * element, so its fade goes on. A tick whose parts are all on screen now goes away, and two ticks at one place become one.
 */
export function moveTicks(): void {
  if (!ticked) return;
  const height = document.documentElement.scrollHeight;
  const at = new Map<number, Tick>();
  for (const tick of ticked) {
    const places = tick.parts.map((part) => tickPlace(part, height));
    const percent = places.find((place) => place !== null) ?? null;
    const found = percent === null ? undefined : at.get(percent);
    if (percent === null || found) {
      tick.el.remove();
      found?.parts.push(...tick.parts);
      continue;
    }
    tick.el.style.top = `${percent}%`;
    at.set(percent, tick);
  }
  ticked = [...at.values()];
}

function clearSignals(): void {
  clearTimeout(signalTimer);
  ticked = null;
  document.getElementById('ticks')?.replaceChildren();
  seamLine?.remove();
  seamLine = null;
  for (const el of document.querySelectorAll<HTMLElement>('#page .flash')) {
    el.classList.remove('flash');
    clearStyle(el, '--fc');
  }
}

function finishRunning(): void {
  running?.end();
}

/** True while the text of a level change still moves. */
export function changeRunning(): boolean {
  return running !== null;
}

const enders = new Set<() => void>();

/** Runs `done` at the end of each level change, when its text is still. */
export function afterEachChange(done: () => void): void {
  enders.add(done);
}

const arounds: { before: () => void; after: () => void }[] = [];

/**
 * Runs `before` right before each level change or jump sets its rule, and `after` right after the rule and the
 * first scroll, in the same task.
 */
export function aroundLevelSet(before: () => void, after: () => void): void {
  arounds.push({ before, after });
}

const beforeLevelSet = () => arounds.forEach(({ before }) => before());
const afterLevelSet = () => arounds.forEach(({ after }) => after());

/** Ends a running change and its signals, so the text is plain again. */
export function finishChange(): void {
  finishRunning();
  clearSignals();
}

/** Moves to a level with no animation, and forgets where the reader was. */
export function jumpToLevel(level: string): void {
  finishChange();
  beforeLevelSet();
  setRule(level);
  origin = null;
  clearRoom(document.getElementById('page'));
  afterLevelSet();
}

/** Moves focus to the block held on the line, since focus otherwise stays on the slider. */
export function focusHeldText(): void {
  const page = document.getElementById('page');
  const el = page && placeOf(blocksOf(page), currentLevel())?.el;
  if (!el) return;
  el.tabIndex = -1;
  el.focus({ preventScroll: true });
  el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
}

/** A drawing of a diagram that a ghost holds during a change, and the box of the page that it comes from. */
interface Lent {
  svg: SVGSVGElement;
  home: Element;
}

/** The diagram boxes that scroll sideways, as the copy in a ghost holds them too. */
const DRAWING_BOX = '.dg > .sbox';

/**
 * Moves each drawing of a diagram of `body` into the box at the same place in `ghost`, in place of its copy. A copy
 * without ids would lose the styles and arrows that its drawing names by id. `body` is hidden by then, so the move
 * shows nothing.
 */
function lendDrawings(body: Element, ghost: Element): Lent[] {
  const copies = ghost.querySelectorAll(DRAWING_BOX);
  const lent: Lent[] = [];
  body.querySelectorAll(DRAWING_BOX).forEach((home, index) => {
    const svg = home.querySelector(':scope > svg');
    const copy = copies[index];
    if (!(svg instanceof SVGSVGElement) || !copy) return;
    copy.replaceChildren(svg);
    lent.push({ svg, home });
  });
  return lent;
}

/**
 * Puts a leaving part before `next`. `moveBefore` keeps the state of a frame inside the part. Without it, a part that
 * holds a frame stays where it is, since a move would load the frame again.
 */
function movePart(parent: Node, el: HTMLElement, next: Node | null): void {
  const mover = parent as Node & { moveBefore?: (node: Node, child: Node | null) => void };
  if (typeof mover.moveBefore === 'function') {
    try {
      mover.moveBefore(el, next);
      return;
    } catch {
      // A move that the browser refuses falls back to the rule below.
    }
  }
  if (!el.querySelector('iframe')) parent.insertBefore(el, next);
}

/** Each frame of a ghost becomes an empty box with its class and its size, so the ghost loads no wireframe again. */
function emptyFrames(ghost: HTMLElement): void {
  for (const frame of ghost.querySelectorAll('iframe')) {
    const box = document.createElement('div');
    for (const name of ['class', 'style']) {
      const value = frame.getAttribute(name);
      if (value !== null) box.setAttribute(name, value);
    }
    frame.replaceWith(box);
  }
}

export function changeLevel({ to, color, sameMarks }: LevelMove): void {
  const from = currentLevel();
  const page = document.getElementById('page');
  if (!page || to === from) return;
  finishRunning();
  watchScroll();

  const blocks = blocksOf(page);
  const here = placeOf(blocks, from);
  if (scrolled || !origin?.el.isConnected) origin = here;
  const place = origin;

  const before = new Map<HTMLElement, Box>();
  for (const el of blocks) {
    if (!shows(el, from)) continue;
    const { top, height } = el.getBoundingClientRect();
    before.set(el, { top, height });
  }

  clearRoom(page);
  beforeLevelSet();
  setRule(to);
  page.classList.toggle('samemarks', sameMarks);
  scrolled = false;
  ownScrollY = scrollY;

  // The origin can be at a third level, with a run shorter at `from` or at `to`. The part on the line
  // changes into the origin's place at `to`, so the shorter side loses no place: name the side that holds it.
  const twin = place && !shows(place.el, to) ? counterpartIn(blocks, partLevels, place.el, place.level, to) : null;
  const into = place && shows(place.el, to) ? place.el : twin;
  const read = place?.level === from ? place.el : place && counterpartIn(blocks, partLevels, place.el, place.level, from);
  const keepsPlace = read && (!into || counterpartIn(blocks, partLevels, read, from, to) === into);
  const reading = (keepsPlace ? read : into) ?? undefined;
  const { leave, enter, pairs } = pairRuns(blocks, partLevels, from, to, reading);
  const shared = blocks.filter((el) => el.hasAttribute('data-shows'));
  const goes = shared.filter((el) => shows(el, from) && !shows(el, to));
  const comes = shared.filter((el) => !shows(el, from) && shows(el, to));
  const after = new Map<HTMLElement, number>();
  for (const el of [...enter, ...comes, ...pairs.map((pair) => pair.el)]) after.set(el, heightOf(el));

  // The block that stays at its place on the screen, and where it ends up.
  const line = lineY();
  const screen = innerHeight;
  let target: HTMLElement | null = null;
  let topEnd = 0;
  if (place && !place.atTop) {
    if (place.el.isConnected && shows(place.el, to)) {
      target = place.el;
      topEnd = line + place.offset;
    } else {
      target = twin ?? nextShown(blocks, place.el, to);
      topEnd = line;
      if (twin) {
        const height = heightOf(twin);
        if (place.height > screen && height > screen) topEnd -= place.fraction * height;
      }
    }
  }
  const partner = pairs.find((pair) => pair.el === target)?.old;
  const topStart = target ? (before.get(target)?.top ?? (partner && before.get(partner)?.top) ?? line) : 0;

  // Only text within one screen of the view animates. The rest changes at once.
  const shift = target ? topEnd - target.getBoundingClientRect().top : 0;
  const nearNew = (el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    return box.bottom + shift > -screen && box.top + shift < 2 * screen;
  };
  const nearOld = (el: HTMLElement) => {
    const box = before.get(el);
    return !!box && box.top + box.height > -screen && box.top < 2 * screen;
  };
  const onScreen = (el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    return box.bottom + shift > 0 && box.top + shift < screen;
  };
  const changed = [...enter, ...pairs.map((pair) => pair.el)];
  const isChanged = new Set([...changed, ...comes]);
  const movingLeave = leave.filter(nearOld);
  const movingEnter = enter.filter(nearNew);
  const movingPairs = pairs
    .filter((pair) => nearNew(pair.el) || nearOld(pair.old))
    .map((pair) => ({ ...pair, ghost: document.createElement('div') }));
  /** The drawings that the ghosts hold, each with the box that it goes back to. */
  const lent: Lent[] = [];
  // A shared heading or details closes its room through its bottom margin, so its text keeps its shape as it fades.
  const movingShared = [...goes.filter(nearOld), ...comes.filter(nearNew)].map((el) => ({
    el,
    going: goes.includes(el),
    size: before.get(el)?.height ?? after.get(el) ?? 0,
    margin: parseFloat(getComputedStyle(el).marginBottom) || 0,
  }));
  // The parts inside a details that goes stay until it has gone, or its room would close at once.
  const keptInside = movingShared
    .filter(({ going }) => going)
    .flatMap(({ el }) => [...el.querySelectorAll<HTMLElement>('.part')].filter((part) => shows(part, from)));
  const moving = [
    ...movingLeave,
    ...movingEnter,
    ...movingPairs.map((pair) => pair.el),
    ...movingShared.map((item) => item.el),
    ...keptInside,
  ];

  // A leaving part with no partner keeps its side of each part that takes over a partner, so nothing on
  // screen changes order on the first frame. Its place in the page comes back when the move ends.
  const homes = pairs.length ? movingLeave.map((el) => ({ el, next: el.nextSibling })) : [];
  const partnerOf = new Map(pairs.map((pair) => [pair.old, pair.el]));
  const endsRun = (el: HTMLElement) => {
    const ids = partLevels(el);
    return !ids || (ids.includes(from) && ids.includes(to));
  };
  const nearestPartner = (el: HTMLElement, step: 1 | -1) => {
    for (let n = blocks.indexOf(el) + step; blocks[n] && !endsRun(blocks[n]!); n += step) {
      const partner = partnerOf.get(blocks[n]!);
      if (partner) return partner;
    }
    return null;
  };

  // No tint when no unchanged text is on screen and changed text is.
  const unchangedOnScreen = blocks.some((el) => shows(el, to) && !isChanged.has(el) && onScreen(el));
  const tint = unchangedOnScreen || !changed.some(onScreen);

  const seam = !enter.length && !pairs.length && leave[0] ? nextShown(blocks, leave[0], to) : null;
  clearSignals();
  void document.body.offsetWidth;
  if (tint) {
    for (const el of [...movingEnter, ...movingPairs.map((pair) => pair.el)]) {
      el.style.setProperty('--fc', color);
      el.classList.add('flash');
    }
    if (seam && leave[0] && blocks.indexOf(seam) > blocks.indexOf(leave[0])) {
      seamLine = document.createElement('div');
      seamLine.className = 'seam';
      seamLine.setAttribute('aria-hidden', 'true');
      seamLine.style.setProperty('--fc', color);
      seam.before(seamLine);
    }
  }

  for (const el of movingLeave) {
    el.style.display = 'flow-root';
    el.style.clipPath = CLIP;
    const partner = nearestPartner(el, 1);
    if (partner) movePart(partner.parentNode ?? page, el, partner);
  }
  for (const { el } of [...homes].reverse()) {
    const partner = nearestPartner(el, 1) ? null : nearestPartner(el, -1);
    if (partner) movePart(partner.parentNode ?? page, el, partner.nextSibling);
  }
  for (const { el, old, ghost } of movingPairs) {
    const body = old.querySelector('.bd');
    ghost.className = 'ghost';
    ghost.innerHTML = body?.innerHTML ?? '';
    for (const inner of ghost.querySelectorAll('[id]')) inner.removeAttribute('id');
    emptyFrames(ghost);
    if (body) lent.push(...lendDrawings(body, ghost));
    el.append(ghost);
    el.style.clipPath = CLIP;
  }
  for (const el of movingEnter) el.style.clipPath = CLIP;
  for (const { el, going } of movingShared) if (going) el.style.display = 'flow-root';
  for (const part of keptInside) part.style.display = 'flow-root';
  page.style.paddingBottom = '110vh';

  function frame(t: number): void {
    const e = ease(t);
    for (const el of movingLeave) {
      el.style.height = `${before.get(el)!.height * (1 - e)}px`;
      el.style.opacity = String(Math.max(0, 1 - e * 1.5));
    }
    for (const { el, old, ghost } of movingPairs) {
      const start = before.get(old)?.height ?? 0;
      const end = after.get(el) ?? 0;
      el.style.height = `${start + (end - start) * e}px`;
      ghost.style.opacity = String(Math.max(0, 1 - e / 0.45));
      el.querySelector<HTMLElement>('.bd')?.style.setProperty('opacity', String(Math.max(0, (e - 0.35) / 0.65)));
    }
    for (const el of movingEnter) {
      el.style.height = `${(after.get(el) ?? 0) * e}px`;
      el.style.opacity = String(Math.max(0, (e - 0.3) / 0.7));
    }
    for (const { el, going, size, margin } of movingShared) {
      el.style.marginBottom = `${margin - (size + margin) * (going ? e : 1 - e)}px`;
      el.style.opacity = String(going ? Math.max(0, 1 - e * 1.5) : Math.max(0, (e - 0.3) / 0.7));
    }
    if (target) {
      scrollBy(0, target.getBoundingClientRect().top - (topStart + (topEnd - topStart) * e));
      ownScrollY = scrollY;
    }
  }

  function end(): void {
    running = null;
    for (const { el, next } of [...homes].reverse()) movePart(page!, el, next);
    for (const el of moving) clearStyle(el, 'height', 'opacity', 'clip-path', 'display', 'margin-bottom');
    for (const { svg, home } of lent.splice(0)) home.append(svg);
    for (const { el, ghost } of movingPairs) {
      ghost.remove();
      const body = el.querySelector<HTMLElement>('.bd');
      if (body) clearStyle(body, 'opacity');
    }
    clearRoom(page);
    if (target) scrollHolding(page!, scrollY + target.getBoundingClientRect().top - topEnd);
    if (tint) ticked = showTicks(changed, color);
    for (const done of enders) done();
  }

  frame(0);
  afterLevelSet();
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) {
    frame(1);
    end();
  } else {
    const startedAt = performance.now();
    let id = 0;
    running = {
      end() {
        cancelAnimationFrame(id);
        frame(1);
        end();
      },
    };
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / DURATION_MS);
      frame(t);
      if (t < 1) id = requestAnimationFrame(tick);
      else end();
    };
    id = requestAnimationFrame(tick);
  }
  clearTimeout(signalTimer);
  signalTimer = setTimeout(clearSignals, SIGNAL_MS);
}
