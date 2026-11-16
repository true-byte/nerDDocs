import { defineTheme } from '../types.ts';

const MONO = '"Cascadia Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace';

export default defineTheme({
  id: 'i-love-msdos',
  name: 'I love MSDOS',
  fonts: {
    body: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    head: MONO,
    mono: MONO,
    ui: MONO,
  },
  faces: [],
  charWidth: 0.44,
  shape: {
    radius: '0px',
    thumbRadius: '0px',
    track: '3px double var(--ink)',
    headWeight: 800,
    bodySize: '17px',
    lineHeight: 1.55,
  },
  // The grey dialogs of DOS programs: black text, DOS blue for quiet text and the selection bar.
  light: {
    bg: '#c8c8c8',
    ink: '#000000',
    soft: '#0000aa',
    line: '#6e6e6e',
    sel: '#0000aa',
    selInk: '#ffffff',
    raise: '#b8b8b8',
    code: '#b8b8b8',
    sheet: '#c8c8c8',
    link: '#0000aa',
    art: '#6e6e6e',
    levels: ['#704400', '#006400', '#006070', '#8b008b', '#9a2a00'],
    syntax: { keyword: '#86184f', string: '#0f5214', function: '#5f1ea9', constant: '#144a71', added: '#0f5225', removed: '#8b1c18' },
    series: { orange: '#683a12', teal: '#0e4e4c' },
  },
  // The DOS blue screen: light grey text, a light grey selection bar and the bright DOS colors for the levels.
  dark: {
    bg: '#0000aa',
    ink: '#e8e8e8',
    soft: '#b9c0e8',
    line: '#7e86d6',
    sel: '#e8e8e8',
    selInk: '#0000aa',
    raise: '#000080',
    code: '#000080',
    sheet: '#0000aa',
    link: '#ffffff',
    art: '#7e86d6',
    levels: ['#ffff55', '#55ff55', '#55ffff', '#ff88ff', '#ffb366'],
    syntax: { keyword: '#ffff55', string: '#55ff55', function: '#55ffff', constant: '#ff88ff', added: '#55e786', removed: '#ff8888' },
    series: { orange: '#ffaa55', teal: '#aaaaff' },
  },
});
