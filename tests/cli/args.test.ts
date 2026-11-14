import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { folderWith } from '../support/folder.ts';
import { chooseFolder, parseArgs } from '../../src/cli/args.ts';

test('no arguments give the serve command, port 4000, the default folder and an open browser', () => {
  expect(parseArgs([])).toEqual({ command: 'serve', folder: null, port: 4000, open: true });
});

test('the folder, --port and --no-open are read', () => {
  expect(parseArgs(['guide', '--port', '4500', '--no-open'])).toEqual({
    command: 'serve',
    folder: 'guide',
    port: 4500,
    open: false,
  });
  expect(parseArgs(['--port=4501']).port).toBe(4501);
});

test('--port takes each port from 0 to 65535', () => {
  expect(parseArgs(['--port', '0']).port).toBe(0);
  expect(parseArgs(['--port', '65535']).port).toBe(65535);
});

const badArgs: [string[], string][] = [
  [['--color'], 'Unknown flag: --color'],
  [['-p', '4500'], 'Unknown flag: -p'],
  [['--port', '65536'], 'Bad port: 65536'],
  [['--port'], 'Bad port: (none)'],
  [['--port='], 'Bad port: (none)'],
  [['--port', 'high'], 'Bad port: high'],
  [['--port', '-1'], 'Bad port: -1'],
  [['--port', '40.5'], 'Bad port: 40.5'],
  [['--port=70000'], 'Bad port: 70000'],
  [['guide', 'admin'], 'Too many folders: admin'],
];

test('a first argument of check gives the check command, and any later check is the folder', () => {
  expect(parseArgs(['check'])).toMatchObject({ command: 'check', folder: null });
  expect(parseArgs(['check', 'guide'])).toMatchObject({ command: 'check', folder: 'guide' });
  expect(parseArgs(['check', 'check'])).toMatchObject({ command: 'check', folder: 'check' });
  expect(parseArgs(['./check'])).toMatchObject({ command: 'serve', folder: './check' });
  expect(parseArgs(['--no-open', 'check'])).toMatchObject({ command: 'serve', folder: 'check', open: false });
});

const badCheckArgs: [string[], string][] = [
  [['check', '--port', '4500'], 'Unknown flag: --port'],
  [['check', '--no-open'], 'Unknown flag: --no-open'],
  [['check', 'guide', 'admin'], 'Too many folders: admin'],
  [['guide', 'check'], 'Too many folders: check'],
];
for (const [argv, line] of [...badArgs, ...badCheckArgs]) {
  test(`${argv.join(' ')} prints "${line}"`, () => {
    expect(() => parseArgs(argv)).toThrow(line);
  });
}

test('the folder defaults to ./docs when it exists, otherwise the current folder', async () => {
  const withDocs = await folderWith({ 'docs/restore.md': '# Restore a file' });
  const withoutDocs = await folderWith({});

  expect(chooseFolder(null, withDocs)).toBe(join(withDocs, 'docs'));
  expect(chooseFolder(null, withoutDocs)).toBe(withoutDocs);
});

test('a file named docs leaves the current folder as the default', async () => {
  const folder = await folderWith({ docs: 'The notes of the backup app.' });
  expect(chooseFolder(null, folder)).toBe(folder);
});

test('a named folder can sit beside the current folder', async () => {
  const parent = await folderWith({ 'backup-app/guide/restore.md': '# Restore a file', 'clone/README.md': '# Clone' });
  expect(chooseFolder('../backup-app/guide', join(parent, 'clone'))).toBe(join(parent, 'backup-app/guide'));
});

test('a named folder must exist and must be a folder', async () => {
  const folder = await folderWith({ 'restore.md': '# Restore a file' });

  expect(chooseFolder('.', folder)).toBe(folder);
  expect(() => chooseFolder('backups', folder)).toThrow('Missing folder: backups');
  expect(() => chooseFolder('restore.md', folder)).toThrow('Not a folder: restore.md');
});
