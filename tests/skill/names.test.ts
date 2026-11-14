import { expect, test } from '@playwright/test';
import { PROBLEM_NAMES } from '../../src/cli/terminal-error.ts';
import { LEVEL_PATHS } from '../../src/page/icons.tsx';
import type { Config } from '../../src/site/config.ts';
import { eachNode, markdownTree, readSkillFile, textOf, type MdNode } from '../support/skill.ts';

// The keys of each object of nerddocs.json that the code reads. The type check fails when `Config` gains a key
// that a list lacks, or loses one that a list holds.
const TOP_KEYS: Record<keyof Config, true> = {
  levels: true,
  defaultLevel: true,
  wordsPerMinute: true,
  textWidth: true,
  dimensions: true,
};
const LEVEL_KEYS: Record<keyof Config['levels'][number], true> = { id: true, name: true, icon: true };
const DIMENSION_KEYS: Record<keyof NonNullable<Config['dimensions']>[number], true> = { folder: true, name: true };
const CONFIG_KEYS = [...new Set([TOP_KEYS, LEVEL_KEYS, DIMENSION_KEYS].flatMap((keys) => Object.keys(keys)))];

/** The names of a cell: each of its inline codes, or else its text without the quotes around it. */
function namesIn(cell: MdNode): string[] {
  const code = (cell.children ?? []).filter((node) => node.type === 'inlineCode').map(textOf);
  return code.length ? code : [textOf(cell).trim().replace(/^'(.*)'$/, '$1')];
}

const firstCell = (row: MdNode | undefined): MdNode => row?.children?.[0] ?? { type: 'tableCell' };

/** The names in the first column of each table of `format.md` whose first header is `header`. */
async function listedNames(header: string): Promise<string[]> {
  const names: string[] = [];
  eachNode(markdownTree(await readSkillFile('format.md')), (node) => {
    if (node.type !== 'table') return;
    const [head, ...rows] = node.children ?? [];
    if (textOf(firstCell(head)).trim() !== header) return;
    for (const row of rows) names.push(...namesIn(firstCell(row)));
  });
  return names;
}

/** The names that the code knows and the tables leave out, and the names that the tables list and the code does not know. */
async function difference(header: string, known: readonly string[]) {
  const listed = await listedNames(header);
  return {
    notInFormat: known.filter((name) => !listed.includes(name)),
    notInCode: [...new Set(listed)].filter((name) => !known.includes(name)),
  };
}

const SAME = { notInFormat: [], notInCode: [] };

test('the tables of format.md with the header Icon list exactly the level icons of the code', async () => {
  expect(await difference('Icon', Object.keys(LEVEL_PATHS))).toEqual(SAME);
});

test('the tables of format.md with the header Key list exactly the keys of nerddocs.json that the code reads', async () => {
  expect(await difference('Key', CONFIG_KEYS)).toEqual(SAME);
});

test('the tables of format.md with the header Problem list exactly the problem names of the code', async () => {
  expect(await difference('Problem', PROBLEM_NAMES)).toEqual(SAME);
});
