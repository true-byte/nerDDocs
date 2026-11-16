import { runInNewContext } from 'node:vm';
import { expect, test } from '@playwright/test';
import { startServer, type RunningServer } from '../../src/server/server.ts';
import { THEMES } from '../../src/themes/index.ts';
import type { Mode } from '../../src/themes/types.ts';
import { folderWith, withConfig } from '../support/folder.ts';
import { computerSetTo, standInRoot } from '../support/stand-in.ts';

/** The reader's own docs, which never go into the preview. */
const READER_FILES = { 'vault.md': '# Vault keys\n\nThe vault opens at nine.' };

let server: RunningServer;
let previewAddress: string;

test.beforeAll(async () => {
  const folder = await folderWith(withConfig(READER_FILES));
  server = await startServer({ folder, port: 0, assets: { 'app.js': '', 'app.css': 'body{}' }, log: () => {} });
  previewAddress = `${server.address}__nerddocs/theme-preview.html`;
});

test.afterAll(() => server.close());

interface Script {
  attributes: string;
  code: string;
}

function scriptsOf(html: string): Script[] {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(([, attributes, code]) => ({
    attributes: attributes!,
    code: code!,
  }));
}

/** A script that the browser runs: one with no type or a JavaScript type, such as the hash script. */
function runs({ attributes }: Script): boolean {
  const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1]?.toLowerCase();
  return type === undefined || ['module', 'text/javascript', 'application/javascript'].includes(type);
}

/** The `data-theme` of `<html>` as the server sends it. */
const serverTheme = (html: string) => /<html\b[^>]*\bdata-theme="([^"]*)"/.exec(html)?.[1];

/**
 * Runs the hash script against a stand-in for the preview page opened at `hash`, on a computer set to `computer`.
 * `moveTo` changes the hash as the theme box does, `theme` gives the `data-theme` of `<html>`, and `look` its
 * `data-mode`.
 */
function previewAt(script: string, hash: string, firstTheme: string | undefined, computer: Mode = 'light') {
  const attributes: Record<string, string> = firstTheme === undefined ? {} : { 'data-theme': firstTheme };
  const listeners: ((event: object) => void)[] = [];
  const location = { hash };
  const frame: Record<string, unknown> = {
    location,
    document: { documentElement: standInRoot(attributes) },
    matchMedia: computerSetTo(computer),
    addEventListener: (type: string, listener: (event: object) => void) => {
      if (type === 'hashchange') listeners.push(listener);
    },
  };
  frame.window = frame;
  runInNewContext(script, frame);
  return {
    theme: () => attributes['data-theme'],
    look: () => attributes['data-mode'],
    moveTo(next: string) {
      location.hash = next;
      const event = { type: 'hashchange' };
      for (const listener of listeners) listener(event);
      (frame.onhashchange as ((event: object) => void) | undefined)?.(event);
    },
  };
}

async function previewPage(): Promise<{ status: number; type: string | null; html: string }> {
  const response = await fetch(previewAddress);
  return { status: response.status, type: response.headers.get('content-type'), html: await response.text() };
}

async function hashScript(): Promise<{ code: string; firstTheme: string | undefined }> {
  const { html } = await previewPage();
  const scripts = scriptsOf(html).filter(runs);
  expect(scripts, 'the scripts that the preview page runs').toHaveLength(1);
  return { code: scripts[0]!.code, firstTheme: serverTheme(html) };
}

test("the preview page holds the sample page 'Restore a file', a relative link to app.css and an inert body, and loads no script file", async () => {
  const { status, type, html } = await previewPage();
  expect(status).toBe(200);
  expect(type).toContain('text/html');
  expect(html).toMatch(/<h1\b[^>]*>Restore a file<\/h1>/);
  expect(html).not.toContain('Vault keys');
  expect(html).toMatch(/<body\b[^>]*\binert\b/);

  const hrefs = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => /\bhref="([^"]*)"/.exec(tag)?.[1] ?? '');
  const style = hrefs.find((href) => href.endsWith('app.css'));
  expect(style, 'the link to app.css').toBeDefined();
  expect(style).not.toMatch(/^([a-z][a-z+.-]*:|\/)/i);
  const styleAddress = new URL(style!, previewAddress);
  expect(styleAddress.pathname).toBe('/__nerddocs/app.css');
  expect((await fetch(styleAddress)).status).toBe(200);

  expect(html).not.toContain('app.js');
  expect(scriptsOf(html).filter(({ attributes }) => /\bsrc\s*=/i.test(attributes))).toEqual([]);
  expect(scriptsOf(html).filter(runs), 'the hash script, and no other script that runs').toHaveLength(1);
});

const COMPUTERS = ['light', 'dark'] as const;

test('the hash script shows the theme and the look that the hash names', async () => {
  const { code, firstTheme } = await hashScript();
  for (const computer of COMPUTERS) {
    for (const { id } of THEMES) {
      for (const look of ['light', 'dark'] as const) {
        const preview = previewAt(code, `#${id}/${look}`, firstTheme, computer);
        expect({ theme: preview.theme(), look: preview.look() }, `#${id}/${look} on a ${computer} computer`).toEqual({ theme: id, look });
      }
    }
  }
});

test("#im-in/dark shows 'I'm in' dark, and #im-in or #im-in/blue shows 'I'm in' in the computer's look", async () => {
  const { code, firstTheme } = await hashScript();
  expect(previewAt(code, '#im-in/dark', firstTheme, 'light').look()).toBe('dark');
  for (const computer of COMPUTERS) {
    for (const hash of ['#im-in', '#im-in/', '#im-in/blue']) {
      const preview = previewAt(code, hash, firstTheme, computer);
      expect({ theme: preview.theme(), look: preview.look() }, `${hash} on a ${computer} computer`).toEqual({ theme: 'im-in', look: computer });
    }
  }
});

test("an unknown theme id or an empty hash shows Themelessness, in the look that the hash names or else the computer's look", async () => {
  const { code, firstTheme } = await hashScript();
  for (const computer of COMPUTERS) {
    for (const [hash, look] of [
      ['#dark-mode', computer],
      ['#dark-mode/dark', 'dark'],
      ['#blue/light', 'light'],
      ['#', computer],
      ['', computer],
    ] as const) {
      const preview = previewAt(code, hash, firstTheme, computer);
      expect({ theme: preview.theme(), look: preview.look() }, `${hash} on a ${computer} computer`).toEqual({ theme: 'themelessness', look });
    }
  }
});

test('the hash script follows each change of the hash', async () => {
  const { code, firstTheme } = await hashScript();
  const preview = previewAt(code, '#themelessness/light', firstTheme, 'light');
  const last = THEMES.at(-1)!.id;
  for (const [hash, theme, look] of [
    ['#im-in/dark', 'im-in', 'dark'],
    ['#im-in/light', 'im-in', 'light'],
    [`#${last}/dark`, last, 'dark'],
    ['#dark-mode/dark', 'themelessness', 'dark'],
    ['#im-in', 'im-in', 'light'],
    ['', 'themelessness', 'light'],
  ] as const) {
    preview.moveTo(hash);
    expect({ theme: preview.theme(), look: preview.look() }, hash).toEqual({ theme, look });
  }
});
