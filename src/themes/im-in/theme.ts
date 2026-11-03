import { defineTheme } from '../types.ts';

const mono = '"JetBrains Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace';

export default defineTheme({
  id: 'im-in',
  name: "I'm in",
  fonts: {
    body: mono,
    head: `VT323, ${mono}`,
    mono,
    ui: mono,
  },
  faces: [
    { family: 'VT323', file: '@fontsource/vt323/files/vt323-latin-400-normal.woff2', weight: 400 },
    { family: 'JetBrains Mono', file: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', weight: 400 },
    { family: 'JetBrains Mono', file: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2', weight: 700 },
    {
      family: 'JetBrains Mono',
      file: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-italic.woff2',
      weight: 400,
      style: 'italic',
    },
  ],
  charWidth: 0.6,
  shape: {
    radius: '0px',
    thumbRadius: '0px',
    track: '1px dashed var(--line)',
    headWeight: 400,
    bodySize: '16px',
    lineHeight: 1.7,
  },
  // A light green screen with dark green text.
  light: {
    bg: '#dbe9d3',
    ink: '#0b3d1a',
    soft: '#3b6446',
    line: '#7fae88',
    sel: '#c7dcbd',
    selInk: '#082e13',
    raise: '#e9f3e3',
    code: '#dceccf',
    sheet: '#eef6e9',
    art: '#c4d9b9',
    levels: ['#00657d', '#1b6e30', '#7f5600', '#9b2577', '#3c4fb0'],
  },
  // A terminal at night: green text glows on black.
  dark: {
    bg: '#030703',
    ink: '#7dff9a',
    soft: '#3fa35b',
    line: '#2a7a40',
    sel: '#0f2a16',
    selInk: '#9dffb2',
    raise: '#061006',
    code: '#0b1a0d',
    sheet: '#030703',
    art: '#0e2614',
    levels: ['#5ee6ff', '#7dff9a', '#ffd166', '#ff8ae2', '#9fb4ff'],
  },
});
