import { expect, test } from '@playwright/test';
import { BUILD_FILES } from '../../src/page/diagrams.ts';
import { renderPage } from '../../src/page/page-html.tsx';
import { PREVIEW_URL } from '../../src/page/theme-preview.ts';
import { exportFiles, type ExportFile } from '../../src/site/export-files.ts';
import { scanSite, type Site } from '../../src/site/scan.ts';
import { searchScript } from '../../src/site/search-file.ts';
import { viewOf } from '../../src/site/view.ts';
import { previewPage } from '../../src/themes/preview/page.ts';
import { folderWith, NO_LEVELS } from '../support/folder.ts';
import { THREE_LEVELS } from '../support/levels.ts';

/** The files of the app, as the command holds them. */
const APP: Parameters<typeof exportFiles>[1] = {
  assets: { 'app.js': 'self.page = "the page script";', 'app.css': 'body { margin: 0; }' },
  fonts: {
    files: {
      'vt323-latin-400-normal.woff2': new Uint8Array([119, 79, 70, 50, 1]),
      'fira-code-symbols2-400-normal.woff2': new Uint8Array([119, 79, 70, 50, 2]),
    },
    licenses: 'VT323: SIL Open Font License 1.1',
  },
  diagrams: {
    files: { [BUILD_FILES.tiny]: 'self.mermaid = "tiny";', [BUILD_FILES.full]: 'self.mermaid = "full";' },
    licenses: 'mermaid: MIT',
  },
};

/** The public files of the docs folder of the backup app, by their path in the docs folder. */
const PUBLIC = ['images/restore-window.svg', '01-guide/wireframes/restore-wizard.html', '01-guide/wireframes/wizard.css'];

/** The backup app: its first page sits in a folder with an order prefix. */
const BACKUP_APP = {
  'nerddocs.json': THREE_LEVELS,
  '01-guide/01-restore.md': '# Restore a file\n\n::: overview\nPick a file and a day.\n::: internals\nA restore is a job.\n:::\n',
  '01-guide/02-schedules.md': '# Schedules\n\nA plan says how often.\n',
  '02-storage.md': '# Storage\n\nBlocks are stored once.\n',
};

const siteOf = async (files: Record<string, string>): Promise<Site> => scanSite(await folderWith(files));

/** The one file of the export at the path. */
function fileAt(files: ExportFile[], path: string): ExportFile {
  const found = files.filter((file) => file.path === path);
  expect(found, path).toHaveLength(1);
  return found[0]!;
}

/** The bytes of the content of a file of the export that holds its text or its bytes. */
function bytesOf(file: ExportFile): Buffer {
  const { content } = file;
  if (typeof content === 'string') return Buffer.from(content);
  if (content instanceof Uint8Array) return Buffer.from(content);
  throw new Error(`${file.path} is a copy of ${content.copy}`);
}

const textOf = (file: ExportFile) => bytesOf(file).toString('utf8');

test('each page is the file of its address, as the site shows it to a reader who is not the author, with no live update', async () => {
  const site = await siteOf(BACKUP_APP);
  const files = exportFiles(site, APP, PUBLIC);
  expect(site.pages.map((page) => page.url)).toEqual(['/guide/restore.html', '/guide/schedules.html', '/storage.html']);
  for (const { url } of site.pages) {
    const html = textOf(fileAt(files, url.slice(1)));
    expect(html, url).toBe(renderPage(viewOf(site, url), { live: false }));
    expect(html, url).toContain('"live":false');
  }
});

test('index.html opens the first page with the hash of its own address, and with no script by a refresh', async () => {
  const index = textOf(fileAt(exportFiles(await siteOf(BACKUP_APP), APP, PUBLIC), 'index.html'));
  expect(index).toMatch(/<script>[^<]*location\.replace\(\s*(["'])guide\/restore\.html\1\s*\+\s*location\.hash\s*\)[^<]*<\/script>/);
  expect(index).toContain('<meta http-equiv="refresh" content="0; url=guide/restore.html">');
});

test('with no page, index.html is the page of the site root', async () => {
  const site = await siteOf({ 'nerddocs.json': NO_LEVELS });
  expect(site.pages).toEqual([]);
  expect(textOf(fileAt(exportFiles(site, APP, []), 'index.html'))).toBe(renderPage(viewOf(site, '/'), { live: false }));
});

test('__nerddocs/ holds what the server serves a reader under it', async () => {
  const site = await siteOf(BACKUP_APP);
  const files = exportFiles(site, APP, PUBLIC);
  expect(textOf(fileAt(files, '__nerddocs/app.js'))).toBe(APP.assets['app.js']);
  expect(textOf(fileAt(files, '__nerddocs/app.css'))).toBe(APP.assets['app.css']);
  for (const [name, bytes] of Object.entries(APP.fonts.files)) {
    expect(bytesOf(fileAt(files, `__nerddocs/fonts/${name}`)).equals(Buffer.from(bytes)), name).toBe(true);
  }
  for (const name of Object.values(BUILD_FILES)) expect(textOf(fileAt(files, `__nerddocs/${name}`))).toBe(APP.diagrams.files[name]);
  expect(textOf(fileAt(files, '__nerddocs/licenses.txt'))).toBe(`${APP.fonts.licenses}\n${APP.diagrams.licenses}`);
  expect(textOf(fileAt(files, '__nerddocs/search.js'))).toBe(searchScript(site));
  expect(textOf(fileAt(files, PREVIEW_URL.slice(1)))).toBe(previewPage());
});

test('each public file is a copy at its path in the docs folder, with its order prefixes', async () => {
  const files = exportFiles(await siteOf(BACKUP_APP), APP, PUBLIC);
  for (const path of PUBLIC) {
    const { content } = fileAt(files, path);
    expect(content, path).toEqual({ copy: expect.stringMatching(new RegExp(`(^|/)${path.replace(/\./g, '\\.')}$`)) });
  }
});

test('.nojekyll sits at the root and is empty', async () => {
  expect(bytesOf(fileAt(exportFiles(await siteOf(BACKUP_APP), APP, PUBLIC), '.nojekyll')).length).toBe(0);
});

test('the export holds the pages, index.html, the app files, the public files and .nojekyll, and nothing else', async () => {
  const site = await siteOf(BACKUP_APP);
  const paths = exportFiles(site, APP, PUBLIC).map((file) => file.path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.filter((path) => /\.md$/i.test(path))).toEqual([]);
  expect([...paths].sort()).toEqual(
    [
      ...site.pages.map((page) => page.url.slice(1)),
      'index.html',
      '.nojekyll',
      '__nerddocs/app.js',
      '__nerddocs/app.css',
      ...Object.keys(APP.fonts.files).map((name) => `__nerddocs/fonts/${name}`),
      ...Object.values(BUILD_FILES).map((name) => `__nerddocs/${name}`),
      '__nerddocs/licenses.txt',
      '__nerddocs/search.js',
      PREVIEW_URL.slice(1),
      ...PUBLIC,
    ].sort(),
  );
});
