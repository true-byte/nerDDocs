import { runInNewContext } from 'node:vm';
import { expect, test } from '@playwright/test';
import type { SearchPage } from '../../src/page/search.ts';
import { scanSite } from '../../src/site/scan.ts';
import { searchScript } from '../../src/site/search-file.ts';
import { DIMENSION_SITE } from '../support/dimensions.ts';
import { folderWith } from '../support/folder.ts';
import { THREE_LEVELS } from '../support/levels.ts';

/** The pages that the script gives a window, as a classic script with no module. */
function pagesOf(script: string): SearchPage[] {
  const self: { nerddocsSearch?: { pages: SearchPage[] } } = {};
  runInNewContext(script, { self });
  return self.nerddocsSearch!.pages;
}

test('the script sets self.nerddocsSearch to one entry for each page, in the order of the pages, with the dimension of each', async () => {
  const site = await scanSite(await folderWith(DIMENSION_SITE));
  const script = searchScript(site);
  expect(script).toMatch(/^self\.nerddocsSearch=\{.*\};$/s);
  expect(JSON.parse(script.slice('self.nerddocsSearch='.length, -1))).toEqual({ pages: pagesOf(script) });

  const pages = pagesOf(script);
  expect(pages.map((page) => [page.url, page.dimension])).toEqual([
    ['/user-guide/index.html', 'user-guide'],
    ['/user-guide/backups/restore.html', 'user-guide'],
    ['/user-guide/backups/schedules.html', 'user-guide'],
    ['/administration/install.html', 'administration'],
    ['/administration/users.html', 'administration'],
    ['/legal/privacy.html', 'legal'],
  ]);
  expect(pages.map((page) => page.url)).toEqual(site.pages.map((page) => page.url));
  for (const [at, page] of site.pages.entries()) {
    expect(pages[at]).toEqual({
      url: page.url,
      title: page.title,
      dimension: expect.any(String),
      parts: page.parts,
      hasSharedText: page.hasSharedText,
      units: page.search,
    });
  }
  expect(pages[1]).toMatchObject({ title: 'Restore a file', parts: ['overview', 'internals'], hasSharedText: false });
  expect(pages[1]!.units.map((unit) => [unit.text, unit.levels])).toEqual([
    ['Pick a file and a day.', 'overview'],
    ['A restore is a job on the storage server.', 'internals'],
  ]);
});

test('on a site with no dimensions, each page has no dimension', async () => {
  const site = await scanSite(
    await folderWith({
      'nerddocs.json': THREE_LEVELS,
      'restore.md': '# Restore a file\n\nA restore never changes the copy.\n\n::: internals\nA restore is a job.\n:::\n',
      'storage.md': '# Storage\n\nBlocks are stored once.\n',
    }),
  );
  expect(pagesOf(searchScript(site))).toEqual([
    {
      url: '/restore.html',
      title: 'Restore a file',
      dimension: null,
      parts: ['internals'],
      hasSharedText: true,
      units: [
        { text: 'A restore never changes the copy.', levels: null, headingId: null, heading: null },
        { text: 'A restore is a job.', levels: 'internals', headingId: null, heading: null },
      ],
    },
    {
      url: '/storage.html',
      title: 'Storage',
      dimension: null,
      parts: [],
      hasSharedText: true,
      units: [{ text: 'Blocks are stored once.', levels: null, headingId: null, heading: null }],
    },
  ]);
});

test('the script holds no <, and the text keeps each < it had', async () => {
  const site = await scanSite(
    await folderWith({
      'nerddocs.json': '{"levels":false}',
      'restore.md': '# Restore `<a>` file\n\nThe tag `</script><b>` ends a script.\n',
    }),
  );
  const script = searchScript(site);
  expect(script).not.toContain('<');
  const [page] = pagesOf(script);
  expect(page!.title).toBe('Restore <a> file');
  expect(page!.units[0]!.text).toBe('The tag </script><b> ends a script.');
});
