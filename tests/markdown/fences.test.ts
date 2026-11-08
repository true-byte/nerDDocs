import { expect, test } from '@playwright/test';
import { wrapFences } from '../../src/markdown/fences.ts';
import { FLOWS_IN_PART } from '../support/diagrams.ts';

const LISTED = ['overview', 'requirements', 'internals'];
const wrap = (file: string, listed: readonly string[] = LISTED) => wrapFences(file, listed).markdown;
const unknownIn = (file: string, listed: readonly string[] = LISTED) => wrapFences(file, listed).unknownLevels;

const opening = (levels: string) => `<div class="part" data-l="${levels}"><div class="bd">`;
const CLOSE = '</div></div>';

/** The level ids of each part that the file opens, in order. */
const partsOf = (file: string, listed: readonly string[] = LISTED) => [...wrap(file, listed).matchAll(/data-l="([^"]*)"/g)].map((match) => match[1]);

/** What each part holds, with no blank lines. */
function textOfParts(file: string): string[] {
  return wrap(file)
    .split(CLOSE)
    .slice(0, -1)
    .map((chunk) => chunk.slice(chunk.indexOf('<div class="bd">') + '<div class="bd">'.length).trim());
}

/** True when the line is in the Markdown with a blank line before and after it, so it renders as its own paragraph. */
function standsAlone(markdown: string, line: string): boolean {
  const lines = markdown.split('\n');
  const at = lines.indexOf(line);
  return at >= 0 && !lines[at - 1]?.trim() && !lines[at + 1]?.trim();
}

test('a file with no fence stays as written', () => {
  const file = '# Restore a file\n\nPick a file: any file.\n';
  expect(wrap(file)).toBe(file);
});

test('a fence turns into a wrapper with blank lines around it, so Markdown inside still renders', () => {
  expect(wrap('::: overview internals\nPick a *file*.\n:::\n')).toBe(
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
  const wrapped = wrap('::: overview\nPick a file.\n:::\nA restore never changes the copy.\n');
  expect(wrapped.indexOf(CLOSE)).toBeLessThan(wrapped.indexOf('A restore never'));
});

test('a closing fence with no open part stays text, as its own paragraph', () => {
  const wrapped = wrap('Pick a file.\n:::\nPick a day.\n');
  expect(standsAlone(wrapped, ':::')).toBe(true);
  expect(wrapped).not.toContain('</div>');
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

test('each output line names the line of the file that gave it', () => {
  const { markdown, fileLines } = wrapFences(FLOWS_IN_PART, LISTED);
  const lines = markdown.split('\n');
  expect(fileLines).toHaveLength(lines.length);
  const lineOf = (text: string) => lines.flatMap((line, at) => (line === text ? [fileLines[at]] : []));
  expect(lineOf('```mermaid')).toEqual([6, 12]);
  expect(lineOf('Text.')).toEqual([4]);
  expect(lineOf(opening('internals'))).toEqual([3]);
  expect(lineOf(CLOSE)).toEqual([10]);
});

test('a file with no fence maps each line to itself', () => {
  expect(wrapFences('# A\n\nB\r\nC', LISTED).fileLines).toEqual([1, 2, 3, 4]);
});

test('a byte order mark at the start of the file goes away, with or without a fence on the first line', () => {
  expect(partsOf('﻿::: overview\nPick a file.\n:::\n')).toEqual(['overview']);
  expect(wrap('﻿# Restore a file\n')).toBe('# Restore a file\n');
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
    expect(wrap(block)).toBe(block);
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
  const wrapped = wrap(file);
  expect(wrapped.indexOf('::: internals')).toBeLessThan(wrapped.indexOf(CLOSE));
  expect(wrapped.indexOf(CLOSE)).toBeLessThan(wrapped.indexOf('Shared text.'));
});

test('a code block still open at the end of the file ends there, and the part after it', () => {
  const wrapped = wrap('::: overview\n```sh\nrestore --from monday\n');
  expect(wrapped.lastIndexOf('```')).toBeGreaterThan(wrapped.indexOf('restore --from'));
  expect(wrapped.lastIndexOf('```')).toBeLessThan(wrapped.indexOf(CLOSE));
});

test('an open code block of tildes ends with its own mark and length', () => {
  const wrapped = wrap('::: overview\n~~~~\nrestore --from monday\n');
  expect(wrapped).toContain('restore --from monday\n\n~~~~\n');
});

test('a closed code block as the last thing in a part gets no second end mark', () => {
  const wrapped = wrap('::: overview\n```\nrestore\n```');
  expect(wrapped.match(/```/g)).toHaveLength(2);
});

test('a fence inside a raw HTML wrapper opens a part with blank lines, so the wrapper stays whole', () => {
  const wrapped = wrap('<details>\n::: overview\nPick a file.\n:::\n</details>\n');
  expect(wrapped).toBe(`<details>\n\n${opening('overview')}\n\nPick a file.\n\n${CLOSE}\n\n</details>\n`);
});

test.describe('a fence line with a word that the config does not list', () => {
  test('stays text as its own paragraph, opens no part and reports its word', () => {
    const file = 'Pick a file.\n::: testers\nPick a day.\n';
    expect(standsAlone(wrap(file), '::: testers')).toBe(true);
    expect(partsOf(file)).toEqual([]);
    expect(unknownIn(file)).toEqual(['testers']);
  });

  test('needs all its words listed, and reports only the words that are not', () => {
    const file = '::: overview testers\nPick a file.\n';
    expect(standsAlone(wrap(file), '::: overview testers')).toBe(true);
    expect(partsOf(file)).toEqual([]);
    expect(unknownIn(file)).toEqual(['testers']);
  });

  test('neither closes nor opens a part inside an open part', () => {
    const file = '::: overview\nPick a file.\n::: testers\nPick a day.\n:::\nShared text.\n';
    expect(partsOf(file)).toEqual(['overview']);
    const [text] = textOfParts(file);
    expect(text!.split(/\n\s*\n/)).toEqual(['Pick a file.', '::: testers', 'Pick a day.']);
    expect(wrap(file).indexOf(CLOSE)).toBeLessThan(wrap(file).indexOf('Shared text.'));
  });

  test('leaves the bare fence after it as text, as its own paragraph, since no part is open', () => {
    const wrapped = wrap('::: testers\nPick a file.\n:::\n');
    expect(standsAlone(wrapped, ':::')).toBe(true);
    expect(wrapped).not.toContain('</div>');
  });

  test('reports each word of each line', () => {
    expect(unknownIn('::: testers\nOne.\n\n::: managers writers\nTwo.\n')).toEqual(['testers', 'managers', 'writers']);
  });

  test('stays exactly as written and reports nothing when one of its words cannot be a level id', () => {
    for (const line of ['::: 10:30', '::: see src/restore.ts:41', '::: testers 10:30', '::: over"view']) {
      const file = `Pick a time.\n${line}\nPick a file.\n`;
      expect(wrap(file), line).toBe(file);
      expect(unknownIn(file), line).toEqual([]);
    }
  });

  for (const [name, block] of Object.entries({
    'a code block': '```\n::: testers\n```',
    'an indented code block': 'Run this:\n\n    ::: testers',
    'a raw pre block': '<pre>\n::: testers\n</pre>',
    'an HTML comment': '<!--\n::: testers\n-->',
  })) {
    test(`stays exactly as written and reports nothing in ${name}`, () => {
      expect(unknownIn(block)).toEqual([]);
      expect(wrap(block)).toBe(block);
    });
  }
});

test('with no listed ids, every fence line stays text as its own paragraph and nothing is reported', () => {
  const file = 'Pick a file.\n::: overview\nPick a day.\n:::\nPick a job.\n::: testers\nDone.\n';
  const wrapped = wrap(file, []);
  for (const line of ['::: overview', ':::', '::: testers']) expect(standsAlone(wrapped, line), line).toBe(true);
  expect(partsOf(file, [])).toEqual([]);
  expect(unknownIn(file, [])).toEqual([]);
});

test('with no listed ids, a line that a level id cannot make stays exactly as written', () => {
  const file = 'Pick a time.\n::: 10:30\nDone.\n';
  expect(wrap(file, [])).toBe(file);
  expect(unknownIn(file, [])).toEqual([]);
});

test('a file with no fence reports nothing', () => {
  expect(unknownIn('# Restore a file\n\nPick a file: any file.\n')).toEqual([]);
});

test('an escaped fence leaves the part open', () => {
  const file = '::: overview\nPick a file.\n\\:::\nPick a day.\n:::\nShared text.\n';
  const wrapped = wrap(file);
  expect(partsOf(file)).toEqual(['overview']);
  expect(wrapped.indexOf('Pick a day.')).toBeLessThan(wrapped.indexOf(CLOSE));
  expect(wrapped.indexOf(CLOSE)).toBeLessThan(wrapped.indexOf('Shared text.'));
});

test('an escaped fence with a word opens no part and reports nothing', () => {
  const file = '\\::: overview\nPick a file.\n\n\\::: testers\nPick a day.\n';
  expect(partsOf(file)).toEqual([]);
  expect(unknownIn(file)).toEqual([]);
});
