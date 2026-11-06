import { closeSync, openSync, readFileSync, readSync, realpathSync, statSync, type Dirent } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import { errorLine } from '../cli/terminal-error.ts';
import type { FolderFile, PageFiles } from '../markdown/embed.ts';
import { renderMarkdown, type OutlineRow, type RenderedPage } from '../markdown/render.ts';
import {
  CONFIG_FILE,
  configDimensions,
  DEFAULT_TEXT_WIDTH,
  DEFAULT_WORDS_PER_MINUTE,
  EMPTY_CONFIG,
  parseConfig,
  siteLevels,
  type Config,
  type ConfigProblem,
  type Dimension,
  type SiteLevels,
} from './config.ts';
import { compareEntries, isMarkdownName, isPublicName, labelFromName, stemOf } from './names.ts';
import { pageUrl } from './urls.ts';

/** The app serves its own files at this top address, so a page in a folder of this name could never open. */
export const APP_FOLDER = '__nerddocs';

export type TreeNode =
  | {
      kind: 'page';
      url: string;
      title: string;
      /** The rows of the outline of the page. A page with no rows has no `outline`. */
      outline?: OutlineRow[];
    }
  | { kind: 'section'; id: string; title: string; children: TreeNode[] };

export interface Page extends RenderedPage {
  url: string;
  source: string;
}

export interface Site extends SiteLevels {
  name: string;
  tree: TreeNode[];
  /** Every page in the order of the tree. */
  pages: Page[];
  /** Every public folder, for the watcher. */
  folders: string[];
  /** Every file that a page uses, missing ones too, as `UsedFile.path`, for the watcher. Each path once. */
  used: string[];
  configProblem: ConfigProblem | null;
  wordsPerMinute: number;
  /** The characters of a line of text. A site with none takes `DEFAULT_TEXT_WIDTH`. */
  textWidth?: number;
  /** The listed dimensions that hold a page, in the order of the config. A site with none has []. */
  dimensions: Dimension[];
}

export interface ScanOptions {
  /** A page keeps its render from the scan before, while its text, its used files and the listed levels stay the same. */
  previous?: Site;
  onReadError?: (path: string) => void;
  /** Reports a file skipped because a file before it has the same address. */
  onDuplicate?: (path: string) => void;
  /** Tells that a file or a folder of the site went away during this scan. */
  onGone?: () => void;
  /** Reports each problem with the levels or the dimensions of the site, as a terminal error line. */
  onLevelProblem?: (line: string) => void;
  /** Reports each problem of each page as a terminal error line, on every scan, also for a page that keeps its render. */
  onFileProblem?: (line: string) => void;
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
  const pages: Page[] = [];
  const folders: string[] = [];
  const urls = new Set<string>();
  const paths = new Map<string, string>();
  const configPath = join(folder, CONFIG_FILE);
  const { config, configProblem } = await readConfig(configPath);
  const listed = config.levels.map((level) => level.id);
  const { previous } = options;
  const sameListed = JSON.stringify(previous?.levels.map((level) => level.id)) === JSON.stringify(listed);
  const known = new Map(sameListed ? previous?.pages.map((page) => [page.url, page]) : []);

  /** A file can go away during a scan. That is a change, not an error. */
  function reportUnlessGone(error: unknown, path: string): void {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') options.onReadError?.(path);
    else if (path !== folder) options.onGone?.();
  }

  async function read(path: string, url: string, name: string): Promise<Page | null> {
    try {
      const source = await readFile(path, 'utf8');
      const files = pageFiles(folder, realRoot, relative(folder, path).split(sep).join('/'));
      const old = known.get(url);
      const sameFiles = (page: Page) =>
        page.uses.every((used) => (files.find(used.file)?.version ?? null) === used.version);
      if (old?.source === source && sameFiles(old)) return old;
      return { url, source, ...renderMarkdown(source, url, labelFromName(stemOf(name)), listed, files) };
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
          paths.set(url, path);
          pages.push(page);
          nodes.push({ kind: 'page', url, title: page.title, ...(page.outline.length ? { outline: page.outline } : {}) });
        }
      }
    }
    return nodes;
  }

  /** True for a top entry that can hold pages: public, and not the folder of the app. */
  const isSiteEntry = (name: string) => isPublicName(name) && name !== APP_FOLDER;

  /** Reports a file or a folder of pages outside the dimensions. It reads no file and renders no page. */
  async function walkOutside(entries: Dirent[]): Promise<void> {
    for (const entry of entries) {
      const path = join(folder, entry.name);
      if (entry.isDirectory() ? await holdsMarkdown(path) : await isMarkdownFile(entry, path)) {
        options.onLevelProblem?.(errorLine('Outside dimensions', path));
      }
    }
  }

  async function isMarkdownFile(entry: Dirent, path: string): Promise<boolean> {
    return isMarkdownName(entry.name) && (await isReadableFile(entry, path, realRoot));
  }

  /** Pushes each public folder to `folders`, so the watcher sees it, and tells whether a Markdown file sits in it. */
  async function holdsMarkdown(dir: string): Promise<boolean> {
    folders.push(dir);
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      reportUnlessGone(error, dir);
      return false;
    }
    let found = false;
    for (const entry of entries.sort((a, b) => compareEntries(a.name, b.name))) {
      if (!isPublicName(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) found = (await holdsMarkdown(path)) || found;
      else if (!found) found = await isMarkdownFile(entry, path);
    }
    return found;
  }

  /** The sections of the listed dimensions that hold a page, in config order, and the lines of the rest. */
  async function walkDimensions(listed: Dimension[]): Promise<{ tree: TreeNode[]; dimensions: Dimension[] }> {
    folders.push(folder);
    let entries: Dirent[];
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch (error) {
      reportUnlessGone(error, folder);
      entries = [];
    }
    const tree: TreeNode[] = [];
    const dimensions: Dimension[] = [];
    const walked = new Set<string>();
    for (const dimension of listed) {
      const entry = entries.find((candidate) => candidate.name === dimension.folder);
      let children: TreeNode[] = [];
      if (entry?.isDirectory() && isSiteEntry(entry.name)) {
        walked.add(entry.name);
        children = await walk(join(folder, entry.name));
      }
      if (children.length) {
        tree.push({ kind: 'section', id: dimension.folder, title: labelFromName(dimension.folder), children });
        dimensions.push(dimension);
      } else {
        options.onLevelProblem?.(errorLine('Missing dimension', `${dimension.folder} ${configPath}`));
      }
    }
    if (!dimensions.length) return { tree: [], dimensions };
    const outside = entries
      .filter((entry) => !walked.has(entry.name) && isSiteEntry(entry.name))
      .sort((a, b) => compareEntries(a.name, b.name));
    await walkOutside(outside);
    return { tree, dimensions };
  }

  /** The file is read on each scan, so a save updates open pages. */
  async function readConfig(path: string): Promise<{ config: Config; configProblem: ConfigProblem | null }> {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (missing) options.onLevelProblem?.(errorLine('Missing config', path));
      else options.onReadError?.(path);
      return { config: EMPTY_CONFIG, configProblem: missing ? 'missing' : 'broken' };
    }
    const parsed = parseConfig(text);
    if (parsed) return { config: parsed, configProblem: null };
    options.onLevelProblem?.(errorLine('Bad config', path));
    return { config: EMPTY_CONFIG, configProblem: 'broken' };
  }

  const listedDimensions = configDimensions(config);
  const split = listedDimensions.length ? await walkDimensions(listedDimensions) : null;
  const dimensions = split?.dimensions ?? [];
  // With no dimension that holds a page, the site is the whole folder, as with no dimensions.
  if (!dimensions.length) folders.length = 0;
  const tree = dimensions.length ? split!.tree : await walk(folder);
  const levels = siteLevels(
    config,
    configPath,
    pages.map((page) => ({ unknownLevels: page.unknownLevels, path: paths.get(page.url)! })),
    (line) => options.onLevelProblem?.(line),
  );
  for (const page of pages) {
    for (const problem of page.problems) options.onFileProblem?.(errorLine(problem.name, problem.value));
  }
  const used = [...new Set(pages.flatMap((page) => page.uses.map((file) => file.path)))];
  const wordsPerMinute = config.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE;
  const textWidth = config.textWidth ?? DEFAULT_TEXT_WIDTH;
  return {
    name: siteName(folder),
    tree,
    pages,
    folders,
    used,
    configProblem,
    wordsPerMinute,
    textWidth,
    dimensions,
    ...levels,
  };
}

/** The part of a file that one read gives back at most, so a large file is read in steps. */
const READ_STEP = 65536;

/** The first `length` bytes of a file, or fewer when it is shorter. A file that cannot be read gives none. */
function readHead(path: string, length: number): Uint8Array {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const buffer = new Uint8Array(length);
    let filled = 0;
    while (filled < length) {
      const count = readSync(fd, buffer, filled, Math.min(READ_STEP, length - filled), filled);
      if (!count) break;
      filled += count;
    }
    return buffer.subarray(0, filled);
  } catch {
    return new Uint8Array(0);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function readWhole(path: string): Uint8Array {
  try {
    return readFileSync(path);
  } catch {
    return new Uint8Array(0);
  }
}

/** The files of the docs folder as the build of the page at `page` sees them, with sync reads. */
function pageFiles(folder: string, realRoot: string, page: string): PageFiles {
  const fullPath = (path: string) => join(folder, ...path.split('/'));
  return {
    page,
    fullPath,
    find(path: string): FolderFile | null {
      if (!path.split('/').every(isPublicName)) return null;
      try {
        const real = realpathSync(fullPath(path));
        if (!isPublicPath(realRoot, real)) return null;
        const found = statSync(real);
        if (!found.isFile()) return null;
        return {
          version: Math.trunc(found.mtimeMs),
          bytes: (length?: number) => (length === undefined ? readWhole(real) : readHead(real, length)),
        };
      } catch {
        return null;
      }
    },
  };
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
