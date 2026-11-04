import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test } from '@playwright/test';
import { Contents, type ContentsData } from '../../src/page/contents.tsx';
import { elementAround, openingTag } from '../support/html.ts';

const initial = {
  url: '/restore.html',
  rev: 'r1',
  siteName: 'Backup app',
  tree: [{ kind: 'page' as const, url: '/restore.html', title: 'Restore a file' }],
  live: false,
  levels: [],
  defaultLevel: '',
  parts: [],
  hasShared: false,
  hasSharedText: false,
  configProblem: null,
  readTimes: [],
  outline: [],
  diagrams: 'none' as const,
};

test('each icon button shows its name as a tip on hover', () => {
  const html = renderToString(createElement(Contents, { initial }));
  for (const name of ['Hide contents', 'Show contents', 'Contents']) {
    expect(html).toContain(`aria-label="${name}" title="${name}"`);
  }
});

test.describe('the outline of the current page', () => {
  const THREE_LEVELS = [
    { id: 'overview', name: 'Overview', icon: 'eye' },
    { id: 'requirements', name: 'Requirements', icon: 'list' },
    { id: 'internals', name: 'Internals', icon: 'cpu' },
  ];
  const PICK_A_FILE = { id: 'pick-a-file', text: 'Pick a file', rank: 2, shows: null };
  const SEARCH_INDEX = { id: 'search-index', text: 'Search index', rank: 3, shows: 'internals' };

  /** The panel of 'Restore a file' next to 'Schedules', with these outline rows. */
  function panelWith(outline: ContentsData['outline']): string {
    const data: ContentsData = {
      ...initial,
      tree: [
        { kind: 'page', url: '/restore.html', title: 'Restore a file' },
        { kind: 'page', url: '/schedules.html', title: 'Schedules' },
      ],
      levels: THREE_LEVELS,
      defaultLevel: 'overview',
      parts: ['internals'],
      hasShared: true,
      hasSharedText: true,
      outline,
    };
    return renderToString(createElement(Contents, { initial: data }));
  }
  const pageItem = (html: string, title: string) => elementAround(html, 'li', `>${title}</a>`);
  const rowItem = (html: string, id: string) => elementAround(html, 'li', `href="#${id}"`);
  const arrowOf = (html: string) => elementAround(pageItem(html, 'Restore a file'), 'span', 'class="fold"');

  test('the rows of the outline show under the current page only', () => {
    const html = panelWith([PICK_A_FILE, SEARCH_INDEX]);
    const current = pageItem(html, 'Restore a file');
    expect(current.match(/<ul class="ol"/g)).toHaveLength(1);
    expect(current).toMatch(new RegExp(`${openingTag('a', { class: 'oln', href: '#pick-a-file' }).source}Pick a file</a>`));
    expect(current).toMatch(new RegExp(`${openingTag('a', { class: 'oln', href: '#search-index' }).source}Search index</a>`));
    expect(html.match(/class="oln"/g)).toHaveLength(2);
    expect(pageItem(html, 'Schedules')).not.toMatch(/class="ol"/);
  });

  test('a row of the second rank sits one step in, by the ranks of the outline', () => {
    const html = panelWith([
      { id: 'the-copy-rule', text: 'The copy rule', rank: 3, shows: null },
      { id: 'index-size', text: 'Index size', rank: 4, shows: null },
    ]);
    expect(rowItem(html, 'index-size')).toMatch(/^<li class="r2"[\s>]/);
    expect(rowItem(html, 'the-copy-rule')).toMatch(/^<li(?![^>]*\sclass=)[^>]*>/);
  });

  test('a row carries data-shows, and a row at every level carries none', () => {
    const html = panelWith([PICK_A_FILE, SEARCH_INDEX]);
    expect(rowItem(html, 'search-index')).toMatch(/^<li\b[^>]*\sdata-shows="internals"/);
    expect(rowItem(html, 'pick-a-file')).toMatch(/^<li(?![^>]*data-shows)[^>]*>/);
  });

  test("the current page row holds the arrow 'Outline' in its slot", () => {
    const html = panelWith([PICK_A_FILE, SEARCH_INDEX]);
    const slot = elementAround(pageItem(html, 'Restore a file'), 'span', /<button\b/);
    expect(slot).toMatch(/^<span class="nochev">/);
    expect(slot).toMatch(
      openingTag('button', { type: 'button', class: 'fold', 'aria-label': 'Outline', title: 'Outline', 'aria-expanded': 'true' }),
    );
    expect(pageItem(html, 'Schedules')).not.toMatch(/fold/);
  });

  test('the arrow shows at the levels of its rows when every row has levels', () => {
    const leveled = panelWith([SEARCH_INDEX, { ...PICK_A_FILE, shows: 'requirements internals' }]);
    expect(arrowOf(leveled)).toMatch(openingTag('button', { class: 'fold', 'data-shows': 'requirements internals' }));
    const shared = panelWith([SEARCH_INDEX, PICK_A_FILE]);
    expect(arrowOf(shared)).toMatch(/<button(?![^>]*data-shows)[^>]*>/);
  });

  test('a page with no headings has no arrow and no rows', () => {
    const html = panelWith([]);
    expect(html).not.toMatch(/class="fold/);
    expect(html).not.toMatch(/class="ol"/);
  });
});
