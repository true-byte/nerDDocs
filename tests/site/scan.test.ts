import { spawnSync } from 'node:child_process';
import fs, { chmod, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { replaceBuiltin } from '../support/builtins.ts';
import { folderWith } from '../support/folder.ts';
import { holdNextRead } from '../support/held-read.ts';
import { srcdocsOf } from '../support/html.ts';
import { pngFile, svgImage } from '../support/images.ts';
import { BACKUP_API_PAGE, BROKEN_SPEC, ERROR_SCHEMA, INTERNALS_FIRST, SPLIT_SPEC } from '../support/openapi.ts';
import { WIZARD, WIZARD_CSS, WIZARD_HTML, WIZARD_JS, WIZARD_LINE } from '../support/wireframes.ts';
import { DEFAULT_TEXT_WIDTH, DEFAULT_WORDS_PER_MINUTE } from '../../src/site/config.ts';
import { isPublicPath, scanSite, siteName, type Site, type TreeNode } from '../../src/site/scan.ts';

function outline(nodes: TreeNode[]): unknown[] {
  return nodes.map((node) =>
    node.kind === 'page' ? node.title : { [node.title]: outline(node.children) },
  );
}

test('folders are sections, Markdown files are pages, and file names set the order', async () => {
  const folder = await folderWith({
    'storage.md': '# Storage',
    'backups/restore.md': '# Restore a file',
    'backups/schedules.md': 'No heading here.',
    'backups/plans/02-team.md': '# Team plan',
    'backups/plans/01-basic.md': '# Basic plan',
    'README.md': '# Backup app',
    'images/restore-window.png': 'png',
  });

  const site = await scanSite(folder);

  expect(outline(site.tree)).toEqual([
    'Backup app',
    { Backups: [{ Plans: ['Basic plan', 'Team plan'] }, 'Restore a file', 'Schedules'] },
    'Storage',
  ]);
  expect(site.pages.map((page) => page.url)).toEqual([
    '/README.html',
    '/backups/plans/01-basic.html',
    '/backups/plans/02-team.html',
    '/backups/restore.html',
    '/backups/schedules.html',
    '/storage.html',
  ]);
});

test('a number sets the order and leaves the title of a file with no heading', async () => {
  const folder = await folderWith({
    '02-schedules.md': 'A plan says how often.',
    '01-restore.md': 'Pick a file and a day.',
    'guide/agents.md': '# Agents',
    'guide/index.md': '# Guide',
    'guide/README.md': '# About the guide',
  });

  const site = await scanSite(folder);

  expect(outline(site.tree)).toEqual([
    'Restore',
    'Schedules',
    { Guide: ['Guide', 'About the guide', 'Agents'] },
  ]);
});

test('a folder with no Markdown file below it is no section', async () => {
  const folder = await folderWith({
    'restore.md': '# Restore a file',
    'images/shots/restore-window.png': 'png',
  });
  expect(outline((await scanSite(folder)).tree)).toEqual(['Restore a file']);
});

test('two sections with one name close on their own', async () => {
  const folder = await folderWith({
    'backups/plans/team.md': '# Team plan',
    'agents/plans/rollout.md': '# Rollout plan',
  });

  const site = await scanSite(folder);

  const ids = (nodes: TreeNode[]): string[] =>
    nodes.flatMap((node) => (node.kind === 'section' ? [node.id, ...ids(node.children)] : []));
  expect(ids(site.tree)).toEqual(['agents', 'agents/plans', 'backups', 'backups/plans']);
});

test('dot folders, dot files and node_modules are not part of the site', async () => {
  const folder = await folderWith({
    'restore.md': '# Restore a file',
    '.drafts/plan.md': '# Plan',
    '.hidden.md': '# Hidden',
    'node_modules/backup-agent/README.md': '# Agent',
    'backups/node_modules/backup-agent/README.md': '# Agent',
    'backups/.git/notes.md': '# Notes',
  });

  const site = await scanSite(folder);

  expect(site.pages.map((page) => page.url)).toEqual(['/restore.html']);
  expect(site.tree).toHaveLength(1);
});

test('a page saved in a folder named __nerddocs stays out of the panel, since the app owns that address', async () => {
  const folder = await folderWith({
    'restore.md': '# Restore a file',
    '__nerddocs/notes.md': '# Notes',
    'backups/__nerddocs/agents.md': '# Agents',
  });

  const site = await scanSite(folder);

  expect(outline(site.tree)).toEqual([{ Backups: [{ 'Nerddocs': ['Agents'] }] }, 'Restore a file']);
});

test('a path is public only inside the folder, with no dot name and no node_modules', () => {
  expect(isPublicPath('/backup-app/guide', '/backup-app/guide')).toBe(true);
  expect(isPublicPath('/backup-app/guide', '/backup-app/guide/backups/restore.md')).toBe(true);
  expect(isPublicPath('/backup-app/guide', '/backup-app/storage-keys.txt')).toBe(false);
  expect(isPublicPath('/backup-app/guide', '/backup-app/guide/.env')).toBe(false);
  expect(isPublicPath('/backup-app/guide', '/backup-app/guide/node_modules/agent.js')).toBe(false);
});

test('a symbolic link to a file outside the folder is not part of the site', async () => {
  const outside = await folderWith({ 'storage-keys.md': '# Storage keys' });
  const folder = await folderWith({ 'restore.md': '# Restore a file', 'backups/schedules.md': '# Schedules' });
  await symlink(join(outside, 'storage-keys.md'), join(folder, 'storage-keys.md'));
  await symlink(join(outside), join(folder, 'outside'));
  await symlink(join(folder, 'restore.md'), join(folder, 'again.md'));

  const site = await scanSite(folder);

  expect(site.pages.map((page) => page.url).sort()).toEqual([
    '/again.html',
    '/backups/schedules.html',
    '/restore.html',
  ]);
});

test('a symbolic link to a dot folder or to node_modules is not part of the site', async () => {
  const folder = await folderWith({
    'restore.md': '# Restore a file',
    '.drafts/plan.md': '# Draft plan',
    'node_modules/backup-agent/README.md': '# Backup agent',
  });
  await symlink(join(folder, '.drafts/plan.md'), join(folder, 'draft-link.md'));
  await symlink(join(folder, 'node_modules/backup-agent/README.md'), join(folder, 'agent-link.md'));

  const site = await scanSite(folder);

  expect(outline(site.tree)).toEqual(['Restore a file']);
});

test('a symbolic link named like a page that lands on a folder is no page and no error', async () => {
  const folder = await folderWith({ 'backups/restore.md': '# Restore a file' });
  await symlink(join(folder, 'backups'), join(folder, 'folder-link.md'));
  const errors: string[] = [];

  const site = await scanSite(folder, { onReadError: (path) => errors.push(path) });

  expect(outline(site.tree)).toEqual([{ Backups: ['Restore a file'] }]);
  expect(errors).toEqual([]);
});

test('a served folder that is itself a symbolic link keeps its link pages', async () => {
  const real = await folderWith({ 'restore.md': '# Restore a file' });
  await symlink(join(real, 'restore.md'), join(real, 'again.md'));
  const parent = await folderWith({});
  await symlink(real, join(parent, 'guide'));

  const site = await scanSite(join(parent, 'guide'));

  expect(site.pages.map((page) => page.url)).toEqual(['/again.html', '/restore.html']);
});

test('a file or a section deleted during a scan is no error', async () => {
  const folder = await folderWith({ 'agents.md': '# Agents', 'backups/restore.md': '# Restore', 'storage.md': '# Storage' });
  const held = holdNextRead(join(folder, 'agents.md'));
  const errors: string[] = [];
  let gone = 0;

  const scanning = scanSite(folder, { onReadError: (path) => errors.push(path), onGone: () => gone++ });
  await held.reached;
  await rm(join(folder, 'backups'), { recursive: true });
  await rm(join(folder, 'storage.md'));
  held.release();
  const site = await scanning;

  expect(outline(site.tree)).toEqual(['Agents']);
  expect(errors).toEqual([]);
  expect(gone).toBe(2);
});

test('a served folder that is gone gives an empty site and no error', async () => {
  const folder = await folderWith({ 'restore.md': '# Restore a file' });
  await rm(folder, { recursive: true });
  const errors: string[] = [];
  let gone = 0;

  const site = await scanSite(folder, { onReadError: (path) => errors.push(path), onGone: () => gone++ });

  expect(site.pages).toEqual([]);
  expect(errors).toEqual([]);
  expect(gone).toBe(0);
});

test('a named pipe called like a page is no page, and the scan never waits on it', async () => {
  test.skip(process.platform === 'win32', 'Windows has no named pipes in a folder.');
  const folder = await folderWith({ 'restore.md': '# Restore a file' });
  expect(spawnSync('mkfifo', [join(folder, 'pipe.md')]).status).toBe(0);
  // A read of a pipe with no writer never ends, so the stand-in answers in its place.
  const realRead = fs.readFile;
  const pipeAnswers = (async (path: string, ...rest: []) => (path.endsWith('pipe.md') ? '' : realRead(path, ...rest))) as typeof fs.readFile;
  const putBack = replaceBuiltin(fs, 'readFile', pipeAnswers);
  try {
    const site = await scanSite(folder);

    expect(outline(site.tree)).toEqual(['Restore a file']);
  } finally {
    putBack();
  }
});

test('of two files with one address, the first is the page and the other is reported', async () => {
  test.skip(process.platform !== 'linux', 'Other systems can treat these two names as one file.');
  const folder = await folderWith({ 'restore.md': '# Restore a file', 'restore.MD': '# Restore a copy', 'storage.md': '# Storage' });
  const duplicates: string[] = [];

  const site = await scanSite(folder, { onDuplicate: (path) => duplicates.push(path) });

  expect(outline(site.tree)).toEqual(['Restore a copy', 'Storage']);
  expect(duplicates).toEqual([join(folder, 'restore.md')]);
});

test('a file that cannot be read is reported, and the other pages stay', async () => {
  test.skip(process.getuid?.() === 0, 'The root user can read every file.');
  const folder = await folderWith({ 'restore.md': '# Restore a file', 'storage.md': '# Storage' });
  await chmod(join(folder, 'restore.md'), 0);
  const errors: string[] = [];

  const site = await scanSite(folder, { onReadError: (path) => errors.push(path) });

  expect(outline(site.tree)).toEqual(['Storage']);
  expect(errors).toEqual([join(folder, 'restore.md')]);
});

test('a folder that cannot be read is reported, and the other pages stay', async () => {
  test.skip(process.getuid?.() === 0, 'The root user can read every folder.');
  const folder = await folderWith({ 'backups/restore.md': '# Restore a file', 'storage.md': '# Storage' });
  await chmod(join(folder, 'backups'), 0);
  const errors: string[] = [];
  try {
    const site = await scanSite(folder, { onReadError: (path) => errors.push(path) });

    expect(outline(site.tree)).toEqual(['Storage']);
    expect(errors).toEqual([join(folder, 'backups')]);
  } finally {
    await chmod(join(folder, 'backups'), 0o755);
  }
});

test('a scan renders only the pages whose text changed', async () => {
  const folder = await folderWith({ 'restore.md': '# Restore a file', 'storage.md': '# Storage' });
  const previous = await scanSite(folder);
  previous.pages[0]!.html = '<p>Kept from the scan before.</p>';
  previous.pages[1]!.source = 'Edited since the scan before.';

  const site = await scanSite(folder, { previous });

  expect(site.pages[0]!.html).toBe('<p>Kept from the scan before.</p>');
  expect(site.pages[1]!.source).toBe('# Storage');
});

test('a save in any public folder is watched, and a save in a dot folder is not', async () => {
  const folder = await folderWith({
    'backups/plans/team.md': '# Team',
    'images/restore-window.png': 'png',
    '.git/config': 'x',
  });

  const site = await scanSite(folder);

  expect(site.folders.sort()).toEqual(
    [folder, join(folder, 'backups'), join(folder, 'backups/plans'), join(folder, 'images')].sort(),
  );
});

test('the site name comes from the folder, or from its parent for a docs folder', () => {
  expect(siteName('/home/mia/backup-app/guide')).toBe('Guide');
  expect(siteName('/home/mia/backup-app/docs')).toBe('Backup app');
  expect(siteName('/home/mia/backup-app/Docs')).toBe('Backup app');
  expect(siteName('/home/mia/backup-app/DOCS')).toBe('Backup app');
  expect(siteName('/docs')).toBe('Docs');
  expect(siteName('/')).toBe('Docs');
});

test.describe('files that a page uses', () => {
  const WINDOW = svgImage('width="120" height="40"');
  const RESTORE = '# Restore a file\n\n![Restore window](restore-window.png)\n\n![Old window](restore-window-old.png)\n';

  /** A folder with 'Restore a file', which uses 'restore-window.png' and the missing 'restore-window-old.png'. */
  async function restoreFolder(): Promise<string> {
    const folder = await folderWith({ 'restore.md': RESTORE, 'restore-window.png': WINDOW });
    await utimes(join(folder, 'restore-window.png'), 1730000000, 1730000000);
    return folder;
  }

  test('a page records each file that it uses, missing ones too, and the site lists them for the watcher', async () => {
    const folder = await restoreFolder();
    const site = await scanSite(folder);
    expect(site.pages[0]!.uses).toEqual([
      { file: 'restore-window.png', path: join(folder, 'restore-window.png'), version: 1730000000000 },
      { file: 'restore-window-old.png', path: join(folder, 'restore-window-old.png'), version: null },
    ]);
    expect([...site.used].sort()).toEqual([join(folder, 'restore-window-old.png'), join(folder, 'restore-window.png')]);
    expect(site.pages[0]!.html).toContain('src="restore-window.png?v=1730000000000"');
    expect(site.pages[0]!.html).toContain('width="120"');
  });

  test('a page keeps its render while its text and each used file stay', async () => {
    const folder = await restoreFolder();
    const previous = await scanSite(folder);
    const site = await scanSite(folder, { previous });
    expect(site.pages[0]).toBe(previous.pages[0]);
  });

  test('a page renders again when a used file changes, appears or goes away', async () => {
    const folder = await restoreFolder();
    const first = await scanSite(folder);
    const box = 'Missing file: restore-window-old.png restore.md';
    expect(first.pages[0]!.html).toContain(box);

    await utimes(join(folder, 'restore-window.png'), 1730000100, 1730000100);
    const changed = await scanSite(folder, { previous: first });
    expect(changed.pages[0]).not.toBe(first.pages[0]);
    expect(changed.pages[0]!.html).toContain('src="restore-window.png?v=1730000100000"');

    await writeFile(join(folder, 'restore-window-old.png'), WINDOW);
    const appeared = await scanSite(folder, { previous: changed });
    expect(appeared.pages[0]!.html).not.toContain('class="problem"');
    expect(appeared.pages[0]!.html).toContain('src="restore-window-old.png?v=');

    await rm(join(folder, 'restore-window.png'));
    const gone = await scanSite(folder, { previous: appeared });
    expect(gone.pages[0]!.html).toContain('Missing file: restore-window.png restore.md');
    expect(gone.pages[0]!.html).not.toContain('src="restore-window.png');
  });

  test('a page renders again when a file that its wireframe names changes', async () => {
    const folder = await folderWith({
      'design/decisions.md': `# Design decisions\n\n${WIZARD_LINE}\n`,
      [WIZARD]: WIZARD_HTML,
      'design/wireframes/wizard.css': WIZARD_CSS,
      'design/wireframes/wizard.js': WIZARD_JS,
      'design/wireframes/step.png': pngFile(1280, 720),
    });
    await utimes(join(folder, 'design/wireframes/wizard.css'), 1730000000, 1730000000);
    const decisions = (site: Site) => site.pages.find((page) => page.url === '/design/decisions.html')!;
    const first = await scanSite(folder);
    const kept = await scanSite(folder, { previous: first });
    expect(decisions(kept)).toBe(decisions(first));

    await utimes(join(folder, 'design/wireframes/wizard.css'), 1730000100, 1730000100);
    const changed = await scanSite(folder, { previous: kept });
    expect(decisions(changed)).not.toBe(decisions(kept));
    const [doc] = srcdocsOf(decisions(changed).html);
    expect(doc).toContain('wizard.css?v=1730000100000');
  });

  test('a page renders again when a file that its OpenAPI file names changes', async () => {
    const folder = await folderWith({
      'nerddocs.json': INTERNALS_FIRST,
      'api.md': BACKUP_API_PAGE,
      'api/openapi.yaml': SPLIT_SPEC,
      'api/schemas/error.yaml': ERROR_SCHEMA,
    });
    await utimes(join(folder, 'api/openapi.yaml'), 1730000000, 1730000000);
    await utimes(join(folder, 'api/schemas/error.yaml'), 1730000001, 1730000001);
    const api = (site: Site) => site.pages.find((page) => page.url === '/api.html')!;
    const first = await scanSite(folder);
    expect(api(first).uses).toEqual([
      { file: 'api/openapi.yaml', path: join(folder, 'api/openapi.yaml'), version: 1730000000000 },
      { file: 'api/schemas/error.yaml', path: join(folder, 'api/schemas/error.yaml'), version: 1730000001000 },
    ]);
    expect(api(first).html).not.toContain('<code>hint</code>');
    const kept = await scanSite(folder, { previous: first });
    expect(api(kept)).toBe(api(first));

    await writeFile(join(folder, 'api/schemas/error.yaml'), `${ERROR_SCHEMA}  hint:\n    type: string\n`);
    const changed = await scanSite(folder, { previous: kept });
    expect(api(changed)).not.toBe(api(kept));
    expect(api(changed).html).toContain('<code>hint</code>');
  });

  test('an OpenAPI problem reports its line on every scan', async () => {
    const folder = await folderWith({ 'nerddocs.json': INTERNALS_FIRST, 'api.md': BACKUP_API_PAGE, 'api/openapi.yaml': BROKEN_SPEC });
    const line = `Bad OpenAPI: ${join(folder, 'api/openapi.yaml')}:9`;
    const first: string[] = [];
    const previous = await scanSite(folder, { onFileProblem: (problem) => first.push(problem) });
    expect(first).toEqual([line]);

    const again: string[] = [];
    const site = await scanSite(folder, { previous, onFileProblem: (problem) => again.push(problem) });
    expect(site.pages[0]).toBe(previous.pages[0]);
    expect(again).toEqual([line]);
  });

  test('each missing file reports one line per page on every scan, also for a kept render', async () => {
    const folder = await restoreFolder();
    const line = `Missing file: restore-window-old.png ${join(folder, 'restore.md')}`;
    const first: string[] = [];
    const previous = await scanSite(folder, { onFileProblem: (problem) => first.push(problem) });
    expect(first).toEqual([line]);

    const again: string[] = [];
    const site = await scanSite(folder, { previous, onFileProblem: (problem) => again.push(problem) });
    expect(site.pages[0]).toBe(previous.pages[0]);
    expect(again).toEqual([line]);
  });

  test('a symbolic link to an image outside the folder leaves the box', async () => {
    const outside = await folderWith({ 'restore-window.png': WINDOW });
    const folder = await folderWith({ 'restore.md': '# Restore a file\n\n![Restore window](restore-window.png)\n' });
    await symlink(join(outside, 'restore-window.png'), join(folder, 'restore-window.png'));

    const page = (await scanSite(folder)).pages[0]!;

    expect(page.html).toContain('Missing file: restore-window.png restore.md');
    expect(page.uses).toEqual([{ file: 'restore-window.png', path: join(folder, 'restore-window.png'), version: null }]);
  });
});

test.describe('levels', () => {
  async function scanWith(files: Record<string, string>) {
    const folder = await folderWith(files);
    const problems: string[] = [];
    const site = await scanSite(folder, { onLevelProblem: (line) => problems.push(line) });
    return { folder, site, problems };
  }

  const CONFIG = (...ids: string[]) => JSON.stringify({ levels: ids.map((id) => ({ id })) });

  test('a folder with no config reports its path and has no levels, and each fence line is text', async () => {
    const { folder, site, problems } = await scanWith({
      '01-restore.md': '::: overview\nOne.\n::: internals\nTwo.\n:::\n',
      '02-storage.md': '::: testers\nThree.\n:::\n',
    });
    expect(problems).toEqual([`Missing config: ${join(folder, 'nerddocs.json')}`]);
    expect(site.configProblem).toBe('missing');
    expect(site.levels).toEqual([]);
    expect(site.defaultLevel).toBe('');
    expect(site.pages[0]!.parts).toEqual([]);
    expect(site.pages[0]!.html).toContain('::: overview');
  });

  for (const [name, file] of Object.entries({
    '`"levels": false`': '{"levels":false}',
    'an empty file': '',
    '`{}`': '{}',
    '`"levels": []`': '{"levels":[]}',
  })) {
    test(`a config with ${name} has no levels and no problem, and each fence line is text`, async () => {
      const { site, problems } = await scanWith({ 'nerddocs.json': file, 'restore.md': '::: overview\nOne.\n:::\n' });
      expect(problems).toEqual([]);
      expect(site.configProblem).toBeNull();
      expect(site.levels).toEqual([]);
      expect(site.pages[0]!.parts).toEqual([]);
      expect(site.pages[0]!.html).toContain('::: overview');
    });
  }

  for (const [name, rest] of Object.entries({
    'no default level': '',
    'a default level that is not text': ',"defaultLevel":7',
    'an unknown default level': ',"defaultLevel":"testers"',
  })) {
    test(`\`"levels": false\` and \`"levels": []\` scan the same with ${name}`, async () => {
      const results = await Promise.all(
        ['false', '[]'].map(async (levels) => {
          const { folder, site, problems } = await scanWith({ 'nerddocs.json': `{"levels":${levels}${rest}}`, 'restore.md': '::: overview\nOne.\n:::\n' });
          return {
            problems: problems.map((line) => line.replace(folder, '<folder>')),
            configProblem: site.configProblem,
            levels: site.levels,
            defaultLevel: site.defaultLevel,
            html: site.pages[0]!.html,
          };
        }),
      );
      expect(results[0]).toEqual(results[1]);
    });
  }

  test('a config that lists levels has no problem, and its fences make parts', async () => {
    const { site, problems } = await scanWith({
      'nerddocs.json': CONFIG('overview', 'internals'),
      'restore.md': '::: overview\nOne.\n::: internals\nTwo.\n:::\n',
    });
    expect(problems).toEqual([]);
    expect(site.configProblem).toBeNull();
    expect(site.pages[0]!.parts).toEqual(['overview', 'internals']);
  });

  test('one listed level gives one level, and its fence makes a part', async () => {
    const { site } = await scanWith({ 'nerddocs.json': CONFIG('overview'), 'restore.md': '::: overview\nOne.\n:::\n' });
    expect(site.levels.map((level) => level.id)).toEqual(['overview']);
    expect(site.pages[0]!.parts).toEqual(['overview']);
  });

  test('a word that is not listed reports once for each page, and adds no level', async () => {
    const { folder, site, problems } = await scanWith({
      'nerddocs.json': CONFIG('overview', 'internals'),
      '01-restore.md': '::: testers\nOne.\n\n::: testers\nTwo.\n\n::: overview\nThree.\n:::\n',
      '02-storage.md': '::: testers\nFour.\n',
    });
    expect(problems).toEqual([
      `Unknown level: testers ${join(folder, '01-restore.md')}`,
      `Unknown level: testers ${join(folder, '02-storage.md')}`,
    ]);
    expect(site.levels.map((level) => level.id)).toEqual(['overview', 'internals']);
  });

  test('a fence line with a word that cannot be a level id reports nothing', async () => {
    const { problems } = await scanWith({ 'nerddocs.json': CONFIG('overview', 'internals'), 'restore.md': '::: 10:30\nPick a time.\n' });
    expect(problems).toEqual([]);
  });

  test('a page keeps its render through a scan when its text and the listed ids stay', async () => {
    const folder = await folderWith({ 'nerddocs.json': CONFIG('overview', 'internals'), 'restore.md': '::: overview\nOne.\n:::\n' });
    const previous = await scanSite(folder);
    previous.pages[0]!.html = '<p>Kept from the scan before.</p>';

    await writeFile(join(folder, 'nerddocs.json'), JSON.stringify({ levels: [{ id: 'overview', name: 'Short' }, { id: 'internals' }] }));
    const site = await scanSite(folder, { previous });

    expect(site.pages[0]!.html).toBe('<p>Kept from the scan before.</p>');
    expect(site.levels[0]!.name).toBe('Short');
  });

  test('a page renders again when the listed ids change, with no change to its text', async () => {
    const source = '::: overview\nOne.\n::: internals\nTwo.\n:::\n';
    const folder = await folderWith({ 'nerddocs.json': CONFIG('overview'), 'restore.md': source });
    const previous = await scanSite(folder);
    expect(previous.pages[0]!.parts).toEqual(['overview']);

    await writeFile(join(folder, 'nerddocs.json'), CONFIG('overview', 'internals'));
    const listed = await scanSite(folder, { previous });
    expect(listed.pages[0]!.parts).toEqual(['overview', 'internals']);

    await rm(join(folder, 'nerddocs.json'));
    const gone = await scanSite(folder, { previous: listed });
    expect(gone.pages[0]!.parts).toEqual([]);
    expect(gone.pages[0]!.html).toContain('::: overview');
  });

  test('a page kept from the scan before still reports its unknown words', async () => {
    const folder = await folderWith({ 'nerddocs.json': CONFIG('overview', 'internals'), 'restore.md': '::: testers\nOne.\n' });
    const previous = await scanSite(folder);
    previous.pages[0]!.html = '<p>Kept from the scan before.</p>';
    const problems: string[] = [];

    const site = await scanSite(folder, { previous, onLevelProblem: (line) => problems.push(line) });

    expect(site.pages[0]!.html).toBe('<p>Kept from the scan before.</p>');
    expect(problems).toEqual([`Unknown level: testers ${join(folder, 'restore.md')}`]);
  });

  test('the config gives the names, the icons, the order and the default level', async () => {
    const { site, problems } = await scanWith({
      'nerddocs.json': JSON.stringify({
        levels: [{ id: 'internals', name: 'Deep', icon: 'cpu' }, { id: 'overview' }],
        defaultLevel: 'overview',
      }),
      'restore.md': '::: overview\nOne.\n::: internals\nTwo.\n:::\n',
    });
    expect(site.levels).toEqual([
      { id: 'internals', name: 'Deep', icon: 'cpu' },
      { id: 'overview', name: 'Overview' },
    ]);
    expect(site.defaultLevel).toBe('overview');
    expect(problems).toEqual([]);
  });

  test('a config that is not valid reports its path, and the site runs with no levels', async () => {
    const { folder, site, problems } = await scanWith({
      'nerddocs.json': '{"levels":[{"id":"overview","name":""}]}',
      'restore.md': '::: overview\nOne.\n:::\n',
    });
    expect(problems).toEqual([`Bad config: ${join(folder, 'nerddocs.json')}`]);
    expect(site.configProblem).toBe('broken');
    expect(site.levels).toEqual([]);
    expect(site.pages[0]!.parts).toEqual([]);
    expect(site.pages[0]!.html).toContain('::: overview');
  });

  test('an unknown level reports the file that uses it, and an unknown icon reports the config', async () => {
    const { folder, problems } = await scanWith({
      'nerddocs.json': '{"levels":[{"id":"overview","icon":"rocket"},{"id":"testers"}]}',
      'backups/restore.md': '::: overview internals\nOne.\n:::\n',
    });
    expect(problems).toEqual([
      `Unknown icon: rocket ${join(folder, 'nerddocs.json')}`,
      `Unknown level: internals ${join(folder, 'backups/restore.md')}`,
    ]);
  });

  test('the speed comes from the config, and else it is the default', async () => {
    const restore = { 'restore.md': '# Restore a file' };
    expect((await scanWith({ 'nerddocs.json': '{"wordsPerMinute":300}', ...restore })).site.wordsPerMinute).toBe(300);
    expect((await scanWith({ 'nerddocs.json': '{}', ...restore })).site.wordsPerMinute).toBe(DEFAULT_WORDS_PER_MINUTE);
    expect((await scanWith(restore)).site.wordsPerMinute).toBe(DEFAULT_WORDS_PER_MINUTE);
  });

  test('the text width comes from the config, and else it is the default', async () => {
    const restore = { 'restore.md': '# Restore a file' };
    expect((await scanWith({ 'nerddocs.json': '{"textWidth":60}', ...restore })).site.textWidth).toBe(60);
    expect((await scanWith({ 'nerddocs.json': '{}', ...restore })).site.textWidth).toBe(DEFAULT_TEXT_WIDTH);
    expect((await scanWith(restore)).site.textWidth).toBe(DEFAULT_TEXT_WIDTH);
  });

  test('a bad speed makes a broken config, and the site runs at the default speed', async () => {
    const { folder, site, problems } = await scanWith({ 'nerddocs.json': '{"wordsPerMinute":0}', 'restore.md': '# Restore a file' });
    expect(site.wordsPerMinute).toBe(DEFAULT_WORDS_PER_MINUTE);
    expect(site.configProblem).toBe('broken');
    expect(problems).toEqual([`Bad config: ${join(folder, 'nerddocs.json')}`]);
  });

  test('a new speed with the same text changes the speed of the site and keeps the page and its sizes', async () => {
    const config = (wordsPerMinute: number) => JSON.stringify({ levels: [{ id: 'overview' }, { id: 'internals' }], wordsPerMinute });
    const folder = await folderWith({
      'nerddocs.json': config(200),
      'restore.md': '# Restore a file\n\n::: overview\nPick a day.\n::: internals\nA job runs.\n:::\n',
    });
    const previous = await scanSite(folder);
    const sizes = {
      overview: { words: 6, images: 0 },
      internals: { words: 6, images: 0 },
      '': { words: 9, images: 0 },
    };
    expect(previous.wordsPerMinute).toBe(200);
    expect(previous.pages[0]!.sizes).toEqual(sizes);

    await writeFile(join(folder, 'nerddocs.json'), config(400));
    const site = await scanSite(folder, { previous });

    expect(site.wordsPerMinute).toBe(400);
    expect(site.pages[0]).toBe(previous.pages[0]);
    expect(site.pages[0]!.sizes).toEqual(sizes);
  });

  test('a config in a folder below the top is no config', async () => {
    const { site } = await scanWith({
      'backups/nerddocs.json': '{"levels":[{"id":"overview"},{"id":"internals"}]}',
      'restore.md': '# Restore a file',
    });
    expect(site.levels).toEqual([]);
    expect(site.configProblem).toBe('missing');
  });

  test('a config that cannot be read is reported, and the site runs with no levels', async () => {
    test.skip(process.getuid?.() === 0, 'The root user can read every file.');
    const folder = await folderWith({ 'nerddocs.json': '{}', 'restore.md': '::: overview\nOne.\n:::\n' });
    await chmod(join(folder, 'nerddocs.json'), 0);
    const errors: string[] = [];
    const site = await scanSite(folder, { onReadError: (path) => errors.push(path) });
    expect(errors).toEqual([join(folder, 'nerddocs.json')]);
    expect(site.configProblem).toBe('broken');
    expect(site.levels).toEqual([]);
    expect(site.pages[0]!.parts).toEqual([]);
  });

  test('a folder named like the config is reported as a config that cannot be read', async () => {
    const folder = await folderWith({ 'nerddocs.json/notes.txt': 'Notes', 'restore.md': '::: overview\nOne.\n:::\n' });
    const errors: string[] = [];
    const site = await scanSite(folder, { onReadError: (path) => errors.push(path) });
    expect(errors).toEqual([join(folder, 'nerddocs.json')]);
    expect(site.configProblem).toBe('broken');
    expect(site.levels).toEqual([]);
  });
});
