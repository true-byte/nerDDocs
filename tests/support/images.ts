import { posix } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import type { FolderFile, PageFiles } from '../../src/markdown/embed.ts';
import type { FileContent } from './folder.ts';
import { THREE_LEVELS } from './levels.ts';
import { STEPS } from './page-content.ts';

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

function concat(parts: Uint8Array[]): Uint8Array {
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}

function u32be(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concat([ascii(type), data]);
  return concat([u32be(data.length), typed, u32be(crc32(typed))]);
}

const pngs = new Map<string, Uint8Array>();

/** A PNG of one color that Chromium draws, at this size. */
export function pngFile(width: number, height: number): Uint8Array {
  const key = `${width}x${height}`;
  const made = pngs.get(key);
  if (made) return made;
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  // 8 bits for each of red, green and blue.
  header[8] = 8;
  header[9] = 2;
  const row = new Uint8Array(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([0x2b, 0x6c, 0xa3], 1 + x * 3);
  const pixels = new Uint8Array(row.length * height);
  for (let y = 0; y < height; y++) pixels.set(row, y * row.length);
  const png = concat([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', new Uint8Array())]);
  pngs.set(key, png);
  return png;
}

/** The first bytes of a GIF: its signature and its screen size. */
export function gifHead(width: number, height: number, version: '87a' | '89a' = '89a'): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set(ascii(`GIF${version}`));
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

/** The first bytes of a WebP file whose first chunk is of the given kind. */
export function webpHead(kind: 'VP8 ' | 'VP8L' | 'VP8X', width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set(ascii('RIFF'));
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(ascii('WEBP'), 8);
  bytes.set(ascii(kind), 12);
  view.setUint32(16, bytes.length - 20, true);
  if (kind === 'VP8 ') {
    // A key frame tag, the start code, then each side in 14 bits.
    bytes.set([0x9d, 0x01, 0x2a], 23);
    view.setUint16(26, width, true);
    view.setUint16(28, height, true);
  } else if (kind === 'VP8L') {
    bytes[20] = 0x2f;
    view.setUint32(21, (height - 1) * 2 ** 14 + (width - 1), true);
  } else {
    view.setUint16(24, (width - 1) & 0xffff, true);
    bytes[26] = (width - 1) >> 16;
    view.setUint16(27, (height - 1) & 0xffff, true);
    bytes[29] = (height - 1) >> 16;
  }
  return bytes;
}

export interface JpegOptions {
  /** The marker of the frame: `0xc0` for a baseline JPEG, `0xc2` for a progressive one. */
  sof?: number;
  /** The EXIF orientation, from 1 to 8, in an APP1 segment. With none, the file has no APP1 segment. */
  orientation?: number;
  /** The byte order of the EXIF data: 'MM' for big-endian, 'II' for little-endian. */
  order?: 'MM' | 'II';
  /** Bytes of APP2 segments between the EXIF segment and the frame, to push the frame further into the file. */
  fill?: number;
  /** Raw bytes right before the frame marker, such as a DHT segment and an `FF` fill byte. */
  beforeSof?: number[];
}

/** The first bytes of a JPEG, up to and with its frame header, which holds the size. */
export function jpegHead(width: number, height: number, options: JpegOptions = {}): Uint8Array {
  const { sof = 0xc0, orientation, order = 'MM', fill = 0, beforeSof = [] } = options;
  const parts: Uint8Array[] = [Uint8Array.from([0xff, 0xd8])];
  if (orientation !== undefined) {
    const little = order === 'II';
    // 'Exif' and two zeros, the TIFF header, then one IFD with one entry and no next IFD.
    const exif = new Uint8Array(6 + 8 + 2 + 12 + 4);
    const view = new DataView(exif.buffer);
    exif.set(ascii('Exif'));
    exif.set(ascii(order), 6);
    view.setUint16(8, 42, little);
    view.setUint32(10, 8, little);
    view.setUint16(14, 1, little);
    view.setUint16(16, 0x0112, little);
    view.setUint16(18, 3, little);
    view.setUint32(20, 1, little);
    view.setUint16(24, orientation, little);
    parts.push(Uint8Array.from([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff]), exif);
  }
  for (let left = fill; left > 0; ) {
    const size = Math.min(left, 0xffff - 2);
    parts.push(Uint8Array.from([0xff, 0xe2, (size + 2) >> 8, (size + 2) & 0xff]), new Uint8Array(size));
    left -= size;
  }
  parts.push(Uint8Array.from(beforeSof));
  // The frame header of 3 components: its length, the precision, the height, the width, then each component.
  const frame = [0xff, sof, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03];
  parts.push(Uint8Array.from([...frame, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]));
  return concat(parts);
}

/** An SVG file with the given attributes on its `<svg>` tag, which fills its box with one color. */
export const svgImage = (attributes: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}><rect width="100%" height="100%" fill="#2b6ca3"/></svg>`;

/** A `PageFiles` over a map of files, which notes each path that the build asks for. */
export interface FakeFiles extends PageFiles {
  /** The paths given to `find`, in order. */
  asked: string[];
}

/** The files of a docs folder, by their path in the folder, as the build of the page `page` sees them. */
export function fakeFiles(
  files: Record<string, { bytes: string | Uint8Array; version: number }>,
  page = 'restore.md',
  folder = '/home/ana/docs',
): FakeFiles {
  const asked: string[] = [];
  return {
    page,
    asked,
    fullPath: (path) => posix.join(folder, path),
    find(path): FolderFile | null {
      asked.push(path);
      const file = Object.hasOwn(files, path) ? files[path] : undefined;
      if (!file) return null;
      const bytes = typeof file.bytes === 'string' ? new TextEncoder().encode(file.bytes) : file.bytes;
      return { version: file.version, bytes: (length) => (length === undefined ? bytes : bytes.subarray(0, length)) };
    },
  };
}

/** The light and dark copies of 'Restore window', in the `<picture>` form that GitHub documents. */
export function pairPicture({ dark = 'restore-window-dark.png', light = 'restore-window-light.png', alt = 'Restore window' } = {}): string {
  return `<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="${dark}">\n  <img alt="${alt}" src="${light}">\n</picture>`;
}

/** The `<picture>` of the plan: 'Restore window' in a light and a dark copy. */
export const PLAN_PICTURE = pairPicture();

/** The PNG files of the light and dark copies of 'Restore window', which differ in height. */
export const PAIR_FILES: Record<string, FileContent> = {
  'restore-window-light.png': pngFile(1280, 720),
  'restore-window-dark.png': pngFile(1280, 800),
};

/**
 * The page 'Restore a file' with images: the pair 'Restore window' between steps, the small image 'Restore' in a line
 * of text, the image 'Schedules window' in a link, and the image 'Search index' at 'Internals'.
 */
export const IMAGES_PAGE = `# Restore a file

${STEPS}

${PLAN_PICTURE}

${STEPS}

Click ![Restore](restore-button.png) to start.

[![Schedules window](schedules-window.png)](schedules.md)

::: internals
![Search index](search-index.png)
:::

${STEPS}
`;

/** 'Restore a file' with images, and 'Schedules', at three levels. */
export const IMAGES_SITE: Record<string, FileContent> = {
  'nerddocs.json': THREE_LEVELS,
  'schedules.md': '# Schedules\n\nA plan says how often.\n',
  'restore.md': IMAGES_PAGE,
  ...PAIR_FILES,
  'restore-button.png': pngFile(24, 24),
  'schedules-window.png': pngFile(640, 360),
  'search-index.png': pngFile(800, 400),
};
