import { expect, test } from '@playwright/test';
import {
  DEFAULT_TEXT_WIDTH,
  DEFAULT_WORDS_PER_MINUTE,
  EMPTY_CONFIG,
  isLevelId,
  parseConfig,
  siteLevels,
  type Config,
} from '../../src/site/config.ts';

const CONFIG_PATH = '/docs/nerddocs.json';

/** The levels of a site, with each line that the terminal would print. */
function levelsOf(config: Config, pages: Record<string, string[]> = {}) {
  const lines: string[] = [];
  const list = Object.entries(pages).map(([path, unknownLevels]) => ({ path, unknownLevels }));
  return { ...siteLevels(config, CONFIG_PATH, list, (line) => lines.push(line)), lines };
}

test('a config gives its levels and its default level', () => {
  const file = JSON.stringify({
    levels: [{ id: 'overview', name: 'Overview', icon: 'eye' }, { id: 'internals' }],
    defaultLevel: 'internals',
  });
  expect(parseConfig(file)).toEqual({
    levels: [{ id: 'overview', name: 'Overview', icon: 'eye' }, { id: 'internals' }],
    defaultLevel: 'internals',
  });
});

test('every key of a config is optional, and an empty file is an empty config', () => {
  expect(parseConfig('')).toEqual(EMPTY_CONFIG);
  expect(parseConfig(' \n\t')).toEqual(EMPTY_CONFIG);
  expect(parseConfig('{}')).toEqual({ levels: [], defaultLevel: undefined });
  expect(parseConfig('{"defaultLevel":"overview"}')).toEqual({ levels: [], defaultLevel: 'overview' });
});

test('`"levels": false` is a config with no levels', () => {
  expect(parseConfig('{"levels":false}')).toEqual({ levels: [] });
});

for (const [name, rest] of Object.entries({
  'no default level': '',
  'a default level that is not text': ',"defaultLevel":7',
  'an empty default level': ',"defaultLevel":""',
  'an unknown default level': ',"defaultLevel":"testers"',
})) {
  test(`\`"levels": false\` and \`"levels": []\` give the same result with ${name}`, () => {
    const off = parseConfig(`{"levels":false${rest}}`);
    expect(off).toEqual(parseConfig(`{"levels":[]${rest}}`));
    if (off) {
      const lines = levelsOf(off);
      expect(lines).toEqual(levelsOf(parseConfig(`{"levels":[]${rest}}`)!));
    }
  });
}

test('a config with a byte order mark at its start reads', () => {
  expect(parseConfig('﻿{"levels":[{"id":"overview"}]}')?.levels).toEqual([{ id: 'overview' }]);
  expect(parseConfig('﻿')).toEqual(EMPTY_CONFIG);
});

test('a key that nerDDocs does not know changes nothing', () => {
  expect(parseConfig('{"theme":"dark","levels":[{"id":"overview","color":"red"}]}')?.levels).toEqual([
    { id: 'overview', color: 'red' },
  ]);
});

for (const [problem, file] of Object.entries({
  'text that is not JSON': '{levels:',
  'a list at the top': '[]',
  'a value at the top': '3',
  'null at the top': 'null',
  'levels that are not a list': '{"levels":"overview"}',
  'levels that are true': '{"levels":true}',
  'levels that are null': '{"levels":null}',
  'a level that is not an object': '{"levels":["overview"]}',
  'a level that is null': '{"levels":[null]}',
  'a level with no id': '{"levels":[{"name":"Overview"}]}',
  'a level id that is not text': '{"levels":[{"id":3}]}',
  'an empty level id': '{"levels":[{"id":""}]}',
  'a level id with a space': '{"levels":[{"id":"over view"}]}',
  'a level id with a quote': '{"levels":[{"id":"over\\"view"}]}',
  'a level name that is not text': '{"levels":[{"id":"overview","name":3}]}',
  'an empty level name': '{"levels":[{"id":"overview","name":""}]}',
  'an icon that is not text': '{"levels":[{"id":"overview","icon":true}]}',
  'an empty icon': '{"levels":[{"id":"overview","icon":""}]}',
  'a level id listed twice': '{"levels":[{"id":"overview"},{"id":"overview"}]}',
  'a default level that is not text': '{"defaultLevel":1}',
  'an empty default level': '{"defaultLevel":""}',
  'a speed of 0': '{"wordsPerMinute":0}',
  'a speed below 0': '{"wordsPerMinute":-238}',
  'a speed that is text': '{"wordsPerMinute":"238"}',
  'a speed that is null': '{"wordsPerMinute":null}',
  'a speed that is true': '{"wordsPerMinute":true}',
  'a speed that is a list': '{"wordsPerMinute":[238]}',
  'a speed too large to be finite': '{"wordsPerMinute":1e999}',
  'a text width of 0': '{"textWidth":0}',
  'a text width below 0': '{"textWidth":-1}',
  'a text width that is text': '{"textWidth":"75"}',
  'a text width that is null': '{"textWidth":null}',
  'a text width that is true': '{"textWidth":true}',
  'a text width that is a list': '{"textWidth":[75]}',
  'a text width that is an object': '{"textWidth":{"chars":75}}',
  'a text width too large to be finite': '{"textWidth":1e999}',
  'a text width too far below 0 to be finite': '{"textWidth":-1e999}',
})) {
  test(`${problem} makes a bad config`, () => {
    expect(parseConfig(file)).toBeNull();
  });
}

test('the default speed is 238 words a minute', () => {
  expect(DEFAULT_WORDS_PER_MINUTE).toBe(238);
});

test('a speed in the config is kept, and a config with no speed has no such key', () => {
  expect(parseConfig('{"wordsPerMinute":300}')).toEqual({ levels: [], defaultLevel: undefined, wordsPerMinute: 300 });
  expect(parseConfig('{"levels":false,"wordsPerMinute":0.5}')?.wordsPerMinute).toBe(0.5);
  expect(parseConfig('{"levels":[{"id":"overview"}]}')).not.toHaveProperty('wordsPerMinute');
  expect(parseConfig('{}')).not.toHaveProperty('wordsPerMinute');
  expect(parseConfig('')).not.toHaveProperty('wordsPerMinute');
});

test('the default text width is 75 characters', () => {
  expect(DEFAULT_TEXT_WIDTH).toBe(75);
});

test('a text width in the config is kept, and a config with no text width has no such key', () => {
  expect(parseConfig('{"textWidth":75}')).toEqual({ levels: [], defaultLevel: undefined, textWidth: 75 });
  expect(parseConfig('{"levels":false,"textWidth":60.5}')?.textWidth).toBe(60.5);
  expect(parseConfig('{"textWidth":90,"wordsPerMinute":300}')).toEqual({
    levels: [],
    defaultLevel: undefined,
    textWidth: 90,
    wordsPerMinute: 300,
  });
  expect(parseConfig('{"levels":[{"id":"overview"}]}')).not.toHaveProperty('textWidth');
  expect(parseConfig('{"wordsPerMinute":300}')).not.toHaveProperty('textWidth');
  expect(parseConfig('{}')).not.toHaveProperty('textWidth');
  expect(parseConfig('')).not.toHaveProperty('textWidth');
});

test('a level id holds letters of any language, digits, marks and dots, and no space or quote', () => {
  for (const id of ['overview', 'high-school', 'level_2', 'v1.2', 'übersicht', '概要', '_']) {
    expect(isLevelId(id), id).toBe(true);
  }
  for (const id of ['', 'a b', 'a\tb', 'a"b', "a'b", 'a]b', 'a=b']) {
    expect(isLevelId(id), id).toBe(false);
  }
});

test('the levels are the levels of the config, in their order, and a word on a page adds none', () => {
  const { levels } = levelsOf(
    { levels: [{ id: 'internals' }, { id: 'overview' }] },
    { '/docs/restore.md': ['testers'], '/docs/storage.md': ['managers', 'testers'] },
  );
  expect(levels.map((level) => level.id)).toEqual(['internals', 'overview']);
});

test('a level name comes from the config, or else from its id', () => {
  const { levels } = levelsOf({ levels: [{ id: 'overview', name: 'The short read' }, { id: 'high-school' }, { id: '_' }] });
  expect(levels.map((level) => level.name)).toEqual(['The short read', 'High school', '_']);
});

test('a config with no levels gives a site with no levels and no default level', () => {
  expect(levelsOf(EMPTY_CONFIG)).toEqual({ levels: [], defaultLevel: '', lines: [] });
  expect(levelsOf({ levels: [] }, { '/docs/restore.md': [] })).toEqual({ levels: [], defaultLevel: '', lines: [] });
});

test('an icon from the set shows, and any other icon reports its line and leaves the default icon', () => {
  const { levels, lines } = levelsOf({
    levels: [
      { id: 'overview', icon: 'eye' },
      { id: 'internals', icon: 'rocket' },
      { id: 'testers', icon: 'constructor' },
    ],
  });
  expect(levels).toEqual([
    { id: 'overview', name: 'Overview', icon: 'eye' },
    { id: 'internals', name: 'Internals' },
    { id: 'testers', name: 'Testers' },
  ]);
  expect(lines).toEqual([`Unknown icon: rocket ${CONFIG_PATH}`, `Unknown icon: constructor ${CONFIG_PATH}`]);
});

test('a word that the config does not list reports its line for each page, and is no level', () => {
  const { levels, lines } = levelsOf(
    { levels: [{ id: 'overview' }] },
    { '/docs/restore.md': ['internals', 'testers'], '/docs/storage.md': ['internals'] },
  );
  expect(levels.map((level) => level.id)).toEqual(['overview']);
  expect(lines).toEqual([
    'Unknown level: internals /docs/restore.md',
    'Unknown level: testers /docs/restore.md',
    'Unknown level: internals /docs/storage.md',
  ]);
});

test('the default level comes from the config', () => {
  const levels = [{ id: 'overview' }, { id: 'internals' }];
  expect(levelsOf({ levels, defaultLevel: 'internals' }).defaultLevel).toBe('internals');
  expect(levelsOf({ levels }).defaultLevel).toBe('overview');
});

test('an unknown default level reports its line, and the first level is the default', () => {
  const { defaultLevel, lines } = levelsOf({ levels: [{ id: 'overview' }, { id: 'internals' }], defaultLevel: 'testers' });
  expect(defaultLevel).toBe('overview');
  expect(lines).toEqual([`Unknown level: testers ${CONFIG_PATH}`]);
});
