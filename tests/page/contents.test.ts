import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test } from '@playwright/test';
import type { OutlineRow } from '../../src/markdown/render.ts';
import { Contents, type ContentsData } from '../../src/page/contents.tsx';
import type { Dimension } from '../../src/site/config.ts';
import type { TreeNode } from '../../src/site/scan.ts';
import { DIMENSION_TREE, DIMENSIONS, RESTORE } from '../support/dimensions.ts';
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
  diagrams: 'none' as const,
  dimensions: [],
};

test('each icon button shows its name as a tip on hover', () => {
  const html = renderToString(createElement(Contents, { initial }));
  for (const name of ['Hide contents', 'Show contents', 'Contents']) {
    expect(html).toContain(`aria-label="${name}" title="${name}"`);
  }
});

test.describe('the outline of each page', () => {
  const THREE_LEVELS = [
    { id: 'overview', name: 'Overview', icon: 'eye' },
    { id: 'requirements', name: 'Requirements', icon: 'list' },
    { id: 'internals', name: 'Internals', icon: 'cpu' },
  ];
  const PICK_A_FILE = { id: 'pick-a-file', text: 'Pick a file', rank: 2, shows: null };
  const SEARCH_INDEX = { id: 'search-index', text: 'Search index', rank: 3, shows: 'internals' };
  const WEEKLY_PLAN = { id: 'weekly-plan', text: 'Weekly plan', rank: 2, shows: null };

  /** The panel of 'Restore a file' next to 'Schedules', with these outline rows on each. */
  function panelWith(outline: OutlineRow[], schedules: OutlineRow[] = []): string {
    const data: ContentsData = {
      ...initial,
      tree: [
        { kind: 'page', url: '/restore.html', title: 'Restore a file', outline },
        { kind: 'page', url: '/schedules.html', title: 'Schedules', outline: schedules },
      ],
      levels: THREE_LEVELS,
      defaultLevel: 'overview',
      parts: ['internals'],
      hasShared: true,
      hasSharedText: true,
    };
    return renderToString(createElement(Contents, { initial: data }));
  }
  const pageItem = (html: string, title: string) => elementAround(html, 'li', `>${title}</a>`);
  const rowItem = (html: string, id: string) => elementAround(html, 'li', `href="#${id}"`);
  const arrowOf = (html: string, title = 'Restore a file') => elementAround(pageItem(html, title), 'span', /class="fold\b/);

  test('the rows of the outline show under the current page only', () => {
    const html = panelWith([PICK_A_FILE, SEARCH_INDEX], [WEEKLY_PLAN]);
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

  test("the current page row holds the arrow 'Outline' in its slot, open", () => {
    const html = panelWith([PICK_A_FILE, SEARCH_INDEX]);
    const slot = elementAround(pageItem(html, 'Restore a file'), 'span', /<button\b/);
    expect(slot).toMatch(/^<span class="nochev">/);
    expect(slot).toMatch(
      openingTag('button', { type: 'button', class: 'fold', 'aria-label': 'Outline', title: 'Outline', 'aria-expanded': 'true' }),
    );
    expect(pageItem(html, 'Schedules')).not.toMatch(/fold/);
  });

  test("another page with headings holds the arrow 'Outline' in its slot, closed", () => {
    const html = panelWith([], [WEEKLY_PLAN]);
    const slot = elementAround(pageItem(html, 'Schedules'), 'span', /<button\b/);
    expect(slot).toMatch(/^<span class="nochev">/);
    expect(slot).toMatch(
      openingTag('button', { type: 'button', class: 'fold shut', 'aria-label': 'Outline', title: 'Outline', 'aria-expanded': 'false' }),
    );
    expect(pageItem(html, 'Restore a file')).not.toMatch(/fold/);
  });

  test('the arrow shows at the levels of its rows when every row has levels', () => {
    const leveled = panelWith([SEARCH_INDEX, { ...PICK_A_FILE, shows: 'requirements internals' }], [{ ...WEEKLY_PLAN, shows: 'internals' }]);
    expect(arrowOf(leveled)).toMatch(openingTag('button', { class: 'fold', 'data-shows': 'requirements internals' }));
    expect(arrowOf(leveled, 'Schedules')).toMatch(openingTag('button', { class: 'fold shut', 'data-shows': 'internals' }));
    const shared = panelWith([SEARCH_INDEX, PICK_A_FILE], [WEEKLY_PLAN]);
    expect(arrowOf(shared)).toMatch(/<button(?![^>]*data-shows)[^>]*>/);
    expect(arrowOf(shared, 'Schedules')).toMatch(/<button(?![^>]*data-shows)[^>]*>/);
  });

  test('a page with no headings has no arrow and no rows', () => {
    const html = panelWith([]);
    expect(html).not.toMatch(/class="fold/);
    expect(html).not.toMatch(/class="ol"/);
  });
});

test.describe('dimensions', () => {
  /** The panel on the page at `url` of a site with these dimensions. */
  const panelAt = (url: string, dimensions: Dimension[], tree: TreeNode[] = DIMENSION_TREE) =>
    renderToString(createElement(Contents, { initial: { ...initial, url, tree, dimensions } }));
  const dimsOf = (html: string) => elementAround(html, 'div', 'id="dims"');
  const listOf = (html: string) => elementAround(html, 'ul', 'id="dimL"');
  const treeOf = (html: string) => elementAround(html, 'div', 'id="tree"');
  const buttonOf = (html: string) => elementAround(html, 'button', 'id="dimB"');
  /** The names of the page rows, in their order. */
  const rowsOf = (html: string) => [...html.matchAll(/<a\b[^>]*\sclass="leaf"[^>]*>([^<]*)<\/a>/g)].map((match) => match[1]);
  const UP_DOWN = 'M8 9l4-4 4 4M8 15l4 4 4-4';
  const CHECK = 'M5 12l5 5L20 7';

  test('with two or more dimensions, the button and the closed list sit between the head and the tree', () => {
    const html = panelAt(RESTORE, DIMENSIONS);
    expect(html.indexOf('class="p-head"')).toBeLessThan(html.indexOf('id="dims"'));
    expect(html.indexOf('id="dims"')).toBeLessThan(html.indexOf('id="tree"'));
    const dims = dimsOf(html);
    const button = openingTag('button', { type: 'button', id: 'dimB', class: 'dim-btn', 'aria-expanded': 'false', 'aria-controls': 'dimL' });
    expect(dims).toMatch(new RegExp(`${button.source}<span class="dn">User guide</span>`));
    expect(buttonOf(dims)).toContain(UP_DOWN);
    expect(dims).toMatch(openingTag('ul', { id: 'dimL', class: 'dim-pop', 'aria-label': 'Dimensions', hidden: '' }));
    expect(dims).not.toContain('aria-haspopup');
  });

  test('the list holds a link per dimension in the order of the config, and marks the current one', () => {
    const list = listOf(panelAt(RESTORE, DIMENSIONS));
    const names = ['User guide', 'Administration', 'Legal and privacy'];
    expect([...list.matchAll(/<span class="dn">([^<]*)<\/span>/g)].map((match) => match[1])).toEqual(names);
    const link = (name: string) => elementAround(list, 'a', `<span class="dn">${name}</span>`);
    expect(link('User guide')).toMatch(openingTag('a', { class: 'dim on', href: '01-restore.html', 'aria-current': 'true' }));
    expect(link('Administration')).toMatch(openingTag('a', { class: 'dim', href: '../../administration/01-install.html' }));
    expect(link('Administration')).not.toContain('aria-current');
    expect(link('Legal and privacy')).toMatch(openingTag('a', { class: 'dim', href: '../../legal/01-privacy.html' }));
    for (const name of names) expect(link(name), name).toContain(CHECK);
  });

  test('the tree shows the inside of the folder of the current dimension, with no row for the folder', () => {
    const tree = treeOf(panelAt(RESTORE, DIMENSIONS));
    expect(tree).toMatch(/^<div[^>]*><ul><li class="pg">/);
    expect(rowsOf(tree)[0]).toBe('Get started');
    expect(rowsOf(tree)).toContain('Restore a file');
    expect(tree).toContain('data-section="user-guide/backups"');
    expect(tree).not.toContain('data-section="user-guide"');
    expect(tree).not.toContain('Install the server');
    expect(tree).not.toContain('Privacy');

    const legal = panelAt('/legal/01-privacy.html', DIMENSIONS);
    expect(rowsOf(treeOf(legal))).toEqual(['Privacy']);
    expect(treeOf(legal)).not.toContain('data-section');
    expect(buttonOf(legal)).toContain('<span class="dn">Legal and privacy</span>');
  });

  test('one dimension shows the inside of its folder, with no button', () => {
    const html = panelAt(RESTORE, DIMENSIONS.slice(0, 1), DIMENSION_TREE.slice(0, 1));
    expect(html).not.toContain('id="dims"');
    expect(rowsOf(treeOf(html))).toContain('Restore a file');
    expect(treeOf(html)).not.toContain('data-section="user-guide"');
  });

  test('a page outside every dimension shows the first dimension', () => {
    const html = panelAt('/missing.html', DIMENSIONS);
    expect(buttonOf(html)).toContain('<span class="dn">User guide</span>');
    expect(rowsOf(treeOf(html))).toContain('Get started');
  });

  test('with no dimensions, the panel draws the whole tree as before', () => {
    const html = panelAt(RESTORE, []);
    expect(html).not.toContain('id="dims"');
    expect(treeOf(html)).toContain('data-section="user-guide"');
    expect(rowsOf(treeOf(html))).toContain('Install the server');
  });
});
