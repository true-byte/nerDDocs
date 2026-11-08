import type { Level } from '../site/config.ts';
import type { TreeNode } from '../site/scan.ts';
import type { PageLevels } from '../site/view.ts';
import { hollowStops, landingStop, openingLevel } from './levels.ts';
import { local, read, session, write } from './panel-state.ts';

export const DEFAULT_KEY = 'nerddocs-default-level';
export const KEPT_KEY = 'nerddocs-page-levels';

type LevelPage = Pick<PageLevels, 'levels' | 'parts' | 'hasSharedText' | 'defaultLevel'>;

export interface KeptLevel {
  level: string;
  /** The level ids with text on the page when the level was kept. */
  live: string[];
}

export interface ChangedPage {
  url: string;
  title: string;
  from: string;
  to: string;
}

const isKept = (entry: unknown): entry is KeptLevel =>
  typeof entry === 'object' &&
  entry !== null &&
  typeof (entry as KeptLevel).level === 'string' &&
  Array.isArray((entry as KeptLevel).live);

/** What a storage that throws or does not save would hold. It lasts until the page closes. */
let heldDefault: string | null = null;
let heldKept: string | null = null;

function saved(storage: () => Storage, key: string, value: string): boolean {
  write(storage, key, value);
  return read(storage, key) === value;
}

export function readDefaultLevel(): string | null {
  return heldDefault ?? read(local, DEFAULT_KEY);
}

export function writeDefaultLevel(id: string): void {
  heldDefault = saved(local, DEFAULT_KEY, id) ? null : id;
}

export function readKeptLevels(): Record<string, KeptLevel> {
  try {
    const stored: unknown = JSON.parse(heldKept ?? read(session, KEPT_KEY) ?? '{}');
    if (typeof stored !== 'object' || stored === null) return {};
    return Object.fromEntries(Object.entries(stored).filter(([, entry]) => isKept(entry)));
  } catch {
    return {};
  }
}

export function writeKeptLevels(kept: Record<string, KeptLevel>): void {
  const text = JSON.stringify(kept);
  heldKept = saved(session, KEPT_KEY, text) ? null : text;
}

/** The level ids with text on the page. */
export function liveLevels(page: Pick<PageLevels, 'levels' | 'parts' | 'hasSharedText'>): string[] {
  const hollow = hollowStops(page);
  return page.levels.filter((_, stop) => !hollow[stop]).map((level) => level.id);
}

/** The level a page opens at for a wanted level, which need not be listed. */
export function landingLevel(page: LevelPage, wanted?: string): string {
  return openingLevel(page, wanted);
}

/** The tab's kept level for the page if listed, or else the reader's default if listed. */
export function wantedLevel(page: Pick<PageLevels, 'levels'>, url: string): string | undefined {
  const listed = (id: string | null | undefined) => page.levels.some((level) => level.id === id);
  const kept = readKeptLevels()[url]?.level;
  if (listed(kept)) return kept;
  const chosen = readDefaultLevel();
  return listed(chosen) ? chosen! : undefined;
}

/** The level the page opens at, from storage. */
export function openingLevelFor(page: LevelPage, url: string): string {
  return landingLevel(page, wantedLevel(page, url));
}

/** Keeps the level for the page, unless the reader's default alone gives the page that level. */
export function keepLevel(page: LevelPage, url: string, level: string): void {
  const kept = readKeptLevels();
  if (level === landingLevel(page, readDefaultLevel() ?? undefined)) delete kept[url];
  else kept[url] = { level, live: liveLevels(page) };
  writeKeptLevels(kept);
}

/** The page of a folder comes before the rows under it. */
function pagesOf(nodes: TreeNode[]): { url: string; title: string }[] {
  return nodes.flatMap((node) =>
    node.kind === 'page' ? [node] : [...(node.url ? [{ url: node.url, title: node.title }] : []), ...pagesOf(node.children)],
  );
}

/** Each kept page in tree order that would open at another level with the new default. */
export function changedPages(
  kept: Record<string, KeptLevel>,
  levels: Pick<Level, 'id'>[],
  tree: TreeNode[],
  newDefault: string,
): ChangedPage[] {
  const ids = levels.map((level) => level.id);
  const wanted = Math.max(0, ids.indexOf(newDefault));
  return pagesOf(tree).flatMap(({ url, title }) => {
    const entry = kept[url];
    if (!entry || !ids.includes(entry.level)) return [];
    const to = ids[landingStop(wanted, ids.map((id) => !entry.live.includes(id)))]!;
    return to === entry.level ? [] : [{ url, title, from: entry.level, to }];
  });
}
