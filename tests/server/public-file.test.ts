import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { folderWith } from '../support/folder.ts';
import { contentTypeOf, findPublicFile, publicUrlPath } from '../../src/server/public-file.ts';

test('a file is sent with the type of its extension, at any case', () => {
  expect(contentTypeOf('restore-window.png')).toBe('image/png');
  expect(contentTypeOf('RESTORE-WINDOW.PNG')).toBe('image/png');
  expect(contentTypeOf('api/openapi.yaml')).toBe('text/plain; charset=utf-8');
  expect(contentTypeOf('restore-wizard.html')).toBe('text/html; charset=utf-8');
});

const SHOWN_TYPES: Record<string, string> = {
  'restore-window.avif': 'image/avif',
  'restore.css': 'text/css; charset=utf-8',
  'restore-window.gif': 'image/gif',
  'restore-wizard.html': 'text/html; charset=utf-8',
  'favicon.ico': 'image/x-icon',
  'restore-window.jpeg': 'image/jpeg',
  'restore-window.jpg': 'image/jpeg',
  'restore-wizard.js': 'text/javascript; charset=utf-8',
  'plans.json': 'application/json; charset=utf-8',
  'restore.mp4': 'video/mp4',
  'restore-guide.pdf': 'application/pdf',
  'restore-window.png': 'image/png',
  'restore-window.svg': 'image/svg+xml',
  'restore-notes.txt': 'text/plain; charset=utf-8',
  'restore.webm': 'video/webm',
  'restore-window.webp': 'image/webp',
  'backup-font.woff2': 'font/woff2',
  'openapi.yaml': 'text/plain; charset=utf-8',
  'openapi.yml': 'text/plain; charset=utf-8',
};
for (const [name, type] of Object.entries(SHOWN_TYPES)) {
  test(`${name} opens in the browser, sent as ${type}`, () => {
    expect(contentTypeOf(name)).toBe(type);
  });
}

test('a file of an unknown type is sent as plain bytes', () => {
  expect(contentTypeOf('backup-agent.bin')).toBe('application/octet-stream');
  expect(contentTypeOf('LICENSE')).toBe('application/octet-stream');
});

test('an address gives its decoded path, with no query', () => {
  expect(publicUrlPath('/')).toBe('/');
  expect(publicUrlPath('/images/restore-window.png?v=2')).toBe('/images/restore-window.png');
  expect(publicUrlPath('/user%20guide/caf%C3%A9.png')).toBe('/user guide/café.png');
});

test('dot names and node_modules have no public address', () => {
  for (const address of [
    '/.git/config',
    '/.env',
    '/%2egit/config',
    '/node_modules/backup-agent/index.js',
    '/backups/node_modules/backup-agent/index.js',
    '/.drafts/plan.md',
  ]) {
    expect(publicUrlPath(address)).toBeNull();
  }
});

test('an address with a broken escape or a null byte has no public path', () => {
  expect(publicUrlPath('/%')).toBeNull();
  expect(publicUrlPath('/images%00/restore-window.png')).toBeNull();
});

test('an address with .. stays inside the folder', () => {
  expect(publicUrlPath('/../../etc/passwd')).toBe('/etc/passwd');
  expect(publicUrlPath('/images/%2e%2e/restore-window.png')).toBe('/restore-window.png');
});

test('a file of the folder is found, and a folder or a missing file is not', async () => {
  const folder = await folderWith({ 'images/restore-window.png': 'png' });

  expect(await findPublicFile(folder, '/images/restore-window.png')).toBe(join(folder, 'images/restore-window.png'));
  expect(await findPublicFile(folder, '/images')).toBeNull();
  expect(await findPublicFile(folder, '/images/schedules.png')).toBeNull();
});

test('a path that climbs out of the folder finds nothing', async () => {
  const parent = await folderWith({ 'storage-keys.txt': 'top secret', 'site/restore.md': '# Restore a file' });
  expect(await findPublicFile(join(parent, 'site'), '/../storage-keys.txt')).toBeNull();
});

test('a symbolic link that leaves the folder is not followed', async () => {
  const outside = await folderWith({ 'storage-keys.txt': 'top secret' });
  const folder = await folderWith({ 'restore.md': '# Restore a file' });
  await symlink(join(outside, 'storage-keys.txt'), join(folder, 'link.txt'));
  await symlink(outside, join(folder, 'linked'));

  expect(await findPublicFile(folder, '/link.txt')).toBeNull();
  expect(await findPublicFile(folder, '/linked/storage-keys.txt')).toBeNull();
});

test('a symbolic link to a dot file of the folder is not followed', async () => {
  const folder = await folderWith({ '.env': 'top secret' });
  await symlink(join(folder, '.env'), join(folder, 'settings.txt'));
  expect(await findPublicFile(folder, '/settings.txt')).toBeNull();
});

test('a symbolic link to a public file of the folder is followed', async () => {
  const folder = await folderWith({ 'images/restore-window.png': 'png' });
  await symlink(join(folder, 'images/restore-window.png'), join(folder, 'window.png'));
  expect(await findPublicFile(folder, '/window.png')).toBe(join(folder, 'images/restore-window.png'));
});
