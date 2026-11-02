import { runInNewContext } from 'node:vm';
import { expect, test } from '@playwright/test';
import { firstPaintScript, NO_SCRIPT_STYLE, safeJson } from '../../src/page/first-paint.ts';
import { DEFAULT_KEY, KEPT_KEY } from '../../src/page/level-memory.ts';
import { PANEL_KEY, SHUT_KEY, SLIDER_KEY } from '../../src/page/panel-state.ts';
import { MODE_KEY, THEME_KEY } from '../../src/page/theme-memory.ts';
import { THEMES } from '../../src/themes/index.ts';
import type { Mode } from '../../src/themes/types.ts';
import { computerSetTo, standInRoot } from '../support/stand-in.ts';

/** Runs a script in a stand-in for a browser window on a computer set to the given look. */
function runInWindow(script: string, globals: Record<string, unknown>, computer: Mode = 'light'): void {
  const window: Record<string, unknown> = { ...globals, matchMedia: computerSetTo(computer) };
  window.window = window;
  runInNewContext(script, window);
}

/** Runs the head script against a stand-in for the page, and gives what it set. */
function firstPaint(openSections: string[], getItem: (key: string) => string | null) {
  const attributes: Record<string, string> = {};
  const styles: { id?: string; textContent?: string }[] = [];
  runInWindow(firstPaintScript(openSections), {
    document: {
      documentElement: standInRoot(attributes),
      createElement: () => ({}),
      head: { appendChild: (style: { id?: string; textContent?: string }) => styles.push(style) },
    },
    localStorage: { getItem },
    CSS: { escape: (text: string) => text.replace(/"/g, '\\"') },
  });
  return { panel: attributes['data-panel'], slider: attributes['data-slider'], styles };
}

const stored = (items: Record<string, string>) => (key: string) => items[key] ?? null;

test('text in a script element cannot close it', () => {
  expect(safeJson({ title: '</script><b>' })).toBe('{"title":"\\u003c/script>\\u003cb>"}');
});

test('with nothing stored, the first paint shows the panel and every section open', () => {
  expect(firstPaint([], stored({}))).toEqual({ panel: undefined, slider: undefined, styles: [] });
});

test('a hidden panel is hidden at the first paint', () => {
  expect(firstPaint([], stored({ [PANEL_KEY]: 'off' })).panel).toBe('off');
  expect(firstPaint([], stored({ [PANEL_KEY]: 'on' })).panel).toBeUndefined();
});

test('a hidden slider panel is hidden at the first paint', () => {
  expect(firstPaint([], stored({ [SLIDER_KEY]: 'off' })).slider).toBe('off');
  expect(firstPaint([], stored({ [SLIDER_KEY]: 'on' })).slider).toBeUndefined();
  expect(firstPaint([], stored({})).slider).toBeUndefined();
});

test('the marks and the bar stay hidden with no script, since no slider can run', () => {
  for (const selector of ['#bar', '.marks']) expect(NO_SCRIPT_STYLE).toContain(selector);
});

test('the time next to the title shows with no script', () => {
  expect(NO_SCRIPT_STYLE).toMatch(/\.tl\{display:[^n]/);
});

test('a closed section is closed at the first paint', () => {
  const { styles } = firstPaint([], stored({ [SHUT_KEY]: '["agents"]' }));
  expect(styles[0]!.id).toBe('nd-shut');
  expect(styles[0]!.textContent).toContain('[data-section="agents"]>ul{display:none}');
});

test('a closed section with a quote in its folder name is closed at the first paint', () => {
  const { styles } = firstPaint([], stored({ [SHUT_KEY]: JSON.stringify(['release "notes"']) }));
  expect(styles[0]!.textContent).toContain('[data-section="release \\"notes\\""]>ul{display:none}');
});

test('a closed section around the current page is open at the first paint', () => {
  const { styles } = firstPaint(['backups'], stored({ [SHUT_KEY]: '["backups"]' }));
  expect(styles).toEqual([]);
});

test('broken stored state or blocked storage leaves the first paint open', () => {
  expect(firstPaint([], stored({ [SHUT_KEY]: '{not json' }))).toEqual({ panel: undefined, slider: undefined, styles: [] });
  const blocked = () => {
    throw new Error('The browser blocks storage.');
  };
  expect(firstPaint([], blocked)).toEqual({ panel: undefined, slider: undefined, styles: [] });
});

test.describe('the level at the first paint', () => {
  const ids = ['overview', 'requirements', 'internals'];
  const levels = ids.map((id) => ({ id, name: id }));
  const blocked = () => {
    throw new Error('The browser blocks storage.');
  };

  /** Runs the head script on a page with text at the given levels, and gives the level it set, or else null. */
  function levelAtFirstPaint(
    parts: string[],
    getLocal: (key: string) => string | null,
    getSession: (key: string) => string | null = () => null,
    defaultLevel = 'overview',
  ) {
    let level: string | null = null;
    const page = { url: '/restore.html', levels, defaultLevel, parts, hasShared: false, hasSharedText: false };
    runInWindow(firstPaintScript([], page), {
      document: {
        documentElement: standInRoot({}),
        createElement: () => ({}),
        head: { appendChild() {} },
        getElementById: () => ({
          setAttribute: (_name: string, value: string) => (level = value),
        }),
      },
      localStorage: { getItem: getLocal },
      sessionStorage: { getItem: getSession },
      CSS: { escape: (text: string) => text },
    });
    return level;
  }

  const withDefault = (id: string) => stored({ [DEFAULT_KEY]: id });
  const kept = (level: string) => stored({ [KEPT_KEY]: JSON.stringify({ '/restore.html': { level, live: ids } }) });

  test('the kept level wins over the default', () => {
    expect(levelAtFirstPaint(ids, withDefault('requirements'), kept('internals'))).toBe('internals');
  });

  test('the default with text is the level', () => {
    expect(levelAtFirstPaint(ids, withDefault('requirements'))).toBe('requirements');
  });

  test('a page without the default opens at the nearest lower level', () => {
    expect(levelAtFirstPaint(['overview', 'requirements'], withDefault('internals'))).toBe('requirements');
  });

  test('a page with no lower level opens at the nearest higher level', () => {
    expect(levelAtFirstPaint(['requirements', 'internals'], withDefault('overview'), undefined, 'internals')).toBe('requirements');
  });

  test('a level that the site does not list and junk in storage leave the author default', () => {
    expect(levelAtFirstPaint(ids, withDefault('testers'), stored({ [KEPT_KEY]: '{not json' }))).toBeNull();
  });

  test('a storage that throws leaves the author default', () => {
    expect(levelAtFirstPaint(ids, blocked, blocked)).toBeNull();
  });
});

/** Runs the head script on `<html>` with no theme and no look, as the server sends it, and gives the attributes of `<html>`. */
function htmlAtFirstPaint(getItem: (key: string) => string | null, computer: Mode = 'light'): Record<string, string> {
  const attributes: Record<string, string> = {};
  runInWindow(
    firstPaintScript([]),
    {
      document: { documentElement: standInRoot(attributes), createElement: () => ({}), head: { appendChild() {} } },
      localStorage: { getItem },
      CSS: { escape: (text: string) => text },
    },
    computer,
  );
  return attributes;
}

test.describe('the theme at the first paint', () => {
  const themeAtFirstPaint = (getItem: (key: string) => string | null) => htmlAtFirstPaint(getItem)['data-theme'];

  test('a stored theme shows at the first paint', () => {
    for (const { id } of THEMES) expect(themeAtFirstPaint(stored({ [THEME_KEY]: id }))).toBe(id);
  });

  test('no stored theme, or an unknown one, shows Themelessness', () => {
    expect(themeAtFirstPaint(stored({}))).toBe('themelessness');
    expect(themeAtFirstPaint(stored({ [THEME_KEY]: 'dark-mode' }))).toBe('themelessness');
    expect(themeAtFirstPaint(stored({ [THEME_KEY]: '' }))).toBe('themelessness');
  });

  test('a storage that throws shows Themelessness', () => {
    const blocked = () => {
      throw new Error('The browser blocks storage.');
    };
    expect(themeAtFirstPaint(blocked)).toBe('themelessness');
  });
});

test.describe('the look at the first paint', () => {
  const COMPUTERS = ['light', 'dark'] as const;
  const lookAtFirstPaint = (getItem: (key: string) => string | null, computer: Mode) =>
    htmlAtFirstPaint(getItem, computer)['data-mode'];

  test("a stored 'dark' shows the dark look on a light computer, and a stored 'light' shows the light look on a dark computer", () => {
    for (const computer of COMPUTERS) {
      for (const look of ['light', 'dark'] as const) {
        expect(lookAtFirstPaint(stored({ [MODE_KEY]: look }), computer), `${look} on a ${computer} computer`).toBe(look);
      }
    }
  });

  test("no stored look, 'system' or an unknown value follows the computer", () => {
    for (const computer of COMPUTERS) {
      for (const items of [{}, { [MODE_KEY]: 'system' }, { [MODE_KEY]: 'blue' }, { [MODE_KEY]: '' }] as Record<string, string>[]) {
        expect(lookAtFirstPaint(stored(items), computer), `${JSON.stringify(items)} on a ${computer} computer`).toBe(computer);
      }
    }
  });

  test('a storage that throws follows the computer', () => {
    const blocked = () => {
      throw new Error('The browser blocks storage.');
    };
    for (const computer of COMPUTERS) expect(lookAtFirstPaint(blocked, computer), computer).toBe(computer);
  });

  test('the theme and the look show together at the first paint', () => {
    const html = htmlAtFirstPaint(stored({ [THEME_KEY]: 'im-in', [MODE_KEY]: 'dark' }), 'light');
    expect({ theme: html['data-theme'], look: html['data-mode'] }).toEqual({ theme: 'im-in', look: 'dark' });
  });
});
