import { WARN_PATH } from '../../page/icons.tsx';
import { slugBase } from '../render.ts';
import { isPlainObject, isRef, type RefPlace, type Spec } from './read.ts';

export interface ApiOptions {
  /** The tag after the `#` of the embed line, decoded, or null for the whole file. */
  tag: string | null;
  /** The rank of the first heading that the reference writes, 1 to 6. */
  rank: number;
  /** The ids that the page has taken. Each anchor takes one that is not in it, and adds it. */
  ids: Set<string>;
}

export type ApiText =
  /** `unresolved` holds the place of each bad slot, in the order that the text shows them. */
  | { kind: 'ok'; markdown: string; unresolved: RefPlace[] }
  | { kind: 'bad'; file: string; line: number }
  /** No operation and no entry of `tags` names the tag of the options. */
  | { kind: 'unknown-tag' };

type Plain = Record<string, unknown>;
/** A request hides the fields that only a response has, and a response those that only a request has. */
type Mode = 'request' | 'response';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
/** The places of parameters in the order that they show, each with its head line and the `in` values it lists. */
const PLACES: [string, string[]][] = [
  ['**Path**', ['path']],
  ['**Query**', ['query', 'querystring']],
  ['**Header**', ['header']],
  ['**Cookie**', ['cookie']],
];
const JSON_TYPE = 'application/json';
const EXAMPLE_KEYS = ['dataValue', 'value', 'serializedValue'];
const ATX_HEADING = /^ {0,3}#{1,6}(?=[ \t]|$)/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

const plainOr = (value: unknown): Plain => (isPlainObject(value) ? value : {});
const stringsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const longestRun = (value: string) => Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));

/** The value with a backslash before each sign that Markdown would read. */
const text = (value: string) => value.replace(/[\\`*_<>&~]/g, '\\$&');

/** A code span of the value. */
function code(value: string): string {
  const fence = '`'.repeat(longestRun(value) + 1);
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${value}${pad}${fence}`;
}

/** The JSON of a value, or null when it has none. */
function json(value: unknown, space?: number): string | null {
  try {
    return JSON.stringify(value, null, space) ?? null;
  } catch {
    return null;
  }
}

/**
 * A line that ends a paragraph or starts a block of another kind: a list item, a quote, an HTML block, a table row, a
 * thematic break, or code by indent. The line after it can go on that block, so no paragraph starts there.
 */
const NOT_PARAGRAPH = /^(?: {4}|\t| {0,3}(?:[-+*](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|[>|<]|(?:[-*_][ \t]*){3,}$))/;
/** The underline of a setext heading. */
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;

/**
 * The Markdown of a description, or null for none: trimmed, with each ATX heading, and each setext heading after a
 * paragraph that a blank line starts, outside a fenced code block, as bold text on a paragraph of its own, so the
 * outline gets no row from it. A fenced code block that the description leaves open closes at its end, so the blocks
 * after the description stay out of it.
 */
function description(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const lines = value.trim().replace(/\r\n/g, '\n');
  if (!lines) return null;
  const out: string[] = [];
  /** A blank line goes before the next line that holds text. */
  let gap = false;
  const add = (line: string) => {
    if (gap && line.trim()) out.push('');
    gap = false;
    out.push(line);
  };
  /** A bold line, set apart by blank lines. */
  const bold = (indent: string, content: string) => {
    if (out.length && out[out.length - 1]!.trim()) out.push('');
    out.push(`${indent}**${content}**`);
    gap = true;
  };
  let fence: string | null = null;
  /** The number of lines of the paragraph that ends the text so far, which an underline makes a heading. */
  let paragraph = 0;
  /** The line that comes next can start a paragraph. */
  let fresh = true;
  for (const line of lines.split('\n')) {
    if (fence !== null) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
      if (close && close[0] === fence[0] && close.length >= fence.length) {
        fence = null;
        fresh = true;
      }
      add(line);
      continue;
    }
    const open = FENCE.exec(line);
    if (open && !(open[1]!.startsWith('`') && line.slice(open[0].length).includes('`'))) {
      fence = open[1]!;
      paragraph = 0;
      add(line);
      continue;
    }
    const heading = ATX_HEADING.exec(line);
    if (heading) {
      const content = line
        .slice(heading[0].length)
        .replace(/(?:^|[ \t]+)#+[ \t]*$/, '')
        .trim();
      if (content) bold(/^ */.exec(line)![0], content);
      else add('');
      paragraph = 0;
      fresh = true;
      continue;
    }
    if (paragraph > 0 && SETEXT.test(line)) {
      const content = out.splice(out.length - paragraph).map((each) => each.trim());
      bold('', content.join('\n'));
      paragraph = 0;
      fresh = true;
      continue;
    }
    if (!line.trim()) {
      paragraph = 0;
      fresh = true;
    } else if (NOT_PARAGRAPH.test(line) && !(paragraph > 0 && /^(?: {4}|\t)/.test(line))) {
      paragraph = 0;
      fresh = false;
    } else if (paragraph > 0 || fresh) {
      paragraph++;
      fresh = false;
    }
    add(line);
  }
  if (fence !== null) add(fence);
  while (out.length && !out[0]!.trim()) out.shift();
  while (out.length && !out[out.length - 1]!.trim()) out.pop();
  return out.length ? out.join('\n') : null;
}

/** Each line of the text after the first indented by `pad`, with an empty line left empty. */
const indented = (value: string, pad: string) =>
  value
    .split('\n')
    .map((line) => (line.trim() ? pad + line : ''))
    .join('\n');

/** The text after a hard line break at the end of a head line, or '' for no description. */
const after = (value: string | null, pad = '') => (value ? `\\\n${indented(value, pad)}` : '');

const entities = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Operation {
  /** The method in capitals. */
  method: string;
  path: string;
  operation: Plain;
  item: Plain;
}

/** The operations of each path in file order, each path item given by `itemOf`. */
function operationsOf(root: Plain, itemOf: (node: unknown) => unknown): Operation[] {
  const found: Operation[] = [];
  for (const [path, node] of Object.entries(plainOr(root.paths))) {
    const item = itemOf(node);
    if (!isPlainObject(item)) continue;
    const add = (method: string, operation: unknown) => {
      if (isPlainObject(operation)) found.push({ method: method.toUpperCase(), path, operation, item });
    };
    for (const method of METHODS) add(method, item[method]);
    for (const [method, operation] of Object.entries(plainOr(item.additionalOperations))) add(method, operation);
  }
  return found;
}

/** The names that `tags` lists, then the other tags that the operations name, in path order. */
function tagNames(root: Plain, operations: readonly Operation[]): string[] {
  const names = new Set<string>();
  for (const entry of Array.isArray(root.tags) ? root.tags : []) {
    if (isPlainObject(entry) && typeof entry.name === 'string') names.add(entry.name);
  }
  for (const { operation } of operations) for (const name of stringsOf(operation.tags)) names.add(name);
  return [...names];
}

const firstTag = ({ operation }: Operation) => {
  const [first] = Array.isArray(operation.tags) ? operation.tags : [];
  return typeof first === 'string' ? first : null;
};

/** A file that a ref names does not parse, which stops the whole reference. */
class BadFile {
  constructor(
    readonly file: string,
    readonly line: number,
  ) {}
}

/** A schema node after its refs and its `allOf`. */
type Schema =
  /** `own` holds the keys beside the ref that points nowhere. */
  | { kind: 'unresolved'; place: RefPlace; own: Plain }
  | {
      kind: 'ok';
      /** The schema with each part of its `allOf` merged in. */
      schema: Plain;
      name: string | null;
      /** The object that names the schema: the target of its last ref, else the schema as written. */
      key: object | null;
      /** The place of the first part of its `allOf` that points nowhere. */
      badPart: RefPlace | null;
    };

type Found = Extract<Schema, { kind: 'ok' }>;

/** The type text of a slot and the list of fields under it, already indented. */
interface Slot {
  text: string;
  lines: string[];
}

/** What a field line shows besides its name and its type. */
interface LineMarks {
  required: boolean;
  deprecated: unknown;
  default: unknown;
  description: unknown;
}

/**
 * The Markdown of the reference. A file that a ref names and that does not parse gives `bad`, and a tag that the file
 * does not name, with each path item after its refs, gives `unknown-tag`.
 */
export function apiMarkdown(spec: Spec, options: ApiOptions): ApiText {
  const { root } = spec;
  const rank = Math.min(6, Math.max(1, Math.trunc(options.rank) || 1));
  const unresolved: RefPlace[] = [];
  const blocks: string[] = [];
  /** The anchor id of each named schema that has shown its fields, by the object that names it. */
  const anchors = new Map<object, string>();

  const push = (block: string | null) => {
    if (block) blocks.push(block);
  };

  function follow(node: unknown) {
    const followed = spec.follow(node);
    if (followed.kind === 'bad') throw new BadFile(followed.file, followed.line);
    return followed;
  }

  /** The value of a node whose ref shows nothing when it points nowhere, which then only notes its place. */
  function quietly(node: unknown): unknown {
    const followed = follow(node);
    if (followed.kind === 'value') return followed.value;
    unresolved.push(followed.place);
    return undefined;
  }

  function badSlot(place: RefPlace): string {
    unresolved.push(place);
    const icon = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${WARN_PATH}"></path></svg>`;
    return `<span class="api-bad">${icon}${code(`Unresolved ref: ${place.ref} ${place.file}:${place.line}`)}</span>`;
  }

  function takeId(name: string): string {
    const base = `schema-${slugBase(name)}`;
    let id = base;
    for (let n = 1; options.ids.has(id); n++) id = `${base}-${n}`;
    options.ids.add(id);
    return id;
  }

  /**
   * The schema with each part of its `allOf`, followed, merged in: the fields and the required names join, and the
   * other keys fill in.
   */
  function merged(schema: Plain, passed: Set<object>): { schema: Plain; badPart: RefPlace | null } {
    if (!Array.isArray(schema.allOf) || passed.has(schema)) return { schema, badPart: null };
    passed.add(schema);
    const { allOf, properties: own, required: ownRequired, ...rest } = schema;
    const out: Plain = { ...rest };
    const properties: Plain = {};
    const required = new Set(stringsOf(ownRequired));
    let badPart: RefPlace | null = null;
    for (const part of allOf as unknown[]) {
      const followed = follow(part);
      if (followed.kind === 'unresolved') {
        badPart ??= followed.place;
        continue;
      }
      if (!isPlainObject(followed.value)) continue;
      const inner = merged(followed.value, passed);
      badPart ??= inner.badPart;
      for (const [key, value] of Object.entries(plainOr(inner.schema.properties))) {
        if (!Object.hasOwn(properties, key)) properties[key] = value;
      }
      for (const name of stringsOf(inner.schema.required)) required.add(name);
      for (const [key, value] of Object.entries(inner.schema)) {
        if (key !== 'properties' && key !== 'required' && out[key] === undefined) out[key] = value;
      }
    }
    Object.assign(properties, plainOr(own));
    passed.delete(schema);
    if (Object.keys(properties).length) out.properties = properties;
    if (required.size) out.required = [...required];
    return { schema: out, badPart };
  }

  function resolve(node: unknown): Schema {
    const followed = follow(node);
    if (followed.kind === 'unresolved') return { kind: 'unresolved', place: followed.place, own: plainOr(node) };
    const value = isPlainObject(followed.value) ? followed.value : {};
    const { schema, badPart } = merged(value, new Set());
    const key = followed.target ?? (isPlainObject(followed.value) ? followed.value : null);
    return { kind: 'ok', schema, name: followed.name, key, badPart };
  }

  function typeName(schema: Plain): string {
    if (typeof schema.type === 'string') return schema.type;
    const names = stringsOf(schema.type);
    if (names.length) return names.join(' | ');
    if (isPlainObject(schema.properties)) return 'object';
    if (schema.items !== undefined) return 'array';
    if (Array.isArray(schema.oneOf)) return 'one of';
    if (Array.isArray(schema.anyOf)) return 'any of';
    return 'any';
  }

  const isArray = (schema: Plain) => typeName(schema) === 'array';

  function hasFields(schema: Plain, passed = new Set<object>()): boolean {
    if (Object.keys(plainOr(schema.properties)).length) return true;
    if ((Array.isArray(schema.oneOf) && schema.oneOf.length) || (Array.isArray(schema.anyOf) && schema.anyOf.length)) {
      return true;
    }
    if (!isArray(schema) || passed.has(schema)) return false;
    const items = resolve(schema.items);
    passed.add(schema);
    return items.kind === 'ok' && hasFields(items.schema, passed);
  }

  /** The type text of a schema, with the signs of its words escaped. Markdown reads none of the signs of its bounds. */
  function typeWords(schema: Plain, passed: Set<object>): string {
    let words: string;
    if (schema.const !== undefined) words = text(json(schema.const) ?? 'any');
    else if (Array.isArray(schema.enum)) words = schema.enum.map((value) => text(json(value) ?? '')).join(' | ');
    else {
      words = text(typeName(schema));
      if (typeName(schema) === 'array') {
        const items = passed.has(schema) ? null : resolve(schema.items);
        passed.add(schema);
        const item = items?.kind === 'ok' ? typeWords(items.schema, passed) : 'any';
        words = item.includes(' | ') ? `(${item})[]` : `${item}[]`;
      }
    }
    if (schema.nullable === true) words += ' | null';
    if (typeof schema.format === 'string') words += ` (${text(schema.format)})`;
    const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = schema;
    if (typeof minimum === 'number') words += `${exclusiveMinimum === true ? ' >' : ' ≥'} ${minimum}`;
    if (typeof exclusiveMinimum === 'number') words += ` > ${exclusiveMinimum}`;
    if (typeof maximum === 'number') words += `${exclusiveMaximum === true ? ' <' : ' ≤'} ${maximum}`;
    if (typeof exclusiveMaximum === 'number') words += ` < ${exclusiveMaximum}`;
    return words;
  }

  const typeText = (schema: Plain) => `*${typeWords(schema, new Set())}*`;

  /**
   * The slot of a schema and the list of its fields at `depth`. A named schema shows its fields once, at an anchor,
   * and links to it after that. `passed` holds the schemas whose lists hold this one, so a schema that holds itself
   * stops its list where it comes back. `skip` names a field that the list leaves out.
   */
  function typeSlot(found: Schema, depth: number, mode: Mode, passed: Set<object>, skip: string | null = null): Slot {
    if (found.kind === 'unresolved') return { text: badSlot(found.place), lines: [] };
    const { schema, name, key, badPart } = found;
    const list = (of: Plain, key: object | null) => {
      if (key && passed.has(key)) return [];
      const inner = key ? new Set(passed).add(key) : passed;
      return fieldLines(of, depth, mode, inner, skip);
    };
    if (badPart) return { text: badSlot(badPart), lines: list(schema, key) };
    const items = isArray(schema) ? resolve(schema.items) : null;
    if (items?.kind === 'unresolved') return { text: badSlot(items.place), lines: [] };
    let named: { name: string; key: object | null; suffix: string; fields: Plain } | null = null;
    if (name !== null && hasFields(schema)) named = { name, key, suffix: '', fields: schema };
    else if (name === null && items?.kind === 'ok' && items.name !== null && hasFields(items.schema)) {
      named = { name: items.name, key: items.key, suffix: '[]', fields: items.schema };
    }
    if (named) {
      const label = `${text(named.name)}${named.suffix}`;
      const seen = named.key ? anchors.get(named.key) : undefined;
      if (seen) return { text: `[*${label}*](#${seen})`, lines: [] };
      const id = takeId(named.name);
      if (named.key) anchors.set(named.key, id);
      return { text: `<em id="${id}">${label}</em>`, lines: list(named.fields, named.key) };
    }
    return { text: typeText(schema), lines: hasFields(schema) ? list(schema, key) : [] };
  }

  /** One field line and the list of fields under its type. */
  function fieldLine(name: string, found: Schema, marks: LineMarks, depth: number, mode: Mode, passed: Set<object>) {
    const pad = '  '.repeat(depth);
    const slot = typeSlot(found, depth + 1, mode, passed);
    let line = `${pad}- ${code(name)} ${slot.text}`;
    if (marks.required) line += ' **required**';
    if (marks.deprecated === true) line += ' deprecated';
    const fallback = marks.default === undefined ? null : json(marks.default);
    if (fallback !== null) line += ` = ${code(fallback)}`;
    line += after(description(marks.description), `${pad}  `);
    return [line, ...slot.lines];
  }

  /** What a line shows besides its type: from the schema after its refs, or the keys beside a ref that points nowhere. */
  const marksOf = (found: Schema, required: boolean): LineMarks => {
    const from = found.kind === 'ok' ? found.schema : found.own;
    return { required, deprecated: from.deprecated, default: from.default, description: from.description };
  };

  /** The lines of the fields of a schema at `depth`: the items of an array, its properties, then its variants. */
  function fieldLines(schema: Plain, depth: number, mode: Mode, passed: Set<object>, skip: string | null): string[] {
    const pad = '  '.repeat(depth);
    if (isArray(schema) && !isPlainObject(schema.properties)) {
      const items = resolve(schema.items);
      if (items.kind !== 'ok' || (items.key && passed.has(items.key))) return [];
      const inner = items.key ? new Set(passed).add(items.key) : passed;
      return fieldLines(items.schema, depth, mode, inner, skip);
    }
    const lines: string[] = [];
    const required = new Set(stringsOf(schema.required));
    for (const [key, node] of Object.entries(plainOr(schema.properties))) {
      if (key === skip) continue;
      const found = resolve(node);
      if (found.kind === 'ok' && found.schema[mode === 'request' ? 'readOnly' : 'writeOnly'] === true) continue;
      lines.push(...fieldLine(key, found, marksOf(found, required.has(key)), depth, mode, passed));
    }
    const discriminator = plainOr(schema.discriminator);
    const property = typeof discriminator.propertyName === 'string' ? discriminator.propertyName : null;
    for (const variants of [schema.oneOf, schema.anyOf]) {
      if (!Array.isArray(variants)) continue;
      for (const variant of variants) {
        const found = resolve(variant);
        if (found.kind === 'unresolved') {
          lines.push(`${pad}- ${badSlot(found.place)}`);
          continue;
        }
        const slot =
          found.name !== null && !hasFields(found.schema)
            ? { text: `*${text(found.name)}*`, lines: [] }
            : typeSlot(found, depth + 1, mode, passed, property);
        const value = property === null ? undefined : variantValue(variant, found, discriminator, property);
        const when = value === undefined ? '' : ` · ${code(property!)} = ${text(json(value) ?? '')}`;
        lines.push(`${pad}- ${slot.text}${when}`, ...slot.lines);
      }
    }
    return lines;
  }

  /** The value of the discriminator for a variant: its key in `mapping`, else the `const` of its property, else its name. */
  function variantValue(variant: unknown, found: Found, discriminator: Plain, property: string): unknown {
    const ref = isRef(variant) ? variant.$ref : null;
    for (const [value, target] of Object.entries(plainOr(discriminator.mapping))) {
      if (target === ref || (found.name !== null && target === found.name)) return value;
    }
    const own = resolve(plainOr(found.schema.properties)[property]);
    if (own.kind === 'ok' && own.schema.const !== undefined) return own.schema.const;
    return found.name ?? undefined;
  }

  /** The auth text of each scheme name, so a scheme whose ref points nowhere notes its place once. */
  const labels = new Map<string, string>();
  function schemeLabel(name: string): string {
    const known = labels.get(name);
    if (known !== undefined) return known;
    const schemes = plainOr(plainOr(root.components).securitySchemes);
    const scheme = Object.hasOwn(schemes, name) ? quietly(schemes[name]) : undefined;
    let label = code(name);
    if (isPlainObject(scheme)) {
      if (scheme.type === 'http' && typeof scheme.scheme === 'string') label = text(scheme.scheme);
      else if (scheme.type === 'apiKey') {
        label = `${code(String(scheme.name ?? name))} ${text(String(scheme.in ?? ''))}`.trim();
      } else if (typeof scheme.type === 'string') label = text(scheme.type);
    }
    labels.set(name, label);
    return label;
  }

  function authText(security: unknown[]): string {
    if (!security.length) return 'none';
    return security
      .map((requirement) => {
        const entries = Object.entries(plainOr(requirement));
        if (!entries.length) return 'none';
        return entries
          .map(([name, scopes]) => {
            const listed = stringsOf(scopes);
            return schemeLabel(name) + (listed.length ? ` (${listed.map(text).join(', ')})` : '');
          })
          .join(' and ');
      })
      .join(' or ');
  }

  let rootAuth: string | null = null;
  const authOfRoot = () => (rootAuth ??= Array.isArray(root.security) ? authText(root.security) : 'none');

  /** The examples of a media type, each as a fenced block, with a paragraph of its name when there are two or more. */
  function exampleBlocks(media: string, mediaType: Plain): string[] {
    const found: { label: string; value: unknown }[] = [];
    if (mediaType.example !== undefined) found.push({ label: '', value: mediaType.example });
    else {
      for (const [key, node] of Object.entries(plainOr(mediaType.examples))) {
        const entry = plainOr(quietly(node));
        const field = EXAMPLE_KEYS.find((name) => entry[name] !== undefined);
        if (!field) continue;
        const summary = typeof entry.summary === 'string' ? entry.summary.replace(/\s+/g, ' ').trim() : '';
        found.push({ label: summary || key, value: entry[field] });
      }
    }
    const isJson = media.toLowerCase().includes('json');
    const shown = found.flatMap(({ label, value }) => {
      let body: string | null;
      let language = '';
      if (typeof value === 'string' && !isJson) body = value.replace(/\r\n/g, '\n').replace(/\n$/, '');
      else {
        body = json(value, 2);
        language = 'json';
      }
      if (body === null) return [];
      const fence = '`'.repeat(Math.max(3, longestRun(body) + 1));
      return [{ label, block: `${fence}${language}\n${body}\n${fence}` }];
    });
    return shown.flatMap(({ label, block }) => (shown.length >= 2 ? [text(label), block] : [block]));
  }

  /** The head line of each media type, with its fields and its examples. The description joins the first head line. */
  function contentBlocks(head: string, content: Plain, tail: string, about: string | null, mode: Mode): void {
    Object.entries(content).forEach(([media, node], at) => {
      const mediaType = plainOr(node);
      const slot = typeSlot(resolve(mediaType.schema), 0, mode, new Set());
      const type = media === JSON_TYPE ? '' : ` ${code(media)}`;
      blocks.push(`${head} ${slot.text}${type}${tail}${at === 0 ? after(about) : ''}`);
      push(slot.lines.join('\n'));
      blocks.push(...exampleBlocks(media, mediaType));
    });
  }

  function parameterBlocks({ operation, item }: Operation): void {
    const listed: { found: ReturnType<typeof follow>; parameter: Plain | null; ofPath: boolean }[] = [];
    const sameAs = (a: Plain, b: Plain) => a.name === b.name && a.in === b.in;
    for (const [list, ofPath] of [
      [item.parameters, true],
      [operation.parameters, false],
    ] as const) {
      for (const node of Array.isArray(list) ? list : []) {
        const found = follow(node);
        const parameter = found.kind === 'value' && isPlainObject(found.value) ? found.value : null;
        if (found.kind === 'value' && !parameter) continue;
        const entry = { found, parameter, ofPath };
        const same =
          ofPath || !parameter
            ? -1
            : listed.findIndex((seen) => seen.ofPath && seen.parameter && sameAs(seen.parameter, parameter));
        if (same >= 0) listed[same] = entry;
        else listed.push(entry);
      }
    }
    for (const [head, places] of PLACES) {
      const lines: string[] = [];
      for (const { parameter } of listed) {
        if (!parameter || !places.includes(parameter.in as string)) continue;
        const content = Object.values(plainOr(parameter.content))[0];
        const found = resolve(parameter.schema !== undefined ? parameter.schema : plainOr(content).schema);
        const marks: LineMarks = {
          required: parameter.required === true,
          deprecated: parameter.deprecated,
          default: found.kind === 'ok' ? found.schema.default : undefined,
          description: parameter.description,
        };
        lines.push(...fieldLine(String(parameter.name ?? ''), found, marks, 0, 'request', new Set()));
      }
      if (lines.length) blocks.push(head, lines.join('\n'));
    }
    // A list with `*` items starts a list of its own, where `-` items would join the list of the last group.
    const bad = listed.flatMap(({ found }) => (found.kind === 'unresolved' ? [`* ${badSlot(found.place)}`] : []));
    push(bad.join('\n'));
  }

  function writeOperation(entry: Operation, at: number): void {
    const { operation } = entry;
    blocks.push(`${'#'.repeat(at)} ${code(`${entry.method} ${entry.path}`)}`);
    const summary = typeof operation.summary === 'string' ? operation.summary.replace(/\s+/g, ' ').trim() : '';
    if (summary) blocks.push(`<p class="api-sum">${entities(summary)}</p>`);
    push(description(operation.description));
    if (Array.isArray(operation.security)) {
      const auth = authText(operation.security);
      if (auth !== authOfRoot()) blocks.push(`**Auth** ${auth}`);
    }
    parameterBlocks(entry);
    if (operation.requestBody !== undefined) {
      const body = plainOr(quietly(operation.requestBody));
      const tail = body.required === true ? ' **required**' : '';
      contentBlocks('**Body**', plainOr(body.content), tail, description(body.description), 'request');
    }
    const responses = Object.entries(plainOr(operation.responses));
    if (!responses.length) return;
    blocks.push('**Responses**');
    for (const [status, node] of responses) {
      const head = `**${code(status)}**`;
      const found = follow(node);
      if (found.kind === 'unresolved') {
        blocks.push(`${head} ${badSlot(found.place)}${after(description(plainOr(node).description))}`);
        continue;
      }
      const response = plainOr(found.value);
      const about = description(response.description);
      const content = plainOr(response.content);
      if (Object.keys(content).length) contentBlocks(head, content, '', about, 'response');
      else blocks.push(`${head}${after(about)}`);
    }
  }

  try {
    const tags = Array.isArray(root.tags) ? root.tags.filter(isPlainObject) : [];
    const tagAbout = (name: string) => description(tags.find((entry) => entry.name === name)?.description);
    push(options.tag === null ? description(plainOr(root.info).description) : tagAbout(options.tag));
    const [server] = Array.isArray(root.servers) ? root.servers : [];
    if (isPlainObject(server) && typeof server.url === 'string') blocks.push(`**Server** ${code(server.url)}`);
    if (Array.isArray(root.security) && root.security.length) blocks.push(`**Auth** ${authOfRoot()}`);

    const operations = operationsOf(root, quietly);
    const { tag } = options;
    if (tag !== null && !tagNames(root, operations).includes(tag)) return { kind: 'unknown-tag' };
    if (tag !== null) {
      for (const entry of operations) if (stringsOf(entry.operation.tags).includes(tag)) writeOperation(entry, rank);
    } else {
      const firsts = new Set(operations.map(firstTag).filter((name) => name !== null));
      if (firsts.size >= 2) {
        for (const entry of operations) if (firstTag(entry) === null) writeOperation(entry, rank);
        for (const name of tagNames(root, operations)) {
          if (!firsts.has(name)) continue;
          blocks.push(`${'#'.repeat(rank)} ${text(name)}`);
          push(tagAbout(name));
          for (const entry of operations) if (firstTag(entry) === name) writeOperation(entry, Math.min(6, rank + 1));
        }
      } else {
        for (const entry of operations) writeOperation(entry, rank);
      }
    }
  } catch (error) {
    if (error instanceof BadFile) return { kind: 'bad', file: error.file, line: error.line };
    throw error;
  }
  return { kind: 'ok', markdown: `${blocks.join('\n\n')}\n`, unresolved };
}
