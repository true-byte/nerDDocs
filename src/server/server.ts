import { createReadStream } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { pipeline } from 'node:stream';
import launchEditor from 'launch-editor';
import { problemBlock, shownPath } from '../cli/problem-block.ts';
import { errorLine, TerminalError } from '../cli/terminal-error.ts';
import { BUILD_FILES } from '../page/diagrams.ts';
import { renderPage, type AssetName } from '../page/page-html.tsx';
import { PREVIEW_URL } from '../page/theme-preview.ts';
import { isMarkdownName } from '../site/names.ts';
import { APP_FOLDER, folderAddresses, scanSite, type Page, type Site } from '../site/scan.ts';
import { savedPages } from '../site/saved-pages.ts';
import { searchScript } from '../site/search-file.ts';
import { encodeUrl } from '../site/urls.ts';
import { hasPage, movedUrl, nextUrl, viewOf, type PageView } from '../site/view.ts';
import { THEMES } from '../themes/index.ts';
import { previewPage } from '../themes/preview/page.ts';
import { authorCookie, isAuthor } from './author.ts';
import { readDiagramBuilds, type DiagramBuilds } from './diagram-builds.ts';
import { readFonts, type FontFiles } from './fonts.ts';
import { contentTypeOf, findPublicFile, publicUrlPath } from './public-file.ts';
import { FolderWatcher } from './watch.ts';

/** Paths under this folder belong to the app, even if the docs hold a folder of that name. */
const APP_PATH = `/${APP_FOLDER}/`;
/** The font files of the themes, under the app folder. `app.css` names them relative to itself. */
const FONTS_FOLDER = 'fonts/';
/** The licenses of the fonts and of what the Mermaid builds bundle, under the app folder. */
const LICENSES_FILE = 'licenses.txt';
/** The text of every page for the search box, under the app folder. */
const SEARCH_FILE = 'search.js';
/** The address that sets the author cookie, under the app folder, followed by the key. */
const AUTHOR_FOLDER = 'author/';
/** The address that opens a file of the docs in the editor, under the app folder. */
const OPEN_FILE = 'open';
/** The `node_modules` of the clone, for a server that the command did not start. The command holds its own files. */
const cloneModules = () => join(import.meta.dirname, '../../node_modules');
const SAVE_SETTLE_MS = 50;
/** A file saved with no pause still lets a scan run within this time. */
const SAVE_MAX_WAIT_MS = 500;
/** A page on another host name can reach this server only by a DNS rebinding attack. */
const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;

export interface ServerOptions {
  folder: string;
  port: number;
  assets: Record<AssetName, string>;
  /** The command passes the font files that it holds. With none, they come from the `node_modules` of the clone. */
  fonts?: FontFiles;
  /** The command passes the builds that it holds. With none, they come from the `node_modules` of the clone. */
  diagrams?: DiagramBuilds;
  /** The key of the author address. With none, no request is an author request. */
  authorKey?: string;
  log: (line: string) => void;
  /** True when the blocks of the problems print with color. */
  color?: boolean;
  /** The folder that each printed path is relative to. With none, it is the current folder of the process. */
  cwd?: string;
}

export interface RunningServer {
  address: string;
  /** The address that makes the browser that opens it the author browser, or null with no author key. */
  authorAddress: string | null;
  pageCount: number;
  close(): Promise<void>;
}

interface Reader {
  response: ServerResponse;
  url: string;
  rev: string | null;
  /** True for the events of the author browser. */
  author: boolean;
  /** The JSON of the problems that the stream got last, or null before the first. */
  problems: string | null;
}

/** True when a page of the site came or went, or got a new render, so the search file changed. */
function changedText(before: Site, after: Site): boolean {
  return (
    before.pages.length !== after.pages.length ||
    before.pages.some((page, at) => page !== after.pages[at]) ||
    JSON.stringify(before.dimensions) !== JSON.stringify(after.dimensions)
  );
}

function listen(server: Server, firstPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = firstPort;
    const tryPort = () => server.listen(port, '127.0.0.1');
    server.on('listening', () => resolve((server.address() as { port: number }).port));
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && port < 65535) {
        port++;
        tryPort();
      } else if (error.code === 'EADDRINUSE') {
        reject(new TerminalError('No free port', String(firstPort)));
      } else if (error.code === 'EACCES') {
        reject(new TerminalError('Port refused', String(port)));
      } else {
        reject(new TerminalError('Server failure', error.message));
      }
    });
    tryPort();
  });
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const { folder, assets, log } = options;
  const authorKey = options.authorKey ?? null;
  const cwd = options.cwd ?? process.cwd();
  const shown = (path: string) => shownPath(path, cwd);
  let { fonts, diagrams } = options;
  const fontFiles = () => (fonts ??= readFonts(THEMES, cloneModules()));
  const diagramBuilds = () => (diagrams ??= readDiagramBuilds(cloneModules()));
  const readers = new Set<Reader>();
  /**
   * The pages that the author has not seen since their saves: the page before its first save since the author last
   * opened it, or null for a page that came after that.
   */
  const unseen = new Map<string, Page | null>();
  /** The port that the server listens on, set once it listens. */
  let port = 0;
  const reported = new Set<string>();
  const reportOnce = (line: string) => {
    if (!reported.has(line)) log(line);
    reported.add(line);
  };
  /** The keys of the problems of the scan before. A problem prints once, and again when it comes back after a scan without it. */
  let printed = new Set<string>();
  function printProblems(): void {
    const levelNames = Object.fromEntries(site.levels.map((level) => [level.id, level.name]));
    const print = { folder, cwd, color: options.color ?? false, levelNames };
    for (const problem of site.problems) if (!printed.has(problem.key)) log(`${problemBlock(problem, print)}\n`);
    printed = new Set(site.problems.map((problem) => problem.key));
  }

  let site: Site = await scanSite(folder);
  printProblems();

  const watcher = new FolderWatcher(
    folder,
    () => scheduleScan(),
    (path) => reportOnce(errorLine('Cannot watch', shown(path))),
  );

  function send(reader: Reader, force = false): void {
    const view = viewOf(site, reader.url);
    reader.url = view.url;
    if (!force && view.rev === reader.rev) return;
    reader.rev = view.rev;
    reader.response.write(`data: ${JSON.stringify(view)}\n\n`);
  }

  let timer: NodeJS.Timeout | null = null;
  let firstEvent: number | null = null;
  let scanning = false;
  let scanAgain = false;
  let closed = false;

  function scheduleScan(): void {
    if (closed) return;
    if (timer) clearTimeout(timer);
    firstEvent ??= Date.now();
    const left = firstEvent + SAVE_MAX_WAIT_MS - Date.now();
    timer = setTimeout(() => {
      firstEvent = null;
      void scan();
    }, Math.max(0, Math.min(SAVE_SETTLE_MS, left)));
  }

  /** Scans one at a time, and once more when a change arrived during a scan. */
  async function scan(): Promise<void> {
    if (scanning) {
      scanAgain = true;
      return;
    }
    scanning = true;
    try {
      const previous = site;
      let gone = false;
      const scanned = await scanSite(folder, { previous, onGone: () => (gone = true) });
      if (closed) return;
      // A file that went away during the scan can be a rename, and the next scan shows what it became.
      if (gone) {
        scanAgain = true;
        return;
      }
      site = scanned;
      printProblems();
      const searchChanged = changedText(previous, site);
      for (const reader of readers) {
        reader.url = nextUrl(previous, site, reader.url);
        send(reader);
        // An open search box loads the search file again on its next open.
        if (searchChanged) reader.response.write('event: search\ndata: \n\n');
      }
      if (authorKey) {
        tellSaves(previous, savedPages(previous, site));
        for (const reader of readers) if (reader.author) sendProblems(reader);
      }
      // A new folder can gain files before its watcher starts, so scan again after that.
      if (await watcher.sync(site.folders, site.used)) scanAgain = true;
    } catch (error) {
      log(errorLine('Server failure', (error as Error).message));
    } finally {
      scanning = false;
      if (scanAgain && !closed) {
        scanAgain = false;
        scheduleScan();
      }
    }
  }

  /** The addresses of the pages that the author has not seen, in tree order. */
  const unseenList = () => site.pages.filter((page) => unseen.has(page.url)).map((page) => page.url);

  /** Sends the problems of the site to an author reader, when they differ from what its stream got last. */
  function sendProblems(reader: Reader): void {
    const json = JSON.stringify({ problems: site.problems });
    if (json === reader.problems) return;
    reader.problems = json;
    reader.response.write(`event: problems\ndata: ${json}\n\n`);
  }

  function sendSaved(reader: Reader, pages: string[]): void {
    reader.response.write(`event: saved\ndata: ${JSON.stringify({ pages, unseen: unseenList() })}\n\n`);
  }

  /** Keeps the old text of each saved page with no author reader on it, and tells each author reader of the saves. */
  function tellSaves(previous: Site, pages: string[]): void {
    for (const url of pages) {
      if (unseen.has(url) || [...readers].some((reader) => reader.author && reader.url === url)) continue;
      unseen.set(url, previous.pages.find((page) => page.url === url) ?? null);
    }
    for (const url of unseen.keys()) if (!hasPage(site, url)) unseen.delete(url);
    for (const reader of readers) if (reader.author) sendSaved(reader, pages);
  }

  /** The view of a page with the text that it had before the saves that the author has not seen. A new page has no text. */
  function unseenView(url: string): PageView {
    const now = site.pages.find((page) => page.url === url);
    const old = unseen.get(url);
    if (!now || old === undefined) return viewOf(site, url);
    const kept = old ?? { ...now, html: '' };
    return viewOf({ ...site, pages: site.pages.map((page) => (page === now ? kept : page)) }, url);
  }

  const fromAuthor = (request: IncomingMessage) => isAuthor(request.headers.cookie, port, authorKey);

  function redirect(response: ServerResponse, url: string): void {
    response.writeHead(302, { Location: encodeUrl(url) }).end();
  }

  function respond(
    request: IncomingMessage,
    response: ServerResponse,
    status: number,
    type: string,
    body: string | Uint8Array,
  ): void {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : body);
  }

  function showView(request: IncomingMessage, response: ServerResponse, url: string, status: number): void {
    const html = fromAuthor(request)
      ? renderPage(unseenView(url), { live: true, author: { unseen: unseenList(), problems: site.problems } })
      : renderPage(viewOf(site, url), { live: true });
    respond(request, response, status, contentTypeOf('page.html'), html);
  }

  /** The author address sets the author cookie and opens the docs. Any other key opens nothing. */
  function openAuthor(response: ServerResponse, key: string): void {
    if (!authorKey || key !== authorKey) {
      response.writeHead(404).end();
      return;
    }
    response
      .writeHead(302, {
        Location: '/',
        'Set-Cookie': `${authorCookie(port)}=${authorKey}; Path=/; HttpOnly; SameSite=Strict`,
      })
      .end();
  }

  function showFont(request: IncomingMessage, response: ServerResponse, name: string): void {
    const { files } = fontFiles();
    if (Object.hasOwn(files, name)) respond(request, response, 200, contentTypeOf(name), files[name]!);
    else response.writeHead(404).end();
  }

  function showLicenses(request: IncomingMessage, response: ServerResponse): void {
    const licenses = `${fontFiles().licenses}\n${diagramBuilds().licenses}`;
    respond(request, response, 200, contentTypeOf(LICENSES_FILE), licenses);
  }

  function openEvents(request: IncomingMessage, response: ServerResponse): void {
    const page = new URL(request.url ?? '', 'http://localhost').searchParams.get('page') ?? '/';
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const reader: Reader = { response, url: page, rev: null, author: fromAuthor(request), problems: null };
    readers.add(reader);
    request.on('close', () => readers.delete(reader));
    // A save can land between the page load and this connection, so send the view now.
    send(reader, true);
    if (reader.author) sendProblems(reader);
    // The author sees the page now, so it leaves the pages that the author has not seen.
    if (reader.author && unseen.delete(reader.url)) {
      for (const other of readers) if (other.author && other !== reader) sendSaved(other, []);
    }
  }

  /**
   * Opens a public file of the docs folder in the editor, at its line, for the author browser only. The editor starts
   * after the answer, and a failure prints a command error.
   */
  async function openFile(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const query = new URL(request.url ?? '', 'http://localhost').searchParams;
    const file = query.get('file');
    const line = query.get('line');
    const goodLine = line === null || /^[1-9]\d*$/.test(line);
    const allowed = request.method === 'GET' && fromAuthor(request) && !!file && goodLine;
    const found = allowed ? await findPublicFile(folder, file) : null;
    if (!found || !file) {
      response.writeHead(404).end();
      return;
    }
    const path = join(folder, file);
    response.writeHead(204).end();
    const onError = () => log(errorLine('Cannot open editor', shown(path)));
    launchEditor(line === null ? path : `${path}:${line}`, undefined, onError);
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!LOCAL_HOST.test(request.headers.host ?? '')) {
      response.writeHead(403).end();
      return;
    }

    if (publicUrlPath(request.url ?? '/') === `${APP_PATH}${OPEN_FILE}`) {
      await openFile(request, response);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }

    const path = publicUrlPath(request.url ?? '/');
    if (path === null) {
      response.writeHead(404).end();
      return;
    }

    if (path.startsWith(APP_PATH)) {
      const name = path.slice(APP_PATH.length);
      if (name === 'events') openEvents(request, response);
      else if (name.startsWith(AUTHOR_FOLDER)) openAuthor(response, name.slice(AUTHOR_FOLDER.length));
      else if (path === PREVIEW_URL) respond(request, response, 200, contentTypeOf(path), previewPage());
      else if (name.startsWith(FONTS_FOLDER)) showFont(request, response, name.slice(FONTS_FOLDER.length));
      else if (name === LICENSES_FILE) showLicenses(request, response);
      else if (name === SEARCH_FILE) respond(request, response, 200, contentTypeOf(name), searchScript(site));
      else if (name === 'app.js' || name === 'app.css') {
        respond(request, response, 200, contentTypeOf(name), assets[name]);
      } else if (Object.values(BUILD_FILES).includes(name)) {
        respond(request, response, 200, contentTypeOf(name), diagramBuilds().files[name] ?? '');
      } else response.writeHead(404).end();
      return;
    }

    if (hasPage(site, path)) {
      showView(request, response, path, 200);
      return;
    }

    if (path === '/') {
      const first = site.pages[0];
      if (first) redirect(response, first.url);
      else showView(request, response, path, 200);
      return;
    }

    // A Markdown file opens its page. It is never sent as a file.
    const moved = isMarkdownName(path) ? movedUrl(site, folderAddresses(folder), path) : null;
    if (moved) {
      redirect(response, moved);
      return;
    }

    const folderPrefix = path.endsWith('/') ? path : `${path}/`;
    const firstInFolder = site.pages.find((page) => page.url.startsWith(folderPrefix));
    if (firstInFolder) {
      redirect(response, firstInFolder.url);
      return;
    }

    const file = isMarkdownName(path) ? null : await findPublicFile(folder, path);
    if (file) {
      response.writeHead(200, { 'Content-Type': contentTypeOf(file), 'Cache-Control': 'no-cache' });
      if (request.method === 'HEAD') response.end();
      else pipeline(createReadStream(file), response, () => {});
      return;
    }

    // An old address with the order prefixes of the names opens the page at its address. A file of that name wins.
    const old = isMarkdownName(path) ? null : movedUrl(site, folderAddresses(folder), path);
    if (old) {
      redirect(response, old);
      return;
    }

    if (request.headers.accept?.includes('text/html')) showView(request, response, path, 404);
    else response.writeHead(404).end();
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: Error) => {
      log(errorLine('Server failure', error.message));
      if (response.headersSent) response.destroy();
      else response.writeHead(500).end();
    });
  });

  port = await listen(server, options.port);
  // Scanning again after the first watchers start catches a save made before they ran.
  if (await watcher.sync(site.folders, site.used)) scheduleScan();

  return {
    address: `http://127.0.0.1:${port}/`,
    authorAddress: authorKey ? `http://127.0.0.1:${port}/__nerddocs/author/${authorKey}` : null,
    pageCount: site.pages.length,
    close: () =>
      new Promise((resolve) => {
        closed = true;
        if (timer) clearTimeout(timer);
        watcher.close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
