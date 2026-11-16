import { expect, test } from '@playwright/test';
import { problemBlock, shownPath, useColor, type PrintOptions } from '../../src/cli/problem-block.ts';
import type { Problem } from '../../src/site/problems.ts';
import { placeIn, sgrText, styleOf } from '../support/sgr.ts';

/** The backup app: its docs folder sits in the folder that the command runs in. */
const OPTIONS: PrintOptions = {
  folder: '/home/ana/backup-app/docs',
  cwd: '/home/ana/backup-app',
  color: false,
  levelNames: { overview: 'Overview', requirements: 'Requirements', internals: 'Internals' },
};
const COLOR = { ...OPTIONS, color: true };

function problem(fields: Partial<Problem> & Pick<Problem, 'name' | 'file'>): Problem {
  return { line: null, column: null, length: 0, text: null, fence: null, value: '', levels: [], mark: null, page: null, key: '', ...fields };
}

/** The problems of the approved terminal mock, `.tmp/author-checks/terminal.html`, with the block that each prints. */
const MOCK: [Problem, string][] = [
  [
    problem({
      name: 'Missing page',
      file: 'user-guide/index.md',
      line: 9,
      column: 26,
      length: 10,
      text: 'Read [the upgrade steps](upgrade.md) before you start.',
      value: 'upgrade.md',
      page: '/user-guide/index.html',
    }),
    [
      'docs/user-guide/index.md:9  Missing page  upgrade.md',
      '   9 │ Read [the upgrade steps](upgrade.md) before you start.',
      '     │                          ^^^^^^^^^^',
    ].join('\n'),
  ],
  [
    problem({
      name: 'Empty heading',
      file: 'user-guide/01-backups/01-restore.md',
      line: 22,
      column: 1,
      length: 13,
      text: '## Pick a day',
      fence: { line: 24, text: '::: internals' },
      levels: ['overview'],
      page: '/user-guide/backups/restore.html',
    }),
    [
      'docs/user-guide/01-backups/01-restore.md:22  Empty heading  Overview',
      '  22 │ ## Pick a day',
      '     │ ^^^^^^^^^^^^^',
      '  24 │ ::: internals',
    ].join('\n'),
  ],
  [
    problem({
      name: 'Missing file',
      file: 'user-guide/01-backups/01-restore.md',
      line: 40,
      column: 23,
      length: 18,
      text: '![The restore window](restore-window.png)',
      value: 'restore-window.png',
      page: '/user-guide/backups/restore.html',
    }),
    [
      'docs/user-guide/01-backups/01-restore.md:40  Missing file  restore-window.png',
      '  40 │ ![The restore window](restore-window.png)',
      '     │                       ^^^^^^^^^^^^^^^^^^',
    ].join('\n'),
  ],
  [
    problem({
      name: 'Missing heading',
      file: 'user-guide/01-backups/02-schedules.md',
      line: 11,
      column: 26,
      length: 25,
      text: 'See [the rule for a day](01-restore.md#pick-a-time).',
      value: '01-restore.md#pick-a-time',
      page: '/user-guide/backups/schedules.html',
    }),
    [
      'docs/user-guide/01-backups/02-schedules.md:11  Missing heading  01-restore.md#pick-a-time',
      '  11 │ See [the rule for a day](01-restore.md#pick-a-time).',
      '     │                          ^^^^^^^^^^^^^^^^^^^^^^^^^',
    ].join('\n'),
  ],
  [
    problem({ name: 'Empty page', file: 'administration/03-users.md', line: 1, column: 1, length: 7, text: '# Users', page: '/administration/users.html' }),
    ['docs/administration/03-users.md:1  Empty page', '   1 │ # Users', '     │ ^^^^^^^'].join('\n'),
  ],
];

test('a path inside the folder that the command runs in prints relative to it, and that folder prints as .', () => {
  expect(shownPath('/home/ana/backup-app/docs/user-guide/index.md', '/home/ana/backup-app')).toBe('docs/user-guide/index.md');
  expect(shownPath('/home/ana/backup-app/docs', '/home/ana/backup-app')).toBe('docs');
  expect(shownPath('/home/ana/backup-app/docs/nerddocs.json', '/home/ana/backup-app/docs')).toBe('nerddocs.json');
  expect(shownPath('/home/ana/backup-app', '/home/ana/backup-app')).toBe('.');
});

test('a path outside the folder that the command runs in prints in full', () => {
  expect(shownPath('/home/ana/notes/plan.md', '/home/ana/backup-app')).toBe('/home/ana/notes/plan.md');
  expect(shownPath('/home/ana', '/home/ana/backup-app')).toBe('/home/ana');
  expect(shownPath('/home/ana/backup-app-old/docs', '/home/ana/backup-app')).toBe('/home/ana/backup-app-old/docs');
  expect(shownPath('/srv/backup-docs/restore.md', '/home/ana/backup-app')).toBe('/srv/backup-docs/restore.md');
});

test('the path of a block of a folder outside the folder that the command runs in prints in full', () => {
  const outside = { ...OPTIONS, folder: '/srv/backup-docs' };
  expect(problemBlock(MOCK[0]![0], outside).split('\n')[0]).toBe('/srv/backup-docs/user-guide/index.md:9  Missing page  upgrade.md');
  expect(problemBlock(problem({ name: 'Missing config', file: 'nerddocs.json' }), outside)).toBe('/srv/backup-docs/nerddocs.json  Missing config');
});

test('each block of the approved terminal mock prints as the mock shows it', () => {
  for (const [found, block] of MOCK) expect(problemBlock(found, OPTIONS), found.name).toBe(block);
});

test('a problem with no line prints its head alone, with its value when it has one', () => {
  expect(problemBlock(problem({ name: 'Missing config', file: 'nerddocs.json' }), OPTIONS)).toBe('docs/nerddocs.json  Missing config');
  expect(problemBlock(problem({ name: 'Unknown icon', file: 'nerddocs.json', value: 'rocket' }), OPTIONS)).toBe(
    'docs/nerddocs.json  Unknown icon  rocket',
  );
  expect(problemBlock(problem({ name: 'Missing dimension', file: 'nerddocs.json', value: 'archive' }), OPTIONS)).toBe(
    'docs/nerddocs.json  Missing dimension  archive',
  );
  expect(problemBlock(problem({ name: 'Outside dimensions', file: 'drafts' }), OPTIONS)).toBe('docs/drafts  Outside dimensions');
  expect(problemBlock(problem({ name: 'Cannot read', file: '' }), OPTIONS)).toBe('docs  Cannot read');
});

test('a problem with a line and no column prints its source line and no carets', () => {
  const bad = problem({ name: 'Bad OpenAPI', file: 'api/openapi.yaml', line: 9, text: '  - token: []]', page: '/api.html' });
  expect(problemBlock(bad, OPTIONS)).toBe('docs/api/openapi.yaml:9  Bad OpenAPI\n   9 │   - token: []]');
  const tag = problem({ name: 'Unknown tag', file: 'api.md', line: 3, text: '![Backup API](api/openapi.yaml#Archive)', value: 'Archive', page: '/api.html' });
  expect(problemBlock(tag, OPTIONS)).toBe('docs/api.md:3  Unknown tag  Archive\n   3 │ ![Backup API](api/openapi.yaml#Archive)');
});

test('a level problem that breaks at every level prints no level names', () => {
  const empty = problem({ name: 'Empty heading', file: 'restore.md', line: 5, column: 1, length: 13, text: '## Pick a day' });
  expect(problemBlock(empty, OPTIONS)).toBe('docs/restore.md:5  Empty heading\n   5 │ ## Pick a day\n     │ ^^^^^^^^^^^^^');
});

test('a tab of the text prints as one space, and a line number takes 4 characters', () => {
  const tab = problem({ name: 'Missing page', file: 'restore.md', line: 1234, column: 11, length: 7, text: '\tSee [it](undo.md).', value: 'undo.md' });
  expect(problemBlock(tab, OPTIONS)).toBe(
    ['docs/restore.md:1234  Missing page  undo.md', '1234 │  See [it](undo.md).', '     │           ^^^^^^^'].join('\n'),
  );
});

test('without color a block holds no escape code', () => {
  for (const [found] of MOCK) expect(problemBlock(found, OPTIONS)).not.toMatch(/\x1b/);
});

test('with color, each part of a block takes its SGR codes, and the text shows the same', () => {
  for (const [found, block] of MOCK) expect(sgrText(problemBlock(found, COLOR)).plain, found.name).toBe(block);

  const heading = problemBlock(MOCK[1]![0], COLOR);
  expect(styleOf(heading, 'docs/user-guide/01-backups/01-restore.md:22')).toEqual(['36 4']);
  expect(styleOf(heading, 'Empty heading')).toEqual(['1 31']);
  expect(styleOf(heading, 'Overview')).toEqual(['1']);
  expect(styleOf(heading, '  22 │')).toEqual(['2']);
  expect(styleOf(heading, '## Pick a day')).toEqual(['']);
  expect(styleOf(heading, '│', placeIn(heading, '\n', '## Pick a day'))).toEqual(['2']);
  expect(styleOf(heading, '^^^^^^^^^^^^^')).toEqual(['31']);
  expect(styleOf(heading, '  24 │ ::: internals')).toEqual(['2']);

  const missing = problemBlock(MOCK[0]![0], COLOR);
  expect(styleOf(missing, 'docs/user-guide/index.md:9')).toEqual(['36 4']);
  expect(styleOf(missing, 'Missing page')).toEqual(['1 31']);
  expect(styleOf(missing, 'upgrade.md')).toEqual(['33']);
});

test('color is on for a TTY while NO_COLOR is unset or empty', () => {
  expect(useColor({ isTTY: true }, {})).toBe(true);
  expect(useColor({ isTTY: true }, { NO_COLOR: '' })).toBe(true);
  expect(useColor({ isTTY: true }, { NO_COLOR: '1' })).toBe(false);
  expect(useColor({ isTTY: false }, {})).toBe(false);
  expect(useColor({}, {})).toBe(false);
});
