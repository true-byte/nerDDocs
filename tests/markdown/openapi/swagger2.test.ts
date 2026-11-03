import { expect, test } from '@playwright/test';
import { parseSpecText } from '../../../src/markdown/openapi/read.ts';
import { fromSwagger2 } from '../../../src/markdown/openapi/swagger2.ts';
import { BACKUP_SWAGGER, placeOf, valueAt } from '../../support/openapi.ts';

/** The root of `BACKUP_SWAGGER` as the parse gives it, with the place of each `$ref`. */
function swaggerRoot(): Record<string, unknown> {
  const parsed = parseSpecText('api/swagger.yaml', BACKUP_SWAGGER);
  if (parsed.kind !== 'ok') throw new Error('BACKUP_SWAGGER does not parse.');
  return parsed.value as Record<string, unknown>;
}

/** A 2.0 root with these paths and other keys. */
const rootWith = (paths: Record<string, unknown>, more: Record<string, unknown> = {}) => ({ swagger: '2.0', info: {}, ...more, paths });

/** The parameters of an operation after the map, by name. */
const parameterNamed = (operation: unknown, name: string) =>
  (valueAt(operation, 'parameters') as unknown[]).find((parameter) => valueAt(parameter, 'name') === name);

test('the host, the scheme and the base path give the server', () => {
  expect(fromSwagger2(swaggerRoot()).servers).toEqual([{ url: 'https://backup.example.com/api/v1' }]);
  expect(fromSwagger2(rootWith({}, { host: 'backup.example.com' })).servers).toEqual([{ url: 'https://backup.example.com' }]);
  expect(fromSwagger2(rootWith({}, { host: 'backup.example.com', schemes: ['http'] })).servers).toEqual([{ url: 'http://backup.example.com' }]);
  expect(fromSwagger2(rootWith({}, { basePath: '/api/v1' })).servers).toEqual([{ url: '/api/v1' }]);
  expect(fromSwagger2(rootWith({})).servers).toBeUndefined();
});

test('the definitions are the schemas themselves', () => {
  const root = swaggerRoot();
  expect(valueAt(fromSwagger2(root), 'components', 'schemas')).toBe(root.definitions);
});

test('a body parameter gives the request body, and its ref names the schemas and keeps its place', () => {
  const post = valueAt(fromSwagger2(swaggerRoot()), 'paths', '/restores', 'post');
  expect(valueAt(post, 'requestBody')).toEqual({ required: true, content: { 'application/json': { schema: expect.anything() } } });
  const schema = valueAt(post, 'requestBody', 'content', 'application/json', 'schema');
  expect(valueAt(schema, '$ref')).toBe('#/components/schemas/RestoreRequest');
  expect(placeOf(schema)).toEqual({ file: 'api/swagger.yaml', line: 28, ref: '#/definitions/RestoreRequest' });
});

test('the request types come from the operation, else from the root, else are JSON', () => {
  const body = { name: 'body', in: 'body', schema: { type: 'object' } };
  const content = (root: Record<string, unknown>) => Object.keys(valueAt(fromSwagger2(root), 'paths', '/restores', 'post', 'requestBody', 'content') as object);
  expect(content(rootWith({ '/restores': { post: { parameters: [body], responses: {} } } }, { consumes: ['application/xml'] }))).toEqual(['application/xml']);
  expect(content(rootWith({ '/restores': { post: { parameters: [body], responses: {} } } }))).toEqual(['application/json']);
  expect(
    content(rootWith({ '/restores': { post: { consumes: ['text/csv'], parameters: [body], responses: {} } } }, { consumes: ['application/xml'] })),
  ).toEqual(['text/csv']);
});

test('form parameters give one body of their fields, as a form or as multipart', () => {
  const form = (consumes?: string[]) =>
    rootWith({
      '/restores': {
        post: {
          ...(consumes ? { consumes } : {}),
          parameters: [
            { name: 'file', in: 'formData', type: 'file', required: true },
            { name: 'note', in: 'formData', type: 'string' },
          ],
          responses: {},
        },
      },
    });
  const schema = { type: 'object', properties: { file: { type: 'string', format: 'binary' }, note: { type: 'string' } }, required: ['file'] };
  const content = (root: Record<string, unknown>) => valueAt(fromSwagger2(root), 'paths', '/restores', 'post', 'requestBody', 'content');
  expect(content(form())).toEqual({ 'application/x-www-form-urlencoded': { schema } });
  expect(content(form(['multipart/form-data']))).toEqual({ 'multipart/form-data': { schema } });
});

test('any other parameter gets a schema from its type and its limits', () => {
  const get = valueAt(fromSwagger2(swaggerRoot()), 'paths', '/restores/{id}', 'get');
  expect(parameterNamed(get, 'wait')).toEqual({
    name: 'wait',
    in: 'query',
    description: 'Seconds to wait for a change.',
    schema: { type: 'integer', minimum: 0, default: 0 },
  });
});

test('a ref to a parameter names the parameters of the components, and a body parameter there gives the request body', () => {
  const out = fromSwagger2(swaggerRoot());
  const first = (valueAt(out, 'paths', '/restores/{id}', 'get', 'parameters') as unknown[])[0];
  expect(valueAt(first, '$ref')).toBe('#/components/parameters/RestoreId');
  expect(valueAt(out, 'components', 'parameters', 'RestoreId')).toEqual({
    name: 'id',
    in: 'path',
    required: true,
    description: 'The id that `POST /restores` returned.',
    schema: { type: 'string' },
  });

  const withBody = rootWith(
    { '/restores': { post: { parameters: [{ $ref: '#/parameters/Body' }], responses: {} } } },
    { parameters: { Body: { name: 'body', in: 'body', required: true, schema: { type: 'object' } } } },
  );
  expect(valueAt(fromSwagger2(withBody), 'paths', '/restores', 'post', 'requestBody')).toEqual({
    required: true,
    content: { 'application/json': { schema: { type: 'object' } } },
  });
});

test('the parameters of a path join each operation, and an operation one of the same name and place replaces it in its place', () => {
  const out = fromSwagger2(
    rootWith({
      '/restores/{id}': {
        parameters: [
          { name: 'id', in: 'path', required: true, type: 'string' },
          { name: 'X-Trace', in: 'header', type: 'string' },
        ],
        get: { responses: {} },
        delete: {
          parameters: [
            { name: 'force', in: 'query', type: 'boolean' },
            { name: 'id', in: 'path', required: true, type: 'string', description: 'The id of the job.' },
          ],
          responses: {},
        },
      },
    }),
  );
  expect(valueAt(out, 'paths', '/restores/{id}', 'get', 'parameters')).toEqual([
    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
  ]);
  expect(valueAt(out, 'paths', '/restores/{id}', 'delete', 'parameters')).toEqual([
    { name: 'id', in: 'path', required: true, description: 'The id of the job.', schema: { type: 'string' } },
    { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
    { name: 'force', in: 'query', schema: { type: 'boolean' } },
  ]);
});

test('a response gets content of its schema and its example, and a ref to a response names the responses of the components', () => {
  const out = fromSwagger2(swaggerRoot());
  const started = valueAt(out, 'paths', '/restores', 'post', 'responses', '202');
  expect(valueAt(started, 'description')).toBe('The restore job started.');
  expect(Object.keys(valueAt(started, 'content') as object)).toEqual(['application/json']);
  const media = valueAt(started, 'content', 'application/json');
  expect(valueAt(media, 'schema', '$ref')).toBe('#/components/schemas/Restore');
  expect(valueAt(media, 'example')).toEqual({ id: 'r-1', state: 'queued' });

  const state = valueAt(out, 'paths', '/restores/{id}', 'get', 'responses', '200', 'content', 'application/json');
  expect(Object.hasOwn(state as object, 'example')).toBe(false);

  expect(valueAt(out, 'paths', '/restores/{id}', 'get', 'responses', '404', '$ref')).toBe('#/components/responses/NotFound');
  expect(valueAt(out, 'components', 'responses', 'NotFound')).toEqual({ description: 'No restore with that id.' });
});

test('the security definitions give the security schemes', () => {
  const scopes = { 'restores:read': 'Read the restores.' };
  const out = fromSwagger2(
    rootWith(
      {},
      {
        securityDefinitions: {
          basic: { type: 'basic' },
          token: { type: 'apiKey', name: 'X-Token', in: 'header' },
          login: { type: 'oauth2', flow: 'implicit', authorizationUrl: 'https://backup.example.com/login', scopes },
        },
      },
    ),
  );
  expect(valueAt(out, 'components', 'securitySchemes')).toEqual({
    basic: { type: 'http', scheme: 'basic' },
    token: { type: 'apiKey', name: 'X-Token', in: 'header' },
    login: { type: 'oauth2', scopes },
  });
});

test('the input stays as it was', () => {
  const parsed = swaggerRoot();
  // The parse notes the place of each ref under a symbol, which a clone leaves out, so the clone compares with a copy.
  const input = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
  const before = structuredClone(input);
  fromSwagger2(input);
  expect(input).toEqual(before);

  fromSwagger2(parsed);
  expect(valueAt(parsed, 'paths', '/restores', 'post', 'parameters', 0, 'schema', '$ref')).toBe('#/definitions/RestoreRequest');
  expect(valueAt(parsed, 'paths', '/restores/{id}', 'get', 'responses', '404', '$ref')).toBe('#/responses/NotFound');
  expect(valueAt(parsed, 'paths', '/restores/{id}', 'get', 'parameters', 0, '$ref')).toBe('#/parameters/RestoreId');
});
