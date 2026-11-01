import { chmodSync } from 'node:fs';
import { defineConfig } from 'vite';

const commandFile = 'dist/nerddocs.cjs';

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
          {
            name: 'executable-command',
            closeBundle() {
              chmodSync(commandFile, 0o755);
            },
          },
        ],
      },
);
