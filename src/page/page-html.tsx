/** @jsxImportSource react */
import { renderToString } from 'react-dom/server';
import { hrefTo } from '../site/urls.ts';
import type { PageView } from '../site/view.ts';
import { Contents, type ContentsData } from './contents.tsx';
import { firstPaintScript, NO_SCRIPT_STYLE, safeJson } from './first-paint.ts';
import { levelRule, openingLevel, sameMarks } from './levels.ts';
import { sectionsAround } from './panel-state.ts';

export type AssetName = 'app.js' | 'app.css';

export interface RenderOptions {
  /** True only when the command serves the page. A page on disk has no server to listen to. */
  live: boolean;
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
  return escapeText(text).replace(/"/g, '&quot;');
}

/** The whole page as HTML. The text and the nav read with no script. */
export function renderPage(view: PageView, { live }: RenderOptions): string {
  const asset = (name: AssetName) => escapeAttribute(hrefTo(view.url, `/__nerddocs/${name}`));
  const data: ContentsData = {
    url: view.url,
    rev: view.rev,
    siteName: view.siteName,
    tree: view.tree,
    live,
    levels: view.levels,
    defaultLevel: view.defaultLevel,
    parts: view.parts,
    hasShared: view.hasShared,
    hasSharedText: view.hasSharedText,
    configProblem: view.configProblem,
  };
  const contents = renderToString(<Contents initial={data} />);
  const headingId = view.titleId ? ` id="${escapeAttribute(view.titleId)}"` : '';
  const level = openingLevel(view);
  const articleClass = sameMarks(view, level) ? ' class="samemarks"' : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeText(view.docTitle)}</title>
<link rel="stylesheet" href="${asset('app.css')}">
<style id="nd-level" data-level="${level}">${levelRule(level)}</style>
<script>${firstPaintScript(sectionsAround(view.tree, view.url))}</script>
<noscript><style>${NO_SCRIPT_STYLE}</style></noscript>
</head>
<body>
<div id="app">
<div id="contents">${contents}</div>
<main>
<div class="col">
<h1${headingId}>${escapeText(view.title)}</h1>
<article id="page"${articleClass}>${view.html}</article>
</div>
</main>
</div>
<script id="nd-data" type="application/json">${safeJson(data)}</script>
<script src="${asset('app.js')}" defer></script>
</body>
</html>
`;
}
