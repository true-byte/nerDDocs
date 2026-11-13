import type { Level } from '../site/config.ts';
import { hollowSpots, type HollowSpot } from './hollow-marks.ts';
import { levelIconHtml } from './icons.tsx';
import { moveLevel } from './level-address.ts';
import { afterEachChange, aroundLevelSet, changeRunning, currentLevel } from './level-change.ts';
import { colorOf, isFlat } from './levels.ts';
import { aroundEachSave, saveRunning } from './save-show.ts';

/** What the dashed icons need to know about the open page. */
export interface HollowPage {
  levels: Level[];
  parts: string[];
}

/** The size of an icon, the room between the tops of two icons, and the room under the level icons of a part. */
const ICON_PX = 16;
const ICON_STEP_PX = 19;
const BELOW_MARKS_PX = 3;
/** The marks strip sits this far left of the text, when no part of the page has marks to measure. */
const STRIP_CENTER_PX = 20;

let page: HollowPage | null = null;
let layer: HTMLElement | null = null;
let frame = 0;

const docTop = (el: Element) => el.getBoundingClientRect().top + scrollY;
const shown = (el: Element) => el.getClientRects().length > 0;
/** The blocks of the page, without the line that a level change draws where text went away. */
const blocksOf = (article: Element) => [...article.children].filter((el) => !el.matches('.seam')) as HTMLElement[];

/** The center of the marks strip, from the left of the document. */
function stripX(article: HTMLElement): number {
  const left = article.getBoundingClientRect().left + scrollX;
  const marks = [...article.querySelectorAll<HTMLElement>(':scope > .part > .marks')];
  const visible = marks.find(shown);
  if (visible) {
    const box = visible.getBoundingClientRect();
    return box.left + scrollX + box.width / 2;
  }
  const style = marks[0] && getComputedStyle(marks[0]);
  const offset = style ? parseFloat(style.left) + parseFloat(style.width) / 2 : NaN;
  return left + (Number.isFinite(offset) ? offset : -STRIP_CENTER_PX);
}

/** The top of the first icon of a spot under a shown part: 3px below its last level icon. */
function belowMarks(anchor: HTMLElement): number {
  const top = docTop(anchor);
  const marks = anchor.querySelector<HTMLElement>(':scope > .marks');
  const last = marks?.lastElementChild;
  if (marks && last instanceof HTMLElement && shown(marks)) {
    return top + marks.offsetTop + last.offsetTop + last.offsetHeight + BELOW_MARKS_PX;
  }
  const style = getComputedStyle(marks ?? anchor);
  return top + (marks ? parseFloat(style.top) || 0 : parseFloat(style.fontSize) * 0.32);
}

/** The top of the first icon of a gap: its center sits halfway between the block before the run and the block after it. */
function inGap(blocks: HTMLElement[], first: number): number {
  let last = first;
  while (blocks[last + 1]?.matches('div.part')) last++;
  const before = blocks.slice(0, first).reverse().find(shown);
  const after = blocks.slice(last + 1).find(shown);
  const from = before ? before.getBoundingClientRect().bottom + scrollY : null;
  const to = after ? docTop(after) : null;
  const middle = from !== null && to !== null ? (from + to) / 2 : (from ?? to ?? docTop(blocks[first]!));
  return middle - ICON_PX / 2;
}

/** Changes to the level of the icon, then puts the first part of the spot at that level where the icon was. */
function open(spot: HollowSpot, level: string, icon: HTMLElement, blocks: HTMLElement[]): void {
  const top = icon.getBoundingClientRect().top;
  const part = blocks[spot.first[level]!];
  moveLevel(level, () => {
    if (part?.isConnected && shown(part)) scrollBy(0, part.getBoundingClientRect().top - top);
  });
}

function draw(): void {
  if (!layer) return;
  layer.replaceChildren();
  const article = document.getElementById('page');
  if (!article || !page || page.levels.length < 2 || isFlat(page)) return;
  const order = page.levels.map((level) => level.id);
  const blocks = blocksOf(article);
  const levels = blocks.map((el) => (el.matches('div.part') ? (el.getAttribute('data-l')?.split(' ') ?? []) : null));
  const spots = hollowSpots(levels, currentLevel(), order);
  if (!spots.length) return;
  const x = stripX(article);
  for (const spot of spots) {
    let y = spot.anchor !== null ? belowMarks(blocks[spot.anchor]!) : inGap(blocks, spot.gap!);
    for (const id of spot.levels) {
      const stop = order.indexOf(id);
      const level = page.levels[stop]!;
      const icon = document.createElement('button');
      icon.type = 'button';
      icon.className = 'hollow';
      icon.dataset.level = id;
      icon.setAttribute('aria-label', level.name);
      icon.title = level.name;
      icon.tabIndex = -1;
      icon.style.setProperty('--mc', colorOf(stop));
      icon.style.left = `${x - ICON_PX / 2}px`;
      icon.style.top = `${y}px`;
      icon.innerHTML = levelIconHtml(level);
      icon.addEventListener('click', () => open(spot, id, icon, blocks));
      layer.append(icon);
      y += ICON_STEP_PX;
    }
  }
}

function hide(): void {
  cancelAnimationFrame(frame);
  layer?.classList.add('wait');
}

/** Draws the icons in the next frame, unless a level change or a save show still moves the text. */
function drawSoon(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (changeRunning() || saveRunning()) return;
    draw();
    layer?.classList.remove('wait');
  });
}

/** Gives the icons the data of the open page after a live update, and draws them again. */
export function setHollowPage(next: HollowPage): void {
  page = next;
  if (layer) drawSoon();
}

/**
 * Starts the dashed icons of the author browser: beside each place where other levels have text that the current level
 * hides, one icon for each such level. A click on an icon opens its level there.
 */
export function startHollow(first: HollowPage): void {
  page = first;
  if (layer) return;
  layer = document.createElement('div');
  layer.id = 'hollow';
  layer.className = 'wait';
  document.body.append(layer);
  aroundLevelSet(hide, drawSoon);
  afterEachChange(drawSoon);
  aroundEachSave(hide, drawSoon);
  addEventListener('resize', drawSoon);
  document.fonts?.addEventListener('loadingdone', drawSoon);
  void document.fonts?.ready.then(drawSoon);
  const article = document.getElementById('page');
  if (article) new ResizeObserver(drawSoon).observe(article);
  drawSoon();
}
