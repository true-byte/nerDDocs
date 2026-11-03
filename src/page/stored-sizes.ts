/** The one localStorage key of every stored size. */
export const SIZES_KEY = 'nerddocs-sizes';
/** The most entries that the key keeps. */
export const MAX_SIZES = 200;

export interface Size {
  width: number;
  height: number;
}

/** One stored size: its key, then its width and height in px. The newest entry is last. */
export type SizeEntry = [key: string, width: number, height: number];

const isLength = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

function isEntry(value: unknown): value is SizeEntry {
  return (
    Array.isArray(value) && value.length === 3 && typeof value[0] === 'string' && isLength(value[1]) && isLength(value[2])
  );
}

/** The entries of a stored value. Bad JSON gives []. An entry that is not a string and two finite numbers above 0 is dropped. */
export function readSizes(text: string | null): SizeEntry[] {
  try {
    const value: unknown = JSON.parse(text ?? '');
    return Array.isArray(value) ? value.filter(isEntry).map(([key, width, height]) => [key, width, height]) : [];
  } catch {
    return [];
  }
}

/** The entries with `key` set to `size` as the newest entry, and only the newest `MAX_SIZES` kept. */
export function withSize(entries: readonly SizeEntry[], key: string, size: Size): SizeEntry[] {
  const kept = entries.filter(([name]) => name !== key);
  kept.push([key, size.width, size.height]);
  return kept.slice(-MAX_SIZES);
}

/** The stored size of `key`, or null. Any storage error gives null. */
export function storedSize(key: string): Size | null {
  try {
    const found = readSizes(localStorage.getItem(SIZES_KEY)).find(([name]) => name === key);
    return found ? { width: found[1], height: found[2] } : null;
  } catch {
    return null;
  }
}

/** Stores the size of `key`. Any storage error is dropped. */
export function storeSize(key: string, size: Size): void {
  try {
    localStorage.setItem(SIZES_KEY, JSON.stringify(withSize(readSizes(localStorage.getItem(SIZES_KEY)), key, size)));
  } catch {
    // A blocked storage keeps no size, and the next visit holds 5:3.
  }
}
