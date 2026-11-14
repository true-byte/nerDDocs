import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { runCheck } from '../../src/cli/check.ts';
import { folderWith, NO_LEVELS } from '../support/folder.ts';
import { THREE_LEVELS } from '../support/levels.ts';
import { sgrText, styleOf } from '../support/sgr.ts';

/** Checks the folder `docs` of a backup app that holds the files, from the folder of the app, and gives the code and the report. */
async function check(files: Record<string, string>, color = false) {
  const app = await folderWith(Object.fromEntries(Object.entries(files).map(([name, text]) => [`docs/${name}`, text])));
  let report = '';
  const code = await runCheck(join(app, 'docs'), (text) => (report += text), { cwd: app, color });
  return { code, report };
}

const UNDO = 'To undo a restore, see [Undo a restore](undo.md).';

test('the report holds the folder, the page count, an empty line, each block with an empty line after it, and the count', async () => {
  const { code, report } = await check({
    'nerddocs.json': THREE_LEVELS,
    'restore.md': `# Restore a file\n\n${UNDO}\n`,
    'schedules.md': '# Schedules\n\nEach plan keeps its copies.\n\n::: overview requirements\n## Weekly plan\n::: internals\n## Weekly plan\n\nA weekly plan runs on Sunday.\n:::\n',
  });
  expect(code).toBe(1);
  expect(report).toBe(
    [
      'Folder: docs',
      'Pages: 2',
      '',
      'docs/restore.md:3  Missing page  undo.md',
      `   3 │ ${UNDO}`,
      `     │ ${' '.repeat(UNDO.indexOf('undo.md'))}^^^^^^^`,
      '',
      'docs/schedules.md:6  Empty heading  Overview, Requirements',
      '   6 │ ## Weekly plan',
      '     │ ^^^^^^^^^^^^^^',
      '   7 │ ::: internals',
      '',
      'Problems: 2',
      '',
    ].join('\n'),
  );
});

test('a folder outside the folder that the command runs in prints in full, in the folder line and in each block', async () => {
  const app = await folderWith({ 'docs/nerddocs.json': NO_LEVELS, 'docs/restore.md': `# Restore a file\n\n${UNDO}\n` });
  const docs = join(app, 'docs');
  let report = '';
  await runCheck(docs, (text) => (report += text), { cwd: join(app, 'site'), color: false });
  const lines = report.split('\n');
  expect(lines[0]).toBe(`Folder: ${docs}`);
  expect(lines[3]).toBe(`${join(docs, 'restore.md')}:3  Missing page  undo.md`);
});

test('with no problem the count follows the empty line, and the code is 0', async () => {
  const { code, report } = await check({ 'nerddocs.json': NO_LEVELS, 'restore.md': '# Restore a file\n\nPick a file.\n' });
  expect(report).toBe('Folder: docs\nPages: 1\n\nProblems: 0\n');
  expect(code).toBe(0);
});

test('without color the report holds no escape code, and with color the count is red with problems and green with none', async () => {
  const files = { 'nerddocs.json': NO_LEVELS, 'restore.md': `# Restore a file\n\n${UNDO}\n` };
  expect((await check(files)).report).not.toMatch(/\x1b/);

  const red = (await check(files, true)).report;
  expect(sgrText(red).plain).toBe((await check(files)).report);
  expect(styleOf(red, 'Problems: 1')).toEqual(['1 31']);
  expect(styleOf(red, 'docs/restore.md:3')).toEqual(['36 4']);

  const green = (await check({ 'nerddocs.json': NO_LEVELS, 'restore.md': '# Restore a file\n\nPick a file.\n' }, true)).report;
  expect(styleOf(green, 'Problems: 0')).toEqual(['32']);
});

test('the problems print in the order of the site, the ones with no page first', async () => {
  const { report } = await check({
    'nerddocs.json': '{"levels":[{"id":"overview","icon":"rocket"},{"id":"internals"}]}',
    'storage.md': '# Storage\n\nSee [the plans](plans.md).\n',
    'backups/restore.md': '# Restore a file\n',
  });
  const heads = report.split('\n').filter((line) => /^docs\//.test(line));
  expect(heads).toEqual([
    'docs/nerddocs.json  Unknown icon  rocket',
    'docs/backups/restore.md:1  Empty page',
    'docs/storage.md:3  Missing page  plans.md',
  ]);
  expect(report.endsWith('Problems: 3\n')).toBe(true);
});
