export type Mode = 'light' | 'dark';

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
}

export interface FontFace {
  /** The name that the font stacks use, such as 'VT323'. */
  family: string;
  /** A woff2 file of an installed package, such as '@fontsource/vt323/files/vt323-latin-400-normal.woff2'. */
  file: string;
  weight: number;
  style?: 'normal' | 'italic';
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
