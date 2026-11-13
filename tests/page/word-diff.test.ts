import { expect, test } from '@playwright/test';
import { diffWords, wordTokens, type WordPart } from '../../src/page/word-diff.ts';

test('a token is a run of letters, digits, apostrophes and hyphens, a run of white space, or one other character', () => {
  expect(wordTokens("Don't restore a half-written file, ok?")).toEqual([
    "Don't",
    ' ',
    'restore',
    ' ',
    'a',
    ' ',
    'half-written',
    ' ',
    'file',
    ',',
    ' ',
    'ok',
    '?',
  ]);
  expect(wordTokens('Keep 30 days.\n\n  Then v2 runs')).toEqual(['Keep', ' ', '30', ' ', 'days', '.', '\n\n  ', 'Then', ' ', 'v2', ' ', 'runs']);
});

test('the letters of any language join a word, and an underscore or a run of signs splits words', () => {
  expect(wordTokens('Zürich and Ærø keep copies')).toEqual(['Zürich', ' ', 'and', ' ', 'Ærø', ' ', 'keep', ' ', 'copies']);
  expect(wordTokens('restore_now...')).toEqual(['restore', '_', 'now', '.', '.', '.']);
  expect(wordTokens('(a)')).toEqual(['(', 'a', ')']);
  expect(wordTokens('')).toEqual([]);
});

/** The diff with each run of one kind joined, so that a test does not depend on how the parts are cut. */
function joined(parts: WordPart[]): WordPart[] {
  const out: WordPart[] = [];
  for (const part of parts) {
    const last = out.at(-1);
    if (last && last.op === part.op) last.text += part.text;
    else if (part.text) out.push({ ...part });
  }
  return out;
}

/** The text that the parts of these kinds make, in order. */
const textOf = (parts: WordPart[], ops: WordPart['op'][]) => parts.filter((part) => ops.includes(part.op)).map((part) => part.text).join('');

/** The length of the longest common run of two lists. */
function commonLength(a: string[], b: string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = a.length - 1; i >= 0; i--) {
    let diagonal = 0;
    for (let j = b.length - 1; j >= 0; j--) {
      const below = row[j]!;
      row[j] = a[i] === b[j] ? diagonal + 1 : Math.max(row[j]!, row[j + 1]!);
      diagonal = below;
    }
  }
  return row[0]!;
}

/** The parts give back both texts, and their same tokens are a longest common run. */
function expectDiffOf(before: string, after: string): WordPart[] {
  const parts = diffWords(before, after);
  expect(parts).not.toBeNull();
  expect(textOf(parts!, ['same', 'gone'])).toBe(before);
  expect(textOf(parts!, ['same', 'new'])).toBe(after);
  const same = parts!.filter((part) => part.op === 'same').flatMap((part) => wordTokens(part.text));
  expect(same.join('')).toBe(textOf(parts!, ['same']));
  expect(same.length).toBe(commonLength(wordTokens(before), wordTokens(after)));
  return joined(parts!);
}

test('a word that changes is gone, and the word in its place is new', () => {
  const parts = expectDiffOf('Sort the folder by name to find it.', 'Sort the folder by date to find it.');
  expect(parts.filter((part) => part.op !== 'same')).toEqual(
    expect.arrayContaining([
      { text: 'name', op: 'gone' },
      { text: 'date', op: 'new' },
    ]),
  );
  expect(parts.filter((part) => part.op !== 'same')).toHaveLength(2);
});

test('words added at the end are new, and the text before them is the same', () => {
  const parts = expectDiffOf(
    'A copy that is still being written is never picked.',
    'A copy that is still being written is never picked, so a restore never gets half a file.',
  );
  expect(parts).toEqual([
    { text: 'A copy that is still being written is never picked', op: 'same' },
    { text: ', so a restore never gets half a file', op: 'new' },
    { text: '.', op: 'same' },
  ]);
});

test('words taken out are gone, and nothing is new', () => {
  const parts = expectDiffOf('Only the cleanup job deletes a copy, after its last day.', 'Only the cleanup job deletes a copy.');
  expect(parts.filter((part) => part.op === 'new')).toEqual([]);
  expect(textOf(parts, ['gone'])).toBe(', after its last day');
});

test('equal texts are one same part, and an empty text is all gone or all new', () => {
  expect(joined(diffWords('Pick a file and a day.', 'Pick a file and a day.')!)).toEqual([{ text: 'Pick a file and a day.', op: 'same' }]);
  expect(joined(diffWords('', 'Pick a day.')!)).toEqual([{ text: 'Pick a day.', op: 'new' }]);
  expect(joined(diffWords('Pick a day.', '')!)).toEqual([{ text: 'Pick a day.', op: 'gone' }]);
  expect(joined(diffWords('', '')!)).toEqual([]);
});

test('a word that changes in part is gone and new as a whole', () => {
  const parts = expectDiffOf('Keep 30 days of copies.', 'Keep 90 days of copies.');
  expect(parts.filter((part) => part.op !== 'same')).toEqual(
    expect.arrayContaining([
      { text: '30', op: 'gone' },
      { text: '90', op: 'new' },
    ]),
  );
});

test('the diff is a longest common run of tokens for longer edits', () => {
  expectDiffOf(
    'The storage server keeps each copy read-only. Only the cleanup job deletes a copy, after its last day.',
    'The storage server keeps each copy read-only for 30 days. Then the cleanup job deletes the copy, once it is older.',
  );
  expectDiffOf('Open the file and check it.', 'Open the restored file, then check it twice.');
  expectDiffOf('a b a b a', 'b a b a b');
});

test('a text of more than 4000 tokens gives no diff, and a text of 4000 tokens does', () => {
  // Each word and each space is a token.
  const words = (count: number) => Array.from({ length: count }, (_, n) => `copy${n}`).join(' ');
  expect(wordTokens(`${words(2000)}.`)).toHaveLength(4000);
  expect(wordTokens(`${words(2000)} x`)).toHaveLength(4001);

  expect(diffWords(`${words(2000)}.`, `${words(2000)}!`)).not.toBeNull();
  expect(diffWords(`${words(2000)} x`, 'Pick a day.')).toBeNull();
  expect(diffWords('Pick a day.', `${words(2000)} x`)).toBeNull();
});
