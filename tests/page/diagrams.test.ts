import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  BAD_MERMAID,
  badLine,
  badMermaidLine,
  diagramName,
  diagramSizeKey,
  drawKey,
  MERMAID_VERSION,
  needsDraw,
} from '../../src/page/diagrams.ts';
import { BROKEN_FLOW, RESTORE_FLOW } from '../support/diagrams.ts';
import { REPO } from '../support/run-command.ts';

const versionOf = (file: string) => (JSON.parse(readFileSync(join(REPO, file), 'utf8')) as { version: string }).version;

test('the name is the accTitle, or else the first word of the diagram', () => {
  expect(diagramName(RESTORE_FLOW)).toBe('Restore a file');
  expect(diagramName('flowchart TD\n  A --> B')).toBe('flowchart');
  expect(diagramName('%%{init: {"theme": "dark"}}%%\n%% A note\nsequenceDiagram\n  A->>B: hi')).toBe('sequenceDiagram');
  expect(diagramName('---\ntitle: Restore\nconfig:\n  layout: elk\n---\nflowchart LR\n  A --> B')).toBe('flowchart');
  expect(diagramName('pie title Restores by day')).toBe('pie');
  expect(diagramName('flowchart TD\n  accTitle:\n  A --> B')).toBe('flowchart');
  expect(diagramName('')).toBe('diagram');
});

test("the bad line adds the line of Mermaid's message to the fence line", () => {
  expect(badLine('Parse error on line 3:\n...', 5, BROKEN_FLOW)).toBe(8);
  const pie = 'pie title Restores by day\n  "Today" : 42\n  "Yesterday" 21';
  expect(badLine("Parsing failed:  Parse error on line 3, column 15: Expecting token of type ':' but found `21`.", 5, pie)).toBe(8);
  expect(badLine('No diagram type detected matching given configuration for text: flowchrt TD', 5, 'flowchrt TD')).toBe(5);
  // Mermaid names line 4 for a source of two lines and a line break that ends too soon.
  expect(badLine('Parse error on line 4:', 9, 'flowchart TD\n  A[Restore button] --> \n')).toBe(11);
});

test('the bad line counts the lines that Mermaid drops before it parses: front matter, directives and comments', () => {
  // Each message is the one that Mermaid 12.2.0 gives for the source.
  const front = '---\ntitle: Restore a file\nconfig:\n  layout: elk\n---\nflowchart TD\n  A --> B\n  B -->> C';
  expect(badLine('Parse error on line 3:', 3, front)).toBe(11);
  const directive = '%%{init: {"theme": "base"}}%%\nflowchart TD\n  A --> B\n  B -->> C';
  expect(badLine('Parse error on line 3:', 3, directive)).toBe(7);
  const comments = 'flowchart TD\n  A --> B\n\n  %% The restore ends here.\n  B -->> C';
  expect(badLine('Parse error on line 3:', 3, comments)).toBe(8);
  const pie = '%% Restores\npie title Restores by day\n  %% The last day\n  "Today" : 42\n  "Yesterday" 21';
  expect(badLine('Parsing failed:  Parse error on line 3, column 15: Expecting token of type', 3, pie)).toBe(8);
});

test('the problem line names the file and the line, in the terminal format', () => {
  expect(BAD_MERMAID).toBe('Bad Mermaid');
  expect(badMermaidLine('broken-files.md', 8)).toBe('Bad Mermaid: broken-files.md:8');
  expect(badMermaidLine(null, 8)).toBe('Bad Mermaid: 8');
});

test('a box draws when it has no drawing, a drawing of another look, or a tiny drawing on a full page', () => {
  const drawn = drawKey('im-in', 'dark', 'tiny');
  expect(drawn).toBe('im-in dark tiny');
  expect(needsDraw(null, 'im-in', 'dark', 'tiny')).toBe(true);
  expect(needsDraw(drawn, 'im-in', 'dark', 'tiny')).toBe(false);
  expect(needsDraw(drawn, 'im-in', 'light', 'tiny')).toBe(true);
  expect(needsDraw(drawn, 'themelessness', 'dark', 'tiny')).toBe(true);
  expect(needsDraw(drawn, 'im-in', 'dark', 'full')).toBe(true);
  expect(needsDraw(drawKey('im-in', 'dark', 'full'), 'im-in', 'dark', 'tiny')).toBe(false);
});

test('the size key holds the Mermaid version, the hash, the theme and the look', () => {
  expect(diagramSizeKey('3f2a9c01b7d4', 'im-in', 'dark')).toBe('mermaid 12.2.0 3f2a9c01b7d4 im-in dark');
});

test('the version is the installed one, pinned exactly', () => {
  const { devDependencies } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>;
  };
  expect(MERMAID_VERSION).toBe('12.2.0');
  expect(versionOf('node_modules/mermaid/package.json')).toBe(MERMAID_VERSION);
  expect(versionOf('node_modules/@mermaid-js/tiny/package.json')).toBe(MERMAID_VERSION);
  expect(devDependencies.mermaid).toBe(MERMAID_VERSION);
  expect(devDependencies['@mermaid-js/tiny']).toBe(MERMAID_VERSION);
});
