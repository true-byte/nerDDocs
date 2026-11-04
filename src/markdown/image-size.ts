export interface ImageSize {
  width: number;
  height: number;
}

/** The bytes that the build reads first. */
export const HEAD_BYTES = 65536;

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) => b[i]! * 2 ** 24 + ((b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!);
const u32le = (b: Uint8Array, i: number) => u24le(b, i) + b[i + 3]! * 2 ** 24;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function png(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || b[0] !== 0x89 || ascii(b, 1, 3) !== 'PNG' || ascii(b, 12, 4) !== 'IHDR') return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function gif(b: Uint8Array): ImageSize | null {
  if (b.length < 10 || !/^GIF8[79]a$/.test(ascii(b, 0, 6))) return null;
  return { width: u16le(b, 6), height: u16le(b, 8) };
}

function webp(b: Uint8Array): ImageSize | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (chunk === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (chunk === 'VP8L' && b[20] === 0x2f) {
    const bits = u32le(b, 21);
    return { width: (bits & 0x3fff) + 1, height: (Math.floor(bits / 2 ** 14) & 0x3fff) + 1 };
  }
  return null;
}

/** The EXIF orientation of the data of an APP1 segment from `start` to `end`, or 1 when it has none. */
function orientation(b: Uint8Array, start: number, end: number): number {
  if (end > b.length || ascii(b, start, 4) !== 'Exif') return 1;
  const tiff = start + 6;
  const order = ascii(b, tiff, 2);
  if (order !== 'II' && order !== 'MM') return 1;
  const r16 = (i: number) => (order === 'II' ? u16le(b, i) : u16be(b, i));
  const r32 = (i: number) => (order === 'II' ? u32le(b, i) : u32be(b, i));
  const ifd = tiff + r32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const count = r16(ifd);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > end) break;
    if (r16(entry) === 0x0112) return r16(entry + 8);
  }
  return 1;
}

/** A marker with no length: TEM, RST0 to RST7 and SOI. */
const standalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
/** SOF0 to SOF15, without DHT (C4), JPG (C8) and DAC (CC). */
const isFrame = (marker: number) => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

function jpeg(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let at = 2;
  let turn = 1;
  while (at + 1 < b.length) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1]!;
    if (marker === 0xff) {
      at++;
      continue;
    }
    if (standalone(marker)) {
      at += 2;
      continue;
    }
    // The end of the image, or the image data, before a frame header.
    if (marker === 0xd9 || marker === 0xda || at + 4 > b.length) return null;
    const size = u16be(b, at + 2);
    // Only the Exif segment sets the turn. Another APP1 segment, such as XMP, keeps it.
    if (marker === 0xe1 && ascii(b, at + 4, 4) === 'Exif') turn = orientation(b, at + 4, at + 2 + size);
    if (isFrame(marker)) {
      if (at + 9 > b.length) return null;
      const height = u16be(b, at + 5);
      const width = u16be(b, at + 7);
      return turn >= 5 && turn <= 8 ? { width: height, height: width } : { width, height };
    }
    at += 2 + size;
  }
  return null;
}

const EM_PX = 16;

/** An SVG length in px. A length with no unit or with `px` counts as is, and `em` as 16 px. Other units count as none. */
function svgLength(value: string | undefined): number | null {
  const match = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*(px|em)?\s*$/i.exec(value ?? '');
  if (!match) return null;
  const length = Number(match[1]) * (match[2]?.toLowerCase() === 'em' ? EM_PX : 1);
  return length > 0 ? length : null;
}

function svg(b: Uint8Array): ImageSize | null {
  const text = new TextDecoder().decode(b);
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) return null;
  const attribute = (name: string) => {
    const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
    return match ? (match[1] ?? match[2]) : undefined;
  };
  const box = attribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const [, , boxWidth = 0, boxHeight = 0] = box?.length === 4 ? box : [];
  const ratio = boxWidth > 0 && boxHeight > 0 ? boxWidth / boxHeight : null;
  let width = svgLength(attribute('width'));
  let height = svgLength(attribute('height'));
  if (width && !height && ratio) height = width / ratio;
  if (height && !width && ratio) width = height * ratio;
  if (!width && !height && ratio) {
    width = boxWidth;
    height = boxHeight;
  }
  return width && height ? { width: Math.round(width), height: Math.round(height) } : null;
}

/** The size that the browser shows for these first bytes of a PNG, GIF, JPEG, WebP or SVG file, or null. */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  return png(bytes) ?? gif(bytes) ?? webp(bytes) ?? jpeg(bytes) ?? svg(bytes);
}

/** The size from the first `HEAD_BYTES` bytes, or from the whole file for a JPEG whose SOF marker sits past them. */
export function imageSizeOf(read: (length?: number) => Uint8Array): ImageSize | null {
  const head = read(HEAD_BYTES);
  const size = imageSize(head);
  if (size || head.length < HEAD_BYTES || head[0] !== 0xff || head[1] !== 0xd8) return size;
  return imageSize(read());
}
