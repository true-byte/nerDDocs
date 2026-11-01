import type { Level } from '../site/config.ts';
import type { PageLevels } from '../site/view.ts';

export const colorOf = (index: number) => `var(--l${index % 5})`;

/** The one CSS rule that hides each part without the current level. */
export function levelRule(level: string): string {
  return level ? `.part[data-l]:not([data-l~="${level}"]){display:none}` : '';
}

export const isFlat = (page: Pick<PageLevels, 'parts'>) => page.parts.length === 0;

/** A stop is hollow on a page with marks and no text at that level. */
export function hollowStops(page: Pick<PageLevels, 'levels' | 'parts'>): boolean[] {
  if (isFlat(page)) return page.levels.map(() => false);
  const used = new Set(page.parts.flatMap((value) => value.split(' ')));
  return page.levels.map((level) => !used.has(level.id));
}

/** The stop that a key moves to, or null for a key that is not for the slider. */
export function stopForKey(key: string, at: number, hollow: boolean[]): number | null {
  const count = hollow.length;
  if (/^[1-9]$/.test(key)) {
    const stop = Number(key) - 1;
    return stop < count && !hollow[stop] ? stop : at;
  }
  const walks: Record<string, [number, number]> = {
    ArrowRight: [at + 1, 1],
    ArrowUp: [at + 1, 1],
    ArrowLeft: [at - 1, -1],
    ArrowDown: [at - 1, -1],
    Home: [0, 1],
    End: [count - 1, -1],
  };
  const walk = walks[key];
  if (!walk) return null;
  let [stop, step] = walk;
  while (hollow[stop]) stop += step;
  return stop >= 0 && stop < count ? stop : at;
}

/** The stop under a pointer. */
export function stopAt(x: number, left: number, width: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(((x - left) / width) * count)));
}

/** The center of a stop on the track, in percent. */
export const stopCenter = (stop: number, count: number) => ((stop + 0.5) / count) * 100;

/** The thumb during a drag stays between the centers of the first and last stops. */
export function thumbAt(x: number, left: number, width: number, count: number): number {
  const low = 0.5 / count;
  return Math.max(low, Math.min(1 - low, (x - left) / width)) * 100;
}

export function nearestLive(stop: number, hollow: boolean[]): number {
  if (!hollow[stop]) return stop;
  for (let distance = 1; distance < hollow.length; distance++) {
    if (hollow[stop + distance] === false) return stop + distance;
    if (hollow[stop - distance] === false) return stop - distance;
  }
  return stop;
}

/** With no shared text and one kind of part at this level, the marks say nothing. */
export function sameMarks(page: Pick<PageLevels, 'parts' | 'hasShared'>, level: string): boolean {
  if (page.hasShared) return false;
  return page.parts.filter((value) => value.split(' ').includes(level)).length === 1;
}

/** The default level, or the first level with text on a page without text at the default. */
export function openingLevel(page: Pick<PageLevels, 'levels' | 'parts' | 'defaultLevel'>): string {
  const hollow = hollowStops(page);
  const at = page.levels.findIndex((level) => level.id === page.defaultLevel);
  if (at >= 0 && !hollow[at]) return page.defaultLevel;
  return page.levels[Math.max(0, hollow.indexOf(false))]?.id ?? '';
}

/** A live update keeps the level, unless the page moved or has no text at that level. */
export function levelAfterUpdate(current: string, page: PageLevels, moved: boolean): string {
  const at = page.levels.findIndex((level) => level.id === current);
  return moved || at < 0 || hollowStops(page)[at] ? openingLevel(page) : current;
}

const COMPACT_ABOVE_LEVELS = 4;
const COMPACT_ABOVE_LETTERS = 48;

/** The guess for the first paint, before the names can be measured. */
export function compactGuess(levels: Pick<Level, 'name'>[]): boolean {
  const letters = levels.reduce((sum, level) => sum + level.name.length, 0);
  return levels.length > COMPACT_ABOVE_LEVELS || letters > COMPACT_ABOVE_LETTERS;
}

export interface LevelSwap<T> {
  leave: T[];
  enter: T[];
  /** A leaving part and the entering part that takes its place. */
  pairs: { el: T; old: T }[];
}

/** Within one run of parts with no shared text between them, parts pair up by order. */
export function pairRuns<T>(
  blocks: T[],
  idsOf: (block: T) => string[] | null,
  from: string,
  to: string,
): LevelSwap<T> {
  const swap: LevelSwap<T> = { leave: [], enter: [], pairs: [] };
  let leaving: T[] = [];
  let entering: T[] = [];
  const endRun = () => {
    const paired = Math.min(leaving.length, entering.length);
    for (let n = 0; n < paired; n++) swap.pairs.push({ el: entering[n]!, old: leaving[n]! });
    swap.leave.push(...leaving.slice(paired));
    swap.enter.push(...entering.slice(paired));
    leaving = [];
    entering = [];
  };
  for (const block of blocks) {
    const ids = idsOf(block);
    if (!ids) {
      endRun();
      continue;
    }
    const was = ids.includes(from);
    const now = ids.includes(to);
    if (was && !now) leaving.push(block);
    if (!was && now) entering.push(block);
  }
  endRun();
  return swap;
}

/** The part that takes the place of a part at another level, as pairRuns pairs them. */
export function counterpartIn<T>(
  blocks: T[],
  idsOf: (block: T) => string[] | null,
  part: T,
  from: string,
  to: string,
): T | null {
  const at = blocks.indexOf(part);
  if (at < 0 || !idsOf(part)) return null;
  let start = at;
  while (start > 0 && idsOf(blocks[start - 1]!)) start--;
  let end = at;
  while (end < blocks.length - 1 && idsOf(blocks[end + 1]!)) end++;
  const run = blocks.slice(start, end + 1).map((block) => {
    const ids = idsOf(block)!;
    return { block, was: ids.includes(from), now: ids.includes(to) };
  });
  const position = run.filter(({ was, now }) => was && !now).findIndex(({ block }) => block === part);
  return run.filter(({ was, now }) => now && !was)[position]?.block ?? null;
}
