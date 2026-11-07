import { expect, test } from '@playwright/test';
import { addressNames, SiteAddresses, type FolderEntry } from '../../src/site/addresses.ts';

const files = (...names: string[]): FolderEntry[] => names.map((name) => ({ name, folder: false }));
const folders = (...names: string[]): FolderEntry[] => names.map((name) => ({ name, folder: true }));
const namesOf = (entries: FolderEntry[]) => Object.fromEntries(addressNames(entries));

test('a folder name and the stem of a Markdown file drop the order prefix that the label drops', () => {
  expect(namesOf([...folders('01-backups', '02_agents', '003 storage'), ...files('01-restore.md', '04.users.md', '2024-report.md', '1.md')])).toEqual({
    '01-backups': 'backups',
    '02_agents': 'agents',
    '003 storage': 'storage',
    '01-restore.md': 'restore',
    '04.users.md': 'users',
    '2024-report.md': '2024-report',
    '1.md': '1',
  });
});

test('of two names that give one address, the first in file order takes it and the other keeps its full name', () => {
  expect(namesOf(folders('02-backups', '01-backups'))).toEqual({ '01-backups': 'backups', '02-backups': '02-backups' });
  expect(namesOf(files('02-team.md', '01-team.md'))).toEqual({ '01-team.md': 'team', '02-team.md': '02-team' });
});

test('a name with an order prefix and the same name without one get two addresses', () => {
  const names = namesOf(files('01-restore.md', 'restore.md'));
  expect(new Set(Object.values(names)).size).toBe(2);
  expect(Object.values(names)).toContain('restore');
});

test('a folder and a Markdown file of one name keep their addresses apart, and another file has no address name', () => {
  expect(namesOf([...folders('01-backups'), ...files('02-backups.md', 'restore-window.png')])).toEqual({
    '01-backups': 'backups',
    '02-backups.md': 'backups',
  });
});

test('the address of a page and of a folder take the address name of each folder on their path', () => {
  const listed: Record<string, FolderEntry[]> = {
    '': folders('user-guide'),
    'user-guide': folders('01-backups', '02-backups'),
    'user-guide/01-backups': files('index.md', '01-restore.md'),
    'user-guide/02-backups': files('01-tape.md'),
  };
  const addresses = new SiteAddresses((folder) => listed[folder] ?? []);
  expect(addresses.pageUrl('user-guide/01-backups/01-restore.md')).toBe('/user-guide/backups/restore.html');
  expect(addresses.pageUrl('user-guide/01-backups/index.md')).toBe('/user-guide/backups/index.html');
  expect(addresses.pageUrl('user-guide/02-backups/01-tape.md')).toBe('/user-guide/02-backups/tape.html');
  expect(addresses.folderUrl('user-guide/01-backups')).toBe('/user-guide/backups');
});
