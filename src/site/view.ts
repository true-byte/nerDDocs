import { createHash } from 'node:crypto';
import type { Page, Site, TreeNode } from './scan.ts';

/** What one open page shows. The page holds it as HTML, and a live update sends it again. */
export interface PageView {
  url: string;
  /** Two views with the same rev show the same thing. */
  rev: string;
  siteName: string;
  tree: TreeNode[];
  docTitle: string;
  title: string;
  titleId: string;
  html: string;
}

export function hasPage(site: Site, url: string): boolean {
  return site.pages.some((page) => page.url === url);
}

function makeView(site: Site, url: string, title: string, titleId: string, html: string): PageView {
  const docTitle = title === site.name ? title : `${title} - ${site.name}`;
  const content = { url, siteName: site.name, tree: site.tree, docTitle, title, titleId, html };
  const rev = createHash('sha1').update(JSON.stringify(content)).digest('hex');
  return { ...content, rev };
}

/** The site root shows the first page. An unknown address shows 404 and keeps the address. */
export function viewOf(site: Site, url: string): PageView {
  const page = url === '/' ? site.pages[0] : site.pages.find((candidate) => candidate.url === url);
  if (page) return makeView(site, page.url, page.title, page.titleId, page.html);
  if (url === '/') return makeView(site, url, site.name, '', '');
  return makeView(site, url, '404', '', '');
}

function findRenamed(before: Site, after: Site, gone: Page): Page | undefined {
  const added = after.pages.filter((page) => !hasPage(before, page.url));
  return (
    added.find((page) => page.source === gone.source) ??
    added.find((page) => page.title === gone.title)
  );
}

/** Where a reader on `url` goes when the site changes. */
export function nextUrl(before: Site, after: Site, url: string): string {
  const index = before.pages.findIndex((page) => page.url === url);
  if (index < 0 || hasPage(after, url)) return url;

  const renamed = findRenamed(before, after, before.pages[index]!);
  if (renamed) return renamed.url;

  const nearby = [...before.pages.slice(index + 1), ...before.pages.slice(0, index).reverse()];
  return nearby.find((page) => hasPage(after, page.url))?.url ?? '/';
}
