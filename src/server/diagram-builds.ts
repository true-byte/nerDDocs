import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_FILES } from '../page/diagrams.ts';
import { BUNDLED_LICENSES } from './bundled-packages.ts';

export interface DiagramBuilds {
  /** Each build by its name under `/__nerddocs/`: 'mermaid.js' and 'mermaid-full.js'. */
  files: Record<string, string>;
  /** The entry of every package that the two builds bundle. */
  licenses: string;
}

/** The file of each build in `node_modules`. */
export const BUILD_SOURCES: Readonly<Record<'tiny' | 'full', string>> = {
  tiny: '@mermaid-js/tiny/dist/mermaid.tiny.js',
  full: 'mermaid/dist/mermaid.min.js',
};

/** The two builds as text, read from a `node_modules` folder, and the licenses of what they bundle. */
export function readDiagramBuilds(nodeModules: string): DiagramBuilds {
  const files: Record<string, string> = {};
  for (const build of ['tiny', 'full'] as const) {
    files[BUILD_FILES[build]] = readFileSync(join(nodeModules, BUILD_SOURCES[build]), 'utf8');
  }
  return { files, licenses: readFileSync(BUNDLED_LICENSES, 'utf8') };
}
