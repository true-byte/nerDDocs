import { expect, test } from '@playwright/test';
import { parseMarkdown, processor } from '../../src/markdown/parse.ts';

test('a Markdown text parses into hast, with its raw HTML and its tables', () => {
  const root = parseMarkdown('Pick **a** day.\n\n<p class="api-sum">Start a restore</p>\n\n| Plan |\n|---|\n| Team |\n');
  expect(root.type).toBe('root');
  const html = processor.stringify(root);
  expect(html).toContain('<p>Pick <strong>a</strong> day.</p>');
  expect(html).toContain('<p class="api-sum">Start a restore</p>');
  expect(html).toMatch(/<table>[\s\S]*<td>Team<\/td>/);
});
