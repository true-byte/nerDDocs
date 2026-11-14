import { closeSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync, type Dirent } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import type { ProblemName } from '../cli/terminal-error.ts';
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
import { SiteAddresses, type FolderEntry } from './addresses.ts';
import { compareEntries, isMarkdownName, isPublicName, labelFromName, stemOf } from './names.ts';
import { linkProblems, setPageFile, siteProblems, type Problem } from './problems.ts';

/** The app serves its own files at this top address, so a page in a folder of this name could never open. */
export const APP_FOLDER = '__nerddocs';

export interface PageNode {
  kind: 'page';
  url: string;
  title: string;
  /** The rows of the outline of the page. A page with no rows has no `outline`. */
  outline?: OutlineRow[];
}

export type TreeNode =
  | PageNode
  | {
      kind: 'section';
      /** The path of the folder in the docs folder, with `/`. */
      id: string;
      /** The title of the page of the folder, else the label of the folder name. */
      title: string;
      /** The pages and folders in the folder, without the page of the folder. */
      children: TreeNode[];
      /** The address of the page of the folder: its `index.md`, else its `README.md`. A folder with neither has none. */
      url?: string;
      /** The rows of the outline of the page of the folder. A page with no rows has no `outline`. */
      outline?: OutlineRow[];
    };

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
  /** Every problem of the scan, in print order. */
  problems: Problem[];
}

export interface ScanOptions {
  /** A page keeps its render from the scan before, while its text, its used files and the listed levels stay the same. */
  previous?: Site;
  /** Tells that a file or a folder of the site went away during this scan. */
  onGone?: () => void;
}

/** Inside the root, on a path with no dot name and no node_modules. */
export function isPublicPath(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || rel.split(sep).every((part) => part !== '..' && isPublicName(part));
}

/** The public entries of a folder of the docs, read now. A folder that cannot be read has none. */
function listFolder(root: string, folder: string): FolderEntry[] {
  try {
    return readdirSync(join(root, ...folder.split('/')), { withFileTypes: true })
      .filter((entry) => isPublicName(entry.name) && !(folder === '' && entry.name === APP_FOLDER))
      .map((entry) => ({ name: entry.name, folder: entry.isDirectory() }));
  } catch {
    return [];
  }
}

/** The addresses of the pages and folders of the docs folder `root`, as its files are now. */
export function folderAddresses(root: string): SiteAddresses {
  return new SiteAddresses((folder) => listFolder(root, folder));
}

/** What the build of a page read besides its text and its used files, so a later scan keeps the build only while they stay. */
interface BuiltFrom {
  /** The path of the Markdown file in the docs folder, with `/`. */
  file: string;
  /** The address that the build gave each Markdown file that the page links to, by its path in the docs folder. */
  links: Map<string, string>;
}

const builds = new WeakMap<Page, BuiltFrom>();

/** An `index.md` opens its folder, else a `README.md`. */
const opensFolder = (name: string) => ['index', 'readme'].includes(stemOf(name).toLowerCase());

/**
 * The node of a folder. A folder with a page and other rows is one row that opens the page, and a folder with only its
 * page is that page. A folder with no pages has no node.
 */
function folderNode(id: string, name: string, nodes: TreeNode[], own: PageNode | null): TreeNode | null {
  const children = nodes.filter((node) => node !== own);
  if (!own) return children.length ? { kind: 'section', id, title: labelFromName(name), children } : null;
  if (!children.length) return own;
  return { kind: 'section', id, title: own.title, children, url: own.url, ...(own.outline ? { outline: own.outline } : {}) };
}

export function siteName(folder: string): string {
  const name = basename(folder);
  const fromParent = name.toLowerCase() === 'docs' ? basename(dirname(folder)) : '';
  return labelFromName(fromParent || name) || 'Docs';
}

export async function scanSite(folder: string, options: ScanOptions = {}): Promise<Site> {
  /** The problems with no page, in the order that the scan finds them. */
  const found: Omit<Problem, 'key'>[] = [];
  /** A problem of a file or a folder of the docs folder, with no line. */
  function report(name: ProblemName, path: string, value = ''): void {
    const file = relative(folder, path).split(sep).join('/');
    const none = { line: null, column: null, length: 0, text: null, fence: null, levels: [], mark: null, page: null };
    found.push({ name, file, value, ...none });
  }
  const realRoot = await realpath(folder).catch(() => folder);
  const pages: Page[] = [];
  const folders: string[] = [];
  const urls = new Set<string>();
  const configPath = join(folder, CONFIG_FILE);
  const { config, configProblem } = await readConfig(configPath);
  const listed = config.levels.map((level) => level.id);
  const { previous } = options;
  const sameListed = JSON.stringify(previous?.levels.map((level) => level.id)) === JSON.stringify(listed);
  const known = new Map(sameListed ? previous?.pages.map((page) => [page.url, page]) : []);
  const addresses = folderAddresses(folder);

  /** A file can go away during a scan. That is a change, not an error. */
  function reportUnlessGone(error: unknown, path: string): void {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') report('Cannot read', path);
    else if (path !== folder) options.onGone?.();
  }

  async function read(path: string, url: string, name: string): Promise<Page | null> {
    try {
      const source = await readFile(path, 'utf8');
      const file = relative(folder, path).split(sep).join('/');
      const links = new Map<string, string>();
      const files = pageFiles(folder, realRoot, file, (target) => {
        const address = addresses.pageUrl(target);
        links.set(target, address);
        return address;
      });
      const old = known.get(url);
      const sameFiles = (page: Page) =>
        page.uses.every((used) => (files.find(used.file)?.version ?? null) === used.version);
      // A link to a page changes with the address of that page, and a link to a file with the place of the page.
      const sameBuild = (built: BuiltFrom | undefined) =>
        built?.file === file && [...built.links].every(([target, address]) => addresses.pageUrl(target) === address);
      if (old?.source === source && sameFiles(old) && sameBuild(builds.get(old))) return old;
      const page = { url, source, ...renderMarkdown(source, url, labelFromName(stemOf(name)), listed, files) };
      builds.set(page, { file, links });
      setPageFile(page, file);
      return page;
    } catch (error) {
      reportUnlessGone(error, path);
      return null;
    }
  }

  /** The nodes of the folder `dir` in order, and the page that opens it, or null. */
  async function walk(dir: string): Promise<{ nodes: TreeNode[]; own: PageNode | null }> {
    folders.push(dir);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      reportUnlessGone(error, dir);
      return { nodes: [], own: null };
    }
    const nodes: TreeNode[] = [];
    let own: PageNode | null = null;
    for (const entry of entries.sort((a, b) => compareEntries(a.name, b.name))) {
      if (!isPublicName(entry.name) || (dir === folder && entry.name === APP_FOLDER)) continue;
      const path = join(dir, entry.name);
      const file = relative(folder, path).split(sep).join('/');
      if (entry.isDirectory()) {
        const inner = await walk(path);
        const node = folderNode(file, entry.name, inner.nodes, inner.own);
        if (node) nodes.push(node);
      } else if (isMarkdownName(entry.name) && (await isReadableFile(entry, path, realRoot))) {
        const url = addresses.pageUrl(file);
        if (urls.has(url)) {
          report('Duplicate page', path);
          continue;
        }
        const page = await read(path, url, entry.name);
        if (page) {
          urls.add(url);
          pages.push(page);
          const node: PageNode = { kind: 'page', url, title: page.title, ...(page.outline.length ? { outline: page.outline } : {}) };
          // An index or a README comes first in its folder, so the first one that reads opens the folder.
          if (!own && !nodes.length && opensFolder(entry.name)) own = node;
          nodes.push(node);
        }
      }
    }
    return { nodes, own };
  }

  /** True for a top entry that can hold pages: public, and not the folder of the app. */
  const isSiteEntry = (name: string) => isPublicName(name) && name !== APP_FOLDER;

  /** Reports a file or a folder of pages outside the dimensions. It reads no file and renders no page. */
  async function walkOutside(entries: Dirent[]): Promise<void> {
    for (const entry of entries) {
      const path = join(folder, entry.name);
      if (entry.isDirectory() ? await holdsMarkdown(path) : await isMarkdownFile(entry, path)) {
        report('Outside dimensions', path);
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
        children = (await walk(join(folder, entry.name))).nodes;
      }
      if (children.length) {
        tree.push({ kind: 'section', id: dimension.folder, title: labelFromName(dimension.folder), children });
        dimensions.push(dimension);
      } else {
        report('Missing dimension', configPath, dimension.folder);
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
      report(missing ? 'Missing config' : 'Cannot read', path);
      return { config: EMPTY_CONFIG, configProblem: missing ? 'missing' : 'broken' };
    }
    const parsed = parseConfig(text);
    if (parsed) return { config: parsed, configProblem: null };
    report('Bad config', path);
    return { config: EMPTY_CONFIG, configProblem: 'broken' };
  }

  const listedDimensions = configDimensions(config);
  const split = listedDimensions.length ? await walkDimensions(listedDimensions) : null;
  const dimensions = split?.dimensions ?? [];
  // With no dimension that holds a page, the site is the whole folder, as with no dimensions.
  if (!dimensions.length) folders.length = 0;
  const tree = dimensions.length ? split!.tree : (await walk(folder)).nodes;
  // The unknown levels of a page are problems of its render.
  const levels = siteLevels(config, configPath, [], (_line, problem) => report(problem.name, problem.path, problem.value));
  const levelIds = levels.levels.map((level) => level.id);
  const ofPages = pages.flatMap((page) => page.problems.map((problem) => ({ ...problem, page: page.url })));
  const problems = siteProblems([...found, ...ofPages, ...linkProblems(pages, levelIds)], pages.map((page) => page.url));
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
    problems,
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
function pageFiles(folder: string, realRoot: string, page: string, address: (path: string) => string): PageFiles {
  const fullPath = (path: string) => join(folder, ...path.split('/'));
  return {
    page,
    fullPath,
    address,
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
