import { expect, test } from '@playwright/test';
import { wrapFences } from '../../src/markdown/fences.ts';

const opening = (levels: string) => `<div class="part" data-l="${levels}"><div class="bd">`;
const CLOSE = '</div></div>';

/** The level ids of each part that the file opens, in order. */
const partsOf = (file: string) => [...wrapFences(file).matchAll(/data-l="([^"]*)"/g)].map((match) => match[1]);

/** What each part holds, with no blank lines. */
function textOfParts(file: string): string[] {
  return wrapFences(file)
    .split(CLOSE)
    .slice(0, -1)
    .map((chunk) => chunk.slice(chunk.indexOf('<div class="bd">') + '<div class="bd">'.length).trim());
}

test('a file with no fence stays as written', () => {
  const file = '# Restore a file\n\nPick a file: any file.\n';
  expect(wrapFences(file)).toBe(file);
});

test('a fence turns into a wrapper with blank lines around it, so Markdown inside still renders', () => {
  expect(wrapFences('::: overview internals\nPick a *file*.\n:::\n')).toBe(
    `\n${opening('overview internals')}\n\nPick a *file*.\n\n${CLOSE}\n\n`,
  );
});

test('a new opening fence closes the part before it', () => {
  const file = '::: overview\nPick a file.\n::: internals\nA restore is a job.\n:::\n';
  expect(partsOf(file)).toEqual(['overview', 'internals']);
  expect(textOfParts(file)).toEqual(['Pick a file.', 'A restore is a job.']);
});

test('the end of the file closes an open part', () => {
  expect(textOfParts('::: overview\nPick a file.')).toEqual(['Pick a file.']);
});

test('text after a closing fence stays outside the part', () => {
  const wrapped = wrapFences('::: overview\nPick a file.\n:::\nA restore never changes the copy.\n');
  expect(wrapped.indexOf(CLOSE)).toBeLessThan(wrapped.indexOf('A restore never'));
});

test('a closing fence with no open part stays text', () => {
  expect(wrapFences('Pick a file.\n\n:::\n')).toBe('Pick a file.\n\n:::\n');
});

test('a part with no text makes no wrapper', () => {
  expect(partsOf('::: overview\n\n::: internals\nA restore is a job.\n:::\n')).toEqual(['internals']);
  expect(partsOf('::: overview\n\n\n:::\n')).toEqual([]);
});

test('a fence allows at most three spaces before it, and any spaces between its ids', () => {
  expect(partsOf('   ::: overview \t internals  \nPick a file.\n   :::  \n')).toEqual(['overview internals']);
  expect(partsOf('    ::: overview\n')).toEqual([]);
});

test('an id named twice in a fence counts once', () => {
  expect(partsOf('::: overview overview\nPick a file.\n')).toEqual(['overview']);
});

test('a line that a level id cannot make stays text', () => {
  for (const line of [':::overview', '::: over"view', "::: over'view", ':::: overview', 'text ::: overview']) {
    expect(partsOf(`${line}\nPick a file.\n`), line).toEqual([]);
  }
});

test('Windows and old Mac line ends read as line ends', () => {
  expect(partsOf('::: overview\r\nPick a file.\r\n:::\r\n')).toEqual(['overview']);
  expect(partsOf('::: overview\rPick a file.\r:::\r')).toEqual(['overview']);
});

test('a byte order mark at the start of the file goes away, with or without a fence on the first line', () => {
  expect(partsOf('﻿::: overview\nPick a file.\n:::\n')).toEqual(['overview']);
  expect(wrapFences('﻿# Restore a file\n')).toBe('# Restore a file\n');
});

for (const [name, block] of Object.entries({
  'a code block': '```\n::: internals\n:::\n```',
  'a code block of tildes': '~~~md\n::: internals\n:::\n~~~',
  'a longer code fence that holds a shorter one': '````\n```\n::: internals\n```\n````',
  'an indented code block': 'Run this:\n\n    ::: internals\n    :::',
  'a code block under a list marker': '- ```\n  ::: internals\n  :::\n  ```',
  'a code block under a number marker': '1. ~~~\n   ::: internals\n   ~~~',
  'a code block in a list item': '- Run this:\n\n  ```\n  ::: internals\n  ```',
  'a code block in a quote': '> ```\n> ::: internals\n> ```',
  'a raw pre block': '<pre>\n::: internals\n:::\n</pre>',
  'a raw script block': '<script>\n::: internals\n</script>',
  'a raw style block': '<style>\n::: internals\n</style>',
  'a raw textarea block': '<textarea>\n::: internals\n</textarea>',
  'an HTML comment': '<!--\n::: internals\n-->',
})) {
  test(`a fence line in ${name} stays text`, () => {
    expect(partsOf(block)).toEqual([]);
    expect(wrapFences(block)).toBe(block);
  });

  test(`the fence after ${name} still opens a part`, () => {
    expect(partsOf(`${block}\n\n::: overview\nPick a file.\n:::\n`)).toEqual(['overview']);
  });
}

test('a raw block that ends on its first line leaves the next fence a fence', () => {
  expect(partsOf('<pre>one line</pre>\n\n::: overview\nPick a file.\n')).toEqual(['overview']);
});

test('a code block inside a part keeps its fence lines as text and the part closes after it', () => {
  const file = '::: overview\n```\n:::\n::: internals\n```\n:::\n\nShared text.\n';
  expect(partsOf(file)).toEqual(['overview']);
  const wrapped = wrapFences(file);
  expect(wrapped.indexOf('::: internals')).toBeLessThan(wrapped.indexOf(CLOSE));
  expect(wrapped.indexOf(CLOSE)).toBeLessThan(wrapped.indexOf('Shared text.'));
});

test('a code block still open at the end of the file ends there, and the part after it', () => {
  const wrapped = wrapFences('::: overview\n```sh\nrestore --from monday\n');
  expect(wrapped.lastIndexOf('```')).toBeGreaterThan(wrapped.indexOf('restore --from'));
  expect(wrapped.lastIndexOf('```')).toBeLessThan(wrapped.indexOf(CLOSE));
});

test('an open code block of tildes ends with its own mark and length', () => {
  const wrapped = wrapFences('::: overview\n~~~~\nrestore --from monday\n');
  expect(wrapped).toContain('restore --from monday\n\n~~~~\n');
});

test('a closed code block as the last thing in a part gets no second end mark', () => {
  const wrapped = wrapFences('::: overview\n```\nrestore\n```');
  expect(wrapped.match(/```/g)).toHaveLength(2);
});

test('a fence inside a raw HTML wrapper opens a part with blank lines, so the wrapper stays whole', () => {
  const wrapped = wrapFences('<details>\n::: overview\nPick a file.\n:::\n</details>\n');
  expect(wrapped).toBe(`<details>\n\n${opening('overview')}\n\nPick a file.\n\n${CLOSE}\n\n</details>\n`);
});
