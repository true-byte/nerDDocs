import { expect, test } from '@playwright/test';
import type { Dimension, Level } from '../../src/site/config.ts';
import { neighbors } from '../../src/site/neighbors.ts';
import { scanSite, type Page, type Site, type TreeNode } from '../../src/site/scan.ts';
import { DIMENSION_SITE, DIMENSION_TREE, DIMENSIONS, RESTORE } from '../support/dimensions.ts';
import { folderWith } from '../support/folder.ts';

const LEVELS: Level[] = [
  { id: 'overview', name: 'Overview' },
  { id: 'requirements', name: 'Requirements' },
  { id: 'internals', name: 'Internals' },
];

/** At this speed 60 words take one minute. */
const WORDS_PER_MINUTE = 60;

/** The pages of a tree in its order, the page of a folder before the rows under it. */
function pagesIn(nodes: readonly TreeNode[]): { url: string; title: string }[] {
  return nodes.flatMap((node) =>
    node.kind === 'page' ? [node] : [...(node.url ? [{ url: node.url, title: node.title }] : []), ...pagesIn(node.children)],
  );
}

/** A page with shared text and these words at each entry of its sizes. */
function pageOf(url: string, title: string, words: Record<string, number>): Page {
  return {
    url,
    source: title,
    title,
    titleId: '',
    html: `<p>${title}</p>`,
    unknownLevels: [],
    parts: [],
    hasShared: true,
    hasSharedText: true,
    sizes: Object.fromEntries(Object.entries(words).map(([level, count]) => [level, { words: count, images: 0 }])),
    outline: [],
    uses: [],
    problems: [],
    diagrams: 'none',
    anchors: {},
    links: [],
    search: [],
  };
}

/** A site of the pages of `tree`, each with 60 words at each level unless `words` gives its own. */
function siteOf(
  tree: TreeNode[],
  { levels = LEVELS, dimensions = [], words = {} }: { levels?: Level[]; dimensions?: Dimension[]; words?: Record<string, Record<string, number>> } = {},
): Site {
  const ids = ['', ...levels.map((level) => level.id)];
  const each = Object.fromEntries(ids.map((id) => [id, WORDS_PER_MINUTE]));
  return {
    name: 'Backup app',
    tree,
    pages: pagesIn(tree).map(({ url, title }) => pageOf(url, title, words[url] ?? each)),
    folders: [],
    used: [],
    levels,
    defaultLevel: levels[0]?.id ?? '',
    configProblem: null,
    wordsPerMinute: WORDS_PER_MINUTE,
    dimensions,
  };
}

/** A page, a folder with a page, a folder with no page inside it, and a last page. */
const TREE: TreeNode[] = [
  { kind: 'page', url: '/start.html', title: 'Get started' },
  {
    kind: 'section',
    id: 'backups',
    title: 'Backups',
    url: '/backups/index.html',
    children: [
      { kind: 'page', url: '/backups/restore.html', title: 'Restore a file' },
      { kind: 'page', url: '/backups/schedules.html', title: 'Schedules' },
      {
        kind: 'section',
        id: 'backups/plans',
        title: 'Plans',
        children: [{ kind: 'page', url: '/backups/plans/team.html', title: 'Team plan' }],
      },
    ],
  },
  { kind: 'page', url: '/storage.html', title: 'Storage' },
];

const ONE_MINUTE = { overview: 1, requirements: 1, internals: 1 };
const urls = (found: ReturnType<typeof neighbors>) => [found.previous?.url ?? null, found.next?.url ?? null];

test.describe('the page before and the page after', () => {
  const site = siteOf(TREE);

  test('they follow the order of the Contents tree, with the page of a folder before the rows under it', () => {
    expect(urls(neighbors(site, '/backups/index.html'))).toEqual(['/start.html', '/backups/restore.html']);
    expect(neighbors(site, '/backups/restore.html')).toEqual({
      previous: { url: '/backups/index.html', title: 'Backups', minutes: ONE_MINUTE },
      next: { url: '/backups/schedules.html', title: 'Schedules', minutes: ONE_MINUTE },
    });
  });

  test('a folder with no page is skipped, and the pages in it keep their place', () => {
    expect(urls(neighbors(site, '/backups/schedules.html'))).toEqual(['/backups/restore.html', '/backups/plans/team.html']);
    expect(urls(neighbors(site, '/backups/plans/team.html'))).toEqual(['/backups/schedules.html', '/storage.html']);
  });

  test('the first page has no previous page, and the last page has no next page', () => {
    expect(neighbors(site, '/start.html').previous).toBeNull();
    expect(neighbors(site, '/start.html').next?.url).toBe('/backups/index.html');
    expect(neighbors(site, '/storage.html').previous?.url).toBe('/backups/plans/team.html');
    expect(neighbors(site, '/storage.html').next).toBeNull();
  });

  test('a site of one page gives neither', () => {
    expect(neighbors(siteOf([{ kind: 'page', url: '/start.html', title: 'Get started' }]), '/start.html')).toEqual({
      previous: null,
      next: null,
    });
  });
});

test.describe('the minutes of a neighbor', () => {
  test('they are the minutes of its page at each level id, rounded up as the read time counts them', () => {
    const site = siteOf(TREE, {
      words: { '/backups/schedules.html': { '': 400, overview: 60, requirements: 61, internals: 180 } },
    });
    expect(neighbors(site, '/backups/restore.html').next?.minutes).toEqual({ overview: 1, requirements: 2, internals: 3 });
  });

  test("on a site with fewer than two levels, the key is ''", () => {
    const words = { '/storage.html': { '': 120, overview: 60 } };
    for (const levels of [[], LEVELS.slice(0, 1)]) {
      const site = siteOf(TREE, { levels, words });
      expect(neighbors(site, '/backups/plans/team.html').next?.minutes, `${levels.length} levels`).toEqual({ '': 2 });
    }
  });
});

test.describe('on a site with dimensions', () => {
  const site = siteOf(DIMENSION_TREE, { dimensions: DIMENSIONS });

  test('the order stays inside the dimension of the page', () => {
    expect(urls(neighbors(site, '/user-guide/index.html'))).toEqual([null, RESTORE]);
    expect(urls(neighbors(site, RESTORE))).toEqual(['/user-guide/index.html', '/user-guide/backups/schedules.html']);
    expect(urls(neighbors(site, '/user-guide/backups/schedules.html'))).toEqual([RESTORE, null]);
    expect(urls(neighbors(site, '/administration/install.html'))).toEqual([null, '/administration/users.html']);
    expect(urls(neighbors(site, '/administration/users.html'))).toEqual(['/administration/install.html', null]);
  });

  test('the only page of a dimension has neither neighbor', () => {
    expect(neighbors(site, '/legal/privacy.html')).toEqual({ previous: null, next: null });
  });

  test('a scan of the folder gives the titles of the tree and the minutes of the read time, with 0 at a level with no text', async () => {
    const scanned = await scanSite(await folderWith(DIMENSION_SITE));
    expect(neighbors(scanned, '/user-guide/index.html')).toEqual({
      previous: null,
      next: { url: RESTORE, title: 'Restore a file', minutes: { overview: 1, requirements: 0, internals: 1 } },
    });
    expect(neighbors(scanned, '/user-guide/backups/schedules.html')).toEqual({
      previous: { url: RESTORE, title: 'Restore a file', minutes: { overview: 1, requirements: 0, internals: 1 } },
      next: null,
    });
  });
});
