import type { Level } from '../site/config.ts';
import type { PageLevels } from '../site/view.ts';

export const colorOf = (index: number) => `var(--l${index % 5})`;

/**
 * The CSS of the current level. One rule hides each part, and each element with `data-shows`, without the level. The
 * other rules hide the outline of the open page at a level where none of its rows shows, as page.css lays it out.
 */
export function levelRule(level: string): string {
  if (!level) return '';
  const hidden = `[data-shows]:not([data-shows~="${level}"])`;
  return (
    `.part[data-l]:not([data-l~="${level}"]),${hidden}{display:none}` +
    // The outline of a page with no row at the level hides with its buttons, and the text sits as with no outline.
    `:is(#toc,#rail-r,#tocB)${hidden}{display:none}#app:has(#toc${hidden}){--ow:initial;--mr:initial}`
  );
}

export const isFlat = (page: Pick<PageLevels, 'parts'>) => page.parts.length === 0;

/** A stop is hollow when the level has no part and the page has no shared text. */
export function hollowStops(page: Pick<PageLevels, 'levels' | 'parts' | 'hasSharedText'>): boolean[] {
  if (isFlat(page) || page.hasSharedText) return page.levels.map(() => false);
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

/** The stop itself, or the nearest lower stop with text, or else the nearest higher stop with text. */
export function landingStop(stop: number, hollow: boolean[]): number {
  for (let at = stop; at >= 0; at--) if (!hollow[at]) return at;
  for (let at = stop + 1; at < hollow.length; at++) if (!hollow[at]) return at;
  return stop;
}

/** The level a page opens at for a wanted level. An unlisted or missing level wants the default level, or else the first level. */
export function openingLevel(
  page: Pick<PageLevels, 'levels' | 'parts' | 'hasSharedText' | 'defaultLevel'>,
  wanted?: string,
): string {
  const stopOf = (id?: string) => page.levels.findIndex((level) => level.id === id);
  const at = stopOf(wanted) >= 0 ? stopOf(wanted) : stopOf(page.defaultLevel);
  return page.levels[landingStop(Math.max(0, at), hollowStops(page))]?.id ?? '';
}

/** A live update keeps the level, unless the page moved or has no text at that level. */
export function levelAfterUpdate(current: string, page: PageLevels, moved: boolean, wanted?: string): string {
  const at = page.levels.findIndex((level) => level.id === current);
  return moved || at < 0 || hollowStops(page)[at] ? openingLevel(page, wanted) : current;
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

interface Run<T> {
  leaving: T[];
  entering: T[];
}

/** Shared text and a part shown at both levels end a run. */
function runsOf<T>(blocks: T[], idsOf: (block: T) => string[] | null, from: string, to: string): Run<T>[] {
  const runs: Run<T>[] = [{ leaving: [], entering: [] }];
  for (const block of blocks) {
    const ids = idsOf(block);
    const was = !!ids?.includes(from);
    const now = !!ids?.includes(to);
    if (!ids || (was && now)) runs.push({ leaving: [], entering: [] });
    else if (was) runs.at(-1)!.leaving.push(block);
    else if (now) runs.at(-1)!.entering.push(block);
  }
  return runs;
}

/** The part at a place in a run, or the last one when the run is shorter. */
const atPlace = <T>(parts: T[], place: number): T | undefined => parts[Math.min(place, parts.length - 1)];

/**
 * In each run, the part being read, leaving or entering, pairs with the part at its place on the
 * other side. The other parts pair up by order.
 */
export function pairRuns<T>(
  blocks: T[],
  idsOf: (block: T) => string[] | null,
  from: string,
  to: string,
  reading?: T,
): LevelSwap<T> {
  const swap: LevelSwap<T> = { leave: [], enter: [], pairs: [] };
  for (const { leaving, entering } of runsOf(blocks, idsOf, from, to)) {
    const isLeaving = reading !== undefined && leaving.includes(reading);
    const isEntering = reading !== undefined && entering.includes(reading);
    const readOld = isLeaving ? reading : isEntering ? atPlace(leaving, entering.indexOf(reading)) : undefined;
    const readNew = isEntering ? reading : isLeaving ? atPlace(entering, leaving.indexOf(reading)) : undefined;
    const others = leaving.filter((part) => readNew === undefined || part !== readOld);
    for (const el of entering) {
      const old = el === readNew && readOld !== undefined ? readOld : others.shift();
      if (old === undefined) swap.enter.push(el);
      else swap.pairs.push({ el, old });
    }
    swap.leave.push(...others);
  }
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
  const run = runsOf(blocks, idsOf, from, to).find(({ leaving }) => leaving.includes(part));
  return run ? (atPlace(run.entering, run.leaving.indexOf(part)) ?? null) : null;
}
