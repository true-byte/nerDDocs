import { dimensionNodes, pagesOf } from '../page/dimensions.ts';
import { readRows } from './read-time.ts';
import type { Site } from './scan.ts';

export interface Neighbor {
  url: string;
  /** The title that the 'Contents' tree shows for the page. */
  title: string;
  /** The minutes of the page at each level id, as `ReadRow.page` counts them. The key is '' on a site with fewer than two levels. */
  minutes: Record<string, number>;
}

/** The pages in the order of the tree, inside the dimension that holds `url` on a site with dimensions. */
function pagesAround(site: Site, url: string): { url: string; title: string }[] {
  if (!site.dimensions.length) return pagesOf(site.tree);
  for (const dimension of site.dimensions) {
    const pages = pagesOf(dimensionNodes(site.tree, dimension.folder));
    if (pages.some((page) => page.url === url)) return pages;
  }
  return [];
}

/** The page before and the page after the page at `url`, in the order of the tree, inside the dimension of the page. */
export function neighbors(site: Site, url: string): { previous: Neighbor | null; next: Neighbor | null } {
  const pages = pagesAround(site, url);
  const at = pages.findIndex((page) => page.url === url);
  if (at < 0) return { previous: null, next: null };
  const levels = site.levels.length >= 2 ? site.levels : [];
  const neighbor = (row: { url: string; title: string } | undefined): Neighbor | null => {
    if (!row) return null;
    const page = site.pages.find((candidate) => candidate.url === row.url);
    const minutes = Object.fromEntries(readRows(site, levels, page).map((read) => [read.level, read.page]));
    return { url: row.url, title: row.title, minutes };
  };
  return { previous: neighbor(pages[at - 1]), next: neighbor(pages[at + 1]) };
}
