import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { COMMAND } from './run-command.ts';

/** Runs `nerddocs export` with the arguments in the folder, and gives its status and its output once it stops. */
export function runExport(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [COMMAND, 'export', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
}

/** The path of each file under the folder, with `/`, sorted. */
export function filesUnder(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

/** The `file://` address of a file of a folder on disk. */
export const fileAddress = (folder: string, path: string) => pathToFileURL(join(folder, path)).href;

/** A target with a scheme, such as `https:`, `mailto:` or `data:`. It names no file of the export. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

type Node = DefaultTreeAdapterMap['node'];

/** Each `href`, `src` and `srcset` address of the HTML, the content of `noscript` and of `template` too. */
function addressesOfHtml(html: string): string[] {
  const found: string[] = [];
  const visit = (node: Node) => {
    if ('attrs' in node) {
      for (const { name, value } of node.attrs) {
        if (name === 'href' || name === 'src') found.push(value);
        if (name === 'srcset') found.push(...value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]!));
      }
    }
    if ('content' in node) visit(node.content);
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
  };
  visit(parse(html, { scriptingEnabled: false }));
  return found;
}

/** The pages of the search file: `self.nerddocsSearch` as `searchScript` writes it. */
function searchPages(script: string): { url: string }[] {
  const json = script.replace(/^self\.nerddocsSearch=/, '').replace(/;\s*$/, '');
  return (JSON.parse(json) as { pages: { url: string }[] }).pages;
}

export interface Walk {
  /** The count of the addresses that the walk checked. */
  checked: number;
  /** Each address that leads to no file of the export, as `<file of the export> <address>`. */
  broken: string[];
}

/**
 * Walks every `href` and `src` of every HTML file of the export outside `__nerddocs/`, the address of every hit of the
 * search file, and every `url()` of the page style. Each one that has no scheme must lead to a file of the export.
 */
export function walkExport(out: string): Walk {
  const walk: Walk = { checked: 0, broken: [] };
  const check = (from: string, address: string) => {
    if (!address || address.startsWith('#') || HAS_SCHEME.test(address)) return;
    walk.checked++;
    const url = new URL(address, fileAddress(out, from));
    url.search = '';
    url.hash = '';
    const path = url.protocol === 'file:' && !address.startsWith('//') ? fileURLToPath(url) : null;
    const inside = path !== null && !relative(out, path).startsWith('..') && !isAbsolute(relative(out, path));
    if (!inside || !statSync(path, { throwIfNoEntry: false })?.isFile()) walk.broken.push(`${from} ${address}`);
  };
  const files = filesUnder(out);
  for (const file of files.filter((name) => name.endsWith('.html') && !name.startsWith('__nerddocs/'))) {
    for (const address of addressesOfHtml(readFileSync(join(out, file), 'utf8'))) check(file, address);
  }
  if (files.includes('__nerddocs/search.js')) {
    for (const { url } of searchPages(readFileSync(join(out, '__nerddocs/search.js'), 'utf8'))) {
      check('index.html', url.slice(1).split('/').map(encodeURIComponent).join('/'));
    }
  }
  if (files.includes('__nerddocs/app.css')) {
    const css = readFileSync(join(out, '__nerddocs/app.css'), 'utf8');
    for (const [, , address] of css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) check('__nerddocs/app.css', address!);
  }
  return walk;
}
