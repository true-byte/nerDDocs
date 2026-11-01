import { expect, test } from '@playwright/test';
import { EMPTY_CONFIG, isLevelId, parseConfig, siteLevels, type Config } from '../../src/site/config.ts';

const CONFIG_PATH = '/docs/nerddocs.json';

/** The levels of a site, with each line that the terminal would print. */
function levelsOf(config: Config, pages: Record<string, string[]> = {}) {
  const lines: string[] = [];
  const list = Object.entries(pages).map(([path, levelIds]) => ({ path, levelIds }));
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
})) {
  test(`${problem} makes a bad config`, () => {
    expect(parseConfig(file)).toBeNull();
  });
}

test('a level id holds letters of any language, digits, marks and dots, and no space or quote', () => {
  for (const id of ['overview', 'high-school', 'level_2', 'v1.2', 'übersicht', '概要', '_']) {
    expect(isLevelId(id), id).toBe(true);
  }
  for (const id of ['', 'a b', 'a\tb', 'a"b', "a'b", 'a]b', 'a=b']) {
    expect(isLevelId(id), id).toBe(false);
  }
});

test('the levels of the config come first in their order, then each other id in order of first use', () => {
  const { levels } = levelsOf(
    { levels: [{ id: 'internals' }, { id: 'overview' }] },
    { '/docs/restore.md': ['overview', 'testers'], '/docs/storage.md': ['managers', 'testers', 'internals'] },
  );
  expect(levels.map((level) => level.id)).toEqual(['internals', 'overview', 'testers', 'managers']);
});

test('a level name comes from the config, or else from its id', () => {
  const { levels } = levelsOf(
    { levels: [{ id: 'overview', name: 'The short read' }, { id: 'high-school' }, { id: '_' }] },
    { '/docs/restore.md': ['third_grade'] },
  );
  expect(levels.map((level) => level.name)).toEqual(['The short read', 'High school', '_', 'Third grade']);
});

test('a site with no config takes its levels from its pages and reports no problem', () => {
  const { levels, defaultLevel, lines } = levelsOf(EMPTY_CONFIG, { '/docs/restore.md': ['overview', 'internals'] });
  expect(levels).toEqual([
    { id: 'overview', name: 'Overview' },
    { id: 'internals', name: 'Internals' },
  ]);
  expect(defaultLevel).toBe('overview');
  expect(lines).toEqual([]);
});

test('a site with no levels has no default level', () => {
  expect(levelsOf(EMPTY_CONFIG)).toEqual({ levels: [], defaultLevel: '', lines: [] });
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

test('an id that the config does not list reports its line and still shows as a level', () => {
  const { levels, lines } = levelsOf(
    { levels: [{ id: 'overview' }] },
    { '/docs/restore.md': ['overview', 'internals'], '/docs/storage.md': ['internals'] },
  );
  expect(levels.map((level) => level.id)).toEqual(['overview', 'internals']);
  expect(lines).toEqual(['Unknown level: internals /docs/restore.md', 'Unknown level: internals /docs/storage.md']);
});

test('the default level comes from the config, and also can be a level that only pages use', () => {
  const levels = [{ id: 'overview' }, { id: 'internals' }];
  expect(levelsOf({ levels, defaultLevel: 'internals' }).defaultLevel).toBe('internals');
  const fromPage = levelsOf({ levels: [], defaultLevel: 'internals' }, { '/docs/restore.md': ['overview', 'internals'] });
  expect(fromPage.defaultLevel).toBe('internals');
  expect(fromPage.lines).toEqual([]);
});

test('an unknown default level reports its line, and the first level is the default', () => {
  const { defaultLevel, lines } = levelsOf({ levels: [{ id: 'overview' }, { id: 'internals' }], defaultLevel: 'testers' });
  expect(defaultLevel).toBe('overview');
  expect(lines).toEqual([`Unknown level: testers ${CONFIG_PATH}`]);
});
