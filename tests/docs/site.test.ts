import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { runCheck } from '../../src/cli/check.ts';
import { CONFIG_FILE, configDimensions, parseConfig } from '../../src/site/config.ts';
import { docsSite, DOCS, pagesIn, ROOT } from '../support/docs.ts';

/** The titles of pages that the 'Guide' dimension holds, among others. */
const GUIDE_TITLES = [
  'What is nerDDocs',
  'Get started',
  'Read a page',
  'Write levels',
  'Organize pages',
  'Page content',
  'Write with Claude',
  'Check the docs',
];

/** The titles of pages that the 'Project' dimension holds, among others. */
const PROJECT_TITLES = ['Use cases', 'Tech stack', 'Plan'];

const readConfig = async () => parseConfig(await readFile(join(DOCS, CONFIG_FILE), 'utf8'));

test("nerddocs.json lists the levels 'Casual', 'Pro' and 'Full nerd' with their icons, and opens at 'Casual'", async () => {
  const site = await docsSite();
  expect(site.configProblem).toBeNull();
  expect(site.levels).toEqual([
    { id: 'casual', name: 'Casual', icon: 'eye' },
    { id: 'pro', name: 'Pro', icon: 'brief' },
    { id: 'full-nerd', name: 'Full nerd', icon: 'cpu' },
  ]);
  expect((await readConfig())?.defaultLevel).toBe('casual');
});

test("nerddocs.json lists the dimensions 'Guide' and then 'Project'", async () => {
  const config = await readConfig();
  expect(config).not.toBeNull();
  expect(configDimensions(config!)).toEqual([
    { folder: 'guide', name: 'Guide' },
    { folder: 'project', name: 'Project' },
  ]);
});

test('nerddocs.json gives no problem', async () => {
  const site = await docsSite();
  expect(site.problems.filter((problem) => problem.file === CONFIG_FILE).map((problem) => problem.name)).toEqual([]);
});

test('the check of the docs finds no problem and exits with 0', async () => {
  let report = '';
  const code = await runCheck(DOCS, (text) => (report += text), { cwd: ROOT, color: false });
  expect(report).toMatch(/^Folder: docs\nPages: \d+\n\nProblems: 0\n$/);
  expect(code).toBe(0);
});

test("the 'Guide' dimension holds a page with each title of the guide", async () => {
  const titles = pagesIn(await docsSite(), 'guide').map((page) => page.title);
  expect(GUIDE_TITLES.filter((title) => !titles.includes(title))).toEqual([]);
});

test("the 'Project' dimension holds a page with each title of the project", async () => {
  const titles = pagesIn(await docsSite(), 'project').map((page) => page.title);
  expect(PROJECT_TITLES.filter((title) => !titles.includes(title))).toEqual([]);
});
