import { rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { savedPages } from '../../src/site/saved-pages.ts';
import { scanSite, type Site } from '../../src/site/scan.ts';
import { THREE_LEVELS } from '../support/levels.ts';
import { folderWith, writeInto } from '../support/folder.ts';

const FILES = {
  'nerddocs.json': THREE_LEVELS,
  'README.md': '# Backup app\n\nThe app keeps copies of your files.',
  'backups/01-restore.md': '# Restore a file\n\n::: overview\nPick a file and a day.\n::: internals\nA restore is a job.\n:::\n',
  'backups/02-schedules.md': '# Schedules\n\nA plan says how often.',
  'storage.md': '# Storage\n\nBlocks are stored once.',
};

/** Scans the folder before and after a change, as the server does, the second scan with the first as `previous`. */
async function scansAround(change: (folder: string) => Promise<void>): Promise<{ before: Site; after: Site }> {
  const folder = await folderWith(FILES);
  const before = await scanSite(folder);
  await change(folder);
  const after = await scanSite(folder, { previous: before });
  return { before, after };
}

test('a scan with no change saves no page', async () => {
  const { before, after } = await scansAround(async () => {});
  expect(savedPages(before, after)).toEqual([]);
});

test('a page with new text is saved', async () => {
  const { before, after } = await scansAround((folder) =>
    writeFile(join(folder, 'backups/02-schedules.md'), '# Schedules\n\nA plan says how often and how long.'),
  );
  expect(savedPages(before, after)).toEqual(['/backups/schedules.html']);
});

test('a page with new text in one level only is saved', async () => {
  const { before, after } = await scansAround((folder) =>
    writeFile(
      join(folder, 'backups/01-restore.md'),
      '# Restore a file\n\n::: overview\nPick a file and a day.\n::: internals\nA restore is a job on the server.\n:::\n',
    ),
  );
  expect(savedPages(before, after)).toEqual(['/backups/restore.html']);
});

test('a page with a new title is saved, and the other pages are not, though their tree shows the title', async () => {
  const { before, after } = await scansAround((folder) => writeFile(join(folder, 'storage.md'), '# Block storage\n\nBlocks are stored once.'));
  expect(savedPages(before, after)).toEqual(['/storage.html']);
});

test('a new page is saved', async () => {
  const { before, after } = await scansAround((folder) => writeInto(folder, 'backups/plans/team.md', '# Team plan\n\nEvery 6 hours.'));
  expect(savedPages(before, after)).toEqual(['/backups/plans/team.html']);
});

test('a removed page is not saved, and neither is the page that lost it as a neighbor', async () => {
  const { before, after } = await scansAround((folder) => rm(join(folder, 'backups/02-schedules.md')));
  expect(savedPages(before, after)).toEqual([]);
});

test('a page that only moved in the tree is not saved', async () => {
  const { before, after } = await scansAround((folder) =>
    rename(join(folder, 'backups/01-restore.md'), join(folder, 'backups/03-restore.md')),
  );
  const urls = after.pages.map((page) => page.url);
  expect(urls.indexOf('/backups/restore.html')).toBeGreaterThan(urls.indexOf('/backups/schedules.html'));
  expect(savedPages(before, after)).toEqual([]);
});

test('the saved pages come in the order of the tree', async () => {
  const { before, after } = await scansAround(async (folder) => {
    await writeFile(join(folder, 'storage.md'), '# Storage\n\nBlocks are stored once, on the server.');
    await writeInto(folder, 'backups/plans/team.md', '# Team plan\n\nEvery 6 hours.');
    await writeFile(join(folder, 'README.md'), '# Backup app\n\nThe app keeps copies of your files on a server.');
    await rm(join(folder, 'backups/02-schedules.md'));
  });
  expect(savedPages(before, after)).toEqual(['/README.html', '/backups/plans/team.html', '/storage.html']);
});

test('a scan with no previous render saves only the pages whose title or text differ', async () => {
  const folder = await folderWith(FILES);
  const before = await scanSite(folder);
  await writeFile(join(folder, 'storage.md'), '# Storage\n\nBlocks are stored twice.');
  const after = await scanSite(folder);
  expect(savedPages(before, after)).toEqual(['/storage.html']);
});
