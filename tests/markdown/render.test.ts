import { expect, test } from '@playwright/test';
import { renderMarkdown, type SearchUnit } from '../../src/markdown/render.ts';
import { cellClass, openingTag } from '../support/html.ts';
import { fakeFiles } from '../support/images.ts';
import { apiFiles, BACKUP_API_PAGE, BACKUP_SPEC } from '../support/openapi.ts';
import { ALL_PLAN_SETTINGS } from '../support/page-content.ts';
import { WIZARD_HTML, WIZARD_LINE } from '../support/wireframes.ts';

const LISTED = ['overview', 'requirements', 'internals'];

function render(source: string, url = '/backups/restore.html', listed: readonly string[] = LISTED) {
  return renderMarkdown(source, url, 'File name', listed);
}

test('a first heading at the top of the file becomes the title and leaves the text', () => {
  const page = render('# Restore a file\n\nPick a file and a day.');
  expect(page.title).toBe('Restore a file');
  expect(page.titleId).toBe('restore-a-file');
  expect(page.html).toBe('<p>Pick a file and a day.</p>');
});

test('a comment above the first heading leaves it the opening heading', () => {
  const page = render('<!-- Draft of the guide -->\n\n# Restore a file\n\nPick a file.');
  expect(page.title).toBe('Restore a file');
  expect(page.html).not.toContain('<h1');
});

test('the first heading gives the title at any depth', () => {
  expect(render('## Pick a day\n\nClick a day.').title).toBe('Pick a day');
  expect(render('# Restore `Ctrl+R`').title).toBe('Restore Ctrl+R');
  expect(render('<div><h1>From raw HTML</h1></div>').title).toBe('From raw HTML');
});

test('an opening heading with its own id keeps that id on the title', () => {
  const page = render('<h1 id="get-it-back">Restore a file</h1>\n\nPick a file.');
  expect(page.title).toBe('Restore a file');
  expect(page.titleId).toBe('get-it-back');
});

test('a heading at any depth from h1 to h6 gives the title and leaves the text', () => {
  for (const marks of ['#', '##', '###', '####', '#####', '######']) {
    const page = render(`${marks} Pick a day\n\nClick a day.`);
    expect(page.title).toBe('Pick a day');
    expect(page.html).toBe('<p>Click a day.</p>');
  }
});

test('a heading after other text gives the title and stays in the text', () => {
  const page = render('Pick a file.\n\n# Restore a file\n\nPick a day.');
  expect(page.title).toBe('Restore a file');
  expect(page.html).toContain('<h1 id="restore-a-file-1">Restore a file</h1>');
});

test('a heading that stays in the text keeps its own id, and the title gets another', () => {
  const page = render('Pick a file.\n\n<h1 id="get-it-back">Restore a file</h1>');
  expect(page.titleId).toBe('restore-a-file');
  expect(page.html).toContain('<h1 id="get-it-back">');
});

test('a page with no heading takes the fallback title', () => {
  expect(render('Pick a file.').title).toBe('File name');
  expect(render('').title).toBe('File name');
  expect(render('#\n\nPick a file.').title).toBe('File name');
});

test('the footnote heading never gives the title', () => {
  expect(render('Pick a day.[^1]\n\n[^1]: A day with a copy.').title).toBe('File name');
});

test('a relative link to a Markdown file opens that page', () => {
  const links: [string, string][] = [
    ['[Schedules](schedules.md)', 'schedules.html'],
    ['[Schedules](./schedules.md#plans)', './schedules.html#plans'],
    ['[Storage](../storage.MD)', '../storage.html'],
    ['[Storage](/storage.md)', '../storage.html'],
    ['[Team plan](plans/team.md?view=short#days)', 'plans/team.html?view=short#days'],
    ['<a href="schedules.md">Schedules</a>', 'schedules.html'],
  ];
  for (const [source, href] of links) {
    expect(render(source).html).toContain(`href="${href}"`);
  }
});

test('other links stay as written', () => {
  const links: [string, string][] = [
    ['[Docs](https://example.com/restore.md)', 'https://example.com/restore.md'],
    ['[Docs](//example.com/restore.md)', '//example.com/restore.md'],
    ['[Docs](HTTPS://backups.example/restore.md)', 'HTTPS://backups.example/restore.md'],
    ['[Mia](mailto:mia@example.com)', 'mailto:mia@example.com'],
    ['[Pick a day](#pick-a-day)', '#pick-a-day'],
    ['[Screenshot](restore-window.png)', 'restore-window.png'],
  ];
  for (const [source, href] of links) {
    expect(render(source).html).toContain(`href="${href}"`);
  }
});

test('a link or image from the site root becomes relative', () => {
  expect(render('![Restore window](/images/restore-window.png)').html).toContain(
    'src="../images/restore-window.png"',
  );
});

test('a link to the site root or with a broken escape still renders', () => {
  expect(render('[Home](/)', '/restore.html').html).toContain('href="./"');
  expect(render('[Restore](/restore-100%.md)').html).toContain('href="../restore-100%25.html"');
});

test('plain colons stay as written', () => {
  const text = 'See src/restore.ts:41, then file:line and 10:30 :smile: plan:day:copy.';
  expect(render(text).html).toBe(`<p>${text}</p>`);
});

test('GitHub tables, strikethrough and task lists render', () => {
  const page = render('| Plan | Days |\n|---|---|\n| Basic | 14 |\n\n~~old~~\n\n- [x] done');
  expect(page.html).toContain('<div class="wide"><div class="sbox"><table>');
  expect(page.html).toContain('<del>old</del>');
  expect(page.html).toContain('type="checkbox"');
});

test('a table inside a quote or a list scrolls sideways in its own box', () => {
  const table = '| Plan | Days |\n  |---|---|\n  | Basic | 14 |';
  expect(render(`> ${table.replaceAll('  ', '> ')}`).html).toContain('<div class="wide"><div class="sbox"><table>');
  expect(render(`- Plans:\n\n  ${table}`).html).toContain('<div class="wide"><div class="sbox"><table>');
});

test.describe('table cells', () => {
  test('a cell of up to 12 characters gets no mark, and a longer cell is marked long', () => {
    const { html } = render('| Start | Runs |\n|---|---|\n| Sunday 03:00 | Every 6 hours |');
    expect(cellClass(html, 'Start')).toBeNull();
    expect(cellClass(html, 'Sunday 03:00')).toBeNull();
    expect(cellClass(html, 'Every 6 hours')).toBe('long');
  });

  test('the count is of the trimmed text in characters, with code', () => {
    const { html } = render(
      '| Rule | Name | Kind |\n|---|---|---|\n| `PLAN-1` | Größe der Kopie | Backup 📦📦📦📦📦 |\n\n<table><tr><td>\n  Sunday   03:00\n</td></tr></table>',
    );
    expect(cellClass(html, 'PLAN-1')).toBeNull();
    expect(cellClass(html, 'Größe der Kopie')).toBe('long');
    expect(cellClass(html, 'Backup 📦📦📦📦📦')).toBeNull();
    expect(cellClass(html, 'Sunday 03:00')).toBeNull();

    const settings = render(ALL_PLAN_SETTINGS).html;
    expect(cellClass(settings, 'Bandwidth limit')).toBe('long');
    expect(cellClass(settings, 'Copies kept')).toBeNull();
  });

  test('a raw HTML table gets the same box and marks, and a cell keeps its class', () => {
    const { html } = render('<table><tr><td class="note">Every 6 hours</td><td>Team</td></tr></table>');
    expect(html).toContain('<div class="wide"><div class="sbox"><table>');
    expect(cellClass(html, 'Every 6 hours')).toBe('note long');
    expect(cellClass(html, 'Team')).toBeNull();
  });

  test('an alignment mark stays with the long mark', () => {
    const { html } = render('| Plan | Runs |\n|:---|---:|\n| Team | Every 6 hours |');
    expect(html).toMatch(openingTag('td', { align: 'right', class: 'long' }));
    expect(cellClass(html, 'Every 6 hours')).toBe('long');
  });
});

test('raw HTML renders and cannot break the page around it', () => {
  const page = render('<div class="note">Pick a <b>day');
  expect(page.html).toContain('<div class="note">');
  expect(page.html.match(/<\/div>/g)).toHaveLength(1);
});

test('headings get unique ids that links can use', () => {
  const page = render('# Restore\n\n## Pick a day\n\n## Pick a day\n\n## Restore\n\n<h2 id="own">Own</h2>');
  expect(page.html).toContain('<h2 id="pick-a-day">');
  expect(page.html).toContain('<h2 id="pick-a-day-1">');
  expect(page.html).toContain('<h2 id="restore-1">');
  expect(page.html).toContain('<h2 id="own">');
});

test('a heading keeps its letters of any language in its id', () => {
  expect(render('# Restore\n\n## Wählen Sie einen Tag!').html).toContain('<h2 id="wählen-sie-einen-tag">');
});

test('each repeat of a heading gets its own id', () => {
  const page = render('# Restore\n\n## Pick a day\n\n## Pick a day\n\n## Pick a day');
  expect(page.html).toContain('<h2 id="pick-a-day">');
  expect(page.html).toContain('<h2 id="pick-a-day-1">');
  expect(page.html).toContain('<h2 id="pick-a-day-2">');
});

test('a heading keeps the digits, underscores and hyphens of its name in its id, so a link can use them', () => {
  const page = render('# Restore\n\n## Step 2\n\n## backup_agent\n\n## Get-it-back');
  expect(page.html).toContain('<h2 id="step-2">');
  expect(page.html).toContain('<h2 id="backup_agent">');
  expect(page.html).toContain('<h2 id="get-it-back">');
});

test('a heading keeps its combining marks in its id', () => {
  expect(render('# Restore\n\n## Cafe\u0301 plan').html).toContain('<h2 id="cafe\u0301-plan">');
});

test('a heading after a raw heading with the same id gets its own id', () => {
  const page = render('# Restore\n\n<h2 id="pick-a-day">Own</h2>\n\n## Pick a day');
  expect(page.html).toContain('<h2 id="pick-a-day">Own</h2>');
  expect(page.html).toContain('<h2 id="pick-a-day-1">Pick a day</h2>');
});

test('a heading with the id of the title gets its own id, so a link to it stays on it', () => {
  const page = render('<h1 id="get-it-back">Restore a file</h1>\n\n## Get it back');
  expect(page.titleId).toBe('get-it-back');
  expect(page.html).toContain('<h2 id="get-it-back-1">');
});

test.describe('the ids of the elements of the page itself', () => {
  /** The ids of the app that a heading can make: each is in lower case with no other mark. */
  const OWN_IDS = [
    'page',
    'app',
    'contents',
    'panel',
    'rail',
    'tree',
    'bar',
    'tab',
    'thumb',
    'ticks',
    'no-levels',
    'nd-level',
    'nd-data',
    'nd-shut',
    'config-modal',
    'config-title',
    'config-ok',
    'nd-status',
  ];

  test("a heading titled 'Page' gets an id of its own, in the text and as the title", () => {
    expect(render('# Restore a file\n\n## Page').html).not.toContain('id="page"');
    expect(render('# Page\n\nPick a file.').titleId).not.toBe('page');
    expect(render('# Page\n\nPick a file.').title).toBe('Page');
    expect(render('Pick a file.\n\n# Page').titleId).not.toBe('page');
    expect(render('Pick a file.\n\n# Page').html).not.toContain('id="page"');
  });

  for (const id of OWN_IDS) {
    test(`a heading that would get the id ${id} gets another`, () => {
      expect(render(`# Restore a file\n\n## ${id}`).html).not.toContain(`id="${id}"`);
      expect(render(`# ${id}`).titleId).not.toBe(id);
    });
  }

  test('two headings with the name of an element of the page each get their own id', () => {
    const { html } = render('# Restore a file\n\n## Page\n\n## Page');
    const ids = [...html.matchAll(/<h2 id="([^"]*)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain('page');
  });
});

test('a small heading gets an id that links can use', () => {
  const page = render('# Restore\n\n##### Pick a day\n\n###### Pick a file');
  expect(page.html).toContain('<h5 id="pick-a-day">');
  expect(page.html).toContain('<h6 id="pick-a-file">');
});

test.describe('the outline', () => {
  const ids = (source: string) => render(source).outline.map((row) => row.id);
  const showsOf = (source: string) => render(source).outline.map((row) => row.shows);

  test('the headings of the text give rows in page order', () => {
    const page = render('# Restore a file\n\n## Pick a file\n\nPick.\n\n### Search index\n\nScan.\n\n## Pick a day\n\nClick.');
    expect(page.outline).toEqual([
      { id: 'pick-a-file', text: 'Pick a file', rank: 2, shows: null },
      { id: 'search-index', text: 'Search index', rank: 3, shows: null },
      { id: 'pick-a-day', text: 'Pick a day', rank: 2, shows: null },
    ]);
    for (const { id } of page.outline) expect(page.html).toContain(`id="${id}"`);
  });

  test('the outline lists the two highest ranks that the text uses', () => {
    expect(ids('# Restore a file\n\n## Pick a day\n\nClick.\n\n### The copy rule\n\nTake the newest.\n\n#### Index size\n\n40 bytes.')).toEqual([
      'pick-a-day',
      'the-copy-rule',
    ]);
    expect(ids('# Restore a file\n\n### The copy rule\n\nTake the newest.\n\n#### Index size\n\n40 bytes.\n\n##### Block ids\n\nOne id.')).toEqual([
      'the-copy-rule',
      'index-size',
    ]);
    expect(ids('# Restore a file\n\n## Pick a day\n\nClick.\n\n#### Index size\n\n40 bytes.')).toEqual(['pick-a-day', 'index-size']);
  });

  test('the ranks count at every level', () => {
    const page = render(
      '# Restore a file\n\n::: internals\n## Search index\n\nScan.\n:::\n\n### The copy rule\n\nTake the newest.\n\n#### Index size\n\n40 bytes.',
    );
    expect(page.outline).toEqual([
      { id: 'search-index', text: 'Search index', rank: 2, shows: 'internals' },
      { id: 'the-copy-rule', text: 'The copy rule', rank: 3, shows: null },
    ]);
  });

  test('a heading inside a fence shows at the levels of the fence', () => {
    const inFence = (levels: string) => `# Restore a file\n\n::: ${levels}\n### Search index\n\nScan.\n:::\n`;
    expect(showsOf(inFence('internals'))).toEqual(['internals']);
    expect(showsOf(inFence('requirements internals'))).toEqual(['requirements internals']);
    expect(showsOf(inFence('overview requirements internals'))).toEqual([null]);
  });

  test('a shared heading with no text at a level shows where its section has text', () => {
    expect(render('# Restore a file\n\n## Pick a day\n\n::: internals\nA job.\n:::').outline).toEqual([
      { id: 'pick-a-day', text: 'Pick a day', rank: 2, shows: 'internals' },
    ]);
  });

  test('in a file of # sections, the first # is the title and the others are rows', () => {
    const page = render('# Restore a file\n\nPick.\n\n# Pick a day\n\nClick.\n\n# Check the result\n\nOpen it.');
    expect(page.title).toBe('Restore a file');
    expect(page.outline.map(({ id, rank }) => [id, rank])).toEqual([
      ['pick-a-day', 1],
      ['check-the-result', 1],
    ]);
  });

  test('a heading in details, the footnotes heading and an empty heading get no row and count for no rank', () => {
    const page = render(
      '# Restore a file\n\n<details>\n<summary>More</summary>\n\n## Restore from tape\n\nAsk an admin.\n\n</details>\n\n### The copy rule\n\nTake the newest.[^1]\n\n#### Index size\n\n40 bytes.\n\n##\n\n[^1]: A closed copy.',
    );
    expect(page.outline.map(({ id, rank }) => [id, rank])).toEqual([
      ['the-copy-rule', 3],
      ['index-size', 4],
    ]);
  });

  test('a row keeps the plain text of its heading and the id of a raw heading', () => {
    expect(render('# Restore a file\n\n## Restore `Ctrl+R`').outline).toEqual([
      { id: 'restore-ctrlr', text: 'Restore Ctrl+R', rank: 2, shows: null },
    ]);
    expect(ids('# Restore a file\n\n<h2 id="get-it-back">Get it back</h2>')).toEqual(['get-it-back']);
    expect(render('# Restore a file\n\n## Pick a day[^1]\n\n[^1]: A day.').outline.map((row) => row.text)).toEqual(['Pick a day']);
  });

  test('a first heading after other text stays in the text and gets a row', () => {
    expect(render('Pick a file.\n\n# Restore a file\n\nPick a day.').outline).toEqual([
      { id: 'restore-a-file-1', text: 'Restore a file', rank: 1, shows: null },
    ]);
  });

  test('a page with no heading has no rows', () => {
    expect(render('Pick a file.').outline).toEqual([]);
  });

  test('a part inside a raw HTML wrapper gives its levels to its heading', () => {
    expect(showsOf('# Restore a file\n\n<div>\n\n::: internals\n## Search index\n\nScan.\n:::\n\n</div>')).toEqual(['internals']);
  });
});

test.describe('text at several levels', () => {
  test('a page gives each different part in order of first use', () => {
    const page = render('::: internals overview\nOne.\n::: overview\nTwo.\n::: overview\nThree.\n:::\n');
    expect(page.parts).toEqual(['internals overview', 'overview']);
  });

  test('a page knows whether it has text outside its parts', () => {
    expect(render('::: overview\nOne.\n:::\n').hasShared).toBe(false);
    expect(render('# Restore a file\n\n::: overview\nOne.\n:::\n').hasShared).toBe(false);
    expect(render('::: overview\nOne.\n:::\n\nA restore never changes the copy.\n').hasShared).toBe(true);
    expect(render('<!-- A note. -->\n\n::: overview\nOne.\n:::\n').hasShared).toBe(false);
  });

  test('Markdown inside a part renders', () => {
    const { html } = render('::: overview\n**Pick** a file.\n\n- One\n- Two\n:::\n');
    expect(html).toContain('<div class="part" data-l="overview"><div class="bd">');
    expect(html).toContain('<strong>Pick</strong>');
    expect(html).toContain('<li>One</li>');
  });

  test('a heading inside a part never gives the title, and it still gets an id', () => {
    const page = render('::: overview\n# In a part\n:::\n');
    expect(page.title).toBe('File name');
    expect(page.html).toContain('<h1 id="in-a-part">In a part</h1>');
  });

  test('the first heading outside the parts gives the title', () => {
    expect(render('::: overview\n# In a part\n:::\n\n# Restore a file\n').title).toBe('Restore a file');
  });

  test('a byte order mark leaves the first heading the title of the page', () => {
    const page = render('\uFEFF# Restore a file\n\n::: overview\nPick a file.\n:::\n');
    expect(page.title).toBe('Restore a file');
    expect(page.parts).toEqual(['overview']);
    expect(page.html).not.toContain('Restore a file');
  });

  test('a byte order mark before a fence opens the part', () => {
    expect(render('\uFEFF::: overview\nPick a file.\n:::\n').parts).toEqual(['overview']);
  });

  test('a part inside a raw HTML wrapper counts for the levels of the page', () => {
    const page = render('<details>\n<summary>More</summary>\n\n::: overview\nOne.\n::: internals\nTwo.\n:::\n\n</details>\n');
    expect(page.parts).toEqual(['overview', 'internals']);
    expect(page.hasShared).toBe(true);
    expect(page.html).toMatch(/<details[^>]*>[^]*<div class="part" data-l="overview">[^]*<div class="part" data-l="internals">[^]*<\/details>/);
  });

  test('a code block under a list marker keeps its fence lines, and the fence after it opens a part', () => {
    const page = render('- ```\n  ::: internals\n  ```\n\n::: overview\nOne.\n:::\n');
    expect(page.html).toContain('<code>::: internals</code>');
    expect(page.parts).toEqual(['overview']);
  });

  test('a code block still open at the end of a part stays inside the part', () => {
    const { html } = render('::: overview\n```\nrestore --from monday\n');
    expect(html).toMatch(
      /<div class="part" data-l="overview"><div class="bd">\n<div class="code"><pre class="sbox"><code>restore --from monday[^]*<\/code><\/pre><button[^]*<\/button><\/div>\n<\/div><\/div>$/,
    );
  });

  test('a raw div that only looks like a part with a broken level list is no part', () => {
    expect(render('<div class="part" data-l="a&quot;b"><div class="bd">One</div></div>\n').parts).toEqual([]);
  });

  test('a fence line with a word that is not listed shows as text, and the page reports the word', () => {
    const page = render('::: testers\nPick a file.\n\n::: overview\nOne.\n:::\n');
    expect(page.html).toContain('<p>::: testers</p>');
    expect(page.html).toContain('<p>Pick a file.</p>');
    expect(page.parts).toEqual(['overview']);
    expect(page.unknownLevels).toEqual(['testers']);
  });

  test('with no listed levels each fence line shows as text and the page reports nothing', () => {
    const page = render('::: overview\nPick a file.\n:::\n', '/restore.html', []);
    expect(page.html.replaceAll('\n', '')).toBe('<p>::: overview</p><p>Pick a file.</p><p>:::</p>');
    expect(page.parts).toEqual([]);
    expect(page.unknownLevels).toEqual([]);
  });

  test('a line that a level id cannot make stays in the paragraph around it', () => {
    expect(render('Pick a time.\n::: 10:30\nDone.\n').html).toBe('<p>Pick a time.\n::: 10:30\nDone.</p>');
  });

  test('an escaped fence prints three colons and the part stays open', () => {
    const { html, parts, unknownLevels } = render('::: overview\nPick a file.\n\n\\:::\n\nPick a day.\n:::\n\nShared text.\n');
    expect(parts).toEqual(['overview']);
    expect(unknownLevels).toEqual([]);
    expect(html).toMatch(/<div class="part" data-l="overview"><div class="bd">[^]*<p>:::<\/p>[^]*Pick a day\.[^]*<\/div><\/div>[^]*Shared text\./);
    expect(html).not.toContain('\\');
  });

  test.describe('text outside the parts', () => {
    const DETAILS_OF_PARTS = '<details>\n<summary>More</summary>\n\n::: overview\nOne.\n:::\n\n</details>\n';

    for (const [name, source] of Object.entries({
      'only parts': '::: overview\nOne.\n:::\n',
      'an opening heading and parts': '# Restore a file\n\n::: overview\nOne.\n:::\n',
      'more headings and parts': '# Restore a file\n\n## Pick a day\n\n::: overview\nOne.\n:::\n\n### Pick a file\n',
      'a comment and parts': '<!-- A note. -->\n\n::: overview\nOne.\n:::\n',
      'a details that holds only parts': DETAILS_OF_PARTS,
      'footnotes and parts': '::: overview\nOne[^1].\n:::\n\n[^1]: Note one.\n',
    })) {
      test(`a page with ${name} has no shared text`, () => {
        expect(render(source).hasSharedText).toBe(false);
      });
    }

    for (const [name, source] of Object.entries({
      'a paragraph': '::: overview\nOne.\n:::\n\nA restore never changes the copy.\n',
      'a code block': '::: overview\nOne.\n:::\n\n```\nrestore\n```\n',
      'a list': '::: overview\nOne.\n:::\n\n- Pick a file\n',
      'a details with text of its own': '<details>\n<summary>More</summary>\n\nA restore never changes the copy.\n\n::: overview\nOne.\n:::\n\n</details>\n',
      'a fence line that is not listed': '::: testers\nOne.\n',
    })) {
      test(`a page with ${name} has shared text`, () => {
        expect(render(source).hasSharedText).toBe(true);
      });
    }

    test('hasShared stays as it was for a page of headings or a details', () => {
      expect(render('# Restore a file\n\n## Pick a day\n\n::: overview\nOne.\n:::\n').hasShared).toBe(true);
      expect(render(DETAILS_OF_PARTS).hasShared).toBe(true);
      expect(render('# Restore a file\n\n::: overview\nOne.\n:::\n').hasShared).toBe(false);
    });
  });

  test.describe('a shared heading or details with no text at some level', () => {
    /** The sorted levels of data-shows on the heading with this id, or null for no attribute. */
    function showsOn(html: string, id: string): string[] | null {
      const tag = new RegExp(`<h[1-6][^>]*\\bid="${id}"[^>]*>`).exec(html)?.[0];
      expect(tag, id).toBeTruthy();
      return valueIn(tag!);
    }
    const showsOnDetails = (html: string) => valueIn(/<details[^>]*>/.exec(html)![0]);
    const valueIn = (tag: string) => /data-shows="([^"]*)"/.exec(tag)?.[1]?.split(' ').sort() ?? null;
    const body = (markdown: string) => render(`# Restore a file\n\n${markdown}`).html;

    test('a heading lists the levels with text in its section', () => {
      const html = body('## Pick a day\n\n::: internals\nA job.\n::: overview\nPick.\n:::\n');
      expect(showsOn(html, 'pick-a-day')).toEqual(['internals', 'overview']);
    });

    test('a heading with text at every listed level gets no attribute', () => {
      const html = body('## Pick a day\n\n::: overview requirements\nPick.\n::: internals\nA job.\n:::\n');
      expect(showsOn(html, 'pick-a-day')).toBeNull();
    });

    test('shared content that is not a heading counts as text at every level', () => {
      for (const shared of ['A restore never changes the copy.', '```\nrestore\n```', '- Pick a file', '| Plan |\n|---|\n| Team |']) {
        const html = body(`## Pick a day\n\n${shared}\n\n::: internals\nA job.\n:::\n`);
        expect(showsOn(html, 'pick-a-day'), shared).toBeNull();
      }
    });

    test('a heading with no text at any level gets no attribute', () => {
      const html = body('## Pick a day\n\n## Pick a file\n\nA restore never changes the copy.\n');
      expect(showsOn(html, 'pick-a-day')).toBeNull();
    });

    test('a section holds its subsections', () => {
      const html = body('## Pick a day\n\n### Monday\n\n::: overview\nPick.\n:::\n\n### Sunday\n\n::: internals\nA job.\n:::\n');
      expect(showsOn(html, 'pick-a-day')).toEqual(['internals', 'overview']);
      expect(showsOn(html, 'monday')).toEqual(['overview']);
      expect(showsOn(html, 'sunday')).toEqual(['internals']);
    });

    test('a section ends at the next shared heading of the same or a higher rank', () => {
      const same = body('## Pick a day\n\n::: overview\nPick.\n:::\n\n## Pick a file\n\n::: internals\nA job.\n:::\n');
      expect(showsOn(same, 'pick-a-day')).toEqual(['overview']);
      expect(showsOn(same, 'pick-a-file')).toEqual(['internals']);
      const higher = body('### Pick a day\n\n::: overview\nPick.\n:::\n\n## Pick a file\n\n::: internals\nA job.\n:::\n');
      expect(showsOn(higher, 'pick-a-day')).toEqual(['overview']);
      expect(showsOn(higher, 'pick-a-file')).toEqual(['internals']);
    });

    test('shared text in a subsection counts for the heading above it', () => {
      const html = body('## Pick a day\n\n::: internals\nA job.\n:::\n\n### Monday\n\nA restore never changes the copy.\n');
      expect(showsOn(html, 'pick-a-day')).toBeNull();
      expect(showsOn(html, 'monday')).toBeNull();
    });

    test('a part with only headings has no text, and its heading does not end the section', () => {
      const html = body('## Pick a day\n\n::: overview\n## Only a heading\n::: internals\nA job.\n:::\n');
      expect(showsOn(html, 'pick-a-day')).toEqual(['internals']);
    });

    test('a heading inside a part gets no attribute', () => {
      expect(body('::: overview\n## Pick a day\n\nPick.\n:::\n')).not.toContain('data-shows');
    });

    test('a comment or the footnotes of a part are no text of a section', () => {
      const comment = body('## Pick a day\n\n<!-- A note. -->\n\n::: internals\nA job.\n:::\n');
      expect(showsOn(comment, 'pick-a-day')).toEqual(['internals']);
      const notes = body('## Pick a day\n\n::: internals\nA job[^1].\n:::\n\n[^1]: Note one.\n');
      expect(showsOn(notes, 'pick-a-day')).toEqual(['internals']);
    });

    test('a details lists the levels of the parts it holds', () => {
      const html = body('<details>\n<summary>More</summary>\n\n::: internals\nA job.\n:::\n\n</details>\n\nA restore never changes the copy.\n');
      expect(showsOnDetails(html)).toEqual(['internals']);
    });

    test('a details with text of its own or with no text gets no attribute', () => {
      const own = body('<details>\n<summary>More</summary>\n\nA restore never changes the copy.\n\n::: internals\nA job.\n:::\n\n</details>\n');
      expect(showsOnDetails(own)).toBeNull();
      expect(showsOnDetails(body('<details>\n<summary>More</summary>\n\n</details>\n'))).toBeNull();
    });

    test('a details that holds only parts is no shared text of the heading above it', () => {
      const html = body('## Pick a day\n\n<details>\n<summary>More</summary>\n\n::: internals\nA job.\n:::\n\n</details>\n');
      expect(showsOn(html, 'pick-a-day')).toEqual(['internals']);
    });

    test('with one listed level or none, no heading gets an attribute', () => {
      const source = '# Restore a file\n\n## Pick a day\n\n::: overview\nPick.\n:::\n';
      expect(render(source, '/restore.html', ['overview']).html).not.toContain('data-shows');
      expect(render(source, '/restore.html', []).html).not.toContain('data-shows');
    });
  });

  test.describe('footnotes', () => {
    const itemOf = (html: string, number: number) => new RegExp(`<li id="user-content-fn-${number}"[^>]*>`).exec(html)?.[0];

    test('a footnote shows only at the levels of the parts that reference it, and keeps its number', () => {
      const { html } = render('::: overview\nOne[^1].\n::: internals\nTwo[^2].\n:::\n\n[^1]: Note one.\n[^2]: Note two.\n');
      expect(itemOf(html, 1)).toContain('class="part" data-l="overview" value="1"');
      expect(itemOf(html, 2)).toContain('class="part" data-l="internals" value="2"');
    });

    test('the footnotes section shows only at the levels that have a footnote', () => {
      const { html } = render('::: overview\nOne[^1].\n::: internals\nTwo.\n:::\n\n[^1]: Note one.\n');
      expect(html).toContain('<section data-footnotes="" class="footnotes part" data-l="overview"><div class="bd">');
    });

    test('a footnote referenced at two levels shows at both, and each back link shows at its own level', () => {
      const { html } = render('::: overview\nOne[^1].\n::: internals\nTwo[^1].\n:::\n\n[^1]: Note one.\n');
      expect(itemOf(html, 1)).toContain('data-l="overview internals"');
      expect(html).toMatch(/href="#user-content-fnref-1"[^>]*class="data-footnote-backref part" data-l="overview"/);
      expect(html).toMatch(/href="#user-content-fnref-1-2"[^>]*class="data-footnote-backref part" data-l="internals"/);
    });

    test('a footnote referenced from shared text shows at every level, and the section stays', () => {
      const { html, hasShared } = render('Shared[^1].\n\n::: overview\nOne[^2].\n:::\n\n[^1]: Note one.\n[^2]: Note two.\n');
      expect(itemOf(html, 1)).not.toContain('data-l');
      expect(itemOf(html, 2)).toContain('data-l="overview"');
      expect(html).toContain('<section data-footnotes="" class="footnotes">');
      expect(hasShared).toBe(true);
    });

    test('a footnote in a part inside a raw HTML wrapper follows that part', () => {
      const { html } = render('<details>\n\n::: overview\nOne[^1].\n:::\n\n</details>\n\n[^1]: Note one.\n');
      expect(itemOf(html, 1)).toContain('data-l="overview"');
    });

    test('the footnotes section alone is not shared text, and adds no level', () => {
      const page = render('::: overview\nOne[^1].\n:::\n\n[^1]: Note one.\n');
      expect(page.hasShared).toBe(false);
      expect(page.parts).toEqual(['overview']);
    });

    test('a page with footnotes and no parts stays as it was', () => {
      const { html } = render('Shared[^1].\n\n[^1]: Note one.\n');
      expect(html).not.toContain('part');
      expect(html).not.toContain('value=');
    });
  });
});

test.describe('the data of search by level', () => {
  const WINDOW = { bytes: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"/>', version: 1 };
  /** The files of the docs folder `/home/ana/docs`, as the build of `backups/restore.md` sees them. */
  const RESTORE_FILES = fakeFiles(
    {
      'backups/schedules.md': { bytes: '# Schedules\n', version: 1 },
      'backups/plans/team.md': { bytes: '# Team plan\n', version: 1 },
      'storage.md': { bytes: '# Storage\n', version: 1 },
      'images/restore-window.svg': WINDOW,
    },
    'backups/restore.md',
  );
  const renderFile = (source: string) => renderMarkdown(source, '/backups/restore.html', 'Restore', LISTED, RESTORE_FILES);

  /** Shared text, a shared heading at two levels, a details at one level, and parts under shared headings. */
  const RESTORE_LEVELS = `# Restore a file

A restore never changes the copy.

## Pick a day

::: overview
Pick a file and a day.
::: internals
A restore is a <span id="restore-job">job</span> on the storage server.
:::

## Limits

<details>
<summary>Limits of a restore</summary>

### Limit rules

::: requirements
REQ-2.1 A restore keeps at most 30 days.
:::

</details>

## Search index

::: internals
### Index format

The index maps each block to its file.
:::

::: overview requirements internals
#### Every level

Text at all levels.
:::
`;

  test.describe('anchors', () => {
    test('each id that shows at some levels only has the levels of the part, the heading or the details around it', () => {
      expect(render(RESTORE_LEVELS).anchors).toEqual({
        'pick-a-day': 'overview internals',
        'restore-job': 'internals',
        limits: 'requirements',
        'limit-rules': 'requirements',
        'index-format': 'internals',
      });
    });

    test('an id that shows at every level is absent', () => {
      const { anchors } = render(RESTORE_LEVELS);
      for (const id of ['search-index', 'every-level', 'restore-a-file']) expect(anchors, id).not.toHaveProperty(id);
      expect(render('# Restore a file\n\n## Pick a day\n\nPick a file and a day.\n').anchors).toEqual({});
    });

    test('a part inside a part shows at the levels that both hold', () => {
      const source =
        '# Restore a file\n\n::: overview internals\n<div class="part" data-l="internals requirements">\n\n## Deep\n\nDeep text.\n\n</div>\n\nOuter text.\n:::\n';
      expect(render(source).anchors).toEqual({ deep: 'internals' });
    });

    test('headings with the same text share the union of their levels, in the order of the levels', () => {
      const source = '# Restore a file\n\n::: internals\n## Design\n\nA job.\n::: overview\n## Design\n\nPick a day.\n:::\n';
      const page = render(source);
      expect(page.html).toContain('<h2 id="design">');
      expect(page.html).toContain('<h2 id="design-1">');
      expect(page.anchors).toEqual({ design: 'overview internals', 'design-1': 'overview internals' });
    });

    test('a footnote reference and its note show at the levels of the part that references it', () => {
      const { anchors } = render('# Restore a file\n\nShared.\n\n::: overview\nKeep a copy.[^1]\n:::\n\n[^1]: A copy on another disk.\n');
      expect(anchors['user-content-fnref-1']).toBe('overview');
      expect(anchors['user-content-fn-1']).toBe('overview');
    });
  });

  test.describe('links', () => {
    test('each link to a page of the site with a hash gives the address of the page and the decoded hash, in page order, once', () => {
      const source = `# Restore a file

See [the weekly plan](schedules.md#weekly-plan), [the day](#pick-a-day) and [the plan at internals](schedules.md#internals/weekly-plan).

[The weekly plan again](./schedules.md#weekly-plan), [a spaced id](plans/team.md#pick%20a%20day) and [storage](/storage.md#blocks).

[Storage](../storage.md), [the window](../images/restore-window.svg#frame), [elsewhere](https://backups.example/guide#top) and [mail](mailto:ana@backups.example).

## Pick a day

Pick a file and a day.
`;
      expect(renderFile(source).links).toEqual([
        '/backups/schedules.html#weekly-plan',
        '/backups/restore.html#pick-a-day',
        '/backups/schedules.html#internals/weekly-plan',
        '/backups/plans/team.html#pick a day',
        '/storage.html#blocks',
      ]);
    });

    test('a page with no such link has none', () => {
      expect(renderFile('# Restore a file\n\nSee [Storage](../storage.md).\n').links).toEqual([]);
    });
  });

  test.describe('search units', () => {
    const plain = (units: SearchUnit[]) => units.map(({ text, levels }) => [text, levels]);
    /** Each unit that is not a heading, with the heading above it. */
    const under = (units: SearchUnit[], headings: string[]) =>
      units.filter(({ text }) => !headings.includes(text)).map(({ text, headingId, heading }) => [text, headingId, heading]);

    test('each block gives its text and its levels, in page order, without the title', () => {
      expect(plain(render(RESTORE_LEVELS).search)).toEqual([
        ['A restore never changes the copy.', null],
        ['Pick a day', 'overview internals'],
        ['Pick a file and a day.', 'overview'],
        ['A restore is a job on the storage server.', 'internals'],
        ['Limits', 'requirements'],
        ['Limits of a restore', 'requirements'],
        ['Limit rules', 'requirements'],
        ['REQ-2.1 A restore keeps at most 30 days.', 'requirements'],
        ['Search index', null],
        ['Index format', 'internals'],
        ['The index maps each block to its file.', 'internals'],
        ['Every level', null],
        ['Text at all levels.', null],
      ]);
    });

    test('each block names the nearest heading above it, and a block above every heading names none', () => {
      const headings = ['Pick a day', 'Limits', 'Limit rules', 'Search index', 'Index format', 'Every level'];
      expect(under(render(RESTORE_LEVELS).search, headings)).toEqual([
        ['A restore never changes the copy.', null, null],
        ['Pick a file and a day.', 'pick-a-day', 'Pick a day'],
        ['A restore is a job on the storage server.', 'pick-a-day', 'Pick a day'],
        ['Limits of a restore', 'limits', 'Limits'],
        ['REQ-2.1 A restore keeps at most 30 days.', 'limit-rules', 'Limit rules'],
        ['The index maps each block to its file.', 'index-format', 'Index format'],
        ['Text at all levels.', 'every-level', 'Every level'],
      ]);
    });

    test('a list item, a table row, a code block, a quote, a term and its meaning each give a unit, with each run of white space as one space', () => {
      const source = `# Restore checklist

> Check the day   before you restore.

- Pick a file
  - Pick a day
- Check the result

| Plan | Days |
|---|---|
| Team | 14 |

\`\`\`
restore --from monday
restore   --to /home/ana
\`\`\`

<dl><dt>Copy</dt><dd>A file as it was
on one day.</dd></dl>
`;
      expect(plain(render(source).search)).toEqual([
        ['Check the day before you restore.', null],
        ['Pick a file', null],
        ['Pick a day', null],
        ['Check the result', null],
        ['Plan · Days', null],
        ['Team · 14', null],
        ['restore --from monday restore --to /home/ana', null],
        ['Copy', null],
        ['A file as it was on one day.', null],
      ]);
    });

    test('a block with no text, a diagram, a wireframe and a footnote back link give no units', () => {
      const files = fakeFiles(
        { 'design/wireframes/restore-wizard.html': { bytes: WIZARD_HTML, version: 1 }, 'design/restore-window.svg': WINDOW },
        'design/decisions.md',
      );
      const source = `# Design decisions

Before the wizard.

![Restore window](restore-window.svg)

\`\`\`mermaid
graph TD
  Agent-->Server
\`\`\`

${WIZARD_LINE}

After the wizard.[^1]

[^1]: A copy on another disk.
`;
      const page = renderMarkdown(source, '/design/decisions.html', 'Decisions', LISTED, files);
      expect(page.html).toContain('class="wf"');
      expect(page.html).toContain('class="dg"');
      const texts = page.search.map((unit) => unit.text);
      expect(texts[0]).toBe('Before the wizard.');
      expect(texts[1]).toMatch(/^After the wizard\./);
      expect(texts).toContain('A copy on another disk.');
      for (const text of texts) {
        expect(text).not.toContain('↩');
        expect(text).not.toContain('Agent-->Server');
        expect(text).not.toContain('iframe');
        expect(text).not.toBe('');
      }
    });

    test('the text of an embedded API reference gives units at the levels of its part', () => {
      const page = renderMarkdown(BACKUP_API_PAGE, '/api.html', 'Api', LISTED, apiFiles({ 'api/openapi.yaml': BACKUP_SPEC }));
      expect(page.search).toContainEqual({
        text: 'The backup app has an API for scripts.',
        levels: 'overview requirements',
        headingId: null,
        heading: null,
      });
      expect(page.search).toContainEqual(
        expect.objectContaining({ text: 'Start and check restores, and read the backup schedules.', levels: 'internals' }),
      );
      expect(page.search).toContainEqual(
        expect.objectContaining({
          text: 'Puts the copy of one file from one day back on the computer.',
          levels: 'internals',
          headingId: 'post-restores',
          heading: 'POST /restores',
        }),
      );
    });

    test('a page with no text has no units', () => {
      expect(render('# Restore a file\n').search).toEqual([]);
    });
  });
});

test.describe('the data of the link checks', () => {
  /** The files of the docs folder `/home/ana/docs`, as the build of `backups/restore.md` sees them. */
  const FILES = fakeFiles(
    {
      'backups/schedules.md': { bytes: '# Schedules\n', version: 1 },
      'backups/plans/team.md': { bytes: '# Team plan\n', version: 1 },
      'storage.md': { bytes: '# Storage\n', version: 1 },
      'images/restore-window.svg': { bytes: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"/>', version: 1 },
    },
    'backups/restore.md',
  );
  const LINES = [
    '# Restore a file', // 1
    '',
    'See [the weekly plan](schedules.md#weekly-plan).', // 3
    '',
    'Pick [the day](#pick-a-day).', // 5
    '',
    'Read [the old notes](../../notes.md) and [Storage](../storage.md).', // 7
    '',
    'Open [a spaced id](plans/team.md#pick%20a%20day).', // 9
    '',
    'Visit [the site](https://backup.example/guide.md), [mail](mailto:ana@backup.example), [the mirror](//mirror.example/guide.md) and [the window](../images/restore-window.svg).', // 11
    '',
    '## Pick a day', // 13
    '',
    'Pick a file and a day.', // 15
    '',
    'Keep the <span id="restore-key">restore key</span>.', // 17
    '',
  ];
  const page = () => renderMarkdown(LINES.join('\n'), '/backups/restore.html', 'Restore', LISTED, FILES);

  const spot = (written: string, target: string | null, line: number, block: number, words: string) => {
    const text = LINES[line - 1]!;
    return { written, target, line, column: text.indexOf(written) + 1, length: written.length, text, mark: { block, inner: null, words } };
  };

  test('every element id of the page shows in page order', () => {
    expect(page().elementIds).toEqual(['pick-a-day', 'restore-key']);
  });

  test('each link to a Markdown file or to a hash is a spot with its address, its place and the words of its link', () => {
    expect(page().linkSpots).toEqual([
      spot('schedules.md#weekly-plan', '/backups/schedules.html#weekly-plan', 3, 0, 'the weekly plan'),
      spot('#pick-a-day', '/backups/restore.html#pick-a-day', 5, 1, 'the day'),
      spot('../../notes.md', null, 7, 2, 'the old notes'),
      spot('../storage.md', '/storage.html', 7, 2, 'Storage'),
      spot('plans/team.md#pick%20a%20day', '/backups/plans/team.html#pick a day', 9, 3, 'a spaced id'),
    ]);
  });

  test('a spot in a part marks the element of its part', () => {
    const source = '# Restore a file\n\nPick a file.\n\n::: internals\nThe agent asks the server.\n\nSee [the weekly plan](schedules.md#weekly-plan).\n:::\n';
    const [inPart] = renderMarkdown(source, '/backups/restore.html', 'Restore', LISTED, FILES).linkSpots;
    expect(inPart).toMatchObject({ line: 8, mark: { block: 1, inner: 1, words: 'the weekly plan' } });
  });
});
