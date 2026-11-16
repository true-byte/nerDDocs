import { copyFile, mkdir, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findPublicFile } from '../server/public-file.ts';
import { exportFiles, type AppFiles, type ExportFile } from '../site/export-files.ts';
import { isMarkdownName, isPublicName } from '../site/names.ts';
import { APP_FOLDER, isPublicPath, scanSite } from '../site/scan.ts';
import { problemBlock, shownPath } from './problem-block.ts';
import { TerminalError } from './terminal-error.ts';

export interface ExportOptions {
  /** The folder that each printed path is relative to. */
  cwd: string;
  app: AppFiles;
  /** True when the blocks of the problems print with color. */
  color: boolean;
  /** Prints a line to standard output. */
  print: (line: string) => void;
  /** Prints a line to standard error. */
  log: (line: string) => void;
}

/** True when `inner` is `outer` or lies inside it. */
function isInside(outer: string, inner: string): boolean {
  const rel = relative(outer, inner);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** The one entry at the root of an out folder that clearing it keeps, a file or a folder. */
const KEPT_ENTRY = '.git';

const realOrSelf = (path: string) => realpath(path).catch(() => path);

/**
 * Stops the export before it writes or deletes anything when the out folder is a file, is or holds the docs folder,
 * or holds files that no export wrote. Gives true when the out folder exists.
 */
async function checkOut(folder: string, out: string, shown: (path: string) => string): Promise<boolean> {
  let found;
  try {
    found = await stat(out);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new TerminalError('Cannot write', shown(out));
  }
  if (!found.isDirectory()) throw new TerminalError('Not a folder', shown(out));
  const [realFolder, realOut] = await Promise.all([realOrSelf(folder), realOrSelf(out)]);
  if (isInside(out, folder) || isInside(realOut, realFolder)) throw new TerminalError('Holds the docs', shown(out));
  const entries = await readdir(out).catch(() => {
    throw new TerminalError('Cannot write', shown(out));
  });
  const isExport = await stat(join(out, APP_FOLDER)).then((app) => app.isDirectory(), () => false);
  // A folder with only `.git` counts as empty, so a new Git checkout takes its first export.
  if (entries.some((entry) => entry !== KEPT_ENTRY) && !isExport) throw new TerminalError('Not an export', shown(out));
  return true;
}

/**
 * The path in the docs folder, with `/`, of each non-Markdown file that the server would serve, in the order of the
 * folders. It leaves out the out folder and the app folder at the root. A link to a folder inside the docs folder is
 * followed once.
 */
async function publicFiles(folder: string, out: string): Promise<string[]> {
  const root = await realOrSelf(folder);
  const realOut = await realOrSelf(out);
  const seen = new Set<string>();
  const found: string[] = [];

  async function walk(dir: string, path: string): Promise<void> {
    const real = await realOrSelf(dir);
    if (seen.has(real) || real === realOut || dir === out) return;
    seen.add(real);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (!isPublicName(entry.name) || (path === '' && entry.name === APP_FOLDER)) continue;
      const full = join(dir, entry.name);
      const file = path ? `${path}/${entry.name}` : entry.name;
      const target = entry.isSymbolicLink() ? await stat(full).catch(() => null) : entry;
      if (target?.isDirectory()) {
        if (entry.isDirectory() || isPublicPath(root, await realOrSelf(full))) await walk(full, file);
      } else if (target?.isFile() && !isMarkdownName(entry.name) && (await findPublicFile(folder, `/${file}`))) {
        found.push(file);
      }
    }
  }

  await walk(folder, '');
  return found;
}

/** Writes one file of the export. A failure stops the export with the path that it could not write. */
async function writeOne(file: ExportFile, folder: string, out: string, shown: (path: string) => string): Promise<void> {
  const path = join(out, ...file.path.split('/'));
  try {
    await mkdir(dirname(path), { recursive: true });
  } catch {
    throw new TerminalError('Cannot write', shown(dirname(path)));
  }
  try {
    const { content } = file;
    if (typeof content === 'string' || content instanceof Uint8Array) await writeFile(path, content);
    else await copyFile(join(folder, ...content.copy.split('/')), path);
  } catch {
    throw new TerminalError('Cannot write', shown(path));
  }
}

/**
 * Writes the site of `folder` as files into `out`, which a browser opens from disk and any static host serves. It
 * prints each problem of the docs, which never stops the export, and gives the exit code 0.
 */
export async function runExport(folder: string, out: string, options: ExportOptions): Promise<number> {
  const { cwd, log, print } = options;
  const shown = (path: string) => shownPath(path, cwd);
  const exists = await checkOut(folder, out, shown);
  if (!exists) {
    await mkdir(out, { recursive: true }).catch(() => {
      throw new TerminalError('Cannot write', shown(out));
    });
  }

  const site = await scanSite(folder);
  const levelNames = Object.fromEntries(site.levels.map((level) => [level.id, level.name]));
  const printOptions = { folder, cwd, color: options.color, levelNames };
  for (const problem of site.problems) log(`${problemBlock(problem, printOptions)}\n`);

  const files = exportFiles(site, options.app, await publicFiles(folder, out));

  // Each entry of an older export goes, so no file of it stays. A `.git` at the root stays, so the folder can be a Git checkout.
  for (const name of exists ? (await readdir(out)).filter((entry) => entry !== KEPT_ENTRY) : []) {
    const path = join(out, name);
    await rm(path, { recursive: true, force: true }).catch(() => {
      throw new TerminalError('Cannot write', shown(path));
    });
  }
  for (const file of files) await writeOne(file, folder, out, shown);

  print(`Folder: ${shown(folder)}`);
  print(`Pages: ${site.pages.length}`);
  print(`Export: ${shown(out)}`);
  print(`Address: ${pathToFileURL(join(out, 'index.html')).href}`);
  return 0;
}
