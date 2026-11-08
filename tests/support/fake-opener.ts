import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { folderWith } from './folder.ts';

/** A folder for the front of PATH, whose `xdg-open` or other named program runs the given shell lines in place of a browser. */
export async function fakeOpener(script: string, program = 'xdg-open'): Promise<string> {
  const folder = await folderWith({});
  const opener = join(folder, program);
  await writeFile(opener, `#!/bin/sh\n${script}\n`);
  await chmod(opener, 0o755);
  return folder;
}

/** A folder for the front of PATH whose `xdg-open` writes the address it gets to `opened.txt`. */
export async function recordingOpener(): Promise<{ path: string; opened: string }> {
  const folder = await fakeOpener('printf \'%s\' "$1" > "$(dirname "$0")/opened.tmp"\nmv "$(dirname "$0")/opened.tmp" "$(dirname "$0")/opened.txt"');
  return { path: `${folder}:${process.env.PATH}`, opened: join(folder, 'opened.txt') };
}
