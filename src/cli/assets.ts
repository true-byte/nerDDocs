import css from '../../dist/client/app.css?raw';
import js from '../../dist/client/app.js?raw';
import builtDiagrams from 'virtual:nerddocs-diagrams';
import builtFonts from 'virtual:nerddocs-fonts';
import type { AssetName } from '../page/page-html.tsx';
import type { DiagramBuilds } from '../server/diagram-builds.ts';
import type { FontFiles } from '../server/fonts.ts';

/** The page script and style, built first and held inside the one command file. */
export const assets: Record<AssetName, string> = { 'app.js': js, 'app.css': css };

/** The font files of the themes, read from `node_modules` at build time and held inside the one command file. */
export const fonts: FontFiles = builtFonts;

/** The two Mermaid builds and the licenses of what they bundle, held inside the one command file. */
export const diagrams: DiagramBuilds = builtDiagrams;
