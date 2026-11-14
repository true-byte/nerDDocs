import { spawnSync } from 'node:child_process';
import { accessSync, constants, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { copyFile, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { recordingOpener } from '../support/fake-opener.ts';
import { folderWith, NO_LEVELS, saveAtOnce, type FileContent } from '../support/folder.ts';
import { OFTEN } from '../support/poll.ts';
import { busyPortBeforeFreePort } from '../support/ports.ts';
import { COMMAND, REPO, runCommand, startCommand } from '../support/run-command.ts';

const NO_BROWSER = ['--port', '0', '--no-open'];

/** The backup app: a folder that holds the files in its folder `docs`. */
const backupApp = (files: Record<string, FileContent>) =>
  folderWith(Object.fromEntries(Object.entries(files).map(([name, text]) => [`docs/${name}`, text])));

/** Starts the command on `docs` in the backup app, so that it prints each path from `docs/`. */
async function runInBackupApp(files: Record<string, FileContent>) {
  const app = await backupApp(files);
  const run = await startCommand([process.execPath, COMMAND, 'docs', ...NO_BROWSER], { cwd: app });
  return { ...run, docs: join(app, 'docs') };
}

/** Runs `nerddocs check` with the arguments in the folder, and gives its status and its output once it stops. */
function runCheckIn(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [COMMAND, 'check', ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 20_000 });
}

/** The block of a 'Missing page' to `undo.md` on the line `line` of `docs/restore.md`, with its empty line after it. */
function undoBlock(line: number, text: string): string {
  return [
    `docs/restore.md:${line}  Missing page  undo.md`,
    `${String(line).padStart(4)} │ ${text}`,
    `     │ ${' '.repeat(text.indexOf('undo.md'))}^^^^^^^`,
    '',
    '',
  ].join('\n');
}

const UNDO = 'To undo a restore, see [Undo a restore](undo.md).';

test('the command prints the folder, the page count and the address', async () => {
  const run = await runCommand({ 'restore.md': '# Restore a file', 'storage.md': '# Storage' });
  try {
    // The folder sits in the temp folder, outside the folder that the command runs in, so it prints in full.
    expect(run.output()).toContain(`Folder: ${run.folder}\nPages: 2\nAddress: http://127.0.0.1:`);
    expect((await fetch(run.address)).status).toBe(200);
  } finally {
    await run.stop();
  }
});

test('npx nerddocs in the clone shows ./docs', async () => {
  const run = await startCommand(['npx', 'nerddocs', ...NO_BROWSER], { cwd: REPO });
  try {
    expect(run.output()).toContain('Folder: docs\n');
    expect((await fetch(run.address)).status).toBe(200);
  } finally {
    await run.stop();
  }
});

test('a problem with the levels goes to standard error as a block, with its path from the current folder and an empty line after it', async () => {
  const run = await runInBackupApp({
    'nerddocs.json': '{"levels":[{"id":"overview","icon":"rocket"}]}',
    'restore.md': '::: overview internals\nPick a file.\n:::\n',
  });
  try {
    expect(run.stderr()).toBe(
      [
        'docs/nerddocs.json  Unknown icon  rocket',
        '',
        'docs/restore.md:1  Unknown level  internals',
        '   1 │ ::: overview internals',
        '     │              ^^^^^^^^^',
        '',
        '',
      ].join('\n'),
    );
  } finally {
    await run.stop();
  }

  const bad = await runInBackupApp({ 'nerddocs.json': '{"levels":[{"id":"overview","name":""}]}', 'restore.md': '# Restore a file\n\nPick a file.\n' });
  try {
    expect(bad.stderr()).toBe('docs/nerddocs.json  Bad config\n\n');
  } finally {
    await bad.stop();
  }
});

test('a folder with no config prints the block of its config to standard error, and the command runs', async () => {
  const run = await runInBackupApp({ 'restore.md': '::: overview\nPick a file.\n:::\n' });
  try {
    expect(run.stderr()).toBe('docs/nerddocs.json  Missing config\n\n');
    expect((await fetch(`${run.address}restore.html`)).status).toBe(200);
  } finally {
    await run.stop();
  }
});

test('the running command prints the block of a problem once, keeps still when a save only moves it, and prints it again after a scan without it', async () => {
  const run = await runInBackupApp({
    'nerddocs.json': NO_LEVELS,
    'restore.md': `# Restore a file\n\n${UNDO}\n`,
    'storage.md': '# Storage\n\nBlocks are stored once.\n',
  });
  const shown = async () => (await fetch(`${run.address}restore.html`)).text();
  try {
    expect(run.stderr()).toBe(undoBlock(3, UNDO));

    await saveAtOnce(run.docs, 'restore.md', `# Restore a file\n\nPick a file.\n\n${UNDO}\n`);
    await expect.poll(shown, OFTEN).toContain('Pick a file.');
    await saveAtOnce(run.docs, 'restore.md', '# Restore a file\n\nPick a file and a day.\n');
    await expect.poll(shown, OFTEN).toContain('Pick a file and a day.');
    expect(run.stderr()).toBe(undoBlock(3, UNDO));

    await saveAtOnce(run.docs, 'restore.md', `# Restore a file\n\nPick a file.\n\n${UNDO}\n`);
    await expect.poll(() => run.stderr(), OFTEN).toBe(undoBlock(3, UNDO) + undoBlock(5, UNDO));
    expect(run.output()).not.toContain('Problems:');
  } finally {
    await run.stop();
  }
});

test('a config with `"levels": false` prints nothing to standard error, with fence lines on a page', async () => {
  const run = await runCommand({ 'nerddocs.json': '{"levels":false}', 'restore.md': '::: overview\nPick a file.\n:::\n\n::: 10:30\nPick a time.\n' });
  try {
    expect(run.stderr()).toBe('');
  } finally {
    await run.stop();
  }
});

test('with no folder named, the command shows ./docs', async () => {
  const app = await folderWith({ 'docs/restore.md': '# Restore a file', 'notes.md': '# Notes' });
  const run = await startCommand([process.execPath, COMMAND, ...NO_BROWSER], { cwd: app });
  try {
    expect(run.output()).toContain('Folder: docs\nPages: 1\n');
  } finally {
    await run.stop();
  }
});

test('with no folder named and no ./docs, the command shows the current folder', async () => {
  const guide = await folderWith({ 'restore.md': '# Restore a file' });
  const run = await startCommand([process.execPath, COMMAND, ...NO_BROWSER], { cwd: guide });
  try {
    expect(run.output()).toContain('Folder: .\nPages: 1\n');
  } finally {
    await run.stop();
  }
});

test('the folder, the page count, the address and the author address go to standard output', async () => {
  const run = await runCommand({ 'restore.md': '# Restore a file\n\nPick a file.\n' });
  try {
    const author = await run.authorAddress();
    expect(run.stdout()).toBe(`Folder: ${run.folder}\nPages: 1\nAddress: ${run.address}\nAuthor address: ${author}\n`);
    expect(run.stderr()).toBe('');
  } finally {
    await run.stop();
  }
});

test('the author address is the address with the author path and a new key, and it sets the author cookie', async () => {
  const runs = [await runCommand({ 'restore.md': '# Restore a file' }), await runCommand({ 'restore.md': '# Restore a file' })];
  try {
    const keys: string[] = [];
    for (const run of runs) {
      const author = await run.authorAddress();
      const match = new RegExp(`^${run.address.replace(/[.]/g, '\\.')}__nerddocs/author/([A-Za-z0-9_-]{32})$`).exec(author);
      expect(match, author).not.toBeNull();
      keys.push(match![1]!);

      const response = await fetch(author, { redirect: 'manual' });
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/');
      const { port } = new URL(run.address);
      expect(response.headers.get('set-cookie')).toBe(`nerddocs-author-${port}=${match![1]}; Path=/; HttpOnly; SameSite=Strict`);
    }
    expect(keys[0]).not.toBe(keys[1]);
  } finally {
    await Promise.all(runs.map((run) => run.stop()));
  }
});

test('a problem block goes to standard error', async () => {
  test.skip(process.platform !== 'linux', 'Other systems can treat these two names as one file.');
  const run = await runInBackupApp({
    'nerddocs.json': NO_LEVELS,
    'restore.md': '# Restore a file\n\nPick a file.\n',
    'restore.MD': '# Restore a copy\n\nPick a copy.\n',
  });
  try {
    await expect.poll(() => run.stderr(), OFTEN).toBe('docs/restore.md  Duplicate page\n\n');
    expect(run.stdout()).not.toContain('Duplicate page');
  } finally {
    await run.stop();
  }
});

test('--port sets the first port to try, and a busy port moves to the next port', async () => {
  const { port, release } = await busyPortBeforeFreePort();
  const run = await runCommand({}, { args: ['--no-open', '--port', String(port)] });
  try {
    expect(Number(new URL(run.address).port)).toBe(port + 1);
  } finally {
    await run.stop();
    await release();
  }
});

test('the kill command stops the command with status 0, so a process manager reports no failure', async () => {
  const run = await runCommand({ 'restore.md': '# Restore a file' });
  expect(await run.stop('SIGTERM')).toBe(0);
});

test('Ctrl+C stops the command with status 0, also with a page open', async () => {
  const run = await runCommand({ 'restore.md': '# Restore a file' });
  const events = await fetch(`${run.address}__nerddocs/events?page=/restore.html`);
  expect(events.status).toBe(200);

  expect(await run.stop('SIGINT')).toBe(0);
});

test('the packed file holds the command and no other code', async () => {
  // The npm of Node 22 runs `prepare` even with --ignore-scripts. That build would replace dist/ under the other tests.
  const copy = await folderWith({});
  cpSync(REPO, copy, {
    recursive: true,
    filter: (path) => !['.git', '.tmp', 'node_modules'].includes(basename(path)),
  });
  const manifest = JSON.parse(readFileSync(join(copy, 'package.json'), 'utf8')) as { scripts?: unknown };
  delete manifest.scripts;
  writeFileSync(join(copy, 'package.json'), JSON.stringify(manifest));

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['pack', '--dry-run', '--json'], {
    encoding: 'utf8',
    cwd: copy,
  });
  expect(result.status).toBe(0);
  const [pack] = JSON.parse(result.stdout) as { files: { path: string }[] }[];
  expect(pack!.files.map((file) => file.path).sort()).toEqual([
    'LICENSE',
    'README.md',
    'dist/nerddocs.cjs',
    'package.json',
  ]);
});

test('the nerddocs name of the package runs the built file', () => {
  const { bin } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { bin: Record<string, string> };
  expect(join(REPO, bin.nerddocs!)).toBe(COMMAND);
  expect(readFileSync(COMMAND, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
  expect(() => accessSync(COMMAND, constants.X_OK)).not.toThrow();
});

test('a bad call prints one error line and exits with status 1', () => {
  const result = spawnSync(process.execPath, [COMMAND, '--color'], { encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('Unknown flag: --color\n');
  expect(result.stdout).toBe('');
});

test('a missing folder prints one error line', async () => {
  const result = spawnSync(process.execPath, [COMMAND, 'backups'], {
    encoding: 'utf8',
    cwd: await folderWith({}),
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('Missing folder: backups\n');
});

test('the command file runs alone, with nothing installed beside it', async () => {
  const alone = await folderWith({ 'guide/restore.md': '# Restore a file' });
  await copyFile(COMMAND, join(alone, 'nerddocs.cjs'));
  const run = await startCommand(['./nerddocs.cjs', 'guide', ...NO_BROWSER], { cwd: alone });
  try {
    expect(await (await fetch(`${run.address}restore.html`)).text()).toContain('Restore a file');
  } finally {
    await run.stop();
  }
});

test.describe('the browser', () => {
  test.skip(process.platform !== 'linux', 'The fake opener takes the place of xdg-open.');

  test('the command opens the browser at its author address', async () => {
    const { path, opened } = await recordingOpener();
    const run = await runCommand({}, { env: { PATH: path }, args: [] });
    try {
      const author = await run.authorAddress();
      await expect.poll(() => readFile(opened, 'utf8').catch(() => ''), OFTEN).toBe(author);
    } finally {
      await run.stop();
    }
  });

  test('a browser that cannot open prints one error line and the site stays up', async () => {
    const run = await runCommand({}, { env: { PATH: await folderWith({}) }, args: [] });
    try {
      const author = await run.authorAddress();
      await expect.poll(() => run.output(), OFTEN).toMatch(/Cannot open browser: \S+/);
      expect([`Cannot open browser: ${author}`, `Cannot open browser: ${run.address}`]).toContain(
        /Cannot open browser: \S+/.exec(run.output())![0],
      );
      expect(run.output().match(/Cannot open browser/g)).toHaveLength(1);
      expect((await fetch(run.address)).status).toBe(200);
    } finally {
      await run.stop();
    }
  });

  test('--no-open keeps the browser closed', async () => {
    // With no opener on the path, a try to open prints its error line before the command can stop.
    const run = await runCommand({}, { env: { PATH: await folderWith({}) }, args: ['--no-open'] });
    await run.stop();
    expect(run.output()).not.toContain('Cannot open browser');
  });
});

test.describe('nerddocs check', () => {
  const FILES = {
    'nerddocs.json': NO_LEVELS,
    'restore.md': `# Restore a file\n\n${UNDO}\n`,
    'storage.md': '# Storage\n\nBlocks are stored once.\n',
  };

  test('prints the report to standard output, opens no browser, serves nothing, and exits with 1 for a problem', async () => {
    test.skip(process.platform !== 'linux', 'The fake opener takes the place of xdg-open.');
    const app = await backupApp(FILES);
    const { path, opened } = await recordingOpener();
    const result = runCheckIn(app, ['docs'], { PATH: path });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe(`Folder: docs\nPages: 2\n\n${undoBlock(3, UNDO)}Problems: 1\n`);
    expect(result.stderr).toBe('');
    expect(existsSync(opened)).toBe(false);
  });

  test('with no problem prints Problems: 0 after the empty line, and exits with 0', async () => {
    const app = await backupApp({ ...FILES, 'restore.md': '# Restore a file\n\nPick a file.\n' });
    const result = runCheckIn(app, ['docs']);
    expect(result.stdout).toBe('Folder: docs\nPages: 2\n\nProblems: 0\n');
    expect(result.status).toBe(0);
  });

  test('with no folder named checks ./docs', async () => {
    const result = runCheckIn(await backupApp(FILES), []);
    expect(result.stdout).toMatch(/^Folder: docs\nPages: 2\n/);
    expect(result.status).toBe(1);
  });

  test('a command error prints its line to standard error and exits with 1', async () => {
    const app = await backupApp(FILES);
    for (const [args, line] of [
      [['backups'], 'Missing folder: backups'],
      [['docs', '--port', '4500'], 'Unknown flag: --port'],
      [['docs', '--no-open'], 'Unknown flag: --no-open'],
    ] as const) {
      const result = runCheckIn(app, [...args]);
      expect(result.status, line).toBe(1);
      expect(result.stderr, line).toBe(`${line}\n`);
      expect(result.stdout, line).toBe('');
    }
  });
});
