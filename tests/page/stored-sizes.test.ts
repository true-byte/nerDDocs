import { expect, test } from '@playwright/test';
import { MAX_SIZES, readSizes, SIZES_KEY, storedSize, storeSize, withSize, type SizeEntry } from '../../src/page/stored-sizes.ts';

/** A storage that keeps its items in a map. */
function fakeStorage(items = new Map<string, string>()): Storage {
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
  } as unknown as Storage;
}

const blockedStorage = {
  getItem() {
    throw new Error('The browser blocks storage.');
  },
  setItem() {
    throw new Error('The browser blocks storage.');
  },
} as unknown as Storage;

const useStorage = (storage: Storage) => Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

test('a stored value reads back its entries and drops bad ones', () => {
  expect(readSizes('[["a",600,450],["b",0,1],["c","1",2],[3,4,5]]')).toEqual([['a', 600, 450]]);
  for (const text of [null, '', '{', '{}']) expect(readSizes(text), String(text)).toEqual([]);
});

test('a new size becomes the newest entry, and an old key moves to the end', () => {
  const entries: SizeEntry[] = [
    ['a', 1, 1],
    ['b', 2, 2],
  ];
  expect(withSize(entries, 'a', { width: 3, height: 4 })).toEqual([
    ['b', 2, 2],
    ['a', 3, 4],
  ]);
});

test('the key keeps the newest 200', () => {
  expect(MAX_SIZES).toBe(200);
  const entries = Array.from({ length: 200 }, (_, n): SizeEntry => [`key ${n}`, n + 1, n + 1]);
  const kept = withSize(entries, 'new key', { width: 600, height: 450 });
  expect(kept).toHaveLength(200);
  expect(kept[0]).toEqual(['key 1', 2, 2]);
  expect(kept.at(-1)).toEqual(['new key', 600, 450]);
});

test('a blocked storage gives no size and throws nothing', () => {
  useStorage(blockedStorage);
  expect(storedSize('a')).toBeNull();
  expect(() => storeSize('a', { width: 600, height: 450 })).not.toThrow();

  const items = new Map<string, string>();
  useStorage(fakeStorage(items));
  storeSize('a', { width: 600, height: 450 });
  expect(storedSize('a')).toEqual({ width: 600, height: 450 });
  expect(SIZES_KEY).toBe('nerddocs-sizes');
  expect(JSON.parse(items.get(SIZES_KEY) ?? 'null')).toEqual([['a', 600, 450]]);
});
