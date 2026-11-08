import { runInNewContext } from 'node:vm';
import { expect, test } from '@playwright/test';
import { firstPaintScript, NO_SCRIPT_STYLE, safeJson } from '../../src/page/first-paint.ts';
import { DEFAULT_KEY, KEPT_KEY } from '../../src/page/level-memory.ts';
import { openingLevel } from '../../src/page/levels.ts';
import { PANEL_KEY, SHUT_KEY, SLIDER_KEY } from '../../src/page/panel-state.ts';
import { CHAR_KEY, CHAR_SAMPLE, WIDTH_KEY } from '../../src/page/text-width.ts';
import { MODE_KEY, THEME_KEY } from '../../src/page/theme-memory.ts';
import { DEFAULT_THEME, THEMES, themeById } from '../../src/themes/index.ts';
import type { Mode, Theme } from '../../src/themes/types.ts';
import { cssRules, declarations, selectorsOf } from '../support/css.ts';
import { computerSetTo, standInCanvas, standInRoot } from '../support/stand-in.ts';

/** Runs a script in a stand-in for a browser window on a computer set to the given look, at an address with no hash unless the globals give one. */
function runInWindow(script: string, globals: Record<string, unknown>, computer: Mode = 'light'): void {
  const window: Record<string, unknown> = { location: { hash: '' }, ...globals, matchMedia: computerSetTo(computer) };
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
  return { panel: attributes['data-panel'], slider: attributes['data-slider'], outline: attributes['data-outline'], styles };
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

test('the marks, the bar, the arrow of a folder row, the copy icon, the button of the dimensions, and the bar and the empty frame of a wireframe stay hidden with no script, since none of them can work', () => {
  const hidden = cssRules(NO_SCRIPT_STYLE)
    .filter((rule) => declarations(rule.body).get('display') === 'none!important')
    .flatMap(selectorsOf);
  for (const selector of ['#bar', '.marks', '.fold', '.copy', '#dimB', '.wf-bar', '.wf-frame[data-srcdoc]']) expect(hidden).toContain(selector);
});

test('with no script, the list of dimensions shows open in the flow of the panel', () => {
  const declarationsOf = (selector: string) =>
    new Map(cssRules(NO_SCRIPT_STYLE).filter((rule) => selectorsOf(rule).includes(selector)).flatMap((rule) => [...declarations(rule.body)]));
  expect(declarationsOf('#dimL[hidden]').get('display')).toBe('flex!important');
  expect(declarationsOf('#dimL').get('position')).toBe('static!important');
});

test('the time next to the title shows with no script', () => {
  expect(NO_SCRIPT_STYLE).toMatch(/\.tl\{display:[^n]/);
});

test('with no script, a diagram shows its source with no reserved box', () => {
  /** The declarations of every rule of the style for one selector, with no white space in a value. */
  const declarationsOf = (selector: string) =>
    new Map(
      cssRules(NO_SCRIPT_STYLE)
        .filter((rule) => selectorsOf(rule).some((each) => each.replace(/\s*>\s*/g, '>') === selector))
        .flatMap((rule) => [...declarations(rule.body)])
        .map(([name, value]) => [name, value.replace(/\s+/g, '')]),
    );
  const box = declarationsOf('#page .dg');
  expect(box.get('aspect-ratio')).toBe('auto!important');
  expect(box.get('min-height')).toBe('0!important');
  expect(box.get('max-height')).toBe('none!important');
  expect(box.get('background')).toBe('none!important');
  expect(declarationsOf('#page .dg>pre').get('display')).toBe('block!important');
});

test('a hidden outline column is hidden at the first paint, under the key nerddocs-outline', () => {
  expect(firstPaint([], stored({ 'nerddocs-outline': 'off' })).outline).toBe('off');
  expect(firstPaint([], stored({})).outline).toBeUndefined();
  const blocked = () => {
    throw new Error('The browser blocks storage.');
  };
  expect(firstPaint([], blocked).outline).toBeUndefined();
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
    hash = '',
    anchors: Record<string, string> = {},
  ) {
    let level: string | null = null;
    const page = { url: '/restore.html', levels, defaultLevel, parts, hasShared: false, hasSharedText: false, anchors, linkLevels: {} };
    runInWindow(firstPaintScript([], page), {
      location: { hash, href: `http://127.0.0.1/restore.html${hash}`, pathname: '/restore.html' },
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

  test.describe('a level in the address', () => {
    /** The level at the first paint. When the script leaves the level alone, it is the level that the server sent. */
    const shownAt = (hash: string, parts: string[], getLocal: (key: string) => string | null, anchors: Record<string, string> = {}) =>
      levelAtFirstPaint(parts, getLocal, () => null, 'overview', hash, anchors) ??
      openingLevel({ levels, parts, hasSharedText: false, defaultLevel: 'overview' });
    /** The level at the first paint of a reader who kept 'requirements' for the page and chose it as the default. */
    const atHash = (hash: string, anchors: Record<string, string> = {}) =>
      levelAtFirstPaint(ids, withDefault('requirements'), kept('requirements'), 'overview', hash, anchors) ?? 'overview';

    test('a level in the hash wins over the kept level and the default, with an id or without', () => {
      expect(atHash('#internals')).toBe('internals');
      expect(atHash('#internals/pick-a-day')).toBe('internals');
      expect(atHash('#overview/pick-a-day')).toBe('overview');
    });

    test('a level that the page lacks gives the level that the page opens at for it', () => {
      expect(shownAt('#internals', ['overview', 'requirements'], stored({}))).toBe('requirements');
      expect(shownAt('#overview', ['requirements', 'internals'], withDefault('internals'))).toBe('requirements');
    });

    test('an id that shows at some levels only opens at a level that shows it, from the reader level of the page', () => {
      const anchors = { 'search-index': 'internals', 'pick-a-day': 'overview internals' };
      expect(atHash('#search-index', anchors)).toBe('internals');
      expect(atHash('#pick-a-day', anchors)).toBe('overview');
      expect(atHash('#pick%20a%20day', { 'pick a day': 'internals' })).toBe('internals');
    });

    test('an id at every level, an unknown id and an unknown level leave the level the page opens at', () => {
      const anchors = { 'search-index': 'internals' };
      expect(atHash('#weekly-plan', anchors)).toBe('requirements');
      expect(atHash('#testers/search-index', anchors)).toBe('requirements');
      expect(atHash('#testers', anchors)).toBe('requirements');
    });
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

test.describe('the text width at the first paint', () => {
  const charWidths = (widths: Record<string, unknown>) => JSON.stringify(widths);
  const blocked = () => {
    throw new Error('The browser blocks storage.');
  };

  /**
   * Runs the head script, and gives the `data-width` of `<html>` and the declarations of the style `nd-width`, by name.
   * `createElement("canvas")` gives `canvas`, or with no `canvas` an element with no `getContext`. Each write to the
   * storage goes into `writes`.
   */
  function widthAtFirstPaint(getItem: (key: string) => string | null, { canvas, writes = [] }: { canvas?: object; writes?: string[] } = {}) {
    const attributes: Record<string, string> = {};
    const styles: Record<string, unknown>[] = [];
    runInWindow(firstPaintScript([]), {
      document: {
        documentElement: standInRoot(attributes),
        createElement: (tag: string) =>
          tag === 'canvas' && canvas
            ? canvas
            : {
                setAttribute(this: Record<string, unknown>, name: string, value: string) {
                  this[name] = value;
                },
              },
        getElementById: () => null,
        head: { appendChild: (style: Record<string, unknown>) => styles.push(style) },
      },
      localStorage: {
        getItem,
        setItem: (key: string) => writes.push(`setItem ${key}`),
        removeItem: (key: string) => writes.push(`removeItem ${key}`),
        clear: () => writes.push('clear'),
      },
      CSS: { escape: (text: string) => text },
    });
    const widthStyles = styles.filter((style) => style.id === 'nd-width');
    expect(widthStyles.length, 'styles with the id nd-width').toBeLessThanOrEqual(1);
    const rules = widthStyles[0] ? cssRules(String(widthStyles[0].textContent)) : [];
    expect(rules.map((rule) => rule.selector), 'the rules of nd-width').toEqual(rules.length ? [':root'] : []);
    return {
      width: attributes['data-width'],
      style: widthStyles.length > 0,
      values: Object.fromEntries(rules[0] ? declarations(rules[0].body) : []),
    };
  }

  test('with nothing stored, the first paint sets no width', () => {
    expect(widthAtFirstPaint(stored({}))).toEqual({ width: undefined, style: false, values: {} });
  });

  test('a stored number of characters goes into the style nd-width', () => {
    expect(widthAtFirstPaint(stored({ [WIDTH_KEY]: '100' }))).toEqual({
      width: undefined,
      style: true,
      values: { '--text-chars': '100' },
    });
  });

  test("a stored 'full' sets data-width on <html> and no number of characters", () => {
    const { width, values } = widthAtFirstPaint(stored({ [WIDTH_KEY]: 'full' }));
    expect(width).toBe('full');
    expect(values).not.toHaveProperty('--text-chars');
  });

  test('a stored character width of the current theme goes into the style nd-width, with the stored width', () => {
    expect(widthAtFirstPaint(stored({ [CHAR_KEY]: charWidths({ themelessness: 0.52 }) })).values).toEqual({ '--char-w': '0.52em' });
    expect(
      widthAtFirstPaint(stored({ [WIDTH_KEY]: '100', [CHAR_KEY]: charWidths({ themelessness: 0.52, 'im-in': 0.6 }) })).values,
    ).toEqual({ '--text-chars': '100', '--char-w': '0.52em' });
    expect(
      widthAtFirstPaint(stored({ [THEME_KEY]: 'im-in', [CHAR_KEY]: charWidths({ themelessness: 0.52, 'im-in': 0.6 }) })).values,
    ).toEqual({ '--char-w': '0.6em' });
    const full = widthAtFirstPaint(stored({ [WIDTH_KEY]: 'full', [CHAR_KEY]: charWidths({ themelessness: 0.52 }) }));
    expect({ width: full.width, values: full.values }).toEqual({ width: 'full', values: { '--char-w': '0.52em' } });
  });

  test('the current theme is the theme that the first paint shows, also for an unknown stored theme', () => {
    const widths = charWidths({ themelessness: 0.52 });
    expect(widthAtFirstPaint(stored({ [THEME_KEY]: 'dark-mode', [CHAR_KEY]: widths })).values).toEqual({ '--char-w': '0.52em' });
  });

  test('a stored character width of another theme sets none', () => {
    const { values } = widthAtFirstPaint(stored({ [THEME_KEY]: 'im-in', [CHAR_KEY]: charWidths({ themelessness: 0.52 }) }));
    expect(values).not.toHaveProperty('--char-w');
  });

  test('a character width from 0.2 to 1.5 is used, and any other value sets none', () => {
    for (const width of [0.2, 0.47, 1.5]) {
      expect(widthAtFirstPaint(stored({ [CHAR_KEY]: charWidths({ themelessness: width }) })).values, String(width)).toEqual({
        '--char-w': `${width}em`,
      });
    }
    for (const width of [0.19, 1.51, 0, -0.5, '0.5', null, true, [0.5], {}]) {
      const { values } = widthAtFirstPaint(stored({ [CHAR_KEY]: charWidths({ themelessness: width }) }));
      expect(values, JSON.stringify(width)).not.toHaveProperty('--char-w');
    }
  });

  test('a bad stored width sets no width, and a stored character width still holds', () => {
    for (const width of ['', '0', '-5', '10.5', ' 100', '1e3', 'abc', 'Full']) {
      const shown = widthAtFirstPaint(stored({ [WIDTH_KEY]: width, [CHAR_KEY]: charWidths({ themelessness: 0.52 }) }));
      expect({ width: shown.width, values: shown.values }, JSON.stringify(width)).toEqual({
        width: undefined,
        values: { '--char-w': '0.52em' },
      });
    }
  });

  test('bad stored character widths set no character width, and a stored width still holds', () => {
    for (const widths of ['{not json', '[0.5]', '0.5', 'null', '"themelessness"']) {
      expect(widthAtFirstPaint(stored({ [WIDTH_KEY]: '100', [CHAR_KEY]: widths })).values, widths).toEqual({ '--text-chars': '100' });
    }
  });

  test('a storage that throws sets nothing, and the script throws nothing', () => {
    expect(widthAtFirstPaint(blocked)).toEqual({ width: undefined, style: false, values: {} });
  });

  test.describe('with no stored character width, a theme of system fonts only measures its body font on a canvas', () => {
    const SYSTEM_FONTS = ['themelessness', 'i-love-msdos'].map((id) => themeById(id)!);
    const WITH_FACES = THEMES.filter((theme) => theme.faces.length > 0);
    const sizeOf = (theme: Theme) => parseFloat(theme.shape.bodySize);
    /** The px that a canvas gives for the sample, for a character width in em at the body size of the theme. */
    const sampleAt = (em: number, theme = SYSTEM_FONTS[0]!) => em * sizeOf(theme) * CHAR_SAMPLE.length;
    const inTheme = (theme: Theme, items: Record<string, string> = {}) =>
      stored(theme.id === DEFAULT_THEME ? items : { [THEME_KEY]: theme.id, ...items });

    test('the measure of the sample in the body font at the body size, rounded to 4 places, goes into the style nd-width, and nothing is stored', () => {
      expect(SYSTEM_FONTS.map((theme) => theme.faces.length)).toEqual([0, 0]);
      for (const [theme, measured, em] of [
        [SYSTEM_FONTS[0]!, 0.39123, '0.3912em'],
        [SYSTEM_FONTS[1]!, 0.45678, '0.4568em'],
      ] as const) {
        const { canvas, log } = standInCanvas(sampleAt(measured, theme));
        const writes: string[] = [];
        const shown = widthAtFirstPaint(inTheme(theme), { canvas, writes });
        expect(log.kinds, theme.id).toEqual(['2d']);
        expect(log.measured, theme.id).toEqual([{ font: `${theme.shape.bodySize} ${theme.fonts.body}`, text: CHAR_SAMPLE }]);
        expect({ width: shown.width, values: shown.values }, theme.id).toEqual({ width: undefined, values: { '--char-w': em } });
        expect(writes, theme.id).toEqual([]);
      }
    });

    test("the font of Themelessness on the canvas is 18px and its body font stack", () => {
      const { canvas, log } = standInCanvas(sampleAt(0.39));
      widthAtFirstPaint(stored({}), { canvas });
      expect(log.measured.map((measure) => measure.font)).toEqual([
        '18px Charter, "Bitstream Charter", "Iowan Old Style", "Sitka Text", Georgia, serif',
      ]);
    });

    test('a measure from 0.2 to 1.5 em is used, and any other measure sets no character width', () => {
      for (const em of [0.2, 0.39, 1.5]) {
        const { canvas } = standInCanvas(sampleAt(em));
        expect(widthAtFirstPaint(stored({}), { canvas }).values, String(em)).toEqual({ '--char-w': `${em}em` });
      }
      for (const em of [0.19, 1.51, 0, -0.4, NaN, Infinity]) {
        const { canvas } = standInCanvas(sampleAt(em));
        expect(widthAtFirstPaint(stored({}), { canvas }), String(em)).toEqual({ width: undefined, style: false, values: {} });
      }
    });

    test('the measure goes into the style nd-width with a stored number of characters, and with a stored full', () => {
      const { canvas } = standInCanvas(sampleAt(0.39));
      expect(widthAtFirstPaint(stored({ [WIDTH_KEY]: '100' }), { canvas }).values).toEqual({
        '--text-chars': '100',
        '--char-w': '0.39em',
      });
      const full = widthAtFirstPaint(stored({ [WIDTH_KEY]: 'full' }), { canvas });
      expect({ width: full.width, values: full.values }).toEqual({ width: 'full', values: { '--char-w': '0.39em' } });
    });

    test('a stored character width of the theme wins over the measure', () => {
      for (const theme of SYSTEM_FONTS) {
        const { canvas } = standInCanvas(sampleAt(0.39, theme));
        const shown = widthAtFirstPaint(inTheme(theme, { [CHAR_KEY]: charWidths({ [theme.id]: 0.52 }) }), { canvas });
        expect(shown.values, theme.id).toEqual({ '--char-w': '0.52em' });
      }
    });

    test('a stored character width of another theme only, or a bad one, gives way to the measure', () => {
      for (const widths of [charWidths({ 'im-in': 0.6 }), charWidths({ themelessness: 1.51 }), charWidths({ themelessness: '0.52' }), '{not json', '[0.52]']) {
        const { canvas } = standInCanvas(sampleAt(0.39));
        expect(widthAtFirstPaint(stored({ [CHAR_KEY]: widths }), { canvas }).values, widths).toEqual({ '--char-w': '0.39em' });
      }
    });

    test('a theme with font files takes no character width from the canvas, since its fonts are not loaded yet', () => {
      expect(WITH_FACES.map((theme) => theme.id)).toContain('original-nerd');
      for (const theme of WITH_FACES) {
        const { canvas } = standInCanvas(sampleAt(0.39, theme));
        const { values } = widthAtFirstPaint(inTheme(theme), { canvas });
        expect(values, theme.id).not.toHaveProperty('--char-w');
      }
    });

    test('no canvas context, a canvas that throws, and a canvas that throws on the measure set no character width, a stored width still holds, and the script throws nothing', () => {
      for (const fault of ['no context', 'getContext throws', 'measureText throws'] as const) {
        const { canvas } = standInCanvas(sampleAt(0.39), fault);
        expect(widthAtFirstPaint(stored({}), { canvas }), fault).toEqual({ width: undefined, style: false, values: {} });
        expect(widthAtFirstPaint(stored({ [WIDTH_KEY]: '100' }), { canvas }).values, fault).toEqual({ '--text-chars': '100' });
      }
    });
  });
});
