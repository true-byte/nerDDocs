import { spawn } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { folderWith, withConfig, writeInto } from './folder.ts';

export const REPO = join(import.meta.dirname, '../..');
export const COMMAND = join(REPO, 'dist/nerddocs.cjs');

export interface StartedCommand {
  address: string;
  /** All that the command printed, in the order that it arrived. */
  output(): string;
  stdout(): string;
  stderr(): string;
  /** Sends the signal to the command and gives its exit status once it has stopped. */
  stop(signal?: NodeJS.Signals): Promise<number | null>;
}

export interface RunningCommand extends StartedCommand {
  folder: string;
  save(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
}

const started = new Set<() => void>();
process.on('exit', () => {
  for (const kill of started) kill();
});

/** Starts a program that prints an address, and waits for that address. */
export async function startCommand(
  [program, ...args]: [string, ...string[]],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<StartedCommand> {
  const child = spawn(program, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    // A signal in a terminal reaches a program and every program that it started.
    detached: true,
  });
  const signalAll = (signal: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, signal);
    } catch {
      // The program has already stopped.
    }
  };
  const kill = () => signalAll('SIGTERM');
  started.add(kill);

  const exited = new Promise<number | null>((resolve) => {
    child.on('exit', (status) => {
      started.delete(kill);
      resolve(status);
    });
  });
  let text = '';
  let stdout = '';
  let stderr = '';
  const address = await new Promise<string>((resolve, reject) => {
    const read = (chunk: Buffer) => {
      text += chunk.toString();
      const match = /^Address: (\S+)$/m.exec(text);
      if (match) resolve(match[1]!);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      read(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      read(chunk);
    });
    child.on('exit', () => reject(new Error(`The command stopped: ${text}`)));
  });
  return {
    address,
    output: () => text,
    stdout: () => stdout,
    stderr: () => stderr,
    stop: (signal = 'SIGTERM') => {
      signalAll(signal);
      return exited;
    },
  };
}

export interface RunOptions {
  env?: NodeJS.ProcessEnv;
  args?: string[];
  /** Leaves out the config that a site otherwise gets from `withConfig`. */
  noConfig?: boolean;
}

/** Runs the built command on a new folder that holds the given files. */
export async function runCommand(files: Record<string, string>, options: RunOptions = {}): Promise<RunningCommand> {
  const { env, args = ['--no-open'], noConfig = false } = options;
  const folder = await folderWith(noConfig ? files : withConfig(files));
  const command = await startCommand([process.execPath, COMMAND, folder, '--port', '0', ...args], { env });
  return {
    ...command,
    folder,
    save: (name, content) => writeInto(folder, name, content),
    remove: (name) => rm(join(folder, name), { recursive: true }),
    move: (from, to) => rename(join(folder, from), join(folder, to)),
  };
}
