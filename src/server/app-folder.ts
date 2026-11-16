import type { DiagramBuilds } from './diagram-builds.ts';
import type { FontFiles } from './fonts.ts';

/** The font files of the themes, under the app folder. `app.css` names them relative to itself. */
export const FONTS_FOLDER = 'fonts/';
/** The licenses of the fonts and of what the Mermaid builds bundle, under the app folder. */
export const LICENSES_FILE = 'licenses.txt';
/** The text of every page for the search box, under the app folder. */
export const SEARCH_FILE = 'search.js';

/** The text of `licenses.txt`: the license entries of the fonts, then those of what the Mermaid builds bundle. */
export function licensesText(fonts: FontFiles, diagrams: DiagramBuilds): string {
  return `${fonts.licenses}\n${diagrams.licenses}`;
}
