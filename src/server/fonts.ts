import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pageFaces } from '../themes/box-font.ts';
import { faceFileName } from '../themes/css.ts';
import type { Theme } from '../themes/types.ts';
import { licenseEntry } from './licenses.ts';

export interface FontFiles {
  /** Each face file of the page, by its file name. */
  files: Record<string, Uint8Array>;
  /** The license entry of each font package that a face uses. */
  licenses: string;
}

/** The package of a face file, such as '@fontsource/vt323' for '@fontsource/vt323/files/vt323-latin-400-normal.woff2'. */
function packageOf(file: string): string {
  const parts = file.split('/');
  return parts.slice(0, file.startsWith('@') ? 2 : 1).join('/');
}

/**
 * The face files that the page uses, those of the themes and of box diagrams, and the licenses of their packages, read
 * from a `node_modules` folder.
 */
export function readFonts(themes: readonly Theme[], nodeModules: string): FontFiles {
  const faces = pageFaces(themes);
  const files: Record<string, Uint8Array> = {};
  for (const face of faces) files[faceFileName(face)] = readFileSync(join(nodeModules, face.file));
  const packages = [...new Set(faces.map((face) => packageOf(face.file)))];
  const licenses = packages.map((name) => licenseEntry(join(nodeModules, name))).join('\n');
  return { files, licenses };
}
