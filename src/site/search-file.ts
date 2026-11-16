import { currentDimension } from '../page/dimensions.ts';
import { safeJson } from '../page/first-paint.ts';
import type { SearchPage } from '../page/search.ts';
import type { Site } from './scan.ts';

/** The search file of each site, made once, since a scan that changes nothing keeps its site. */
const made = new WeakMap<Site, string>();

/** A classic script that sets `self.nerddocsSearch` to the text of every page of the site, in the order of its pages. */
export function searchScript(site: Site): string {
  const known = made.get(site);
  if (known !== undefined) return known;
  const pages: SearchPage[] = site.pages.map((page) => ({
    url: page.url,
    title: page.title,
    dimension: currentDimension(site.dimensions, page.url)?.folder ?? null,
    parts: page.parts,
    hasSharedText: page.hasSharedText,
    units: page.search ?? [],
  }));
  const script = `self.nerddocsSearch=${safeJson({ pages })};`;
  made.set(site, script);
  return script;
}
