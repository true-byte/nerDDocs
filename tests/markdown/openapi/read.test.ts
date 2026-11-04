import { expect, test } from '@playwright/test';
import { openSpec, parseSpecText, REF_PLACE, type Followed, type ParsedFile } from '../../../src/markdown/openapi/read.ts';
import {
  apiFiles,
  BACKUP_SPEC,
  BAD_DAY,
  BROKEN_SPEC,
  DAY_SCHEMA,
  LOOP_SPEC,
  placeOf,
  plain,
  REFS_SPEC,
  RESTORE_REQUEST,
  specOf,
  valueAt,
} from '../../support/openapi.ts';

const SPEC = 'api/openapi.yaml';
const REQUEST = 'api/schemas/restore-request.yaml';

const used = (file: string, version: number | null) => ({ file, path: `/home/ana/docs/${file}`, version });

/** The value of a parsed file, which must parse. */
function valueOf(parsed: ParsedFile): unknown {
  if (parsed.kind !== 'ok') throw new Error(`The text does not parse: line ${parsed.line}.`);
  return parsed.value;
}

/** The value that `follow` gives, which must be one. */
function followedValue(followed: Followed): Extract<Followed, { kind: 'value' }> {
  if (followed.kind !== 'value') throw new Error(`The node gives ${JSON.stringify(followed)}.`);
  return followed;
}

/** The line of each `$ref` that the parse noted, in order. */
function refLines(node: unknown, seen = new Set<object>()): number[] {
  if (node === null || typeof node !== 'object' || seen.has(node)) return [];
  seen.add(node);
  const own = placeOf(node);
  return [...(own ? [own.line] : []), ...Object.values(node).flatMap((child) => refLines(child, seen))].sort((a, b) => a - b);
}

/** A node with a `$ref` that no fixture holds, as the parse would note it on line 1 of the OpenAPI file. */
const madeRef = (ref: string) => ({ $ref: ref, [REF_PLACE]: { file: SPEC, line: 1, ref } });

test.describe('a parse', () => {
  test('gives the value, the line of each key of the root, and the place of each $ref', () => {
    const parsed = parseSpecText(SPEC, BACKUP_SPEC);
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    expect(parsed.lines.openapi).toBe(1);
    expect(parsed.lines.paths).toBe(13);
    const variant = valueAt(parsed.value, 'components', 'schemas', 'RestoreRequest', 'properties', 'target', 'oneOf', 0);
    expect(placeOf(variant)).toEqual({ file: SPEC, line: 116, ref: '#/components/schemas/OriginalPlace' });
    expect(refLines(parsed.value)).toEqual([25, 37, 48, 68, 74, 95, 116, 117]);
  });

  test('reads JSON, with the line of each $ref', () => {
    const json =
      '{\n  "openapi": "3.1.0",\n  "info": { "title": "Backup API", "version": "2.0.0" },\n  "paths": {},\n  "components": { "schemas": { "Day": { "$ref": "#/components/schemas/Date" }, "Date": { "type": "string" } } }\n}\n';
    const value = valueOf(parseSpecText('api/openapi.json', json));
    expect(valueAt(value, 'openapi')).toBe('3.1.0');
    expect(placeOf(valueAt(value, 'components', 'schemas', 'Day'))).toEqual({
      file: 'api/openapi.json',
      line: 5,
      ref: '#/components/schemas/Date',
    });
  });

  test('of a broken text gives the line of its first error', () => {
    expect(parseSpecText(SPEC, BROKEN_SPEC)).toEqual({ kind: 'bad', line: 9 });
    const json =
      '{\n  "openapi": "3.1.0",\n  "info": {\n    "title": "Backup API",\n    "version": "2.0.0"\n  },\n  "paths": {\n    "/restores": {\n      "post": { "summary": "Start a restore" ]\n    }\n  }\n}\n';
    expect(parseSpecText('api/openapi.json', json)).toEqual({ kind: 'bad', line: 9 });
    expect(parseSpecText(SPEC, 'openapi: 3.1.0\ninfo: {}\ninfo: {}\n')).toEqual({ kind: 'bad', line: 3 });
    expect(parseSpecText(SPEC, 'a: 1\n---\nb: 2\n')).toEqual({ kind: 'bad', line: 2 });
  });

  test('of a text over the alias limit gives line 1', () => {
    const nine = (item: string) => `[${Array.from({ length: 9 }, () => item).join(', ')}]`;
    const text = ['a: &a ' + nine('x'), 'b: &b ' + nine('*a'), 'c: &c ' + nine('*b'), 'd: &d ' + nine('*c'), 'e: &e ' + nine('*d')].join('\n');
    expect(parseSpecText(SPEC, `${text}\n`)).toEqual({ kind: 'bad', line: 1 });
  });

  test('of a text with a byte order mark is the same as without it', () => {
    const marked = parseSpecText('api/marked.yaml', '﻿openapi: 3.1.0\ninfo: {}\n');
    const unmarked = parseSpecText('api/unmarked.yaml', 'openapi: 3.1.0\ninfo: {}\n');
    expect(marked).toEqual(unmarked);
  });

  test('is kept for the same path and text, and a new text replaces it', () => {
    const first = valueOf(parseSpecText('api/kept.yaml', 'openapi: 3.1.0\n'));
    expect(valueOf(parseSpecText('api/kept.yaml', 'openapi: 3.1.0\n'))).toBe(first);
    const changed = valueOf(parseSpecText('api/kept.yaml', 'openapi: 3.2.0\n'));
    expect(changed).not.toBe(first);
    const back = valueOf(parseSpecText('api/kept.yaml', 'openapi: 3.1.0\n'));
    expect(back).not.toBe(first);
    expect(back).toEqual(first);
  });
});

test.describe('an OpenAPI file', () => {
  test('gives its version, its root and its use', () => {
    const versions: [string, string][] = [
      ['openapi: 3.0.3', '3.0'],
      ['openapi: 3.1.0', '3.1'],
      ['openapi: 3.2.0', '3.2'],
      ["swagger: '2.0'", '2.0'],
      ['swagger: 2.0', '2.0'],
    ];
    for (const [line, version] of versions) {
      const opened = openSpec(apiFiles({ [SPEC]: `${line}\ninfo: {}\npaths: {}\n` }), SPEC);
      expect(opened.kind, line).toBe('ok');
      if (opened.kind !== 'ok') continue;
      expect(opened.spec.version, line).toBe(version);
      expect(opened.spec.file, line).toBe(SPEC);
      expect(opened.spec.uses, line).toEqual([used(SPEC, 1730000000001)]);
      expect(valueAt(opened.spec.root, 'paths'), line).toEqual({});
    }
  });

  test('with a byte order mark opens', () => {
    const opened = openSpec(apiFiles({ [SPEC]: '﻿openapi: 3.1.0\ninfo: {}\npaths: {}\n' }), SPEC);
    expect(opened.kind === 'ok' && opened.spec.version).toBe('3.1');
  });

  test('that is not OpenAPI 2.0, 3.0, 3.1 or 3.2 is bad at the line of its version, its paths, or line 1', () => {
    const cases: [string, number][] = [
      ['openapi: 4.0.0\n', 1],
      ["info: {}\nswagger: '1.2'\n", 2],
      ['info: {}\n', 1],
      ['- a\n- b\n', 1],
      ['', 1],
      ['openapi: 3.1.0\ninfo: {}\npaths: [a]\n', 3],
      [BROKEN_SPEC, 9],
    ];
    for (const [text, line] of cases) {
      expect(openSpec(apiFiles({ [SPEC]: text }), SPEC), JSON.stringify(text.slice(0, 40))).toEqual({
        kind: 'bad',
        file: SPEC,
        line,
        uses: [used(SPEC, 1730000000001)],
      });
    }
  });

  test('reads a value of the wrong type as absent', () => {
    for (const text of ['openapi: 3.1.0\ninfo: 5\npaths: {}\n', 'openapi: 3.1.0\ninfo: {}\n', 'openapi: 3.1.0\ninfo: {}\npaths: {}\ncomponents: [a]\n']) {
      expect(openSpec(apiFiles({ [SPEC]: text }), SPEC).kind, text).toBe('ok');
    }
  });

  test('that is missing gives missing', () => {
    expect(openSpec(apiFiles({}), SPEC)).toEqual({ kind: 'missing' });
  });
});

test.describe('a $ref', () => {
  const refsFiles = () => apiFiles({ [SPEC]: REFS_SPEC, [REQUEST]: RESTORE_REQUEST, 'api/schemas/day.yaml': DAY_SCHEMA });
  const refsSpec = () => {
    const opened = openSpec(refsFiles(), SPEC);
    if (opened.kind !== 'ok') throw new Error('REFS_SPEC does not open.');
    return opened.spec;
  };
  const bodySchema = (root: unknown) => valueAt(root, 'paths', '/restores', 'post', 'requestBody', 'content', 'application/json', 'schema');

  test('that is no string, or a node with none, gives the node itself', () => {
    const spec = specOf({ [SPEC]: BACKUP_SPEC });
    for (const node of ['text', 5, null, { type: 'string' }, { $ref: 5 }]) {
      expect(spec.follow(node)).toEqual({ kind: 'value', value: node, name: null, target: null });
    }
  });

  test('decodes ~1, ~0 and %-escapes, and gives the last token of the pointer as the name', () => {
    const spec = refsSpec();
    const schemas = valueAt(spec.root, 'components', 'schemas');
    const nodes: [unknown, string][] = [
      [valueAt(spec.root, 'components', 'responses', 'Started', 'content', 'application/json', 'schema'), 'Restore/Job'],
      [valueAt(schemas, 'Restore/Job', 'properties', 'owner'), 'Owner Name'],
      [valueAt(schemas, 'Restore/Job', 'properties', 'legacy'), 'a~b'],
    ];
    for (const [node, name] of nodes) {
      const followed = followedValue(spec.follow(node));
      expect(followed.name, name).toBe(name);
      expect(followed.value, name).toBe(valueAt(schemas, name));
      expect(followed.target, name).toBe(valueAt(schemas, name));
    }
  });

  test('decodes ~1 before ~0, and a bad escape points nowhere', () => {
    const spec = specOf({ [SPEC]: 'openapi: 3.1.0\ninfo: {}\ncomponents:\n  schemas:\n    a~1b: {type: integer}\n    a/b: {type: string}\n' });
    expect(followedValue(spec.follow(madeRef('#/components/schemas/a~01b'))).value).toEqual({ type: 'integer' });
    expect(spec.follow(madeRef('#/components/schemas/a~2b'))).toEqual({
      kind: 'unresolved',
      place: { file: SPEC, line: 1, ref: '#/components/schemas/a~2b' },
    });
  });

  test('to another file gives its root, with the file name as the name', () => {
    const spec = refsSpec();
    const body = followedValue(spec.follow(bodySchema(spec.root)));
    expect(body.name).toBe('restore-request');
    expect(valueAt(body.value, 'required')).toEqual(['file']);
    expect(body.target).toBe(body.value);
  });

  test('counts from the file that holds it, and its other keys win over those of its target', () => {
    const spec = refsSpec();
    const body = followedValue(spec.follow(bodySchema(spec.root))).value;
    const day = followedValue(spec.follow(valueAt(body, 'properties', 'day')));
    expect(day.name).toBe('day');
    expect(plain(day.value)).toEqual({ type: 'string', format: 'date', description: 'The day of the copy.' });

    const target = followedValue(spec.follow(valueAt(body, 'properties', 'target')));
    const job = valueAt(spec.root, 'components', 'schemas', 'Restore/Job');
    expect(target.name).toBe('Restore/Job');
    expect(target.value).toBe(job);
    expect(target.target).toBe(job);
  });

  test('to a missing file, outside the folder or to an address points nowhere, at the place of its ref', () => {
    const spec = refsSpec();
    const body = followedValue(spec.follow(bodySchema(spec.root))).value;
    const cases: [string, number, string][] = [
      ['old', 12, 'gone.yaml'],
      ['far', 14, '../../../outside.yaml'],
      ['web', 16, 'https://example.com/day.yaml'],
    ];
    for (const [key, line, ref] of cases) {
      expect(spec.follow(valueAt(body, 'properties', key)), key).toEqual({ kind: 'unresolved', place: { file: REQUEST, line, ref } });
    }
  });

  test('reads each file once, and the uses list each file that it read, missing ones too', () => {
    const files = refsFiles();
    const opened = openSpec(files, SPEC);
    if (opened.kind !== 'ok') throw new Error('REFS_SPEC does not open.');
    const spec = opened.spec;
    const body = followedValue(spec.follow(bodySchema(spec.root))).value;
    for (const key of ['day', 'target', 'old', 'far', 'web']) spec.follow(valueAt(body, 'properties', key));
    followedValue(spec.follow(bodySchema(spec.root)));

    expect(spec.uses).toEqual([
      used(SPEC, 1730000000001),
      used(REQUEST, 1730000000002),
      used('api/schemas/day.yaml', 1730000000003),
      used('api/schemas/gone.yaml', null),
    ]);
    expect(files.asked.filter((path) => path.includes('outside') || path.includes('example.com') || path.includes('https'))).toEqual([]);
    expect(files.asked.filter((path) => path === REQUEST)).toHaveLength(1);
  });

  test('to a key that is missing, with a bad %-escape or with no / after the # points nowhere', () => {
    const spec = specOf({ [SPEC]: BACKUP_SPEC });
    for (const ref of ['#/components/schemas/Nope', '#/components/schemas/%E0%A4%A', '#components']) {
      expect(spec.follow(madeRef(ref)), ref).toEqual({ kind: 'unresolved', place: { file: SPEC, line: 1, ref } });
    }
  });

  test('points to a key with a / and to an index of a list', () => {
    const spec = specOf({ [SPEC]: BACKUP_SPEC });
    const response = followedValue(spec.follow(madeRef('#/paths/~1restores/post/responses/202')));
    expect(response.value).toBe(valueAt(spec.root, 'paths', '/restores', 'post', 'responses', '202'));
    expect(response.name).toBe('202');
    const tag = followedValue(spec.follow(madeRef('#/tags/1')));
    expect(plain(tag.value)).toEqual({ name: 'Schedules' });
    expect(tag.name).toBe('1');
  });

  test('in a loop points nowhere, at the place of the node that was given', () => {
    const spec = specOf({ [SPEC]: LOOP_SPEC });
    expect(spec.follow(valueAt(spec.root, 'components', 'schemas', 'A'))).toEqual({
      kind: 'unresolved',
      place: { file: SPEC, line: 6, ref: '#/components/schemas/B' },
    });
  });

  test('to a file that does not parse gives the file and the line of its first error', () => {
    const spec = specOf({ [SPEC]: REFS_SPEC, [REQUEST]: RESTORE_REQUEST, 'api/schemas/day.yaml': BAD_DAY });
    const body = followedValue(spec.follow(bodySchema(spec.root))).value;
    expect(spec.follow(valueAt(body, 'properties', 'day'))).toEqual({ kind: 'bad', file: 'api/schemas/day.yaml', line: 2 });
  });
});
