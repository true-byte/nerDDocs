import { connect } from 'node:net';
import { chmod, readdir, readFile, readlink, rename, rm, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { DIMENSION_SITE, DIMENSIONS_CONFIG, dimensionsConfig, RESTORE } from '../support/dimensions.ts';
import { folderWith, saveAtOnce, withConfig, writeInto, type FileContent } from '../support/folder.ts';
import { imagesIn, srcdocsOf } from '../support/html.ts';
import { holdNextRead } from '../support/held-read.ts';
import { pngFile, svgImage } from '../support/images.ts';
import { BACKUP_SPEC } from '../support/openapi.ts';
import { OFTEN } from '../support/poll.ts';
import { busyPortBeforeFreePort, holdBusy } from '../support/ports.ts';
import { takeScanClock } from '../support/scan-clock.ts';
import { WIZARD_CSS, WIZARD_HTML, WIZARD_JS } from '../support/wireframes.ts';
import type { PageView } from '../../src/site/view.ts';
import { startServer, type RunningServer } from '../../src/server/server.ts';

const assets = { 'app.js': 'console.log("backup app")', 'app.css': 'body{}' };

const running: RunningServer[] = [];

async function serve(files: Record<string, FileContent>, port = 0, log: (line: string) => void = () => {}) {
  const folder = await folderWith(withConfig(files));
  const server = await startServer({ folder, port, assets, log });
  running.push(server);
  return { folder, server, address: server.address };
}

/** A clock that a test took for its server. It goes back before the next test. */
const clocks: ReturnType<typeof takeScanClock>[] = [];

function scanClock() {
  const clock = takeScanClock();
  clocks.push(clock);
  return clock;
}

test.afterEach(async () => {
  for (const clock of clocks.splice(0)) clock.restore();
  await Promise.all(running.splice(0).map((server) => server.close()));
});

/** Sends a raw request, so that no client tidies the path first. */
function rawGet(address: string, path: string, host = new URL(address).host, method = 'GET'): Promise<string> {
  const { hostname, port } = new URL(address);
  return new Promise((resolve, reject) => {
    const socket = connect(Number(port), hostname, () => {
      socket.write(`${method} ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
    });
    let text = '';
    socket.on('data', (chunk) => (text += chunk.toString()));
    socket.on('end', () => resolve(text));
    socket.on('error', reject);
  });
}

function statusOf(response: string): number {
  return Number(response.split(' ')[1]);
}

/** Yields each update that the site sends to a page at `url`. */
async function* updates(address: string, url: string, signal: AbortSignal): AsyncGenerator<PageView> {
  const response = await fetch(`${address}__nerddocs/events?page=${encodeURIComponent(url)}`, { signal });
  expect(response.headers.get('content-type')).toBe('text/event-stream');
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body!) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (event.startsWith('data: ')) yield JSON.parse(event.slice('data: '.length));
    }
  }
}

/** A save can pass through an empty file, so an update can come before the one that shows the save. */
async function updateWhere(stream: AsyncGenerator<PageView>, wanted: (view: PageView) => boolean): Promise<PageView> {
  for (;;) {
    const { value, done } = await stream.next();
    if (done) throw new Error('The site closed its updates.');
    if (wanted(value)) return value;
  }
}

const showsText = (html: string) => (view: PageView) => view.html === html;

test('the site answers on 127.0.0.1 and serves a page with its text and nav', async () => {
  const { address } = await serve({
    'restore.md': '# Restore a file\n\nPick a file and a day.',
    'storage.md': '# Storage',
  });
  expect(new URL(address).hostname).toBe('127.0.0.1');

  const response = await fetch(`${address}restore.html`);
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  expect(html).toContain('<p>Pick a file and a day.</p>');
  expect(html).toContain('>Storage</a>');
});

test('another computer on the network cannot reach the site', async () => {
  test.skip(process.platform !== 'linux', 'Other systems have no 127.0.0.2 by default.');
  const { address } = await serve({ 'storage-keys.txt': 'top secret' });
  const { port } = new URL(address);

  // A server that listens on every network address also answers on this address of the machine.
  await expect(rawGet(`http://127.0.0.2:${port}/`, '/storage-keys.txt', `localhost:${port}`)).rejects.toThrow('ECONNREFUSED');
});

test('the site root opens the first page, marked in the nav, and a dot folder is not in the nav', async () => {
  const { address } = await serve({
    'README.md': '# Backup app',
    'storage.md': '# Storage',
    '.drafts/plan.md': '# Draft plan',
  });

  const response = await fetch(address);
  const html = await response.text();

  expect(new URL(response.url).pathname).toBe('/README.html');
  expect(html).toContain('aria-current="page">Backup app</a>');
  expect(html).not.toContain('Draft plan');
});

test('the site root and a folder address redirect to their first page', async () => {
  const { address } = await serve({ 'agents.md': '# Agents', 'backups/restore.md': '# Restore' });

  const root = await fetch(address, { redirect: 'manual' });
  expect(root.status).toBe(302);
  expect(root.headers.get('location')).toBe('/agents.html');

  for (const path of ['backups', 'backups/']) {
    const folder = await fetch(`${address}${path}`, { redirect: 'manual' });
    expect(folder.headers.get('location')).toBe('/backups/restore.html');
  }
});

test.describe('addresses without order prefixes', () => {
  /** A folder 'Backups' with a page of its own, in a folder and a file with an order prefix, and the files that the page loads. */
  const FILES: Record<string, FileContent> = {
    'user-guide/01-backups/index.md': [
      '# Backups',
      '![Restore window](restore-window.svg)',
      '[Restore log](restore.log) and [the same log from the root](/user-guide/01-backups/restore.log)',
      '![Restore wizard](wireframes/restore-wizard.html)',
      '![Backup API](api/openapi.yaml)',
    ].join('\n\n'),
    'user-guide/01-backups/01-restore.md': '# Restore a file\n\nPick a file and a day.',
    'user-guide/01-backups/restore-window.svg': svgImage('width="120" height="40"'),
    'user-guide/01-backups/restore.log': 'Restored report.docx',
    'user-guide/01-backups/wireframes/restore-wizard.html': WIZARD_HTML,
    'user-guide/01-backups/wireframes/wizard.css': WIZARD_CSS,
    'user-guide/01-backups/wireframes/wizard.js': WIZARD_JS,
    'user-guide/01-backups/wireframes/step.png': pngFile(1280, 720),
    'user-guide/01-backups/api/openapi.yaml': BACKUP_SPEC,
  };
  const BACKUPS = '/user-guide/backups/index.html';
  const RESTORE_PAGE = '/user-guide/backups/restore.html';

  test('a page opens at its address without order prefixes', async () => {
    const { address } = await serve(FILES);
    for (const url of [BACKUPS, RESTORE_PAGE]) expect((await fetch(new URL(url, address))).status, url).toBe(200);
  });

  test('the old address with numbers and the address of the .md file redirect to the new address', async () => {
    const { address } = await serve(FILES);
    const redirects: [string, string][] = [
      ['user-guide/01-backups/01-restore.html', RESTORE_PAGE],
      ['user-guide/01-backups/01-restore.md', RESTORE_PAGE],
      ['user-guide/01-backups/index.html', BACKUPS],
      ['user-guide/01-backups/index.md', BACKUPS],
    ];
    for (const [path, location] of redirects) {
      const response = await fetch(`${address}${path}`, { redirect: 'manual' });
      expect(response.status, path).toBe(302);
      expect(response.headers.get('location'), path).toBe(location);
    }
  });

  test('the site root and a folder address open the page of the folder first', async () => {
    const { address } = await serve(FILES);
    for (const path of ['', 'user-guide/', 'user-guide/backups', 'user-guide/backups/']) {
      const response = await fetch(`${address}${path}`, { redirect: 'manual' });
      expect(response.status, path).toBe(302);
      expect(response.headers.get('location'), path).toBe(BACKUPS);
    }
  });

  test('every image, file link, wireframe and API file of the page loads from its new address, from the path of the file on disk', async () => {
    const { address } = await serve(FILES);
    const pageAddress = new URL(BACKUPS, address);
    const html = await (await fetch(pageAddress)).text();
    const text = html.slice(html.indexOf('id="page"'));
    /** The path in the site that a src or an href of the page opens, with no query. */
    const opened = (value: string) => decodeURIComponent(new URL(value, pageAddress).pathname);
    const loads = async (path: string) => (await fetch(new URL(path, address))).status;

    const image = imagesIn(text).find(({ alt }) => alt === 'Restore window')?.src;
    expect(image).toBeDefined();
    expect(opened(image!)).toBe('/user-guide/01-backups/restore-window.svg');
    expect(await loads(opened(image!))).toBe(200);

    const logs = [...text.matchAll(/<a href="([^"]*)">[^<]*log[^<]*<\/a>/g)].map(([, href]) => opened(href!));
    expect(logs).toEqual(['/user-guide/01-backups/restore.log', '/user-guide/01-backups/restore.log']);
    expect(await loads(logs[0]!)).toBe(200);

    // The frame inside the noscript loads the file itself.
    const own = /<iframe\b[^>]*\ssrc="([^"]*)"/.exec(text)?.[1];
    expect(own && opened(own)).toBe('/user-guide/01-backups/wireframes/restore-wizard.html');
    const [srcdoc] = srcdocsOf(text);
    const base = /<base href="([^"]*)"/.exec(srcdoc ?? '')?.[1];
    expect(base).toBeDefined();
    const folder = new URL(base!, pageAddress);
    expect(decodeURIComponent(folder.pathname)).toBe('/user-guide/01-backups/wireframes/');
    for (const name of ['wizard.css', 'wizard.js', 'step.png']) expect(await loads(new URL(name, folder).pathname), name).toBe(200);

    expect(text).toMatch(/<section class="api"/);
  });
});

test('the first letters of a folder name are no folder address', async () => {
  const { address } = await serve({ 'backups/restore.md': '# Restore' });
  const response = await fetch(`${address}back`, { redirect: 'manual', headers: { Accept: 'text/html' } });
  expect(response.status).toBe(404);
});

test('a folder with no pages shows an empty page at the site root', async () => {
  const { address } = await serve({});
  const response = await fetch(address);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('id="page"');
});

test('a .md address redirects to its page', async () => {
  const { address } = await serve({ 'user guide/restore.md': '# Restore' });
  const response = await fetch(`${address}user%20guide/restore.md`, { redirect: 'manual' });
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe('/user%20guide/restore.html');
});

test('a page with a space, a letter of another language or a # in its name opens', async () => {
  const { address } = await serve({ 'user guide/wählen #1.md': '# Pick a day' });
  const response = await fetch(`${address}user%20guide/w%C3%A4hlen%20%231.html`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('>Pick a day</h1>');
});

test('the other files of the folder are served', async () => {
  const { address } = await serve({
    'images/restore-window.png': 'png-bytes',
    'restore.md': '# Restore',
  });
  const response = await fetch(`${address}images/restore-window.png`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(await response.text()).toBe('png-bytes');
});

test('an image address with a version is served as the file', async () => {
  const { address } = await serve({ 'restore.md': '# Restore', 'restore-window.svg': svgImage('width="120" height="40"') });
  const response = await fetch(`${address}restore-window.svg?v=1`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/svg+xml');
});

test('a reload always asks for the last save', async () => {
  const { address } = await serve({ 'images/restore-window.png': 'png-bytes', 'restore.md': '# Restore' });
  for (const path of ['restore.html', 'images/restore-window.png', '__nerddocs/app.js']) {
    expect((await fetch(`${address}${path}`)).headers.get('cache-control')).toBe('no-cache');
  }
});

test('the page script and style are served', async () => {
  const { address } = await serve({});
  const script = await fetch(`${address}__nerddocs/app.js`);
  expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  expect(await script.text()).toBe(assets['app.js']);
  const style = await fetch(`${address}__nerddocs/app.css`);
  expect(style.headers.get('content-type')).toBe('text/css; charset=utf-8');
});

test('a docs folder named __nerddocs cannot replace the page script', async () => {
  const { address } = await serve({ '__nerddocs/app.js': 'console.log("from the docs")', '__nerddocs/notes.txt': 'notes' });
  expect(await (await fetch(`${address}__nerddocs/app.js`)).text()).toBe(assets['app.js']);
  expect((await fetch(`${address}__nerddocs/notes.txt`)).status).toBe(404);
});

test('an unknown address gives a 404 page with the nav', async () => {
  const { address } = await serve({ 'restore.md': '# Restore a file' });
  const response = await fetch(`${address}upgrade.html`, { headers: { Accept: 'text/html' } });
  expect(response.status).toBe(404);
  expect(await response.text()).toContain('>Restore a file</a>');
  expect((await fetch(`${address}missing.png`)).status).toBe(404);
});

test('a 404 page deep in folders keeps its style and its nav links', async () => {
  const { address } = await serve({ 'restore.md': '# Restore a file' });
  const response = await fetch(`${address}backups/plans/upgrade.html`, { headers: { Accept: 'text/html' } });
  const html = await response.text();
  expect(html).toContain('href="../../restore.html"');
  expect(html).toContain('href="../../__nerddocs/app.css"');
});

test('a HEAD request has no body, and other methods are refused', async () => {
  const { address } = await serve({ 'restore.md': '# Restore a file', 'images/restore-window.png': 'png-bytes' });
  for (const path of ['restore.html', 'images/restore-window.png', '__nerddocs/app.js']) {
    const head = await fetch(`${address}${path}`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  }
  const post = await fetch(`${address}restore.html`, { method: 'POST' });
  expect(post.status).toBe(405);
  expect(post.headers.get('allow')).toBe('GET, HEAD');
});

test('a HEAD request on the events address ends at once', async () => {
  const { address } = await serve({ 'restore.md': '# Restore a file' });
  const head = await fetch(`${address}__nerddocs/events`, { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(head.headers.get('content-type')).toBe('text/event-stream');
  expect(await head.text()).toBe('');
});

test('a request with another host name is refused on every address', async () => {
  const { address } = await serve({ 'restore.md': '# Restore a file', 'storage-keys.txt': 'top secret' });
  for (const path of ['/storage-keys.txt', '/restore.html', '/__nerddocs/events', '/__nerddocs/app.js']) {
    const response = await rawGet(address, path, 'attacker.example');
    expect(statusOf(response)).toBe(403);
    expect(response).not.toContain('top secret');
  }
  const { port } = new URL(address);
  expect(statusOf(await rawGet(address, '/storage-keys.txt', `attacker.example:${port}`))).toBe(403);
  expect(statusOf(await rawGet(address, '/storage-keys.txt', `127.0.0.1.attacker.example:${port}`))).toBe(403);
  expect(statusOf(await rawGet(address, '/storage-keys.txt', `localhost:${port}`))).toBe(200);
  expect(statusOf(await rawGet(address, '/storage-keys.txt', `127.0.0.1:${port}`))).toBe(200);
});

test('a file with a backslash in its name opens as a page', async () => {
  test.skip(process.platform === 'win32', 'Windows has no such file name.');
  const { address } = await serve({ 'restore\\backups.md': '# Restore backups' });
  const response = await fetch(`${address}restore%5Cbackups.html`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('Restore backups');
});

test('two files with one address open as one page, with one error line', async () => {
  test.skip(process.platform !== 'linux', 'Other systems can treat these two names as one file.');
  const lines: string[] = [];
  const { folder, address } = await serve({ 'restore.md': '# Restore a file', 'restore.MD': '# Restore a copy' }, 0, (line) => lines.push(line));
  expect(lines).toEqual([`Duplicate page: ${join(folder, 'restore.md')}`]);

  await writeFile(join(folder, 'restore.MD'), '# Restore a copy, saved');
  await expect.poll(async () => (await fetch(`${address}restore.html`)).text(), OFTEN).toContain('Restore a copy, saved');
  expect(lines).toHaveLength(1);
});

test('a file that cannot be read prints one error line and the site stays up', async () => {
  test.skip(process.getuid?.() === 0, 'The root user can read every file.');
  const folder = await folderWith(withConfig({ 'restore.md': '# Restore a file', 'storage.md': '# Storage' }));
  await chmod(join(folder, 'restore.md'), 0);
  const lines: string[] = [];
  const server = await startServer({ folder, port: 0, assets, log: (line) => lines.push(line) });
  running.push(server);

  await writeFile(join(folder, 'storage.md'), '# Storage\n\nSaved.');
  await expect.poll(async () => (await fetch(`${server.address}storage.html`)).text(), OFTEN).toContain('Saved.');
  expect(lines).toEqual([`Cannot read: ${join(folder, 'restore.md')}`]);
});

test('a file made unreadable while the command runs prints one error line', async () => {
  test.skip(process.getuid?.() === 0, 'The root user can read every file.');
  const lines: string[] = [];
  const { folder } = await serve({ 'restore.md': '# Restore a file' }, 0, (line) => lines.push(line));

  await chmod(join(folder, 'restore.md'), 0);

  await expect.poll(() => lines, OFTEN).toEqual([`Cannot read: ${join(folder, 'restore.md')}`]);
});

test('a second file with one address that appears while the command runs prints one error line', async () => {
  test.skip(process.platform !== 'linux', 'Other systems can treat these two names as one file.');
  const lines: string[] = [];
  const { folder } = await serve({ 'restore.md': '# Restore a file' }, 0, (line) => lines.push(line));

  await writeFile(join(folder, 'restore.MD'), '# Restore a copy');

  await expect.poll(() => lines, OFTEN).toEqual([`Duplicate page: ${join(folder, 'restore.md')}`]);
});

test('a section that cannot be watched prints one error line, and the other pages follow saves', async () => {
  test.skip(process.getuid?.() === 0, 'The root user can watch every folder.');
  const folder = await folderWith({ 'backups/restore.md': '# Restore a file', 'storage.md': '# Storage' });
  await chmod(join(folder, 'backups'), 0);
  const lines: string[] = [];
  try {
    const server = await startServer({ folder, port: 0, assets, log: (line) => lines.push(line) });
    running.push(server);
    const shown = async () => (await fetch(`${server.address}storage.html`)).text();

    // The second save shows only after the scan of the first save has ended.
    await saveAtOnce(folder, 'storage.md', '# Storage\n\nFirst save.');
    await expect.poll(shown, OFTEN).toContain('First save.');
    await saveAtOnce(folder, 'storage.md', '# Storage\n\nSecond save.');
    await expect.poll(shown, OFTEN).toContain('Second save.');

    expect(lines.filter((line) => line.startsWith('Cannot watch'))).toEqual([`Cannot watch: ${join(folder, 'backups')}`]);
  } finally {
    await chmod(join(folder, 'backups'), 0o755);
  }
});

test('a download that the client drops closes its file', async () => {
  test.skip(process.platform !== 'linux', 'The test reads open files from /proc.');
  const { folder, address } = await serve({});
  const movie = join(folder, 'restore.mp4');
  await writeFile(movie, '');
  await truncate(movie, 200 * 1024 * 1024);
  const openCount = async () => {
    let count = 0;
    for (const fd of await readdir('/proc/self/fd')) {
      if ((await readlink(`/proc/self/fd/${fd}`).catch(() => '')) === movie) count++;
    }
    return count;
  };

  const { hostname, port } = new URL(address);
  await new Promise<void>((resolve, reject) => {
    const socket = connect(Number(port), hostname, () => {
      socket.write(`GET /restore.mp4 HTTP/1.1\r\nHost: ${hostname}:${port}\r\n\r\n`);
    });
    socket.once('data', () => {
      socket.destroy();
      resolve();
    });
    socket.on('error', reject);
  });

  await expect.poll(openCount, OFTEN).toBe(0);
});

const escapes = [
  '/../storage-keys.txt',
  '/../../../../etc/passwd',
  '//etc/passwd',
  '/..%2fstorage-keys.txt',
  '/%2e%2e/storage-keys.txt',
  '/%2e%2e%2fstorage-keys.txt',
  '/images/..%2f..%2fstorage-keys.txt',
  '/..%5cstorage-keys.txt',
  '/images%00/../storage-keys.txt',
  '/%',
];
for (const path of escapes) {
  test(`no path can escape the folder: ${path}`, async () => {
    const parent = await folderWith({
      'storage-keys.txt': 'top secret',
      'site/restore.md': '# Restore',
      'site/images/restore-window.png': 'png',
    });
    const server = await startServer({ folder: join(parent, 'site'), port: 0, assets, log: () => {} });
    running.push(server);

    const response = await rawGet(server.address, path);

    expect(response).not.toContain('top secret');
    expect([302, 400, 404]).toContain(statusOf(response));
  });
}

test('dot folders, dot files and node_modules are not served', async () => {
  const { address } = await serve({
    '.git/config': 'secret',
    '.env': 'secret',
    'node_modules/backup-agent/index.js': 'secret',
    'backups/node_modules/backup-agent/index.js': 'secret',
    'restore.md': '# Restore',
    '.drafts/plan.md': '# Plan',
  });
  for (const path of [
    '.git/config',
    '.env',
    'node_modules/backup-agent/index.js',
    'backups/node_modules/backup-agent/index.js',
    '%2egit/config',
    '.drafts/plan.html',
    '.drafts/plan.md',
  ]) {
    const response = await rawGet(address, `/${path}`);
    expect(statusOf(response)).toBe(404);
    expect(response).not.toContain('secret');
  }
});

test('a busy port moves to the next port', async () => {
  const { port, release } = await busyPortBeforeFreePort();
  try {
    const { address, server } = await serve({}, port);
    expect(Number(new URL(address).port)).toBe(port + 1);
    expect(server.pageCount).toBe(0);
  } finally {
    await release();
  }
});

test('with every port up to the last one busy, the command prints one error line that names the first port', async () => {
  const release = await holdBusy([65533, 65534, 65535]);
  try {
    await expect(serve({}, 65535)).rejects.toThrow('No free port: 65535');
    await expect(serve({}, 65533)).rejects.toThrow('No free port: 65533');
  } finally {
    await release();
  }
});

test('a port that the system refuses prints one error line', async () => {
  const firstFree = await readFile('/proc/sys/net/ipv4/ip_unprivileged_port_start', 'utf8').catch(() => '0');
  test.skip(process.getuid?.() === 0 || Number(firstFree) <= 1, 'This system lets any user take port 1.');
  await expect(serve({}, 1)).rejects.toThrow('Port refused: 1');
});

test('a saved change reaches an open page as an update', async () => {
  const { folder, address } = await serve({ 'restore.md': '# Restore a file\n\nOld text.' });
  const abort = new AbortController();
  const stream = updates(address, '/restore.html', abort.signal);

  expect((await stream.next()).value.html).toBe('<p>Old text.</p>');

  await writeFile(join(folder, 'restore.md'), '# Restore a file\n\nNew text.');
  await updateWhere(stream, showsText('<p>New text.</p>'));

  abort.abort();
});

/** The version that the page writes on the `src` of an image, or null. */
const versionOf = (html: string, file: string) => new RegExp(`src="${file}\\?v=(\\d+)"`).exec(html)?.[1] ?? null;

test('a saved image reaches an open page as an update with its new version and size', async () => {
  const { folder, address } = await serve({
    'restore.md': '# Restore a file\n\n![Restore window](restore-window.svg)',
    'restore-window.svg': svgImage('width="120" height="40"'),
  });
  const abort = new AbortController();
  const stream = updates(address, '/restore.html', abort.signal);
  const first = (await stream.next()).value as PageView;
  expect(first.html).toContain('width="120"');
  const version = versionOf(first.html, 'restore-window.svg');
  expect(version).not.toBeNull();

  await writeFile(join(folder, 'restore-window.svg'), svgImage('width="240" height="80"'));
  const saved = await updateWhere(stream, (view) => view.html.includes('width="240"'));
  expect(saved.html).toContain('height="80"');
  expect(versionOf(saved.html, 'restore-window.svg')).not.toBeNull();
  expect(versionOf(saved.html, 'restore-window.svg')).not.toBe(version);
  abort.abort();
});

test('an image that a save creates replaces the box on an open page, and a removed image brings it back', async () => {
  const { folder, address } = await serve({ 'restore.md': '# Restore a file\n\n![Restore window](restore-window.svg)' });
  const abort = new AbortController();
  const stream = updates(address, '/restore.html', abort.signal);
  expect(((await stream.next()).value as PageView).html).toContain('class="problem"');

  await writeFile(join(folder, 'restore-window.svg'), svgImage('width="120" height="40"'));
  await updateWhere(stream, (view) => view.html.includes('<img') && !view.html.includes('class="problem"'));

  await rm(join(folder, 'restore-window.svg'));
  await updateWhere(stream, (view) => view.html.includes('class="problem"') && !view.html.includes('<img'));
  abort.abort();
});

test('a saved change reaches each open page', async () => {
  const { folder, address } = await serve({ 'restore.md': '# Restore a file\n\nOld text.', 'storage.md': '# Storage' });
  const abort = new AbortController();
  const samePage = updates(address, '/restore.html', abort.signal);
  const otherTab = updates(address, '/restore.html', abort.signal);
  await samePage.next();
  await otherTab.next();

  await writeFile(join(folder, 'restore.md'), '# Restore a file\n\nNew text.');

  await updateWhere(samePage, showsText('<p>New text.</p>'));
  await updateWhere(otherTab, showsText('<p>New text.</p>'));
  abort.abort();
});

test('a file added in a new folder reaches an open page', async () => {
  const { folder, address } = await serve({ 'restore.md': '# Restore a file' });
  const abort = new AbortController();
  const stream = updates(address, '/restore.html', abort.signal);
  await stream.next();

  await writeInto(folder, 'backups/plans/team.md', '# Team plan');

  await updateWhere(stream, (view) => JSON.stringify(view.tree).includes('Team plan'));
  abort.abort();
});

test('a change in a folder added after the start reaches an open page', async () => {
  const { folder, address } = await serve({ 'restore.md': '# Restore a file' });
  const abort = new AbortController();
  const stream = updates(address, '/restore.html', abort.signal);
  await stream.next();

  await writeInto(folder, 'backups/team.md', '# Team plan');
  await updateWhere(stream, (view) => JSON.stringify(view.tree).includes('Team plan'));

  await writeFile(join(folder, 'backups/team.md'), '# Team plan two');
  await updateWhere(stream, (view) => JSON.stringify(view.tree).includes('Team plan two'));
  abort.abort();
});

test('a file saved over and over holds back no other change', async () => {
  const clock = scanClock();
  const { folder, address } = await serve({ 'restore.md': '# Restore\n\nOld text.', 'backup-log.md': '# Log' });
  const heard = clock.nextTimer();
  await saveAtOnce(folder, 'restore.md', '# Restore\n\nNew text.');
  await heard;

  // Each save comes before the site waited long enough to scan, for 2 seconds of its clock.
  for (let n = 0; n < 50 && clock.fired() === 0; n++) {
    const next = clock.nextTimer();
    await saveAtOnce(folder, 'backup-log.md', `# Log\n\nLine ${n}.`);
    await next;
    clock.advance(40);
  }

  expect(clock.fired()).toBeGreaterThan(0);
  await expect.poll(async () => (await fetch(`${address}restore.html`)).text(), OFTEN).toContain('New text.');
});

test('a save during a scan shows when that scan ends', async () => {
  const clock = scanClock();
  const { folder, address } = await serve({ 'restore.md': '# Restore\n\nOld text.', 'storage.md': '# Storage' });
  const scan = holdNextRead(join(folder, 'storage.md'));

  // The site has read the old text of restore.md, and waits on storage.md.
  clock.advance(50);
  await scan.reached;

  const heard = clock.nextTimer();
  await saveAtOnce(folder, 'restore.md', '# Restore\n\nNew text.');
  await heard;
  clock.advance(50);
  scan.release();

  await expect
    .poll(async () => {
      clock.advance(50);
      return (await fetch(`${address}restore.html`)).text();
    }, OFTEN)
    .toContain('New text.');
});

test('a save made while the command starts shows', async () => {
  const folder = await folderWith({ 'restore.md': '# Restore\n\nOld text.', 'storage.md': '# Storage' });
  const firstScan = holdNextRead(join(folder, 'storage.md'));
  const starting = startServer({ folder, port: 0, assets, log: () => {} });

  // The first scan has read the old text of restore.md, and no watcher runs yet.
  await firstScan.reached;
  await writeFile(join(folder, 'restore.md'), '# Restore\n\nNew text.');
  firstScan.release();
  const server = await starting;
  running.push(server);

  await expect.poll(async () => (await fetch(`${server.address}restore.html`)).text(), OFTEN).toContain('New text.');
});

for (const seenGone of [true, false]) {
  const name = seenGone ? 'once the site shows it gone' : 'at once';
  test(`the folder removed and made again ${name} shows again and follows saves`, async () => {
    const { folder, address } = await serve({ 'restore.md': '# Restore\n\nOld text.' });
    const text = async () => (await fetch(`${address}restore.html`)).text();

    await rm(folder, { recursive: true });
    if (seenGone) await expect.poll(async () => (await fetch(`${address}restore.html`)).status, OFTEN).toBe(404);
    await writeInto(folder, 'restore.md', '# Restore\n\nBack.');
    await expect.poll(text, OFTEN).toContain('Back.');

    await writeFile(join(folder, 'restore.md'), '# Restore\n\nSaved again.');
    await expect.poll(text, OFTEN).toContain('Saved again.');
  });

  test(`a section removed and made again ${name} follows saves`, async () => {
    const { folder, address } = await serve({ 'backups/restore.md': '# Restore\n\nOld text.' });
    const text = async () => (await fetch(`${address}backups/restore.html`)).text();

    await rm(join(folder, 'backups'), { recursive: true });
    if (seenGone) await expect.poll(async () => (await fetch(`${address}backups/restore.html`)).status, OFTEN).toBe(404);
    await writeInto(folder, 'backups/restore.md', '# Restore\n\nBack.');
    await expect.poll(text, OFTEN).toContain('Back.');

    await writeFile(join(folder, 'backups/restore.md'), '# Restore\n\nSaved again.');
    await expect.poll(text, OFTEN).toContain('Saved again.');
  });
}

test('a renamed page sends its reader to the new address', async () => {
  const { folder, address } = await serve({ 'schedules.md': '# Restore a file\n\nText.', 'storage.md': '# Storage' });
  const abort = new AbortController();
  const stream = updates(address, '/schedules.html', abort.signal);
  await stream.next();

  await rename(join(folder, 'schedules.md'), join(folder, 'restore.md'));

  expect((await stream.next()).value.url).toBe('/restore.html');
  abort.abort();
});

test('a page renamed during a scan sends its reader to the new address', async () => {
  const { folder, address } = await serve({ 'schedules.md': '# Restore a file\n\nText.', 'storage.md': '# Storage' });
  const abort = new AbortController();
  const stream = updates(address, '/schedules.html', abort.signal);
  await stream.next();
  const scan = holdNextRead(join(folder, 'schedules.md'));
  await saveAtOnce(folder, 'storage.md', '# Storage');

  // The site has listed schedules.md, and the file goes before the site can read it.
  await scan.reached;
  await rename(join(folder, 'schedules.md'), join(folder, 'restore.md'));
  scan.release();

  expect((await stream.next()).value.url).toBe('/restore.html');
  abort.abort();
});

test('a change on another page that leaves this page and the nav alone sends nothing', async () => {
  const { folder, address } = await serve({ 'restore.md': '# Restore', 'storage.md': '# Storage\n\nOld.' });
  const abort = new AbortController();
  const stream = updates(address, '/restore.html', abort.signal);
  await stream.next();

  await writeFile(join(folder, 'storage.md'), '# Storage\n\nNew.');
  await expect.poll(async () => (await fetch(`${address}storage.html`)).text(), OFTEN).toContain('New.');
  await rm(join(folder, 'restore.md'));

  // The first update is the deletion, so the site had the edit and sent nothing for it.
  expect((await stream.next()).value.url).toBe('/storage.html');
  abort.abort();
});

test('a new title on another page reaches an open page, for its nav', async () => {
  const { folder, address } = await serve({ 'restore.md': '# Restore', 'storage.md': '# Storage' });
  const abort = new AbortController();
  const stream = updates(address, '/restore.html', abort.signal);
  await stream.next();

  await writeFile(join(folder, 'storage.md'), '# Block storage');

  const view = (await stream.next()).value as PageView;
  expect(view.url).toBe('/restore.html');
  expect(JSON.stringify(view.tree)).toContain('Block storage');
  abort.abort();
});

test.describe('level problems in the terminal', () => {
  const PAGE = '::: overview\nOne.\n::: internals\nTwo.\n:::\n';

  test('each problem prints one line with its name and value, and prints once', async () => {
    const lines: string[] = [];
    const { folder, server } = await serve(
      {
        'nerddocs.json': '{"levels":[{"id":"overview","icon":"rocket"},{"id":"requirements"}],"defaultLevel":"testers"}',
        'restore.md': PAGE,
      },
      0,
      (line) => lines.push(line),
    );
    const config = join(folder, 'nerddocs.json');
    expect(lines).toEqual([
      `Unknown icon: rocket ${config}`,
      `Unknown level: internals ${join(folder, 'restore.md')}`,
      `Unknown level: testers ${config}`,
    ]);

    await saveAtOnce(folder, 'restore.md', `${PAGE}\nA new line.\n`);
    await expect.poll(async () => (await fetch(`${server.address}restore.html`)).text(), OFTEN).toContain('A new line.');
    expect(lines).toHaveLength(3);
  });

  test('a bad config prints its line, and prints it again when it comes back after a fix', async () => {
    const lines: string[] = [];
    const { folder, server } = await serve({ 'nerddocs.json': '{not json', 'restore.md': PAGE }, 0, (line) => lines.push(line));
    const badConfig = `Bad config: ${join(folder, 'nerddocs.json')}`;
    expect(lines).toEqual([badConfig]);

    const named = '{"levels":[{"id":"overview","name":"The short read"},{"id":"internals"}]}';
    await saveAtOnce(folder, 'nerddocs.json', named);
    await expect.poll(async () => (await fetch(`${server.address}restore.html`)).text(), OFTEN).toContain('The short read');
    expect(lines).toEqual([badConfig]);

    await saveAtOnce(folder, 'nerddocs.json', '{not json');
    await expect.poll(() => lines, OFTEN).toEqual([badConfig, badConfig]);
  });

  test('a missing config prints its line once, and prints it again when it comes back after a fix', async () => {
    const folder = await folderWith({ 'restore.md': '# Restore\n\nOld text.' });
    const lines: string[] = [];
    const server = await startServer({ folder, port: 0, assets, log: (line) => lines.push(line) });
    running.push(server);
    const shown = async () => (await fetch(`${server.address}restore.html`)).text();
    const missing = `Missing config: ${join(folder, 'nerddocs.json')}`;
    expect(lines).toEqual([missing]);

    await saveAtOnce(folder, 'restore.md', '# Restore\n\nNew text.');
    await expect.poll(shown, OFTEN).toContain('New text.');
    expect(lines).toEqual([missing]);

    await saveAtOnce(folder, 'nerddocs.json', '{"levels":[{"id":"overview","name":"The short read"},{"id":"internals"}]}');
    await saveAtOnce(folder, 'restore.md', '# Restore\n\n::: overview\nOne.\n::: internals\nTwo.\n:::\n');
    await expect.poll(shown, OFTEN).toContain('The short read');
    expect(lines).toEqual([missing]);

    await rm(join(folder, 'nerddocs.json'));
    await expect.poll(() => lines, OFTEN).toEqual([missing, missing]);
  });

  test('an unknown word in a page that does not change prints once across scans', async () => {
    const lines: string[] = [];
    const { folder, server } = await serve(
      { 'nerddocs.json': '{"levels":[{"id":"overview"},{"id":"internals"}]}', 'restore.md': '::: testers\nOne.\n', 'storage.md': '# Storage' },
      0,
      (line) => lines.push(line),
    );
    const unknown = `Unknown level: testers ${join(folder, 'restore.md')}`;
    expect(lines).toEqual([unknown]);

    await saveAtOnce(folder, 'storage.md', '# Storage\n\nA new line.\n');
    await expect.poll(async () => (await fetch(`${server.address}storage.html`)).text(), OFTEN).toContain('A new line.');
    expect(lines).toEqual([unknown]);
  });

  test('a missing image prints its line once across scans, and prints it again when it comes back after a fix', async () => {
    const lines: string[] = [];
    const { folder, server } = await serve(
      { 'restore.md': '# Restore a file\n\n![Restore window](restore-window-old.png)\n', 'storage.md': '# Storage' },
      0,
      (line) => lines.push(line),
    );
    const shown = async (page: string) => (await fetch(`${server.address}${page}`)).text();
    const missing = `Missing file: restore-window-old.png ${join(folder, 'restore.md')}`;
    expect(lines).toEqual([missing]);

    await saveAtOnce(folder, 'storage.md', '# Storage\n\nA new line.\n');
    await expect.poll(() => shown('storage.html'), OFTEN).toContain('A new line.');
    expect(lines).toEqual([missing]);

    await saveAtOnce(folder, 'restore-window-old.png', svgImage('width="120" height="40"'));
    await expect.poll(() => shown('restore.html'), OFTEN).toContain('src="restore-window-old.png?v=');
    expect(lines).toEqual([missing]);

    await rm(join(folder, 'restore-window-old.png'));
    await expect.poll(() => lines, OFTEN).toEqual([missing, missing]);
  });

  test('a saved config reaches an open page, and renders its fences again with no change to the page', async () => {
    const { folder, address } = await serve({
      'nerddocs.json': '{"levels":[{"id":"overview"},{"id":"internals"}]}',
      'restore.md': '::: overview\nOne.\n::: testers\nTwo.\n:::\n',
    });
    const abort = new AbortController();
    const stream = updates(address, '/restore.html', abort.signal);
    const first = (await stream.next()).value as PageView;
    expect(first.configProblem).toBeNull();
    expect(first.parts).toEqual(['overview']);
    expect(first.html).toContain('::: testers');

    await saveAtOnce(folder, 'nerddocs.json', '{"levels":[{"id":"overview"},{"id":"testers"}]}');
    const listed = (await stream.next()).value as PageView;
    expect(listed.parts).toEqual(['overview', 'testers']);
    expect(listed.html).not.toContain('::: testers');

    await rm(join(folder, 'nerddocs.json'));
    const missing = (await stream.next()).value as PageView;
    expect(missing.configProblem).toBe('missing');
    expect(missing.levels).toEqual([]);
    expect(missing.html).toContain('::: overview');

    await saveAtOnce(folder, 'nerddocs.json', '{not json');
    expect(((await stream.next()).value as PageView).configProblem).toBe('broken');
    abort.abort();
  });
});

test.describe('dimensions', () => {
  const foldersOf = (view: PageView) => view.dimensions.map((dimension) => dimension.folder);
  const pageText = async (address: string, url: string) => (await fetch(new URL(url, address))).text();

  test('the site root opens the first page of the first dimension, a page keeps its address, and the page count counts the pages of the site', async () => {
    const { address, server } = await serve(DIMENSION_SITE);

    const root = await fetch(address, { redirect: 'manual' });
    expect(root.status).toBe(302);
    expect(root.headers.get('location')).toBe('/user-guide/index.html');
    const legal = await fetch(`${address}legal/`, { redirect: 'manual' });
    expect(legal.status).toBe(302);
    expect(legal.headers.get('location')).toBe('/legal/privacy.html');
    expect((await fetch(new URL(RESTORE, address))).status).toBe(200);
    expect(server.pageCount).toBe(6);
  });

  test('a page outside the dimensions gives a 404 page, and its other files are still served', async () => {
    const { address } = await serve(DIMENSION_SITE);

    for (const path of ['README.html', 'drafts/plan.html']) {
      const response = await fetch(`${address}${path}`, { headers: { Accept: 'text/html' } });
      expect(response.status, path).toBe(404);
    }
    expect((await fetch(`${address}README.md`, { redirect: 'manual' })).status).toBe(404);
    expect((await fetch(`${address}images/restore-window.svg`)).status).toBe(200);
  });

  test('each dimension line prints once, and prints again when it comes back after a fix', async () => {
    const withArchive = dimensionsConfig([
      { folder: 'user-guide' },
      { folder: 'administration' },
      { folder: 'legal', name: 'Legal and privacy' },
      { folder: 'archive' },
    ]);
    const lines: string[] = [];
    const { folder, address } = await serve({ ...DIMENSION_SITE, 'nerddocs.json': withArchive }, 0, (line) => lines.push(line));
    const config = join(folder, 'nerddocs.json');
    const missing = `Missing dimension: archive ${config}`;
    const outside = [`Outside dimensions: ${join(folder, 'README.md')}`, `Outside dimensions: ${join(folder, 'drafts')}`];
    expect(lines).toEqual([missing, ...outside]);

    await saveAtOnce(join(folder, 'user-guide/backups'), '02-schedules.md', '# Schedules\n\nA plan says how often.\n\nA new line.\n');
    await expect.poll(() => pageText(address, '/user-guide/backups/schedules.html'), OFTEN).toContain('A new line.');
    expect(lines).toHaveLength(3);

    await saveAtOnce(folder, 'nerddocs.json', DIMENSIONS_CONFIG.replace('Legal and privacy', 'Legal'));
    await expect.poll(() => pageText(address, RESTORE), OFTEN).toContain('<span class="dn">Legal</span>');
    expect(lines).toHaveLength(3);

    await saveAtOnce(folder, 'nerddocs.json', withArchive);
    await expect.poll(() => lines, OFTEN).toEqual([missing, ...outside, missing]);
  });

  test('a save of nerddocs.json that changes the dimensions reaches an open page', async () => {
    const { folder, address } = await serve(DIMENSION_SITE);
    const abort = new AbortController();
    const stream = updates(address, '/user-guide/index.html', abort.signal);
    expect(foldersOf((await stream.next()).value as PageView)).toEqual(['user-guide', 'administration', 'legal']);

    await saveAtOnce(folder, 'nerddocs.json', dimensionsConfig([{ folder: 'legal' }, { folder: 'user-guide' }]));
    const swapped = await updateWhere(stream, (view) => foldersOf(view).join(' ') === 'legal user-guide');
    expect(swapped.tree.map((node) => (node.kind === 'section' ? node.id : node.url))).toEqual(['legal', 'user-guide']);

    await saveAtOnce(folder, 'nerddocs.json', dimensionsConfig());
    const none = await updateWhere(stream, (view) => view.dimensions.length === 0);
    expect(none.tree[0]).toEqual({ kind: 'page', url: '/README.html', title: 'Backup app' });
    abort.abort();
  });

  test('a reader on a page of a dimension that leaves the list moves to the page before it', async () => {
    const { folder, address } = await serve(DIMENSION_SITE);
    const abort = new AbortController();
    const stream = updates(address, '/legal/privacy.html', abort.signal);
    await stream.next();

    await saveAtOnce(folder, 'nerddocs.json', dimensionsConfig([{ folder: 'user-guide' }, { folder: 'administration' }]));

    const moved = await updateWhere(stream, (view) => view.url !== '/legal/privacy.html');
    expect(moved.url).toBe('/administration/users.html');
    abort.abort();
  });
});
