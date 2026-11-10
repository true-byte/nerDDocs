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
  anchors: {},
  linkLevels: {},
  linkTargets: {},
  neighbors: { previous: null, next: null },
};

const THREE_LEVELS = [
  { id: 'overview', name: 'Overview', icon: 'eye' },
  { id: 'requirements', name: 'Requirements', icon: 'list' },
  { id: 'internals', name: 'Internals', icon: 'cpu' },
];
const PICK_A_FILE = { id: 'pick-a-file', text: 'Pick a file', rank: 2, shows: null };
const SEARCH_INDEX = { id: 'search-index', text: 'Search index', rank: 3, shows: 'internals' };
const WEEKLY_PLAN = { id: 'weekly-plan', text: 'Weekly plan', rank: 2, shows: null };

/** The page 'Restore a file' next to 'Schedules', at three levels, with these outline rows on each. */
function pageWith(outline: OutlineRow[], schedules: OutlineRow[] = []): string {
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

/** 'Contents', the panel of pages and folders. */
const contentsOf = (html: string) => elementAround(html, 'nav', 'id="panel"');
/** The outline column. */
const columnOf = (html: string) => elementAround(html, 'aside', 'aria-label="Outline"');
const plainText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

test('each icon button shows its name as a tip on hover', () => {
  const html = pageWith([PICK_A_FILE]);
  for (const name of ['Hide contents', 'Show contents', 'Contents', 'Hide outline', 'Show outline', 'Outline', 'Close outline']) {
    expect(html).toContain(`aria-label="${name}" title="${name}"`);
  }
});

test("a button 'Search' with the search icon sits in the head of 'Contents' before 'Hide contents', and another one sits in the rail under 'Show contents'", () => {
  const SEARCH_ICON = 'M20 20l-4-4';
  const html = pageWith([PICK_A_FILE]);
  const head = elementAround(contentsOf(html), 'div', 'class="p-head"');
  const inHead = elementAround(head, 'button', 'id="findP"');
  expect(inHead).toMatch(openingTag('button', { id: 'findP', 'aria-label': 'Search' }));
  expect(inHead).toContain(SEARCH_ICON);
  expect(head.indexOf('id="findP"')).toBeLessThan(head.indexOf('id="closeP"'));

  const rail = elementAround(html, 'div', 'id="rail"');
  const inRail = elementAround(rail, 'button', 'id="findR"');
  expect(inRail).toMatch(openingTag('button', { id: 'findR', 'aria-label': 'Search' }));
  expect(inRail).toContain(SEARCH_ICON);
  expect(rail.indexOf('id="openP"')).toBeLessThan(rail.indexOf('id="findR"'));
});

test.describe('the outline', () => {
  test("'Contents' lists only pages and folders, with no headings and no arrow 'Outline'", () => {
    const contents = contentsOf(pageWith([PICK_A_FILE, SEARCH_INDEX], [WEEKLY_PLAN]));
    for (const id of ['pick-a-file', 'search-index', 'weekly-plan']) expect(contents).not.toContain(`#${id}"`);
    expect(contents).not.toContain('aria-label="Outline"');
    expect(contents).toMatch(/>Restore a file<\/a>/);
    expect(contents).toMatch(/>Schedules<\/a>/);
  });

  test("the headings of the open page sit in an aside 'Outline' with no title, and the headings of other pages sit nowhere", () => {
    const html = pageWith([PICK_A_FILE, SEARCH_INDEX], [WEEKLY_PLAN]);
    const column = columnOf(html);
    expect(column).toMatch(new RegExp(`${openingTag('a', { href: '#pick-a-file' }).source}Pick a file</a>`));
    expect(column).toMatch(new RegExp(`${openingTag('a', { href: '#search-index' }).source}Search index</a>`));
    expect(column).not.toMatch(/<h[1-6]\b/);
    expect(plainText(column)).toBe('Pick a file Search index');
    expect(html).not.toContain('#weekly-plan');
    expect(html).not.toContain('Weekly plan');
  });

  test("the column holds 'Hide outline', the page holds 'Show outline' and 'Close outline', and the bar holds 'Outline'", () => {
    const html = pageWith([PICK_A_FILE]);
    expect(columnOf(html)).toMatch(openingTag('button', { 'aria-label': 'Hide outline' }));
    expect(html).toMatch(openingTag('button', { 'aria-label': 'Show outline' }));
    expect(html).toMatch(openingTag('button', { 'aria-label': 'Close outline' }));
    expect(elementAround(html, 'div', 'id="bar"')).toMatch(openingTag('button', { 'aria-label': 'Outline' }));
  });

  test('a page with no headings has no column and no outline buttons, also when another page has headings', () => {
    const html = pageWith([], [WEEKLY_PLAN]);
    expect(html).not.toMatch(/<aside\b/);
    for (const name of ['Outline', 'Hide outline', 'Show outline', 'Close outline']) expect(html).not.toContain(`aria-label="${name}"`);
  });
});

test.describe('a folder with a page of its own', () => {
  const tree: TreeNode[] = [
    { kind: 'page', url: '/README.html', title: 'Backup app' },
    {
      kind: 'section',
      id: 'backups',
      title: 'Backups overview',
      url: '/backups/index.html',
      children: [{ kind: 'page', url: '/backups/restore.html', title: 'Restore a file' }],
    },
    {
      kind: 'section',
      id: 'agents',
      title: 'Agents',
      children: [{ kind: 'page', url: '/agents/install.html', title: 'Install the agent' }],
    },
  ];
  const contentsAt = (url: string) => contentsOf(renderToString(createElement(Contents, { initial: { ...initial, url, tree } })));
  const rowOf = (contents: string, title: string) => elementAround(contents, 'li', `>${title}</a>`);

  test("is one row: its name links to its page, and its arrow 'Subtopics' holds the rows of the other pages", () => {
    const contents = contentsAt('/README.html');
    const row = rowOf(contents, 'Backups overview');
    expect(row).toMatch(new RegExp(`${openingTag('a', { href: 'backups/index.html' }).source}Backups overview</a>`));
    expect(row).toMatch(openingTag('button', { 'aria-label': 'Subtopics', title: 'Subtopics', 'aria-expanded': 'true' }));
    expect(row).toMatch(new RegExp(`${openingTag('a', { href: 'backups/restore.html' }).source}Restore a file</a>`));
    expect(contents.match(/href="backups\/index\.html"/g)).toHaveLength(1);
    expect(contents).not.toContain('>Backups<');
  });

  test('a folder with no page of its own is a row named by the folder, with no link', () => {
    const contents = contentsAt('/README.html');
    expect(contents).toMatch(/<button\b[^>]*>(?:(?!<\/button>).)*Agents<\/button>/s);
    expect(contents).not.toMatch(/>Agents<\/a>/);
  });

  test('the row of the open folder page is the current page', () => {
    const row = rowOf(contentsAt('/backups/index.html'), 'Backups overview');
    expect(row).toMatch(new RegExp(`${openingTag('a', { href: 'index.html', 'aria-current': 'page' }).source}Backups overview</a>`));
    expect(contentsAt('/README.html')).not.toMatch(/aria-current="page"[^>]*>Backups overview</);
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
    expect(link('User guide')).toMatch(openingTag('a', { class: 'dim on', href: 'restore.html', 'aria-current': 'true' }));
    expect(link('Administration')).toMatch(openingTag('a', { class: 'dim', href: '../../administration/install.html' }));
    expect(link('Administration')).not.toContain('aria-current');
    expect(link('Legal and privacy')).toMatch(openingTag('a', { class: 'dim', href: '../../legal/privacy.html' }));
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

    const legal = panelAt('/legal/privacy.html', DIMENSIONS);
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
