import { createReadStream } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { pipeline } from 'node:stream';
import { errorLine, TerminalError } from '../cli/terminal-error.ts';
import { BUILD_FILES } from '../page/diagrams.ts';
import { renderPage, type AssetName } from '../page/page-html.tsx';
import { PREVIEW_URL } from '../page/theme-preview.ts';
import { isMarkdownName } from '../site/names.ts';
import { APP_FOLDER, folderAddresses, scanSite, type Site } from '../site/scan.ts';
import { encodeUrl } from '../site/urls.ts';
import { hasPage, movedUrl, nextUrl, viewOf } from '../site/view.ts';
import { THEMES } from '../themes/index.ts';
import { previewPage } from '../themes/preview/page.ts';
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
  log: (line: string) => void;
}

export interface RunningServer {
  address: string;
  pageCount: number;
  close(): Promise<void>;
}

interface Reader {
  response: ServerResponse;
  url: string;
  rev: string | null;
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
  let { fonts, diagrams } = options;
  const fontFiles = () => (fonts ??= readFonts(THEMES, cloneModules()));
  const diagramBuilds = () => (diagrams ??= readDiagramBuilds(cloneModules()));
  const readers = new Set<Reader>();
  const reported = new Set<string>();
  const reportOnce = (line: string) => {
    if (!reported.has(line)) log(line);
    reported.add(line);
  };
  const scanOptions = {
    onReadError: (path: string) => reportOnce(errorLine('Cannot read', path)),
    onDuplicate: (path: string) => reportOnce(errorLine('Duplicate page', path)),
  };
  /** A level problem or a file problem logs once. It logs again when it comes back after a scan without it. */
  let levelProblems = new Set<string>();
  function reportLevelProblems(lines: Set<string>): void {
    for (const line of lines) {
      if (!levelProblems.has(line)) log(line);
    }
    levelProblems = lines;
  }

  const firstProblems = new Set<string>();
  const addFirst = (line: string) => firstProblems.add(line);
  let site: Site = await scanSite(folder, { ...scanOptions, onLevelProblem: addFirst, onFileProblem: addFirst });
  reportLevelProblems(firstProblems);

  const watcher = new FolderWatcher(
    folder,
    () => scheduleScan(),
    (path) => reportOnce(errorLine('Cannot watch', path)),
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
      const problems = new Set<string>();
      const scanned = await scanSite(folder, {
        previous,
        ...scanOptions,
        onGone: () => (gone = true),
        onLevelProblem: (line) => problems.add(line),
        onFileProblem: (line) => problems.add(line),
      });
      if (closed) return;
      // A file that went away during the scan can be a rename, and the next scan shows what it became.
      if (gone) {
        scanAgain = true;
        return;
      }
      site = scanned;
      reportLevelProblems(problems);
      for (const reader of readers) {
        reader.url = nextUrl(previous, site, reader.url);
        send(reader);
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
    const html = renderPage(viewOf(site, url), { live: true });
    respond(request, response, status, contentTypeOf('page.html'), html);
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
    const reader: Reader = { response, url: page, rev: null };
    readers.add(reader);
    request.on('close', () => readers.delete(reader));
    // A save can land between the page load and this connection, so send the view now.
    send(reader, true);
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!LOCAL_HOST.test(request.headers.host ?? '')) {
      response.writeHead(403).end();
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
      else if (path === PREVIEW_URL) respond(request, response, 200, contentTypeOf(path), previewPage());
      else if (name.startsWith(FONTS_FOLDER)) showFont(request, response, name.slice(FONTS_FOLDER.length));
      else if (name === LICENSES_FILE) showLicenses(request, response);
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

  const port = await listen(server, options.port);
  // Scanning again after the first watchers start catches a save made before they ran.
  if (await watcher.sync(site.folders, site.used)) scheduleScan();

  return {
    address: `http://127.0.0.1:${port}/`,
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
