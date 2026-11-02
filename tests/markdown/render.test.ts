import { expect, test } from '@playwright/test';
import { renderMarkdown } from '../../src/markdown/render.ts';

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
  expect(page.html).toContain('<div class="wide"><table>');
  expect(page.html).toContain('<del>old</del>');
  expect(page.html).toContain('type="checkbox"');
});

test('a table inside a quote or a list scrolls sideways in its own box', () => {
  const table = '| Plan | Days |\n  |---|---|\n  | Basic | 14 |';
  expect(render(`> ${table.replaceAll('  ', '> ')}`).html).toContain('<div class="wide"><table>');
  expect(render(`- Plans:\n\n  ${table}`).html).toContain('<div class="wide"><table>');
});

test('a code block keeps its text, with no HTML of its own', () => {
  const page = render('```\nrestore --from <day>\n```');
  expect(page.html).toContain('<pre><code>restore --from &#x3C;day>\n</code></pre>');
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
    expect(page.html).toContain('<code>::: internals\n</code>');
    expect(page.parts).toEqual(['overview']);
  });

  test('a code block still open at the end of a part stays inside the part', () => {
    const { html } = render('::: overview\n```\nrestore --from monday\n');
    expect(html).toMatch(/<div class="part" data-l="overview"><div class="bd">\n<pre><code>restore --from monday\n[^]*<\/code><\/pre>\n<\/div><\/div>$/);
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
