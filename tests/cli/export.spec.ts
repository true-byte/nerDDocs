import { readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test as base, type Page } from '@playwright/test';
import { carryValue, readCarry } from '../../src/page/carry.ts';
import { DEFAULT_KEY } from '../../src/page/level-memory.ts';
import { PANEL_KEY } from '../../src/page/panel-state.ts';
import { MODE_KEY, THEME_KEY } from '../../src/page/theme-memory.ts';
import { BOX_FACES, BOX_FAMILY } from '../../src/themes/box-font.ts';
import { DEFAULT_THEME, THEMES } from '../../src/themes/index.ts';
import type { Mode } from '../../src/themes/types.ts';
import { rgbOf } from '../support/css.ts';
import { diagramBox, expectDrawn, mermaidBlock, RESTORE_FLOW } from '../support/diagrams.ts';
import { fileAddress, runExport, walkExport } from '../support/export.ts';
import { folderWith, type FileContent } from '../support/folder.ts';
import { pngFile } from '../support/images.ts';
import { expectLevel, pressOnSlider, stops } from '../support/levels.ts';
import { failOnPageError, hydrated } from '../support/page.ts';
import { copiedTexts, recordCopies } from '../support/page-content.ts';
import { OFTEN } from '../support/poll.ts';
import { REPO } from '../support/run-command.ts';
import { applyButton, pressOnWidth, ruler, showRuler, storedWidthOf } from '../support/text-width.ts';
import { innerFrame, WIZARD_CSS, WIZARD_HTML, WIZARD_JS, wireframeOf } from '../support/wireframes.ts';

/** The levels of the backup app, as its `nerddocs.json` lists them. */
const LEVELS = JSON.stringify({
  levels: [
    { id: 'casual', name: 'Casual', icon: 'eye' },
    { id: 'pro', name: 'Pro', icon: 'brief' },
    { id: 'full-nerd', name: 'Full nerd', icon: 'cpu' },
  ],
  defaultLevel: 'casual',
});

/** A box diagram: a code block of box characters. */
const BOX_DIAGRAM = ['```', '┌──────────┐    ┌─────────┐', '│ Pick day │ ─▶ │ Restore │', '└──────────┘    └─────────┘', '```'].join('\n');

const WIZARD = '02-guide/wireframes/restore-wizard.html';

/** The docs of the backup app: a first page at the root, two pages in `02-guide/` and one in `03-admin/`. */
const BACKUP_DOCS: Record<string, FileContent> = {
  'nerddocs.json': LEVELS,
  '01-start.md': `# Start

The backup app keeps a copy of each file.

::: casual
Pick a file and get it back.
::: pro
Pick a file and a day, and the app puts that copy back.
::: full-nerd
The agent asks the storage server for the blocks of the copy.
:::

Read [Restore a file](02-guide/01-restore.md), [the guide](02-guide/) and [Storage](03-admin/01-storage.md).
`,
  // The links come first, so that no diagram, image or wireframe above them moves them as it loads.
  '02-guide/01-restore.md': `# Restore a file

A restore never changes the copy. See [Schedules](02-schedules.md#weekly-plan), [Storage](../03-admin/01-storage.md), [Home](/), [Pick a day](01-restore.md#pick-a-day) and [the window](../images/restore-window.svg).

## Pick a day

::: casual
Pick a day with a copy.
::: pro
Pick a day, and the app lists the copies of that day.
::: full-nerd
The zebrarestore index maps each day to its blocks.
:::

## Pictures

${mermaidBlock(RESTORE_FLOW)}

${BOX_DIAGRAM}

![Restore window](../images/restore-window.svg)

![Restore wizard](wireframes/restore-wizard.html)
`,
  '02-guide/02-schedules.md': `# Schedules

A plan says how often the app makes a copy.

::: casual
A plan runs by itself.
::: pro
A plan runs at its hour, and keeps its copies for its days.
::: full-nerd
The scheduler adds a delay of up to ten minutes to each run.
:::

## Weekly plan

A weekly plan runs on Sunday.

## Daily plan

A daily plan runs at night.
`,
  [WIZARD]: WIZARD_HTML,
  '02-guide/wireframes/wizard.css': WIZARD_CSS,
  '02-guide/wireframes/wizard.js': WIZARD_JS,
  '02-guide/wireframes/step.png': pngFile(1280, 720),
  '03-admin/01-storage.md': `# Storage

Blocks are stored once.

## Blocks

::: casual
A file is cut into blocks.
::: pro
Each block is stored once, and a copy lists its blocks.
::: full-nerd
The zebracopy index keeps the place of each block.
:::

## Disks

Back to [Restore a file](../02-guide/01-restore.md).
`,
  'images/restore-window.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40"/></svg>',
};

const START = 'start.html';
const RESTORE = 'guide/restore.html';
const SCHEDULES = 'guide/schedules.html';
const STORAGE = 'admin/storage.html';
const PAGES = [START, RESTORE, SCHEDULES, STORAGE];

/** The origin that one test serves the export from, by `page.route`, as a host such as GitHub Pages would. */
const SERVED = 'http://docs.test/';

/** What the init script of each page keeps for the test, in `window`. */
interface Recorded {
  /** The address that the browser opened, before any script of the page ran. */
  startAddress: string;
  /** The words of the highlight `nd-found` when the page set it, lowercase. */
  litWords?: string[];
  /** What the head of the page set before the page script ran. */
  firstPaint?: { theme: string | null; mode: string | null; level: string | null; panel: string | null; outline: string | null; width: string | null };
}

/** Runs in each document before its scripts, and keeps what `Recorded` says. */
function recordPage(): void {
  const record = window as unknown as Recorded;
  record.startAddress = location.href;
  const registry = typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : null;
  if (registry) {
    const set = registry.set.bind(registry);
    registry.set = (name: string, highlight: Highlight) => {
      if (name === 'nd-found') record.litWords = [...highlight].map((range) => (range as Range).toString().toLowerCase());
      return set(name, highlight);
    };
  }
  // Once the body starts, every head script has run, and the deferred page script has not.
  new MutationObserver((_records, observer) => {
    if (!document.body) return;
    observer.disconnect();
    const root = document.documentElement;
    record.firstPaint = {
      theme: root.getAttribute('data-theme'),
      mode: root.getAttribute('data-mode'),
      level: document.getElementById('nd-level')?.getAttribute('data-level') ?? null,
      panel: root.getAttribute('data-panel'),
      outline: root.getAttribute('data-outline'),
      width: document.getElementById('nd-width')?.textContent ?? null,
    };
  }).observe(document, { childList: true, subtree: true });
}

/** Builds the export of `docs` with the built command into a new folder, and removes it once `use` ends. */
async function exportOf(cwd: string, docs: string, use: (out: string) => Promise<void>): Promise<void> {
  const parent = await folderWith({});
  const out = join(parent, 'export');
  const result = runExport(cwd, [docs, '--out', out]);
  expect(result.status, result.stderr).toBe(0);
  try {
    await use(out);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

const test = base.extend<{ nerddocsExport: string }, { exported: string }>({
  /** One export of the backup app for all the tests of a worker. Its files never change. */
  exported: [
    async ({}, use) => {
      const app = await folderWith(Object.fromEntries(Object.entries(BACKUP_DOCS).map(([name, text]) => [`docs/${name}`, text])));
      try {
        await exportOf(app, 'docs', use);
      } finally {
        rmSync(app, { recursive: true, force: true });
      }
    },
    { scope: 'worker', timeout: 60_000 },
  ],
  /** The export of the docs of nerDDocs, removed after its test. */
  nerddocsExport: [async ({}, use) => exportOf(REPO, 'docs', use), { timeout: 60_000 }],
  /** Each page of a test records what `Recorded` says, and fails the test on a console error, a failed load or a request to http: or https:. */
  page: async ({ page, context }, use) => {
    const outside: string[] = [];
    const failed: string[] = [];
    const isOutside = (url: string) => /^https?:/i.test(url) && !url.startsWith(SERVED);
    await context.route(
      (url) => isOutside(url.href),
      (route) => {
        outside.push(route.request().url());
        return route.abort();
      },
    );
    page.on('request', (request) => {
      if (isOutside(request.url())) outside.push(request.url());
    });
    page.on('requestfailed', (request) => {
      const error = request.failure()?.errorText ?? 'failed';
      if (!/abort/i.test(error) && !isOutside(request.url())) failed.push(`${error} ${request.url()}`);
    });
    const errors = failOnPageError(page);
    await context.addInitScript(recordPage);
    await use(page);
    expect([...new Set(outside)], 'the requests to http: or https:').toEqual([]);
    expect(failed, 'the loads that failed').toEqual([]);
    expect(errors.map(String), 'the errors of the console').toEqual([]);
  },
});

test.use({ viewport: { width: 1280, height: 720 } });
// The tests run one after the other in one worker, so the export takes the disk space of one copy.
test.describe.configure({ mode: 'default' });

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The address, with any hash or with the given hash. */
const atAddress = (address: string, hash = '.*') => new RegExp(`^${escaped(address)}(#${hash})?$`);

const startAddress = async (page: Page) => (await page.evaluate(() => (window as unknown as Recorded).startAddress))!;
const firstPaint = (page: Page) => page.evaluate(() => (window as unknown as Recorded).firstPaint ?? null);
const litWords = (page: Page) => page.evaluate(() => (window as unknown as Recorded).litWords ?? []);

/** The entries that the `?nd=` of the address carries, or null for an address with none. */
function carryOf(address: string) {
  const value = /\?nd=([^#&]*)/.exec(address)?.[1];
  return value === undefined ? null : readCarry(value);
}

const storedValue = (page: Page, storage: 'local' | 'session', key: string) =>
  page.evaluate(([kind, name]) => (kind === 'local' ? localStorage : sessionStorage).getItem(name!), [storage, key] as const);

async function openFromDisk(page: Page, out: string, path: string): Promise<void> {
  await page.goto(fileAddress(out, path));
  await hydrated(page);
}

const textLink = (page: Page, name: string) => page.locator('#page').getByRole('link', { name, exact: true });
const themeOf = (id: string) => THEMES.find((theme) => theme.id === id)!;

async function expectTheme(page: Page, id: string, mode: Mode): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', id);
  await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
  await expect(page.locator('body')).toHaveCSS('background-color', rgbOf(themeOf(id)[mode].bg));
}

/** The faces of the page that loaded and that failed, by family, once the fonts that the page needs now have loaded. */
const faceStates = (page: Page, family: string) =>
  page.evaluate(async (name) => {
    void document.body.offsetHeight;
    await document.fonts.ready;
    const faces = [...document.fonts].filter((face) => face.family.replace(/["']/g, '') === name);
    return faces.map((face) => face.status);
  }, family);
const failedFaces = (page: Page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((face) => face.status === 'error').map((face) => face.family);
  });

test('every page opens from disk with the fonts of its theme, with no error in the console', async ({ page, exported }) => {
  await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [THEME_KEY, 'original-nerd'] as const);
  for (const path of PAGES) {
    await openFromDisk(page, exported, path);
    await expect(page.locator('html'), path).toHaveAttribute('data-theme', 'original-nerd');
    await expect.poll(async () => (await faceStates(page, 'Alegreya')).includes('loaded'), { ...OFTEN, message: path }).toBe(true);
    expect(await failedFaces(page), path).toEqual([]);
  }
});

test('index.html opens the first page, and index.html#pro opens it at Pro', async ({ page, exported }) => {
  await page.goto(fileAddress(exported, 'index.html'));
  await expect(page).toHaveURL(atAddress(fileAddress(exported, START)));
  await hydrated(page);
  await expect(page.locator('h1')).toHaveText('Start');
  await expectLevel(page, 'casual');

  await page.goto(`${fileAddress(exported, 'index.html')}#pro`);
  await expect(page).toHaveURL(atAddress(fileAddress(exported, START), 'pro'));
  await hydrated(page);
  await expectLevel(page, 'pro');
});

test.describe('with no script', () => {
  test.use({ javaScriptEnabled: false });

  test('index.html opens the first page', async ({ page, exported }) => {
    await page.goto(fileAddress(exported, 'index.html'));
    await expect(page).toHaveURL(fileAddress(exported, START));
    await expect(page.locator('h1')).toHaveText('Start');
  });
});

test("the slider, 'All pages' and 'Defaults' change the level from disk", async ({ page, exported }) => {
  await openFromDisk(page, exported, RESTORE);
  await expectLevel(page, 'casual');
  await stops(page).filter({ hasText: 'Full nerd' }).click();
  await expectLevel(page, 'full-nerd');
  await page.getByRole('button', { name: 'All pages' }).click();
  await expect.poll(() => storedValue(page, 'local', DEFAULT_KEY), OFTEN).toBe('full-nerd');

  await page.locator('#dflB').click();
  const defaults = page.locator('#defaults-box');
  await expect(defaults.getByRole('button', { name: 'Full nerd', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await defaults.getByRole('button', { name: 'Pro', exact: true }).click();
  await expectLevel(page, 'pro');
  await expect.poll(() => storedValue(page, 'local', DEFAULT_KEY), OFTEN).toBe('pro');
});

test('a theme, a look, a level from All pages, a text width, a hidden outline and a hidden panel set on one page hold on a page in another folder, and Copy link copies no ?nd=', async ({ page, exported }) => {
  await recordCopies(page);
  await openFromDisk(page, exported, RESTORE);

  // The theme box shows its preview, and the theme and the look that it applies.
  const previewRoot = page.frameLocator('#theme-preview').locator('html');
  await page.locator('#thmB').click();
  await expect(page.locator('#theme-box')).toBeVisible();
  await expect(previewRoot).toHaveAttribute('data-theme', DEFAULT_THEME);
  await page.locator('#theme-opt-im-in').click();
  await expect(previewRoot).toHaveAttribute('data-theme', 'im-in');
  await page.locator('#theme-mode [data-look="dark"]').click();
  await expect(previewRoot).toHaveAttribute('data-mode', 'dark');
  await page.locator('#theme-apply').click();
  await expect(page.locator('#theme-box')).toBeHidden();
  await expectTheme(page, 'im-in', 'dark');

  await pressOnSlider(page, '2');
  await expectLevel(page, 'pro');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'All pages' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => storedValue(page, 'local', DEFAULT_KEY), OFTEN).toBe('pro');
  // The chip shows its check, then leaves and puts the focus on the thumb, which would close a menu opened before.
  await expect(page.locator('#chip')).toHaveCount(0);

  // A narrower text: a wider one can reach the width of the free space, which the page keeps as 'full'.
  await showRuler(page);
  await pressOnWidth(page, 'ArrowLeft');
  await applyButton(page).click();
  await expect(ruler(page)).toBeHidden();
  await expect.poll(() => storedWidthOf(page), OFTEN).toMatch(/^\d+$/);
  const width = await storedWidthOf(page);
  await page.getByRole('button', { name: 'Hide outline' }).click();
  await page.getByRole('button', { name: 'Hide contents' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-outline', 'off');
  await expect(page.locator('html')).toHaveAttribute('data-panel', 'off');

  await textLink(page, 'Storage').click();
  await expect(page).toHaveURL(atAddress(fileAddress(exported, STORAGE)));
  await hydrated(page);
  expect(await firstPaint(page)).toEqual({
    theme: 'im-in',
    mode: 'dark',
    level: 'pro',
    panel: 'off',
    outline: 'off',
    width: expect.stringContaining(`--text-chars:${width}`),
  });
  await expectTheme(page, 'im-in', 'dark');
  await expectLevel(page, 'pro');
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show outline' })).toBeVisible();
  expect(await storedValue(page, 'local', DEFAULT_KEY)).toBe('pro');

  await page.locator('#lnkB').click();
  await expect.poll(() => copiedTexts(page), OFTEN).toHaveLength(1);
  const [copied] = await copiedTexts(page);
  expect(copied).not.toContain('nd=');
  expect(copied).toMatch(atAddress(fileAddress(exported, STORAGE)));
});

test('search finds text on a page in another folder, and its hit opens that page at the level of the hit with its words lit', async ({ page, exported }) => {
  await openFromDisk(page, exported, START);
  await page.locator('#findP').click();
  const box = page.getByRole('dialog', { name: 'Search', exact: true });
  await box.getByRole('combobox', { name: 'Search', exact: true }).pressSequentially('zebracopy');
  await expect(box.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');

  // The page then writes the place that it shows into the hash, and a short page shows its top.
  const storage = fileAddress(exported, STORAGE);
  await expect(page).toHaveURL(atAddress(storage, 'full-nerd(/blocks)?'));
  const opened = await startAddress(page);
  expect(opened).toMatch(new RegExp(`^${escaped(storage)}\\?nd=[^#]+#full-nerd/blocks$`));
  expect(carryOf(opened)?.session).toHaveProperty('nerddocs-found');
  await hydrated(page);
  await expectLevel(page, 'full-nerd');
  await expect.poll(() => litWords(page), OFTEN).toEqual(['zebracopy']);
  expect(await storedValue(page, 'session', 'nerddocs-found')).toBeNull();
});

test('a Mermaid diagram, a box diagram, an image and an HTML wireframe show from disk', async ({ page, exported }) => {
  await openFromDisk(page, exported, RESTORE);
  await expectDrawn(diagramBox(page, RESTORE_FLOW));

  await page.locator('#page pre.box').scrollIntoViewIfNeeded();
  await expect.poll(() => faceStates(page, BOX_FAMILY), OFTEN).toEqual(BOX_FACES.map(() => 'loaded'));

  const image = page.locator('#page img[alt="Restore window"]');
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth), OFTEN).toBe(120);

  await wireframeOf(page, WIZARD).scrollIntoViewIfNeeded();
  const frame = await innerFrame(page, WIZARD);
  await expect(frame.locator('#go')).toBeVisible();
  await expect(frame.locator('body')).toHaveCSS('padding-top', '16px');
  await expect.poll(() => frame.evaluate(() => typeof (window as unknown as { next?: unknown }).next), OFTEN).toBe('function');
  await expect.poll(() => frame.evaluate(() => document.querySelector('img')?.naturalWidth ?? 0), OFTEN).toBe(1280);
});

test.describe('the carry of the settings between pages', () => {
  /** Sets probe entries in each storage of the open page: kept ones, and ones that the carry leaves out. */
  const setProbes = (page: Page) =>
    page.evaluate(() => {
      localStorage.setItem('nerddocs-probe', 'kept in local');
      localStorage.setItem('nerddocs-sizes', '[]');
      localStorage.setItem('wizard-theme', 'dark');
      sessionStorage.setItem('nerddocs-probe', 'kept in session');
      sessionStorage.setItem('other-probe', 'left behind');
    });

  /** The carry holds the kept probes, and no key without `nerddocs-` and no `nerddocs-sizes`. */
  function expectProbesCarried(address: string): void {
    const carried = carryOf(address);
    expect(carried, address).not.toBeNull();
    expect(carried!.local).toMatchObject({ 'nerddocs-probe': 'kept in local' });
    expect(carried!.session).toMatchObject({ 'nerddocs-probe': 'kept in session' });
    for (const key of [...Object.keys(carried!.local), ...Object.keys(carried!.session)]) {
      expect(key).toMatch(/^nerddocs-/);
      expect(key).not.toBe('nerddocs-sizes');
    }
  }

  test('a click on a link to another page opens it with ?nd= before the hash, and that page writes the entries and removes ?nd=', async ({ page, exported }) => {
    await openFromDisk(page, exported, RESTORE);
    await setProbes(page);
    await textLink(page, 'Schedules').click();

    const schedules = fileAddress(exported, SCHEDULES);
    await expect(page).toHaveURL(atAddress(schedules));
    const opened = await startAddress(page);
    expect(opened).toMatch(new RegExp(`^${escaped(schedules)}\\?nd=[^#]+#([a-z-]+/)?weekly-plan$`));
    expectProbesCarried(opened);
    await hydrated(page);
    expect(await storedValue(page, 'local', 'nerddocs-probe')).toBe('kept in local');
    expect(await storedValue(page, 'session', 'nerddocs-probe')).toBe('kept in session');
  });

  const NEW_TAB_CLICKS = [{ button: 'middle' as const }, { modifiers: ['ControlOrMeta' as const] }];

  test('a middle click and a Ctrl click give the link its address with ?nd= when the browser opens it, and then its own href back', async ({ page, exported }) => {
    await openFromDisk(page, exported, RESTORE);
    await setProbes(page);
    // The last listener of the click keeps the address that the browser opens, and keeps the tab from opening: a
    // browser under load can open no tab at all, and the page only decides the address.
    await page.evaluate(() => {
      const opened: string[] = [];
      (window as unknown as { opened: string[] }).opened = opened;
      for (const type of ['click', 'auxclick']) {
        addEventListener(type, (event) => {
          const link = event.target instanceof Element ? event.target.closest('a') : null;
          if (!link) return;
          opened.push(link.href);
          event.preventDefault();
        });
      }
    });
    const link = textLink(page, 'Storage');
    const href = await link.getAttribute('href');
    for (const click of NEW_TAB_CLICKS) await link.click(click);

    const opened = await page.evaluate(() => (window as unknown as { opened: string[] }).opened);
    expect(opened).toHaveLength(NEW_TAB_CLICKS.length);
    for (const address of opened) {
      expect(address).toMatch(new RegExp(`^${escaped(fileAddress(exported, STORAGE))}\\?nd=[^#]+$`));
      expectProbesCarried(address);
    }
    await expect(link).toHaveAttribute('href', href!);
  });

  test('a link to the same page and a link to a file that is no page carry nothing', async ({ page, exported }) => {
    await openFromDisk(page, exported, RESTORE);
    await setProbes(page);
    await page.evaluate(() => {
      (window as unknown as { sameWindow: boolean }).sameWindow = true;
    });

    await textLink(page, 'Pick a day').click();
    await expect(page).toHaveURL(atAddress(fileAddress(exported, RESTORE), '([a-z-]+/)?pick-a-day'));
    expect(await page.evaluate(() => (window as unknown as { sameWindow?: boolean }).sameWindow)).toBe(true);

    await textLink(page, 'the window').click();
    await expect(page).toHaveURL(fileAddress(exported, 'images/restore-window.svg'));
  });

  test('a link on a page served by http: carries nothing', async ({ page, exported }) => {
    await page.route(`${SERVED}**`, (route) => {
      const path = join(exported, decodeURIComponent(new URL(route.request().url()).pathname));
      return statSync(path, { throwIfNoEntry: false })?.isFile()
        ? route.fulfill({ path })
        : route.fulfill({ status: 404, body: '' });
    });
    await page.goto(`${SERVED}${RESTORE}`);
    await hydrated(page);
    await setProbes(page);
    await textLink(page, 'Storage').click();
    await expect(page).toHaveURL(atAddress(`${SERVED}${STORAGE}`));
    expect(await startAddress(page)).toBe(`${SERVED}${STORAGE}`);
  });

  test('a page opened with ?nd= writes its entries before its first paint and removes ?nd=, and a bad value writes nothing', async ({ page, exported }) => {
    const storage = fileAddress(exported, STORAGE);
    await page.goto(`${storage}?nd=restore#blocks`);
    await expect(page).toHaveURL(atAddress(storage));
    await hydrated(page);
    expect(await firstPaint(page)).toMatchObject({ theme: DEFAULT_THEME, level: 'casual', panel: null });
    expect(await storedValue(page, 'local', THEME_KEY)).toBeNull();

    const nd = carryValue(
      { [THEME_KEY]: 'im-in', [MODE_KEY]: 'dark', [DEFAULT_KEY]: 'full-nerd', [PANEL_KEY]: 'off' },
      { 'nerddocs-probe': 'kept in session' },
    );
    const schedules = fileAddress(exported, SCHEDULES);
    await page.goto(`${schedules}?nd=${nd}#weekly-plan`);
    await expect(page).toHaveURL(atAddress(schedules));
    await hydrated(page);
    expect(await firstPaint(page)).toMatchObject({ theme: 'im-in', mode: 'dark', level: 'full-nerd', panel: 'off' });
    expect(await storedValue(page, 'local', DEFAULT_KEY)).toBe('full-nerd');
    expect(await storedValue(page, 'session', 'nerddocs-probe')).toBe('kept in session');
  });

  test('a ?nd= made by hand writes no key outside the nerddocs- keys and no nerddocs-sizes, and its theme still applies', async ({ page, exported }) => {
    const sizes = '[["wireframe 02-guide/wireframes/restore-wizard.html",9999]]';
    const nd = encodeURIComponent(
      JSON.stringify({
        l: { [THEME_KEY]: 'im-in', evil: 'written', 'nerddocs-sizes': sizes },
        s: { evil: 'written', 'nerddocs-sizes': sizes },
      }),
    );
    const start = fileAddress(exported, START);
    await page.goto(`${start}?nd=${nd}`);
    await expect(page).toHaveURL(atAddress(start));
    await hydrated(page);
    expect(await firstPaint(page)).toMatchObject({ theme: 'im-in' });
    expect(await storedValue(page, 'local', THEME_KEY)).toBe('im-in');
    for (const storage of ['local', 'session'] as const) {
      expect(await storedValue(page, storage, 'evil'), storage).toBeNull();
      expect(await storedValue(page, storage, 'nerddocs-sizes'), storage).not.toBe(sizes);
    }
  });

  test('with a localStorage that throws, a link still carries the entries of sessionStorage', async ({ page, exported }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The storage is off.', 'SecurityError');
        },
      });
    });
    await openFromDisk(page, exported, RESTORE);
    await page.evaluate(() => sessionStorage.setItem('nerddocs-probe', 'kept in session'));
    await textLink(page, 'Storage').click();
    await expect(page).toHaveURL(atAddress(fileAddress(exported, STORAGE)));
    const carried = carryOf(await startAddress(page));
    expect(carried?.local).toEqual({});
    expect(carried?.session).toMatchObject({ 'nerddocs-probe': 'kept in session' });
  });
});

test.describe('the walk of every address', () => {
  test('every href and src of every page, every hit of the search file and every url() of the style lead to a file of the export', ({ exported }) => {
    const walk = walkExport(exported);
    expect(walk.broken).toEqual([]);
    expect(walk.checked).toBeGreaterThan(20);
    // The links to a folder, to the site root and to the first page lead to pages.
    const start = readFileSync(join(exported, START), 'utf8');
    for (const href of ['guide/restore.html', 'admin/storage.html']) expect(start).toContain(`href="${href}"`);
  });

  test('the export of the docs of nerDDocs passes the same walk', ({ nerddocsExport }) => {
    const walk = walkExport(nerddocsExport);
    expect(walk.broken).toEqual([]);
    expect(walk.checked).toBeGreaterThan(100);
  });
});
