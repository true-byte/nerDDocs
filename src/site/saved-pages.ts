import type { Site } from './scan.ts';

/** The addresses of the pages whose title or text differ between two scans, and of the new pages, in tree order. */
export function savedPages(before: Site, after: Site): string[] {
  const old = new Map(before.pages.map((page) => [page.url, page]));
  return after.pages
    .filter((page) => {
      const was = old.get(page.url);
      return !was || (was !== page && (was.title !== page.title || was.html !== page.html));
    })
    .map((page) => page.url);
}
