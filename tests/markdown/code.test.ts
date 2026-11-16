import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test } from '@playwright/test';
import { isBoxText, LANGUAGES } from '../../src/markdown/code.ts';
import { renderMarkdown } from '../../src/markdown/render.ts';
import { Icon } from '../../src/page/icons.tsx';
import { elementAt, openingTag, sortedTags } from '../support/html.ts';
import { ARCHITECTURE_DIAGRAM } from '../support/page-content.ts';

const html = (source: string) =>
  renderMarkdown(source, '/backups/restore-by-script.html', 'Restore by script', ['overview', 'requirements', 'internals'])
    .html;

const TS_BLOCK = '```ts\nexport const days = 14; // kept\n```';
const SH_BLOCK = '```sh\ncurl -X POST /restores\n```';
const SH_CODE = '<div class="code"><pre class="sbox"><code class="language-sh">';

/** The words of the 23 grammars and their aliases. */
const WORDS =
  'bash c c# cjs console cs csharp css cts diff docker dockerfile go html ini java javascript js json jsonc markdown md mjs mts powershell properties ps ps1 pwsh py python rs rust sh shell shellscript shellsession sql toml ts typescript xml yaml yml zsh';

/** The copy icon right after the first `</code></pre>`. */
function copyButton(page: string): string {
  const end = page.indexOf('</code></pre>');
  expect(end, 'the end of a code block').toBeGreaterThanOrEqual(0);
  const start = end + '</code></pre>'.length;
  expect(page.slice(start)).toMatch(new RegExp(`^${openingTag('button', { type: 'button', class: 'copy', 'aria-label': 'Copy' }).source}`));
  return elementAt(page, start);
}

test('a block in a shipped language gets one short class per token kind, and other tokens keep the ink', () => {
  expect(html(TS_BLOCK)).toContain(
    '<code class="language-ts"><span class="k">export</span><span class="k"> const</span><span class="n"> days</span><span class="k"> =</span><span class="n"> 14</span>; <span class="c">// kept</span></code>',
  );
});

test('a shell block colors the command and its arguments', () => {
  expect(html(SH_BLOCK)).toContain(
    '<span class="f">curl</span><span class="s"> -X</span><span class="s"> POST</span><span class="s"> /restores</span>',
  );
});

test('a diff marks its removed and added lines', () => {
  expect(html('```diff\n- schedule: every 6h\n+ schedule: every 1h\n```')).toContain(
    '<span class="d">- schedule: every 6h</span>\n<span class="i">+ schedule: every 1h</span>',
  );
});

test('strings and function names take their classes', () => {
  expect(html('```json\n{ "id": "job-4821" }\n```')).toContain('<span class="s"> "job-4821"</span>');
  expect(html('```python\ndef closest_copy(copies):\n    return None\n```')).toContain('<span class="f"> closest_copy</span>');
});

test('the colored HTML holds no span with no class, no style, no tabindex and no Shiki class', () => {
  const block = html(TS_BLOCK);
  expect(block).toContain('<span class="k">export</span>');
  for (const unwanted of [/<span(?![^>]*class=)/, /style=/, /tabindex/, /shiki/]) expect(block).not.toMatch(unwanted);
});

test('each block sits in a box with its copy icon, made at build time', () => {
  const page = html(SH_BLOCK);
  expect(page).toContain(SH_CODE);
  const button = copyButton(page);
  expect(button.match(new RegExp(openingTag('svg', { class: 'i', 'aria-hidden': 'true' }).source, 'g'))).toHaveLength(2);
  expect(page.slice(page.indexOf(button) + button.length)).toMatch(/^<\/div>/);
});

test("the check of the copy icon draws the 'check' icon of the page", () => {
  const check = /\sd="([^"]+)"/.exec(renderToString(createElement(Icon, { name: 'check' })))?.[1];
  expect(check).toBe('M5 12l5 5L20 7');
  const icons = [...copyButton(html(SH_BLOCK)).matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/g)].map(([svg]) => svg);
  expect(icons).toHaveLength(2);
  expect(icons[1]).toContain(`d="${check}"`);
  expect(icons[0]).not.toContain(`d="${check}"`);
});

test('the 23 grammars and their aliases are the words that get colors, in any case', () => {
  expect(new Set(LANGUAGES)).toEqual(new Set(WORDS.split(' ')));
  const json = html('```JSON\n{ "id": "job-4821" }\n```');
  expect(json).toContain('class="s"');
  expect(json).toContain('<code class="language-JSON">');
});

test('a fence with no word, with text or with an unknown word shows plain code with its copy icon', () => {
  expect(html('```\nrestore --from <day>\n```')).toContain(
    '<div class="code"><pre class="sbox"><code>restore --from &#x3C;day></code></pre><button',
  );
  for (const word of ['text', 'weirdlang']) {
    const block = html(`\`\`\`${word}\nrestore --from <day>\n\`\`\``);
    expect(block, word).toContain(`<div class="code"><pre class="sbox"><code class="language-${word}">restore --from &#x3C;day></code></pre><button`);
    expect(block, word).not.toContain('<span');
  }
});

test('the code loses the line break at its end and keeps its blank lines', () => {
  expect(html('```ts\nline one\n\nline three\n```')).toContain('<code class="language-ts">line one\n\nline three</code>');
  expect(html('```\nrestore --from monday\n\nrestore --to tuesday\n```')).toContain(
    '<code>restore --from monday\n\nrestore --to tuesday</code>',
  );
});

test('an empty block keeps its box and its copy icon', () => {
  expect(html('```\n```')).toContain('<div class="code"><pre class="sbox"><code></code></pre><button');
});

test('a Mermaid block stays as remark wrote it', () => {
  const block = html('```mermaid\ngraph TD\n  A --> B\n```');
  expect(sortedTags(block)).toMatch(
    /^<div class="dg" data-dg="[0-9a-f]{12}" data-line="1"><pre><code class="language-mermaid">graph TD\n {2}A --> B\n<\/code><\/pre><\/div>$/,
  );
  expect(block).not.toContain('class="code"');
});

test('inline code stays as it is', () => {
  expect(html('Press `Ctrl+R`.')).toBe('<p>Press <code>Ctrl+R</code>.</p>');
});

test('a block with a box character becomes a box diagram, with or without a word', () => {
  const diagram = html(`\`\`\`\n${ARCHITECTURE_DIAGRAM}\n\`\`\``);
  expect(diagram).toContain('<pre class="sbox box"><code>┌──');
  expect(copyButton(diagram)).toBe(copyButton(html(SH_BLOCK)));
  expect(html(`\`\`\`text\n${ARCHITECTURE_DIAGRAM}\n\`\`\``)).toContain('<pre class="sbox box"><code class="language-text">');
  const colored = html('```ts\n// ─── setup\nconst days = 14;\n```');
  expect(colored).toContain('<pre class="sbox box">');
  expect(colored).toContain('class="c"');
  expect(colored).toContain('<span class="k">const</span>');
});

test('the box characters run from U+2500 to U+257F', () => {
  expect(isBoxText('─')).toBe(true);
  expect(isBoxText('╿')).toBe(true);
  expect(isBoxText('▀')).toBe(false);
  expect(isBoxText('▶')).toBe(false);
  expect(isBoxText('+--+\n|  |')).toBe(false);
  expect(html('```\nA ▶ B\n```')).toContain('<pre class="sbox">');
});

test('a block in a fence shows only at the levels of the fence', () => {
  expect(html('::: internals\n```ts\nexport const days = 14;\n```\n:::')).toContain(
    '<div class="part" data-l="internals"><div class="bd">\n<div class="code">',
  );
});

test('a block in a list item or a quote gets the same box', () => {
  expect(html('- Run it:\n\n  ```sh\n  curl -X POST /restores\n  ```\n')).toContain(SH_CODE);
  expect(html('> ```sh\n> curl -X POST /restores\n> ```\n')).toContain(SH_CODE);
});

test('a raw pre with code gets the box, and a raw pre with no code stays', () => {
  expect(html('<pre class="note"><code>restore --from monday</code></pre>')).toContain(
    '<div class="code"><pre class="note sbox"><code>restore --from monday</code></pre><button',
  );
  const bare = html('<pre>┌─┐</pre>');
  expect(bare).toContain('<pre>┌─┐</pre>');
  expect(bare).not.toContain('class="code"');
});
