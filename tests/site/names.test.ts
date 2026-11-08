import { expect, test } from '@playwright/test';
import { compareEntries, isMarkdownName, isPublicName, labelFromName, stemOf } from '../../src/site/names.ts';

test('a file or folder name becomes a label', () => {
  expect(labelFromName('backups')).toBe('Backups');
  expect(labelFromName('user-guide')).toBe('User guide');
  expect(labelFromName('storage_plugins')).toBe('Storage plugins');
  expect(labelFromName('API')).toBe('API');
  expect(labelFromName('BackupAgent')).toBe('BackupAgent');
});

test('a number at the front of a name sets the order and leaves the label', () => {
  expect(labelFromName('02-schedules')).toBe('Schedules');
  expect(labelFromName('01_restore')).toBe('Restore');
  expect(labelFromName('003 storage')).toBe('Storage');
  expect(labelFromName('01. restore')).toBe('Restore');
});

test('a year at the front of a name, or a name of only a number, stays in the label', () => {
  expect(labelFromName('2026-releases')).toBe('2026 releases');
  expect(labelFromName('42')).toBe('42');
});

test('a name of only a number and a separator keeps the number, so the row is never blank', () => {
  expect(labelFromName('01-')).toBe('01');
});

test('a name with capitals of its own keeps them', () => {
  expect(labelFromName('iPhone setup')).toBe('iPhone setup');
  expect(labelFromName('backupAgent')).toBe('backupAgent');
});

test('a Markdown name is one that ends in .md, at any case', () => {
  expect(isMarkdownName('restore.md')).toBe(true);
  expect(isMarkdownName('RESTORE.MD')).toBe(true);
  expect(isMarkdownName('restore.mdx')).toBe(false);
  expect(stemOf('Restore.MD')).toBe('Restore');
});

test('dot names and node_modules are not public', () => {
  expect(isPublicName('restore.md')).toBe(true);
  expect(isPublicName('.git')).toBe(false);
  expect(isPublicName('.env')).toBe(false);
  expect(isPublicName('node_modules')).toBe(false);
});

test('file names set the order, with numbers in number order', () => {
  const names = ['storage.md', '10-plans.md', 'backups', '2-agents.md', 'Admin'];
  expect(names.sort(compareEntries)).toEqual([
    '2-agents.md',
    '10-plans.md',
    'Admin',
    'backups',
    'storage.md',
  ]);
});

test('an index or README comes first in its folder', () => {
  const names = ['agents.md', 'README.md', 'index.md', 'backups'];
  expect(names.sort(compareEntries)).toEqual(['index.md', 'README.md', 'agents.md', 'backups']);
});

test('an index or README at any case comes first in its folder', () => {
  expect(['agents.md', 'readme.md'].sort(compareEntries)).toEqual(['readme.md', 'agents.md']);
  expect(['agents.md', 'Readme.md'].sort(compareEntries)).toEqual(['Readme.md', 'agents.md']);
  expect(['agents.md', 'Index.md'].sort(compareEntries)).toEqual(['Index.md', 'agents.md']);
});

test('a name comes before a longer name that starts with it', () => {
  expect(['plan-b.md', 'plan.md'].sort(compareEntries)).toEqual(['plan.md', 'plan-b.md']);
});

test('two names that differ only in capitals come in one order on every computer', () => {
  expect(['restore.md', 'restore.MD'].sort(compareEntries)).toEqual(['restore.MD', 'restore.md']);
  expect(['restore.MD', 'restore.md'].sort(compareEntries)).toEqual(['restore.MD', 'restore.md']);
});

test('a folder named index or README keeps its place by name', () => {
  const names = ['agents.md', 'index'];
  expect(names.sort(compareEntries)).toEqual(['agents.md', 'index']);
});
