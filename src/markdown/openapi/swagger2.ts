import { isPlainObject, isRef } from './read.ts';

type Plain = Record<string, unknown>;

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];
/** The ref prefixes of 2.0, with the prefix of OpenAPI 3 that takes their place. */
const PREFIXES: [string, string][] = [
  ['#/definitions/', '#/components/schemas/'],
  ['#/parameters/', '#/components/parameters/'],
  ['#/responses/', '#/components/responses/'],
];
/** The keys of a 2.0 parameter that its schema takes. */
const SCHEMA_KEYS = [
  'type',
  'format',
  'items',
  'enum',
  'default',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'pattern',
];
const PARAMETER_KEYS = ['name', 'in', 'description', 'required', 'deprecated'];
const JSON_TYPE = 'application/json';

const plainOr = (value: unknown): Plain => (isPlainObject(value) ? value : {});
const stringsOf = (value: unknown): string[] | null =>
  Array.isArray(value) && value.length && value.every((item) => typeof item === 'string') ? value : null;
const picked = (from: Plain, keys: readonly string[]): Plain =>
  Object.fromEntries(keys.filter((key) => from[key] !== undefined).map((key) => [key, from[key]]));

function newRef(ref: string): string {
  for (const [from, to] of PREFIXES) if (ref.startsWith(from)) return to + ref.slice(from.length);
  return ref;
}

/**
 * A copy of a part of the root in which each 2.0 ref has the prefix of OpenAPI 3. A copy of a ref object keeps its
 * place, so a problem line shows the ref as written. An object met twice, through an alias, gives one copy.
 */
function withNewRefs(node: unknown, copies = new Map<object, unknown>()): unknown {
  if (typeof node !== 'object' || node === null) return node;
  const known = copies.get(node);
  if (known) return known;
  if (Array.isArray(node)) {
    const copy: unknown[] = [];
    copies.set(node, copy);
    for (const item of node) copy.push(withNewRefs(item, copies));
    return copy;
  }
  if (!isPlainObject(node)) return node;
  const copy: Plain = { ...node };
  copies.set(node, copy);
  for (const key of Object.keys(copy)) copy[key] = withNewRefs(copy[key], copies);
  if (typeof copy.$ref === 'string') copy.$ref = newRef(copy.$ref);
  return copy;
}

/** The schema of a parameter that is not in the body: its type keys, with a file as binary text. */
function parameterSchema(parameter: Plain): Plain {
  if (parameter.type === 'file') return { type: 'string', format: 'binary' };
  return picked(parameter, SCHEMA_KEYS);
}

/** A 2.0 parameter outside the body and the form, in the shape of OpenAPI 3. */
function mapParameter(parameter: Plain): Plain {
  return { ...picked(parameter, PARAMETER_KEYS), schema: parameterSchema(parameter) };
}

/** A 2.0 response in the shape of OpenAPI 3: its schema under each response type, with the example of that type. */
function mapResponse(response: unknown, types: readonly string[]): unknown {
  if (!isPlainObject(response) || isRef(response)) return response;
  const out: Plain = response.description === undefined ? {} : { description: response.description };
  if (response.schema === undefined) return out;
  const examples = plainOr(response.examples);
  out.content = Object.fromEntries(
    types.map((type) => [
      type,
      examples[type] === undefined ? { schema: response.schema } : { schema: response.schema, example: examples[type] },
    ]),
  );
  return out;
}

function mapResponses(responses: unknown, types: readonly string[]): unknown {
  if (!isPlainObject(responses)) return responses;
  return Object.fromEntries(Object.entries(responses).map(([code, response]) => [code, mapResponse(response, types)]));
}

/** The name and the place of a parameter, which an operation parameter of the same two replaces. */
const identity = (parameter: Plain) => JSON.stringify([parameter.name, parameter.in]);

/** A 2.0 security scheme in the shape of OpenAPI 3. */
function mapScheme(scheme: unknown): unknown {
  if (!isPlainObject(scheme)) return scheme;
  if (scheme.type === 'basic') return { type: 'http', scheme: 'basic' };
  if (scheme.type === 'apiKey') return { type: 'apiKey', ...picked(scheme, ['name', 'in']) };
  if (scheme.type === 'oauth2') return { type: 'oauth2', ...picked(scheme, ['scopes']) };
  return picked(scheme, ['type']);
}

/** A Swagger 2.0 root in the shape of OpenAPI 3.0. The input stays as it was. */
export function fromSwagger2(root: Record<string, unknown>): Record<string, unknown> {
  const copies = new Map<object, unknown>();
  const copy = (node: unknown) => withNewRefs(node, copies);
  const shared = plainOr(root.parameters);
  const requestTypes = (operation: Plain) => stringsOf(operation.consumes) ?? stringsOf(root.consumes) ?? [JSON_TYPE];
  const responseTypes = (operation: Plain) => stringsOf(operation.produces) ?? stringsOf(root.produces) ?? [JSON_TYPE];

  /** The parameter itself, or the one that a ref to `#/parameters/<name>` names in the root, or null. */
  function lookUp(parameter: unknown): Plain | null {
    if (!isRef(parameter)) return isPlainObject(parameter) ? (copy(parameter) as Plain) : null;
    if (!parameter.$ref.startsWith('#/parameters/')) return null;
    const name = parameter.$ref.slice('#/parameters/'.length).replace(/~1/g, '/').replace(/~0/g, '~');
    const found = shared[name];
    return isPlainObject(found) && !isRef(found) ? (copy(found) as Plain) : null;
  }

  function mapOperation(operation: Plain, pathParameters: unknown): Plain {
    const out: Plain = {};
    for (const key of Object.keys(operation)) {
      if (key !== 'parameters' && key !== 'consumes' && key !== 'produces' && key !== 'responses') {
        out[key] = copy(operation[key]);
      }
    }
    // The parameters of the path, then those of the operation. One of the operation takes the place of one of the path
    // with the same name and place.
    const listed: { parameter: unknown; seen: Plain | null; ofPath: boolean }[] = [];
    for (const [list, ofPath] of [[pathParameters, true], [operation.parameters, false]] as const) {
      if (!Array.isArray(list)) continue;
      for (const parameter of list) {
        const seen = lookUp(parameter);
        const same =
          ofPath || !seen
            ? -1
            : listed.findIndex((entry) => entry.ofPath && entry.seen && identity(entry.seen) === identity(seen));
        if (same >= 0) listed[same] = { parameter, seen, ofPath: false };
        else listed.push({ parameter, seen, ofPath });
      }
    }

    const types = requestTypes(operation);
    const parameters: unknown[] = [];
    const form: Plain[] = [];
    let body: Plain | null = null;
    for (const { parameter, seen } of listed) {
      if (seen?.in === 'body') body ??= seen;
      else if (seen?.in === 'formData') form.push(seen);
      else if (seen && !isRef(parameter)) parameters.push(mapParameter(seen));
      else parameters.push(copy(parameter));
    }
    if (parameters.length) out.parameters = parameters;
    if (body) {
      out.requestBody = {
        ...picked(body, ['description', 'required']),
        content: Object.fromEntries(types.map((type) => [type, { schema: body.schema }])),
      };
    } else if (form.length) {
      const type = types.includes('multipart/form-data') ? 'multipart/form-data' : 'application/x-www-form-urlencoded';
      const schema = {
        type: 'object',
        properties: Object.fromEntries(
          form.map((field) => [String(field.name), { ...parameterSchema(field), ...picked(field, ['description']) }]),
        ),
        required: form.filter((field) => field.required === true).map((field) => String(field.name)),
      };
      out.requestBody = { content: { [type]: { schema } } };
    }
    if (operation.responses !== undefined) {
      out.responses = mapResponses(copy(operation.responses), responseTypes(operation));
    }
    return out;
  }

  const out: Plain = {};
  for (const key of Object.keys(root)) {
    if (key === 'info' || key === 'tags' || key === 'security' || key === 'externalDocs' || key.startsWith('x-')) {
      out[key] = root[key];
    }
  }
  const schemes = stringsOf(root.schemes);
  const basePath = typeof root.basePath === 'string' ? root.basePath : '';
  if (typeof root.host === 'string') out.servers = [{ url: `${schemes?.[0] ?? 'https'}://${root.host}${basePath}` }];
  else if (basePath) out.servers = [{ url: basePath }];

  if (isPlainObject(root.paths)) {
    const paths: Plain = {};
    for (const [path, item] of Object.entries(root.paths)) {
      if (!isPlainObject(item) || isRef(item)) {
        paths[path] = copy(item);
        continue;
      }
      const mapped: Plain = {};
      for (const key of Object.keys(item)) {
        if (key === 'parameters') continue;
        const value = item[key];
        const operation = METHODS.includes(key) && isPlainObject(value);
        mapped[key] = operation ? mapOperation(value, item.parameters) : copy(value);
      }
      paths[path] = mapped;
    }
    out.paths = paths;
  } else if (root.paths !== undefined) out.paths = root.paths;

  const components: Plain = {};
  if (root.definitions !== undefined) components.schemas = root.definitions;
  if (isPlainObject(root.parameters)) {
    components.parameters = Object.fromEntries(
      Object.entries(root.parameters).map(([name, parameter]) => [
        name,
        isPlainObject(parameter) && !isRef(parameter) && parameter.in !== 'body' && parameter.in !== 'formData'
          ? mapParameter(copy(parameter) as Plain)
          : copy(parameter),
      ]),
    );
  }
  if (isPlainObject(root.responses)) {
    components.responses = mapResponses(copy(root.responses), stringsOf(root.produces) ?? [JSON_TYPE]);
  }
  if (isPlainObject(root.securityDefinitions)) {
    components.securitySchemes = Object.fromEntries(
      Object.entries(root.securityDefinitions).map(([name, scheme]) => [name, mapScheme(scheme)]),
    );
  }
  if (Object.keys(components).length) out.components = components;
  // The refs inside the definitions keep their 2.0 prefix, so the root keeps the definitions where those point.
  if (root.definitions !== undefined) out.definitions = root.definitions;
  return out;
}
