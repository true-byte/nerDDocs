import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { pageFaces } from '../../src/themes/box-font.ts';
import { THEMES } from '../../src/themes/index.ts';
import { REPO, runCommand, type RunningCommand } from '../support/run-command.ts';

const NODE_MODULES = join(REPO, 'node_modules');
/** The face files of the page, those of every theme and of box diagrams, as paths in node_modules. */
const FACE_FILES = [...new Set(pageFaces(THEMES).map((face) => face.file))];
const FACE_NAMES = FACE_FILES.map((file) => basename(file));
const packageOf = (file: string) => file.split('/').slice(0, file.startsWith('@') ? 2 : 1).join('/');
const PACKAGES = [...new Set(FACE_FILES.map(packageOf))];
const LICENSE_NAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'OFL.txt'];

let run: RunningCommand;

test.beforeAll(async () => {
  run = await runCommand({ 'restore.md': '# Restore a file\n\nPick a file and a day.' });
});

test.afterAll(() => run.stop());

const fontAddress = (name: string) => `${run.address}__nerddocs/fonts/${name}`;

test('each font file of the page answers with its bytes as font/woff2', async () => {
  for (const file of FACE_FILES) {
    const response = await fetch(fontAddress(basename(file)));
    expect(response.status, file).toBe(200);
    expect(response.headers.get('content-type'), file).toBe('font/woff2');
    expect(Buffer.from(await response.arrayBuffer()).equals(readFileSync(join(NODE_MODULES, file))), file).toBe(true);
  }
});

test('a font file that the page does not use, and any other name, answers 404', async () => {
  /** A file of an installed font package that no face names, such as its Cyrillic subset. */
  const unused = FACE_FILES.flatMap((file) =>
    readdirSync(join(NODE_MODULES, dirname(file))).filter((name) => name.endsWith('.woff2') && !FACE_NAMES.includes(name)),
  )[0];
  for (const name of ['comic-sans.woff2', 'app.css', ...(unused ? [unused] : [])]) {
    expect((await fetch(fontAddress(name))).status, name).toBe(404);
  }
});

test('licenses.txt holds the license of each font package that the page uses, under the package name', async () => {
  expect(PACKAGES).toContain('@fontsource/fira-code');
  const response = await fetch(`${run.address}__nerddocs/licenses.txt`);
  expect(response.status).toBe(200);
  const text = await response.text();
  for (const name of PACKAGES) {
    const licenseName = LICENSE_NAMES.find((file) => existsSync(join(NODE_MODULES, name, file)));
    expect(licenseName, `the license file of ${name}`).toBeDefined();
    const license = readFileSync(join(NODE_MODULES, name, licenseName!), 'utf8').trim();
    const heading = text.search(new RegExp(`^.*${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}.*$`, 'm'));
    expect(heading, `the line with ${name}`).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(license, heading), `the license of ${name}`).toBeGreaterThan(heading);
  }
});

test('app.css names each font file next to it and holds no font data', async () => {
  const css = await (await fetch(`${run.address}__nerddocs/app.css`)).text();
  for (const name of FACE_NAMES) expect(css, name).toContain(`fonts/${name}`);
  expect(css).not.toMatch(/data:(font|application\/(x-)?font)|woff2?;base64|wOF2/);
});
