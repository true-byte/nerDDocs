import fs from 'node:fs/promises';
import { replaceBuiltin } from './builtins.ts';

export interface HeldRead {
  /** Resolves when a scan reaches the file. */
  reached: Promise<void>;
  release(): void;
}

/** Makes the next read of one file wait, so that a test can act while a scan runs. */
export function holdNextRead(path: string): HeldRead {
  const realRead = fs.readFile;
  let arrived: () => void = () => {};
  let release: () => void = () => {};
  const reached = new Promise<void>((resolve) => (arrived = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const putBack = replaceBuiltin(fs, 'readFile', (async (file: string, ...rest: []) => {
    if (file === path) {
      putBack();
      arrived();
      await released;
    }
    return realRead(file, ...rest);
  }) as typeof fs.readFile);
  return { reached, release };
}
