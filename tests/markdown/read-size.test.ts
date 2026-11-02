import { expect, test } from '@playwright/test';
import type { Root } from 'hast';
import { textSizes } from '../../src/markdown/read-size.ts';
import { renderMarkdown } from '../../src/markdown/render.ts';

const LISTED = ['overview', 'internals'];

function sizesOf(source: string, listed: readonly string[] = LISTED) {
  return renderMarkdown(source, '/restore.html', 'File name', listed).sizes;
}

/** The words of each entry, for a test in which no entry has an image. */
function wordsOf(source: string, listed: readonly string[] = LISTED) {
  return Object.fromEntries(Object.entries(sizesOf(source, listed)).map(([id, size]) => [id, size.words]));
}

const NONE = { words: 0, images: 0 };

test('each level counts its own words and the title, and the entry with no level rule counts all', () => {
  const source = '# Restore a file\n\n::: overview\nPick a file and a day.\n::: internals\nA restore is a job.\n:::\n';
  expect(sizesOf(source)).toEqual({
    overview: { words: 9, images: 0 },
    internals: { words: 8, images: 0 },
    '': { words: 14, images: 0 },
  });
});

test('shared text counts at each level', () => {
  const source = '# Restore\n\nA restore never changes the copy.\n\n::: overview\nPick a day.\n::: internals\nA job runs now.\n:::\n';
  expect(wordsOf(source)).toEqual({ overview: 10, internals: 11, '': 14 });
});

test('a part at two levels counts at both, and once in the entry with no level rule', () => {
  const source = '# Restore\n\n::: overview internals\nPick a day.\n::: requirements\nA disk.\n:::\n';
  expect(wordsOf(source, ['overview', 'requirements', 'internals'])).toEqual({
    overview: 4,
    requirements: 3,
    internals: 4,
    '': 6,
  });
});

test.describe('the title', () => {
  test('counts only at a level with a word in its text', () => {
    expect(wordsOf('# Restore a file\n\n::: overview\nPick a day.\n:::\n')).toEqual({ overview: 6, internals: 0, '': 6 });
  });

  test('counts at a level with only an image in its text', () => {
    expect(sizesOf('# Restore a file\n\n::: overview\n![Window](window.svg)\n:::\n')).toEqual({
      overview: { words: 3, images: 1 },
      internals: NONE,
      '': { words: 3, images: 1 },
    });
  });

  test('counts nowhere on a page with no other text', () => {
    expect(sizesOf('# Restore a file\n')).toEqual({ overview: NONE, internals: NONE, '': NONE });
  });

  test('comes from the file name on a page with no heading', () => {
    expect(wordsOf('Pick a day.\n')).toEqual({ overview: 5, internals: 5, '': 5 });
  });

  test('follows the rule for a word', () => {
    expect(wordsOf('# Restore — now\n\nOne.\n')).toEqual({ overview: 3, internals: 3, '': 3 });
  });
});

test.describe('a word', () => {
  test('is a token with a letter or a digit, split by whitespace in any language, and counted per text node', () => {
    // 'Re' and 'store' are two text nodes. A token of signs only is no word.
    expect(wordsOf('# Restore\n\nRe**store** the 概要概要 — 14, übersicht -- !!\n').overview).toBe(7);
  });

  test('in a code block or a table counts', () => {
    const source = '# Restore\n\n```\nrestore --from monday\n```\n\n| Plan | Days |\n|---|---|\n| Team | 14 |\n';
    expect(wordsOf(source)).toEqual({ overview: 8, internals: 8, '': 8 });
  });

  test('in a fence line counts on a site that lists no level, since the line shows as text', () => {
    // The title 'File name', then 'overview' and 'Pick'. A ':::' is no word.
    expect(wordsOf('::: overview\nPick.\n:::\n', [])).toEqual({ '': 4 });
  });
});

test.describe('a footnote', () => {
  test('counts only at the level of its reference, and the hidden heading of the footnotes counts nowhere', () => {
    // At overview: the title, 3 words, the reference number 1, and 5 words of the footnote.
    const source = '# Restore\n\n::: overview\nKeep a copy.[^1]\n::: internals\nA job runs.\n:::\n\n[^1]: A copy on another disk.\n';
    expect(wordsOf(source)).toEqual({ overview: 10, internals: 4, '': 13 });
  });

  test('of shared text counts at each level', () => {
    const source = '# Restore\n\nKeep a copy.[^1]\n\n[^1]: A copy on another disk.\n';
    expect(wordsOf(source)).toEqual({ overview: 10, internals: 10, '': 10 });
  });
});

test('a level sees what the level rule shows', () => {
  // A shared heading over text at one level gets data-shows.
  const heading = '# Restore\n\nA copy stays.\n\n## Job details\n\n::: internals\nA job runs.\n:::\n';
  expect(wordsOf(heading)).toEqual({ overview: 4, internals: 9, '': 9 });

  // The rule reaches an element with these attributes in raw HTML too.
  const raw =
    '# Restore\n\nA copy stays.\n\n<p data-shows="internals">Only there now</p>\n\n<p class="part" data-l="overview">Hand made words here</p>\n';
  expect(wordsOf(raw)).toEqual({ overview: 8, internals: 7, '': 11 });
});

test('an image counts at the levels that show it, and its alt text is no word', () => {
  const source = '# Restore\n\n![Restore window](a.svg)\n\n::: overview\n![Day](b.svg)\n![Disk](c.svg)\n::: internals\nA job.\n:::\n';
  expect(sizesOf(source)).toEqual({
    overview: { words: 1, images: 3 },
    internals: { words: 3, images: 1 },
    '': { words: 3, images: 3 },
  });
  expect(sizesOf('# Restore\n\n<img src="a.svg">\n')['']).toEqual({ words: 1, images: 1 });
});

test('script, style, template and an element with the hidden attribute count nowhere', () => {
  const source = [
    '# Restore',
    'One word.',
    '<script>var words = 1;</script>',
    '<style>p { color: red; }</style>',
    '<template>Not shown here</template>',
    '<div hidden>Not shown here</div>',
    '<div hidden>\n\n![Hidden](hidden.svg)\n\n</div>',
  ].join('\n\n');
  const size = { words: 3, images: 0 };
  expect(sizesOf(source)).toEqual({ overview: size, internals: size, '': size });
});

test('the sizes hold one entry per listed level and the entry with no level rule', () => {
  expect(Object.keys(sizesOf('Pick.\n', [])).sort()).toEqual(['']);
  expect(Object.keys(sizesOf('Pick.\n', ['overview'])).sort()).toEqual(['', 'overview']);
  expect(Object.keys(sizesOf('Pick.\n')).sort()).toEqual(['', 'internals', 'overview']);
});

test('an empty page counts nothing', () => {
  expect(sizesOf('')).toEqual({ overview: NONE, internals: NONE, '': NONE });
  const empty: Root = { type: 'root', children: [] };
  expect(textSizes(empty, 'Restore a file', LISTED)).toEqual({ overview: NONE, internals: NONE, '': NONE });
});

test('the sizes of a tree count its text and the title', () => {
  const root: Root = {
    type: 'root',
    children: [{ type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: 'Pick a day.' }] }],
  };
  expect(textSizes(root, 'Restore a file', ['overview'])).toEqual({
    overview: { words: 6, images: 0 },
    '': { words: 6, images: 0 },
  });
});
