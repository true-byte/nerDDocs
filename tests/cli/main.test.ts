import { spawnSync } from 'node:child_process';
import { accessSync, constants, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { copyFile, readFile, realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { recordingOpener } from '../support/fake-opener.ts';
import { folderWith } from '../support/folder.ts';
import { OFTEN } from '../support/poll.ts';
import { busyPortBeforeFreePort } from '../support/ports.ts';
import { COMMAND, REPO, runCommand, startCommand } from '../support/run-command.ts';

const NO_BROWSER = ['--port', '0', '--no-open'];

test('the command prints the folder, the page count and the address', async () => {
  const run = await runCommand({ 'restore.md': '# Restore a file', 'storage.md': '# Storage' });
  try {
    expect(run.output()).toContain(`Folder: ${run.folder}\nPages: 2\nAddress: http://127.0.0.1:`);
    expect((await fetch(run.address)).status).toBe(200);
  } finally {
    await run.stop();
  }
});

test('npx nerddocs in the clone shows ./docs', async () => {
  const run = await startCommand(['npx', 'nerddocs', ...NO_BROWSER], { cwd: REPO });
  try {
    expect(run.output()).toContain(`Folder: ${join(REPO, 'docs')}\n`);
    expect((await fetch(run.address)).status).toBe(200);
  } finally {
    await run.stop();
  }
});

test('a problem with the levels goes to standard error, as one line with its name and value', async () => {
  const run = await runCommand({
    'nerddocs.json': '{"levels":[{"id":"overview","icon":"rocket"}]}',
    'restore.md': '::: overview internals\nPick a file.\n:::\n',
  });
  try {
    const config = join(run.folder, 'nerddocs.json');
    expect(run.stderr()).toBe(`Unknown icon: rocket ${config}\nUnknown level: internals ${join(run.folder, 'restore.md')}\n`);
  } finally {
    await run.stop();
  }

  const bad = await runCommand({ 'nerddocs.json': '{"levels":[{"id":"overview","name":""}]}', 'restore.md': '# Restore a file' });
  try {
    expect(bad.stderr()).toBe(`Bad config: ${join(bad.folder, 'nerddocs.json')}\n`);
  } finally {
    await bad.stop();
  }
});

test('a folder with no config prints its path to standard error, and the command runs', async () => {
  const run = await runCommand({ 'restore.md': '::: overview\nPick a file.\n:::\n' }, { noConfig: true });
  try {
    expect(run.stderr()).toBe(`Missing config: ${join(run.folder, 'nerddocs.json')}\n`);
    expect((await fetch(`${run.address}restore.html`)).status).toBe(200);
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
  const backupApp = await folderWith({ 'docs/restore.md': '# Restore a file', 'notes.md': '# Notes' });
  const run = await startCommand([process.execPath, COMMAND, ...NO_BROWSER], { cwd: backupApp });
  try {
    expect(run.output()).toContain(`Folder: ${join(await realpath(backupApp), 'docs')}\nPages: 1\n`);
  } finally {
    await run.stop();
  }
});

test('with no folder named and no ./docs, the command shows the current folder', async () => {
  const guide = await folderWith({ 'restore.md': '# Restore a file' });
  const run = await startCommand([process.execPath, COMMAND, ...NO_BROWSER], { cwd: guide });
  try {
    expect(run.output()).toContain(`Folder: ${await realpath(guide)}\nPages: 1\n`);
  } finally {
    await run.stop();
  }
});

test('the folder, the page count and the address go to standard output', async () => {
  const run = await runCommand({ 'restore.md': '# Restore a file' });
  try {
    expect(run.stdout()).toBe(`Folder: ${run.folder}\nPages: 1\nAddress: ${run.address}\n`);
    expect(run.stderr()).toBe('');
  } finally {
    await run.stop();
  }
});

test('a problem line goes to standard error', async () => {
  test.skip(process.platform !== 'linux', 'Other systems can treat these two names as one file.');
  const run = await runCommand({ 'restore.md': '# Restore a file', 'restore.MD': '# Restore a copy' });
  try {
    await expect.poll(() => run.stderr(), OFTEN).toBe(`Duplicate page: ${join(run.folder, 'restore.md')}\n`);
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

  test('the command opens the browser at its address', async () => {
    const { path, opened } = await recordingOpener();
    const run = await runCommand({}, { env: { PATH: path }, args: [] });
    try {
      await expect.poll(() => readFile(opened, 'utf8').catch(() => ''), OFTEN).toBe(run.address);
    } finally {
      await run.stop();
    }
  });

  test('a browser that cannot open prints one error line and the site stays up', async () => {
    const run = await runCommand({}, { env: { PATH: await folderWith({}) }, args: [] });
    try {
      await expect.poll(() => run.output(), OFTEN).toContain(`Cannot open browser: ${run.address}`);
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
