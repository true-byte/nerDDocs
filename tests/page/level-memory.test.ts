import { expect, test } from '@playwright/test';
import {
  changedPages,
  keepLevel,
  landingLevel,
  liveLevels,
  openingLevelFor,
  readDefaultLevel,
  readKeptLevels,
  writeDefaultLevel,
  writeKeptLevels,
} from '../../src/page/level-memory.ts';
import { PAGE_IDS } from '../../src/page/page-ids.ts';
import type { TreeNode } from '../../src/site/scan.ts';
import type { PageLevels } from '../../src/site/view.ts';

const DEFAULT_KEY = 'nerddocs-default-level';
const KEPT_KEY = 'nerddocs-page-levels';
const URL = '/restore.html';

const named = (...ids: string[]) => ids.map((id) => ({ id, name: id }));
const LEVELS = named('overview', 'requirements', 'internals');
const ALL = LEVELS.map(({ id }) => id);

function pageWith(parts: string[], more: Partial<PageLevels> = {}): PageLevels {
  return { levels: LEVELS, defaultLevel: 'overview', parts, hasShared: false, hasSharedText: false, ...more };
}

function fakeStorage(items = new Map<string, string>()): Storage {
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  } as Storage;
}

const blockedStorage = {
  getItem() {
    throw new Error('The browser blocks storage.');
  },
  setItem() {
    throw new Error('The browser blocks storage.');
  },
  removeItem() {
    throw new Error('The browser blocks storage.');
  },
} as unknown as Storage;

function useStorage(local: Storage, session: Storage): void {
  Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });
}

/** A browser that throws on the name itself, before any call on the storage. */
function useThrowingAccessors(): void {
  const refuse = () => {
    throw new Error('The browser blocks storage.');
  };
  Object.defineProperty(globalThis, 'localStorage', { get: refuse, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { get: refuse, configurable: true });
}

/** Gives each test empty storage of each kind, and hands back what each one holds. */
function emptyStores() {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  useStorage(fakeStorage(local), fakeStorage(session));
  return { local, session };
}

const entry = (level: string, live: string[] = ALL) => ({ level, live });

test.beforeEach(() => {
  // A write that saves ends what the module holds from a storage that did not save.
  emptyStores();
  writeDefaultLevel('overview');
  writeKeptLevels({});
  emptyStores();
});

test.afterEach(() => {
  for (const name of ['localStorage', 'sessionStorage']) {
    Reflect.deleteProperty(globalThis, name);
  }
});

test.describe('the level that a wanted level lands on', () => {
  const five = named('a', 'b', 'c', 'd', 'e');

  test('a wanted level with text is the level', () => {
    expect(landingLevel(pageWith(['overview', 'internals']), 'internals')).toBe('internals');
  });

  test('a hollow wanted level gives the nearest lower level with text', () => {
    expect(landingLevel(pageWith(['overview', 'requirements']), 'internals')).toBe('requirements');
    expect(landingLevel(pageWith(['overview', 'internals']), 'requirements')).toBe('overview');
    expect(landingLevel(pageWith(['a', 'b', 'e'], { levels: five }), 'd')).toBe('b');
  });

  test('a lower level wins over a higher level that is nearer', () => {
    expect(landingLevel(pageWith(['a', 'e'], { levels: five }), 'd')).toBe('a');
  });

  test('with no lower level with text, a hollow wanted level gives the nearest higher level with text', () => {
    expect(landingLevel(pageWith(['internals']), 'overview')).toBe('internals');
    expect(landingLevel(pageWith(['c', 'e'], { levels: five }), 'a')).toBe('c');
  });

  test('a level inside a part of several levels has text', () => {
    expect(landingLevel(pageWith(['overview internals']), 'internals')).toBe('internals');
    expect(landingLevel(pageWith(['overview internals']), 'requirements')).toBe('overview');
  });

  test('on a page with shared text or with no parts, each level has text', () => {
    expect(landingLevel(pageWith(['internals'], { hasShared: true, hasSharedText: true }), 'requirements')).toBe('requirements');
    expect(landingLevel(pageWith([]), 'requirements')).toBe('requirements');
  });

  test('a wanted level that the site does not list gives the author default', () => {
    expect(landingLevel(pageWith(['overview', 'internals'], { defaultLevel: 'internals' }), 'testers')).toBe('internals');
  });

  test('with no wanted level, the author default lands by the same rule', () => {
    expect(landingLevel(pageWith(['overview', 'internals'], { defaultLevel: 'internals' }))).toBe('internals');
    expect(landingLevel(pageWith(['overview', 'requirements'], { defaultLevel: 'internals' }))).toBe('requirements');
    expect(landingLevel(pageWith(['internals']))).toBe('internals');
  });

  test('an author default that the site does not list gives the first level, by the same rule', () => {
    expect(landingLevel(pageWith(['overview', 'internals'], { defaultLevel: 'testers' }))).toBe('overview');
    expect(landingLevel(pageWith(['internals'], { defaultLevel: '' }))).toBe('internals');
  });

  test('a site with no levels lands on no level', () => {
    expect(landingLevel(pageWith([], { levels: [], defaultLevel: '' }))).toBe('');
  });
});

test.describe('the level that a page opens at', () => {
  const page = pageWith(['overview', 'requirements', 'internals']);

  test('with nothing stored, the author default', () => {
    expect(openingLevelFor(pageWith(ALL, { defaultLevel: 'requirements' }), URL)).toBe('requirements');
  });

  test('the reader default wins over the author default', () => {
    writeDefaultLevel('internals');
    expect(openingLevelFor(page, URL)).toBe('internals');
  });

  test('the level kept for the page wins over the reader default', () => {
    writeDefaultLevel('internals');
    writeKeptLevels({ [URL]: entry('requirements') });
    expect(openingLevelFor(page, URL)).toBe('requirements');
  });

  test('a level kept for another page counts for nothing', () => {
    writeKeptLevels({ '/storage.html': entry('internals') });
    expect(openingLevelFor(page, URL)).toBe('overview');
  });

  test('a stored level that the site does not list is ignored, for the next one in the order', () => {
    writeDefaultLevel('internals');
    writeKeptLevels({ [URL]: entry('testers') });
    expect(openingLevelFor(page, URL)).toBe('internals');
    writeDefaultLevel('testers');
    expect(openingLevelFor(page, URL)).toBe('overview');
  });

  test('a hollow kept level or a hollow reader default falls to a lower level, then a higher one', () => {
    const noInternals = pageWith(['overview', 'requirements']);
    writeDefaultLevel('internals');
    expect(openingLevelFor(noInternals, URL)).toBe('requirements');
    expect(openingLevelFor(pageWith(['internals']), URL)).toBe('internals');

    writeDefaultLevel('overview');
    writeKeptLevels({ [URL]: entry('internals') });
    expect(openingLevelFor(noInternals, URL)).toBe('requirements');
  });

  test('a hollow stored level stays stored', () => {
    const { local, session } = emptyStores();
    writeDefaultLevel('internals');
    writeKeptLevels({ [URL]: entry('internals') });
    const before = [local.get(DEFAULT_KEY), session.get(KEPT_KEY)];

    openingLevelFor(pageWith(['overview']), URL);

    expect([local.get(DEFAULT_KEY), session.get(KEPT_KEY)]).toEqual(before);
  });

  test('a new tab opens at the reader default, since each tab has a session storage of its own', () => {
    const shared = fakeStorage();
    useStorage(shared, fakeStorage());
    writeDefaultLevel('requirements');
    writeKeptLevels({ [URL]: entry('internals') });
    expect(openingLevelFor(page, URL)).toBe('internals');

    useStorage(shared, fakeStorage());
    expect(openingLevelFor(page, URL)).toBe('requirements');
  });
});

test.describe('stored levels', () => {
  test('the reader default lasts in the local storage, as the level id', () => {
    const { local, session } = emptyStores();
    expect(readDefaultLevel()).toBeNull();
    writeDefaultLevel('internals');
    expect(readDefaultLevel()).toBe('internals');
    expect(local.get(DEFAULT_KEY)).toBe('internals');
    expect(session.size).toBe(0);
  });

  test('the kept levels last in the session storage, as a JSON map of page url to level and live levels', () => {
    const { local, session } = emptyStores();
    expect(readKeptLevels()).toEqual({});
    writeKeptLevels({ [URL]: entry('internals', ['overview', 'internals']) });
    expect(readKeptLevels()).toEqual({ [URL]: { level: 'internals', live: ['overview', 'internals'] } });
    expect(JSON.parse(session.get(KEPT_KEY)!)).toEqual({ [URL]: { level: 'internals', live: ['overview', 'internals'] } });
    expect(local.size).toBe(0);
  });

  test('an empty map clears the kept levels', () => {
    writeKeptLevels({ [URL]: entry('internals') });
    writeKeptLevels({});
    expect(readKeptLevels()).toEqual({});
  });

  for (const junk of ['{not json', 'null', '42', '"text"', '[1,2]']) {
    test(`kept levels stored as ${junk} read as none`, () => {
      const { session } = emptyStores();
      session.set(KEPT_KEY, junk);
      expect(readKeptLevels()).toEqual({});
      expect(openingLevelFor(pageWith(ALL), URL)).toBe('overview');
    });
  }

  test('a kept entry of the wrong shape is dropped, and the good ones stay', () => {
    const { session } = emptyStores();
    session.set(
      KEPT_KEY,
      JSON.stringify({
        '/number.html': { level: 5, live: [] },
        '/no-live.html': { level: 'overview' },
        '/text.html': 'overview',
        '/empty.html': null,
        [URL]: entry('internals'),
      }),
    );
    expect(readKeptLevels()).toEqual({ [URL]: entry('internals') });
  });

  test('a throwing storage reads as nothing stored, and the page opens at the author default', () => {
    useStorage(blockedStorage, blockedStorage);
    expect(readDefaultLevel()).toBeNull();
    expect(readKeptLevels()).toEqual({});
    expect(openingLevelFor(pageWith(ALL), URL)).toBe('overview');
  });

  test('a throwing storage takes each write with no error', () => {
    useStorage(blockedStorage, blockedStorage);
    expect(() => writeDefaultLevel('internals')).not.toThrow();
    expect(() => writeKeptLevels({ [URL]: entry('internals') })).not.toThrow();
    expect(() => keepLevel(pageWith(ALL), URL, 'internals')).not.toThrow();
  });

  test('a throwing storage holds what was written until the page closes, for the page open and the live update alike', () => {
    useStorage(blockedStorage, blockedStorage);
    writeDefaultLevel('requirements');
    expect(readDefaultLevel()).toBe('requirements');
    expect(openingLevelFor(pageWith(ALL), URL)).toBe('requirements');
    keepLevel(pageWith(ALL), URL, 'internals');
    expect(readKeptLevels()).toEqual({ [URL]: entry('internals') });
    expect(openingLevelFor(pageWith(ALL), URL)).toBe('internals');
  });

  test('a storage that does not save holds what was written, and a later write that saves ends the hold', () => {
    const local = new Map([[DEFAULT_KEY, 'overview']]);
    const dropped = { ...fakeStorage(local), setItem() {} } as unknown as Storage;
    useStorage(dropped, dropped);
    writeDefaultLevel('internals');
    writeKeptLevels({ [URL]: entry('internals') });
    expect(readDefaultLevel()).toBe('internals');
    expect(readKeptLevels()).toEqual({ [URL]: entry('internals') });

    const stores = emptyStores();
    writeDefaultLevel('requirements');
    writeKeptLevels({});
    stores.local.set(DEFAULT_KEY, 'overview');
    expect(readDefaultLevel()).toBe('overview');
    expect(readKeptLevels()).toEqual({});
  });

  test('a browser that throws on the name of the storage reads as nothing stored and takes each write', () => {
    useThrowingAccessors();
    expect(readDefaultLevel()).toBeNull();
    expect(readKeptLevels()).toEqual({});
    expect(openingLevelFor(pageWith(ALL), URL)).toBe('overview');
    expect(() => writeDefaultLevel('internals')).not.toThrow();
    expect(() => keepLevel(pageWith(ALL), URL, 'internals')).not.toThrow();
  });
});

test.describe('keeping the level of a page', () => {
  test('a level other than the default is kept, with the levels that have text on the page', () => {
    keepLevel(pageWith(['overview', 'overview internals']), URL, 'internals');
    expect(readKeptLevels()).toEqual({ [URL]: { level: 'internals', live: ['overview', 'internals'] } });
  });

  test('a level equal to the default removes the entry, and leaves the entries of other pages', () => {
    const other = { '/storage.html': entry('internals') };
    writeKeptLevels({ ...other, [URL]: entry('internals') });
    keepLevel(pageWith(ALL), URL, 'overview');
    expect(readKeptLevels()).toEqual(other);
  });

  test('the reader default replaces the author default in that check', () => {
    writeDefaultLevel('requirements');
    keepLevel(pageWith(ALL), URL, 'overview');
    expect(readKeptLevels()[URL]?.level).toBe('overview');
    keepLevel(pageWith(ALL), URL, 'requirements');
    expect(readKeptLevels()).toEqual({});
  });

  test('a reader default that the site does not list leaves the author default in that check', () => {
    writeDefaultLevel('testers');
    keepLevel(pageWith(ALL), URL, 'overview');
    expect(readKeptLevels()).toEqual({});
  });

  test('the check uses the level that the default lands on, on a page with no text at the default', () => {
    const page = pageWith(['overview', 'internals']);
    writeDefaultLevel('requirements');
    keepLevel(page, URL, 'internals');
    expect(readKeptLevels()[URL]?.level).toBe('internals');
    keepLevel(page, URL, 'overview');
    expect(readKeptLevels()).toEqual({});
  });
});

test.describe('the levels with text on a page', () => {
  test('a page with parts lists the level of each part, in the order of the site', () => {
    expect(liveLevels(pageWith(['internals', 'overview']))).toEqual(['overview', 'internals']);
    expect(liveLevels(pageWith(['overview internals']))).toEqual(['overview', 'internals']);
  });

  test('a page with shared text, or with no parts, lists each level', () => {
    expect(liveLevels(pageWith(['internals'], { hasShared: true, hasSharedText: true }))).toEqual(ALL);
    expect(liveLevels(pageWith([]))).toEqual(ALL);
  });

  test('shared text of headings only adds no level', () => {
    expect(liveLevels(pageWith(['internals'], { hasShared: true }))).toEqual(['internals']);
  });
});

test.describe('the pages that a new default changes', () => {
  const tree: TreeNode[] = [
    { kind: 'page', url: '/README.html', title: 'Backup app' },
    {
      kind: 'section',
      id: 'backups',
      title: 'Backups',
      children: [
        { kind: 'page', url: '/backups/restore.html', title: 'Restore a file' },
        {
          kind: 'section',
          id: 'backups/plans',
          title: 'Plans',
          children: [{ kind: 'page', url: '/backups/plans/team.html', title: 'Team plan' }],
        },
      ],
    },
    { kind: 'page', url: '/storage.html', title: 'Storage' },
  ];

  test('nothing kept changes no page', () => {
    expect(changedPages({}, LEVELS, tree, 'internals')).toEqual([]);
  });

  test('each changed page gets a row with its url, its title from the tree, its kept level and the level it would open at', () => {
    expect(changedPages({ '/storage.html': entry('internals') }, LEVELS, tree, 'requirements')).toEqual([
      { url: '/storage.html', title: 'Storage', from: 'internals', to: 'requirements' },
    ]);
  });

  test('the rows follow the order of the tree, also inside sections, and not the order of the map', () => {
    const kept = {
      '/storage.html': entry('internals'),
      '/backups/plans/team.html': entry('internals'),
      '/README.html': entry('internals'),
      '/backups/restore.html': entry('internals'),
    };
    expect(changedPages(kept, LEVELS, tree, 'overview').map(({ url }) => url)).toEqual([
      '/README.html',
      '/backups/restore.html',
      '/backups/plans/team.html',
      '/storage.html',
    ]);
  });

  test('a kept page whose url is not in the tree is dropped', () => {
    const kept = { '/gone.html': entry('internals'), '/storage.html': entry('internals') };
    expect(changedPages(kept, LEVELS, tree, 'overview').map(({ url }) => url)).toEqual(['/storage.html']);
  });

  test('a page already at the level it would open at is left out', () => {
    const kept = { '/storage.html': entry('overview'), '/README.html': entry('internals') };
    expect(changedPages(kept, LEVELS, tree, 'overview').map(({ url }) => url)).toEqual(['/README.html']);
  });

  test('a page whose kept level the site does not list is left out', () => {
    expect(changedPages({ '/storage.html': entry('testers') }, LEVELS, tree, 'overview')).toEqual([]);
  });

  test('the level a page would open at comes from its stored live levels, lower then higher', () => {
    const lower = { '/storage.html': entry('overview', ['overview', 'requirements']) };
    expect(changedPages(lower, LEVELS, tree, 'internals')).toEqual([
      { url: '/storage.html', title: 'Storage', from: 'overview', to: 'requirements' },
    ]);

    const higher = { '/storage.html': entry('requirements', ['requirements', 'internals']) };
    expect(changedPages(higher, LEVELS, tree, 'overview')).toEqual([]);
  });

  test('a page that would land on its kept level through its live levels is left out', () => {
    const onlyInternals = { '/storage.html': entry('internals', ['internals']) };
    expect(changedPages(onlyInternals, LEVELS, tree, 'overview')).toEqual([]);
    const noInternals = { '/storage.html': entry('requirements', ['overview', 'requirements']) };
    expect(changedPages(noInternals, LEVELS, tree, 'internals')).toEqual([]);
  });
});

test('a heading never takes the id of a control of the level memory', () => {
  expect(PAGE_IDS).toEqual(expect.arrayContaining(['change-pages', 'chip', 'defaults-box', 'dfl2', 'dflB']));
});
