import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { diagramHash } from '../../src/markdown/diagrams.ts';
import { renderMarkdown } from '../../src/markdown/render.ts';
import { FLOWS_IN_PART, hashOf, mermaidBlock, mermaidFenceLines, RESTORE_MAP, SHORT_FLOW } from '../support/diagrams.ts';
import { attributesOf, sortedTags } from '../support/html.ts';
import { fakeFiles } from '../support/images.ts';

const LISTED = ['overview', 'requirements', 'internals'];

const render = (source: string, page = 'user-flows.md') =>
  renderMarkdown(source, '/user-flows.html', 'User flows', LISTED, fakeFiles({}, page));

/** The block of a two-node flowchart. */
const FLOW = mermaidBlock(SHORT_FLOW);

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

/** The attributes of each diagram box of the HTML, in page order. */
const boxesIn = (html: string) => [...html.matchAll(/<div\b[^>]*\sclass="dg"[^>]*>/g)].map(([tag]) => attributesOf(tag));

const expectSameHtml = (html: string, expected: string) => expect(sortedTags(html)).toBe(sortedTags(expected));

test('a Mermaid block becomes a box around its source, with its hash, file and fence line', () => {
  const page = render(`# User flows\n\n${FLOW}`);
  expectSameHtml(
    page.html,
    `<div class="dg" data-dg="${sha1(SHORT_FLOW).slice(0, 12)}" data-file="user-flows.md" data-line="3"><pre><code class="language-mermaid">${SHORT_FLOW}\n</code></pre></div>`,
  );
  expect(page.diagrams).toBe('tiny');
});

test('a Mermaid block gets no code box, no copy icon and no colors', () => {
  const { html } = render(`# User flows\n\n${FLOW}`);
  expect(boxesIn(html)).toHaveLength(1);
  for (const unwanted of ['class="code"', 'sbox', 'copy', '<span']) expect(html).not.toContain(unwanted);
});

test('the hash is the sha1 of the source, and one source gives one hash', () => {
  const source = 'flowchart TD\n  A --> B';
  expect(diagramHash(source)).toBe(sha1(source).slice(0, 12));
  expect(diagramHash(`${source}\n`)).toBe(diagramHash(source));

  const twice = boxesIn(render(`# User flows\n\n${FLOW}\n\n${FLOW}\n\n${mermaidBlock(source)}`).html);
  expect(twice.map((box) => box['data-dg'])).toEqual([hashOf(SHORT_FLOW), hashOf(SHORT_FLOW), hashOf(source)]);
  expect(hashOf(SHORT_FLOW)).not.toBe(hashOf(source));
});

test('the fence line is the line of the file through a part, CRLF and a byte order mark', () => {
  expect(mermaidFenceLines(FLOWS_IN_PART)).toEqual([6, 12]);
  const lines = (source: string) => boxesIn(render(source).html).map((box) => box['data-line']);
  expect(lines(FLOWS_IN_PART)).toEqual(['6', '12']);
  expect(lines(FLOWS_IN_PART.replace(/\n/g, '\r\n'))).toEqual(['6', '12']);
  expect(lines(`﻿${FLOWS_IN_PART}`)).toEqual(['6', '12']);
});

test('a block in a list item or a quote keeps its fence line', () => {
  const lineOf = (source: string) => boxesIn(render(source).html).map((box) => box['data-line']);
  expect(lineOf('- Steps\n\n  ```mermaid\n  pie\n  "Today" : 42\n  ```')).toEqual(['3']);
  expect(lineOf('> ```mermaid\n> pie\n> ```')).toEqual(['1']);
});

test('a tilde fence and a capital word make a box too', () => {
  expect(boxesIn(render(`# User flows\n\n~~~mermaid\n${SHORT_FLOW}\n~~~`).html)).toHaveLength(1);
  expect(boxesIn(render(`# User flows\n\n\`\`\`Mermaid\n${SHORT_FLOW}\n\`\`\``).html)).toHaveLength(1);
});

test('a block in a fence sits in its part', () => {
  const html = sortedTags(render(`# User flows\n\n::: internals\n${FLOW}\n:::`).html);
  expect(html).toContain(`<div class="part" data-l="internals"><div class="bd"><div class="dg" data-dg="${hashOf(SHORT_FLOW)}"`);
});

test('with no files the box has no file', () => {
  const { html } = renderMarkdown(`# User flows\n\n${FLOW}`, '/user-flows.html', 'User flows', LISTED);
  expect(boxesIn(html)).toEqual([{ class: 'dg', 'data-dg': hashOf(SHORT_FLOW), 'data-line': '3' }]);
});

test('the build is none, tiny or full by the sources of the blocks', () => {
  const build = (source: string) => render(`# User flows\n\n${source}\n`).diagrams;

  expect(build('A user starts a restore.')).toBe('none');
  expect(build(FLOW)).toBe('tiny');
  for (const full of [
    RESTORE_MAP,
    'architecture-beta\n  service db(database)[Storage]',
    '---\nconfig:\n  layout: elk\n---\nflowchart LR\n  A --> B',
    '%%{init: {"layout": "elk.stress"}}%%\nflowchart LR\n  A --> B',
    '%% The restore\nmindmap\n  root((Restore))',
    'flowchart-elk TD\n  A --> B',
    'flowchart LR\n  A["$$x^2$$"] --> B',
  ]) {
    expect(build(mermaidBlock(full)), full).toBe('full');
  }
  // A word in a label is no type and no layout.
  for (const tiny of [
    'flowchart TD\n  A[Software architecture] --> B[Restored file]',
    'flowchart TD\n  A[Selkirk office] --> B[Elk Grove office]',
    'sequenceDiagram\n  Agent->>Server: Send the mindmap',
  ]) {
    expect(build(mermaidBlock(tiny)), tiny).toBe('tiny');
  }
  expect(build(`A mindmap of the restore.\n\n${FLOW}`)).toBe('tiny');
  expect(build(`\`\`\`ts\nconst mindmap = 'Restore';\n\`\`\`\n\n${FLOW}`)).toBe('tiny');
  expect(build('A mindmap of the restore.')).toBe('none');
  expect(build("```ts\nconst mindmap = 'Restore';\n```")).toBe('none');
});
