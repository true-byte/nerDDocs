import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TerminalError } from './terminal-error.ts';

export const DEFAULT_PORT = 4000;

export interface Args {
  folder: string | null;
  port: number;
  open: boolean;
}

function parsePort(text: string | undefined): number {
  const port = Number(text);
  if (!text || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TerminalError('Bad port', text || '(none)');
  }
  return port;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { folder: null, port: DEFAULT_PORT, open: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--no-open') args.open = false;
    else if (arg === '--port') args.port = parsePort(argv[++i]);
    else if (arg.startsWith('--port=')) args.port = parsePort(arg.slice('--port='.length));
    else if (arg.startsWith('-')) throw new TerminalError('Unknown flag', arg);
    else if (args.folder !== null) throw new TerminalError('Too many folders', arg);
    else args.folder = arg;
  }
  return args;
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
