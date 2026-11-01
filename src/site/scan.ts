import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import { renderMarkdown, type RenderedPage } from '../markdown/render.ts';
import { compareEntries, isMarkdownName, isPublicName, labelFromName, stemOf } from './names.ts';
import { pageUrl } from './urls.ts';

/** The app serves its own files at this top address, so a page in a folder of this name could never open. */
export const APP_FOLDER = '__nerddocs';

export type TreeNode =
  | { kind: 'page'; url: string; title: string }
  | { kind: 'section'; id: string; title: string; children: TreeNode[] };

export interface Page extends RenderedPage {
  url: string;
  source: string;
}

export interface Site {
  name: string;
  tree: TreeNode[];
  /** Every page in the order of the tree. */
  pages: Page[];
  /** Every public folder, for the watcher. */
  folders: string[];
}

export interface ScanOptions {
  /** A page whose text did not change keeps its render from the scan before. */
  previous?: Site;
  onReadError?: (path: string) => void;
  /** Reports a file skipped because a file before it has the same address. */
  onDuplicate?: (path: string) => void;
  /** Tells that a file or a folder of the site went away during this scan. */
  onGone?: () => void;
}

/** Inside the root, on a path with no dot name and no node_modules. */
export function isPublicPath(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || rel.split(sep).every((part) => part !== '..' && isPublicName(part));
}

export function siteName(folder: string): string {
  const name = basename(folder);
  const fromParent = name.toLowerCase() === 'docs' ? basename(dirname(folder)) : '';
  return labelFromName(fromParent || name) || 'Docs';
}

export async function scanSite(folder: string, options: ScanOptions = {}): Promise<Site> {
  const realRoot = await realpath(folder).catch(() => folder);
  const known = new Map(options.previous?.pages.map((page) => [page.url, page]));
  const pages: Page[] = [];
  const folders: string[] = [];
  const urls = new Set<string>();

  /** A file can go away during a scan. That is a change, not an error. */
  function reportUnlessGone(error: unknown, path: string): void {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') options.onReadError?.(path);
    else if (path !== folder) options.onGone?.();
  }

  async function read(path: string, url: string, name: string): Promise<Page | null> {
    try {
      const source = await readFile(path, 'utf8');
      const old = known.get(url);
      if (old?.source === source) return old;
      return { url, source, ...renderMarkdown(source, url, labelFromName(stemOf(name))) };
    } catch (error) {
      reportUnlessGone(error, path);
      return null;
    }
  }

  async function walk(dir: string): Promise<TreeNode[]> {
    folders.push(dir);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      reportUnlessGone(error, dir);
      return [];
    }
    const nodes: TreeNode[] = [];
    for (const entry of entries.sort((a, b) => compareEntries(a.name, b.name))) {
      if (!isPublicName(entry.name) || (dir === folder && entry.name === APP_FOLDER)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const children = await walk(path);
        if (children.length) {
          const id = relative(folder, path).split(sep).join('/');
          nodes.push({ kind: 'section', id, title: labelFromName(entry.name), children });
        }
      } else if (isMarkdownName(entry.name) && (await isReadableFile(entry, path, realRoot))) {
        const url = pageUrl(relative(folder, path).split(sep).join('/'));
        if (urls.has(url)) {
          options.onDuplicate?.(path);
          continue;
        }
        const page = await read(path, url, entry.name);
        if (page) {
          urls.add(url);
          pages.push(page);
          nodes.push({ kind: 'page', url, title: page.title });
        }
      }
    }
    return nodes;
  }

  const tree = await walk(folder);
  return { name: siteName(folder), tree, pages, folders };
}

/** A symbolic link counts only when it lands on a public file inside the folder. */
async function isReadableFile(
  entry: { isFile(): boolean; isSymbolicLink(): boolean },
  path: string,
  realRoot: string,
): Promise<boolean> {
  if (entry.isFile()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    const target = await realpath(path);
    return isPublicPath(realRoot, target) && (await stat(target)).isFile();
  } catch {
    return false;
  }
}
