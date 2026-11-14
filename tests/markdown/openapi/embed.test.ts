import { expect, test } from '@playwright/test';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { problemBox } from '../../../src/markdown/embed.ts';
import { referenceBlocks } from '../../../src/markdown/openapi/embed.ts';
import { parseMarkdown, processor } from '../../../src/markdown/parse.ts';
import { renderMarkdown } from '../../../src/markdown/render.ts';
import { elementAt, openingTag } from '../../support/html.ts';
import {
  apiFiles,
  BACKUP_API_PAGE,
  BACKUP_SPEC,
  BACKUP_SPEC_JSON,
  badSlotHtml,
  bigSpec,
  BROKEN_SPEC,
  DAY_SCHEMA,
  markdownOf,
  REFS_SPEC,
  RESTORE_REQUEST,
  sectionOf,
  sectionsOf,
  UNRESOLVED_SPEC,
} from '../../support/openapi.ts';

const LISTED = ['overview', 'requirements', 'internals'];
const SPEC = 'api/openapi.yaml';
const BACKUP = { [SPEC]: BACKUP_SPEC };
const LINE = '![Backup API](api/openapi.yaml)';

/** The page `page` of the source, built with the files of the folder `/home/ana/docs`. */
function render(source: string, files: Record<string, string> = BACKUP, page = 'api.md') {
  const folder = apiFiles(files, page);
  const rendered = renderMarkdown(source, `/${page.replace(/\.md$/, '.html')}`, 'Api', LISTED, folder);
  return { ...rendered, asked: folder.asked };
}

const used = (file: string, version: number | null) => ({ file, path: `/home/ana/docs/${file}`, version });

const boxHtml = (label: string, line: string) => unified().use(rehypeStringify).stringify({ type: 'root', children: [problemBox(label, line)] });

/** The section with the file that it names left out, so two sections of one spec compare. */
const withoutFile = (section: string) => section.replace(/\sdata-api="[^"]*"/, '');

/** The ids of the HTML, in order. */
const idsOf = (html: string) => [...html.matchAll(/\sid="([^"]*)"/g)].map((found) => found[1]);

test.describe('the reference of the backup app', () => {
  test('takes the place of its line in its part, with the label and the file', () => {
    const page = render(BACKUP_API_PAGE);
    expect(page.html).toMatch(/<div class="part" data-l="internals"><div class="bd">\s*<section\b/);
    expect(page.html).toMatch(openingTag('section', { class: 'api', 'aria-label': 'Backup API', 'data-api': SPEC }));
    expect(page.html).not.toContain('<img');
    expect(page.uses).toEqual([used(SPEC, 1730000000001)]);
    expect(page.problems).toEqual([]);
  });

  test('holds the headings, the summaries, the anchors, the links and the examples', () => {
    const section = sectionOf(render(BACKUP_API_PAGE).html);
    for (const element of [
      '<h2 id="restores">Restores</h2>',
      '<h3 id="post-restores"><code>POST /restores</code></h3>',
      '<h3 id="get-restoresid"><code>GET /restores/{id}</code></h3>',
      '<h2 id="schedules">Schedules</h2>',
      '<h3 id="get-schedules"><code>GET /schedules</code></h3>',
      '<p class="api-sum">Start a restore</p>',
      '<em id="schema-restore">Restore</em>',
      '<a href="#schema-restore"><em>Restore</em></a>',
    ]) {
      expect(section, element).toContain(element);
    }
    expect(section.match(/<div class="code">/g)).toHaveLength(2);
  });

  test('gives the outline its tags and its endpoints at the level of its part', () => {
    expect(render(BACKUP_API_PAGE).outline).toEqual([
      { id: 'restores', text: 'Restores', rank: 2, shows: 'internals' },
      { id: 'post-restores', text: 'POST /restores', rank: 3, shows: 'internals' },
      { id: 'get-restoresid', text: 'GET /restores/{id}', rank: 3, shows: 'internals' },
      { id: 'schedules', text: 'Schedules', rank: 2, shows: 'internals' },
      { id: 'get-schedules', text: 'GET /schedules', rank: 3, shows: 'internals' },
    ]);
  });

  test('links each schema to an id of the page, and no id shows twice', () => {
    const { html } = render(BACKUP_API_PAGE);
    const ids = idsOf(html);
    expect(new Set(ids).size).toBe(ids.length);
    const links = [...html.matchAll(/href="#(schema-[^"]*)"/g)].map((found) => found[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(ids, link).toContain(link);
  });

  test('is the same for a .yml file, a .json file and a JSON copy', () => {
    const yaml = withoutFile(sectionOf(render(LINE).html));
    expect(withoutFile(sectionOf(render('![Backup API](api/openapi.yml)', { 'api/openapi.yml': BACKUP_SPEC }).html))).toBe(yaml);
    expect(withoutFile(sectionOf(render('![Backup API](api/openapi.json)', { 'api/openapi.json': BACKUP_SPEC_JSON }).html))).toBe(yaml);
    expect(withoutFile(sectionOf(render(LINE, { [SPEC]: BACKUP_SPEC_JSON }).html))).toBe(yaml);
  });

  test('of a raw img alone is the same, and an empty alt gives the name of the file as the label', () => {
    const section = sectionOf(render(LINE).html);
    expect(sectionOf(render('<img src="api/openapi.yaml" alt="Backup API">').html)).toBe(section);
    expect(render('![](api/openapi.yaml)').html).toMatch(openingTag('section', { class: 'api', 'aria-label': 'Openapi' }));
  });

  test('has each example as a code block with its copy button and the code colors', () => {
    const section = sectionOf(render(LINE).html);
    const blocks = [...section.matchAll(/<div class="code">/g)].map((found) => elementAt(section, found.index));
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block).toMatch(/<pre\b/);
      expect(block).toMatch(openingTag('button', { class: 'copy' }));
      expect(block).toMatch(/<span class="[ksfn]">/);
    }
  });
});

test.describe('an embed line', () => {
  test('inside a line of text is a link to the file, and inside a link is the text of that link', () => {
    const cases: [string, string][] = [
      ['See ![Backup API](api/openapi.yaml) for scripts.', '<p>See <a href="api/openapi.yaml">Backup API</a> for scripts.</p>'],
      ['[![Backup API](api/openapi.yaml)](restore.md)', '<p><a href="restore.html">Backup API</a></p>'],
    ];
    for (const [source, html] of cases) {
      const page = render(source);
      expect(page.html, source).toBe(html);
      expect(page.asked, source).toEqual([]);
      expect(page.uses, source).toEqual([]);
      expect(page.problems, source).toEqual([]);
    }
  });

  test('of a remote file is a link to it, and the build asks for no file', () => {
    const page = render('![Backup API](https://example.com/openapi.yaml)');
    expect(page.html).toBe('<p><a href="https://example.com/openapi.yaml">Backup API</a></p>');
    expect(page.asked).toEqual([]);
    expect(page.uses).toEqual([]);
    expect(page.problems).toEqual([]);
  });

  test('of a missing file leaves the box and a terminal line, and one outside the folder adds no use', () => {
    const missing = render('![Backup API](api/openapi-v1.yaml)');
    expect(missing.html).toBe(boxHtml('Backup API', 'Missing file: api/openapi-v1.yaml api.md'));
    expect(missing.uses).toEqual([used('api/openapi-v1.yaml', null)]);
    expect(missing.problems).toEqual([expect.objectContaining({ name: 'Missing file', file: 'api.md', line: 1, value: 'api/openapi-v1.yaml' })]);

    for (const target of ['../openapi.yaml', '.drafts/openapi.yaml']) {
      const outside = render(`![Backup API](${target})`);
      expect(outside.html, target).toBe(boxHtml('Backup API', `Missing file: ${target} api.md`));
      expect(outside.uses, target).toEqual([]);
      expect(outside.problems, target).toEqual([expect.objectContaining({ name: 'Missing file', file: 'api.md', line: 1, value: target })]);
    }
  });

  test('of a file that is not OpenAPI leaves the box with the line of the problem', () => {
    const page = render(LINE, { [SPEC]: BROKEN_SPEC });
    expect(page.html).toBe(boxHtml('Backup API', 'Bad OpenAPI: api/openapi.yaml:9'));
    expect(page.problems).toEqual([expect.objectContaining({ name: 'Bad OpenAPI', file: 'api/openapi.yaml', line: 9, value: '' })]);
    expect(page.uses).toEqual([used(SPEC, 1730000000001)]);
  });

  test('with a tag shows the operations of that tag, and a tag that the file lacks leaves the box', () => {
    const unknown = render('![Backup API](api/openapi.yaml#Archive)');
    expect(unknown.html).toBe(boxHtml('Backup API', 'Unknown tag: Archive api.md'));
    expect(unknown.problems).toEqual([expect.objectContaining({ name: 'Unknown tag', file: 'api.md', line: 1, value: 'Archive' })]);
    expect(unknown.uses).toEqual([used(SPEC, 1730000000001)]);

    const restores = render('![Restores](api/openapi.yaml#Restores)').html;
    expect(restores).toContain('<h2 id="post-restores">');
    expect(restores).not.toContain('Schedules');
    expect(restores).not.toContain('/schedules');

    const renamed = BACKUP_SPEC.replace('  - name: Restores\n', '  - name: Restore jobs\n').replaceAll('tags: [Restores]', 'tags: [Restore jobs]');
    const jobs = render('![Restore jobs](api/openapi.yaml#Restore%20jobs)', { [SPEC]: renamed });
    expect(jobs.html).toContain('<h2 id="post-restores">');
    expect(jobs.problems).toEqual([]);
  });

  test('with a tag that only an operation of a path item in another file names shows that operation', () => {
    const item = 'api/paths/restores.yaml';
    const spec = 'openapi: 3.1.0\ninfo:\n  title: Backup API\n  version: 2.0.0\npaths:\n  /restores:\n    $ref: paths/restores.yaml\n';
    const post = 'post:\n  tags: [Restores]\n  summary: Start a restore\n  responses:\n    \'202\':\n      description: The restore job started.\n';
    const page = render('![Restores](api/openapi.yaml#Restores)', { [SPEC]: spec, [item]: post });
    expect(page.problems).toEqual([]);
    expect(sectionOf(page.html)).toContain('<h2 id="post-restores"><code>POST /restores</code></h2>');
    expect(page.uses).toEqual([used(SPEC, 1730000000001), used(item, 1730000000002)]);
  });

  test('starts its headings one rank below the heading of the author above it, at most 6', () => {
    const endpoints = render(`# Backup API\n\n## Endpoints\n\n${LINE}\n`).html;
    expect(endpoints).toContain('<h3 id="restores">');
    expect(endpoints).toContain('<h4 id="post-restores">');

    const deep = render(`# Backup API\n\n###### Deep\n\n${LINE}\n`).html;
    expect(deep).toContain('<h6 id="restores">');
    expect(deep).toContain('<h6 id="post-restores">');

    const after = render(`# Backup API\n\n${LINE}\n\n## After\n`).html;
    expect(after).toContain('<h2 id="restores">');
    expect(after).toContain('<h3 id="post-restores">');

    const two = render('# Backup API\n\n![Restores](api/openapi.yaml#Restores)\n\n![Schedules](api/openapi.yaml#Schedules)\n').html;
    expect(two).toContain('<h2 id="post-restores">');
    expect(two).toContain('<h2 id="get-schedules">');
  });

  test('gives its headings and anchors ids that no heading of the page has', () => {
    const restores = render(`# Backup API\n\n## Restores\n\nThe restores of the app.\n\n${LINE}\n`).html;
    expect(restores).toContain('<h2 id="restores">Restores</h2>');
    expect(restores).toContain('<h3 id="restores-1">Restores</h3>');

    const schema = render(`# Backup API\n\n## Schema restore\n\nThe schema of a restore.\n\n${LINE}\n`).html;
    expect(schema).toContain('<h2 id="schema-restore-1">Schema restore</h2>');
    expect(schema).toContain('<em id="schema-restore">Restore</em>');
    const ids = idsOf(schema);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('twice gives each reference its own anchors, and each link points into its own reference', () => {
    const { html } = render(`# Backup API\n\n${LINE}\n\n${LINE}\n`);
    const [first = '', second = ''] = sectionsOf(html);
    expect(sectionsOf(html)).toHaveLength(2);
    expect(first).toContain('<em id="schema-restore">Restore</em>');
    expect(first).toContain('href="#schema-restore"');
    expect(second).toContain('<em id="schema-restore-1">Restore</em>');
    expect(second).toContain('href="#schema-restore-1"');
    expect(second).not.toContain('href="#schema-restore"');
    const ids = idsOf(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('of a file with a ref that points nowhere shows the bad slot and prints its line', () => {
    const page = render(LINE, { [SPEC]: UNRESOLVED_SPEC });
    expect(sectionOf(page.html)).toContain(badSlotHtml('#/components/schemas/Place', SPEC, 18));
    expect(page.problems).toEqual([
      expect.objectContaining({ name: 'Unresolved ref', file: 'api/openapi.yaml', line: 18, value: '#/components/schemas/Place' }),
    ]);
    expect(page.uses).toEqual([used(SPEC, 1730000000001)]);
  });

  test('of a file whose refs name other files uses each of them and prints each ref that points nowhere', () => {
    const request = 'api/schemas/restore-request.yaml';
    const page = render(LINE, { [SPEC]: REFS_SPEC, [request]: RESTORE_REQUEST, 'api/schemas/day.yaml': DAY_SCHEMA });
    expect(page.uses).toEqual([
      used(SPEC, 1730000000001),
      used(request, 1730000000002),
      used('api/schemas/day.yaml', 1730000000003),
      used('api/schemas/gone.yaml', null),
    ]);
    expect(page.problems).toEqual([
      expect.objectContaining({ name: 'Unresolved ref', file: request, line: 12, value: 'gone.yaml' }),
      expect.objectContaining({ name: 'Unresolved ref', file: request, line: 14, value: '../../../outside.yaml' }),
      expect.objectContaining({ name: 'Unresolved ref', file: request, line: 16, value: 'https://example.com/day.yaml' }),
    ]);
  });

  test('with no files stays the img of today', () => {
    const page = renderMarkdown(BACKUP_API_PAGE, '/api.html', 'Api', LISTED);
    expect(page.html).toContain('<img src="api/openapi.yaml" alt="Backup API">');
    expect(page.html).not.toContain('<section');
    expect(page.uses).toEqual([]);
    expect(page.problems).toEqual([]);
  });
});

test.describe('the description of a file', () => {
  const withDescription = (description: string) =>
    BACKUP_SPEC.replace(
      '  description: Start and check restores, and read the backup schedules.\n',
      `  description: ${JSON.stringify(description)}\n`,
    );

  test('shows a remote image as written, and the build asks for no file beyond the spec', () => {
    const page = render(LINE, { [SPEC]: withDescription('![Run in Postman](https://run.pstmn.io/button.svg)') });
    expect(sectionOf(page.html)).toContain('<img src="https://run.pstmn.io/button.svg" alt="Run in Postman">');
    expect(page.html).not.toMatch(/<img src="https:\/\/run\.pstmn\.io\/button\.svg"[^>]*\swidth=/);
    expect(page.asked).toEqual([SPEC]);
  });

  test('turns its headings into bold text, which the outline does not list', () => {
    const page = render(LINE, { [SPEC]: withDescription('# Introduction\n\nStart and check restores.\n\nLimits\n------\n\nOne restore at a time.') });
    expect(sectionOf(page.html)).toContain('<strong>Introduction</strong>');
    expect(sectionOf(page.html)).toContain('<strong>Limits</strong>');
    expect(page.outline.map((row) => row.text)).toEqual(['Restores', 'POST /restores', 'GET /restores/{id}', 'Schedules', 'GET /schedules']);
  });
});

test('a link from another page to an endpoint names an id of the page of the reference', () => {
  const scripts = render('# Scripts\n\n[Start a restore](api.md#post-restores)\n', {}, 'scripts.md');
  expect(scripts.html).toContain('href="api.html#post-restores"');
  expect(idsOf(render(BACKUP_API_PAGE).html)).toContain('post-restores');
});

test('a long reference parses in pieces to the HTML of one parse, with each code block and HTML block whole', () => {
  const spec = JSON.parse(bigSpec(140)) as { paths: Record<string, { post: Record<string, unknown> }> };
  Object.values(spec.paths).forEach(({ post }, n) => {
    // A note opens after job 125, the last of 'Part 25', and ends before job 46, the first of 'Part 46', many headings later.
    const opens = n === 124 ? '\n\n<!-- A note that a later job ends.' : '';
    const ends = n === 45 ? '-->\n\n' : '';
    const shell = `\`\`\`sh\n# Job ${n + 1}\ncurl -X POST /jobs-${n + 1}\n\`\`\``;
    post.description = `${ends}Start the job from a shell:\n\n${shell}\n\n<pre>\nThe log of the job.\n\nDone.\n</pre>${opens}`;
    post.responses = { '202': { description: 'The job started.', content: { 'text/plain': { example: `# Job ${n + 1}\nstarted` } } } };
  });
  const written = markdownOf({ 'api/openapi.yaml': JSON.stringify(spec) });
  if (written.kind !== 'ok') throw new Error(`The reference is bad: ${JSON.stringify(written)}`);
  expect(written.markdown.length).toBeGreaterThan(3 * 32_000);
  const pieces = processor.stringify({ type: 'root', children: referenceBlocks(written.markdown) });
  expect(pieces).toBe(processor.stringify(parseMarkdown(written.markdown)));
});
