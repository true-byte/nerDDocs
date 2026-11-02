import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { faceFileName } from '../themes/css.ts';
import type { Theme } from '../themes/types.ts';

export interface FontFiles {
  /** Each face file of the themes, by its file name. */
  files: Record<string, Uint8Array>;
  /** The license of each font package that a face uses, each under a line with the package name. */
  licenses: string;
}

/** The package of a face file, such as '@fontsource/vt323' for '@fontsource/vt323/files/vt323-latin-400-normal.woff2'. */
function packageOf(file: string): string {
  const parts = file.split('/');
  return parts.slice(0, file.startsWith('@') ? 2 : 1).join('/');
}

/** The face files that the themes use and the licenses of their packages, read from a `node_modules` folder. */
export function readFonts(themes: readonly Theme[], nodeModules: string): FontFiles {
  const faces = themes.flatMap((theme) => theme.faces);
  const files: Record<string, Uint8Array> = {};
  for (const face of faces) files[faceFileName(face)] = readFileSync(join(nodeModules, face.file));
  const packages = [...new Set(faces.map((face) => packageOf(face.file)))];
  const licenses = packages
    .map((name) => `${name}\n\n${readFileSync(join(nodeModules, name, 'LICENSE'), 'utf8').trim()}\n`)
    .join('\n');
  return { files, licenses };
}
