import { runInNewContext } from 'node:vm';
import { expect, test } from '@playwright/test';
import { firstPaintScript, NO_SCRIPT_STYLE, safeJson } from '../../src/page/first-paint.ts';
import { PANEL_KEY, SHUT_KEY, SLIDER_KEY } from '../../src/page/panel-state.ts';

/** Runs the head script against a stand-in for the page, and gives what it set. */
function firstPaint(openSections: string[], getItem: (key: string) => string | null) {
  const attributes: Record<string, string> = {};
  const styles: { id?: string; textContent?: string }[] = [];
  runInNewContext(firstPaintScript(openSections), {
    document: {
      documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) },
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
