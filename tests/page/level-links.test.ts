import { expect, test } from '@playwright/test';
import { iconLevel, type LinkPage } from '../../src/page/level-links.ts';

const SCHEDULES = '/user-guide/backups/schedules.html';
const RESTORE = '/user-guide/backups/restore.html';

/** The open page 'Schedules', with a link to a heading of 'Restore a file' at two levels and to its own heading at one level. */
const PAGE: LinkPage = {
  url: SCHEDULES,
  levels: [
    { id: 'overview', name: 'Overview', icon: 'eye' },
    { id: 'requirements', name: 'Requirements', icon: 'list' },
    { id: 'internals', name: 'Internals', icon: 'cpu' },
  ],
  linkLevels: {
    [`${RESTORE}#pick-a-day`]: 'overview internals',
    [`${SCHEDULES}#search-index`]: 'internals',
  },
};

/** The reader's level of 'Restore a file' and of 'Schedules'. */
const readerAt = (restore: string, schedules: string) => (url: string) => (url === RESTORE ? restore : url === SCHEDULES ? schedules : 'none');

test.describe('the level whose icon a link shows', () => {
  test("a link with a level in its hash shows it when 'Restore a file' opens at another level for this reader, whatever the current level", () => {
    expect(iconLevel('restore.html#internals/pick-a-day', PAGE, 'internals', readerAt('overview', 'internals'))).toBe('internals');
    expect(iconLevel('restore.html#internals/pick-a-day', PAGE, 'overview', readerAt('internals', 'overview'))).toBeNull();
    expect(iconLevel('restore.html#overview/pick-a-day', PAGE, 'internals', readerAt('overview', 'internals'))).toBeNull();
  });

  test('a link to a heading that shows at every level shows no icon', () => {
    expect(iconLevel('restore.html#keys', PAGE, 'overview', readerAt('overview', 'overview'))).toBeNull();
    expect(iconLevel('restore.html#keys', PAGE, 'internals', readerAt('overview', 'internals'))).toBeNull();
  });

  test('a link in linkLevels shows the level it lands at from the current level, when that differs from the level its page opens at', () => {
    expect(iconLevel('restore.html#pick-a-day', PAGE, 'requirements', readerAt('requirements', 'requirements'))).toBe('overview');
    expect(iconLevel('restore.html#pick-a-day', PAGE, 'internals', readerAt('overview', 'internals'))).toBe('internals');
    expect(iconLevel('restore.html#pick-a-day', PAGE, 'internals', readerAt('internals', 'internals'))).toBeNull();
    expect(iconLevel('restore.html#pick-a-day', PAGE, 'overview', readerAt('overview', 'overview'))).toBeNull();
  });

  test('a link to the open page compares with the level that the reader level gives for the open page', () => {
    expect(iconLevel('#search-index', PAGE, 'overview', readerAt('internals', 'overview'))).toBe('internals');
    expect(iconLevel('#search-index', PAGE, 'internals', readerAt('overview', 'internals'))).toBeNull();
  });

  test('the reader level is asked for the address of the target page, with no hash', () => {
    for (const [href, target] of [
      ['restore.html#internals/pick-a-day', RESTORE],
      ['../backups/restore.html#pick-a-day', RESTORE],
      ['#search-index', SCHEDULES],
    ] as const) {
      const asked: string[] = [];
      iconLevel(href, PAGE, 'overview', (url) => {
        asked.push(url);
        return 'requirements';
      });
      expect([...new Set(asked)], href).toEqual([target]);
    }
  });

  test('a link that leaves the site or names no hash shows no icon', () => {
    for (const href of ['https://backups.example/restore.html#internals/pick-a-day', 'restore.html', 'mailto:help@backups.example']) {
      expect(iconLevel(href, PAGE, 'overview', readerAt('requirements', 'requirements')), href).toBeNull();
    }
  });
});
