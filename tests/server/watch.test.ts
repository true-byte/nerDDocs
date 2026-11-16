import fs, { type FSWatcher } from 'node:fs';
import fsPromises, { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { replaceBuiltin } from '../support/builtins.ts';
import { folderWith } from '../support/folder.ts';
import { OFTEN } from '../support/poll.ts';
import { FolderWatcher, isSiteChange } from '../../src/server/watch.ts';

test('only a Markdown file, the config file or a folder counts as a change of the site', async () => {
  const folder = await folderWith({ 'build.log': 'log', 'restore.md': '# Restore', 'images/restore-window.png': 'png' });
  const known = new Set([join(folder, 'old-section')]);
  const counts = (name: string | null) => isSiteChange(folder, name, known);

  expect(await counts('restore.md')).toBe(true);
  expect(await counts('nerddocs.json')).toBe(true);
  expect(await counts('removed.md')).toBe(true);
  expect(await counts('images')).toBe(true);
  expect(await counts('old-section')).toBe(true);
  expect(await counts(null)).toBe(true);

  expect(await counts('build.log')).toBe(false);
  expect(await counts('package.json')).toBe(false);
  expect(await counts('images/restore-window.png')).toBe(false);
  expect(await counts('removed.log')).toBe(false);
  expect(await counts('.hidden.md')).toBe(false);
  expect(await counts('node_modules')).toBe(false);
});

test('a save of a file that a page uses counts as a change of the site, and another image does not', async () => {
  const folder = await folderWith({ 'restore.md': '# Restore', 'restore-window.png': 'png', 'schedules-window.png': 'png' });
  const used = new Set([join(folder, 'restore-window.png'), join(folder, '.restore-window.png')]);

  expect(await isSiteChange(folder, 'restore-window.png', new Set(), used)).toBe(true);
  expect(await isSiteChange(folder, 'schedules-window.png', new Set(), used)).toBe(false);
  expect(await isSiteChange(folder, '.restore-window.png', new Set(), used)).toBe(false);
});

test('a new folder with a dot inside its name counts as a change of the site', async () => {
  const folder = await folderWith({});
  await mkdir(join(folder, 'v1.2'));
  expect(await isSiteChange(folder, 'v1.2', new Set())).toBe(true);
});

test('a save in a watched folder tells the site', async () => {
  const folder = await folderWith({ 'restore.md': '# Restore a file' });
  let changes = 0;
  const watcher = new FolderWatcher(folder, () => changes++, () => {});
  try {
    expect(await watcher.sync([folder])).toBe(true);
    await writeFile(join(folder, 'restore.md'), '# Restore a file\n\nSaved.');
    await expect.poll(() => changes, OFTEN).toBeGreaterThan(0);
  } finally {
    watcher.close();
  }
});

test('a watcher told the used files tells the site of a save of one', async () => {
  const folder = await folderWith({ 'restore.md': '# Restore a file', 'restore-window.png': 'png' });
  let changes = 0;
  const watcher = new FolderWatcher(folder, () => changes++, () => {});
  try {
    await watcher.sync([folder], [join(folder, 'restore-window.png')]);
    await writeFile(join(folder, 'restore-window.png'), 'png saved again');
    await expect.poll(() => changes, OFTEN).toBeGreaterThan(0);
  } finally {
    watcher.close();
  }
});

test('only a newly watched folder asks the site to scan again', async () => {
  const folder = await folderWith({});
  const errors: string[] = [];
  const watcher = new FolderWatcher(folder, () => {}, (path) => errors.push(path));
  try {
    expect(await watcher.sync([folder])).toBe(true);
    expect(await watcher.sync([folder])).toBe(false);
    expect(await watcher.sync([folder, join(folder, 'backups')])).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    watcher.close();
  }
});

test('a section that cannot be watched is reported, and the other sections stay watched', async () => {
  test.skip(process.getuid?.() === 0, 'The root user can watch every folder.');
  const folder = await folderWith({ 'backups/restore.md': '# Restore a file', 'storage.md': '# Storage' });
  await chmod(join(folder, 'backups'), 0);
  const errors: string[] = [];
  const watcher = new FolderWatcher(folder, () => {}, (path) => errors.push(path));
  try {
    expect(await watcher.sync([folder, join(folder, 'backups')])).toBe(true);
    expect(errors).toEqual([join(folder, 'backups')]);
  } finally {
    watcher.close();
    await chmod(join(folder, 'backups'), 0o755);
  }
});

test('a section removed and made again on a disk that reuses its inode is watched again', async () => {
  const folder = await folderWith({});
  const backups = join(folder, 'backups');
  await mkdir(backups);
  const realStat = fsPromises.stat;
  const sameInode = (async (path: string) => Object.assign(await realStat(path), { ino: 7 })) as typeof fsPromises.stat;
  const putBack = replaceBuiltin(fsPromises, 'stat', sameInode);
  let changes = 0;
  const watcher = new FolderWatcher(folder, () => changes++, () => {});
  try {
    await watcher.sync([backups]);
    changes = 0;
    await rm(backups, { recursive: true });
    await expect.poll(() => changes, OFTEN).toBeGreaterThan(0);

    await mkdir(backups);
    expect(await watcher.sync([backups])).toBe(true);

    changes = 0;
    await writeFile(join(backups, 'restore.md'), '# Restore a file');
    await expect.poll(() => changes, OFTEN).toBeGreaterThan(0);
  } finally {
    watcher.close();
    putBack();
  }
});

test('a watcher that fails leaves the command running, tells the site, and starts again at the next scan', async () => {
  const folder = await folderWith({});
  // Keyed by path: a server that another test closed can still start a watcher on its own folder in this worker.
  const started = new Map<string, FSWatcher>();
  const realWatch = fs.watch;
  const putBack = replaceBuiltin(fs, 'watch', ((...args: Parameters<typeof fs.watch>) => {
    const made = realWatch(...args);
    started.set(String(args[0]), made);
    return made;
  }) as typeof fs.watch);
  let changes = 0;
  const watcher = new FolderWatcher(folder, () => changes++, () => {});
  try {
    await watcher.sync([folder]);
    changes = 0;

    started.get(folder)!.emit('error', new Error('The system stopped this watch.'));

    expect(changes).toBe(1);
    expect(await watcher.sync([folder])).toBe(true);
  } finally {
    watcher.close();
    putBack();
  }
});
