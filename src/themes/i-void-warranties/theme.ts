import { defineTheme } from '../types.ts';

/** A circuit board: a solder mask with a dot grid, copper traces and pads, and a black chip as the slider thumb. */
export default defineTheme({
  id: 'i-void-warranties',
  name: 'I void warranties',
  fonts: {
    body: '"IBM Plex Sans", system-ui, sans-serif',
    head: '"Share Tech Mono", ui-monospace, monospace',
    mono: '"Share Tech Mono", ui-monospace, monospace',
    ui: '"Share Tech Mono", ui-monospace, monospace',
  },
  faces: [
    { family: 'IBM Plex Sans', file: '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2', weight: 400 },
    {
      family: 'IBM Plex Sans',
      file: '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-italic.woff2',
      weight: 400,
      style: 'italic',
    },
    { family: 'IBM Plex Sans', file: '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2', weight: 600 },
    { family: 'Share Tech Mono', file: '@fontsource/share-tech-mono/files/share-tech-mono-latin-400-normal.woff2', weight: 400 },
  ],
  charWidth: 0.434,
  shape: {
    radius: '2px',
    thumbRadius: '2px',
    track: '3px solid var(--line)',
    headWeight: 400,
    bodySize: '17px',
    lineHeight: 1.6,
  },
  // A white board: dark ink, copper that reads as text, and pale copper traces.
  light: {
    bg: '#e6ede4',
    ink: '#14231b',
    soft: '#4a5c51',
    line: '#9c5d1c',
    sel: '#d5e1d2',
    selInk: '#14231b',
    raise: '#f7faf5',
    code: '#e6ede4',
    sheet: '#fbfdf9',
    link: '#a14a12',
    art: '#cfa77c',
    levels: ['#94640a', '#21794a', '#1f69a8', '#a8366f', '#6248bb'],
    syntax: { keyword: '#b6206b', string: '#15791e', function: '#6620b6', constant: '#1d6ca5', added: '#157937', removed: '#b62520' },
    series: { orange: '#98551b', teal: '#157572' },
  },
  // A green board: white silkscreen ink, bright copper and LED colors for the levels.
  dark: {
    bg: '#0c4a36',
    ink: '#f2f6ee',
    soft: '#a9c9b4',
    line: '#d9a24a',
    sel: '#13573f',
    selInk: '#f2f6ee',
    raise: '#0a3d2c',
    code: '#0c4a36',
    sheet: '#0a3d2c',
    link: '#f0a36b',
    art: '#7d7a41',
    levels: ['#ffc24d', '#6fe39a', '#6cb8ff', '#ff86c8', '#bba4ff'],
    syntax: { keyword: '#f094c2', string: '#55e762', function: '#c49df1', constant: '#6cb5ea', added: '#55e786', removed: '#f09794' },
    series: { orange: '#e89f5e', teal: '#55e7e2' },
  },
});
