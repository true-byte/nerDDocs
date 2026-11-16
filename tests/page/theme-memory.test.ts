import { expect, test } from '@playwright/test';
import {
  DARK_QUERY,
  lookOf,
  MODE_KEY,
  pickLook,
  pickTheme,
  showStoredLook,
  storedLook,
  storedTheme,
  THEME_KEY,
} from '../../src/page/theme-memory.ts';
import { THEMES } from '../../src/themes/index.ts';
import type { Mode } from '../../src/themes/types.ts';
import { computerSetTo, standInRoot } from '../support/stand-in.ts';

const blocked = () => {
  throw new Error('The browser blocks storage.');
};

/** Gives the code a page, a storage and a computer look, as a browser does, and gives back what the page and storage hold. */
function standIn(items: Record<string, string>, { storageThrows = false, computer = 'light' as Mode } = {}) {
  const attributes: Record<string, string> = { 'data-theme': 'themelessness' };
  const storage = {
    getItem: (key: string) => (storageThrows ? blocked() : (items[key] ?? null)),
    setItem: (key: string, value: string) => (storageThrows ? blocked() : (items[key] = String(value))),
  };
  const document = { documentElement: standInRoot(attributes) };
  const matchMedia = computerSetTo(computer);
  const globals = { localStorage: storage, document, matchMedia, window: { localStorage: storage, document, matchMedia } };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  return { items, attributes };
}

test.afterEach(() => {
  for (const name of ['localStorage', 'document', 'matchMedia', 'window']) Reflect.deleteProperty(globalThis, name);
});

test('the theme is stored under nerddocs-theme, and the look setting under nerddocs-mode', () => {
  expect(THEME_KEY).toBe('nerddocs-theme');
  expect(MODE_KEY).toBe('nerddocs-mode');
  expect(DARK_QUERY).toBe('(prefers-color-scheme: dark)');
});

test('the stored theme is the stored id of a known theme, and Themelessness for any other value', () => {
  for (const { id } of THEMES) {
    standIn({ [THEME_KEY]: id });
    expect(storedTheme()).toBe(id);
  }
  for (const items of [{}, { [THEME_KEY]: 'dark-mode' }, { [THEME_KEY]: '' }] as Record<string, string>[]) {
    standIn(items);
    expect(storedTheme(), JSON.stringify(items)).toBe('themelessness');
  }
  standIn({ [THEME_KEY]: 'im-a-serious-person' }, { storageThrows: true });
  expect(storedTheme()).toBe('themelessness');
});

test('a picked theme shows on the page and is stored', () => {
  const { items, attributes } = standIn({});
  pickTheme('im-a-serious-person');
  expect(attributes['data-theme']).toBe('im-a-serious-person');
  expect(items[THEME_KEY]).toBe('im-a-serious-person');
});

test('a picked theme shows on the page when the storage throws', () => {
  const { attributes } = standIn({}, { storageThrows: true });
  pickTheme('im-a-serious-person');
  expect(attributes['data-theme']).toBe('im-a-serious-person');
});

test("the stored look setting is 'light' or 'dark' as stored, and 'system' for a missing, unknown or unreadable value", () => {
  for (const setting of ['light', 'dark', 'system'] as const) {
    standIn({ [MODE_KEY]: setting });
    expect(storedLook(), setting).toBe(setting);
  }
  for (const items of [{}, { [MODE_KEY]: 'blue' }, { [MODE_KEY]: '' }, { [MODE_KEY]: 'Dark' }] as Record<string, string>[]) {
    standIn(items);
    expect(storedLook(), JSON.stringify(items)).toBe('system');
  }
  standIn({ [MODE_KEY]: 'dark' }, { storageThrows: true });
  expect(storedLook()).toBe('system');
});

test("'light' and 'dark' show their own look on any computer, and 'system' shows the computer's look", () => {
  for (const computer of ['light', 'dark'] as const) {
    standIn({}, { computer });
    expect(lookOf('light'), `light on a ${computer} computer`).toBe('light');
    expect(lookOf('dark'), `dark on a ${computer} computer`).toBe('dark');
    expect(lookOf('system'), `system on a ${computer} computer`).toBe(computer);
  }
});

test('a picked look setting shows its look on the page at once and is stored', () => {
  for (const [setting, computer, shown] of [
    ['dark', 'light', 'dark'],
    ['light', 'dark', 'light'],
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
  ] as const) {
    const { items, attributes } = standIn({}, { computer });
    pickLook(setting);
    expect(attributes['data-mode'], `${setting} on a ${computer} computer`).toBe(shown);
    expect(items[MODE_KEY], `${setting} on a ${computer} computer`).toBe(setting);
  }
});

test('a picked look setting shows on the page when the storage throws', () => {
  const { attributes } = standIn({}, { storageThrows: true });
  pickLook('dark');
  expect(attributes['data-mode']).toBe('dark');
});

test('the page shows the look of the stored setting', () => {
  for (const [items, computer, shown] of [
    [{ [MODE_KEY]: 'dark' }, 'light', 'dark'],
    [{ [MODE_KEY]: 'light' }, 'dark', 'light'],
    [{ [MODE_KEY]: 'system' }, 'dark', 'dark'],
    [{}, 'dark', 'dark'],
    [{}, 'light', 'light'],
  ] as [Record<string, string>, Mode, Mode][]) {
    const { attributes } = standIn(items, { computer });
    showStoredLook();
    expect(attributes['data-mode'], `${JSON.stringify(items)} on a ${computer} computer`).toBe(shown);
  }
});
