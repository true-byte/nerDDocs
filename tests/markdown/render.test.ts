import { expect, test } from '@playwright/test';
import { renderMarkdown } from '../../src/markdown/render.ts';

function render(source: string, url = '/backups/restore.html') {
  return renderMarkdown(source, url, 'File name');
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

test('a small heading gets an id that links can use', () => {
  const page = render('# Restore\n\n##### Pick a day\n\n###### Pick a file');
  expect(page.html).toContain('<h5 id="pick-a-day">');
  expect(page.html).toContain('<h6 id="pick-a-file">');
});
