import { expect, test } from '@playwright/test';
import type { ApiOptions } from '../../../src/markdown/openapi/markdown.ts';
import { parseMarkdown, processor } from '../../../src/markdown/parse.ts';
import {
  BACKUP_API_MARKDOWN,
  BACKUP_SPEC,
  BACKUP_SWAGGER,
  BACKUP_SWAGGER_MARKDOWN,
  BAD_DAY,
  badSlot,
  DAY_SCHEMA,
  lineOf,
  markdownOf,
  REFS_SPEC,
  RESTORE_REQUEST,
  UNRESOLVED_SPEC,
} from '../../support/openapi.ts';

const SPEC = 'api/openapi.yaml';

/** The Markdown of the OpenAPI file `text` at `api/openapi.yaml`, which must be written. */
function markdown(text: string, options: Partial<ApiOptions> = {}, more: Record<string, string> = {}): string {
  const written = markdownOf({ [SPEC]: text, ...more }, options);
  if (written.kind !== 'ok') throw new Error(`The reference is bad: ${JSON.stringify(written)}`);
  return written.markdown;
}

const INFO = { title: 'Backup API', version: '2.0.0' };

/** A JSON spec of these paths and components. */
const specText = (paths: Record<string, unknown>, more: Record<string, unknown> = {}, version = '3.1.0') =>
  `${JSON.stringify({ openapi: version, info: INFO, paths, ...more }, null, 2)}\n`;

/** The schema 'Restore' of the backup app. */
const RESTORE = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid', readOnly: true },
    state: { type: 'string', enum: ['queued', 'running', 'done', 'failed'] },
    file: { type: 'string' },
    bytesDone: { type: 'integer', description: 'The bytes written back so far.' },
  },
};

/** A spec of `POST /restores` with this body schema and this schema of its '202' response, and these schemas. */
function restoreSpec({
  body,
  response,
  schemas = {},
  version = '3.1.0',
}: {
  body?: unknown;
  response?: unknown;
  schemas?: Record<string, unknown>;
  version?: string;
}): string {
  const post: Record<string, unknown> = { summary: 'Start a restore' };
  if (body !== undefined) post.requestBody = { content: { 'application/json': { schema: body } } };
  const started: Record<string, unknown> = { description: 'The restore job started.' };
  if (response !== undefined) started.content = { 'application/json': { schema: response } };
  post.responses = { '202': started };
  return specText({ '/restores': { post } }, { components: { schemas: { Restore: RESTORE, ...schemas } } }, version);
}

/** The text of the body of the first operation, up to its responses. */
const bodyPart = (text: string) => text.slice(text.indexOf('**Body**'), text.indexOf('**Responses**'));
/** The text of the responses of the first operation. */
const responsePart = (text: string) => text.slice(text.indexOf('**Responses**'));
/** The text of the operation under this heading, up to the next heading. */
function operationPart(text: string, heading: string): string {
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) throw new Error(`${heading} is not in the text.`);
  const next = text.slice(start + heading.length).search(/\n#{1,6} /);
  return next < 0 ? text.slice(start) : text.slice(start, start + heading.length + next + 1);
}
/** The name of each field line at the start of a line, in order. */
const fieldNames = (text: string) => [...text.matchAll(/^- `([^`]+)`/gm)].map((found) => found[1]);

test.describe('the whole file', () => {
  test('of the backup app gives its reference, and the ids of its anchors', () => {
    const ids = new Set<string>();
    expect(markdownOf({ [SPEC]: BACKUP_SPEC }, { ids })).toEqual({ kind: 'ok', markdown: BACKUP_API_MARKDOWN, unresolved: [] });
    expect([...ids]).toEqual([
      'schema-restorerequest',
      'schema-originalplace',
      'schema-otherfolder',
      'schema-restore',
      'schema-error',
      'schema-schedule',
    ]);
  });

  test('of Swagger 2.0 gives its reference', () => {
    expect(markdownOf({ 'api/swagger.yaml': BACKUP_SWAGGER }, {}, 'api/swagger.yaml')).toEqual({
      kind: 'ok',
      markdown: BACKUP_SWAGGER_MARKDOWN,
      unresolved: [],
    });
  });

  test('starts its headings at the rank it is given, at most 6', () => {
    const three = markdown(BACKUP_SPEC, { rank: 3 });
    expect(three).toContain('\n### Restores\n');
    expect(three).toContain('\n#### `POST /restores`\n');
    const six = markdown(BACKUP_SPEC, { rank: 6 });
    expect(six).toContain('\n###### Restores\n');
    expect(six).toContain('\n###### `POST /restores`\n');
  });

  test('shows an operation with no tag first, at the rank it is given', () => {
    const health = '  /health:\n    get:\n      summary: Check the server\n      responses:\n        \'204\':\n          description: The server runs.\n';
    const text = markdown(BACKUP_SPEC.replace('components:\n', `${health}components:\n`));
    const at = text.indexOf('\n## `GET /health`\n');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(text.indexOf('\n## Restores\n'));
  });

  test('of one tag writes no tag heading', () => {
    const text = markdown(BACKUP_SPEC.replace('tags: [Schedules]', 'tags: [Restores]'));
    expect(text).not.toMatch(/^#+ Restores$/m);
    expect(text).toContain('\n## `POST /restores`\n');
    expect(text).toContain('\n## `GET /schedules`\n');
  });

  test('with ids taken gives each anchor a free id, and its links point to it', () => {
    const ids = new Set(['schema-restore']);
    const text = markdown(BACKUP_SPEC, { ids });
    expect(text).toContain('<em id="schema-restore-1">Restore</em>');
    expect(text).toContain('[*Restore*](#schema-restore-1)');
    expect(text).not.toContain('(#schema-restore)');
    expect(ids.has('schema-restore-1')).toBe(true);
  });
});

test.describe('a tag', () => {
  test('gives the server, the auth and the operations of that tag at the rank it is given', () => {
    const start = BACKUP_API_MARKDOWN.indexOf('### `POST /restores`');
    const end = BACKUP_API_MARKDOWN.indexOf('## Schedules');
    const operations = BACKUP_API_MARKDOWN.slice(start, end).replace(/^### /gm, '## ').replace(/\n+$/, '\n');
    expect(markdown(BACKUP_SPEC, { tag: 'Restores' })).toBe(
      `**Server** \`https://backup.example.com/api/v2\`\n\n**Auth** bearer\n\n${operations}`,
    );
  });

  test('of one operation shows its first slot of a schema with its fields', () => {
    const text = markdown(BACKUP_SPEC, { tag: 'Schedules' });
    expect(text.startsWith('**Server** `https://backup.example.com/api/v2`\n\n**Auth** bearer\n\n## `GET /schedules`\n')).toBe(true);
    expect(text).toContain('**`200`** <em id="schema-schedule">Schedule[]</em>\\\n');
    expect(text).not.toContain('`POST /restores`\n');
  });

  test('with a description shows it first', () => {
    const text = markdown(BACKUP_SPEC.replace('  - name: Schedules\n', '  - name: Schedules\n    description: The plans that make the copies.\n'), {
      tag: 'Schedules',
    });
    expect(text.startsWith('The plans that make the copies.\n\n**Server**')).toBe(true);
  });

  test('that only an operation names shows its operations, and a tag that the file lacks gives unknown-tag', () => {
    const admin = BACKUP_SPEC.replace('tags: [Restores]\n      operationId: getRestore', 'tags: [Restores, Admin]\n      operationId: getRestore');
    expect(markdownOf({ [SPEC]: admin }, { tag: 'Archive' })).toEqual({ kind: 'unknown-tag' });

    const whole = markdown(admin);
    expect(whole.match(/`GET \/restores\/\{id\}`/g)).toHaveLength(1);
    expect(whole).not.toMatch(/^#+ Admin$/m);
    const tagged = markdown(admin, { tag: 'Admin' });
    expect(tagged).toContain('\n## `GET /restores/{id}`\n');
    expect(tagged).not.toContain('`POST /restores`\n');
  });
  test('that only an operation of a path item in another file names shows that operation', () => {
    const restores = specText({ '/restores': { $ref: 'paths/restores.yaml' }, '/schedules': { get: { tags: ['Schedules'], responses: {} } } });
    const item = 'post:\n  tags: [Restores]\n  summary: Start a restore\n  responses:\n    \'202\':\n      description: The restore job started.\n';
    const text = markdown(restores, { tag: 'Restores' }, { 'api/paths/restores.yaml': item });
    expect(text).toContain('## `POST /restores`\n');
    expect(text).not.toContain('`GET /schedules`');
  });
});

test.describe('a field line', () => {
  test('shows the name, the type, required, deprecated and the default', () => {
    const text = markdown(
      restoreSpec({ body: { type: 'object', required: ['state'], properties: { state: { type: 'string', deprecated: true, default: 'queued' } } } }),
    );
    expect(text).toContain('\n- `state` *string* **required** deprecated = `"queued"`\n');
  });

  test('of a read-only field shows in a response only, and of a write-only field in a request only', () => {
    const schema = () => ({
      type: 'object',
      properties: { id: { type: 'string', readOnly: true }, secret: { type: 'string', writeOnly: true }, file: { type: 'string' } },
    });
    const text = markdown(restoreSpec({ body: schema(), response: schema() }));
    expect(fieldNames(bodyPart(text))).toEqual(['secret', 'file']);
    expect(fieldNames(responsePart(text))).toEqual(['id', 'file']);
  });

  test('of an object lists its fields two spaces in, and of a list of objects the fields of its items', () => {
    const body = {
      type: 'object',
      properties: {
        target: { type: 'object', properties: { place: { type: 'object', properties: { folder: { type: 'string' } } } } },
        files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' } } } },
      },
    };
    expect(bodyPart(markdown(restoreSpec({ body })))).toContain(
      '- `target` *object*\n  - `place` *object*\n    - `folder` *string*\n- `files` *object[]*\n  - `path` *string*\n',
    );
  });

  test('of a description of three lines indents each under its item, and its empty line stays empty', () => {
    const body = {
      type: 'object',
      properties: { file: { type: 'string', description: 'The full path of the file.\r\n\r\nAs it was on the day of the copy.  ' } },
    };
    expect(markdown(restoreSpec({ body }))).toContain('\n- `file` *string*\\\n  The full path of the file.\n\n  As it was on the day of the copy.\n');
  });
});

test.describe('a schema', () => {
  test('of allOf merges its parts', () => {
    const response = {
      allOf: [{ $ref: '#/components/schemas/Restore' }, { required: ['state'], properties: { done: { type: 'boolean' } } }],
    };
    const part = responsePart(markdown(restoreSpec({ response })));
    expect(fieldNames(part)).toEqual(['id', 'state', 'file', 'bytesDone', 'done']);
    expect(part).toMatch(/^- `state` \*"queued" \| "running" \| "done" \| "failed"\* \*\*required\*\*$/m);
  });

  test('of anyOf lists a line for each variant', () => {
    const body = { type: 'object', properties: { day: { anyOf: [{ type: 'string', format: 'date' }, { type: 'integer' }] } } };
    expect(bodyPart(markdown(restoreSpec({ body })))).toMatch(/^- `day` \*any of\*\n {2}- .*\*string \(date\)\*.*\n {2}- .*\*integer\*/m);
  });

  test('with a discriminator and no mapping takes the const of each variant, else its name', () => {
    const schemas = {
      OriginalPlace: { type: 'object', required: ['kind'], properties: { kind: { const: 'original' } } },
      OtherFolder: { type: 'object', properties: { kind: { type: 'string' }, folder: { type: 'string' } } },
    };
    const body = {
      type: 'object',
      properties: {
        target: {
          anyOf: [{ $ref: '#/components/schemas/OriginalPlace' }, { $ref: '#/components/schemas/OtherFolder' }],
          discriminator: { propertyName: 'kind' },
        },
      },
    };
    expect(bodyPart(markdown(restoreSpec({ body, schemas })))).toContain(
      [
        '- `target` *any of*',
        '  - <em id="schema-originalplace">OriginalPlace</em> · `kind` = "original"',
        '  - <em id="schema-otherfolder">OtherFolder</em> · `kind` = "OtherFolder"',
        '    - `folder` *string*',
        '',
      ].join('\n'),
    );
  });

  test('gives the type text of its const, enum, type, list, limits and nothing', () => {
    const body = {
      type: 'object',
      properties: {
        a: { const: 'original' },
        b: { enum: [1, 2, null] },
        c: { type: ['string', 'null'] },
        d: { type: 'array', items: { type: ['string', 'null'] } },
        e: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 },
        f: {},
        g: { type: 'object' },
      },
    };
    expect(bodyPart(markdown(restoreSpec({ body })))).toContain(
      [
        '- `a` *"original"*',
        '- `b` *1 | 2 | null*',
        '- `c` *string | null*',
        '- `d` *(string | null)[]*',
        '- `e` *number > 0 < 1*',
        '- `f` *any*',
        '- `g` *object*',
        '',
      ].join('\n'),
    );
    const nullable = { type: 'object', properties: { c: { type: 'string', nullable: true } } };
    expect(bodyPart(markdown(restoreSpec({ body: nullable, version: '3.0.3' })))).toContain('\n- `c` *string | null*\n');
  });

  test('that holds a list of itself links to its first slot, with no list under the link', () => {
    const schemas = {
      Folder: {
        type: 'object',
        properties: { name: { type: 'string' }, children: { type: 'array', items: { $ref: '#/components/schemas/Folder' } } },
      },
    };
    const text = markdown(restoreSpec({ body: { $ref: '#/components/schemas/Folder' }, schemas }));
    expect(text).toContain(
      '**Body** <em id="schema-folder">Folder</em>\n\n- `name` *string*\n- `children` [*Folder[]*](#schema-folder)\n\n**Responses**',
    );
  });

  test('with no name that holds itself through an alias ends its list where it comes back', () => {
    const text = `openapi: 3.1.0
info:
  title: Backup API
  version: 2.0.0
paths:
  /folders:
    post:
      summary: Make a folder
      requestBody:
        content:
          application/json:
            schema: &folder
              type: object
              properties:
                name:
                  type: string
                parent: *folder
      responses:
        '201':
          description: The folder.
`;
    expect(markdown(text)).toContain('**Body** *object*\n\n- `name` *string*\n- `parent` *object*\n\n**Responses**');
  });
});

test.describe('a description', () => {
  test('of the file turns each heading outside a code block into bold text', () => {
    const description = '# Introduction\n\nStart and check restores.\n\n## Notes ##\n\n```\n# not a heading\n```';
    expect(markdown(specText({}, { info: { ...INFO, description } }))).toBe(
      '**Introduction**\n\nStart and check restores.\n\n**Notes**\n\n```\n# not a heading\n```\n',
    );
  });

  test('turns the line or lines over a line of = or - into bold text, and an ATX heading over a line of - into bold text over a break', () => {
    const description = 'Introduction\n============\n\nStart and check\nrestores.\n---\n\n# Notes\n---\nOne restore at a time.';
    expect(markdown(specText({}, { info: { ...INFO, description } }))).toBe(
      '**Introduction**\n\n**Start and check\nrestores.**\n\n**Notes**\n\n---\nOne restore at a time.\n',
    );
  });

  test('keeps a line of - after a list item, a quote and a code block, which makes no heading', () => {
    const description = '- Restores\nand schedules\n---\n\n> A quote\n---\n\n```\nnot a heading\n---\n```';
    expect(markdown(specText({}, { info: { ...INFO, description } }))).toBe(`${description}\n`);
  });

  test('closes a fenced code block that it leaves open with a fence of the same signs, so the blocks after it stay out', () => {
    const post = { description: 'Puts the copy back.\n\n~~~~sh\ncurl -X POST /restores\n~~~', responses: { '202': { description: 'The restore job started.' } } };
    const text = markdown(specText({ '/restores': { post } }));
    expect(text).toContain('Puts the copy back.\n\n~~~~sh\ncurl -X POST /restores\n~~~\n~~~~\n\n**Responses**');
    expect(processor.stringify(parseMarkdown(text))).toContain('<p><strong>Responses</strong></p>');
  });
});

test.describe('auth', () => {
  const schemes = {
    token: { type: 'http', scheme: 'bearer' },
    login: {
      type: 'oauth2',
      flows: { implicit: { authorizationUrl: 'https://backup.example.com/login', scopes: { 'restores:read': 'Read', 'restores:write': 'Write' } } },
    },
  };
  const operation = (summary: string, security: unknown[]) => ({ get: { summary, security, responses: {} } });

  test('of an operation shows when it differs from the auth of the file', () => {
    const text = markdown(
      specText(
        {
          '/a': operation('No auth', []),
          '/b': operation('Token or none', [{ token: [] }, {}]),
          '/c': operation('Login', [{ login: ['restores:read', 'restores:write'] }]),
          '/d': operation('Token', [{ token: [] }]),
        },
        { security: [{ token: [] }], components: { securitySchemes: schemes } },
      ),
    );
    expect(text.startsWith('**Auth** bearer\n\n')).toBe(true);
    expect(operationPart(text, '## `GET /a`')).toContain('\n**Auth** none\n');
    expect(operationPart(text, '## `GET /b`')).toContain('\n**Auth** bearer or none\n');
    expect(operationPart(text, '## `GET /c`')).toContain('\n**Auth** oauth2 (restores:read, restores:write)\n');
    expect(operationPart(text, '## `GET /d`')).not.toContain('**Auth**');
  });
});

test('two servers give one Server line, of the first', () => {
  const servers = [{ url: 'https://backup.example.com/api/v2' }, { url: 'https://eu.backup.example.com/api/v2' }];
  const text = markdown(specText({}, { servers }));
  expect(text).toBe('**Server** `https://backup.example.com/api/v2`\n');
});

test.describe('a media type', () => {
  const withContent = (body: Record<string, unknown> | null, response: Record<string, unknown> | null) => {
    const post: Record<string, unknown> = { summary: 'Start a restore' };
    if (body) post.requestBody = { content: body };
    post.responses = { '202': { description: 'The restore job started.', ...(response ? { content: response } : {}) } };
    return specText({ '/restores': { post } });
  };

  test('other than JSON shows after the type', () => {
    expect(markdown(withContent({ 'text/csv': { schema: { type: 'string' } } }, null))).toContain('\n**Body** *string* `text/csv`\n');
  });

  test('with two examples shows each after a paragraph of its summary, else of its key', () => {
    const response = {
      'application/json': {
        schema: { type: 'object' },
        examples: { running: { summary: 'Running restore', value: { state: 'running' } }, queued: { value: { state: 'queued' } } },
      },
    };
    expect(markdown(withContent(null, response))).toContain(
      'Running restore\n\n```json\n{\n  "state": "running"\n}\n```\n\nqueued\n\n```json\n{\n  "state": "queued"\n}\n```\n',
    );
  });

  test('shows a string example of a type with no json as written, in a fence longer than each run of backticks in it', () => {
    const csv = { 'text/csv': { schema: { type: 'string' }, example: 'file,day\n/home/ana/report.pdf,2026-10-28' } };
    expect(markdown(withContent(null, csv))).toContain('\n\n```\nfile,day\n/home/ana/report.pdf,2026-10-28\n```\n');
    const ticks = { 'text/plain': { schema: { type: 'string' }, example: 'Run ```restore``` now' } };
    expect(markdown(withContent(null, ticks))).toContain('\n\n````\nRun ```restore``` now\n````\n');
  });

  test('shows no block for an example that holds itself through an alias', () => {
    const text = `openapi: 3.1.0
info:
  title: Backup API
  version: 2.0.0
paths:
  /restores:
    post:
      summary: Start a restore
      responses:
        '202':
          description: The restore job started.
          content:
            application/json:
              schema:
                type: object
              example: &job
                state: running
                self: *job
`;
    const written = markdown(text);
    expect(written).toContain('**`202`** *object*\\\nThe restore job started.\n');
    expect(written).not.toContain('```');
  });
});

test.describe('parameters', () => {
  test('show by place, the path ones first, and an operation one replaces a path one of the same name and place', () => {
    const text = markdown(
      specText({
        '/restores/{id}': {
          parameters: [
            { name: 'id', in: 'path', required: true, description: 'The old id.', schema: { type: 'string' } },
            { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
          ],
          get: {
            summary: 'Check a restore',
            parameters: [
              { name: 'wait', in: 'query', schema: { type: 'integer' } },
              { name: 'session', in: 'cookie', schema: { type: 'string' } },
              { name: 'id', in: 'path', required: true, description: 'The id that `POST /restores` returned.', schema: { type: 'string' } },
              { name: 'filter', in: 'query', content: { 'application/json': { schema: { type: 'object' } } } },
            ],
            responses: { '200': { description: 'The state of the restore.' } },
          },
        },
      }),
    );
    expect(text).toContain(
      [
        '**Path**',
        '',
        '- `id` *string* **required**\\',
        '  The id that `POST /restores` returned.',
        '',
        '**Query**',
        '',
        '- `wait` *integer*',
        '- `filter` *object*',
        '',
        '**Header**',
        '',
        '- `X-Trace` *string*',
        '',
        '**Cookie**',
        '',
        '- `session` *string*',
        '',
      ].join('\n'),
    );
    expect(text).not.toContain('The old id.');
  });
});

test.describe('OpenAPI 3.2', () => {
  test('shows a query operation, the other operations, a querystring parameter and a data value', () => {
    const text = markdown(
      specText(
        {
          '/restores': {
            query: {
              summary: 'Find restores',
              parameters: [{ name: 'filter', in: 'querystring', content: { 'application/x-www-form-urlencoded': { schema: { type: 'object' } } } }],
              responses: {
                '200': {
                  description: 'The restores that match.',
                  content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } }, examples: { one: { dataValue: [{ id: 'r-1' }] } } } },
                },
              },
            },
            additionalOperations: { PURGE: { summary: 'Drop old restores', responses: { '204': { description: 'The old restores are gone.' } } } },
          },
        },
        {},
        '3.2.0',
      ),
    );
    const query = text.search(/^## `QUERY \/restores`$/m);
    expect(query).toBeGreaterThanOrEqual(0);
    expect(text.search(/^## `PURGE \/restores`$/m)).toBeGreaterThan(query);
    expect(text).toContain('\n**Query**\n\n- `filter` *object*\n');
    expect(text).toContain('\n```json\n[\n  {\n    "id": "r-1"\n  }\n]\n```\n');
  });
});

test.describe('a $ref that points nowhere', () => {
  test('shows the bad slot as the type of its field, and the rest of the reference shows', () => {
    const written = markdownOf({ [SPEC]: UNRESOLVED_SPEC });
    expect(written.kind).toBe('ok');
    if (written.kind !== 'ok') return;
    expect(written.markdown).toContain(`\n- \`target\` ${badSlot('#/components/schemas/Place', SPEC, 18)}\n`);
    expect(written.markdown).toContain('\n- `file` *string*\n');
    expect(written.markdown).toContain('\n**`202`**\\\nThe restore job started.\n');
    expect(written.unresolved).toEqual([{ file: SPEC, line: 18, ref: '#/components/schemas/Place' }]);
  });

  test('of a response, a parameter, a variant and a part of allOf shows the bad slot in its place', () => {
    const text = specText(
      {
        '/restores': {
          post: {
            summary: 'Start a restore',
            parameters: [{ name: 'wait', in: 'query', schema: { type: 'integer' } }, { $ref: '#/components/parameters/Gone' }],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      target: { oneOf: [{ $ref: '#/components/schemas/OriginalPlace' }, { $ref: '#/components/schemas/GonePlace' }] },
                      job: { allOf: [{ $ref: '#/components/schemas/GoneJob' }, { properties: { done: { type: 'boolean' } } }] },
                    },
                  },
                },
              },
            },
            responses: { '404': { $ref: '#/components/responses/Gone' } },
          },
        },
      },
      { components: { schemas: { OriginalPlace: { type: 'object', required: ['kind'], properties: { kind: { const: 'original' } } } } } },
    );
    const place = (ref: string) => ({ file: SPEC, line: lineOf(text, `"$ref": "${ref}"`), ref });
    const slot = (ref: string) => badSlot(ref, SPEC, place(ref).line);
    const written = markdownOf({ [SPEC]: text });
    expect(written.kind).toBe('ok');
    if (written.kind !== 'ok') return;
    const out = written.markdown;
    // `*` items, so the bad slot is a list of its own and no item of 'Query'.
    expect(out).toContain(`\n**Query**\n\n- \`wait\` *integer*\n\n* ${slot('#/components/parameters/Gone')}\n`);
    expect(processor.stringify(parseMarkdown(out))).toContain('<li><code>wait</code> <em>integer</em></li>\n</ul>\n<ul>\n<li><span class="api-bad">');
    expect(out).toContain(`\n  - ${slot('#/components/schemas/GonePlace')}\n`);
    expect(out).toContain(`\n- \`job\` ${slot('#/components/schemas/GoneJob')}\n  - \`done\` *boolean*\n`);
    expect(out).toContain(`\n**\`404\`** ${slot('#/components/responses/Gone')}`);
    expect(written.unresolved).toEqual([
      place('#/components/parameters/Gone'),
      place('#/components/schemas/GonePlace'),
      place('#/components/schemas/GoneJob'),
      place('#/components/responses/Gone'),
    ]);
  });

  test('in another file counts from that file, and a ref back to the OpenAPI file names its schema', () => {
    const request = 'api/schemas/restore-request.yaml';
    const written = markdownOf({ [SPEC]: REFS_SPEC, [request]: RESTORE_REQUEST, 'api/schemas/day.yaml': DAY_SCHEMA });
    expect(written.kind).toBe('ok');
    if (written.kind !== 'ok') return;
    expect(written.markdown).toBe(
      [
        '## `POST /restores`',
        '',
        '<p class="api-sum">Start a restore</p>',
        '',
        '**Body** <em id="schema-restore-request">restore-request</em>',
        '',
        '- `file` *string* **required**',
        '- `day` *string (date)*\\',
        '  The day of the copy.',
        '- `target` <em id="schema-restorejob">Restore/Job</em>',
        '  - `id` *string | null*',
        '  - `progress` *number > 0 ≤ 1*',
        '  - `owner` *string*',
        '  - `legacy` *integer*',
        `- \`old\` ${badSlot('gone.yaml', request, 12)}`,
        `- \`far\` ${badSlot('../../../outside.yaml', request, 14)}`,
        `- \`web\` ${badSlot('https://example.com/day.yaml', request, 16)}`,
        '',
        '**Responses**',
        '',
        '**`202`** [*Restore/Job*](#schema-restorejob)\\',
        'The restore job started.',
        '',
      ].join('\n'),
    );
    expect(written.unresolved).toEqual([
      { file: request, line: 12, ref: 'gone.yaml' },
      { file: request, line: 14, ref: '../../../outside.yaml' },
      { file: request, line: 16, ref: 'https://example.com/day.yaml' },
    ]);
  });
});

test('a file that a ref names and that does not parse makes the reference bad', () => {
  expect(markdownOf({ [SPEC]: REFS_SPEC, 'api/schemas/restore-request.yaml': RESTORE_REQUEST, 'api/schemas/day.yaml': BAD_DAY })).toEqual({
    kind: 'bad',
    file: 'api/schemas/day.yaml',
    line: 2,
  });
});

test.describe('escapes', () => {
  test('a name and a tag escape the signs of Markdown, and a path and a field name get a code span that holds their backticks', () => {
    const plainSpec = specText(
      {
        '/a`b': { get: { summary: 'Odd path', responses: {} } },
        '/restores': {
          post: {
            summary: 'Start a restore',
            requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Restore_Job*' } } } },
            responses: {},
          },
        },
      },
      { components: { schemas: { 'Restore_Job*': { type: 'object', properties: { '`id`': { type: 'string' } } } } } },
    );
    const text = markdown(plainSpec);
    expect(text).toMatch(/^## ``GET \/a`b``$/m);
    expect(text).toContain('<em id="schema-restore_job">Restore\\_Job\\*</em>');
    expect(text).toContain('\n- `` `id` `` *string*\n');

    const tagged = specText({
      '/admin': { get: { tags: ['<Admin>'], summary: 'Admin', responses: {} } },
      '/restores': { get: { tags: ['Restores'], summary: 'List restores', responses: {} } },
    });
    expect(markdown(tagged)).toMatch(/^## \\<Admin\\>$/m);
  });

  test('a summary becomes one line with its HTML signs as entities', () => {
    const text = markdown(specText({ '/restores': { post: { summary: 'Start  a\n<restore> & "wait"', responses: {} } } }));
    expect(text).toContain('<p class="api-sum">Start a &lt;restore&gt; &amp; &quot;wait&quot;</p>');
  });
});
