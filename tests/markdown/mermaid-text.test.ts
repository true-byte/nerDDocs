import { expect, test } from '@playwright/test';
import { mermaidText } from '../../src/markdown/mermaid-text.ts';
import { SHORT_FLOW } from '../support/diagrams.ts';

test('a source with nothing to drop is the text, one line for each line', () => {
  expect(mermaidText(SHORT_FLOW)).toEqual({ text: SHORT_FLOW, lines: [1, 2], frontMatter: null, directives: [] });
  expect(mermaidText(`${SHORT_FLOW}\r\n`)).toEqual({ text: `${SHORT_FLOW}\n`, lines: [1, 2, 3], frontMatter: null, directives: [] });
  expect(mermaidText('').lines).toEqual([]);
});

test('the front matter goes with the blank lines after it, and gives its body', () => {
  const source = `---\ntitle: Restore a file\nconfig:\n  layout: elk\n---\n\n${SHORT_FLOW}`;
  expect(mermaidText(source)).toEqual({
    text: SHORT_FLOW,
    lines: [7, 8],
    frontMatter: 'title: Restore a file\nconfig:\n  layout: elk',
    directives: [],
  });
  expect(mermaidText(`  ---\n  title: Restore\n  ---\n${SHORT_FLOW}`).lines).toEqual([4, 5]);
  expect(mermaidText(`---\n${SHORT_FLOW}`).frontMatter, 'no closing line').toBeNull();
});

test('a directive goes and leaves its line, unless it starts the text', () => {
  const directive = '%%{init: {"layout": "elk"}}%%';
  expect(mermaidText(`${directive}\n${SHORT_FLOW}`)).toEqual({ text: SHORT_FLOW, lines: [2, 3], frontMatter: null, directives: [directive] });
  const inside = mermaidText(`flowchart TD\n  ${directive}\n  A --> B`);
  expect(inside.text).toBe('flowchart TD\n  \n  A --> B');
  expect(inside.lines).toEqual([1, 2, 3]);
});

test('a comment line goes with the blank lines before it', () => {
  const { text, lines } = mermaidText('%% The restore\nflowchart TD\n  A --> B\n\n  %% The end\n  B --> C');
  expect(text).toBe('flowchart TD\n  A --> B\n  B --> C');
  expect(lines).toEqual([2, 3, 6]);
});
