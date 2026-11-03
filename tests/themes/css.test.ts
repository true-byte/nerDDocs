import { basename } from 'node:path';
import { expect, test } from '@playwright/test';
import { themeCss } from '../../src/themes/css.ts';
import { DEFAULT_THEME, THEMES } from '../../src/themes/index.ts';
import type { FontFace, Mode, Theme } from '../../src/themes/types.ts';
import { cssRules, declarations, selectorsOf, urlsIn, type CssRule } from '../support/css.ts';

/** Every token of a look, by the token table of the spec, with the value that it takes from the theme. */
function tokensOf(theme: Theme, mode: Mode): Record<string, string> {
  const colors = theme[mode];
  const { fonts, shape } = theme;
  return {
    '--bg': colors.bg,
    '--ink': colors.ink,
    '--soft': colors.soft,
    '--line': colors.line,
    '--sel': colors.sel,
    '--sel-ink': colors.selInk,
    '--raise': colors.raise,
    '--code': colors.code,
    '--sheet': colors.sheet,
    '--art': colors.art,
    ...Object.fromEntries(colors.levels.map((color, stop) => [`--l${stop}`, color])),
    '--body': fonts.body,
    '--head': fonts.head,
    '--mono': fonts.mono,
    '--ui': fonts.ui,
    '--r': shape.radius,
    '--thumb-r': shape.thumbRadius,
    '--track': shape.track,
    '--head-w': String(shape.headWeight),
    '--body-size': shape.bodySize,
    '--lh': String(shape.lineHeight),
    '--char-w': `${theme.charWidth}em`,
    'color-scheme': mode,
  };
}

const oneSpace = (value: string) => value.replace(/\s+/g, ' ').trim();
const byComputer = (rule: CssRule) => rule.at.some((at) => /prefers-color-scheme/.test(at));
/** The part of a selector that picks the look: none for the light look, and `[data-mode="dark"]` for the dark look. */
const modePart = (mode: Mode) => (mode === 'dark' ? '[data-mode="dark"]' : '');
const pageOf = (id: string, mode: Mode) => `:root[data-theme="${id}"]${modePart(mode)}`;
const boxOf = (id: string, mode: Mode) => `.sw [data-theme="${id}"]${modePart(mode)}`;
const NO_THEME = ':root:not([data-theme])';
const DEFAULT = THEMES.find((theme) => theme.id === DEFAULT_THEME)!;

let sheet: CssRule[] | undefined;
const rules = () => (sheet ??= cssRules(themeCss(THEMES)));

/** The rules of a look of a theme. Both looks sit in no at-rule, so the reader's look setting picks one, not the computer. */
const lookRules = (id: string, mode: Mode) =>
  rules().filter((rule) => rule.at.length === 0 && selectorsOf(rule).includes(pageOf(id, mode)));

/** The values of a rule's declarations, with their spaces made single. */
const valuesOf = (rule: CssRule) =>
  Object.fromEntries([...declarations(rule.body)].map(([name, value]) => [name, oneSpace(value)]));
const tokenValues = (theme: Theme, mode: Mode) =>
  Object.fromEntries(Object.entries(tokensOf(theme, mode)).map(([name, value]) => [name, oneSpace(value)]));

for (const theme of THEMES) {
  test(`themeCss writes the light rule of '${theme.name}' on its theme, and its dark rule on its theme with [data-mode="dark"], each with every token`, () => {
    for (const mode of ['light', 'dark'] as const) {
      const found = lookRules(theme.id, mode);
      expect(found, `${mode} rules`).toHaveLength(1);
      expect(selectorsOf(found[0]!), mode).toEqual(expect.arrayContaining([pageOf(theme.id, mode), boxOf(theme.id, mode)]));
      expect(valuesOf(found[0]!), mode).toMatchObject(tokenValues(theme, mode));
    }
  });
}

test('a page with no theme shows the light look of the default theme', () => {
  const found = rules().filter((rule) => rule.at.length === 0 && selectorsOf(rule).includes(NO_THEME));
  expect(found).toHaveLength(1);
  expect(valuesOf(found[0]!)).toMatchObject(tokenValues(DEFAULT, 'light'));
});

test("the only prefers-color-scheme rule holds a page with no theme alone, with the default theme's dark look", () => {
  const found = rules().filter(byComputer);
  expect(found.map(selectorsOf), 'the rules in a prefers-color-scheme block').toEqual([[NO_THEME]]);
  expect(found[0]!.at).toEqual([expect.stringMatching(/^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/)]);
  expect(valuesOf(found[0]!)).toMatchObject(tokenValues(DEFAULT, 'dark'));
});

test('themeCss writes one @font-face per face of every theme, with swap and a URL next to app.css', () => {
  const keyOf = (family: string, weight: string, style: string, url: string) => `${family} ${weight} ${style} ${url}`;
  const faceKey = (face: FontFace) =>
    keyOf(face.family, String(face.weight), face.style ?? 'normal', `fonts/${basename(face.file)}`);
  const unquoted = (value = '') => value.replace(/^["']|["']$/g, '');

  const faces = rules().filter((rule) => rule.selector === '@font-face');
  const written = faces.map((rule) => {
    const face = declarations(rule.body);
    const src = face.get('src') ?? '';
    expect(face.get('font-display'), src).toBe('swap');
    expect(src, src).toMatch(/format\(\s*["']?woff2["']?\s*\)/);
    expect(urlsIn(src), src).toHaveLength(1);
    return keyOf(unquoted(face.get('font-family')), face.get('font-weight') ?? '', face.get('font-style') ?? 'normal', urlsIn(src)[0]!);
  });
  expect(new Set(written)).toEqual(new Set(THEMES.flatMap((theme) => theme.faces.map(faceKey))));
});
