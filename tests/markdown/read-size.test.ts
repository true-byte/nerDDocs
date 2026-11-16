import { expect, test } from '@playwright/test';
import type { Root } from 'hast';
import { textSizes } from '../../src/markdown/read-size.ts';
import { renderMarkdown } from '../../src/markdown/render.ts';
import { mermaidBlock, RESTORE_FLOW, RESTORE_JOB } from '../support/diagrams.ts';
import { elementAround } from '../support/html.ts';
import { fakeFiles, PLAN_PICTURE, pngFile } from '../support/images.ts';
import { apiFiles, BACKUP_API_PAGE, BACKUP_SPEC, sectionOf, UNRESOLVED_SPEC, wordsOf as wordsOfHtml } from '../support/openapi.ts';
import { ARCHITECTURE_DIAGRAM } from '../support/page-content.ts';
import { WIZARD_CSS, WIZARD_HTML, WIZARD_JS, WIZARD_LINE } from '../support/wireframes.ts';

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
  test('is a token with a letter or a digit, split by whitespace, and counted per text node', () => {
    // 'Re' and 'store' are two text nodes. A token of signs only is no word. Korean puts spaces between words.
    expect(wordsOf('# Restore\n\nRe**store** the 개요 — 14, übersicht -- !!\n').overview).toBe(7);
  });

  test('in a script with no spaces between words counts each word of the token', () => {
    // The title '备份' and the four words 备份, 文件, 每天 and 运行. The sign '。' is no word.
    expect(wordsOf('# 备份\n\n备份文件每天运行。\n')).toEqual({ overview: 5, internals: 5, '': 5 });
  });

  test('in English counts by whitespace next to a paragraph in Chinese', () => {
    // The title, 'Back up each day.' and the four Chinese words.
    expect(wordsOf('# Backup\n\nBack up each day.\n\n备份文件每天运行。\n')).toEqual({ overview: 9, internals: 9, '': 9 });
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

test('a code block counts the words of its whole text, so the token colors add none', () => {
  // The title and 11 words. The colors split 'storage.closestCopy(file,' into several spans.
  const source = '# Restore\n\n```ts\nconst copy = await storage.closestCopy(file, day); // newest closed copy of that day\n```\n';
  expect(wordsOf(source)).toEqual({ overview: 12, internals: 12, '': 12 });
});

test.describe('a box diagram', () => {
  test('adds one image and no words', () => {
    const size = { words: 1, images: 1 };
    expect(sizesOf(`# Architecture\n\n\`\`\`\n${ARCHITECTURE_DIAGRAM}\n\`\`\`\n`)).toEqual({ overview: size, internals: size, '': size });
  });

  test('in a fence counts only at the levels of the fence', () => {
    const source = `# Architecture\n\nThe agent sends blocks.\n\n::: internals\n\`\`\`\n${ARCHITECTURE_DIAGRAM}\n\`\`\`\n:::\n`;
    expect(sizesOf(source)).toEqual({
      overview: { words: 5, images: 0 },
      internals: { words: 5, images: 1 },
      '': { words: 5, images: 1 },
    });
  });
});

test.describe('a Mermaid diagram', () => {
  test('adds one image and no words', () => {
    // The title 'User flows' gives the two words. The source of the diagram counts none.
    const size = { words: 2, images: 1 };
    expect(sizesOf(`# User flows\n\n${mermaidBlock(RESTORE_FLOW)}\n`)).toEqual({ overview: size, internals: size, '': size });
  });

  test('in a fence counts at its levels', () => {
    const source = `# User flows\n\nThe agent asks.\n\n::: internals\n${mermaidBlock(RESTORE_JOB)}\n:::\n`;
    expect(sizesOf(source)).toEqual({
      overview: { words: 5, images: 0 },
      internals: { words: 5, images: 1 },
      '': { words: 5, images: 1 },
    });
  });
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

test.describe('with the files of the folder', () => {
  const PAIR = fakeFiles({
    'restore-window-light.png': { bytes: pngFile(1280, 720), version: 1 },
    'restore-window-dark.png': { bytes: pngFile(1280, 800), version: 2 },
  });
  const embedded = (source: string, files = PAIR) => renderMarkdown(source, '/restore.html', 'File name', LISTED, files).sizes;
  const everywhere = (size: { words: number; images: number }) => ({ overview: size, internals: size, '': size });

  test('a light and dark pair counts one image', () => {
    expect(embedded(`# Restore\n\n${PLAN_PICTURE}\n`)).toEqual(everywhere({ words: 1, images: 1 }));
    const fragments =
      '# Restore\n\n![Restore window](restore-window-dark.png#gh-dark-mode-only)\n![Restore window](restore-window-light.png#gh-light-mode-only)\n';
    expect(embedded(fragments)).toEqual(everywhere({ words: 1, images: 1 }));
  });

  test('a problem box counts no word and no image', () => {
    expect(embedded('# Restore\n\n![Restore window](restore-window-old.png)\n', fakeFiles({}))).toEqual(everywhere(NONE));
  });

  test('a remote image counts one image', () => {
    expect(embedded('# Restore\n\n![Logo](https://backup.example/logo.png)\n', fakeFiles({}))).toEqual(
      everywhere({ words: 1, images: 1 }),
    );
  });
});

test.describe('a wireframe', () => {
  const FILES = fakeFiles(
    {
      'design/wireframes/restore-wizard.html': { bytes: WIZARD_HTML, version: 1 },
      'design/wireframes/wizard.css': { bytes: WIZARD_CSS, version: 2 },
      'design/wireframes/wizard.js': { bytes: WIZARD_JS, version: 3 },
      'design/wireframes/step.png': { bytes: pngFile(1280, 720), version: 4 },
    },
    'design/decisions.md',
  );
  const decisions = (source: string) => renderMarkdown(source, '/design/decisions.html', 'Decisions', LISTED, FILES).sizes;
  const everywhere = (size: { words: number; images: number }) => ({ overview: size, internals: size, '': size });

  test('a wireframe adds one image and no words', () => {
    expect(decisions(`# Design decisions\n\n${WIZARD_LINE}\n`)).toEqual(everywhere({ words: 2, images: 1 }));
  });

  test('a wireframe in a fence counts at its levels', () => {
    expect(decisions(`# Design decisions\n\n::: internals\n${WIZARD_LINE}\n:::\n`)).toEqual({
      overview: NONE,
      internals: { words: 2, images: 1 },
      '': { words: 2, images: 1 },
    });
  });

  test('a missing wireframe counts no image', () => {
    expect(decisions('# Design decisions\n\n![Restore wizard](wireframes/old-wizard.html)\n')).toEqual(everywhere(NONE));
  });
});

/** A page at `api.md` of the three levels of the backup app, with its OpenAPI file at `api/openapi.yaml`. */
const apiPage = (source: string, spec: string) =>
  renderMarkdown(source, '/api.html', 'Api', ['overview', 'requirements', 'internals'], apiFiles({ 'api/openapi.yaml': spec }));

test('an API reference counts its text at the levels of its fence', () => {
  const page = apiPage(BACKUP_API_PAGE, BACKUP_SPEC);
  expect(page.sizes.overview).toEqual({ words: 10, images: 0 });
  expect(page.sizes.requirements).toEqual({ words: 10, images: 0 });
  expect(page.sizes.internals).toEqual({ words: 2 + wordsOfHtml(sectionOf(page.html)), images: 0 });
});

test('an unresolved ref counts no words', () => {
  const page = apiPage('# Backup API\n\n![Backup API](api/openapi.yaml)\n', UNRESOLVED_SPEC);
  const section = sectionOf(page.html);
  const slot = elementAround(section, 'span', 'Unresolved ref:');
  expect(wordsOfHtml(slot)).toBeGreaterThan(0);
  expect(page.sizes.internals).toEqual({ words: 2 + wordsOfHtml(section) - wordsOfHtml(slot), images: 0 });
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
