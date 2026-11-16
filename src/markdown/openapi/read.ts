import { isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';
import { resolveTarget, type PageFiles, type UsedFile } from '../embed.ts';
import { fromSwagger2 } from './swagger2.ts';

export type SpecVersion = '2.0' | '3.0' | '3.1' | '3.2';

/** Where a `$ref` sits: the file in the docs folder, the 1-based line of its `$ref` key, and the ref as written. */
export interface RefPlace {
  file: string;
  line: number;
  ref: string;
}

/** Each object of a parsed file that holds a string `$ref` keeps its place under this key, an enumerable own symbol. */
export const REF_PLACE = Symbol('ref place');

/** A parsed file. `lines` gives the line of each key of the root map. */
export type ParsedFile = { kind: 'ok'; value: unknown; lines: Record<string, number> } | { kind: 'bad'; line: number };

/** What a node gives after its `$ref`s. */
export type Followed =
  /** `target` is the object that the last ref points to, or null for a node with no `$ref`. */
  | { kind: 'value'; value: unknown; name: string | null; target: object | null }
  | { kind: 'unresolved'; place: RefPlace }
  /** A file that a ref names does not parse. */
  | { kind: 'bad'; file: string; line: number };

export interface Spec {
  /** The path of the OpenAPI file in the docs folder. */
  file: string;
  version: SpecVersion;
  /** The root in the shape of OpenAPI 3: a 2.0 root after `fromSwagger2`. */
  root: Record<string, unknown>;
  /** The OpenAPI file first, then each file that `follow` read, in order of first read, missing ones too, once each. */
  uses: UsedFile[];
  follow(node: unknown): Followed;
}

export type OpenedSpec =
  | { kind: 'ok'; spec: Spec }
  | { kind: 'missing' }
  | { kind: 'bad'; file: string; line: number; uses: UsedFile[] };

type Plain = Record<string | symbol, unknown>;

/** A map of a parsed file: an object whose prototype is `Object.prototype` or null. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** An object with a string `$ref`. */
export function isRef(node: unknown): node is { $ref: string; [REF_PLACE]?: RefPlace } {
  return isPlainObject(node) && typeof node.$ref === 'string';
}

/** The key of a pair as `toJS` writes it on a plain object, or null for a key that is no scalar. */
function keyName(key: unknown): string | null {
  if (!isScalar(key)) return null;
  const { value } = key;
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? null : String(value);
}

/** Puts the place of each `$ref` on its object, walking the nodes of the file beside the values that `toJS` made. */
function markRefs(node: unknown, value: unknown, file: string, counter: LineCounter): void {
  if (isMap(node) && isPlainObject(value)) {
    for (const pair of node.items) {
      const name = keyName(pair.key);
      if (name === null || !Object.hasOwn(value, name)) continue;
      const child = value[name];
      if (name === '$ref' && typeof child === 'string' && isScalar(pair.key) && pair.key.range) {
        (value as Plain)[REF_PLACE] = { file, line: counter.linePos(pair.key.range[0]).line, ref: child };
      }
      markRefs(pair.value, child, file, counter);
    }
  } else if (isSeq(node) && Array.isArray(value)) {
    node.items.forEach((item, at) => markRefs(item, value[at], file, counter));
  }
}

/** The last text that each path gave, with its parse. */
const parsed = new Map<string, { text: string; result: ParsedFile }>();

function parseText(path: string, text: string): ParsedFile {
  const counter = new LineCounter();
  const document = parseDocument(text, { lineCounter: counter, uniqueKeys: true });
  const [error] = document.errors;
  if (error) return { kind: 'bad', line: counter.linePos(error.pos[0]).line };
  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 100 });
  } catch {
    return { kind: 'bad', line: 1 };
  }
  markRefs(document.contents, value, path, counter);
  const lines: Record<string, number> = {};
  if (isMap(document.contents)) {
    for (const pair of document.contents.items) {
      const name = keyName(pair.key);
      if (name !== null && isScalar(pair.key) && pair.key.range) lines[name] = counter.linePos(pair.key.range[0]).line;
    }
  }
  return { kind: 'ok', value, lines };
}

/**
 * Parses a YAML or JSON text with `yaml` 2.9.1, `parseDocument` and a `LineCounter`: one document, unique keys, the
 * default alias limit. A map becomes a plain object, a sequence an array, an alias the value of its anchor. An error
 * gives the line of the first error, and a text that `toJS` refuses, such as one over the alias limit, gives line 1.
 * The same path and text give the same object. A new text for the path replaces the cached one.
 */
export function parseSpecText(path: string, text: string): ParsedFile {
  const known = parsed.get(path);
  if (known?.text === text) return known.result;
  const result = parseText(path, text);
  parsed.set(path, { text, result });
  return result;
}

const VERSION_3 = /^3\.([0-2])(\.\d+)?$/;

/** A file that a ref names, once read. */
type RefFile = { kind: 'ok'; root: unknown } | { kind: 'missing' } | { kind: 'bad'; line: number };

/** A pointer after its `#`, as the keys and indexes that it names, or null for a bad one. An empty one is the root. */
function pointerTokens(fragment: string): string[] | null {
  if (!fragment) return [];
  let decoded: string;
  try {
    decoded = decodeURIComponent(fragment);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/')) return null;
  const tokens: string[] = [];
  for (const raw of decoded.slice(1).split('/')) {
    if (/~(?![01])/.test(raw)) return null;
    tokens.push(raw.replace(/~1/g, '/').replace(/~0/g, '~'));
  }
  return tokens;
}

const NOT_FOUND = Symbol('not found');

function pointAt(root: unknown, tokens: readonly string[]): unknown {
  let at: unknown = root;
  for (const token of tokens) {
    if (Array.isArray(at)) {
      if (!/^(0|[1-9]\d*)$/.test(token) || Number(token) >= at.length) return NOT_FOUND;
      at = at[Number(token)];
    } else if (isPlainObject(at) && Object.hasOwn(at, token)) {
      at = at[token];
    } else return NOT_FOUND;
  }
  return at;
}

/** The keys of a ref node other than `$ref`, without its place. */
function othersOf(node: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(node).filter(([key]) => key !== '$ref'));
}

/** Opens the OpenAPI file at `path`, a path in the docs folder, through `files.find`. */
export function openSpec(files: PageFiles, path: string): OpenedSpec {
  const found = files.find(path);
  if (!found) return { kind: 'missing' };
  const uses: UsedFile[] = [{ file: path, path: files.fullPath(path), version: found.version }];
  const result = parseSpecText(path, new TextDecoder().decode(found.bytes()));
  if (result.kind === 'bad') return { kind: 'bad', file: path, line: result.line, uses };
  const raw = result.value;
  if (!isPlainObject(raw)) return { kind: 'bad', file: path, line: 1, uses };
  const { lines } = result;
  const match = VERSION_3.exec(String(raw.openapi));
  let version: SpecVersion;
  if (match) version = `3.${match[1]}` as SpecVersion;
  else if (raw.swagger === '2.0' || raw.swagger === 2) version = '2.0';
  else return { kind: 'bad', file: path, line: lines.openapi ?? lines.swagger ?? 1, uses };
  if (Object.hasOwn(raw, 'paths') && !isPlainObject(raw.paths)) {
    return { kind: 'bad', file: path, line: lines.paths ?? 1, uses };
  }
  const root = version === '2.0' ? fromSwagger2(raw) : raw;

  const read = new Map<string, RefFile>([[path, { kind: 'ok', root }]]);
  function refFile(file: string): RefFile {
    const known = read.get(file);
    if (known) return known;
    const found = files.find(file);
    let entry: RefFile;
    if (!found) entry = { kind: 'missing' };
    else {
      const text = parseSpecText(file, new TextDecoder().decode(found.bytes()));
      entry = text.kind === 'ok' ? { kind: 'ok', root: text.value } : { kind: 'bad', line: text.line };
    }
    uses.push({ file, path: files.fullPath(file), version: found?.version ?? null });
    read.set(file, entry);
    return entry;
  }

  function follow(node: unknown): Followed {
    if (!isRef(node)) return { kind: 'value', value: node, name: null, target: null };
    const place: RefPlace = node[REF_PLACE] ?? { file: path, line: 1, ref: node.$ref };
    const unresolved: Followed = { kind: 'unresolved', place };
    /** The keys beside each ref of the chain. A key nearer the node wins. */
    const beside: Record<string, unknown>[] = [];
    const passed = new Set<string>();
    let at: unknown = node;
    let here = place.file;
    let name: string | null = null;
    while (isRef(at)) {
      const ref = at.$ref;
      const from = at[REF_PLACE]?.file ?? here;
      beside.push(othersOf(at));
      const hash = ref.indexOf('#');
      const target = hash < 0 ? ref : ref.slice(0, hash);
      const fragment = hash < 0 ? '' : ref.slice(hash + 1);
      let file = from;
      if (target) {
        const resolved = resolveTarget(target, from);
        if (resolved.kind !== 'file') return unresolved;
        file = resolved.path;
      }
      const tokens = pointerTokens(fragment);
      if (!tokens) return unresolved;
      const key = JSON.stringify([file, tokens]);
      if (passed.has(key)) return unresolved;
      passed.add(key);
      const opened = refFile(file);
      if (opened.kind === 'missing') return unresolved;
      if (opened.kind === 'bad') return { kind: 'bad', file, line: opened.line };
      const value = pointAt(opened.root, tokens);
      if (value === NOT_FOUND) return unresolved;
      name = tokens.length ? tokens[tokens.length - 1]! : (file.split('/').pop() ?? file).replace(/\.[^.]*$/, '');
      here = file;
      at = value;
    }
    const target = typeof at === 'object' && at !== null ? at : null;
    const others = Object.assign({}, ...beside.reverse()) as Record<string, unknown>;
    const value = isPlainObject(at) && Object.keys(others).length ? { ...at, ...others } : at;
    return { kind: 'value', value, name, target };
  }

  return { kind: 'ok', spec: { file: path, version, root, uses, follow } };
}
