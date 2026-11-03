import { DEFAULT_THEME } from './index.ts';
import type { Colors, FontFace, Mode, Theme } from './types.ts';

/** The name of a face file, which is also its address under `fonts/` next to `app.css`. */
export function faceFileName(face: FontFace): string {
  return face.file.slice(face.file.lastIndexOf('/') + 1);
}

function tokens(theme: Theme, mode: Mode): string {
  const colors: Colors = theme[mode];
  const { fonts, shape } = theme;
  const list: [string, string | number][] = [
    ['--bg', colors.bg],
    ['--ink', colors.ink],
    ['--soft', colors.soft],
    ['--line', colors.line],
    ['--sel', colors.sel],
    ['--sel-ink', colors.selInk],
    ['--raise', colors.raise],
    ['--code', colors.code],
    ['--sheet', colors.sheet],
    ['--art', colors.art],
    ...colors.levels.map((color, stop): [string, string] => [`--l${stop}`, color]),
    ['--body', fonts.body],
    ['--head', fonts.head],
    ['--mono', fonts.mono],
    ['--ui', fonts.ui],
    ['--r', shape.radius],
    ['--thumb-r', shape.thumbRadius],
    ['--track', shape.track],
    ['--head-w', shape.headWeight],
    ['--body-size', shape.bodySize],
    ['--lh', shape.lineHeight],
    ['--char-w', `${theme.charWidth}em`],
    ['color-scheme', mode],
  ];
  return list.map(([name, value]) => `${name}: ${value}`).join('; ');
}

function fontFaceRule(face: FontFace): string {
  return (
    `@font-face { font-family: ${JSON.stringify(face.family)}; font-style: ${face.style ?? 'normal'}; ` +
    `font-weight: ${face.weight}; font-display: swap; src: url("fonts/${faceFileName(face)}") format("woff2") }`
  );
}

/**
 * The tokens of each theme, for the page and for its chip in the theme box, and an `@font-face` for each face.
 * The dark tokens hold where `data-mode="dark"` sits next to `data-theme`. The default theme also holds for a page
 * with no `data-theme`, a page with scripts off, which follows the computer's look.
 */
export function themeCss(themes: readonly Theme[]): string {
  const rules: string[] = [];
  for (const theme of themes) {
    const id = JSON.stringify(theme.id);
    const page = `:root[data-theme=${id}]`;
    const chip = `.sw [data-theme=${id}]`;
    const isDefault = theme.id === DEFAULT_THEME;
    const light = [page, ...(isDefault ? [':root:not([data-theme])'] : []), chip].join(', ');
    rules.push(`${light} { ${tokens(theme, 'light')} }`);
    rules.push(`${page}[data-mode="dark"], ${chip}[data-mode="dark"] { ${tokens(theme, 'dark')} }`);
    if (isDefault) rules.push(`@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) { ${tokens(theme, 'dark')} }\n}`);
  }
  const faces = new Set(themes.flatMap((theme) => theme.faces.map(fontFaceRule)));
  return [...rules, ...faces].join('\n') + '\n';
}
