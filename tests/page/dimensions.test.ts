import { expect, test } from '@playwright/test';
import { currentDimension, dimensionNodes, dimensionPages, dimensionTarget, lastPagesOf } from '../../src/page/dimensions.ts';
import type { TreeNode } from '../../src/site/scan.ts';
import { DIMENSION_TREE, DIMENSIONS, RESTORE } from '../support/dimensions.ts';

const INSTALL = '/administration/01-install.html';
const USERS = '/administration/02-users.html';

test('the current dimension is the one whose folder holds the page', () => {
  expect(currentDimension(DIMENSIONS, USERS)?.folder).toBe('administration');
  expect(currentDimension(DIMENSIONS, '/legal/01-privacy.html')?.folder).toBe('legal');
});

test('an address outside every dimension takes the first dimension, and a site with none has none', () => {
  expect(currentDimension(DIMENSIONS, '/missing.html')?.folder).toBe('user-guide');
  expect(currentDimension(DIMENSIONS, '/user-guide-old/restore.html')?.folder).toBe('user-guide');
  expect(currentDimension([], RESTORE)).toBeNull();
});

test('the tree of a dimension is the inside of its top folder', () => {
  const [userGuide] = DIMENSION_TREE;
  expect(dimensionNodes(DIMENSION_TREE, 'user-guide')).toEqual(userGuide?.kind === 'section' ? userGuide.children : null);
  expect(dimensionNodes(DIMENSION_TREE, 'archive')).toEqual([]);
  expect(dimensionNodes(DIMENSION_TREE, 'user-guide/backups')).toEqual([]);
});

test('the pages of a dimension come in tree order', () => {
  expect(dimensionPages(DIMENSION_TREE, 'user-guide')).toEqual([
    '/user-guide/index.html',
    '/user-guide/backups/01-restore.html',
    '/user-guide/backups/02-schedules.html',
  ]);
});

test('a link goes to the stored page of its dimension while the dimension holds it', () => {
  expect(dimensionTarget(DIMENSION_TREE, 'administration', { administration: USERS })).toBe(USERS);
});

test('a stored page that is gone, a page of another dimension or no stored page gives the first page', () => {
  const storedPages: Record<string, string>[] = [{ administration: '/administration/09-gone.html' }, { administration: '/legal/01-privacy.html' }, {}];
  for (const stored of storedPages) {
    expect(dimensionTarget(DIMENSION_TREE, 'administration', stored), JSON.stringify(stored)).toBe(INSTALL);
  }
  expect(dimensionTarget(DIMENSION_TREE, 'archive', {})).toBeNull();
});

test('a folder named like a key of every object finds no stored page', () => {
  const tree: TreeNode[] = [
    { kind: 'section', id: 'constructor', title: 'Constructor', children: [{ kind: 'page', url: '/constructor/index.html', title: 'Constructor' }] },
  ];
  expect(dimensionTarget(tree, 'constructor', {})).toBe('/constructor/index.html');
});

test('the stored pages read only an object of texts', () => {
  for (const text of [null, 'not json', '[]', 'null', '"user-guide"']) expect(lastPagesOf(text), String(text)).toEqual({});
  expect(lastPagesOf('{"user-guide":"/user-guide/index.html","legal":3}')).toEqual({ 'user-guide': '/user-guide/index.html' });
});
