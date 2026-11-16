import { DEFAULT_OUT } from '../cli/args.ts';
import { BUILD_FILES } from '../page/diagrams.ts';
import { safeJson } from '../page/first-paint.ts';
import { renderPage, type AssetName } from '../page/page-html.tsx';
import { PREVIEW_URL } from '../page/theme-preview.ts';
import { FONTS_FOLDER, LICENSES_FILE, licensesText, SEARCH_FILE } from '../server/app-folder.ts';
import type { DiagramBuilds } from '../server/diagram-builds.ts';
import type { FontFiles } from '../server/fonts.ts';
import { previewPage } from '../themes/preview/page.ts';
import { isMarkdownName } from './names.ts';
import { APP_FOLDER, type Site } from './scan.ts';
import { searchScript } from './search-file.ts';
import { hrefTo } from './urls.ts';
import { viewOf } from './view.ts';

export interface ExportFile {
  /** The path in the out folder, with `/`. */
  path: string;
  /** The text or the bytes of the file, or the path of a file of the docs folder to copy. */
  content: string | Uint8Array | { copy: string };
}

/** The files of the app that the server serves under `/__nerddocs/`, as `main.ts` passes them to `startServer`. */
export interface AppFiles {
  assets: Record<AssetName, string>;
  fonts: FontFiles;
  diagrams: DiagramBuilds;
}

/** The file that the browser opens for the out folder, and that GitHub Pages serves at the root of the site. */
const INDEX_FILE = 'index.html';
/** An empty file of this name keeps `__nerddocs/` in a site that GitHub Pages builds with Jekyll. */
const NO_JEKYLL = '.nojekyll';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The page at the root that opens the first page of the site, with the hash of its own address, so `index.html#pro`
 * opens the first page at 'Pro'. With no script, the refresh opens the first page.
 */
function indexPage(site: Site, first: string): string {
  const href = hrefTo(`/${INDEX_FILE}`, first);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(site.name)}</title>
<script>location.replace(${safeJson(href)} + location.hash)</script>
<noscript><meta http-equiv="refresh" content="0; url=${escapeHtml(href)}"></noscript>
</head>
<body><a href="${escapeHtml(href)}">${escapeHtml(site.name)}</a></body>
</html>
`;
}

/** True for a public file that the export copies: no Markdown file, nothing of the app folder, and no older export. */
function isCopied(path: string): boolean {
  const parts = path.split('/');
  return !isMarkdownName(parts.at(-1)!) && parts[0] !== APP_FOLDER && !parts.slice(0, -1).includes(DEFAULT_OUT);
}

/**
 * Every file of the export of the site: each page as the server shows it to a reader who is not the author, `index.html`,
 * the files of the app folder, each public file of the docs folder at its path, and `.nojekyll`. `publicFiles` holds
 * the path in the docs folder, with `/`, of each non-Markdown file that the server would serve.
 */
export function exportFiles(site: Site, app: AppFiles, publicFiles: string[]): ExportFile[] {
  const files: ExportFile[] = site.pages.map((page) => ({
    path: page.url.slice(1),
    content: renderPage(viewOf(site, page.url), { live: false }),
  }));
  // A page of an `index.md` at the top of the docs folder is `index.html` itself.
  const first = site.pages[0];
  if (!files.some((file) => file.path === INDEX_FILE)) {
    files.push({
      path: INDEX_FILE,
      content: first ? indexPage(site, first.url) : renderPage(viewOf(site, '/'), { live: false }),
    });
  }

  const inApp = (name: string) => `${APP_FOLDER}/${name}`;
  for (const name of ['app.js', 'app.css'] as const) files.push({ path: inApp(name), content: app.assets[name] });
  for (const [name, bytes] of Object.entries(app.fonts.files)) files.push({ path: inApp(`${FONTS_FOLDER}${name}`), content: bytes });
  for (const name of Object.values(BUILD_FILES)) files.push({ path: inApp(name), content: app.diagrams.files[name] ?? '' });
  files.push({ path: inApp(LICENSES_FILE), content: licensesText(app.fonts, app.diagrams) });
  files.push({ path: inApp(SEARCH_FILE), content: searchScript(site) });
  files.push({ path: PREVIEW_URL.slice(1), content: previewPage() });

  // A page or a file of the app wins over a file of the docs folder at the same path, as on the server.
  const taken = new Set(files.map((file) => file.path));
  for (const path of publicFiles) {
    if (isCopied(path) && !taken.has(path)) files.push({ path, content: { copy: path } });
  }
  files.push({ path: NO_JEKYLL, content: '' });
  return files;
}
