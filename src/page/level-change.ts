import { counterpartIn, levelRule, pairRuns } from './levels.ts';

const DURATION_MS = 560;
const SIGNAL_MS = 2800;
const QUIET_MS = 180;
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
let quietUntil = 0;
/** Where the page's own last scroll left it. A slow frame can bring that scroll's event after the quiet time. */
let ownScrollY = 0;
let scrolled = false;
let watching = false;
/** Where the reader was when the current run of moves began. */
let origin: Place | null = null;

function partLevels(el: Element): string[] | null {
  return el.classList.contains('part') ? (el.getAttribute('data-l')?.split(' ') ?? null) : null;
}

function shows(el: Element, level: string): boolean {
  const ids = partLevels(el);
  return !ids || ids.includes(level);
}

const lineY = () => innerHeight * LINE_AT;
const heightOf = (el: Element) => el.getBoundingClientRect().height;
const levelStyle = () => document.getElementById('nd-level');
const blocksOf = (page: HTMLElement) => [...page.children].filter((el) => el !== seamLine) as HTMLElement[];

function hush(): void {
  quietUntil = performance.now() + QUIET_MS;
}

function watchScroll(): void {
  if (watching) return;
  watching = true;
  addEventListener(
    'scroll',
    () => {
      if (performance.now() > quietUntil && Math.abs(scrollY - ownScrollY) > 1) scrolled = true;
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
  hush();
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

/** Short lines at the right edge show changed parts that are off screen. */
function showTicks(changed: HTMLElement[], color: string): void {
  const box = ticksBox();
  box.textContent = '';
  const height = document.documentElement.scrollHeight;
  const seen = new Set<number>();
  for (const el of changed) {
    const { top, bottom } = el.getBoundingClientRect();
    if (bottom >= 0 && top <= innerHeight) continue;
    const percent = Math.round(((top + scrollY) / height) * 200) / 2;
    if (seen.has(percent)) continue;
    seen.add(percent);
    const tick = document.createElement('i');
    tick.style.setProperty('--fc', color);
    tick.style.top = `${percent}%`;
    box.append(tick);
  }
}

function clearSignals(): void {
  clearTimeout(signalTimer);
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

/** Ends a running change and its signals, so the text is plain again. */
export function finishChange(): void {
  finishRunning();
  clearSignals();
}

/** Moves to a level with no animation, and forgets where the reader was. */
export function jumpToLevel(level: string): void {
  finishChange();
  setRule(level);
  origin = null;
  clearRoom(document.getElementById('page'));
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

export function changeLevel({ to, color, sameMarks }: LevelMove): void {
  const from = currentLevel();
  const page = document.getElementById('page');
  if (!page || to === from) return;
  finishRunning();
  watchScroll();

  const blocks = blocksOf(page);
  const here = placeOf(blocks, from);
  hush();
  if (scrolled || !origin?.el.isConnected) origin = here;
  const place = origin;

  const before = new Map<HTMLElement, Box>();
  for (const el of blocks) {
    if (!shows(el, from)) continue;
    const { top, height } = el.getBoundingClientRect();
    before.set(el, { top, height });
  }

  clearRoom(page);
  setRule(to);
  page.classList.toggle('samemarks', sameMarks);
  scrolled = false;

  const { leave, enter, pairs } = pairRuns(blocks, partLevels, from, to);
  const after = new Map<HTMLElement, number>();
  for (const el of [...enter, ...pairs.map((pair) => pair.el)]) after.set(el, heightOf(el));

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
      const twin = counterpartIn(blocks, partLevels, place.el, place.level, to);
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
  const isChanged = new Set(changed);
  const movingLeave = leave.filter(nearOld);
  const movingEnter = enter.filter(nearNew);
  const movingPairs = pairs
    .filter((pair) => nearNew(pair.el) || nearOld(pair.old))
    .map((pair) => ({ ...pair, ghost: document.createElement('div') }));
  const moving = [...movingLeave, ...movingEnter, ...movingPairs.map((pair) => pair.el)];

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
  }
  for (const { el, old, ghost } of movingPairs) {
    ghost.className = 'ghost';
    ghost.innerHTML = old.querySelector('.bd')?.innerHTML ?? '';
    el.append(ghost);
    el.style.clipPath = CLIP;
  }
  for (const el of movingEnter) el.style.clipPath = CLIP;
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
    if (target) {
      hush();
      scrollBy(0, target.getBoundingClientRect().top - (topStart + (topEnd - topStart) * e));
      ownScrollY = scrollY;
    }
  }

  function end(): void {
    running = null;
    for (const el of moving) clearStyle(el, 'height', 'opacity', 'clip-path', 'display');
    for (const { el, ghost } of movingPairs) {
      ghost.remove();
      const body = el.querySelector<HTMLElement>('.bd');
      if (body) clearStyle(body, 'opacity');
    }
    clearRoom(page);
    if (target) scrollHolding(page!, scrollY + target.getBoundingClientRect().top - topEnd);
    if (tint) showTicks(changed, color);
  }

  frame(0);
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
