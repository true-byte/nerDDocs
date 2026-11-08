import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { BOX_FACES, BOX_FAMILY, pageFaces } from '../../src/themes/box-font.ts';
import { THEMES } from '../../src/themes/index.ts';
import { REPO } from '../support/run-command.ts';

const PACKAGE = join(REPO, 'node_modules/@fontsource/fira-code');
const LATIN = '@fontsource/fira-code/files/fira-code-latin-400-normal.woff2';
const SYMBOLS2 = '@fontsource/fira-code/files/fira-code-symbols2-400-normal.woff2';

const faceOf = (file: string) => BOX_FACES.find((face) => face.file === file);

/** True when a CSS `unicode-range`, such as 'U+2000-2001,U+2500-259F', holds the code point. */
function covers(range: string, codePoint: number): boolean {
  return range.split(',').some((part) => {
    const [from, to = from] = part.trim().replace(/^U\+/i, '').split('-');
    return parseInt(from!, 16) <= codePoint && codePoint <= parseInt(to!, 16);
  });
}

test("box diagrams take Fira Code 400 from its latin and its symbols2 file, as the family 'nd box'", () => {
  expect(BOX_FAMILY).toBe('nd box');
  expect(BOX_FACES).toEqual([
    {
      family: 'nd box',
      file: LATIN,
      weight: 400,
      unicodeRange:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    },
    {
      family: 'nd box',
      file: SYMBOLS2,
      weight: 400,
      unicodeRange: 'U+2000-2001,U+2004-2008,U+200A,U+23B8-23BD,U+2500-259F',
    },
  ]);
});

test('the range of each box face is the range of its file in the package', () => {
  const ranges = JSON.parse(readFileSync(join(PACKAGE, 'unicode.json'), 'utf8')) as Record<string, string>;
  expect(faceOf(LATIN)?.unicodeRange).toBe(ranges.latin);
  expect(faceOf(SYMBOLS2)?.unicodeRange).toBe(ranges.symbols2);
});

test('the symbols2 face covers every box character', () => {
  const range = faceOf(SYMBOLS2)?.unicodeRange ?? '';
  expect(covers(range, 0x2500)).toBe(true);
  expect(covers(range, 0x257f)).toBe(true);
});

test('each box face is a woff2 file of the installed package', () => {
  expect(BOX_FACES.length).toBeGreaterThan(0);
  for (const face of BOX_FACES) {
    const file = join(REPO, 'node_modules', face.file);
    expect(readFileSync(file).subarray(0, 4).toString('latin1'), file).toBe('wOF2');
  }
});

test('the faces of the page are those of each theme, then the box faces', () => {
  expect(pageFaces(THEMES)).toEqual([...THEMES.flatMap((theme) => theme.faces), ...BOX_FACES]);
});
