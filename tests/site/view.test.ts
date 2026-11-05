import { expect, test } from '@playwright/test';
import type { Page, Site } from '../../src/site/scan.ts';
import { hasPage, nextUrl, viewOf } from '../../src/site/view.ts';

const NO_TEXT = { words: 0, images: 0 };
/** At this speed 60 words take one minute. */
const WORDS_PER_MINUTE = 60;

function siteOf(pages: Record<string, string>): Site {
  const list = Object.entries(pages).map(([url, source]) => ({
    url,
    source,
    title: source,
    titleId: source,
    html: `<p>${source}</p>`,
    unknownLevels: [],
    parts: [],
    hasShared: true,
    hasSharedText: true,
    sizes: { '': NO_TEXT } as Page['sizes'],
    outline: [],
    uses: [],
    problems: [],
    diagrams: 'none' as const,
  }));
  return {
    name: 'Backup app',
    tree: list.map(({ url, title }) => ({ kind: 'page', url, title })),
    pages: list,
    folders: [],
    used: [],
    levels: [],
    defaultLevel: '',
    configProblem: null,
    wordsPerMinute: WORDS_PER_MINUTE,
    dimensions: [],
  };
}

test('a page gives a view with its title and text', () => {
  const view = viewOf(siteOf({ '/restore.html': 'Restore a file' }), '/restore.html');
  expect(view.url).toBe('/restore.html');
  expect(view.title).toBe('Restore a file');
  expect(view.docTitle).toBe('Restore a file - Backup app');
  expect(view.html).toBe('<p>Restore a file</p>');
});

test('a page with the title of the site names it once in the window title', () => {
  const view = viewOf(siteOf({ '/README.html': 'Backup app' }), '/README.html');
  expect(view.docTitle).toBe('Backup app');
});

test('the site root gives the first page, or an empty page with no pages', () => {
  const site = siteOf({ '/restore.html': 'Restore', '/storage.html': 'Storage' });
  expect(viewOf(site, '/').url).toBe('/restore.html');
  const empty = viewOf(siteOf({}), '/');
  expect(empty.url).toBe('/');
  expect(empty.title).toBe('Backup app');
  expect(empty.docTitle).toBe('Backup app');
  expect(empty.html).toBe('');
});

test('an unknown address gives a 404 view that keeps the address', () => {
  const view = viewOf(siteOf({ '/restore.html': 'Restore' }), '/upgrade.html');
  expect(view.url).toBe('/upgrade.html');
  expect(view.title).toBe('404');
  expect(view.docTitle).toBe('404 - Backup app');
  expect(view.html).toBe('');
});

test('only an address with a page counts as a page', () => {
  const site = siteOf({ '/restore.html': 'Restore' });
  expect(hasPage(site, '/restore.html')).toBe(true);
  expect(hasPage(site, '/upgrade.html')).toBe(false);
});

test('an open page gets an update only when what it shows changes', () => {
  const one = viewOf(siteOf({ '/restore.html': 'Restore' }), '/restore.html');
  expect(viewOf(siteOf({ '/restore.html': 'Restore' }), '/restore.html').rev).toBe(one.rev);
  expect(viewOf(siteOf({ '/restore.html': 'Get a file back' }), '/restore.html').rev).not.toBe(one.rev);
  expect(viewOf(siteOf({ '/restore.html': 'Restore', '/storage.html': 'Storage' }), '/restore.html').rev).not.toBe(one.rev);
});

test('a view says what is wrong with the config, and a new problem sends the page again', () => {
  const site = siteOf({ '/restore.html': 'Restore' });
  const fine = viewOf(site, '/restore.html');
  expect(fine.configProblem).toBeNull();
  const missing = viewOf({ ...site, configProblem: 'missing' }, '/restore.html');
  const broken = viewOf({ ...site, configProblem: 'broken' }, '/restore.html');
  expect(missing.configProblem).toBe('missing');
  expect(broken.configProblem).toBe('broken');
  expect(new Set([fine.rev, missing.rev, broken.rev]).size).toBe(3);
});

test('a view of an address with no page or of an empty site also says what is wrong with the config', () => {
  const site = { ...siteOf({ '/restore.html': 'Restore' }), configProblem: 'broken' as const };
  expect(viewOf(site, '/upgrade.html').configProblem).toBe('broken');
  expect(viewOf({ ...siteOf({}), configProblem: 'missing' }, '/').configProblem).toBe('missing');
});

test('a view says whether its page has shared text', () => {
  const site = siteOf({ '/restore.html': 'Restore' });
  expect(viewOf(site, '/restore.html').hasSharedText).toBe(true);
  site.pages[0]!.hasSharedText = false;
  expect(viewOf(site, '/restore.html').hasSharedText).toBe(false);
});

test('a view carries the outline of its page, and an unknown address has none', () => {
  const site = siteOf({ '/restore.html': 'Restore' });
  const outline = [{ id: 'pick-a-day', text: 'Pick a day', rank: 2, shows: null }];
  site.pages[0]!.outline = outline;
  expect(viewOf(site, '/restore.html').outline).toEqual(outline);
  expect(viewOf(site, '/missing.html').outline).toEqual([]);
});

test('a new outline sends the page again', () => {
  const site = siteOf({ '/restore.html': 'Restore' });
  const one = viewOf(site, '/restore.html');
  site.pages[0]!.outline = [{ id: 'pick-a-day', text: 'Pick a day', rank: 2, shows: null }];
  expect(viewOf(site, '/restore.html').rev).not.toBe(one.rev);
});

test('a view carries the diagram build of its page, and none for an unknown address', () => {
  const site = siteOf({ '/user-flows.html': 'User flows' });
  site.pages[0]!.diagrams = 'full';
  const full = viewOf(site, '/user-flows.html');
  expect(full.diagrams).toBe('full');
  site.pages[0]!.diagrams = 'tiny';
  const tiny = viewOf(site, '/user-flows.html');
  expect(tiny.diagrams).toBe('tiny');
  expect(tiny.rev).not.toBe(full.rev);
  expect(viewOf(site, '/nowhere.html').diagrams).toBe('none');
});

test.describe('the marks of a part', () => {
  const LEVELS = [
    { id: 'overview', name: 'Overview', icon: 'eye' },
    { id: 'requirements', name: 'Requirements', icon: 'list' },
    { id: 'internals', name: 'Internals' },
    { id: 'testers', name: 'Testers', icon: 'flask' },
    { id: 'managers', name: 'Managers', icon: 'brief' },
    { id: 'writers', name: 'Writers', icon: 'book' },
  ];

  function viewWith(html: string, levels = LEVELS) {
    const site = siteOf({ '/restore.html': 'Restore' });
    site.levels = levels;
    site.defaultLevel = levels[0]?.id ?? '';
    site.pages[0]!.html = html;
    site.pages[0]!.parts = ['overview'];
    site.pages[0]!.sizes = Object.fromEntries(['', ...levels.map((level) => level.id)].map((id) => [id, NO_TEXT]));
    return viewOf(site, '/restore.html');
  }
  const part = (levels: string) => `<div class="part" data-l="${levels}"><div class="bd"><p>Text</p></div></div>`;
  const marksOf = (html: string) => /<div class="marks" aria-hidden="true">(.*?)<\/div>/.exec(html)?.[1] ?? null;

  test('a part gets the icon of its level before its text', () => {
    const { html } = viewWith(part('overview'));
    expect(html).toMatch(/^<div class="part" data-l="overview"><div class="marks" aria-hidden="true">.*<\/div><div class="bd">/);
    expect(marksOf(html)).toContain('<circle cx="12" cy="12" r="2.5"/>');
    expect(marksOf(html)).toContain('--mc:var(--l0)');
  });

  test('the icons follow the order of the levels, each in the color of its level', () => {
    const marks = marksOf(viewWith(part('testers overview')).html)!;
    expect(marks.indexOf('--mc:var(--l0)')).toBeLessThan(marks.indexOf('--mc:var(--l3)'));
    expect(marks).not.toContain('class="more"');
  });

  test('a level with no icon shows the first letter of its name', () => {
    expect(marksOf(viewWith(part('internals')).html)).toContain('>I</text>');
  });

  test('three levels show three icons, and more than three show three icons, then a +', () => {
    const three = marksOf(viewWith(part('overview requirements internals')).html)!;
    expect(three.match(/<svg/g)).toHaveLength(3);
    expect(three).not.toContain('class="more"');
    const four = marksOf(viewWith(part('overview requirements internals testers')).html)!;
    expect(four.match(/<svg/g)).toHaveLength(3);
    expect(four).toMatch(/<span class="more">\+<\/span>$/);
  });

  test('a part at every level of the site has no marks', () => {
    const value = LEVELS.map((level) => level.id).join(' ');
    expect(viewWith(part(value)).html).toBe(part(value));
  });

  test('a site with fewer than two levels has no slider and no marks', () => {
    const view = viewWith(part('overview'), LEVELS.slice(0, 1));
    expect(view.levels).toEqual([]);
    expect(view.defaultLevel).toBe('');
    expect(view.parts).toEqual([]);
    expect(view.html).toBe(part('overview'));
  });

  test('only the wrapper of a fence gets marks, so the text of a part cannot', () => {
    const inText = '<div class="part" data-l="overview"><p>Text</p></div>';
    expect(viewWith(inText).html).toBe(inText);
  });

  test('a new name or icon of a level sends the page again', () => {
    const one = viewWith(part('overview'));
    const renamed = LEVELS.map((level, index) => (index ? level : { ...level, name: 'Summary' }));
    expect(viewWith(part('overview'), renamed).rev).not.toBe(one.rev);
  });
});

test.describe('the read times', () => {
  const RESTORE = '/restore.html';
  const STORAGE = '/storage.html';

  /** The words of each page, in the entry with no level rule. */
  function siteWithWords(words: Record<string, number>): Site {
    const site = siteOf(Object.fromEntries(Object.keys(words).map((url) => [url, url])));
    for (const page of site.pages) page.sizes = { '': { words: words[page.url]!, images: 0 } };
    return site;
  }

  test('a view holds the time of its page and of all pages', () => {
    const site = siteWithWords({ [RESTORE]: 60, [STORAGE]: 120 });
    expect(viewOf(site, RESTORE).readTimes).toEqual([{ level: '', page: 1, all: 3 }]);
    expect(viewOf(site, STORAGE).readTimes).toEqual([{ level: '', page: 2, all: 3 }]);
  });

  test('a view has one row per level on a site with two levels, and one row on a site with one', () => {
    const levels = [
      { id: 'overview', name: 'Overview' },
      { id: 'internals', name: 'Internals' },
    ];
    const site = siteWithWords({ [RESTORE]: 60 });
    site.pages[0]!.sizes = { overview: { words: 60, images: 0 }, internals: { words: 120, images: 0 }, '': { words: 180, images: 0 } };
    expect(viewOf({ ...site, levels, defaultLevel: 'overview' }, RESTORE).readTimes).toEqual([
      { level: 'overview', page: 1, all: 1 },
      { level: 'internals', page: 2, all: 2 },
    ]);
    expect(viewOf({ ...site, levels: levels.slice(0, 1), defaultLevel: 'overview' }, RESTORE).readTimes).toEqual([
      { level: '', page: 3, all: 3 },
    ]);
  });

  test('a view of an address with no page has 0 on the page and keeps the time of all pages', () => {
    expect(viewOf(siteWithWords({ [RESTORE]: 60 }), '/upgrade.html').readTimes).toEqual([{ level: '', page: 0, all: 1 }]);
    expect(viewOf(siteOf({}), '/').readTimes).toEqual([{ level: '', page: 0, all: 0 }]);
  });

  test('an open page gets an update when a save of another page changes the time of all pages', () => {
    const one = viewOf(siteWithWords({ [RESTORE]: 60, [STORAGE]: 120 }), RESTORE);
    expect(viewOf(siteWithWords({ [RESTORE]: 60, [STORAGE]: 120 }), RESTORE).rev).toBe(one.rev);
    const longer = viewOf(siteWithWords({ [RESTORE]: 60, [STORAGE]: 180 }), RESTORE);
    expect(longer.html).toBe(one.html);
    expect(longer.rev).not.toBe(one.rev);
  });

  test('an open page gets an update when the speed changes the times, and none when the minutes stay', () => {
    const site = siteWithWords({ [RESTORE]: 60 });
    const one = viewOf(site, RESTORE);
    expect(viewOf({ ...site, wordsPerMinute: 30 }, RESTORE).rev).not.toBe(one.rev);
    expect(viewOf(siteWithWords({ [RESTORE]: 59 }), RESTORE).rev).toBe(one.rev);
  });
});

test('a view holds the text width of the site, and a new text width gives an open page an update', () => {
  const site = siteOf({ '/restore.html': 'Restore a file' });
  const fallback = viewOf(site, '/restore.html');
  expect(fallback.textWidth).toBe(75);
  const sixty = viewOf({ ...site, textWidth: 60 }, '/restore.html');
  expect(sixty.textWidth).toBe(60);
  expect(sixty.html).toBe(fallback.html);
  expect(sixty.rev).not.toBe(fallback.rev);
});

test('a view carries the dimensions of the site, and a new name sends the page again', () => {
  const site = { ...siteOf({ '/legal/privacy.html': 'Privacy' }), dimensions: [{ folder: 'legal', name: 'Legal' }] };
  const view = viewOf(site, '/legal/privacy.html');
  expect(view.dimensions).toEqual([{ folder: 'legal', name: 'Legal' }]);
  const renamed = viewOf({ ...site, dimensions: [{ folder: 'legal', name: 'Legal and privacy' }] }, '/legal/privacy.html');
  expect(renamed.rev).not.toBe(view.rev);
  expect(viewOf(site, '/missing.html').dimensions).toEqual([{ folder: 'legal', name: 'Legal' }]);
});

test('a reader stays on a page that still exists', () => {
  const site = siteOf({ '/restore.html': 'Restore' });
  expect(nextUrl(site, site, '/restore.html')).toBe('/restore.html');
});

test('a reader follows a renamed page, found by its text', () => {
  const before = siteOf({ '/storage.html': 'Storage', '/restore.html': 'Text' });
  const after = siteOf({ '/storage.html': 'Storage', '/guide/get-it-back.html': 'Text' });
  expect(nextUrl(before, after, '/restore.html')).toBe('/guide/get-it-back.html');
});

test('a reader follows a page renamed and edited at once, found by its title', () => {
  const before = siteOf({ '/restore.html': 'Text' });
  const after = siteOf({ '/get-it-back.html': 'Other' });
  after.pages[0]!.title = before.pages[0]!.title;
  expect(nextUrl(before, after, '/restore.html')).toBe('/get-it-back.html');
});

test('a reader on a renamed page follows the page with the same text before one with the same title', () => {
  const before = siteOf({ '/restore.html': 'Text' });
  const after = siteOf({ '/same-title.html': 'Other', '/same-text.html': 'Text' });
  after.pages[0]!.title = 'Text';
  after.pages[1]!.title = 'Another title';
  expect(nextUrl(before, after, '/restore.html')).toBe('/same-text.html');
});

test('a reader on a deleted page moves to the next page, or else the page before', () => {
  const before = siteOf({ '/agents.html': 'Agents', '/restore.html': 'Restore', '/storage.html': 'Storage' });
  expect(nextUrl(before, siteOf({ '/agents.html': 'Agents', '/storage.html': 'Storage' }), '/restore.html')).toBe('/storage.html');
  expect(nextUrl(before, siteOf({ '/agents.html': 'Agents', '/restore.html': 'Restore' }), '/storage.html')).toBe('/restore.html');
});

test('a reader on a deleted page with the same text as an older page moves to the next page', () => {
  const before = siteOf({ '/agents.html': 'Same text', '/restore.html': 'Same text', '/storage.html': 'Storage' });
  const after = siteOf({ '/agents.html': 'Same text', '/storage.html': 'Storage' });
  expect(nextUrl(before, after, '/restore.html')).toBe('/storage.html');
});

test('a reader on a page deleted with the next page moves to the next page that still exists', () => {
  const before = siteOf({ '/restore.html': 'Restore', '/schedules.html': 'Schedules', '/team.html': 'Team plan' });
  const after = siteOf({ '/team.html': 'Team plan' });
  expect(nextUrl(before, after, '/restore.html')).toBe('/team.html');
});

test('a reader on the last deleted page moves to the site root', () => {
  expect(nextUrl(siteOf({ '/restore.html': 'Restore' }), siteOf({}), '/restore.html')).toBe('/');
});

test('a reader on a 404 address or the site root stays there', () => {
  const site = siteOf({ '/restore.html': 'Restore' });
  expect(nextUrl(site, site, '/upgrade.html')).toBe('/upgrade.html');
  expect(nextUrl(siteOf({}), site, '/')).toBe('/');
});
