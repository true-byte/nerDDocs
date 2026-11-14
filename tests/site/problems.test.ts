import { expect, test } from '@playwright/test';
import { linkProblems, siteProblems, type Problem } from '../../src/site/problems.ts';
import { scanSite } from '../../src/site/scan.ts';
import { folderWith } from '../support/folder.ts';
import { THREE_LEVELS } from '../support/levels.ts';

const LEVEL_IDS = ['overview', 'requirements', 'internals'];

type Found = Omit<Problem, 'key'>;

function found(fields: Partial<Found> & Pick<Found, 'name' | 'file'>): Found {
  return { line: null, column: null, length: 0, text: null, fence: null, value: '', levels: [], mark: null, page: null, ...fields };
}

/** The first place of `part` in `text`, in any case, from 1. */
const columnOf = (text: string, part: string) => text.toLowerCase().indexOf(part.toLowerCase()) + 1;

const PAGES = ['/user-guide/index.html', '/user-guide/backups/restore.html', '/user-guide/backups/schedules.html'];
const RESTORE = { file: 'user-guide/backups/01-restore.md', page: '/user-guide/backups/restore.html' };
const SCHEDULES = { file: 'user-guide/backups/02-schedules.md', page: '/user-guide/backups/schedules.html' };
const INDEX = { file: 'user-guide/index.md', page: '/user-guide/index.html' };

test.describe('the order of the problems', () => {
  test('the problems with no page come first in the order found, then the problems of each page in the order of the pages', () => {
    const list = siteProblems(
      [
        found({ name: 'Missing page', ...SCHEDULES, line: 11, column: 26, length: 7, value: 'undo.md' }),
        found({ name: 'Unknown icon', file: 'nerddocs.json', value: 'rocket' }),
        found({ name: 'Missing file', ...RESTORE, line: 40, column: 23, length: 18, value: 'restore-window.png' }),
        found({ name: 'Outside dimensions', file: 'drafts' }),
        found({ name: 'Missing page', ...INDEX, line: 9, column: 26, length: 10, value: 'upgrade.md' }),
        found({ name: 'Missing dimension', file: 'nerddocs.json', value: 'archive' }),
      ],
      PAGES,
    );
    expect(list.map((problem) => [problem.name, problem.file, problem.value])).toEqual([
      ['Unknown icon', 'nerddocs.json', 'rocket'],
      ['Outside dimensions', 'drafts', ''],
      ['Missing dimension', 'nerddocs.json', 'archive'],
      ['Missing page', INDEX.file, 'upgrade.md'],
      ['Missing file', RESTORE.file, 'restore-window.png'],
      ['Missing page', SCHEDULES.file, 'undo.md'],
    ]);
  });

  test('within a page the problems go by line, then by column, with a null line or column first', () => {
    const list = siteProblems(
      [
        found({ name: 'Missing page', ...RESTORE, line: 25, column: 30, length: 7, value: 'undo.md' }),
        found({ name: 'Missing page', ...RESTORE, line: 25, column: 4, length: 7, value: 'redo.md' }),
        found({ name: 'Unknown tag', ...RESTORE, line: 25, column: null, value: 'Archive' }),
        found({ name: 'Missing file', ...RESTORE, line: 3, column: 19, length: 22, value: 'restore-window-old.png' }),
        found({ name: 'Bad OpenAPI', file: 'api/openapi.yaml', page: RESTORE.page }),
      ],
      PAGES,
    );
    expect(list.map((problem) => [problem.line, problem.column])).toEqual([
      [null, null],
      [3, 19],
      [25, null],
      [25, 4],
      [25, 30],
    ]);
  });

  test('problems at one line and column keep the order of the closed list', () => {
    const at = { ...RESTORE, line: 18, column: 1, length: 13 };
    const list = siteProblems(
      [
        found({ name: 'Empty heading', ...at, levels: ['overview'] }),
        found({ name: 'Missing heading', ...at, value: '#pick-a-day' }),
        found({ name: 'Missing page', ...at, value: 'undo.md' }),
        found({ name: 'Missing file', ...at, value: 'restore-window.png' }),
      ],
      PAGES,
    );
    expect(list.map((problem) => problem.name)).toEqual(['Missing file', 'Missing page', 'Missing heading', 'Empty heading']);
  });

  test('problems with the same name, file, line, column and value are one, at the first place', () => {
    const first = found({ name: 'Missing page', ...RESTORE, line: 25, column: 4, length: 7, value: 'undo.md', mark: { block: 3, inner: null, words: 'Undo' } });
    const again = { ...first, mark: { block: 3, inner: null, words: 'Undo it' } };
    const otherLine = { ...first, line: 31 };
    const list = siteProblems([first, again, otherLine], PAGES);
    expect(list.map(({ key: _key, ...rest }) => rest)).toEqual([first, otherLine]);
  });
});

test.describe('the key of a problem', () => {
  test('is the name, the file, the value and the words of the mark, joined by tabs, then the count of earlier problems with the same four', () => {
    const mark = { block: 3, inner: null, words: 'Undo a restore' };
    const list = siteProblems(
      [
        found({ name: 'Missing config', file: 'nerddocs.json' }),
        found({ name: 'Missing page', ...RESTORE, line: 25, column: 4, length: 7, value: 'undo.md', mark }),
        found({ name: 'Missing page', ...RESTORE, line: 31, column: 4, length: 7, value: 'undo.md', mark }),
        found({ name: 'Missing page', ...RESTORE, line: 40, column: 4, length: 7, value: 'undo.md', mark: { ...mark, words: 'Undo it' } }),
      ],
      PAGES,
    );
    expect(list.map((problem) => problem.key)).toEqual([
      'Missing config\tnerddocs.json\t\t\t0',
      `Missing page\t${RESTORE.file}\tundo.md\tUndo a restore\t0`,
      `Missing page\t${RESTORE.file}\tundo.md\tUndo a restore\t1`,
      `Missing page\t${RESTORE.file}\tundo.md\tUndo it\t0`,
    ]);
  });

  test('holds no line and no column, so a save that only moves a problem keeps its key', () => {
    const at = (line: number, column: number) =>
      siteProblems([found({ name: 'Missing page', ...SCHEDULES, line, column, length: 7, value: 'undo.md', mark: { block: 4, inner: null, words: 'Undo a restore' } })], PAGES)[0]!.key;
    expect(at(18, 56)).toBe(at(27, 3));
  });

  test('a problem with a mark of null words has empty words in its key', () => {
    const [heading] = siteProblems([found({ name: 'Empty heading', ...RESTORE, line: 22, column: 1, length: 13, mark: { block: 2, inner: null, words: null } })], PAGES);
    expect(heading!.key).toBe(`Empty heading\t${RESTORE.file}\t\t\t0`);
  });
});

test.describe('the link checks', () => {
  const RESTORE_PAGE = [
    '# Restore a file',
    '',
    '## Pick a day',
    '',
    'Click a day on the calendar.',
    '',
    '::: internals',
    '## Pick a time',
    '',
    'The agent picks the newest copy of the day.',
    ':::',
    '',
  ].join('\n');

  /** One link per paragraph, so the line of each link is its paragraph, and the index of each paragraph is its line less 3, halved. */
  const SCHEDULES_LINES = [
    '# Schedules', // 1
    '',
    'See [Restore a file](restore.md).', // 3: a page
    '',
    'To undo a restore, see [Undo a restore](undo.md).', // 5: Missing page
    '',
    'Pick [a day](restore.md#pick-a-day).', // 7: a heading
    '',
    'Pick [a time](restore.md#pick-a-time).', // 9: a heading at 'Internals' only
    '',
    'Pick [an hour](restore.md#pick-an-hour).', // 11: Missing heading
    '',
    'Read [the internals](restore.md#internals).', // 13: a level alone
    '',
    'At the overview, [the time](restore.md#overview/pick-a-time) is hidden.', // 15: Missing heading at that level
    '',
    'At the internals, [the time](restore.md#internals/pick-a-time) shows.', // 17: a heading at that level
    '',
    'The [title](restore.md#restore-a-file) opens the page.', // 19: the title
    '',
    'The [weekly plan](#weekly-plan) runs on Sunday.', // 21: a heading of this page
    '',
    'The [monthly plan](#monthly-plan) runs once a month.', // 23: Missing heading
    '',
    'Read [the old notes](../../../notes.md) first.', // 25: Missing page, out of the folder
    '',
    'Visit [the site](https://backup.example/undo.md), [mail us](mailto:ana@backup.example) or [the mirror](//mirror.example/undo.md).', // 27: never a spot
    '',
    'Open [the window](restore-window.png).', // 29: not checked
    '',
    '## Weekly plan', // 31
    '',
    'A weekly plan runs on Sunday.', // 33
    '',
  ];

  async function backupSite() {
    const folder = await folderWith({
      'nerddocs.json': THREE_LEVELS,
      'notes.md': '# Notes\n\nThe notes of the backup app.\n',
      'user-guide/backups/restore.md': RESTORE_PAGE,
      'user-guide/backups/schedules.md': SCHEDULES_LINES.join('\n'),
    });
    return scanSite(folder);
  }

  const linkAt = (name: Problem['name'], line: number, value: string, words: string): Found => {
    const text = SCHEDULES_LINES[line - 1]!;
    return {
      name,
      file: 'user-guide/backups/schedules.md',
      line,
      column: columnOf(text, value),
      length: value.length,
      text,
      fence: null,
      value,
      levels: [],
      mark: { block: (line - 3) / 2, inner: null, words },
      page: '/user-guide/backups/schedules.html',
    };
  };

  const WANTED = [
    linkAt('Missing page', 5, 'undo.md', 'Undo a restore'),
    linkAt('Missing heading', 11, 'restore.md#pick-an-hour', 'an hour'),
    linkAt('Missing heading', 15, 'restore.md#overview/pick-a-time', 'the time'),
    linkAt('Missing heading', 23, '#monthly-plan', 'monthly plan'),
    linkAt('Missing page', 25, '../../../notes.md', 'the old notes'),
  ];

  test('a link to no page or to an id that its page lacks at the level of the hash is a problem, in page order', async () => {
    const site = await backupSite();
    expect(linkProblems(site.pages, LEVEL_IDS)).toEqual(WANTED);
  });

  test('the problems of the site hold the link problems, each with its key', async () => {
    const site = await backupSite();
    const links = site.problems.filter((problem) => problem.name === 'Missing page' || problem.name === 'Missing heading');
    expect(links.map(({ key: _key, ...rest }) => rest)).toEqual(WANTED);
    expect(links[0]!.key).toBe('Missing page\tuser-guide/backups/schedules.md\tundo.md\tUndo a restore\t0');
  });

  test('a site with no problem but its links gives only the link problems', async () => {
    const site = await backupSite();
    expect(site.problems.map((problem) => problem.name)).toEqual(WANTED.map((problem) => problem.name));
  });

  test('a link to an id that its page shows at other levels only, and a hash with a level alone, are no problem', async () => {
    const folder = await folderWith({
      'nerddocs.json': THREE_LEVELS,
      'restore.md': RESTORE_PAGE,
      'storage.md': '# Storage\n\nSee [the time](restore.md#pick-a-time), [the internals](restore.md#internals) and [the overview](#overview).\n',
    });
    const site = await scanSite(folder);
    expect(linkProblems(site.pages, LEVEL_IDS)).toEqual([]);
  });

  test('the levels of the site decide what a hash names', async () => {
    const folder = await folderWith({
      'nerddocs.json': THREE_LEVELS,
      'restore.md': RESTORE_PAGE,
      'storage.md': '# Storage\n\nSee [the internals](restore.md#internals).\n',
    });
    const site = await scanSite(folder);
    expect(linkProblems(site.pages, LEVEL_IDS)).toEqual([]);
    expect(linkProblems(site.pages, ['overview']).map((problem) => [problem.name, problem.value])).toEqual([
      ['Missing heading', 'restore.md#internals'],
    ]);
  });
});
