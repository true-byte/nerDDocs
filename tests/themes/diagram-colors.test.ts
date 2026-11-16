import { expect, test } from '@playwright/test';
import { contrastRatio } from '../../src/themes/contrast.ts';
import { blackOrWhite, seriesColors, themeVariables, type DiagramColors } from '../../src/themes/diagram-colors.ts';
import { THEMES } from '../../src/themes/index.ts';
import type { Mode, Theme } from '../../src/themes/types.ts';

const MODES: Mode[] = ['light', 'dark'];

/** Each look of each theme, named as `<theme> <mode>`. */
const LOOKS: { name: string; theme: Theme; mode: Mode; colors: DiagramColors }[] = THEMES.flatMap((theme) =>
  MODES.map((mode) => ({ name: `${theme.id} ${mode}`, theme, mode, colors: theme[mode] })),
);

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

/** The six hex digits of a color, in lower case. */
const sixDigits = (hex: string) => {
  const digits = hex.slice(1).toLowerCase();
  return digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
};

/** Each channel of `(a + b) / 2`, rounded, as `#rrggbb` in lower case. */
function halfway(a: string, b: string): string {
  const [x, y] = [sixDigits(a), sixDigits(b)];
  const channels = [0, 2, 4].map((at) =>
    Math.round((parseInt(x.slice(at, at + 2), 16) + parseInt(y.slice(at, at + 2), 16)) / 2)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${channels.join('')}`;
}

const range = (count: number) => Array.from({ length: count }, (_, n) => n);
const named = (keys: string[], value: unknown) => Object.fromEntries(keys.map((key) => [key, value]));

/** The variables that the table of the contract gives for one look. */
function expectedVariables(colors: DiagramColors, mode: Mode, uiFont: string): Record<string, unknown> {
  const { ink, soft, line, sel, selInk, raise, code, sheet } = colors;
  const S = seriesColors(colors);
  return {
    darkMode: mode === 'dark',
    ...named(['background', 'edgeLabelBackground', 'altSectionBkgColor', 'pieStrokeColor', 'commitLabelBackground'], sheet),
    fontFamily: uiFont,
    fontSize: '15px',
    ...named(
      [
        'primaryColor',
        'mainBkg',
        'actorBkg',
        'labelBoxBkgColor',
        'attributeBackgroundColorOdd',
        'sectionBkgColor2',
        'taskBkgColor',
        'quadrant1Fill',
        'quadrant4Fill',
      ],
      code,
    ),
    ...named(
      [
        'primaryTextColor',
        'tertiaryTextColor',
        'nodeTextColor',
        'textColor',
        'titleColor',
        'actorTextColor',
        'signalColor',
        'signalTextColor',
        'labelTextColor',
        'loopTextColor',
        'labelColor',
        'classText',
        'taskTextColor',
        'taskTextLightColor',
        'taskTextDarkColor',
        'taskTextOutsideColor',
        'taskTextClickableColor',
        'pieTitleTextColor',
        'pieLegendTextColor',
        'commitLabelColor',
        'quadrant1TextFill',
        'quadrant2TextFill',
        'quadrant3TextFill',
        'quadrant4TextFill',
        'quadrantPointTextFill',
        'quadrantXAxisTextFill',
        'quadrantYAxisTextFill',
        'quadrantTitleFill',
      ],
      ink,
    ),
    ...named(
      [
        'primaryBorderColor',
        'secondaryBorderColor',
        'tertiaryBorderColor',
        'nodeBorder',
        'lineColor',
        'defaultLinkColor',
        'clusterBorder',
        'noteBorderColor',
        'actorBorder',
        'actorLineColor',
        'labelBoxBorderColor',
        'activationBorderColor',
        'taskBorderColor',
        'activeTaskBorderColor',
        'doneTaskBorderColor',
        'pieOuterStrokeColor',
        'tagLabelBorder',
        'quadrantInternalBorderStrokeFill',
        'quadrantExternalBorderStrokeFill',
        'archEdgeColor',
        'archEdgeArrowColor',
        'archGroupBorderColor',
      ],
      soft,
    ),
    ...named(['secondaryColor', 'noteBkgColor', 'activationBkgColor', 'activeTaskBkgColor', 'critBkgColor', 'tagLabelBackground'], sel),
    ...named(['secondaryTextColor', 'noteTextColor', 'tagLabelColor'], selInk),
    ...named(
      [
        'tertiaryColor',
        'clusterBkg',
        'altBackground',
        'attributeBackgroundColorEven',
        'sectionBkgColor',
        'doneTaskBkgColor',
        'quadrant2Fill',
        'quadrant3Fill',
      ],
      raise,
    ),
    gridColor: line,
    ...named(['critBorderColor', 'todayLineColor'], colors.syntax.removed),
    sequenceNumberColor: blackOrWhite(soft),
    pieSectionTextColor: '#000000',
    pieOpacity: '1',
    quadrantPointFill: S[0],
    ...Object.fromEntries(range(12).map((i) => [`pie${i + 1}`, S[i]])),
    ...Object.fromEntries(range(12).map((i) => [`cScale${i}`, S[i]])),
    ...Object.fromEntries(range(12).map((i) => [`cScaleLabel${i}`, blackOrWhite(S[i]!)])),
    ...Object.fromEntries(range(12).map((i) => [`cScalePeer${i}`, soft])),
    ...Object.fromEntries(range(12).map((i) => [`fillType${i}`, i % 2 ? raise : code])),
    ...Object.fromEntries(range(8).map((i) => [`git${i}`, S[i]])),
    ...Object.fromEntries(range(8).map((i) => [`gitBranchLabel${i}`, blackOrWhite(S[i]!)])),
    ...Object.fromEntries(range(8).map((i) => [`gitInv${i}`, blackOrWhite(S[i]!)])),
    xyChart: {
      backgroundColor: sheet,
      ...named(['titleColor', 'xAxisLabelColor', 'xAxisTitleColor', 'yAxisLabelColor', 'yAxisTitleColor'], ink),
      ...named(['xAxisTickColor', 'xAxisLineColor', 'yAxisTickColor', 'yAxisLineColor'], soft),
      plotColorPalette: S.slice(0, 8).join(','),
    },
  };
}

test('black or white text reaches 4.58:1 on any fill', () => {
  expect(blackOrWhite('#ffffff')).toBe('#000000');
  expect(blackOrWhite('#000000')).toBe('#ffffff');
  const fills = ['#f96', '#767676', '#808080', ...LOOKS.flatMap(({ colors }) => seriesColors(colors))];
  for (const fill of fills) expect(contrastRatio(blackOrWhite(fill), fill), fill).toBeGreaterThanOrEqual(4.58);
});

test('each look gives twelve series colors in the order of the plan', () => {
  for (const { name, colors } of LOOKS) {
    const { keyword, string, function: fn, constant, removed } = colors.syntax;
    const first = [keyword, string, fn, constant, removed, colors.series.orange, colors.series.teal, colors.soft];
    const series = seriesColors(colors);
    expect(series, name).toEqual([...first, ...first.slice(0, 4).map((color) => halfway(color, colors.sheet))]);
    expect(new Set(series.map(sixDigits)).size, name).toBe(12);
  }
});

test("the theme tokens map to Mermaid's base theme in each look", () => {
  for (const { name, theme, mode, colors } of LOOKS) {
    const variables = themeVariables(colors, mode, theme.fonts.ui);
    expect(variables.primaryColor, name).toBe(colors.code);
    expect(variables.primaryTextColor, name).toBe(colors.ink);
    expect(variables.primaryBorderColor, name).toBe(colors.soft);
    expect(variables.lineColor, name).toBe(colors.soft);
    expect(variables.archEdgeColor, name).toBe(colors.soft);
    expect(variables.archGroupBorderColor, name).toBe(colors.soft);
    expect(variables.clusterBkg, name).toBe(colors.raise);
    expect(variables.noteBkgColor, name).toBe(colors.sel);
    expect(variables.noteTextColor, name).toBe(colors.selInk);
    expect(variables.edgeLabelBackground, name).toBe(colors.sheet);
    expect(variables.background, name).toBe(colors.sheet);
    expect(variables.darkMode, name).toBe(mode === 'dark');
    expect(variables.fontFamily, name).toBe(theme.fonts.ui);
  }
});

test('the variables are exactly the keys of the table, each with its token', () => {
  for (const { name, theme, mode, colors } of LOOKS) {
    expect(themeVariables(colors, mode, theme.fonts.ui), name).toEqual(expectedVariables(colors, mode, theme.fonts.ui));
  }
});

test('series take the twelve colors with black or white labels', () => {
  for (const { name, theme, mode, colors } of LOOKS) {
    const series = seriesColors(colors);
    const variables = themeVariables(colors, mode, theme.fonts.ui);
    expect(range(12).map((i) => variables[`pie${i + 1}`]), name).toEqual(series);
    expect(range(12).map((i) => variables[`cScale${i}`]), name).toEqual(series);
    expect(range(8).map((i) => variables[`git${i}`]), name).toEqual(series.slice(0, 8));
    expect(range(12).map((i) => variables[`cScaleLabel${i}`]), name).toEqual(series.map(blackOrWhite));
    expect(range(8).map((i) => variables[`gitBranchLabel${i}`]), name).toEqual(series.slice(0, 8).map(blackOrWhite));
    expect((variables.xyChart as Record<string, string>).plotColorPalette, name).toBe(series.slice(0, 8).join(','));
  }
});

test('no value names a CSS variable', () => {
  const NOT_COLORS = ['darkMode', 'fontFamily', 'fontSize', 'pieOpacity', 'xyChart'];
  for (const { name, theme, mode, colors } of LOOKS) {
    const variables = themeVariables(colors, mode, theme.fonts.ui);
    const chart = variables.xyChart as Record<string, string>;
    const strings = [...Object.values(variables), ...Object.values(chart)].filter((value) => typeof value === 'string');
    for (const value of strings) expect(value, name).not.toContain('var(');
    for (const [key, value] of Object.entries(variables)) {
      if (!NOT_COLORS.includes(key)) expect(value, `${name} ${key}`).toMatch(HEX);
    }
    for (const [key, value] of Object.entries(chart)) {
      for (const color of key === 'plotColorPalette' ? value.split(',') : [value]) expect(color, `${name} xyChart.${key}`).toMatch(HEX);
    }
  }
});
