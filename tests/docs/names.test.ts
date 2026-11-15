import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Args } from '../../src/cli/args.ts';
import { PROBLEM_NAMES } from '../../src/cli/terminal-error.ts';
import { wrapFences } from '../../src/markdown/fences.ts';
import { LEVEL_PATHS } from '../../src/page/icons.tsx';
import type { Config } from '../../src/site/config.ts';
import type { Site } from '../../src/site/scan.ts';
import { THEMES } from '../../src/themes/index.ts';
import { docsSite } from '../support/docs.ts';
import { eachNode, markdownTree } from '../support/skill.ts';

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

// The first argument that gives each command, or null for the command with no word of its own. The type check fails
// when `Args` gains a command that this list lacks.
const COMMAND_WORDS: Record<Args['command'], string | null> = { serve: null, check: 'check' };

/** Each flag that src/cli/args.ts compares an argument with, such as `--no-open`, without the `=` of `--port=`. */
async function flagsOfCommand(): Promise<string[]> {
  const source = await readFile(join(import.meta.dirname, '../../src/cli/args.ts'), 'utf8');
  return [...new Set([...source.matchAll(/'(--[a-z][a-z-]*)=?'/g)].map(([, flag]) => flag!))];
}

/** Each word of the inline code of the pages, so `--port <port>` gives `--port` and `<port>`. */
function codeWords(site: Site): Set<string> {
  const ids = site.levels.map((level) => level.id);
  const words = new Set<string>();
  for (const page of site.pages) {
    eachNode(markdownTree(wrapFences(page.source, ids).markdown), (node) => {
      if (node.type === 'inlineCode') for (const word of node.value!.split(/\s+/)) words.add(word);
    });
  }
  return words;
}

/** The names that no inline code of the pages holds as a word. */
async function notInCode(names: readonly string[]): Promise<string[]> {
  const words = codeWords(await docsSite());
  return names.filter((name) => !words.has(name));
}

/** The names that the text of no page holds. */
async function notInText(names: readonly string[]): Promise<string[]> {
  const { pages } = await docsSite();
  return names.filter((name) => !pages.some((page) => page.source.includes(name)));
}

test('the docs name in code each key of nerddocs.json that the code reads', async () => {
  expect(await notInCode(CONFIG_KEYS)).toEqual([]);
});

test('the docs name in code each argument of the command', async () => {
  const flags = await flagsOfCommand();
  expect(flags, 'src/cli/args.ts names flags').not.toEqual([]);
  const words = Object.values(COMMAND_WORDS).filter((word) => word !== null);
  expect(await notInCode([...words, ...flags])).toEqual([]);
});

test('the docs name in code each level icon', async () => {
  expect(await notInCode(Object.keys(LEVEL_PATHS))).toEqual([]);
});

test('the docs name each theme by the name that the theme box shows', async () => {
  expect(await notInText(THEMES.map((theme) => theme.name))).toEqual([]);
});

test('the docs name each problem of the check', async () => {
  expect(await notInText(PROBLEM_NAMES)).toEqual([]);
});
