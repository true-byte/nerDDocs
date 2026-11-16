import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { contrastRatio } from '../../src/themes/contrast.ts';
import { THEMES } from '../../src/themes/index.ts';
import type { Colors, Mode, SeriesColors, SyntaxColors, Theme } from '../../src/themes/types.ts';
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

type ColorName = Exclude<keyof Colors, 'levels' | 'syntax' | 'series'>;

/** The text color, the backgrounds it sits on, and the lowest contrast ratio that it needs on each. Comments in code take `soft`. */
const TEXT_ON: [ColorName, ColorName[], number][] = [
  ['ink', ['bg', 'sheet', 'raise', 'code'], 4.5],
  ['soft', ['bg', 'sheet', 'raise', 'code'], 4.5],
  ['selInk', ['sel'], 4.5],
];
const LEVELS_ON: ColorName[] = ['sheet', 'raise'];
const LEVEL_RATIO = 3;

const SYNTAX_NAMES: (keyof SyntaxColors)[] = ['keyword', 'string', 'function', 'constant', 'added', 'removed'];
const SERIES_NAMES: (keyof SeriesColors)[] = ['orange', 'teal'];
/** The backgrounds that code tokens and diagram series sit on, and the lowest contrast ratio that they need on each. */
const TOKENS_ON: ColorName[] = ['code', 'sheet'];
const TOKEN_RATIO = 4.5;

/** The color of a link in each look of each theme, by theme id. */
const LINK_COLORS: Record<string, Record<Mode, string>> = {
  themelessness: { light: '#0e6a73', dark: '#62c6cc' },
  'im-a-serious-person': { light: '#1d1d1f', dark: '#f2f2f5' },
  'i-love-msdos': { light: '#0000aa', dark: '#ffffff' },
  'im-in': { light: '#082c13', dark: '#d8ffe1' },
  'original-nerd': { light: '#1f1a14', dark: '#ecdfc4' },
  'i-void-warranties': { light: '#a14a12', dark: '#f0a36b' },
  'i-fly-spaceships': { light: '#0d1f45', dark: '#d7e6ff' },
};
const LINK_RATIO = 4.5;

/** A hex color in lower case with 6 digits, so two ways to write one color give one value. */
const fullHex = (hex: string) => {
  const digits = hex.slice(1).toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits}`;
};

/** The syntax colors and the series colors of a look, by name. */
const tokenColors = (colors: Colors): [string, string][] => [
  ...SYNTAX_NAMES.map((name): [string, string] => [name, colors.syntax[name]]),
  ...SERIES_NAMES.map((name): [string, string] => [name, colors.series[name]]),
];

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
        const { levels, syntax, series, ...colors } = theme[mode];
        for (const [name, color] of Object.entries(colors)) expect(color, `${mode} ${name}`).toMatch(HEX);
        levels.forEach((color, stop) => expect(color, `${mode} l${stop}`).toMatch(HEX));
        expect(Object.keys(syntax ?? {}).sort(), `${mode} syntax`).toEqual([...SYNTAX_NAMES].sort());
        expect(Object.keys(series ?? {}).sort(), `${mode} series`).toEqual([...SERIES_NAMES].sort());
        for (const [name, color] of tokenColors(theme[mode])) expect(color, `${mode} ${name}`).toMatch(HEX);
      }
    });

    test('text and level colors stand out from each background they sit on, in both looks', () => {
      expect(lowContrast(theme)).toEqual([]);
    });

    test('the link color stands out on sheet with a ratio of at least 4.5, in both looks', () => {
      for (const mode of MODES) {
        expect(contrastRatio(theme[mode].link, theme[mode].sheet), mode).toBeGreaterThanOrEqual(LINK_RATIO);
      }
    });

    test('the syntax and series colors stand out on code and on sheet, in both looks', () => {
      const low: string[] = [];
      for (const mode of MODES) {
        for (const [name, color] of tokenColors(theme[mode])) {
          for (const background of TOKENS_ON) {
            const ratio = contrastRatio(color, theme[mode][background]);
            if (ratio < TOKEN_RATIO) low.push(`${mode} ${name} on ${background}: ${ratio.toFixed(2)}`);
          }
        }
      }
      expect(low).toEqual([]);
    });

    test('the six syntax colors differ from each other and from ink, in both looks', () => {
      for (const mode of MODES) {
        const { syntax, ink } = theme[mode];
        const colors = [...SYNTAX_NAMES.map((name) => syntax[name]), ink].map(fullHex);
        expect(new Set(colors).size, `${mode}: ${colors.join(' ')}`).toBe(SYNTAX_NAMES.length + 1);
      }
    });

    test('the eight series colors of a diagram differ from each other, in both looks', () => {
      for (const mode of MODES) {
        const { syntax, series, soft } = theme[mode];
        const { keyword, string, function: name, constant, removed } = syntax;
        const colors = [keyword, string, name, constant, removed, series.orange, series.teal, soft].map(fullHex);
        expect(new Set(colors).size, `${mode}: ${colors.join(' ')}`).toBe(8);
      }
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

    test('the average character width of the body font is from 0.3 to 0.8 em', () => {
      expect(theme.charWidth).toBeGreaterThanOrEqual(0.3);
      expect(theme.charWidth).toBeLessThanOrEqual(0.8);
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

test('each built-in theme has the link color of each of its looks', () => {
  const found = Object.fromEntries(
    Object.keys(LINK_COLORS).map((id) => {
      const theme = THEMES.find((each) => each.id === id);
      return [id, theme && { light: fullHex(theme.light.link), dark: fullHex(theme.dark.link) }];
    }),
  );
  expect(found).toEqual(LINK_COLORS);
});
