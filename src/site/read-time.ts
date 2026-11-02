import type { TextSize } from '../markdown/read-size.ts';
import { hollowStops } from '../page/levels.ts';
import type { Level } from './config.ts';
import type { Page, Site } from './scan.ts';

export const IMAGE_SECONDS = 12;

/** Minutes. `level` is '' on a site with fewer than two levels. */
export interface ReadRow {
  level: string;
  page: number;
  all: number;
}

export function secondsOf(size: TextSize, wordsPerMinute: number): number {
  return (size.words * 60) / wordsPerMinute + size.images * IMAGE_SECONDS;
}

const NOTHING: TextSize = { words: 0, images: 0 };

/** `levels` is the list of the view: empty below two levels. With no page, `page` is 0 in each row. */
export function readRows(
  site: Pick<Site, 'pages' | 'wordsPerMinute'>,
  levels: Level[],
  page: Page | undefined,
): ReadRow[] {
  const ids = levels.length ? levels.map((level) => level.id) : [''];
  const sizesAt = (each: Page): TextSize[] => {
    const hollow = hollowStops({ levels, parts: each.parts, hasSharedText: each.hasSharedText });
    return ids.map((id, at) => (!hollow[at] && each.sizes[id]) || NOTHING);
  };
  const minutes = (size: TextSize) => Math.ceil(secondsOf(size, site.wordsPerMinute) / 60);
  const allPages = site.pages.map(sizesAt);
  const thisPage = page && sizesAt(page);
  // The sum takes counts, since a sum of seconds can land just over a whole minute.
  return ids.map((level, at) => ({
    level,
    page: minutes(thisPage?.[at] ?? NOTHING),
    all: minutes(
      allPages.reduce(
        (sum, sizes) => ({ words: sum.words + sizes[at]!.words, images: sum.images + sizes[at]!.images }),
        NOTHING,
      ),
    ),
  }));
}
