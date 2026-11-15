import { join } from 'node:path';
import { pageFile } from '../../src/site/problems.ts';
import { scanSite, type Page, type Site } from '../../src/site/scan.ts';
import { REPO } from './run-command.ts';

/** The folder that holds the docs of nerDDocs and the files that link into them, such as README.md. */
export const ROOT = REPO;

/** The docs of nerDDocs, a nerDDocs site. */
export const DOCS = join(ROOT, 'docs');

let scanned: Promise<Site> | undefined;

/** The scan of the docs of nerDDocs. The tests only read it, so a worker scans the docs once. */
export function docsSite(): Promise<Site> {
  scanned ??= scanSite(DOCS);
  return scanned;
}

/** The pages of the dimension of `folder`, such as 'guide', in the order of the contents panel. */
export const pagesIn = (site: Site, folder: string): Page[] =>
  site.pages.filter((page) => pageFile(page).startsWith(`${folder}/`));

/** The page of the dimension of `folder` with this title, or undefined. */
export const pageTitled = (site: Site, folder: string, title: string): Page | undefined =>
  pagesIn(site, folder).find((page) => page.title === title);
