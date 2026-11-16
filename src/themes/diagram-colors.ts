import { contrastRatio } from './contrast.ts';
import type { Colors, Mode } from './types.ts';

/** The theme colors that a Mermaid diagram takes. */
export type DiagramColors = Pick<
  Colors,
  'ink' | 'soft' | 'line' | 'sel' | 'selInk' | 'raise' | 'code' | 'sheet' | 'syntax' | 'series'
>;

const BLACK = '#000000';
const WHITE = '#ffffff';

/** Black or white, whichever has the higher contrast ratio on the fill, #rgb or #rrggbb. Black on a tie. */
export function blackOrWhite(fill: string): '#000000' | '#ffffff' {
  return contrastRatio(WHITE, fill) > contrastRatio(BLACK, fill) ? WHITE : BLACK;
}

function channels(hex: string): [number, number, number] {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16)) as [number, number, number];
}

/** The color halfway between two hex colors, as #rrggbb in lower case. */
function halfway(a: string, b: string): string {
  const [from, to] = [channels(a), channels(b)];
  return `#${from.map((channel, at) => Math.round((channel + to[at]!) / 2).toString(16).padStart(2, '0')).join('')}`;
}

/** The 12 series colors: keyword, string, function, constant, removed, orange, teal and soft, then the first four mixed halfway toward sheet. */
export function seriesColors(colors: DiagramColors): string[] {
  const { syntax, series } = colors;
  const first = [syntax.keyword, syntax.string, syntax.function, syntax.constant];
  return [...first, syntax.removed, series.orange, series.teal, colors.soft, ...first.map((color) => halfway(color, colors.sheet))];
}

const each = (names: readonly string[], value: string) => names.map((name): [string, string] => [name, value]);
const range = (count: number) => [...Array(count).keys()];

/** The theme variables of Mermaid's 'base' theme for one look. Every color value is a hex color. */
export function themeVariables(
  colors: DiagramColors,
  mode: Mode,
  uiFont: string,
): Record<string, string | boolean | Record<string, string>> {
  const { ink, soft, line, sel, selInk, raise, code, sheet } = colors;
  const series = seriesColors(colors);
  const at = (index: number) => series[index]!;
  const quadrants = range(4).map((index) => `quadrant${index + 1}TextFill`);
  return {
    darkMode: mode === 'dark',
    fontFamily: uiFont,
    fontSize: '15px',
    ...Object.fromEntries([
      ...each(['background', 'edgeLabelBackground', 'altSectionBkgColor', 'pieStrokeColor', 'commitLabelBackground'], sheet),
      ...each(
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
      ...each(
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
          ...quadrants,
          'quadrantPointTextFill',
          'quadrantXAxisTextFill',
          'quadrantYAxisTextFill',
          'quadrantTitleFill',
        ],
        ink,
      ),
      ...each(
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
      ...each(
        ['secondaryColor', 'noteBkgColor', 'activationBkgColor', 'activeTaskBkgColor', 'critBkgColor', 'tagLabelBackground'],
        sel,
      ),
      ...each(['secondaryTextColor', 'noteTextColor', 'tagLabelColor'], selInk),
      ...each(
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
      ['gridColor', line],
      ...each(['critBorderColor', 'todayLineColor'], colors.syntax.removed),
      ['sequenceNumberColor', blackOrWhite(soft)],
      // The page sets the text of each slice after the draw, by the fill of its slice.
      ['pieSectionTextColor', BLACK],
      ['pieOpacity', '1'],
      ['quadrantPointFill', at(0)],
      ...range(12).flatMap((index): [string, string][] => [
        [`pie${index + 1}`, at(index)],
        [`cScale${index}`, at(index)],
        [`cScaleLabel${index}`, blackOrWhite(at(index))],
        [`cScalePeer${index}`, soft],
        [`fillType${index}`, index % 2 ? raise : code],
      ]),
      ...range(8).flatMap((index): [string, string][] => [
        [`git${index}`, at(index)],
        [`gitBranchLabel${index}`, blackOrWhite(at(index))],
        [`gitInv${index}`, blackOrWhite(at(index))],
      ]),
    ]),
    xyChart: {
      backgroundColor: sheet,
      titleColor: ink,
      xAxisLabelColor: ink,
      xAxisTitleColor: ink,
      yAxisLabelColor: ink,
      yAxisTitleColor: ink,
      xAxisTickColor: soft,
      xAxisLineColor: soft,
      yAxisTickColor: soft,
      yAxisLineColor: soft,
      plotColorPalette: series.slice(0, 8).join(','),
    },
  };
}
