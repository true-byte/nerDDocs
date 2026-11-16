import { expect, test } from '@playwright/test';
import { FOLD_PAST, pathLabel, problemChanges, problemGroups, startsFolded } from '../../src/page/problem-list.ts';
import type { Problem } from '../../src/site/problems.ts';

function problem(fields: Partial<Problem> & Pick<Problem, 'name' | 'file' | 'key'>): Problem {
  return { line: null, column: null, length: 0, text: null, fence: null, value: '', levels: [], mark: null, page: null, ...fields };
}

const RESTORE = '/user-guide/backups/restore.html';
const SCHEDULES = '/user-guide/backups/schedules.html';
const TITLES = { [RESTORE]: 'Restore a file', [SCHEDULES]: 'Schedules' };

const ICON = problem({ name: 'Unknown icon', file: 'nerddocs.json', value: 'rocket', key: 'Unknown icon\tnerddocs.json\trocket\t\t0' });
const OUTSIDE = problem({ name: 'Outside dimensions', file: 'drafts', key: 'Outside dimensions\tdrafts\t\t\t0' });
const MISSING = problem({ name: 'Missing dimension', file: 'nerddocs.json', value: 'archive', key: 'Missing dimension\tnerddocs.json\tarchive\t\t0' });
const HEADING = problem({
  name: 'Missing heading',
  file: 'user-guide/backups/schedules.md',
  line: 11,
  value: '01-restore.md#pick-a-time',
  page: SCHEDULES,
  key: 'Missing heading\tuser-guide/backups/schedules.md\t01-restore.md#pick-a-time\tthe rule for a day\t0',
});
const EMPTY = problem({
  name: 'Empty heading',
  file: 'user-guide/backups/restore.md',
  line: 25,
  levels: ['overview', 'requirements'],
  page: RESTORE,
  key: 'Empty heading\tuser-guide/backups/restore.md\t\t\t0',
});
const UNDO = problem({
  name: 'Missing page',
  file: 'user-guide/backups/restore.md',
  line: 72,
  value: 'undo.md',
  page: RESTORE,
  key: 'Missing page\tuser-guide/backups/restore.md\tundo.md\tUndo a restore\t0',
});

test('the group of the open page comes first, then the other groups in the order of the list', () => {
  const groups = problemGroups([ICON, OUTSIDE, HEADING, EMPTY, MISSING, UNDO], RESTORE, TITLES);
  expect(groups).toEqual([
    { key: RESTORE, label: 'Restore a file', page: RESTORE, problems: [EMPTY, UNDO] },
    { key: 'nerddocs.json', label: 'nerddocs.json', page: null, problems: [ICON, MISSING] },
    { key: 'drafts', label: 'drafts', page: null, problems: [OUTSIDE] },
    { key: SCHEDULES, label: 'Schedules', page: SCHEDULES, problems: [HEADING] },
  ]);
});

test('with no problem on the open page, the groups keep the order of the list', () => {
  expect(problemGroups([HEADING, EMPTY], '/user-guide/index.html', TITLES).map((group) => group.label)).toEqual(['Schedules', 'Restore a file']);
  expect(problemGroups([], RESTORE, TITLES)).toEqual([]);
});

test('the changes of a list are the keys that it gained and the keys that it lost, each in the order of its list', () => {
  expect(problemChanges([HEADING, EMPTY], [HEADING, EMPTY, UNDO])).toEqual({ added: [UNDO.key], gone: [] });
  expect(problemChanges([HEADING, EMPTY, UNDO], [HEADING])).toEqual({ added: [], gone: [EMPTY.key, UNDO.key] });
  expect(problemChanges([ICON, EMPTY], [UNDO, ICON, HEADING])).toEqual({ added: [UNDO.key, HEADING.key], gone: [EMPTY.key] });
  expect(problemChanges([EMPTY], [{ ...EMPTY, line: 31 }])).toEqual({ added: [], gone: [] });
});

test('past FOLD_PAST problems, every new group but the one of the open page starts folded', () => {
  expect(FOLD_PAST).toBe(20);
  const [restore, schedules] = problemGroups([EMPTY, HEADING], RESTORE, TITLES);
  const config = problemGroups([ICON], RESTORE, TITLES)[0]!;
  expect(startsFolded(schedules!, FOLD_PAST, RESTORE)).toBe(false);
  expect(startsFolded(schedules!, FOLD_PAST + 1, RESTORE)).toBe(true);
  expect(startsFolded(config, FOLD_PAST + 1, RESTORE)).toBe(true);
  expect(startsFolded(restore!, FOLD_PAST + 1, RESTORE)).toBe(false);
});

test('the path of a row is the file name with the line, or the file name alone', () => {
  expect(pathLabel(EMPTY)).toBe('restore.md:25');
  expect(pathLabel({ ...HEADING, file: 'user-guide/backups/02-schedules.md' })).toBe('02-schedules.md:11');
  expect(pathLabel(ICON)).toBe('nerddocs.json');
  expect(pathLabel(OUTSIDE)).toBe('drafts');
});
