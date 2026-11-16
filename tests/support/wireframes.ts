import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, type Frame, type Page, type Request } from '@playwright/test';
import { pathPart } from '../../src/markdown/embed.ts';
import { renderPage } from '../../src/page/page-html.tsx';
import { scanSite } from '../../src/site/scan.ts';
import { viewOf } from '../../src/site/view.ts';
import { folderWith, writeInto, type FileContent } from './folder.ts';
import { pngFile } from './images.ts';
import { THREE_LEVELS } from './levels.ts';
import { STEPS } from './page-content.ts';
import { OFTEN } from './poll.ts';
import { REPO } from './run-command.ts';

/** The wireframe 'Restore wizard' of the backup app: two steps in one file, a theme switch and a link to step 2. */
export const WIZARD_HTML = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<title>Restore wizard</title>
<link rel="stylesheet" href="wizard.css">
<script src="wizard.js"></script>
</head>
<body>
<header><strong>Restore</strong><button id="theme" type="button" aria-label="Theme">◐</button></header>
<form id="step-1" onsubmit="next(event)">
<label>File <input id="file" value="report.docx"></label>
<img src="step.png" alt="" width="1280" height="720">
<button id="go" type="submit">Next</button>
<a id="skip" href="#step-2">Pick a day</a>
</form>
<section id="step-2" hidden>
<p>Pick a day</p>
<div class="days"></div>
<button id="restore" type="button">Restore</button>
</section>
</body>
</html>
`;

/** The styles of the wireframes, with a light and a dark theme of their own. A link to `#step-2` shows step 2. */
export const WIZARD_CSS = `:root { --bg: #ffffff; --ink: #1d2730; --acc: #2b6ca3; }
:root[data-theme="dark"] { --bg: #1f262e; --ink: #d4dce3; --acc: #74abdc; }
@media (prefers-color-scheme: dark) { :root[data-theme="auto"] { --bg: #1f262e; --ink: #d4dce3; --acc: #74abdc; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--ink); font: 15px system-ui, sans-serif; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
button { background: var(--acc); color: var(--bg); border: 0; border-radius: 6px; padding: 8px 14px; font: inherit; }
img { display: block; max-width: 100%; height: auto; margin: 12px 0; }
.days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin: 12px 0; }
.days span { aspect-ratio: 1; background: var(--acc); opacity: .35; border-radius: 4px; }
#step-2:target { display: block; }
`;

/** The script of the wireframes: the theme switch, 'Next', which shows step 2 with 35 days, and Esc in 'File', which empties it. */
export const WIZARD_JS = `// The wireframe's own script: a theme switch and two steps.
var saved = null;
try { saved = localStorage.getItem('wizard-theme'); window.storageWorked = true; } catch (e) { window.storageWorked = false; }
function next(e) {
  e.preventDefault();
  document.getElementById('step-1').hidden = true;
  var s = document.getElementById('step-2');
  s.hidden = false;
  var days = s.querySelector('.days');
  for (var i = 0; i < 35; i++) days.appendChild(document.createElement('span'));
}
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('theme').addEventListener('click', function () {
    var r = document.documentElement;
    r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark';
  });
  var file = document.getElementById('file');
  if (file) file.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    file.value = '';
    e.preventDefault();
  });
});
`;

/** The wireframe 'Desktop': a desktop window of the backup app, whose body is at least 960 px wide. */
export const DESKTOP_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="wizard.css">
<style>body{min-width:960px;box-sizing:border-box} .cols{display:grid;grid-template-columns:240px 1fr;gap:16px} nav{background:var(--acc);opacity:.3;height:300px;border-radius:6px}</style></head>
<body><header><strong>Backups</strong><button id="theme" type="button" aria-label="Theme">◐</button></header>
<div class="cols"><nav></nav><main><p>A desktop window of 960 px.</p></main></div>
<script src="wizard.js"></script></body></html>
`;

/** A wireframe that is always 16 px taller than its window, so it would grow with each height that the page gives it. */
export const LOOP_HTML =
  '<!doctype html><html><head><style>body { margin: 0; min-height: 100vh; padding-bottom: 16px; } p { margin: 0; }</style></head><body><p>App shell</p></body></html>';

/** The paths of the wireframes in the docs folder. */
export const WIZARD = 'design/wireframes/restore-wizard.html';
export const DESKTOP = 'design/wireframes/desktop.html';
export const LOOP = 'design/wireframes/loop.html';

/** The embed line of 'Restore wizard' on a page in `design/`. */
export const WIZARD_LINE = '![Restore wizard](wireframes/restore-wizard.html)';

/** The text after 'Restore wizard' on 'Design decisions'. */
export const AFTER_WIZARD = 'See [Schedules](../schedules.md) for the days that a plan keeps.';

/** The page 'Design decisions' of the backup app, with 'Restore wizard' and 'Desktop' between steps. */
export const DECISIONS_PAGE = `# Design decisions

## Restore wizard

The restore runs as a two-step wizard, as [Restore a file](../restore.md) says.

${WIZARD_LINE}

${AFTER_WIZARD}

${STEPS}

## Desktop window

The desktop app keeps the contents on the left.

![Desktop](wireframes/desktop.html)

${STEPS}
`;

/** A page whose 'Restore wizard' shows at 'Requirements' and 'Internals' only, so it is hidden at the opening level. */
export const SHOWN_PAGE = `${STEPS}

::: requirements internals
${WIZARD_LINE}
:::

${STEPS}
`;

/** A page whose second part at 'Overview' holds 'Restore wizard'. A change to 'Requirements' pairs the first part and moves the second. */
export const MOVED_PAGE = `${STEPS}

::: overview
The wizard asks for a file.
:::

::: overview
${WIZARD_LINE}

The wizard asks for a day.
:::

::: requirements internals
The wizard restores the copy of the day.
:::

${STEPS}
`;

/** A page whose part at 'Overview' holds 'Restore wizard'. A change to 'Requirements' pairs it with the next part. */
export const GHOST_PAGE = `${STEPS}

::: overview
${WIZARD_LINE}

The wizard asks for a day.
::: requirements internals
The wizard restores the copy of the day.
:::

${STEPS}
`;

/** The page 'App shell', with the wireframe that would grow forever. */
export const LOOP_PAGE = '# App shell\n\n![App shell](wireframes/loop.html)\n';

/** 'Design decisions' and the pages around it, at three levels, with the files of the wireframes. */
export const WIREFRAMES_SITE: Record<string, FileContent> = {
  'nerddocs.json': THREE_LEVELS,
  'restore.md': '# Restore a file\n\nPick a file and a day, and the app puts that copy back.\n',
  'schedules.md': '# Schedules\n\nA plan says how often.\n',
  'design/decisions.md': DECISIONS_PAGE,
  'design/shown.md': SHOWN_PAGE,
  'design/moved.md': MOVED_PAGE,
  'design/ghost.md': GHOST_PAGE,
  'design/loop.md': LOOP_PAGE,
  [WIZARD]: WIZARD_HTML,
  'design/wireframes/wizard.css': WIZARD_CSS,
  'design/wireframes/wizard.js': WIZARD_JS,
  'design/wireframes/step.png': pngFile(1280, 720),
  [DESKTOP]: DESKTOP_HTML,
  [LOOP]: LOOP_HTML,
};

/**
 * A folder that holds the files, and each page of them built as a page on disk at its address, with the page script
 * and styles in `__nerddocs/`. It gives the folder.
 */
export async function siteOnDisk(files: Record<string, FileContent>): Promise<string> {
  const folder = await folderWith(files);
  const site = await scanSite(folder);
  for (const { url } of site.pages) await writeInto(folder, url.slice(1), renderPage(viewOf(site, url), { live: false }));
  for (const name of ['app.js', 'app.css']) {
    await writeInto(folder, `__nerddocs/${name}`, await readFile(join(REPO, 'dist/client', name)));
  }
  return folder;
}

/** The `file://` address of a page of a folder on disk. */
export const diskAddress = (folder: string, address: string) => pathToFileURL(join(folder, address)).href;

/** The block of the wireframe on the open page, outside the ghost of a level change. */
export const wireframeOf = (page: Page, file: string) => page.locator(`#page .wf[data-wf="${file}"]:not(.ghost *)`);

/** The frame of the wireframe on the open page, outside the ghost of a level change. */
export const frameOf = (page: Page, file: string) => wireframeOf(page, file).locator('iframe');

/** The document of the frame of the wireframe, as it is now. A frame that a live update just replaced gives its new document. */
export async function innerFrame(page: Page, file: string): Promise<Frame> {
  let found: Frame | null = null;
  await expect(async () => {
    const handle = await frameOf(page, file).elementHandle();
    found = await handle.contentFrame();
    await handle.dispose();
    expect(found, `the frame of ${file} has a document`).not.toBeNull();
  }).toPass({ intervals: [20], timeout: 15_000 });
  return found!;
}

/** What `read` gives, or null when the frame that it reads goes away during the read, as in a live update. */
export async function unlessReplaced<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (/detached|destroyed|navigat/i.test(String(error))) return null;
    throw error;
  }
}

/** The height that the wireframe needs, as the frame script measures it: its whole height, and room for a sideways scrollbar. */
export const neededHeight = (frame: Frame) =>
  frame.evaluate(
    () =>
      Math.ceil(document.documentElement.getBoundingClientRect().height) +
      Math.max(0, innerHeight - document.documentElement.clientHeight),
  );

/** The height of the frame of the wireframe on the page. */
export const frameHeight = (page: Page, file: string) => frameOf(page, file).evaluate((frame) => frame.getBoundingClientRect().height);

/** Waits until the document of the frame has loaded and the frame is as tall as the wireframe needs, within 1 px. */
export async function expectFrameFits(page: Page, file: string): Promise<void> {
  await expect
    .poll(
      () =>
        unlessReplaced(async () => {
          const inner = await innerFrame(page, file);
          // A document that still loads can fit its frame for a moment and then grow, so only a loaded one counts.
          if ((await inner.evaluate(() => document.readyState)) !== 'complete') return null;
          return Math.abs((await frameHeight(page, file)) - (await neededHeight(inner)));
        }),
      { ...OFTEN, message: `the frame of ${file} has loaded and fits its wireframe` },
    )
    .toBeLessThanOrEqual(1);
}

/** Clicks an element in the wireframe with `element.click()`, so that nothing scrolls the page. */
export const clickInFrame = async (page: Page, file: string, selector: string) =>
  (await innerFrame(page, file)).evaluate((found) => document.querySelector<HTMLElement>(found)!.click(), selector);

/** Gives the window of the wireframe a JS property, so that a test can tell the same document from one that loaded again. */
export const markFrame = async (page: Page, file: string) =>
  (await innerFrame(page, file)).evaluate(() => {
    (window as unknown as { kept: boolean }).kept = true;
  });

/** True when the document of the frame, as it is now, carries the property of `markFrame`. */
export const isFrameMarked = async (page: Page, file: string) =>
  (await innerFrame(page, file)).evaluate(() => (window as unknown as { kept?: boolean }).kept === true);

/** The files that the wireframes of 'Design decisions' load, by their path in the docs folder. */
export const WIREFRAME_FILES = ['design/wireframes/step.png', 'design/wireframes/wizard.css', 'design/wireframes/wizard.js'];

/** What `recordFrameLoads` keeps: each request of a frame, each request that failed, and each error of the console. */
export interface FrameLoads {
  /** The address of each request of a frame, in order. */
  asked: string[];
  /** The count of the requests of a frame that have not ended. */
  waiting(): number;
  /** Each request of the page or of a frame that failed or got a status of 400 or more, as its error and its address. */
  failed: string[];
  errors: string[];
}

/** Keeps each request of a frame of the page, each failed request and each error of the console, from now on. */
export function recordFrameLoads(page: Page): FrameLoads {
  const loads: FrameLoads = { asked: [], waiting: () => open.size, failed: [], errors: [] };
  const open = new Set<Request>();
  const end = (request: Request) => open.delete(request);
  page.on('request', (request) => {
    if (request.frame() === page.mainFrame()) return;
    loads.asked.push(request.url());
    open.add(request);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) loads.failed.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfinished', end);
  page.on('requestfailed', (request) => {
    loads.failed.push(`${request.failure()?.errorText ?? 'failed'} ${request.url()}`);
    end(request);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') loads.errors.push(message.text());
  });
  page.on('pageerror', (error) => loads.errors.push(String(error)));
  return loads;
}

/** The path of each file that the frames asked for, under the address of the docs folder, once each and sorted. */
export const askedFiles = (loads: FrameLoads, folder: string) =>
  [...new Set(loads.asked.map((url) => (url.startsWith(folder) ? pathPart(url.slice(folder.length)) : url)))].sort();

/** The data of a message between a wireframe and the page. */
export interface FrameMessage {
  nerddocs: 'frame';
  height?: number;
  width?: number;
  acted?: boolean;
  escape?: boolean;
  ask?: boolean;
}

/** Keeps the data of each message of a wireframe that reaches the page, in order, in `window.framePosts`. */
export const recordFramePosts = (page: Page) =>
  page.addInitScript(() => {
    if (window.top !== window) return;
    const record = window as unknown as { framePosts: unknown[] };
    record.framePosts = [];
    addEventListener(
      'message',
      (event) => {
        const data: unknown = event.data;
        if (data && typeof data === 'object' && (data as { nerddocs?: unknown }).nerddocs === 'frame') record.framePosts.push(data);
      },
      true,
    );
  });

/** The data of each message of a wireframe that reached the page, in order. */
export const framePosts = (page: Page) =>
  page.evaluate(() => (window as unknown as { framePosts?: FrameMessage[] }).framePosts ?? []);

/**
 * Keeps each message of a wireframe from the page script of each page that loads, until the returned function runs. The
 * page counts the messages that it kept in `window.heldFramePosts`.
 */
export async function holdFramePosts(page: Page): Promise<() => Promise<void>> {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const held = window as unknown as { framePostsHeld: boolean; heldFramePosts: number };
    held.framePostsHeld = true;
    held.heldFramePosts = 0;
    addEventListener(
      'message',
      (event) => {
        const data: unknown = event.data;
        const fromFrame = !!data && typeof data === 'object' && (data as { nerddocs?: unknown }).nerddocs === 'frame';
        if (!held.framePostsHeld || !fromFrame) return;
        event.stopImmediatePropagation();
        held.heldFramePosts++;
      },
      true,
    );
  });
  return () =>
    page.evaluate(() => {
      (window as unknown as { framePostsHeld: boolean }).framePostsHeld = false;
    });
}

/** The count of the messages of a wireframe that `holdFramePosts` kept from the page script of the open page. */
export const heldFramePosts = (page: Page) =>
  page.evaluate(() => (window as unknown as { heldFramePosts?: number }).heldFramePosts ?? 0);

/**
 * Posts a message from the wireframe to the page, and comes back once the page has it. A message that the wireframe
 * posted before it has reached the page script by then.
 */
export async function frameMessagesSettled(page: Page, file: string): Promise<void> {
  const reached = page.evaluate(
    () =>
      new Promise<void>((done) => {
        const listener = (event: MessageEvent) => {
          if ((event.data as { probe?: unknown } | null)?.probe !== true) return;
          removeEventListener('message', listener);
          done();
        };
        addEventListener('message', listener);
        (window as unknown as { probeReady: boolean }).probeReady = true;
      }),
  );
  await expect.poll(() => page.evaluate(() => (window as unknown as { probeReady?: boolean }).probeReady === true), OFTEN).toBe(true);
  await (await innerFrame(page, file)).evaluate(() => parent.postMessage({ probe: true }, '*'));
  await reached;
  await page.evaluate(() => {
    (window as unknown as { probeReady: boolean }).probeReady = false;
  });
}
