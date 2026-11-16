import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TerminalError } from './terminal-error.ts';

export const DEFAULT_PORT = 4000;
/** The out folder of `export` with no `--out`, in the current folder. */
export const DEFAULT_OUT = 'nerddocs-export';

export interface Args {
  /** `check` scans the folder once and prints its problems. `export` writes the site as files. `serve` shows the docs. */
  command: 'serve' | 'check' | 'export';
  folder: string | null;
  port: number;
  open: boolean;
  /** The path that `--out` names, or null. Only `export` takes `--out`. */
  out: string | null;
}

function parsePort(text: string | undefined): number {
  const port = Number(text);
  if (!text || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TerminalError('Bad port', text || '(none)');
  }
  return port;
}

/** A flag that only the server takes. */
const isServerFlag = (arg: string) => arg === '--no-open' || arg === '--port' || arg.startsWith('--port=');

/** A flag that only `export` takes. */
const isExportFlag = (arg: string) => arg === '--out' || arg.startsWith('--out=');

/** The first arguments that name a command. Any later one is the folder. */
const COMMANDS: Record<string, Args['command']> = { check: 'check', export: 'export' };

/**
 * A first argument of `check` or `export` makes that command, which takes no flag of the server. Only `export` takes
 * `--out`. Any later `check` or `export` is the folder.
 */
export function parseArgs(argv: string[]): Args {
  const command = Object.hasOwn(COMMANDS, argv[0] ?? '') ? COMMANDS[argv[0]!]! : 'serve';
  const args: Args = { command, folder: null, port: DEFAULT_PORT, open: true, out: null };
  for (let i = command === 'serve' ? 0 : 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (command !== 'serve' && isServerFlag(arg)) throw new TerminalError('Unknown flag', arg);
    if (command !== 'export' && isExportFlag(arg)) throw new TerminalError('Unknown flag', arg);
    if (arg === '--no-open') args.open = false;
    else if (arg === '--port') args.port = parsePort(argv[++i]);
    else if (arg.startsWith('--port=')) args.port = parsePort(arg.slice('--port='.length));
    else if (arg === '--out') args.out = outValue(argv[++i]);
    else if (arg.startsWith('--out=')) args.out = outValue(arg.slice('--out='.length));
    else if (arg.startsWith('-')) throw new TerminalError('Unknown flag', arg);
    else if (args.folder !== null) throw new TerminalError('Too many folders', arg);
    else args.folder = arg;
  }
  return args;
}

/** The path after `--out`. A missing or empty path, or another flag in its place, makes `--out` an unknown flag. */
function outValue(text: string | undefined): string {
  if (!text || text.startsWith('-')) throw new TerminalError('Unknown flag', '--out');
  return text;
}

function isFolder(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/** The named folder, else ./docs when it exists, else the current folder. */
export function chooseFolder(folder: string | null, cwd: string): string {
  if (folder === null) {
    const docs = join(cwd, 'docs');
    return isFolder(docs) ? docs : cwd;
  }
  const path = resolve(cwd, folder);
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) throw new TerminalError('Missing folder', folder);
  if (!stat.isDirectory()) throw new TerminalError('Not a folder', folder);
  return path;
}

/** The out folder of `export`: the path that `--out` names, from the current folder, else `nerddocs-export` in it. */
export function chooseOut(out: string | null, cwd: string): string {
  return resolve(cwd, out ?? DEFAULT_OUT);
}
