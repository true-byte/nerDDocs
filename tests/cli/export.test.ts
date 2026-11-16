import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { renderPage } from '../../src/page/page-html.tsx';
import { readDiagramBuilds } from '../../src/server/diagram-builds.ts';
import { readFonts } from '../../src/server/fonts.ts';
import { scanSite } from '../../src/site/scan.ts';
import { viewOf } from '../../src/site/view.ts';
import { previewPage } from '../../src/themes/preview/page.ts';
import { THEMES } from '../../src/themes/index.ts';
import { filesUnder, runExport } from '../support/export.ts';
import { recordingOpener } from '../support/fake-opener.ts';
import { folderWith, NO_LEVELS, type FileContent } from '../support/folder.ts';
import { REPO } from '../support/run-command.ts';

const NODE_MODULES = join(REPO, 'node_modules');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40"/></svg>';

/** The docs of the backup app: two pages and the image of the first. */
const BACKUP_DOCS: Record<string, FileContent> = {
  'nerddocs.json': NO_LEVELS,
  '01-restore.md': '# Restore a file\n\nPick a file and a day.\n\n![Restore window](images/restore-window.svg)\n',
  '02-storage.md': '# Storage\n\nBlocks are stored once.\n',
  'images/restore-window.svg': SVG,
};

/** The files of the export that come from the app, as the server serves them under `__nerddocs/`. */
const APP_FILES = () => [
  '__nerddocs/app.js',
  '__nerddocs/app.css',
  ...Object.keys(readFonts(THEMES, NODE_MODULES).files).map((name) => `__nerddocs/fonts/${name}`),
  '__nerddocs/mermaid.js',
  '__nerddocs/mermaid-full.js',
  '__nerddocs/licenses.txt',
  '__nerddocs/search.js',
  '__nerddocs/theme-preview.html',
];

/** A backup app folder that holds the files in its folder `docs`, and more files of its own. Each test removes it. */
const apps: string[] = [];
async function backupApp(docs: Record<string, FileContent>, more: Record<string, FileContent> = {}): Promise<string> {
  const app = await folderWith({ ...Object.fromEntries(Object.entries(docs).map(([name, text]) => [`docs/${name}`, text])), ...more });
  apps.push(app);
  return app;
}
test.afterEach(() => {
  for (const app of apps.splice(0)) {
    chmodTree(app);
    rmSync(app, { recursive: true, force: true });
  }
});
/** Gives back the write permission of each folder that a test locked, so the folder can go. */
function chmodTree(app: string): void {
  const locked = join(app, 'locked');
  if (existsSync(locked)) chmodSync(locked, 0o755);
}

/** The four lines that a successful export prints. */
const report = (folder: string, pages: number, out: string, index: string) =>
  `Folder: ${folder}\nPages: ${pages}\nExport: ${out}\nAddress: ${pathToFileURL(index).href}\n`;

test('with no --out, the export of ./docs goes to nerddocs-export in the current folder, prints four lines, opens no browser and stops by itself', async () => {
  test.skip(process.platform !== 'linux', 'The fake opener takes the place of xdg-open.');
  const app = await backupApp(BACKUP_DOCS);
  const { path, opened } = await recordingOpener();
  const result = runExport(app, [], { PATH: path });
  expect(result.signal, 'the command stops by itself').toBeNull();
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(report('docs', 2, 'nerddocs-export', join(app, 'nerddocs-export/index.html')));
  expect(result.stderr).toBe('');
  expect(existsSync(opened), 'no browser opened').toBe(false);
  expect(filesUnder(join(app, 'nerddocs-export'))).toEqual(
    ['.nojekyll', 'index.html', 'restore.html', 'storage.html', 'nerddocs.json', 'images/restore-window.svg', ...APP_FILES()].sort(),
  );
});

test('a relative --out is relative to the current folder, and the export makes the folder and its parents', async () => {
  const app = await backupApp(BACKUP_DOCS);
  const spaced = runExport(app, ['docs', '--out', 'build/site']);
  expect(spaced.stdout).toBe(report('docs', 2, 'build/site', join(app, 'build/site/index.html')));
  expect(existsSync(join(app, 'build/site/restore.html'))).toBe(true);

  const joined = runExport(join(app, 'docs'), ['.', '--out=../build/other']);
  expect(joined.status).toBe(0);
  expect(existsSync(join(app, 'build/other/storage.html'))).toBe(true);
});

test('an out folder outside the current folder prints in full', async () => {
  const app = await backupApp(BACKUP_DOCS);
  const elsewhere = join(await backupApp({}), 'site');
  const result = runExport(app, ['docs', '--out', elsewhere]);
  expect(result.stdout).toBe(report('docs', 2, elsewhere, join(elsewhere, 'index.html')));
});

test('the files of the export are those that the server serves a reader', async () => {
  const app = await backupApp(BACKUP_DOCS);
  expect(runExport(app, ['docs', '--out', 'site']).status).toBe(0);
  const out = join(app, 'site');
  const read = (path: string) => readFileSync(join(out, path));
  const same = (path: string, bytes: Uint8Array | string) => expect(read(path).equals(Buffer.from(bytes)), path).toBe(true);

  for (const name of ['app.js', 'app.css']) same(`__nerddocs/${name}`, readFileSync(join(REPO, 'dist/client', name)));
  const fonts = readFonts(THEMES, NODE_MODULES);
  for (const [name, bytes] of Object.entries(fonts.files)) same(`__nerddocs/fonts/${name}`, bytes);
  const diagrams = readDiagramBuilds(NODE_MODULES);
  for (const [name, text] of Object.entries(diagrams.files)) same(`__nerddocs/${name}`, text);
  same('__nerddocs/licenses.txt', `${fonts.licenses}\n${diagrams.licenses}`);
  same('__nerddocs/theme-preview.html', previewPage());
  expect(read('__nerddocs/search.js').toString()).toMatch(/^self\.nerddocsSearch=/);
  same('images/restore-window.svg', SVG);
  same('.nojekyll', '');

  const site = await scanSite(join(app, 'docs'));
  for (const { url } of site.pages) same(url.slice(1), renderPage(viewOf(site, url), { live: false }));
});

test('each problem of the docs prints to standard error as a block with an empty line after it, and the export still writes with exit code 0', async () => {
  const undo = 'To undo a restore, see [Undo a restore](undo.md).';
  const app = await backupApp({ 'restore.md': `# Restore a file\n\n${undo}\n` });
  const result = runExport(app, []);
  expect(result.stderr).toBe(
    [
      'docs/nerddocs.json  Missing config',
      '',
      'docs/restore.md:3  Missing page  undo.md',
      `   3 │ ${undo}`,
      `     │ ${' '.repeat(undo.indexOf('undo.md'))}^^^^^^^`,
      '',
      '',
    ].join('\n'),
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(report('docs', 1, 'nerddocs-export', join(app, 'nerddocs-export/index.html')));
  expect(existsSync(join(app, 'nerddocs-export/restore.html'))).toBe(true);
});

/** Runs the export, and checks that it stops with the line and exit code 1, and leaves every file of the app as it was. */
function expectStops(app: string, args: string[], line: string): void {
  const before = filesUnder(app).map((path) => [path, readFileSync(join(app, path)).toString('base64')]);
  const result = runExport(app, args);
  expect(result.status, line).toBe(1);
  expect(result.stderr, line).toBe(`${line}\n`);
  expect(result.stdout, line).toBe('');
  expect(filesUnder(app).map((path) => [path, readFileSync(join(app, path)).toString('base64')]), line).toEqual(before);
}

test('an out path that is a file stops the export with Not a folder', async () => {
  const app = await backupApp(BACKUP_DOCS, { site: 'The notes of the backup app.' });
  expectStops(app, ['docs', '--out', 'site'], 'Not a folder: site');
});

test('an out folder that is the docs folder, or holds it, stops the export with Holds the docs', async () => {
  const app = await backupApp({ ...BACKUP_DOCS, 'guide/schedules.md': '# Schedules\n\nA plan says how often.\n' });
  expectStops(app, ['docs', '--out', 'docs'], 'Holds the docs: docs');
  expectStops(app, ['docs', '--out', '.'], 'Holds the docs: .');
  expectStops(app, ['docs/guide', '--out', 'docs'], 'Holds the docs: docs');
  expectStops(join(app, 'docs'), ['--out', '.'], 'Holds the docs: .');
});

test('an out folder with entries and no __nerddocs at its root stops the export with Not an export', async () => {
  const app = await backupApp(BACKUP_DOCS, {
    'site/notes.txt': 'Keep this.',
    'nested/old/__nerddocs/app.js': 'self.page = "old";',
    'nerddocs-export/notes.txt': 'Keep this too.',
  });
  expectStops(app, ['docs', '--out', 'site'], 'Not an export: site');
  expectStops(app, ['docs', '--out', 'nested'], 'Not an export: nested');
  expectStops(app, [], 'Not an export: nerddocs-export');
});

test('an empty out folder takes the export, and an older export loses every file before the new one writes', async () => {
  const app = await backupApp(BACKUP_DOCS, {
    'site/__nerddocs/old-app.js': 'self.page = "old";',
    'site/old-restore.html': '<p>Old restore</p>',
    'site/notes/old.txt': 'An old file.',
  });
  mkdirSync(join(app, 'empty'));

  expect(runExport(app, ['docs', '--out', 'empty']).status).toBe(0);
  expect(existsSync(join(app, 'empty/index.html'))).toBe(true);

  expect(runExport(app, ['docs', '--out', 'site']).status).toBe(0);
  const files = filesUnder(join(app, 'site'));
  expect(files).toContain('restore.html');
  expect(files.filter((path) => /old/.test(path))).toEqual([]);
  expect(existsSync(join(app, 'site/notes'))).toBe(false);
});

test('an older export keeps .git at its root, so a Git work tree of a Pages branch keeps working, and every other entry goes', async () => {
  const app = await backupApp(BACKUP_DOCS, {
    'site/__nerddocs/app.js': 'self.page = "old";',
    'site/.git/HEAD': 'ref: refs/heads/gh-pages\n',
    'site/.git/refs/heads/gh-pages': '4aa4124\n',
    'site/.gitignore': 'drafts/\n',
    'site/notes/.git/HEAD': 'ref: refs/heads/notes\n',
    'site/old-restore.html': '<p>Old restore</p>',
  });
  expect(runExport(app, ['docs', '--out', 'site']).status).toBe(0);
  const files = filesUnder(join(app, 'site'));
  expect(files.filter((path) => path.startsWith('.git'))).toEqual(['.git/HEAD', '.git/refs/heads/gh-pages']);
  expect(readFileSync(join(app, 'site/.git/HEAD'), 'utf8')).toBe('ref: refs/heads/gh-pages\n');
  expect(readFileSync(join(app, 'site/.git/refs/heads/gh-pages'), 'utf8')).toBe('4aa4124\n');
  expect(existsSync(join(app, 'site/notes'))).toBe(false);
  expect(existsSync(join(app, 'site/old-restore.html'))).toBe(false);
  expect(files).toContain('restore.html');
});

test('an out folder that holds only .git at its root counts as empty, with .git as a folder or as a file, and any other entry beside it stops the export', async () => {
  const app = await backupApp(BACKUP_DOCS);
  // A clone of a Pages branch holds a .git folder, and a Git worktree holds a .git file.
  mkdirSync(join(app, 'clone/.git'), { recursive: true });
  writeFileSync(join(app, 'clone/.git/HEAD'), 'ref: refs/heads/gh-pages\n');
  mkdirSync(join(app, 'worktree'));
  writeFileSync(join(app, 'worktree/.git'), 'gitdir: ../.git/worktrees/worktree\n');
  for (const [out, git] of [['clone', '.git/HEAD'], ['worktree', '.git']] as const) {
    const result = runExport(app, ['docs', '--out', out]);
    expect(result.stderr, out).toBe('');
    expect(result.status, out).toBe(0);
    const files = filesUnder(join(app, out));
    expect(files, out).toContain('restore.html');
    expect(files.filter((path) => path.startsWith('.git')), out).toEqual([git]);
  }

  mkdirSync(join(app, 'busy/.git'), { recursive: true });
  writeFileSync(join(app, 'busy/.git/HEAD'), 'ref: refs/heads/gh-pages\n');
  writeFileSync(join(app, 'busy/notes.txt'), 'Keep this.');
  expectStops(app, ['docs', '--out', 'busy'], 'Not an export: busy');
});

test('an out folder that cannot be made stops the export with Cannot write', async () => {
  test.skip(process.platform === 'win32' || process.getuid?.() === 0, 'A folder without write permission stops only a user who is not root.');
  const app = await backupApp(BACKUP_DOCS);
  mkdirSync(join(app, 'locked'));
  chmodSync(join(app, 'locked'), 0o555);
  const result = runExport(app, ['docs', '--out', 'locked/site']);
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('Cannot write: locked/site\n');
  expect(existsSync(join(app, 'locked/site'))).toBe(false);
});

test('the copy holds each public file at its path, the config too, and leaves out Markdown, hidden files, node_modules, __nerddocs of the docs and an older export in the docs', async () => {
  const app = await backupApp({
    ...BACKUP_DOCS,
    '03-guide/01-schedules.md': '# Schedules\n\nA plan says how often.\n',
    '03-guide/wireframes/restore-wizard.html': '<!doctype html><p>Restore wizard</p>',
    '03-guide/notes.MD': '# Notes',
    '.drafts/plan.txt': 'A draft.',
    'node_modules/agent/index.js': 'module.exports = {};',
    '__nerddocs/app.js': 'self.page = "the docs folder";',
    'nerddocs-export/index.html': '<p>Older export</p>',
    'nerddocs-export/__nerddocs/app.js': 'self.page = "older";',
  });
  expect(runExport(app, ['docs', '--out', 'site']).status).toBe(0);
  expect(filesUnder(join(app, 'site'))).toEqual(
    [
      '.nojekyll',
      'index.html',
      'restore.html',
      'storage.html',
      'nerddocs.json',
      'guide/schedules.html',
      'guide/notes.html',
      'images/restore-window.svg',
      '03-guide/wireframes/restore-wizard.html',
      ...APP_FILES(),
    ].sort(),
  );
  expect(readFileSync(join(app, 'site/__nerddocs/app.js')).equals(readFileSync(join(REPO, 'dist/client/app.js')))).toBe(true);
});

test('an out folder inside the docs folder leaves itself out of the copy, run after run', async () => {
  const app = await backupApp({});
  for (const [name, text] of Object.entries(BACKUP_DOCS)) {
    mkdirSync(join(app, name, '..'), { recursive: true });
    writeFileSync(join(app, name), text);
  }
  for (const run of [1, 2]) {
    const result = runExport(app, []);
    expect(result.stdout, `run ${run}`).toBe(report('.', 2, 'nerddocs-export', join(app, 'nerddocs-export/index.html')));
    expect(filesUnder(join(app, 'nerddocs-export')), `run ${run}`).toEqual(
      ['.nojekyll', 'index.html', 'restore.html', 'storage.html', 'nerddocs.json', 'images/restore-window.svg', ...APP_FILES()].sort(),
    );
  }
  for (const run of [1, 2]) {
    expect(runExport(app, ['.', '--out', 'images/site']).status, `run ${run}`).toBe(0);
    expect(filesUnder(join(app, 'images/site')).filter((path) => path.startsWith('images/')), `run ${run}`).toEqual(['images/restore-window.svg']);
  }
});
