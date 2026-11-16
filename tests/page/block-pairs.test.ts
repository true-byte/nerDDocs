import { expect, test } from '@playwright/test';
import { pairBlocks, type BlockChange } from '../../src/page/block-pairs.ts';

/**
 * A block of a page: its kind, as a tag and a `data-l`, and its content. Two blocks with the same kind and content are
 * the same block.
 */
type Block = [kind: string, content: string];

const p = (content: string): Block => ['p', content];
const ul = (content: string): Block => ['ul', content];
const part = (levels: string, content: string): Block => [`div ${levels}`, content];

function pairsOf(before: Block[], after: Block[]): BlockChange[] {
  const changes = pairBlocks(
    before.length,
    after.length,
    (i, j) => before[i]![0] === after[j]![0] && before[i]![1] === after[j]![1],
    (i) => before[i]![0],
    (j) => after[j]![0],
  );
  // Each old block and each new block is in one change.
  const olds = changes.flatMap((change) => ('before' in change ? [change.before] : [])).sort((a, b) => a - b);
  const news = changes.flatMap((change) => ('after' in change ? [change.after] : [])).sort((a, b) => a - b);
  expect(olds).toEqual(before.map((_, at) => at));
  expect(news).toEqual(after.map((_, at) => at));
  return changes;
}

/** The changes in a fixed order, so that a test does not depend on the order of the list. */
const sorted = (changes: BlockChange[]) =>
  [...changes].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const expectPairs = (before: Block[], after: Block[], wanted: BlockChange[]) =>
  expect(sorted(pairsOf(before, after))).toEqual(sorted(wanted));

test('equal pages pair each block with itself', () => {
  const page = [p('Pick a file and a day.'), part('overview', 'The app shows each day.'), p('Keep a copy.')];
  expectPairs(page, page, [
    { kind: 'same', before: 0, after: 0 },
    { kind: 'same', before: 1, after: 1 },
    { kind: 'same', before: 2, after: 2 },
  ]);
});

test('a paragraph with new text between two same blocks is changed', () => {
  expectPairs(
    [p('Pick a file.'), p('Open the file and check it.'), p('Keep a copy.')],
    [p('Pick a file.'), p('Open the file and read it.'), p('Keep a copy.')],
    [
      { kind: 'same', before: 0, after: 0 },
      { kind: 'changed', before: 1, after: 1 },
      { kind: 'same', before: 2, after: 2 },
    ],
  );
});

test('a new block is added and a block taken out is removed', () => {
  expectPairs(
    [p('Pick a file.'), p('Keep a copy.')],
    [p('Pick a file.'), part('internals', 'The agent checks each block.'), p('Keep a copy.')],
    [
      { kind: 'same', before: 0, after: 0 },
      { kind: 'added', after: 1 },
      { kind: 'same', before: 1, after: 2 },
    ],
  );
  expectPairs(
    [p('Pick a file.'), part('internals', 'The agent checks each block.'), p('Keep a copy.')],
    [p('Pick a file.'), p('Keep a copy.')],
    [
      { kind: 'same', before: 0, after: 0 },
      { kind: 'removed', before: 1 },
      { kind: 'same', before: 2, after: 1 },
    ],
  );
});

test('two blocks of different kinds are removed and added, not changed', () => {
  expectPairs(
    [p('Pick a file.'), p('Open the file.'), p('Keep a copy.')],
    [p('Pick a file.'), ul('Open the file.'), p('Keep a copy.')],
    [
      { kind: 'same', before: 0, after: 0 },
      { kind: 'removed', before: 1 },
      { kind: 'added', after: 1 },
      { kind: 'same', before: 2, after: 2 },
    ],
  );
});

test('two parts of different levels are removed and added, not changed', () => {
  expectPairs(
    [p('Pick a file.'), part('overview', 'The app shows each day.')],
    [p('Pick a file.'), part('internals', 'The app shows each day.')],
    [
      { kind: 'same', before: 0, after: 0 },
      { kind: 'removed', before: 1 },
      { kind: 'added', after: 1 },
    ],
  );
});

test('same blocks pair by the longest common run, also with blocks taken out between them', () => {
  expectPairs(
    [p('Pick a file.'), ul('Old step.'), p('Open the file.'), ul('Other step.'), p('Keep a copy.')],
    [p('Pick a file.'), p('Open the file.'), p('Keep a copy.')],
    [
      { kind: 'same', before: 0, after: 0 },
      { kind: 'removed', before: 1 },
      { kind: 'same', before: 2, after: 1 },
      { kind: 'removed', before: 3 },
      { kind: 'same', before: 4, after: 2 },
    ],
  );
});

test('one of several equal paragraphs taken out is removed, and the others stay the same', () => {
  expectPairs(
    [p('Keep a copy.'), p('Check the day.'), p('Keep a copy.')],
    [p('Keep a copy.'), p('Keep a copy.')],
    [
      { kind: 'same', before: 0, after: 0 },
      { kind: 'removed', before: 1 },
      { kind: 'same', before: 2, after: 1 },
    ],
  );
});

test('between two same pairs, blocks of one kind pair as changed in order, and the rest are added', () => {
  expectPairs(
    [p('Pick a file.'), p('Open the file.'), p('Check it.'), p('Keep a copy.')],
    [p('Pick a file.'), p('Open the restored file.'), ul('A list of steps.'), p('Check it twice.'), p('Keep a copy.')],
    [
      { kind: 'same', before: 0, after: 0 },
      { kind: 'changed', before: 1, after: 1 },
      { kind: 'added', after: 2 },
      { kind: 'changed', before: 2, after: 3 },
      { kind: 'same', before: 3, after: 4 },
    ],
  );
});

test('a changed pair never crosses a same pair', () => {
  expectPairs(
    [p('Open the file.'), p('Keep a copy.'), p('Check it.')],
    [p('Keep a copy.'), p('Open the restored file.'), p('Check it twice.')],
    [
      { kind: 'removed', before: 0 },
      { kind: 'same', before: 1, after: 0 },
      { kind: 'changed', before: 2, after: 1 },
      { kind: 'added', after: 2 },
    ],
  );
});

test('a page that was empty adds each block, and a page that becomes empty removes each block', () => {
  expectPairs([], [p('Pick a file.'), p('Keep a copy.')], [
    { kind: 'added', after: 0 },
    { kind: 'added', after: 1 },
  ]);
  expectPairs([p('Pick a file.'), p('Keep a copy.')], [], [
    { kind: 'removed', before: 0 },
    { kind: 'removed', before: 1 },
  ]);
  expectPairs([], [], []);
});

test('with no same block, blocks of one kind pair as changed in order', () => {
  expectPairs(
    [p('Pick a file.'), ul('Old steps.')],
    [p('Pick a file and a day.'), ul('New steps.'), p('Keep a copy.')],
    [
      { kind: 'changed', before: 0, after: 0 },
      { kind: 'changed', before: 1, after: 1 },
      { kind: 'added', after: 2 },
    ],
  );
});
