import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { filesUnder } from './support/export.ts';
import { folderWith, withConfig } from './support/folder.ts';
import { REPO, startCommand } from './support/run-command.ts';

/** The docs of the backup app: its config and two pages. */
const DOCS = withConfig({ 'restore.md': '# Restore a file\n\nPick a file and a day.\n', 'storage.md': '# Storage\n\nBlocks are stored once.\n' });

/** The backup app, a project that installs the package from the file that `npm pack` makes. */
let app = '';

// The tests run one after the other in one worker, so the pack and the install run once.
test.describe.configure({ mode: 'default' });

/** The variables of a terminal. `npm test` sets variables that would point another npm at this clone. */
const shell = (): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('npm_') && name !== 'INIT_CWD'));

test.beforeAll(async () => {
  // A pack and an install take longer on a busy computer.
  test.setTimeout(60_000);
  app = await folderWith({
    'package.json': JSON.stringify({ name: 'backup-app', private: true }),
    ...Object.fromEntries(Object.entries(DOCS).map(([name, text]) => [`docs/${name}`, text])),
  });
  const pack = execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', app], { cwd: REPO, env: shell(), encoding: 'utf8' });
  const [{ filename }] = JSON.parse(pack) as [{ filename: string }];
  execFileSync('npm', ['install', '--offline', '--no-audit', '--no-fund', join(app, filename)], { cwd: app, env: shell(), stdio: 'pipe' });
});

test.afterAll(() => {
  if (app) rmSync(app, { recursive: true, force: true });
});

/** Runs `npx nerddocs` with the arguments in the backup app, and gives its status and its output once it stops. */
function npx(args: string[]): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('npx', ['nerddocs', ...args], { cwd: app, env: shell() }, (error, stdout, stderr) =>
      resolve({ status: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr }),
    );
  });
}

test('the installed package is public, holds four files and installs no dependency', () => {
  const installed = join(app, 'node_modules/nerddocs');
  expect(filesUnder(installed)).toEqual(['LICENSE', 'README.md', 'dist/nerddocs.cjs', 'package.json']);
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')) as Record<string, unknown>;
  // npm refuses to publish a private package.
  expect(manifest.private).toBeUndefined();
  expect(manifest.bin).toEqual({ nerddocs: 'dist/nerddocs.cjs' });
  expect(manifest.dependencies).toBeUndefined();
  expect(readdirSync(join(app, 'node_modules')).filter((name) => !name.startsWith('.'))).toEqual(['nerddocs']);
});

test('npx nerddocs check in the backup app prints Problems: 0', async () => {
  const result = await npx(['check']);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('\nProblems: 0\n');
});

test('npx nerddocs export in the backup app writes nerddocs-export/index.html', async () => {
  const result = await npx(['export']);
  expect(result.status, result.stderr).toBe(0);
  expect(existsSync(join(app, 'nerddocs-export/index.html'))).toBe(true);
});

test('the installed nerddocs command serves the docs of the backup app', async () => {
  const run = await startCommand([join(app, 'node_modules/.bin/nerddocs'), '--port', '0', '--no-open'], { cwd: app });
  try {
    expect(await (await fetch(run.address)).text()).toContain('Restore a file');
  } finally {
    await run.stop();
  }
});
