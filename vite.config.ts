import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { readFonts } from './src/server/fonts.ts';
import { themeCss } from './src/themes/css.ts';
import { THEMES } from './src/themes/index.ts';

const commandFile = 'dist/nerddocs.cjs';
const FONTS_MODULE = 'virtual:nerddocs-fonts';

/**
 * Puts the tokens and the `@font-face` rules of every theme first in `app.css`. Vite leaves their font addresses as they
 * are. The tokens sit in a layer, so the style `nd-width` of the head script, a plain `:root` rule, wins over the
 * `--char-w` of a theme.
 */
const themeTokens: Plugin = {
  name: 'theme-tokens',
  enforce: 'post',
  generateBundle(_, bundle) {
    const css = bundle['app.css'];
    if (css?.type !== 'asset') throw new Error('The client build wrote no app.css.');
    css.source = `@layer nd-theme {\n${themeCss(THEMES)}}\n` + String(css.source);
  },
};

/** Writes the face files of every theme into the command file, since the command installs nothing. */
const fontFiles: Plugin = {
  name: 'font-files',
  resolveId: (id) => (id === FONTS_MODULE ? `\0${FONTS_MODULE}` : undefined),
  load(id) {
    if (id !== `\0${FONTS_MODULE}`) return;
    const { files, licenses } = readFonts(THEMES, join(import.meta.dirname, 'node_modules'));
    const entries = Object.entries(files).map(
      ([name, data]) => `${JSON.stringify(name)}: file(${JSON.stringify(Buffer.from(data).toString('base64'))})`,
    );
    return (
      `const file = (text) => Buffer.from(text, 'base64');\n` +
      `export default { files: { ${entries.join(', ')} }, licenses: ${JSON.stringify(licenses)} };\n`
    );
  },
};

export default defineConfig(({ mode }) =>
  mode === 'client'
    ? {
        // The page loads this as one classic script, so it also runs from disk.
        define: { 'process.env.NODE_ENV': '"production"' },
        build: {
          outDir: 'dist/client',
          lib: {
            entry: 'src/page/client.tsx',
            formats: ['iife'],
            name: 'nerddocs',
            fileName: () => 'app.js',
            cssFileName: 'app',
          },
        },
        plugins: [themeTokens],
      }
    : {
        // One file with every dependency inside it, so the command installs nothing.
        define: { 'process.env.NODE_ENV': '"production"' },
        ssr: { noExternal: true, target: 'node' },
        build: {
          ssr: 'src/cli/main.ts',
          outDir: 'dist',
          emptyOutDir: false,
          minify: true,
          rollupOptions: {
            output: {
              format: 'cjs',
              entryFileNames: 'nerddocs.cjs',
              banner: '#!/usr/bin/env node',
            },
          },
        },
        plugins: [
          fontFiles,
          {
            name: 'executable-command',
            closeBundle() {
              chmodSync(commandFile, 0o755);
            },
          },
        ],
      },
);
