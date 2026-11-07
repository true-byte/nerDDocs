import { expect, test } from '@playwright/test';
import { encodeUrl, hrefTo, pageUrl } from '../../src/site/urls.ts';

test('a Markdown file gets a page address', () => {
  expect(pageUrl('restore.md')).toBe('/restore.html');
  expect(pageUrl('user-guide/Restore.MD')).toBe('/user-guide/Restore.html');
});

test('a page address drops the order prefix of each folder name and of the file stem, when text is left after it', () => {
  expect(pageUrl('user-guide/01-backups/01-restore.md')).toBe('/user-guide/backups/restore.html');
  expect(pageUrl('01-backups/index.md')).toBe('/backups/index.html');
  expect(pageUrl('02_agents/003 install.md')).toBe('/agents/install.html');
  expect(pageUrl('2024-report.md')).toBe('/2024-report.html');
  expect(pageUrl('1.md')).toBe('/1.html');
});

test('only the .md at the end of a path changes in a page address', () => {
  expect(pageUrl('guide.md/restore.md')).toBe('/guide.md/restore.html');
  expect(pageUrl('notes.mdx-old.md')).toBe('/notes.mdx-old.html');
});

test('a link is relative to the page that holds it', () => {
  expect(hrefTo('/restore.html', '/schedules.html')).toBe('schedules.html');
  expect(hrefTo('/backups/restore.html', '/backups/schedules.html')).toBe('schedules.html');
  expect(hrefTo('/backups/restore.html', '/storage.html')).toBe('../storage.html');
  expect(hrefTo('/storage.html', '/backups/restore.html')).toBe('backups/restore.html');
  expect(hrefTo('/backups/plans/team.html', '/backups/agents/install.html')).toBe('../agents/install.html');
  expect(hrefTo('/', '/__nerddocs/app.js')).toBe('__nerddocs/app.js');
});

test('a link encodes what a URL cannot hold', () => {
  expect(hrefTo('/restore.html', '/user guide/café #1.html')).toBe(
    'user%20guide/caf%C3%A9%20%231.html',
  );
  expect(encodeUrl('/user guide/restore?.html')).toBe('/user%20guide/restore%3F.html');
});
