import { rmSync } from 'node:fs';
import { mkdir, mkdtemp, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const created: string[] = [];
process.on('exit', () => {
  for (const folder of created) rmSync(folder, { recursive: true, force: true });
});

export async function writeInto(folder: string, name: string, text: string): Promise<void> {
  await mkdir(dirname(join(folder, name)), { recursive: true });
  await writeFile(join(folder, name), text);
}

/** Saves a file in one step, so that the folder gets one change, and no scan can read half a save. */
export async function saveAtOnce(folder: string, name: string, text: string): Promise<void> {
  await writeFile(join(folder, `.${name}.saving`), text);
  await rename(join(folder, `.${name}.saving`), join(folder, name));
}

/** A new temporary folder that holds the given files. */
export async function folderWith(files: Record<string, string>): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'nerddocs-'));
  created.push(folder);
  for (const [name, text] of Object.entries(files)) await writeInto(folder, name, text);
  return folder;
}
