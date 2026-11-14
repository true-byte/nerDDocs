import { expect, test } from '@playwright/test';
import type { Level } from '../../src/site/config.ts';
import { IMAGE_SECONDS, readRows, secondsOf } from '../../src/site/read-time.ts';
import type { Page } from '../../src/site/scan.ts';

const LEVELS: Level[] = [
  { id: 'overview', name: 'Overview' },
  { id: 'internals', name: 'Internals' },
];

/** At this speed one word takes one second. */
const WPM = 60;

/** A page with the given words at each entry, shared text and parts at both levels. */
function pageOf(words: Record<string, number>, more: Partial<Page> = {}): Page {
  return {
    url: '/restore.html',
    source: '',
    title: 'Restore',
    titleId: 'restore',
    html: '',
    unknownLevels: [],
    parts: ['overview', 'internals'],
    hasShared: true,
    hasSharedText: true,
    sizes: Object.fromEntries(Object.entries(words).map(([id, count]) => [id, { words: count, images: 0 }])),
    outline: [],
    uses: [],
    problems: [],
    diagrams: 'none',
    anchors: {},
    links: [],
    search: [],
    elementIds: [],
    linkSpots: [],
    ...more,
  };
}

const atBoth = (overview: number, internals: number) => pageOf({ overview, internals });

test('the seconds of a size come from its words at the speed and its images, with no rounding', () => {
  expect(IMAGE_SECONDS).toBe(12);
  expect(secondsOf({ words: 238, images: 0 }, 238)).toBe(60);
  expect(secondsOf({ words: 1, images: 0 }, 120)).toBe(0.5);
  expect(secondsOf({ words: 0, images: 2 }, 238)).toBe(24);
  expect(secondsOf({ words: 119, images: 1 }, 238)).toBe(42);
  expect(secondsOf({ words: 0, images: 0 }, 238)).toBe(0);
});

test('minutes round up, and no text gives 0', () => {
  for (const [words, minutes] of [
    [0, 0],
    [1, 1],
    [60, 1],
    [61, 2],
    [120, 2],
  ] as const) {
    const page = atBoth(words, words);
    expect(readRows({ pages: [page], wordsPerMinute: WPM }, LEVELS, page)[0], `${words} words`).toEqual({
      level: 'overview',
      page: minutes,
      all: minutes,
    });
  }
});

test('images count in the minutes', () => {
  const page = pageOf({}, { sizes: { overview: { words: 0, images: 5 }, internals: { words: 0, images: 6 } } });
  expect(readRows({ pages: [page], wordsPerMinute: WPM }, LEVELS, page)).toEqual([
    { level: 'overview', page: 1, all: 1 },
    { level: 'internals', page: 2, all: 2 },
  ]);
});

test('there is one row per level, in the order of the levels', () => {
  const page = atBoth(60, 120);
  const rows = readRows({ pages: [page], wordsPerMinute: WPM }, [...LEVELS].reverse(), page);
  expect(rows.map((row) => row.level)).toEqual(['internals', 'overview']);
});

test('the speed sets the minutes', () => {
  const page = atBoth(120, 120);
  expect(readRows({ pages: [page], wordsPerMinute: 30 }, LEVELS, page)[0]).toEqual({ level: 'overview', page: 4, all: 4 });
});

test("'All pages' sums the seconds of all pages, then rounds up once", () => {
  const pages = [atBoth(30, 61), atBoth(30, 61), atBoth(30, 61)];
  expect(readRows({ pages, wordsPerMinute: WPM }, LEVELS, pages[0])).toEqual([
    { level: 'overview', page: 1, all: 2 },
    { level: 'internals', page: 2, all: 4 },
  ]);
});

test("'All pages' stays on the minute when the seconds of the pages sum to a whole minute", () => {
  const pages = [atBoth(33, 33), atBoth(66, 66), atBoth(139, 139)];
  expect(readRows({ pages, wordsPerMinute: 238 }, LEVELS, undefined)[0]).toEqual({ level: 'overview', page: 0, all: 1 });
});

test("a hollow level counts 0 on 'This page' and in 'All pages'", () => {
  // Words of a shared heading can sit at a level with no part.
  const hollow = pageOf({ overview: 60, internals: 600 }, { parts: ['overview'], hasSharedText: false });
  const other = atBoth(60, 60);
  expect(readRows({ pages: [hollow, other], wordsPerMinute: WPM }, LEVELS, hollow)).toEqual([
    { level: 'overview', page: 1, all: 2 },
    { level: 'internals', page: 0, all: 1 },
  ]);
});

test('a level with no part counts on a page with shared text, and on a page with no parts', () => {
  const shared = pageOf({ overview: 60, internals: 60 }, { parts: ['overview'], hasSharedText: true });
  const flat = pageOf({ overview: 60, internals: 60 }, { parts: [], hasSharedText: false });
  expect(readRows({ pages: [shared, flat], wordsPerMinute: WPM }, LEVELS, flat)).toEqual([
    { level: 'overview', page: 1, all: 2 },
    { level: 'internals', page: 1, all: 2 },
  ]);
});

test("a site with fewer than two levels gives one row with level '', from the entry with no level rule", () => {
  const page = pageOf({ '': 120, overview: 60 });
  const other = pageOf({ '': 60, overview: 60 });
  expect(readRows({ pages: [page, other], wordsPerMinute: WPM }, [], page)).toEqual([{ level: '', page: 2, all: 3 }]);
});

test('with no page, each row has 0 on the page and keeps the time of all pages', () => {
  const page = pageOf({ '': 120, overview: 60, internals: 180 });
  const pages = [page];
  expect(readRows({ pages, wordsPerMinute: WPM }, LEVELS, undefined)).toEqual([
    { level: 'overview', page: 0, all: 1 },
    { level: 'internals', page: 0, all: 3 },
  ]);
  expect(readRows({ pages, wordsPerMinute: WPM }, [], undefined)).toEqual([{ level: '', page: 0, all: 2 }]);
});

test('a site with no pages gives rows of 0', () => {
  expect(readRows({ pages: [], wordsPerMinute: WPM }, [], undefined)).toEqual([{ level: '', page: 0, all: 0 }]);
  expect(readRows({ pages: [], wordsPerMinute: WPM }, LEVELS, undefined)).toEqual([
    { level: 'overview', page: 0, all: 0 },
    { level: 'internals', page: 0, all: 0 },
  ]);
});
