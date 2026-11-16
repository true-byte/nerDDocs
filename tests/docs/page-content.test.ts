import { expect, test } from '@playwright/test';
import { attributesOf, elementAt, imagesIn, openingTag, srcdocsOf } from '../support/html.ts';
import { docsSite, pageTitled } from '../support/docs.ts';

/** The fence words of a code block that shows the Markdown of an example, not the example as a page shows it. */
const MARKDOWN_WORDS = ['md', 'markdown'];

/** The classes of a token in a syntax color, as src/markdown/code.ts names them. A comment takes the soft ink, not a syntax color. */
const SYNTAX_CLASSES = ['k', 's', 'f', 'n', 'i', 'd'];

/** Each code block of the HTML that shows no Markdown source: its HTML and the classes of its `pre`. */
function shownBlocks(html: string): { html: string; classes: string[] }[] {
  return [...html.matchAll(/<pre\b[^>]*>/g)].flatMap((pre) => {
    const block = elementAt(html, pre.index);
    const code = /<code\b[^>]*>/.exec(block)?.[0];
    const word = /(?:^|\s)language-(\S+)/.exec(code ? (attributesOf(code).class ?? '') : '')?.[1]?.toLowerCase();
    if (word !== undefined && MARKDOWN_WORDS.includes(word)) return [];
    return [{ html: block, classes: (attributesOf(pre[0]).class ?? '').split(' ') }];
  });
}

const hasSyntaxColor = (block: string) =>
  [...block.matchAll(/<span class="([^"]*)">/g)].some(([, name]) => SYNTAX_CLASSES.includes(name!));

/** The page about page content. */
const PAGE = 'Page content';

/** Each kind of content that the page shows, and the test of its HTML. */
const CONTENT: { shows: string; holds: (html: string) => boolean }[] = [
  { shows: 'a table', holds: (html) => openingTag('table').test(html) },
  {
    shows: 'a code block with syntax colors',
    holds: (html) => shownBlocks(html).some((block) => hasSyntaxColor(block.html)),
  },
  {
    shows: 'a box diagram',
    holds: (html) => shownBlocks(html).some((block) => block.classes.includes('box')),
  },
  { shows: 'a Mermaid diagram', holds: (html) => openingTag('div', { class: 'dg' }).test(html) },
  {
    shows: 'an image with a light and a dark copy',
    holds: (html) => ['light', 'dark'].every((look) => imagesIn(html).some((image) => image['data-look'] === look)),
  },
  { shows: 'a wireframe frame', holds: (html) => srcdocsOf(html).length > 0 },
  { shows: 'an API reference', holds: (html) => openingTag('section', { class: 'api' }).test(html) },
];

for (const { shows, holds } of CONTENT) {
  test(`the page '${PAGE}' shows ${shows} as a page shows it, outside a Markdown code block`, async () => {
    const page = pageTitled(await docsSite(), 'guide', PAGE);
    expect(page, `the 'Guide' dimension holds the page '${PAGE}'`).toBeDefined();
    expect(holds(page!.html)).toBe(true);
  });
}
