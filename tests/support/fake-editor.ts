import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { folderWith } from './folder.ts';

export interface FakeEditor {
  /** The program for `LAUNCH_EDITOR`, which `launch-editor` starts in place of the editor of the computer. */
  program: string;
  /** Each start of the program: its arguments, joined by spaces, in the order of the starts. */
  opened(): Promise<string[]>;
}

/** An editor that records each file that it is asked to open, then exits with `status`. */
export async function fakeEditor(status = 0): Promise<FakeEditor> {
  const folder = await folderWith({});
  const program = join(folder, 'editor');
  const log = join(folder, 'opened.txt');
  await writeFile(program, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexit ${status}\n`);
  await chmod(program, 0o755);
  return {
    program,
    opened: async () => (await readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean),
  };
}

/** Runs `use` with `LAUNCH_EDITOR` set to the program, so that no real editor opens, and puts the value back after. */
export async function withEditor<T>(editor: FakeEditor, use: () => Promise<T>): Promise<T> {
  const before = process.env.LAUNCH_EDITOR;
  process.env.LAUNCH_EDITOR = editor.program;
  try {
    return await use();
  } finally {
    if (before === undefined) delete process.env.LAUNCH_EDITOR;
    else process.env.LAUNCH_EDITOR = before;
  }
}
