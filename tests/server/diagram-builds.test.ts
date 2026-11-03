import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { BUNDLED_LICENSES, bundledPackages } from '../../src/server/bundled-packages.ts';
import { BUILD_SOURCES } from '../../src/server/diagram-builds.ts';
import { licenseEntry } from '../../src/server/licenses.ts';
import { startServer } from '../../src/server/server.ts';
import { pageFaces } from '../../src/themes/box-font.ts';
import { THEMES } from '../../src/themes/index.ts';
import { DIAGRAMS_SITE } from '../support/diagrams.ts';
import { folderWith, withConfig } from '../support/folder.ts';
import { openingTag } from '../support/html.ts';
import { REPO, runCommand, type RunningCommand } from '../support/run-command.ts';

const NODE_MODULES = join(REPO, 'node_modules');
const packageOf = (file: string) => file.split('/').slice(0, file.startsWith('@') ? 2 : 1).join('/');
/** The font packages of the faces of the page. */
const FONT_PACKAGES = [...new Set(pageFaces(THEMES).map((face) => packageOf(face.file)))];
const buildBytes = (build: 'tiny' | 'full') => readFileSync(join(NODE_MODULES, BUILD_SOURCES[build]));
const BUNDLED = bundledPackages(NODE_MODULES);
const specOf = ({ name, version }: { name: string; version: string }) => `${name}@${version}`;

/** A string that only the code of one package holds, and that package. */
const MARKERS: [string, string][] = [
  ['Langium', 'langium'],
  ['t.fastdom=t.fastdom||new', 'fastdom'],
  ['getWellformedRange', 'vscode-languageserver-textdocument'],
  ['Path must be a string', 'path-browserify'],
  ['org.eclipse.elk', 'elkjs'],
  ['DOMPurify', 'dompurify'],
  ['cytoscape', 'cytoscape'],
];

let run: RunningCommand;

test.beforeAll(async () => {
  run = await runCommand({ 'schedules.md': '# Schedules\n\nA plan says how often.\n' });
});

test.afterAll(() => run.stop());

test('the bundled packages are those that the source maps name, at the version that they name, with the ones that the maps miss', () => {
  for (const spec of [
    'mermaid@12.2.0',
    '@mermaid-js/tiny@12.2.0',
    '@mermaid-js/parser@2.0.1',
    'elkjs@0.9.3',
    'dompurify@3.4.12',
    'langium@4.4.0',
    'fastdom@1.0.12',
    'vscode-languageserver-textdocument@1.0.15',
    'vscode-uri@3.1.0',
    'path-browserify@1.0.1',
    'hachure-fill@0.5.2',
    'd3-array@2.12.1',
    'd3-array@3.2.4',
  ]) {
    expect(BUNDLED.map(specOf), spec).toContain(spec);
  }
  const specs = BUNDLED.map(specOf);
  expect(new Set(specs).size).toBe(specs.length);
  const names = BUNDLED.map(({ name }) => name);
  expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
});

test('a package whose code a build holds is a bundled package, at the version that the build names', () => {
  const names = new Set(BUNDLED.map(({ name }) => name));
  for (const build of ['tiny', 'full'] as const) {
    const text = buildBytes(build).toString('utf8');
    for (const [marker, name] of MARKERS) if (text.includes(marker)) expect(names, `${build}: ${marker}`).toContain(name);
    const purify = /@license DOMPurify (\S+)/.exec(text)?.[1];
    expect(purify, build).toBeDefined();
    expect(BUNDLED.map(specOf), build).toContain(`dompurify@${purify}`);
  }
});

test('the bundled licenses hold one entry for each bundled package, in order, each with its license text', () => {
  const text = readFileSync(BUNDLED_LICENSES, 'utf8');
  const heads = [...text.matchAll(/^(\S+) (\S+)\nLicense: .*\nSource: .*\n/gm)].map(([, name, version]) => `${name}@${version}`);
  expect(heads).toEqual(BUNDLED.map(specOf));
  const entries = text.split(/\n(?=\S+ \S+\nLicense: )/);
  for (const entry of entries) expect(entry.split('\n\n').length, entry.slice(0, entry.indexOf('\n'))).toBeGreaterThan(1);
  expect(text).toContain('fastdom 1.0.12\nLicense: MIT\nSource: https://github.com/wilsonpage/fastdom\n\n(The MIT License)\n\nCopyright (c) 2016 Wilson Page');
});

test('each build answers its own bytes as a script', async () => {
  expect(BUILD_SOURCES).toEqual({ tiny: '@mermaid-js/tiny/dist/mermaid.tiny.js', full: 'mermaid/dist/mermaid.min.js' });
  for (const [name, build] of [
    ['mermaid.js', 'tiny'],
    ['mermaid-full.js', 'full'],
  ] as const) {
    const response = await fetch(`${run.address}__nerddocs/${name}`);
    expect(response.status, name).toBe(200);
    expect(response.headers.get('content-type'), name).toBe('text/javascript; charset=utf-8');
    expect(Buffer.from(await response.arrayBuffer()).equals(buildBytes(build)), name).toBe(true);
  }
  expect((await fetch(`${run.address}__nerddocs/mermaid-tiny.js`)).status).toBe(404);
});

test('licenses.txt holds the fonts and every bundled package, elkjs under EPL-2.0 with its source', async () => {
  const response = await fetch(`${run.address}__nerddocs/licenses.txt`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  const text = await response.text();

  const fonts = FONT_PACKAGES.map((name) => licenseEntry(join(NODE_MODULES, name)));
  for (const entry of fonts) expect(text, entry.slice(0, entry.indexOf('\n'))).toContain(entry);
  const diagrams = readFileSync(BUNDLED_LICENSES, 'utf8');
  expect(text).toContain(diagrams);
  expect(text.indexOf(fonts.at(-1)!), 'the fonts come first').toBeLessThan(text.indexOf(diagrams));

  const heading = 'elkjs 0.9.3\nLicense: EPL-2.0\nSource: https://github.com/kieler/elkjs';
  const license = readFileSync(join(NODE_MODULES, 'elkjs/LICENSE.md'), 'utf8').trim();
  expect(text).toContain(`${heading}\n\n${license}\n`);
  expect((await fetch(`${run.address}__nerddocs/fonts/licenses.txt`)).status).toBe(404);
});

test('a server with no builds given reads them from the clone', async () => {
  const folder = await folderWith(withConfig({ 'schedules.md': '# Schedules' }));
  const assets = { 'app.js': 'console.log("backup app")', 'app.css': 'body{}' };
  const server = await startServer({ folder, port: 0, assets, log: () => {} });
  try {
    const response = await fetch(`${server.address}__nerddocs/mermaid.js`);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(buildBytes('tiny'))).toBe(true);
  } finally {
    await server.close();
  }
});

test('a broken diagram prints nothing in the terminal', async () => {
  const site = await runCommand(DIAGRAMS_SITE);
  try {
    const response = await fetch(`${site.address}broken-files.html`);
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(openingTag('div', { class: 'dg', 'data-file': 'broken-files.md', 'data-line': '5' }));
    expect(site.output()).not.toContain('Bad Mermaid');
  } finally {
    await site.stop();
  }
});
