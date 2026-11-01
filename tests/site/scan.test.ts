import { spawnSync } from 'node:child_process';
import fs, { chmod, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { replaceBuiltin } from '../support/builtins.ts';
import { folderWith } from '../support/folder.ts';
import { holdNextRead } from '../support/held-read.ts';
import { isPublicPath, scanSite, siteName, type TreeNode } from '../../src/site/scan.ts';

function outline(nodes: TreeNode[]): unknown[] {
  return nodes.map((node) =>
    node.kind === 'page' ? node.title : { [node.title]: outline(node.children) },
  );
}

test('folders are sections, Markdown files are pages, and file names set the order', async () => {
  const folder = await folderWith({
    'storage.md': '# Storage',
    'backups/restore.md': '# Restore a file',
    'backups/schedules.md': 'No heading here.',
    'backups/plans/02-team.md': '# Team plan',
    'backups/plans/01-basic.md': '# Basic plan',
    'README.md': '# Backup app',
    'images/restore-window.png': 'png',
  });

  const site = await scanSite(folder);

  expect(outline(site.tree)).toEqual([
    'Backup app',
    { Backups: [{ Plans: ['Basic plan', 'Team plan'] }, 'Restore a file', 'Schedules'] },
    'Storage',
  ]);
  expect(site.pages.map((page) => page.url)).toEqual([
    '/README.html',
    '/backups/plans/01-basic.html',
    '/backups/plans/02-team.html',
    '/backups/restore.html',
    '/backups/schedules.html',
    '/storage.html',
  ]);
});

test('a number sets the order and leaves the title of a file with no heading', async () => {
  const folder = await folderWith({
    '02-schedules.md': 'A plan says how often.',
    '01-restore.md': 'Pick a file and a day.',
    'guide/agents.md': '# Agents',
    'guide/index.md': '# Guide',
    'guide/README.md': '# About the guide',
  });

  const site = await scanSite(folder);

  expect(outline(site.tree)).toEqual([
    'Restore',
    'Schedules',
    { Guide: ['Guide', 'About the guide', 'Agents'] },
  ]);
});

test('a folder with no Markdown file below it is no section', async () => {
  const folder = await folderWith({
    'restore.md': '# Restore a file',
    'images/shots/restore-window.png': 'png',
  });
  expect(outline((await scanSite(folder)).tree)).toEqual(['Restore a file']);
});

test('two sections with one name close on their own', async () => {
  const folder = await folderWith({
    'backups/plans/team.md': '# Team plan',
    'agents/plans/rollout.md': '# Rollout plan',
  });

  const site = await scanSite(folder);

  const ids = (nodes: TreeNode[]): string[] =>
    nodes.flatMap((node) => (node.kind === 'section' ? [node.id, ...ids(node.children)] : []));
  expect(ids(site.tree)).toEqual(['agents', 'agents/plans', 'backups', 'backups/plans']);
});

test('dot folders, dot files and node_modules are not part of the site', async () => {
  const folder = await folderWith({
    'restore.md': '# Restore a file',
    '.drafts/plan.md': '# Plan',
    '.hidden.md': '# Hidden',
    'node_modules/backup-agent/README.md': '# Agent',
    'backups/node_modules/backup-agent/README.md': '# Agent',
    'backups/.git/notes.md': '# Notes',
  });

  const site = await scanSite(folder);

  expect(site.pages.map((page) => page.url)).toEqual(['/restore.html']);
  expect(site.tree).toHaveLength(1);
});

test('a page saved in a folder named __nerddocs stays out of the panel, since the app owns that address', async () => {
  const folder = await folderWith({
    'restore.md': '# Restore a file',
    '__nerddocs/notes.md': '# Notes',
    'backups/__nerddocs/agents.md': '# Agents',
  });

  const site = await scanSite(folder);

  expect(outline(site.tree)).toEqual([{ Backups: [{ 'Nerddocs': ['Agents'] }] }, 'Restore a file']);
});

test('a path is public only inside the folder, with no dot name and no node_modules', () => {
  expect(isPublicPath('/backup-app/guide', '/backup-app/guide')).toBe(true);
  expect(isPublicPath('/backup-app/guide', '/backup-app/guide/backups/restore.md')).toBe(true);
  expect(isPublicPath('/backup-app/guide', '/backup-app/storage-keys.txt')).toBe(false);
  expect(isPublicPath('/backup-app/guide', '/backup-app/guide/.env')).toBe(false);
  expect(isPublicPath('/backup-app/guide', '/backup-app/guide/node_modules/agent.js')).toBe(false);
});

test('a symbolic link to a file outside the folder is not part of the site', async () => {
  const outside = await folderWith({ 'storage-keys.md': '# Storage keys' });
  const folder = await folderWith({ 'restore.md': '# Restore a file', 'backups/schedules.md': '# Schedules' });
  await symlink(join(outside, 'storage-keys.md'), join(folder, 'storage-keys.md'));
  await symlink(join(outside), join(folder, 'outside'));
  await symlink(join(folder, 'restore.md'), join(folder, 'again.md'));

  const site = await scanSite(folder);

  expect(site.pages.map((page) => page.url).sort()).toEqual([
    '/again.html',
    '/backups/schedules.html',
    '/restore.html',
  ]);
});

test('a symbolic link to a dot folder or to node_modules is not part of the site', async () => {
  const folder = await folderWith({
    'restore.md': '# Restore a file',
    '.drafts/plan.md': '# Draft plan',
    'node_modules/backup-agent/README.md': '# Backup agent',
  });
  await symlink(join(folder, '.drafts/plan.md'), join(folder, 'draft-link.md'));
  await symlink(join(folder, 'node_modules/backup-agent/README.md'), join(folder, 'agent-link.md'));

  const site = await scanSite(folder);

  expect(outline(site.tree)).toEqual(['Restore a file']);
});

test('a symbolic link named like a page that lands on a folder is no page and no error', async () => {
  const folder = await folderWith({ 'backups/restore.md': '# Restore a file' });
  await symlink(join(folder, 'backups'), join(folder, 'folder-link.md'));
  const errors: string[] = [];

  const site = await scanSite(folder, { onReadError: (path) => errors.push(path) });

  expect(outline(site.tree)).toEqual([{ Backups: ['Restore a file'] }]);
  expect(errors).toEqual([]);
});

test('a served folder that is itself a symbolic link keeps its link pages', async () => {
  const real = await folderWith({ 'restore.md': '# Restore a file' });
  await symlink(join(real, 'restore.md'), join(real, 'again.md'));
  const parent = await folderWith({});
  await symlink(real, join(parent, 'guide'));

  const site = await scanSite(join(parent, 'guide'));

  expect(site.pages.map((page) => page.url)).toEqual(['/again.html', '/restore.html']);
});

test('a file or a section deleted during a scan is no error', async () => {
  const folder = await folderWith({ 'agents.md': '# Agents', 'backups/restore.md': '# Restore', 'storage.md': '# Storage' });
  const held = holdNextRead(join(folder, 'agents.md'));
  const errors: string[] = [];
  let gone = 0;

  const scanning = scanSite(folder, { onReadError: (path) => errors.push(path), onGone: () => gone++ });
  await held.reached;
  await rm(join(folder, 'backups'), { recursive: true });
  await rm(join(folder, 'storage.md'));
  held.release();
  const site = await scanning;

  expect(outline(site.tree)).toEqual(['Agents']);
  expect(errors).toEqual([]);
  expect(gone).toBe(2);
});

test('a served folder that is gone gives an empty site and no error', async () => {
  const folder = await folderWith({ 'restore.md': '# Restore a file' });
  await rm(folder, { recursive: true });
  const errors: string[] = [];
  let gone = 0;

  const site = await scanSite(folder, { onReadError: (path) => errors.push(path), onGone: () => gone++ });

  expect(site.pages).toEqual([]);
  expect(errors).toEqual([]);
  expect(gone).toBe(0);
});

test('a named pipe called like a page is no page, and the scan never waits on it', async () => {
  test.skip(process.platform === 'win32', 'Windows has no named pipes in a folder.');
  const folder = await folderWith({ 'restore.md': '# Restore a file' });
  expect(spawnSync('mkfifo', [join(folder, 'pipe.md')]).status).toBe(0);
  // A read of a pipe with no writer never ends, so the stand-in answers in its place.
  const realRead = fs.readFile;
  const pipeAnswers = (async (path: string, ...rest: []) => (path.endsWith('pipe.md') ? '' : realRead(path, ...rest))) as typeof fs.readFile;
  const putBack = replaceBuiltin(fs, 'readFile', pipeAnswers);
  try {
    const site = await scanSite(folder);

    expect(outline(site.tree)).toEqual(['Restore a file']);
  } finally {
    putBack();
  }
});

test('of two files with one address, the first is the page and the other is reported', async () => {
  test.skip(process.platform !== 'linux', 'Other systems can treat these two names as one file.');
  const folder = await folderWith({ 'restore.md': '# Restore a file', 'restore.MD': '# Restore a copy', 'storage.md': '# Storage' });
  const duplicates: string[] = [];

  const site = await scanSite(folder, { onDuplicate: (path) => duplicates.push(path) });

  expect(outline(site.tree)).toEqual(['Restore a copy', 'Storage']);
  expect(duplicates).toEqual([join(folder, 'restore.md')]);
});

test('a file that cannot be read is reported, and the other pages stay', async () => {
  test.skip(process.getuid?.() === 0, 'The root user can read every file.');
  const folder = await folderWith({ 'restore.md': '# Restore a file', 'storage.md': '# Storage' });
  await chmod(join(folder, 'restore.md'), 0);
  const errors: string[] = [];

  const site = await scanSite(folder, { onReadError: (path) => errors.push(path) });

  expect(outline(site.tree)).toEqual(['Storage']);
  expect(errors).toEqual([join(folder, 'restore.md')]);
});

test('a folder that cannot be read is reported, and the other pages stay', async () => {
  test.skip(process.getuid?.() === 0, 'The root user can read every folder.');
  const folder = await folderWith({ 'backups/restore.md': '# Restore a file', 'storage.md': '# Storage' });
  await chmod(join(folder, 'backups'), 0);
  const errors: string[] = [];
  try {
    const site = await scanSite(folder, { onReadError: (path) => errors.push(path) });

    expect(outline(site.tree)).toEqual(['Storage']);
    expect(errors).toEqual([join(folder, 'backups')]);
  } finally {
    await chmod(join(folder, 'backups'), 0o755);
  }
});

test('a scan renders only the pages whose text changed', async () => {
  const folder = await folderWith({ 'restore.md': '# Restore a file', 'storage.md': '# Storage' });
  const previous = await scanSite(folder);
  previous.pages[0]!.html = '<p>Kept from the scan before.</p>';
  previous.pages[1]!.source = 'Edited since the scan before.';

  const site = await scanSite(folder, { previous });

  expect(site.pages[0]!.html).toBe('<p>Kept from the scan before.</p>');
  expect(site.pages[1]!.source).toBe('# Storage');
});

test('a save in any public folder is watched, and a save in a dot folder is not', async () => {
  const folder = await folderWith({
    'backups/plans/team.md': '# Team',
    'images/restore-window.png': 'png',
    '.git/config': 'x',
  });

  const site = await scanSite(folder);

  expect(site.folders.sort()).toEqual(
    [folder, join(folder, 'backups'), join(folder, 'backups/plans'), join(folder, 'images')].sort(),
  );
});

test('the site name comes from the folder, or from its parent for a docs folder', () => {
  expect(siteName('/home/mia/backup-app/guide')).toBe('Guide');
  expect(siteName('/home/mia/backup-app/docs')).toBe('Backup app');
  expect(siteName('/home/mia/backup-app/Docs')).toBe('Backup app');
  expect(siteName('/home/mia/backup-app/DOCS')).toBe('Backup app');
  expect(siteName('/docs')).toBe('Docs');
  expect(siteName('/')).toBe('Docs');
});
