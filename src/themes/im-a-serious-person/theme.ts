import { defineTheme } from '../types.ts';

const figtree = (weight: number) => ({
  family: 'Figtree',
  file: `@fontsource/figtree/files/figtree-latin-${weight}-normal.woff2`,
  weight,
});
const sans = 'Figtree, system-ui, -apple-system, "Segoe UI", sans-serif';

export default defineTheme({
  id: 'im-a-serious-person',
  name: "I'm a serious person",
  fonts: {
    body: sans,
    head: sans,
    mono: '"JetBrains Mono", "Cascadia Mono", Menlo, Consolas, monospace',
    ui: sans,
  },
  faces: [
    figtree(400),
    figtree(500),
    figtree(600),
    figtree(700),
    { family: 'JetBrains Mono', file: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', weight: 400 },
  ],
  charWidth: 0.435,
  shape: {
    radius: '10px',
    thumbRadius: '9px',
    track: 'none',
    headWeight: 600,
    bodySize: '16px',
    lineHeight: 1.62,
  },
  // Light: a white card on soft grey.
  light: {
    bg: '#f5f5f7',
    ink: '#1d1d1f',
    soft: '#6e6e73',
    line: '#dddde3',
    sel: '#e8e8ed',
    selInk: '#1d1d1f',
    raise: '#ffffff',
    code: '#f5f5f7',
    sheet: '#ffffff',
    art: '#e8e8ed',
    levels: ['#2e7d5b', '#0a66c2', '#6a4fc4', '#b0560e', '#b3366b'],
    syntax: { keyword: '#b6206b', string: '#167e1f', function: '#6620b6', constant: '#1f72ad', added: '#167e39', removed: '#b62520' },
    series: { orange: '#a55c1d', teal: '#157976' },
  },
  // Dark: a deep grey card on a darker grey.
  dark: {
    bg: '#121214',
    ink: '#f2f2f5',
    soft: '#a1a1a8',
    line: '#313136',
    sel: '#2a2a2e',
    selInk: '#f2f2f5',
    raise: '#1c1c1f',
    code: '#121214',
    sheet: '#1c1c1f',
    art: '#2a2a2e',
    levels: ['#5fc19a', '#6cb2ff', '#a995f5', '#e79a5a', '#ee86b2'],
    syntax: { keyword: '#e7559e', string: '#55e762', function: '#a467e9', constant: '#55aae7', added: '#55e786', removed: '#e75a55' },
    series: { orange: '#e79955', teal: '#55e7e2' },
  },
});
