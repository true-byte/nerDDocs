import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { fakeOpener, recordingOpener } from '../support/fake-opener.ts';
import { folderWith } from '../support/folder.ts';
import { OFTEN } from '../support/poll.ts';
import { openBrowser } from '../../src/cli/open-browser.ts';

test.skip(process.platform !== 'linux', 'The fake opener takes the place of xdg-open.');

const ADDRESS = 'http://127.0.0.1:4000/';
const realPath = process.env.PATH;

test.afterEach(() => {
  process.env.PATH = realPath;
});

/** Opens the browser as the code does on another system, with only the fake program to run. */
function openOn(platform: NodeJS.Platform, path: string): void {
  const real = process.platform;
  process.env.PATH = path;
  Object.defineProperty(process, 'platform', { value: platform });
  try {
    openBrowser(ADDRESS, () => {});
  } finally {
    Object.defineProperty(process, 'platform', { value: real });
  }
}

/** Runs with builtin commands only, since a PATH with only this folder finds no other program. */
const RECORD_ARGUMENTS = 'printf \'%s\\n\' "$@" > "${0%/*}/opened.txt"';
const recorded = (folder: string) => () => readFile(join(folder, 'opened.txt'), 'utf8').catch(() => '');

const failure = () => new Promise<void>((resolve) => openBrowser(ADDRESS, resolve));

test('the browser opens at the address', async () => {
  const { path, opened } = await recordingOpener();
  process.env.PATH = path;

  openBrowser(ADDRESS, () => {
    throw new Error('The browser did open.');
  });

  await expect.poll(() => readFile(opened, 'utf8').catch(() => ''), OFTEN).toBe(ADDRESS);
});

test('a browser that exits with an error counts as a failure', async () => {
  process.env.PATH = `${await fakeOpener('exit 3')}:${realPath}`;
  await failure();
});

test('a computer with no way to open a browser counts as a failure', async () => {
  process.env.PATH = await folderWith({});
  await failure();
});

test('on a Mac the browser opens with the open program', async () => {
  const folder = await fakeOpener(RECORD_ARGUMENTS, 'open');
  openOn('darwin', folder);
  await expect.poll(recorded(folder), OFTEN).toBe(`${ADDRESS}\n`);
});

test('on Windows the browser opens with the start command', async () => {
  const folder = await fakeOpener(RECORD_ARGUMENTS, 'cmd');
  openOn('win32', folder);
  await expect.poll(recorded(folder), OFTEN).toBe(`/c\nstart\n\n${ADDRESS}\n`);
});

test('Ctrl+C in the terminal leaves the browser open, since the browser runs in a process group of its own', async () => {
  const folder = await fakeOpener('read -r line < /proc/$$/stat\nset -- $line\nprintf \'%s %s\' "$1" "$5" > "${0%/*}/opened.txt"');
  process.env.PATH = folder;

  openBrowser(ADDRESS, () => {});

  await expect.poll(recorded(folder), OFTEN).toMatch(/^\d+ \d+$/);
  const [processId, groupId] = (await recorded(folder)()).split(' ');
  expect(groupId).toBe(processId);
});

test('the output of the browser stays out of the terminal', async () => {
  const folder = await fakeOpener('links=$(readlink /proc/$$/fd/1 /proc/$$/fd/2)\nprintf \'%s\\n\' "$links" > "${0%/*}/opened.tmp"\nmv "${0%/*}/opened.tmp" "${0%/*}/opened.txt"');
  process.env.PATH = `${folder}:${realPath}`;

  openBrowser(ADDRESS, () => {});

  await expect.poll(recorded(folder), OFTEN).toBe('/dev/null\n/dev/null\n');
});
