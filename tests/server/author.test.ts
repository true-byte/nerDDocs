import { expect, test } from '@playwright/test';
import { authorCookie, isAuthor, newAuthorKey } from '../../src/server/author.ts';

const PORT = 4321;
const KEY = 'q0rM9Yb3sXhT2vWcLk8pNfJd5uZaEe1G';

test('a new key is 24 random bytes in base64url, and each key is new', () => {
  const keys = Array.from({ length: 20 }, () => newAuthorKey());
  for (const key of keys) {
    expect(key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(Buffer.from(key, 'base64url')).toHaveLength(24);
  }
  expect(new Set(keys).size).toBe(keys.length);
});

test('the author cookie is named after the port of the command', () => {
  expect(authorCookie(PORT)).toBe('nerddocs-author-4321');
  expect(authorCookie(8080)).toBe('nerddocs-author-8080');
});

test('a Cookie header with the author cookie of the port and its key is the author', () => {
  expect(isAuthor(`nerddocs-author-4321=${KEY}`, PORT, KEY)).toBe(true);
  expect(isAuthor(`nerddocs-theme=dark; nerddocs-author-4321=${KEY}; nerddocs-look=light`, PORT, KEY)).toBe(true);
  expect(isAuthor(`nerddocs-author-4321=${KEY};nerddocs-look=light`, PORT, KEY)).toBe(true);
});

test('a Cookie header with no author cookie, a wrong key or the cookie of another port is not the author', () => {
  const cases: [string | undefined, string][] = [
    [undefined, 'no header'],
    ['', 'an empty header'],
    ['nerddocs-theme=dark', 'another cookie'],
    [`nerddocs-author-4321=${KEY.slice(1)}`, 'a key with a letter less'],
    [`nerddocs-author-4321=${KEY}x`, 'a key with a letter more'],
    ['nerddocs-author-4321=', 'an empty key'],
    [`nerddocs-author-4322=${KEY}`, 'the cookie of another port'],
    [`nerddocs-author-43210=${KEY}`, 'the cookie of a port that starts with the same digits'],
    [`xnerddocs-author-4321=${KEY}`, 'a longer cookie name'],
    [`nerddocs-theme=nerddocs-author-4321=${KEY}`, 'the cookie inside the value of another cookie'],
  ];
  for (const [header, name] of cases) expect(isAuthor(header, PORT, KEY), name).toBe(false);
});

test('a command with no key has no author', () => {
  expect(isAuthor(`nerddocs-author-4321=${KEY}`, PORT, null)).toBe(false);
  expect(isAuthor('nerddocs-author-4321=', PORT, null)).toBe(false);
  expect(isAuthor('nerddocs-author-4321=null', PORT, null)).toBe(false);
});
