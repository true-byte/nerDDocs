import { parse } from 'yaml';
import { apiMarkdown, type ApiOptions, type ApiText } from '../../src/markdown/openapi/markdown.ts';
import { openSpec, REF_PLACE, type RefPlace, type Spec } from '../../src/markdown/openapi/read.ts';
import { elementAt, openingTag } from './html.ts';
import { fakeFiles, type FakeFiles } from './images.ts';
import { THREE_LEVELS } from './levels.ts';

/**
 * The OpenAPI file 'Backup API' of the backup app, at `api/openapi.yaml`. Its line 9 is `  - token: []`. Its `$ref` lines
 * are 25, 37, 48, 68, 74, 95, 116 and 117.
 */
export const BACKUP_SPEC = `openapi: 3.1.0
info:
  title: Backup API
  version: 2.0.0
  description: Start and check restores, and read the backup schedules.
servers:
  - url: https://backup.example.com/api/v2
security:
  - token: []
tags:
  - name: Restores
  - name: Schedules
paths:
  /restores:
    post:
      tags: [Restores]
      operationId: startRestore
      summary: Start a restore
      description: Puts the copy of one file from one day back on the computer.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RestoreRequest'
            example:
              file: /home/ana/report.pdf
              day: '2026-10-28'
              target:
                kind: original
      responses:
        '202':
          description: The restore job started.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Restore'
              example:
                id: 6f1c2a9e-3b7d-4c55-9a2e-1d8f0b4c7e21
                state: running
                file: /home/ana/projects/2026/backup-plan/report-final.pdf
                bytesDone: 1048576
        '404':
          description: No copy of the file on that day.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
  /restores/{id}:
    get:
      tags: [Restores]
      operationId: getRestore
      summary: Check a restore
      parameters:
        - name: id
          in: path
          required: true
          description: The id that \`POST /restores\` returned.
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: The state of the restore.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Restore'
        '404':
          description: No restore with that id.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
  /schedules:
    get:
      tags: [Schedules]
      operationId: listSchedules
      summary: List the schedules
      parameters:
        - name: plan
          in: query
          description: Only the schedules of this plan.
          schema:
            type: string
            enum: [daily, weekly, monthly]
      responses:
        '200':
          description: Every schedule of the account.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Schedule'
components:
  securitySchemes:
    token:
      type: http
      scheme: bearer
  schemas:
    RestoreRequest:
      type: object
      required: [file, day, target]
      properties:
        file:
          type: string
          description: The full path of the file, as it was on the day of the copy.
        day:
          type: string
          format: date
          description: The day of the copy. The newest closed copy of that day is used.
        target:
          description: Where the file goes.
          oneOf:
            - $ref: '#/components/schemas/OriginalPlace'
            - $ref: '#/components/schemas/OtherFolder'
          discriminator:
            propertyName: kind
            mapping:
              original: '#/components/schemas/OriginalPlace'
              folder: '#/components/schemas/OtherFolder'
    OriginalPlace:
      type: object
      required: [kind]
      properties:
        kind:
          const: original
    OtherFolder:
      type: object
      required: [kind, folder]
      properties:
        kind:
          const: folder
        folder:
          type: string
          description: The folder that gets the file. The app makes it if it is missing.
    Restore:
      type: object
      properties:
        id:
          type: string
          format: uuid
          readOnly: true
        state:
          type: string
          enum: [queued, running, done, failed]
        file:
          type: string
        bytesDone:
          type: integer
          description: The bytes written back so far.
    Error:
      type: object
      required: [code, message]
      properties:
        code:
          type: string
        message:
          type: string
    Schedule:
      type: object
      properties:
        plan:
          type: string
          enum: [daily, weekly, monthly]
        runs:
          type: string
          description: The time of day of each run, such as \`02:00\`.
        copiesKept:
          type: integer
          minimum: 1
`;

/** `BACKUP_SPEC` as JSON, with the same values in the same order. */
export const BACKUP_SPEC_JSON = `${JSON.stringify(parse(BACKUP_SPEC), null, 2)}\n`;

/** `BACKUP_SPEC` with a bad line 9, `  - token: []]`, which is its first error. */
export const BROKEN_SPEC = BACKUP_SPEC.replace('  - token: []\n', '  - token: []]\n');

/** `BACKUP_SPEC` whose refs to 'Error' name the file `api/schemas/error.yaml`. */
export const SPLIT_SPEC = BACKUP_SPEC.replaceAll("'#/components/schemas/Error'", "'schemas/error.yaml'");

/** The schema 'Error', at `api/schemas/error.yaml`. */
export const ERROR_SCHEMA = 'type: object\nrequired: [code, message]\nproperties:\n  code:\n    type: string\n  message:\n    type: string\n';

/** A spec whose one `$ref`, at line 18, points to a schema that the file lacks. */
export const UNRESOLVED_SPEC = `openapi: 3.1.0
info:
  title: Backup API
  version: 2.0.0
paths:
  /restores:
    post:
      summary: Start a restore
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                file:
                  type: string
                target:
                  $ref: '#/components/schemas/Place'
      responses:
        '202':
          description: The restore job started.
`;

/** A spec at `api/openapi.yaml` whose refs need escapes and another file. */
export const REFS_SPEC = `openapi: 3.0.3
info:
  title: Backup API
  version: 2.0.0
paths:
  /restores:
    post:
      summary: Start a restore
      requestBody:
        content:
          application/json:
            schema:
              $ref: 'schemas/restore-request.yaml'
      responses:
        '202':
          $ref: '#/components/responses/Started'
components:
  responses:
    Started:
      description: The restore job started.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Restore~1Job'
  schemas:
    Restore/Job:
      type: object
      properties:
        id:
          type: string
          nullable: true
        progress:
          type: number
          minimum: 0
          exclusiveMinimum: true
          maximum: 1
        owner:
          $ref: '#/components/schemas/Owner%20Name'
        legacy:
          $ref: '#/components/schemas/a~0b'
    Owner Name:
      type: string
    a~b:
      type: integer
`;

/** The body schema of `REFS_SPEC`, at `api/schemas/restore-request.yaml`. Its `$ref`s are at lines 7, 10, 12, 14 and 16. */
export const RESTORE_REQUEST = `type: object
required: [file]
properties:
  file:
    type: string
  day:
    $ref: 'day.yaml'
    description: The day of the copy.
  target:
    $ref: '../openapi.yaml#/components/schemas/Restore~1Job'
  old:
    $ref: 'gone.yaml'
  far:
    $ref: '../../../outside.yaml'
  web:
    $ref: 'https://example.com/day.yaml'
`;

/** The schema of a day, at `api/schemas/day.yaml`. */
export const DAY_SCHEMA = 'type: string\nformat: date\ndescription: A day.\n';

/** A broken `api/schemas/day.yaml`, whose first error is at line 2. */
export const BAD_DAY = 'type: [string\nformat: date\n';

/** A spec whose schema 'A', at line 6, refs 'B', at line 7, which refs 'A'. */
export const LOOP_SPEC =
  "openapi: 3.1.0\ninfo: {title: Loop, version: '1'}\npaths: {}\ncomponents:\n  schemas:\n    A: {$ref: '#/components/schemas/B'}\n    B: {$ref: '#/components/schemas/A'}\n";

/** The Swagger 2.0 file of the first version of 'Backup API', at `api/swagger.yaml`. */
export const BACKUP_SWAGGER = `swagger: '2.0'
info:
  title: Backup API
  version: 1.0.0
host: backup.example.com
basePath: /api/v1
schemes: [https]
securityDefinitions:
  token:
    type: apiKey
    name: X-Token
    in: header
security:
  - token: []
tags:
  - name: Restores
paths:
  /restores:
    post:
      tags: [Restores]
      summary: Start a restore
      consumes: [application/json]
      parameters:
        - name: body
          in: body
          required: true
          schema:
            $ref: '#/definitions/RestoreRequest'
      responses:
        '202':
          description: The restore job started.
          schema:
            $ref: '#/definitions/Restore'
          examples:
            application/json:
              id: r-1
              state: queued
  /restores/{id}:
    get:
      tags: [Restores]
      summary: Check a restore
      parameters:
        - $ref: '#/parameters/RestoreId'
        - name: wait
          in: query
          type: integer
          minimum: 0
          default: 0
          description: Seconds to wait for a change.
      responses:
        '200':
          description: The state of the restore.
          schema:
            $ref: '#/definitions/Restore'
        '404':
          $ref: '#/responses/NotFound'
parameters:
  RestoreId:
    name: id
    in: path
    required: true
    type: string
    description: The id that \`POST /restores\` returned.
responses:
  NotFound:
    description: No restore with that id.
definitions:
  RestoreRequest:
    type: object
    required: [file, day]
    properties:
      file:
        type: string
      day:
        type: string
        format: date
  Restore:
    type: object
    properties:
      id:
        type: string
      state:
        type: string
        enum: [queued, running, done, failed]
`;

/** What `apiMarkdown` writes for `BACKUP_SPEC` with no tag at rank 2. */
export const BACKUP_API_MARKDOWN = `Start and check restores, and read the backup schedules.

**Server** \`https://backup.example.com/api/v2\`

**Auth** bearer

## Restores

### \`POST /restores\`

<p class="api-sum">Start a restore</p>

Puts the copy of one file from one day back on the computer.

**Body** <em id="schema-restorerequest">RestoreRequest</em> **required**

- \`file\` *string* **required**\\
  The full path of the file, as it was on the day of the copy.
- \`day\` *string (date)* **required**\\
  The day of the copy. The newest closed copy of that day is used.
- \`target\` *one of* **required**\\
  Where the file goes.
  - <em id="schema-originalplace">OriginalPlace</em> · \`kind\` = "original"
  - <em id="schema-otherfolder">OtherFolder</em> · \`kind\` = "folder"
    - \`folder\` *string* **required**\\
      The folder that gets the file. The app makes it if it is missing.

\`\`\`json
{
  "file": "/home/ana/report.pdf",
  "day": "2026-10-28",
  "target": {
    "kind": "original"
  }
}
\`\`\`

**Responses**

**\`202\`** <em id="schema-restore">Restore</em>\\
The restore job started.

- \`id\` *string (uuid)*
- \`state\` *"queued" | "running" | "done" | "failed"*
- \`file\` *string*
- \`bytesDone\` *integer*\\
  The bytes written back so far.

\`\`\`json
{
  "id": "6f1c2a9e-3b7d-4c55-9a2e-1d8f0b4c7e21",
  "state": "running",
  "file": "/home/ana/projects/2026/backup-plan/report-final.pdf",
  "bytesDone": 1048576
}
\`\`\`

**\`404\`** <em id="schema-error">Error</em>\\
No copy of the file on that day.

- \`code\` *string* **required**
- \`message\` *string* **required**

### \`GET /restores/{id}\`

<p class="api-sum">Check a restore</p>

**Path**

- \`id\` *string (uuid)* **required**\\
  The id that \`POST /restores\` returned.

**Responses**

**\`200\`** [*Restore*](#schema-restore)\\
The state of the restore.

**\`404\`** [*Error*](#schema-error)\\
No restore with that id.

## Schedules

### \`GET /schedules\`

<p class="api-sum">List the schedules</p>

**Query**

- \`plan\` *"daily" | "weekly" | "monthly"*\\
  Only the schedules of this plan.

**Responses**

**\`200\`** <em id="schema-schedule">Schedule[]</em>\\
Every schedule of the account.

- \`plan\` *"daily" | "weekly" | "monthly"*
- \`runs\` *string*\\
  The time of day of each run, such as \`02:00\`.
- \`copiesKept\` *integer ≥ 1*
`;

/** What `apiMarkdown` writes for `BACKUP_SWAGGER` at rank 2. It has one tag, so its operations are at rank 2. */
export const BACKUP_SWAGGER_MARKDOWN = `**Server** \`https://backup.example.com/api/v1\`

**Auth** \`X-Token\` header

## \`POST /restores\`

<p class="api-sum">Start a restore</p>

**Body** <em id="schema-restorerequest">RestoreRequest</em> **required**

- \`file\` *string* **required**
- \`day\` *string (date)* **required**

**Responses**

**\`202\`** <em id="schema-restore">Restore</em>\\
The restore job started.

- \`id\` *string*
- \`state\` *"queued" | "running" | "done" | "failed"*

\`\`\`json
{
  "id": "r-1",
  "state": "queued"
}
\`\`\`

## \`GET /restores/{id}\`

<p class="api-sum">Check a restore</p>

**Path**

- \`id\` *string* **required**\\
  The id that \`POST /restores\` returned.

**Query**

- \`wait\` *integer ≥ 0* = \`0\`\\
  Seconds to wait for a change.

**Responses**

**\`200\`** [*Restore*](#schema-restore)\\
The state of the restore.

**\`404\`**\\
No restore with that id.
`;

/** The page 'Backup API' at `api.md`: a short text at 'Overview' and 'Requirements', and the reference at 'Internals'. */
export const BACKUP_API_PAGE =
  '# Backup API\n\n::: overview requirements\nThe backup app has an API for scripts.\n\n::: internals\n![Backup API](api/openapi.yaml)\n:::\n';

/** The levels of the backup app, opening at 'Internals'. */
export const INTERNALS_FIRST = JSON.stringify({ ...JSON.parse(THREE_LEVELS), defaultLevel: 'internals' });

/** 'Backup API' with its OpenAPI file, opening at 'Internals'. */
export const API_SITE: Record<string, string> = {
  'nerddocs.json': INTERNALS_FIRST,
  'api.md': BACKUP_API_PAGE,
  'api/openapi.yaml': BACKUP_SPEC,
};

/** The files of the docs folder `/home/ana/docs`, each with the version 1730000000000 plus its place in key order, from 1. */
export function apiFiles(files: Record<string, string>, page = 'api.md'): FakeFiles {
  const versioned = Object.entries(files).map(([path, bytes], at) => [path, { bytes, version: 1730000000000 + at + 1 }] as const);
  return fakeFiles(Object.fromEntries(versioned), page);
}

/** The spec of the OpenAPI file at `path` among the files, which must open. */
export function specOf(files: Record<string, string>, path = 'api/openapi.yaml'): Spec {
  const opened = openSpec(apiFiles(files), path);
  if (opened.kind !== 'ok') throw new Error(`${path} does not open: ${JSON.stringify(opened)}`);
  return opened.spec;
}

/** What `apiMarkdown` writes for the OpenAPI file at `path`, with no tag at rank 2 and no ids taken, unless the options say else. */
export function markdownOf(files: Record<string, string>, options: Partial<ApiOptions> = {}, path?: string): ApiText {
  return apiMarkdown(specOf(files, path), { tag: null, rank: 2, ids: new Set(), ...options });
}

/** A 3.1 spec with `count` operations over 50 tags, each with a body of 10 fields. */
export function bigSpec(count: number): string {
  const tags = Array.from({ length: 50 }, (_, n) => ({ name: `Part ${n + 1}`, description: `The jobs of part ${n + 1} of the backup app.` }));
  const paths: Record<string, unknown> = {};
  for (let n = 0; n < count; n++) {
    const properties = Object.fromEntries(
      Array.from({ length: 10 }, (_, field) => [`field${field + 1}`, { type: 'string', description: `Field ${field + 1} of job ${n + 1}.` }]),
    );
    paths[`/jobs-${n + 1}`] = {
      post: {
        tags: [tags[n % tags.length]!.name],
        summary: `Start job ${n + 1}`,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['field1'], properties } } } },
        responses: { '202': { description: 'The job started.' } },
      },
    };
  }
  return JSON.stringify({ openapi: '3.1.0', info: { title: 'Big API', version: '1.0.0' }, tags, paths }, null, 2);
}

/** The outer HTML of the first `section.api` of the HTML. */
export function sectionOf(html: string): string {
  const at = html.search(openingTag('section', { class: 'api' }));
  if (at < 0) throw new Error('No section.api is in the HTML.');
  return elementAt(html, at);
}

/** The outer HTML of each `section.api` of the HTML, in page order. */
export function sectionsOf(html: string): string[] {
  return [...html.matchAll(new RegExp(openingTag('section', { class: 'api' }).source, 'g'))].map((found) => elementAt(html, found.index));
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** The tokens that hold a letter or a digit, after each tag of the HTML becomes a space and its entities are decoded. */
export function wordsOf(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => ENTITIES[name.toLowerCase()] ?? entity);
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** The path of the warning icon of a bad slot. */
const WARN = 'M12 3 2 21h20L12 3zM12 10v5M12 18v.5';

/** The Markdown of the bad slot of a `$ref` that points nowhere. */
export const badSlot = (ref: string, file: string, line: number) =>
  `<span class="api-bad"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${WARN}"></path></svg>\`Unresolved ref: ${ref} ${file}:${line}\`</span>`;

/** The HTML of the bad slot of a `$ref` that points nowhere. */
export const badSlotHtml = (ref: string, file: string, line: number) =>
  `<span class="api-bad"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${WARN}"></path></svg><code>Unresolved ref: ${ref} ${file}:${line}</code></span>`;

/** The value at the keys and indexes of the path, or undefined where one is missing. */
export function valueAt(node: unknown, ...path: (string | number)[]): unknown {
  let at = node;
  for (const key of path) {
    if (at === null || typeof at !== 'object') return undefined;
    at = (at as Record<string | number, unknown>)[key];
  }
  return at;
}

/** The place that the parse noted on an object that holds a `$ref`. */
export const placeOf = (node: unknown): RefPlace | undefined =>
  node !== null && typeof node === 'object' ? (node as { [REF_PLACE]?: RefPlace })[REF_PLACE] : undefined;

/** The own string keys of an object and their values, without the place that the parse noted. */
export const plain = (node: unknown) => Object.fromEntries(Object.entries(node as object));

/** The 1-based line of the first place where `needle` shows in the text. */
export function lineOf(text: string, needle: string): number {
  const at = text.indexOf(needle);
  if (at < 0) throw new Error(`${needle} is not in the text.`);
  return text.slice(0, at).split('\n').length;
}
