export type Mode = 'light' | 'dark';

/** The colors of code tokens. Comments take `soft`, and every other token takes `ink`. */
export interface SyntaxColors {
  /** `--sx-k` */
  keyword: string;
  /** `--sx-s` */
  string: string;
  /** `--sx-f` */
  function: string;
  /** `--sx-n`: numbers and other constants. */
  constant: string;
  /** `--sx-i`: the added lines of a diff. */
  added: string;
  /** `--sx-d`: the removed lines of a diff. */
  removed: string;
}

/** Two colors for the series of a diagram, after keyword, string, function, constant and removed. */
export interface SeriesColors {
  /** `--sx-o` */
  orange: string;
  /** `--sx-t` */
  teal: string;
}

/** Every color is a hex color, #rgb or #rrggbb, so the tests can check its contrast. */
export interface Colors {
  /** The page background, behind the art. */
  bg: string;
  /** Text. */
  ink: string;
  /** Quiet text: times, labels, the tree. */
  soft: string;
  /** Borders and the slider track. */
  line: string;
  /** The background of the current tree row and of pressed buttons. */
  sel: string;
  /** Text on `sel`. */
  selInk: string;
  /** Panels, the bar, boxes and dialogs. */
  raise: string;
  /** The background of code. */
  code: string;
  /** The solid area behind the text column. */
  sheet: string;
  /** The color that `look.css` may paint art with. */
  art: string;
  /** The level colors `--l0` to `--l4`. */
  levels: [string, string, string, string, string];
  /** Each with a contrast ratio of at least 4.5 on `code` and on `sheet`. The six differ from each other and from `ink`. */
  syntax: SyntaxColors;
  /** Each with a contrast ratio of at least 4.5 on `code` and on `sheet`. */
  series: SeriesColors;
}

export interface FontFace {
  /** The name that the font stacks use, such as 'VT323'. */
  family: string;
  /** A woff2 file of an installed package, such as '@fontsource/vt323/files/vt323-latin-400-normal.woff2'. */
  file: string;
  weight: number;
  style?: 'normal' | 'italic';
  /** The characters that the file serves, as CSS `unicode-range` writes them. With none, it serves every character. */
  unicodeRange?: string;
}

export interface Theme {
  /** The folder name. */
  id: string;
  /** The name in the theme box. */
  name: string;
  /** CSS font stacks, each ending in a generic family. */
  fonts: { body: string; head: string; mono: string; ui: string };
  /** The font files that the stacks need, empty for system fonts only. */
  faces: FontFace[];
  /**
   * `--char-w`: the average width of a character of the body font in English text, in em. A page with no script takes
   * the text width from it. In a theme with `faces`, the first page that a browser opens in the theme also takes it
   * until the page script runs. The page measures the font as it renders and corrects it.
   */
  charWidth: number;
  shape: {
    /** `--r` */
    radius: string;
    /** `--thumb-r` */
    thumbRadius: string;
    /** `--track`, a border shorthand such as '1px solid var(--line)'. */
    track: string;
    /** `--head-w` */
    headWeight: number;
    /** `--body-size` */
    bodySize: string;
    /** `--lh` */
    lineHeight: number;
  };
  light: Colors;
  dark: Colors;
}

/** Gives a theme file its type, so the editor checks each key. */
export function defineTheme(theme: Theme): Theme {
  return theme;
}
