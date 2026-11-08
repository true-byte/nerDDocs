import { expect, test } from '@playwright/test';
import type { SearchUnit } from '../../src/markdown/render.ts';
import { createSearch, type Hit, type Reader, type SearchPage } from '../../src/page/search.ts';

const IDS = ['overview', 'requirements', 'internals'];

const unit = (text: string, levels: string | null, headingId: string | null = null, heading: string | null = null): SearchUnit => ({
  text,
  levels,
  headingId,
  heading,
});

const RESTORE = '/user-guide/backups/restore.html';
const SCHEDULES = '/user-guide/backups/schedules.html';
const STORAGE = '/user-guide/storage.html';
const INSTALL = '/administration/install.html';

/** Pages of the backup app in two dimensions: a page with parts and shared text, a page with one part, a flat page. */
const PAGES: SearchPage[] = [
  {
    url: RESTORE,
    title: 'Restore a file',
    dimension: 'user-guide',
    parts: ['overview', 'internals', 'overview internals'],
    hasSharedText: true,
    units: [
      unit('A restore never changes the copy.', null),
      unit('Pick a day', null, 'pick-a-day', 'Pick a day'),
      unit('Pick a file and a day.', 'overview', 'pick-a-day', 'Pick a day'),
      unit('A restore is a job on the storage server.', 'internals', 'pick-a-day', 'Pick a day'),
      unit('Press Ctrl+R to restore the file.', 'overview internals', 'keys', 'Keys'),
      unit('Hold Ctrl and click a file to pick more.', null, 'keys', 'Keys'),
      unit('Set BACKUP_AGENT_KEY before the first restore.', 'internals', 'keys', 'Keys'),
    ],
  },
  {
    url: SCHEDULES,
    title: 'Schedules',
    dimension: 'user-guide',
    parts: ['requirements'],
    hasSharedText: true,
    units: [
      unit('A plan says how often.', null, 'plans', 'Plans'),
      unit('A weekly plan runs on Sunday.', 'requirements', 'weekly-plan', 'Weekly plan'),
      unit('REQ-2.1 A plan keeps at most 30 days.', 'requirements', 'limits', 'Limits'),
    ],
  },
  {
    url: STORAGE,
    title: 'Storage',
    dimension: 'user-guide',
    parts: [],
    hasSharedText: true,
    units: [
      unit('Blocks are stored once on the storage server.', null, 'blocks', 'Blocks'),
      unit('A planner moves old blocks at night.', null, 'blocks', 'Blocks'),
    ],
  },
  {
    url: INSTALL,
    title: 'Install the server',
    dimension: 'administration',
    parts: ['internals'],
    hasSharedText: true,
    units: [
      unit('Run the installer on the storage server.', null),
      unit('The installer writes the storage server config.', 'internals', 'config', 'Config'),
    ],
  },
];

/** A reader on a page of 'User guide', at the given level of every page. */
const readerAt = (level: string, dimension: string | null = 'user-guide'): Reader => ({
  dimension,
  levels: IDS,
  levelOf: () => level,
});

const search = createSearch(PAGES);
const find = (query: string, reader: Reader = readerAt('overview')) => search.find(query, reader);
const snippets = (hits: Hit[]) => hits.map((hit) => hit.snippet);
/** The text of each mark of a hit. */
const marked = (hit: Hit) => hit.marks.map(([start, end]) => hit.snippet.slice(start, end));

test.describe('matching', () => {
  test('case does not matter', () => {
    expect(snippets(find('SUNDAY'))).toEqual(['A weekly plan runs on Sunday.']);
    expect(snippets(find('sunday'))).toEqual(['A weekly plan runs on Sunday.']);
  });

  test('every word of the query matches the unit, its heading or its page title', () => {
    expect(snippets(find('weekly sunday'))).toEqual(['A weekly plan runs on Sunday.']);
    expect(snippets(find('schedules sunday'))).toEqual(['A weekly plan runs on Sunday.']);
    expect(snippets(find('limits days'))).toEqual(['REQ-2.1 A plan keeps at most 30 days.']);
    expect(find('weekly monday')).toEqual([]);
  });

  test('the last word also matches as the start of a word, and the other words do not', () => {
    expect(snippets(find('sund'))).toEqual(['A weekly plan runs on Sunday.']);
    expect(snippets(find('weekly sund'))).toEqual(['A weekly plan runs on Sunday.']);
    expect(find('sund weekly')).toEqual([]);
  });

  test('a word of 5 letters or more also matches with one letter wrong, and a shorter word does not', () => {
    expect(snippets(find('sundey'))).toEqual(['A weekly plan runs on Sunday.']);
    expect(snippets(find('pross'))).toEqual(['Press Ctrl+R to restore the file.']);
    expect(find('sondey')).toEqual([]);
    expect(find('hald')).toEqual([]);
  });

  test('a word joined by + . - _ / or # matches as a whole, and each of its pieces matches too', () => {
    expect(snippets(find('Ctrl+R'))[0]).toBe('Press Ctrl+R to restore the file.');
    expect(snippets(find('ctrl'))).toContain('Press Ctrl+R to restore the file.');
    expect(snippets(find('REQ-2.1'))).toEqual(['REQ-2.1 A plan keeps at most 30 days.']);
    expect(snippets(find('req'))).toEqual(['REQ-2.1 A plan keeps at most 30 days.']);
    expect(snippets(find('BACKUP_AGENT_KEY'))).toEqual(['Set BACKUP_AGENT_KEY before the first restore.']);
    expect(snippets(find('agent'))).toEqual(['Set BACKUP_AGENT_KEY before the first restore.']);
  });

  test('a unit with the whole word ranks above a unit with a piece of it', () => {
    expect(snippets(find('ctrl')).slice(0, 2)).toEqual(['Hold Ctrl and click a file to pick more.', 'Press Ctrl+R to restore the file.']);
  });

  test('a query of only white space gives no hits', () => {
    for (const query of ['', ' ', '  \t\n ']) expect(find(query), JSON.stringify(query)).toEqual([]);
  });
});

test.describe('order', () => {
  test("the hits of the open page's dimension come first, those that the reader's level shows first, then the hits of other dimensions, in the same way", () => {
    expect(snippets(find('storage server'))).toEqual([
      'Blocks are stored once on the storage server.',
      'A restore is a job on the storage server.',
      'Run the installer on the storage server.',
      'The installer writes the storage server config.',
    ]);
  });

  test('a reader in the other dimension sees its hits first', () => {
    expect(snippets(find('storage server', readerAt('overview', 'administration')))).toEqual([
      'Run the installer on the storage server.',
      'The installer writes the storage server config.',
      'Blocks are stored once on the storage server.',
      'A restore is a job on the storage server.',
    ]);
  });

  test('on a site with no dimensions, the hits that the level shows come first', () => {
    const flat = createSearch(PAGES.map((page) => ({ ...page, dimension: null })));
    const hits = flat.find('storage server', readerAt('overview', null));
    expect(hits.map((hit) => hit.seen)).toEqual([true, true, false, false]);
    expect(hits.map((hit) => hit.dimension)).toEqual([null, null, null, null]);
  });

  test('inside a group, the best match comes first', () => {
    expect(snippets(find('plan')).slice(0, 2)).toEqual(['A plan says how often.', 'A planner moves old blocks at night.']);
  });

  test('a search gives at most 50 hits', () => {
    const many = createSearch([
      {
        url: STORAGE,
        title: 'Storage',
        dimension: null,
        parts: [],
        hasSharedText: true,
        units: Array.from({ length: 60 }, (_, n) => unit(`Block ${n} is stored once.`, null)),
      },
    ]);
    expect(many.find('block', readerAt('overview', null))).toHaveLength(50);
  });
});

test.describe('the snippet', () => {
  const FILLER = 'The agent sends each changed block to the server and waits for the answer. ';
  const LONG = `${FILLER.repeat(3)}The checksum of each block proves the copy. ${FILLER.repeat(3)}`.trim();
  const longPage = (text: string): SearchPage => ({ url: STORAGE, title: 'Storage', dimension: null, parts: [], hasSharedText: true, units: [unit(text, null)] });
  const hitIn = (text: string, query: string) => createSearch([longPage(text)]).find(query, readerAt('overview', null))[0]!;

  /** The snippet without its '…' marks, which must be a piece of the text that starts and ends at a space or at an end of the text. */
  function expectCutAtSpaces(snippet: string, text: string): string {
    const inner = snippet.replace(/^…/, '').replace(/…$/, '');
    const at = text.indexOf(inner);
    expect(at, snippet).toBeGreaterThanOrEqual(0);
    expect(inner.length).toBeLessThanOrEqual(160);
    expect(snippet.startsWith('…'), snippet).toBe(at > 0);
    expect(snippet.endsWith('…'), snippet).toBe(at + inner.length < text.length);
    if (at > 0) expect(text[at - 1]).toBe(' ');
    if (at + inner.length < text.length) expect(text[at + inner.length]).toBe(' ');
    return inner;
  }

  test('a unit of up to 160 characters shows whole', () => {
    expect(find('job')[0]!.snippet).toBe('A restore is a job on the storage server.');
    const fits = `${'x'.repeat(150)} checksum`;
    expect(hitIn(fits, 'checksum').snippet).toBe(fits);
  });

  test('a longer unit is cut around the first match, at spaces, with … at each cut end', () => {
    expect(LONG.length).toBeGreaterThan(400);
    const middle = hitIn(LONG, 'checksum');
    expect(expectCutAtSpaces(middle.snippet, LONG)).toContain('checksum');
    expect(middle.snippet.startsWith('…') && middle.snippet.endsWith('…')).toBe(true);

    const start = hitIn(`Checksum first. ${LONG}`, 'checksum');
    expect(expectCutAtSpaces(start.snippet, `Checksum first. ${LONG}`)).toMatch(/^Checksum first\./);

    const end = hitIn(`${LONG} The last word is checksum.`, 'last word');
    expect(expectCutAtSpaces(end.snippet, `${LONG} The last word is checksum.`)).toMatch(/The last word is checksum\.$/);
  });

  test('each mark is a range of the snippet that a query word matches', () => {
    const weekly = find('weekly sunday')[0]!;
    expect(weekly.marks).toEqual([
      [2, 8],
      [22, 28],
    ]);
    expect(find('SUNDAY')[0]!.marks).toEqual([[22, 28]]);
    expect(marked(find('sundey')[0]!)).toEqual(['Sunday']);
    expect(find('Ctrl+R')[0]!.marks).toEqual([[6, 12]]);
    expect(find('schedules sunday')[0]!.marks).toEqual([[22, 28]]);
  });

  test('a mark in a cut snippet points into the snippet', () => {
    const middle = hitIn(LONG, 'checksum');
    expect(marked(middle)).toEqual(['checksum']);
  });
});

test.describe('the level of a hit', () => {
  test('a hit names its page, its heading and its levels, opens at a level that shows it, and links there', () => {
    expect(find('job')).toEqual([
      {
        url: RESTORE,
        title: 'Restore a file',
        dimension: 'user-guide',
        heading: 'Pick a day',
        headingId: 'pick-a-day',
        levels: 'internals',
        level: 'internals',
        seen: false,
        href: `${RESTORE}#internals/pick-a-day`,
        snippet: 'A restore is a job on the storage server.',
        marks: [[15, 18]],
      },
    ]);
  });

  test("a hit that the reader's level of the page shows is seen, and opens at that level", () => {
    const [hit] = find('job', readerAt('internals'));
    expect(hit).toMatchObject({ level: 'internals', seen: true, href: `${RESTORE}#internals/pick-a-day` });
  });

  test('a unit without the wanted level opens at the nearest lower level that shows it, else the nearest higher one', () => {
    const press = find('Ctrl+R', readerAt('requirements')).find((hit) => hit.snippet.startsWith('Press'));
    expect(press).toMatchObject({ levels: 'overview internals', level: 'overview', seen: false });
    expect(find('agent', readerAt('overview'))[0]).toMatchObject({ levels: 'internals', level: 'internals', seen: false });
  });

  test('shared text opens at the reader level, and a unit with no heading above it names the level alone', () => {
    expect(find('never changes', readerAt('requirements'))[0]).toMatchObject({
      levels: null,
      level: 'requirements',
      seen: true,
      heading: null,
      headingId: null,
      href: `${RESTORE}#requirements`,
    });
  });

  test("each page has the reader's own level of that page", () => {
    const reader: Reader = { dimension: 'user-guide', levels: IDS, levelOf: (url) => (url === SCHEDULES ? 'requirements' : 'overview') };
    expect(search.find('sunday', reader)[0]).toMatchObject({ level: 'requirements', seen: true, href: `${SCHEDULES}#requirements/weekly-plan` });
    expect(search.find('job', reader)[0]).toMatchObject({ level: 'internals', seen: false });
  });

  test('a hit on a flat page opens at no level, and links to its heading alone', () => {
    expect(find('stored once')[0]).toMatchObject({ url: STORAGE, levels: null, level: null, seen: true, href: `${STORAGE}#blocks` });
  });

  test('on a site with no levels, a hit opens at no level and is seen', () => {
    const plain = createSearch([
      { url: '/restore.html', title: 'Restore a file', dimension: null, parts: [], hasSharedText: true, units: [unit('Pick a day.', null, 'pick-a-day', 'Pick a day'), unit('Pick a file.', null)] },
    ]);
    const reader: Reader = { dimension: null, levels: [], levelOf: () => null };
    expect(plain.find('pick', reader).map(({ level, seen, href }) => ({ level, seen, href }))).toEqual([
      { level: null, seen: true, href: '/restore.html#pick-a-day' },
      { level: null, seen: true, href: '/restore.html' },
    ]);
  });
});
