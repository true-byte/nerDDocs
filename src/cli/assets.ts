import css from '../../dist/client/app.css?raw';
import js from '../../dist/client/app.js?raw';
import type { AssetName } from '../page/page-html.tsx';

/** The page script and style, built first and held inside the one command file. */
export const assets: Record<AssetName, string> = { 'app.js': js, 'app.css': css };
