import type { FontFace, Theme } from './types.ts';

/**
 * The font family of box diagrams, the same in every theme. Its cells all have one width and its box characters fill
 * the line height, so the lines of a diagram join.
 */
export const BOX_FAMILY = 'nd box';

/**
 * Fira Code 400: its latin file, and its symbols2 file with the box characters. Each range is that of the file in
 * `@fontsource/fira-code/unicode.json`, so a browser loads a file only for text that it serves.
 */
export const BOX_FACES: readonly FontFace[] = [
  {
    family: BOX_FAMILY,
    file: '@fontsource/fira-code/files/fira-code-latin-400-normal.woff2',
    weight: 400,
    unicodeRange:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
  {
    family: BOX_FAMILY,
    file: '@fontsource/fira-code/files/fira-code-symbols2-400-normal.woff2',
    weight: 400,
    unicodeRange: 'U+2000-2001,U+2004-2008,U+200A,U+23B8-23BD,U+2500-259F',
  },
];

/** Every face that the page style names: the faces of each theme in theme order, then `BOX_FACES`. */
export function pageFaces(themes: readonly Theme[]): FontFace[] {
  return [...themes.flatMap((theme) => theme.faces), ...BOX_FACES];
}
