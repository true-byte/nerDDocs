import { expect, test } from '@playwright/test';
import type { PageView } from '../../src/site/view.ts';
import { levelRule } from '../../src/page/levels.ts';
import { renderPage } from '../../src/page/page-html.tsx';
import { DIMENSIONS } from '../support/dimensions.ts';
import { elementAround, elementAt, openingTag } from '../support/html.ts';

const view: PageView = {
  url: '/backups/restore.html',
  rev: 'r1',
  siteName: 'Backup <app>',
  tree: [
    {
      kind: 'section',
      id: 'backups',
      title: 'Backups',
      children: [
        { kind: 'page', url: '/backups/restore.html', title: 'Restore a <file>' },
        { kind: 'page', url: '/backups/schedules.html', title: 'Schedules' },
      ],
    },
    { kind: 'page', url: '/storage.html', title: 'Storage' },
  ],
  docTitle: 'Restore a <file> - Backup <app>',
  title: 'Restore a <file>',
  titleId: 'restore-a-file',
  html: '<p>Pick a file.</p>',
  levels: [],
  defaultLevel: '',
  parts: [],
  hasShared: true,
  hasSharedText: true,
  configProblem: null,
  readTimes: [{ level: '', page: 2, all: 5 }],
  diagrams: 'none',
  dimensions: [],
  anchors: {},
  linkLevels: {},
  linkTargets: {},
  neighbors: { previous: null, next: null },
};

const dataOf = (html: string) => JSON.parse(/<script id="nd-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}');

/** The page foot, from its opening tag to its end tag, and the HTML right before it and right after it. */
function footOf(html: string): { foot: string; before: string; after: string } {
  const at = html.search(openingTag('nav', { id: 'pgFoot', class: 'pg-foot', 'aria-label': 'Pages' }));
  if (at < 0) throw new Error('The page has no foot.');
  const foot = elementAt(html, at);
  return { foot, before: html.slice(0, at), after: html.slice(at + foot.length) };
}

const ARROW = '<path d="M5 12h14M13 6l6 6-6 6"/>';

test('the title sits in one line with the read time, and the page data holds the read times', () => {
  const html = renderPage(view, { live: true });
  expect(html).toMatch(
    /<div class="title-line"><h1 id="restore-a-file">Restore a &lt;file&gt;<\/h1><span id="tl-slot"><button [^>]*id="tlB"[^>]*>.*<span>2m<\/span><\/button><button [^>]*id="lnkT"[^>]*>.*?<\/button><\/span><\/div>/,
  );
  expect(html).toContain('"readTimes":[{"level":"","page":2,"all":5}]');
});

test('the page data holds the diagram build', () => {
  for (const diagrams of ['none', 'tiny', 'full'] as const) {
    const html = renderPage({ ...view, diagrams }, { live: true });
    const data = /<script id="nd-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(JSON.parse(data ?? '{}').diagrams, diagrams).toBe(diagrams);
  }
});

test('the page data holds the dimensions', () => {
  const html = renderPage({ ...view, dimensions: DIMENSIONS }, { live: true });
  const data = /<script id="nd-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1];
  expect(JSON.parse(data ?? '{}').dimensions).toEqual(DIMENSIONS);
});

test('the page data holds the levels of the ids of the page and of its links', () => {
  const anchors = { 'search-index': 'internals' };
  const linkLevels = { '/backups/schedules.html#weekly-plan': 'requirements' };
  const html = renderPage({ ...view, anchors, linkLevels }, { live: true });
  const data = /<script id="nd-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1];
  expect(JSON.parse(data ?? '{}')).toMatchObject({ anchors, linkLevels });
});

test('the page data holds the page before and the page after, and the parts of each linked page', () => {
  const neighbors = {
    previous: { url: '/start.html', title: 'Get started', minutes: { '': 1 } },
    next: { url: '/backups/schedules.html', title: 'Schedules', minutes: { '': 2 } },
  };
  const linkTargets = { '/backups/schedules.html': { parts: ['requirements'], hasSharedText: true } };
  expect(dataOf(renderPage({ ...view, neighbors, linkTargets }, { live: true }))).toMatchObject({ neighbors, linkTargets });
});

test.describe('the page foot', () => {
  const neighbors = {
    previous: { url: '/start.html', title: 'Get <started>', minutes: { '': 1 } },
    next: { url: '/backups/schedules.html', title: 'Schedules', minutes: { '': 12 } },
  };

  test("it sits right after the text, inside the column, as the nav 'Pages' with a link to each neighbor by its relative address", () => {
    const { foot, before, after } = footOf(renderPage({ ...view, neighbors }, { live: false }));
    expect(before).toMatch(/<\/article>\s*$/);
    expect(after).toMatch(/^\s*<\/div>\s*<\/main>/);
    expect([...foot.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map(([, href]) => href)).toEqual(['../start.html', 'schedules.html']);
  });

  test('the previous link holds the arrow, the title, then the minutes, and the next link the title, the minutes, then the arrow', () => {
    const { foot } = footOf(renderPage({ ...view, neighbors }, { live: false }));
    const previous = elementAround(foot, 'a', 'Get &lt;started&gt;');
    const next = elementAround(foot, 'a', 'Schedules');
    expect(previous.indexOf(ARROW)).toBeGreaterThan(-1);
    expect(previous.indexOf(ARROW)).toBeLessThan(previous.indexOf('Get &lt;started&gt;'));
    expect(previous.indexOf('Get &lt;started&gt;')).toBeLessThan(previous.indexOf('>1m<'));
    expect(next.indexOf('Schedules')).toBeLessThan(next.indexOf('>12m<'));
    expect(next.indexOf('>12m<')).toBeLessThan(next.indexOf(ARROW));
  });

  test('a page with one neighbor has a foot with one link, and a page with neither has no foot', () => {
    const { foot } = footOf(renderPage({ ...view, neighbors: { previous: null, next: neighbors.next } }, { live: false }));
    expect(foot.match(/<a\b/g)).toHaveLength(1);
    expect(foot).toContain('href="schedules.html"');
    expect(renderPage(view, { live: false })).not.toContain('pgFoot');
  });

  test('the foot holds the minutes of the neighbor at each level', () => {
    const levels = [
      { id: 'overview', name: 'Overview' },
      { id: 'internals', name: 'Internals' },
    ];
    const next = { url: '/backups/schedules.html', title: 'Schedules', minutes: { overview: 1, internals: 12 } };
    const html = renderPage(
      { ...view, levels, defaultLevel: 'overview', parts: ['overview', 'internals'], neighbors: { previous: null, next } },
      { live: false },
    );
    const link = elementAround(footOf(html).foot, 'a', 'Schedules');
    expect(link).toContain('>1m<');
    expect(link).toContain('>12m<');
  });
});

test('the column holds the text width of the site, so the text has it before the page script runs', () => {
  expect(renderPage({ ...view, textWidth: 60 }, { live: true })).toContain('<div class="col" style="--text-default:60">');
  expect(renderPage(view, { live: true })).toContain('<div class="col" style="--text-default:75">');
});

test("a page with no time has only 'Copy link' next to the title", () => {
  const html = renderPage({ ...view, readTimes: [{ level: '', page: 0, all: 5 }] }, { live: true });
  expect(html).toMatch(/<\/h1><span id="tl-slot"><button [^>]*id="lnkT"[^>]*>.*?<\/button><\/span><\/div>/);
});

test('the page HTML holds the text and the nav', () => {
  const html = renderPage(view, { live: true });
  expect(html).toContain('<article id="page"><p>Pick a file.</p></article>');
  expect(html).toContain('<h1 id="restore-a-file">Restore a &lt;file&gt;</h1>');
  expect(html).toContain('<title>Restore a &lt;file&gt; - Backup &lt;app&gt;</title>');
  expect(html).toContain('href="schedules.html"');
  expect(html).toContain('href="../storage.html"');
  expect(html).toContain('aria-current="page"');
});

test('the page holds one unseen status line for the copy icons, after the text', () => {
  const html = renderPage(view, { live: false });
  const status = '<div id="nd-status" class="sr-only" role="status"></div>';
  expect(html.split(status)).toHaveLength(2);
  expect(html.indexOf(status)).toBeGreaterThan(html.indexOf('</main>'));
  expect(html.indexOf(status)).toBeLessThan(html.indexOf('<script id="nd-data"'));
});

test('a title that shows &lt; as text keeps it in the heading and the window title', () => {
  const html = renderPage({ ...view, title: 'Use &lt; here', docTitle: 'Use &lt; here - Backup app' }, { live: true });
  expect(html).toContain('>Use &amp;lt; here</h1>');
  expect(html).toContain('<title>Use &amp;lt; here - Backup app</title>');
});

test('a phone lays out the page at its own width', () => {
  expect(renderPage(view, { live: true })).toContain('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">');
});

test('only the current page is marked in the nav', () => {
  const html = renderPage(view, { live: true });
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).toMatch(/href="restore\.html" aria-current="page"/);
});

test('the page loads one classic script and one style by relative address', () => {
  const html = renderPage(view, { live: true });
  expect(html.match(/<script [^>]*src=/g)).toHaveLength(1);
  expect(html).toContain('<script src="../__nerddocs/app.js" defer></script>');
  expect(html).toContain('<link rel="stylesheet" href="../__nerddocs/app.css">');
  expect(html).not.toContain('type="module"');
  expect(html).not.toMatch(/https?:\/\//);
});

test('a page with no title id has a heading with no id', () => {
  const html = renderPage({ ...view, title: '404', titleId: '' }, { live: true });
  expect(html).toContain('<h1>404</h1>');
});

test('a site name with a script tag cannot close the embedded data', () => {
  const html = renderPage({ ...view, siteName: '</script><b>' }, { live: true });
  expect(html).not.toContain('</script><b>"');
  expect(html).toContain('\\u003c/script>');
});

test('only a served page turns live updates on', () => {
  expect(renderPage(view, { live: true })).toContain('"live":true');
  expect(renderPage(view, { live: false })).toContain('"live":false');
});

test.describe('a page with levels', () => {
  const levels = [
    { id: 'overview', name: 'Overview' },
    { id: 'internals', name: 'Internals' },
  ];
  const leveled = (more: Partial<PageView>) => renderPage({ ...view, levels, defaultLevel: 'overview', ...more }, { live: true });

  test('the level rule in the head hides the other levels at the first paint', () => {
    const html = leveled({ parts: ['overview', 'internals'] });
    expect(html).toContain(`<style id="nd-level" data-level="overview">${levelRule('overview')}</style>`);
    expect(html.indexOf('id="nd-level"')).toBeLessThan(html.indexOf('</head>'));
  });

  test('a page with no text at the default level opens at the nearest lower level with text, or else at the nearest higher one', () => {
    const three = [levels[0]!, { id: 'requirements', name: 'Requirements' }, levels[1]!];
    expect(leveled({ levels: three, defaultLevel: 'internals', parts: ['overview', 'requirements'], hasSharedText: false })).toContain('data-level="requirements"');
    expect(leveled({ parts: ['internals'], hasSharedText: false })).toContain('data-level="internals"');
  });

  test('a page with shared text opens at the default level, also with no part at it', () => {
    expect(leveled({ parts: ['internals'], hasSharedText: true })).toContain('data-level="overview"');
  });

  test('a page at a level with one kind of part and no shared text opens with the marks off', () => {
    expect(leveled({ parts: ['overview', 'internals'], hasShared: false })).toContain('<article id="page" class="samemarks">');
    expect(leveled({ parts: ['overview', 'internals'], hasShared: true })).toContain('<article id="page">');
    expect(leveled({ parts: ['overview', 'overview internals'], hasShared: false })).toContain('<article id="page">');
  });

  test('the slider data reaches the page, and the slider renders in the page HTML', () => {
    const html = leveled({ parts: ['overview', 'internals'], hasShared: true });
    expect(html).toContain('"defaultLevel":"overview"');
    expect(html).toContain('"parts":["overview","internals"]');
    expect(html).toContain('<div id="bar" class="levels">');
    expect(html).toContain('role="slider"');
  });

  test('the time next to the title shows always on a site with no levels and on a page with no parts, and no other page', () => {
    const readTimes = [
      { level: 'overview', page: 1, all: 5 },
      { level: 'internals', page: 12, all: 15 },
    ];
    const always = /<button [^>]*id="tlB"[^>]*\bdata-always\b/;
    expect(renderPage(view, { live: true })).toMatch(always);
    expect(leveled({ parts: [], readTimes })).toMatch(always);
    const withParts = leveled({ parts: ['overview', 'internals'], readTimes });
    expect(withParts).toContain('id="tlB"');
    expect(withParts).not.toMatch(always);
    expect(withParts).toContain('<span data-shows="overview">1m</span><span data-shows="internals">12m</span>');
  });

  test('a site with no levels has an empty level rule and no slider', () => {
    const html = renderPage(view, { live: true });
    expect(html).toContain('<style id="nd-level" data-level=""></style>');
    expect(html).toContain('<div id="bar">');
    expect(html).not.toContain('role="slider"');
    expect(html).not.toContain('id="tab"');
  });

  test('a page with no parts on a site with levels holds the label in place of the stops at the first paint', () => {
    const html = leveled({ parts: [] });
    expect(html).toMatch(/id="no-levels"[^>]*>No levels on this page</);
    expect(html).not.toContain('role="slider"');
    expect(html).not.toContain('class="stop');
  });

  test('a page with parts and a site with no levels hold no label', () => {
    expect(leveled({ parts: ['overview', 'internals'] })).not.toContain('id="no-levels"');
    expect(renderPage(view, { live: true })).not.toContain('id="no-levels"');
  });

  test('a page with a problem in its config is no dialog before the page script runs', () => {
    expect(renderPage({ ...view, configProblem: 'missing' }, { live: true })).not.toMatch(/<dialog\b[^>]*\sopen(=|\s|>)/);
  });

  test('a page with no parts on a site with many levels has no icons class at the first paint', () => {
    const many = Array.from({ length: 8 }, (_, n) => ({ id: `level-${n}`, name: `Level ${n}` }));
    const html = renderPage({ ...view, levels: many, defaultLevel: 'level-0', parts: [] }, { live: true });
    expect(html).toContain('id="no-levels"');
    expect(html).not.toMatch(/<div id="bar"[^>]*\bcompact\b/);
  });

  test('the first paint guesses icons for a site with many levels', () => {
    const many = Array.from({ length: 8 }, (_, n) => ({ id: `level-${n}`, name: `Level ${n}` }));
    expect(renderPage({ ...view, levels: many, defaultLevel: 'level-0', parts: ['level-0'] }, { live: true })).toContain(
      '<div id="bar" class="levels compact">',
    );
  });
});
