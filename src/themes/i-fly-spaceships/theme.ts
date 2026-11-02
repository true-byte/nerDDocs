import { defineTheme } from '../types.ts';

export default defineTheme({
  id: 'i-fly-spaceships',
  name: 'I fly spaceships',
  fonts: {
    body: 'Saira, "Segoe UI", sans-serif',
    head: '"Saira Condensed", "Arial Narrow", sans-serif',
    mono: '"JetBrains Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace',
    ui: '"Saira Condensed", "Arial Narrow", sans-serif',
  },
  faces: [
    { family: 'Saira', file: '@fontsource/saira/files/saira-latin-300-normal.woff2', weight: 300 },
    { family: 'Saira', file: '@fontsource/saira/files/saira-latin-400-normal.woff2', weight: 400 },
    { family: 'Saira', file: '@fontsource/saira/files/saira-latin-600-normal.woff2', weight: 600 },
    { family: 'Saira Condensed', file: '@fontsource/saira-condensed/files/saira-condensed-latin-200-normal.woff2', weight: 200 },
    { family: 'Saira Condensed', file: '@fontsource/saira-condensed/files/saira-condensed-latin-400-normal.woff2', weight: 400 },
    { family: 'Saira Condensed', file: '@fontsource/saira-condensed/files/saira-condensed-latin-600-normal.woff2', weight: 600 },
    { family: 'JetBrains Mono', file: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', weight: 400 },
  ],
  shape: {
    radius: '2px',
    thumbRadius: '50%',
    track: '1.5px solid var(--line)',
    headWeight: 600,
    bodySize: '17px',
    lineHeight: 1.68,
  },
  // The console in daylight: pale sky, a white sheet, navy ink and dark amber.
  light: {
    bg: '#dcebfa',
    ink: '#0d1f45',
    soft: '#465b82',
    line: '#9db6d6',
    sel: '#d3e3f6',
    selInk: '#8a4f00',
    raise: '#f5f9fe',
    code: '#eaf2fb',
    sheet: '#ffffff',
    art: '#9fbbe0',
    levels: ['#0a6aa8', '#a15c00', '#11805a', '#b83a3a', '#6a4bc4'],
  },
  // The console at night: deep space, ice-blue ink and amber.
  dark: {
    bg: '#050a18',
    ink: '#d7e6ff',
    soft: '#7f96bd',
    line: '#2d4670',
    sel: '#0d1a38',
    selInk: '#ffb547',
    raise: '#08112a',
    code: '#0b1630',
    sheet: '#070d1f',
    art: '#2d4670',
    levels: ['#7cc8ff', '#ffb547', '#7ee0b0', '#ff8f8f', '#b9a4ff'],
  },
});
