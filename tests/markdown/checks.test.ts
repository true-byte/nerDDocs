import { expect, test } from '@playwright/test';
import { renderMarkdown } from '../../src/markdown/render.ts';
import type { PageProblem } from '../../src/site/problems.ts';
import { fakeFiles } from '../support/images.ts';

const LISTED = ['overview', 'requirements', 'internals'];
const FILE = 'backups/restore.md';
const CHECKS = ['Empty page', 'Empty heading'];

/** The problems of the checks that the page gives, built with the files of the folder. */
function checksOf(lines: string[], listed: readonly string[] = LISTED): PageProblem[] {
  const page = renderMarkdown(lines.join('\n'), '/backups/restore.html', 'Restore', listed, fakeFiles({}, FILE));
  return page.problems.filter((problem) => CHECKS.includes(problem.name));
}

/** A problem of a check on the line `line` of `lines`, with its column at the first place of `words` in any case. */
function check(
  name: PageProblem['name'],
  lines: string[],
  line: number,
  fields: { words: string | null; block: number; inner?: number | null; levels: string[]; fence?: number | null },
): PageProblem {
  const text = lines[line - 1]!;
  const words = fields.words;
  const fence = fields.fence ?? null;
  return {
    name,
    file: FILE,
    line,
    column: words === null ? 1 : text.toLowerCase().indexOf(words.toLowerCase()) + 1,
    length: words === null ? text.trimEnd().length : words.length,
    text,
    fence: fence === null ? null : { line: fence, text: lines[fence - 1]! },
    value: '',
    levels: fields.levels,
    mark: { block: fields.block, inner: fields.inner ?? null, words },
  };
}

test.describe('Empty page', () => {
  test('a page with only its title breaks at every level, at the title line with the title marked', () => {
    const lines = ['# Users', ''];
    expect(checksOf(lines)).toEqual([
      { name: 'Empty page', file: FILE, line: 1, column: 1, length: 7, text: '# Users', fence: null, value: '', levels: [], mark: null },
    ]);
  });

  test('the mark of the title leaves out the end spaces, and the title line counts from the top of the file', () => {
    const [spaces] = checksOf(['# Users   ', '']);
    expect(spaces).toMatchObject({ line: 1, column: 1, length: 7, text: '# Users   ' });
    const [lower] = checksOf(['', '', '# Users', '']);
    expect(lower).toMatchObject({ name: 'Empty page', line: 3, column: 1, length: 7, text: '# Users' });
  });

  test('a page with no title is empty at line 1', () => {
    const [empty] = checksOf(['']);
    expect(empty).toMatchObject({ name: 'Empty page', line: 1, mark: null, levels: [] });
  });

  test('a page of headings only is empty, and gives no Empty heading', () => {
    expect(checksOf(['# Users', '', '## Roles', '', '### Admins', '']).map((problem) => problem.name)).toEqual(['Empty page']);
  });

  test('a page with text at one level only is not empty', () => {
    expect(checksOf(['# Users', '', '::: internals', 'Each user has a role.', ':::', ''])).toEqual([]);
  });

  test('a page of a site with no levels is empty the same way', () => {
    expect(checksOf(['# Users', ''], []).map((problem) => [problem.name, problem.levels])).toEqual([['Empty page', []]]);
  });

  test('a page built with no files has no problems', () => {
    expect(renderMarkdown('# Users\n', '/users.html', 'Users', LISTED).problems).toEqual([]);
  });
});

test.describe('Empty heading', () => {
  test('a heading in a part with no text after it at its level breaks at that level, with the fence of the part after it', () => {
    const lines = [
      '# Restore a file', // 1
      '',
      'Pick a file.', // 3
      '',
      '::: overview', // 5
      '## Pick a day', // 6
      '::: requirements internals', // 7
      '## Pick a day', // 8
      '',
      'Click a day on the calendar.', // 10
      ':::',
      '',
      '## Check the file', // 13
      '',
      'Open the file and check it.', // 15
      '',
    ];
    expect(checksOf(lines)).toEqual([check('Empty heading', lines, 6, { words: null, block: 1, inner: 0, levels: ['overview'], fence: 7 })]);
  });

  test('a shared heading with no text before the next heading of its rank breaks at every level', () => {
    const lines = ['# Restore a file', '', 'Pick a file.', '', '## Pick a day', '', '## Check the file', '', 'Open the file and check it.', ''];
    expect(checksOf(lines)).toEqual([check('Empty heading', lines, 5, { words: null, block: 1, levels: [] })]);
  });

  test('a heading at the end of the page is empty', () => {
    const lines = ['# Restore a file', '', 'Pick a file.', '', '## Notes', ''];
    expect(checksOf(lines)).toEqual([check('Empty heading', lines, 5, { words: null, block: 1, levels: [] })]);
  });

  test('a heading of a lower rank with text after it fills the heading above it', () => {
    const lines = ['# Restore a file', '', 'Pick a file.', '', '## Pick a day', '', '### On the calendar', '', 'Click a day.', ''];
    expect(checksOf(lines)).toEqual([]);
  });

  test('a part that holds text at the level of the heading fills it', () => {
    const lines = ['# Restore a file', '', 'Pick a file.', '', '::: overview', '## Pick a day', ':::', '', '::: overview requirements', 'Click a day.', ':::', ''];
    expect(checksOf(lines).filter((problem) => problem.name === 'Empty heading').map((problem) => problem.levels)).toEqual([]);
  });
});

test('a sentence that points below, before a part hidden at a level, is no problem', () => {
  const lines = [
    '# Restore a file',
    '',
    'The rule below picks which copy comes back.',
    '',
    '::: internals',
    'The agent restores the newest copy of the day.',
    ':::',
    '',
    'Keep the restored file.',
    '',
  ];
  const page = renderMarkdown(lines.join('\n'), '/backups/restore.html', 'Restore', LISTED, fakeFiles({}, FILE));
  expect(page.problems).toEqual([]);
});
