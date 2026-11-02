import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { contrastRatio } from '../../src/themes/contrast.ts';
import { THEMES } from '../../src/themes/index.ts';
import type { Colors, Mode, Theme } from '../../src/themes/types.ts';
import { splitTop } from '../support/css.ts';
import { REPO } from '../support/run-command.ts';

const MODES: Mode[] = ['light', 'dark'];
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const GENERIC_FAMILIES = [
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
];

type ColorName = Exclude<keyof Colors, 'levels'>;

/** The text color, the backgrounds it sits on, and the lowest contrast ratio that it needs on each. */
const TEXT_ON: [ColorName, ColorName[], number][] = [
  ['ink', ['bg', 'sheet', 'raise', 'code'], 4.5],
  ['soft', ['bg', 'sheet', 'raise'], 4.5],
  ['selInk', ['sel'], 4.5],
];
const LEVELS_ON: ColorName[] = ['sheet', 'raise'];
const LEVEL_RATIO = 3;

/** The family names of a CSS font stack, with no quotes. */
const familiesOf = (stack: string) => splitTop(stack, ',').map((family) => family.replace(/^["']|["']$/g, ''));

/** Each pair of a look whose contrast is too low, as `light ink on code: 3.21`. */
function lowContrast(theme: Theme): string[] {
  const low: string[] = [];
  const check = (mode: Mode, text: string, color: string, background: ColorName, least: number) => {
    const ratio = contrastRatio(color, theme[mode][background]);
    if (ratio < least) low.push(`${mode} ${text} on ${background}: ${ratio.toFixed(2)}`);
  };
  for (const mode of MODES) {
    const colors = theme[mode];
    for (const [text, backgrounds, least] of TEXT_ON) {
      for (const background of backgrounds) check(mode, text, colors[text], background, least);
    }
    colors.levels.forEach((level, stop) => {
      for (const background of LEVELS_ON) check(mode, `l${stop}`, level, background, LEVEL_RATIO);
    });
  }
  return low;
}

for (const theme of THEMES) {
  test.describe(`the theme '${theme.name}'`, () => {
    test('every color of both looks is a hex color', () => {
      for (const mode of MODES) {
        const { levels, ...colors } = theme[mode];
        for (const [name, color] of Object.entries(colors)) expect(color, `${mode} ${name}`).toMatch(HEX);
        levels.forEach((color, stop) => expect(color, `${mode} l${stop}`).toMatch(HEX));
      }
    });

    test('text and level colors stand out from each background they sit on, in both looks', () => {
      expect(lowContrast(theme)).toEqual([]);
    });

    test('each level has a color of its own, in both looks', () => {
      for (const mode of MODES) {
        const levels = theme[mode].levels.map((color) => color.toLowerCase());
        expect(new Set(levels).size, `${mode}: ${levels.join(' ')}`).toBe(levels.length);
      }
    });

    test('each font stack ends in a generic family', () => {
      for (const [name, stack] of Object.entries(theme.fonts)) {
        expect(GENERIC_FAMILIES, `${name}: ${stack}`).toContain(familiesOf(stack).at(-1));
      }
    });

    test('each font face is in a font stack, and its file is a woff2 file of an installed package', () => {
      const families = Object.values(theme.fonts).flatMap(familiesOf);
      for (const face of theme.faces) {
        expect(families, face.family).toContain(face.family);
        const file = join(REPO, 'node_modules', face.file);
        expect(readFileSync(file).subarray(0, 4).toString('latin1'), file).toBe('wOF2');
      }
    });
  });
}
