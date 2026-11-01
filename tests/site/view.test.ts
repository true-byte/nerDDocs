import { expect, test } from '@playwright/test';
import type { Site } from '../../src/site/scan.ts';
import { hasPage, nextUrl, viewOf } from '../../src/site/view.ts';

function siteOf(pages: Record<string, string>): Site {
  const list = Object.entries(pages).map(([url, source]) => ({
    url,
    source,
    title: source,
    titleId: source,
    html: `<p>${source}</p>`,
  }));
  return {
    name: 'Backup app',
    tree: list.map(({ url, title }) => ({ kind: 'page', url, title })),
    pages: list,
    folders: [],
  };
}

test('a page gives a view with its title and text', () => {
  const view = viewOf(siteOf({ '/restore.html': 'Restore a file' }), '/restore.html');
  expect(view.url).toBe('/restore.html');
  expect(view.title).toBe('Restore a file');
  expect(view.docTitle).toBe('Restore a file - Backup app');
  expect(view.html).toBe('<p>Restore a file</p>');
});

test('a page with the title of the site names it once in the window title', () => {
  const view = viewOf(siteOf({ '/README.html': 'Backup app' }), '/README.html');
  expect(view.docTitle).toBe('Backup app');
});

test('the site root gives the first page, or an empty page with no pages', () => {
  const site = siteOf({ '/restore.html': 'Restore', '/storage.html': 'Storage' });
  expect(viewOf(site, '/').url).toBe('/restore.html');
  const empty = viewOf(siteOf({}), '/');
  expect(empty.url).toBe('/');
  expect(empty.title).toBe('Backup app');
  expect(empty.docTitle).toBe('Backup app');
  expect(empty.html).toBe('');
});

test('an unknown address gives a 404 view that keeps the address', () => {
  const view = viewOf(siteOf({ '/restore.html': 'Restore' }), '/upgrade.html');
  expect(view.url).toBe('/upgrade.html');
  expect(view.title).toBe('404');
  expect(view.docTitle).toBe('404 - Backup app');
  expect(view.html).toBe('');
});

test('only an address with a page counts as a page', () => {
  const site = siteOf({ '/restore.html': 'Restore' });
  expect(hasPage(site, '/restore.html')).toBe(true);
  expect(hasPage(site, '/upgrade.html')).toBe(false);
});

test('an open page gets an update only when what it shows changes', () => {
  const one = viewOf(siteOf({ '/restore.html': 'Restore' }), '/restore.html');
  expect(viewOf(siteOf({ '/restore.html': 'Restore' }), '/restore.html').rev).toBe(one.rev);
  expect(viewOf(siteOf({ '/restore.html': 'Get a file back' }), '/restore.html').rev).not.toBe(one.rev);
  expect(viewOf(siteOf({ '/restore.html': 'Restore', '/storage.html': 'Storage' }), '/restore.html').rev).not.toBe(one.rev);
});

test('a reader stays on a page that still exists', () => {
  const site = siteOf({ '/restore.html': 'Restore' });
  expect(nextUrl(site, site, '/restore.html')).toBe('/restore.html');
});

test('a reader follows a renamed page, found by its text', () => {
  const before = siteOf({ '/storage.html': 'Storage', '/restore.html': 'Text' });
  const after = siteOf({ '/storage.html': 'Storage', '/guide/get-it-back.html': 'Text' });
  expect(nextUrl(before, after, '/restore.html')).toBe('/guide/get-it-back.html');
});

test('a reader follows a page renamed and edited at once, found by its title', () => {
  const before = siteOf({ '/restore.html': 'Text' });
  const after = siteOf({ '/get-it-back.html': 'Other' });
  after.pages[0]!.title = before.pages[0]!.title;
  expect(nextUrl(before, after, '/restore.html')).toBe('/get-it-back.html');
});

test('a reader on a renamed page follows the page with the same text before one with the same title', () => {
  const before = siteOf({ '/restore.html': 'Text' });
  const after = siteOf({ '/same-title.html': 'Other', '/same-text.html': 'Text' });
  after.pages[0]!.title = 'Text';
  after.pages[1]!.title = 'Another title';
  expect(nextUrl(before, after, '/restore.html')).toBe('/same-text.html');
});

test('a reader on a deleted page moves to the next page, or else the page before', () => {
  const before = siteOf({ '/agents.html': 'Agents', '/restore.html': 'Restore', '/storage.html': 'Storage' });
  expect(nextUrl(before, siteOf({ '/agents.html': 'Agents', '/storage.html': 'Storage' }), '/restore.html')).toBe('/storage.html');
  expect(nextUrl(before, siteOf({ '/agents.html': 'Agents', '/restore.html': 'Restore' }), '/storage.html')).toBe('/restore.html');
});

test('a reader on a deleted page with the same text as an older page moves to the next page', () => {
  const before = siteOf({ '/agents.html': 'Same text', '/restore.html': 'Same text', '/storage.html': 'Storage' });
  const after = siteOf({ '/agents.html': 'Same text', '/storage.html': 'Storage' });
  expect(nextUrl(before, after, '/restore.html')).toBe('/storage.html');
});

test('a reader on a page deleted with the next page moves to the next page that still exists', () => {
  const before = siteOf({ '/restore.html': 'Restore', '/schedules.html': 'Schedules', '/team.html': 'Team plan' });
  const after = siteOf({ '/team.html': 'Team plan' });
  expect(nextUrl(before, after, '/restore.html')).toBe('/team.html');
});

test('a reader on the last deleted page moves to the site root', () => {
  expect(nextUrl(siteOf({ '/restore.html': 'Restore' }), siteOf({}), '/restore.html')).toBe('/');
});

test('a reader on a 404 address or the site root stays there', () => {
  const site = siteOf({ '/restore.html': 'Restore' });
  expect(nextUrl(site, site, '/upgrade.html')).toBe('/upgrade.html');
  expect(nextUrl(siteOf({}), site, '/')).toBe('/');
});
