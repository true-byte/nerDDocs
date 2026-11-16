import { renderMarkdown } from '../../markdown/render.ts';
import { renderPage } from '../../page/page-html.tsx';
import { CONFIG_FILE, DEFAULT_WORDS_PER_MINUTE, EMPTY_CONFIG, parseConfig, siteLevels } from '../../site/config.ts';
import { compareEntries, isMarkdownName, labelFromName, stemOf } from '../../site/names.ts';
import type { Page, Site, TreeNode } from '../../site/scan.ts';
import { pageUrl } from '../../site/urls.ts';
import { viewOf } from '../../site/view.ts';
import { SAMPLE_FILES, SAMPLE_NAME, SAMPLE_PAGE } from './site.ts';

/** The site that the sample files make, with the sections, order, titles and levels that a scan of a folder gives. */
function sampleSite(): Site {
  const config = parseConfig(SAMPLE_FILES[CONFIG_FILE] ?? '') ?? EMPTY_CONFIG;
  const listed = config.levels.map((level) => level.id);
  const paths = Object.keys(SAMPLE_FILES).filter(isMarkdownName);
  const pages: Page[] = [];

  function nodesIn(folder: string): TreeNode[] {
    const names = new Set(paths.filter((path) => path.startsWith(folder)).map((path) => path.slice(folder.length).split('/')[0]!));
    return [...names].sort(compareEntries).map((name): TreeNode => {
      const path = folder + name;
      if (!paths.includes(path)) {
        return { kind: 'section', id: path, title: labelFromName(name), children: nodesIn(`${path}/`) };
      }
      const url = pageUrl(path);
      const source = SAMPLE_FILES[path]!;
      const page = { url, source, ...renderMarkdown(source, url, labelFromName(stemOf(name)), listed) };
      pages.push(page);
      return { kind: 'page', url, title: page.title };
    });
  }

  const tree = nodesIn('');
  const levels = siteLevels(config, CONFIG_FILE, pages.map((page) => ({ unknownLevels: page.unknownLevels, path: page.url })), () => {});
  return {
    name: SAMPLE_NAME,
    tree,
    pages,
    folders: [],
    used: [],
    configProblem: null,
    wordsPerMinute: config.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE,
    dimensions: [],
    problems: [],
    ...levels,
  };
}

let html: string | undefined;

/** The theme preview page, made by the code that makes each docs page. The sample never changes, so it renders once. */
export function previewPage(): string {
  html ??= renderPage(viewOf(sampleSite(), SAMPLE_PAGE), { live: false, preview: true });
  return html;
}
