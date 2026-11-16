import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A package whose code the Mermaid builds hold, at the version that they hold. */
export interface BundledPackage {
  name: string;
  version: string;
}

/** The license entry of each bundled package, in the order of `bundledPackages`. `scripts/bundled-licenses.mjs` writes it. */
export const BUNDLED_LICENSES = join(import.meta.dirname, 'bundled-licenses.txt');

/**
 * The packages whose code the builds hold that no source map names, at the version that the builds hold:
 * - `vscode-uri`, which langium 4.4.0 takes at `~3.1.0`, a range that only 3.1.0 meets. Its own bundle holds
 *   `path-browserify`, which it takes at `^1.0.1`, a range that only 1.0.1 meets. The map of the parser names both as
 *   `webpack://LIB`.
 * - The packages that `roughjs/bundled/rough.esm.js` of roughjs 4.6.6 holds, each at the one version that meets its range.
 */
const UNMAPPED: readonly BundledPackage[] = [
  { name: 'vscode-uri', version: '3.1.0' },
  { name: 'path-browserify', version: '1.0.1' },
  { name: 'hachure-fill', version: '0.5.2' },
  { name: 'path-data-parser', version: '0.1.0' },
  { name: 'points-on-curve', version: '0.2.0' },
  { name: 'points-on-path', version: '0.2.1' },
];

/** The packages of Mermaid itself, at their installed version. The tiny build holds a part of the code of the full build. */
const OWN = ['mermaid', '@mermaid-js/tiny', '@mermaid-js/parser'];

/** A source of a map in the store of pnpm: `.pnpm/<name with + for />@<version>[_<more>]/node_modules/<name>/`. */
const STORED = /node_modules\/\.pnpm\/([^/]+)\/node_modules\/((?:@[^/]+\/)?[^/]+)\//;

function mapsIn(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.map'))
    .map((entry) => join(folder, entry));
}

/** Each package that a source map names, as `<name>@<version>`. */
function packagesOf(map: string): string[] {
  const { sources } = JSON.parse(readFileSync(map, 'utf8')) as { sources: string[] };
  return sources.flatMap((source) => {
    const found = STORED.exec(source);
    if (!found) return [];
    const [, store = '', name = ''] = found;
    const prefix = `${name.replace('/', '+')}@`;
    if (!store.startsWith(prefix)) throw new Error(`A source of ${map} sits in another package: ${source}`);
    return [`${name}@${store.slice(prefix.length).split('_')[0]}`];
  });
}

const versionOf = (nodeModules: string, name: string) =>
  (JSON.parse(readFileSync(join(nodeModules, name, 'package.json'), 'utf8')) as { version: string }).version;

/**
 * Every package whose code the two builds hold, at the version that they hold, sorted by name, then by version. The
 * source map of the full build and those of `@mermaid-js/parser`, whose files the full build holds, name each file
 * that they bundle in the store of pnpm, with its version.
 */
export function bundledPackages(nodeModules: string): BundledPackage[] {
  const maps = [join(nodeModules, 'mermaid/dist/mermaid.min.js.map'), ...mapsIn(join(nodeModules, '@mermaid-js/parser/dist'))];
  const named = new Set([
    ...maps.flatMap(packagesOf),
    ...OWN.map((name) => `${name}@${versionOf(nodeModules, name)}`),
    ...UNMAPPED.map(({ name, version }) => `${name}@${version}`),
  ]);
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...named]
    .map((spec) => {
      const at = spec.lastIndexOf('@');
      return { name: spec.slice(0, at), version: spec.slice(at + 1) };
    })
    .sort((a, b) => order(a.name, b.name) || a.version.localeCompare(b.version, 'en', { numeric: true }));
}
