/** @jsxImportSource react */
import { renderToString } from 'react-dom/server';
import { DEFAULT_TEXT_WIDTH } from '../site/config.ts';
import { hrefTo } from '../site/urls.ts';
import type { PageView } from '../site/view.ts';
import { Contents, type ContentsData } from './contents.tsx';
import { titleSlotHtml } from './copy-link.tsx';
import { firstPaintScript, NO_SCRIPT_STYLE, safeJson } from './first-paint.ts';
import { levelRule, openingLevel, sameMarks } from './levels.ts';
import { pageFootHtml } from './page-foot.ts';
import { sectionsAround } from './panel-state.ts';
import { PREVIEW_URL, PREVIEW_WIDTH, themeHashScript } from './theme-preview.ts';

export type AssetName = 'app.js' | 'app.css';

export interface RenderOptions {
  /** True only when the command serves the page. A page on disk has no server to listen to. */
  live: boolean;
  /**
   * True for the theme preview at `PREVIEW_URL`: a still page at a fixed width that shows the theme of its address
   * hash. It runs no page script and takes no click or focus.
   */
  preview?: boolean;
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
  return escapeText(text).replace(/"/g, '&quot;');
}

/** The whole page as HTML. The text and the nav read with no script. */
export function renderPage(view: PageView, { live, preview = false }: RenderOptions): string {
  const asset = (name: AssetName) => escapeAttribute(hrefTo(preview ? PREVIEW_URL : view.url, `/__nerddocs/${name}`));
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
    readTimes: view.readTimes,
    textWidth: view.textWidth ?? DEFAULT_TEXT_WIDTH,
    diagrams: view.diagrams,
    dimensions: view.dimensions,
    anchors: view.anchors,
    linkLevels: view.linkLevels,
    linkTargets: view.linkTargets,
    neighbors: view.neighbors,
  };
  const contents = renderToString(<Contents initial={data} />);
  const headingId = view.titleId ? ` id="${escapeAttribute(view.titleId)}"` : '';
  const level = openingLevel(view);
  const articleClass = sameMarks(view, level) ? ' class="samemarks"' : '';
  const viewport = preview ? `width=${PREVIEW_WIDTH}` : 'width=device-width,initial-scale=1,viewport-fit=cover';
  const headScript = preview ? themeHashScript() : firstPaintScript(sectionsAround(view.tree, view.url), view);
  const pageScript = preview
    ? ''
    : `<script id="nd-data" type="application/json">${safeJson(data)}</script>\n<script src="${asset('app.js')}" defer></script>\n`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="${viewport}">
<title>${escapeText(view.docTitle)}</title>
<link rel="stylesheet" href="${asset('app.css')}">
<style id="nd-level" data-level="${level}">${levelRule(level)}</style>
<script>${headScript}</script>
<noscript><style>${NO_SCRIPT_STYLE}</style></noscript>
</head>
<body${preview ? ' inert' : ''}>
<div id="art"></div>
<div id="app">
<div id="contents">${contents}</div>
<main>
<div class="col" style="--text-default:${data.textWidth}">
<div class="title-line"><h1${headingId}>${escapeText(view.title)}</h1><span id="tl-slot">${titleSlotHtml(view)}</span></div>
<article id="page"${articleClass}>${view.html}</article>
${pageFootHtml(view)}</div>
</main>
</div>
<div id="nd-status" class="sr-only" role="status"></div>
${pageScript}</body>
</html>
`;
}
