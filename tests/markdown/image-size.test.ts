import { expect, test } from '@playwright/test';
import { HEAD_BYTES, imageSize, imageSizeOf } from '../../src/markdown/image-size.ts';
import { gifHead, jpegHead, pngFile, svgImage, webpHead } from '../support/images.ts';

const text = (value: string) => new TextEncoder().encode(value);
const svgSize = (attributes: string) => imageSize(text(svgImage(attributes)));

test('a PNG gives the size of its header', () => {
  expect(imageSize(pngFile(1280, 720))).toEqual({ width: 1280, height: 720 });
  expect(imageSize(pngFile(1280, 720).subarray(0, 23))).toBeNull();
});

test('a GIF of either version gives its screen size', () => {
  expect(imageSize(gifHead(16, 24, '87a'))).toEqual({ width: 16, height: 24 });
  expect(imageSize(gifHead(16, 24, '89a'))).toEqual({ width: 16, height: 24 });
});

test('a WebP of each kind gives its canvas size', () => {
  expect(imageSize(webpHead('VP8 ', 801, 403))).toEqual({ width: 801, height: 403 });
  expect(imageSize(webpHead('VP8L', 333, 222))).toEqual({ width: 333, height: 222 });
  expect(imageSize(webpHead('VP8X', 640, 401))).toEqual({ width: 640, height: 401 });
});

test('a JPEG gives the size of its first SOF, past a DHT and fill bytes', () => {
  expect(imageSize(jpegHead(1366, 768))).toEqual({ width: 1366, height: 768 });
  expect(imageSize(jpegHead(1366, 768, { sof: 0xc2 }))).toEqual({ width: 1366, height: 768 });
  // A DHT segment, whose marker C4 sits among the SOF markers, then one fill byte FF before the marker of the frame.
  const dht = [0xff, 0xc4, 0x00, 0x05, 0x00, 0x00, 0x00, 0xff];
  expect(imageSize(jpegHead(1366, 768, { beforeSof: dht }))).toEqual({ width: 1366, height: 768 });
});

test('an EXIF orientation from 5 to 8 swaps the sides', () => {
  expect(imageSize(jpegHead(1366, 768, { orientation: 6, order: 'MM' }))).toEqual({ width: 768, height: 1366 });
  expect(imageSize(jpegHead(1366, 768, { orientation: 8, order: 'II' }))).toEqual({ width: 768, height: 1366 });
  expect(imageSize(jpegHead(1366, 768, { orientation: 3 }))).toEqual({ width: 1366, height: 768 });
});

test('an XMP segment after the EXIF segment keeps the turn', () => {
  const xmp = [...new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>')];
  const segment = [0xff, 0xe1, (xmp.length + 2) >> 8, (xmp.length + 2) & 0xff, ...xmp];
  expect(imageSize(jpegHead(1366, 768, { orientation: 6, beforeSof: segment }))).toEqual({ width: 768, height: 1366 });
});

test('an SVG gives its px size, its em size or its viewBox', () => {
  expect(svgSize('width="420" height="180"')).toEqual({ width: 420, height: 180 });
  expect(svgSize('width="420px" height="180px"')).toEqual({ width: 420, height: 180 });
  expect(svgSize('width="20em" height="5em"')).toEqual({ width: 320, height: 80 });
  expect(svgSize('viewBox="0 0 800 200"')).toEqual({ width: 800, height: 200 });
  expect(svgSize('width="500" viewBox="0 0 800 200"')).toEqual({ width: 500, height: 125 });
  expect(svgSize('height="100" viewBox="0 0 800 200"')).toEqual({ width: 400, height: 100 });
  expect(svgSize('width="100%" height="100%" viewBox="0 0 800 200"')).toEqual({ width: 800, height: 200 });
  expect(svgSize('width="420.6" height="180"')).toEqual({ width: 421, height: 180 });
});

test('an SVG after an XML line and a comment is found', () => {
  const file = `<?xml version="1.0"?>\n<!-- Restore window -->\n${svgImage('width="420" height="180"')}`;
  expect(imageSize(text(file))).toEqual({ width: 420, height: 180 });
});

test('an SVG with no size and no viewBox, and bytes of no type, give null', () => {
  expect(imageSize(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  expect(imageSize(new Uint8Array())).toBeNull();
  expect(imageSize(text('restore'))).toBeNull();
});

/** A reader of the file that notes each length asked for. */
function readerOf(bytes: Uint8Array) {
  const asked: (number | undefined)[] = [];
  const read = (length?: number) => {
    asked.push(length);
    return length === undefined ? bytes : bytes.subarray(0, length);
  };
  return { asked, read };
}

test('a JPEG whose SOF sits past the first 64 KB is read whole', () => {
  expect(HEAD_BYTES).toBe(65536);
  const jpeg = readerOf(jpegHead(1366, 768, { fill: 70000 }));
  expect(imageSizeOf(jpeg.read)).toEqual({ width: 1366, height: 768 });
  expect(jpeg.asked).toEqual([65536, undefined]);

  const png = readerOf(pngFile(1280, 720));
  expect(imageSizeOf(png.read)).toEqual({ width: 1280, height: 720 });
  expect(png.asked).toEqual([65536]);
});
