import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { DEFAULT_THEME, THEMES } from '../../src/themes/index.ts';
import type { Theme } from '../../src/themes/types.ts';
import { REPO } from '../support/run-command.ts';

const THEMES_FOLDER = join(REPO, 'src/themes');

/** The folders of `src/themes/` that hold a `theme.ts`. */
const themeFolders = () =>
  readdirSync(THEMES_FOLDER, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(THEMES_FOLDER, entry.name, 'theme.ts')))
    .map((entry) => entry.name);

test('each folder of src/themes/ with a theme.ts is in THEMES, under its folder name', async () => {
  const folders = themeFolders();
  expect(THEMES.map((theme) => theme.id).sort()).toEqual([...folders].sort());
  for (const folder of folders) {
    const file = join(THEMES_FOLDER, folder, 'theme.ts');
    const { default: theme } = (await import(pathToFileURL(file).href)) as { default: Theme };
    expect(theme.id, file).toBe(folder);
    expect(THEMES, file).toContain(theme);
  }
});

test('theme ids and names are unique', () => {
  const ids = THEMES.map((theme) => theme.id);
  const names = THEMES.map((theme) => theme.name);
  expect(ids).toEqual([...new Set(ids)]);
  expect(names).toEqual([...new Set(names)]);
});

test('the default theme is Themelessness, and it comes first in the box', () => {
  expect(DEFAULT_THEME).toBe('themelessness');
  expect(THEMES[0]!.id).toBe(DEFAULT_THEME);
});
