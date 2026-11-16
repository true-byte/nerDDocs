import { local, read, remove, write } from './panel-state.ts';
import {
  CHAR_KEY,
  CHAR_SAMPLE,
  parseWidth,
  storedCharWidth,
  storedWidth,
  WIDTH_KEY,
  withCharWidth,
  type Span,
  type Width,
} from './text-width.ts';
import { themeById } from '../themes/index.ts';
import { shownTheme } from './theme-memory.ts';

/** The narrowest column, which a window of 320 px holds (WCAG 1.4.10). */
const COLUMN_MIN_PX = 288;
/** Two measures of a character width closer than this are the same. */
const SAME_EM = 0.0005;

const px = (value: string) => parseFloat(value) || 0;
const column = () => document.querySelector<HTMLElement>('.col');

export function readWidth(): Width {
  return parseWidth(read(local, WIDTH_KEY));
}

export function writeWidth(width: Width): void {
  const text = storedWidth(width);
  if (text === null) remove(local, WIDTH_KEY);
  else write(local, WIDTH_KEY, text);
}

/**
 * Shows a width on the page. page.css makes the text `--text-chars` times `--char-w` wide, and 'full' fills the free
 * space. The values on `<html>` win over the style `nd-width` of the head script.
 */
export function showWidth(width: Width, defaultChars: number): void {
  const root = document.documentElement;
  if (width === 'full') root.setAttribute('data-width', 'full');
  else root.removeAttribute('data-width');
  root.style.setProperty('--text-chars', String(typeof width === 'number' ? width : defaultChars));
  column()?.style.setProperty('--text-default', String(defaultChars));
}

/** The character width that the page shows now, in em. */
function shownCharEm(): number {
  return px(getComputedStyle(document.documentElement).getPropertyValue('--char-w'));
}

/** The average width of a character of the body font as the text renders it, in em. */
function measureCharEm(): number | null {
  const page = document.getElementById('page');
  if (!page) return null;
  const probe = document.createElement('p');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute;left:0;top:0;width:max-content;margin:0;padding:0;white-space:nowrap;visibility:hidden;pointer-events:none';
  probe.textContent = CHAR_SAMPLE;
  page.append(probe);
  const width = probe.getBoundingClientRect().width;
  const size = px(getComputedStyle(probe).fontSize);
  probe.remove();
  return width > 0 && size > 0 ? Math.round((width / CHAR_SAMPLE.length / size) * 10000) / 10000 : null;
}

const drawers = new Set<() => void>();

/** Runs `draw` after each change of the character width. Gives the function that stops it. */
export function onCharWidth(draw: () => void): () => void {
  drawers.add(draw);
  return () => drawers.delete(draw);
}

/**
 * Measures the body font of the theme that shows, and gives the character width that the text needs, or null when
 * the text already has it. While a font of the page still loads, the measure is of a font that stands in for it: the
 * page then takes the width stored for the theme, or else the `charWidth` of the theme, and stores none until the
 * font loads.
 */
export function nextCharWidth(): number | null {
  const measured = measureCharEm();
  const loading = typeof document.fonts !== 'undefined' && document.fonts.status === 'loading';
  const theme = shownTheme();
  if (measured && !loading) write(local, CHAR_KEY, withCharWidth(read(local, CHAR_KEY), theme, measured));
  const em = loading ? (storedCharWidth(read(local, CHAR_KEY), theme) ?? themeById(theme)?.charWidth) : measured;
  return em && Math.abs(em - shownCharEm()) >= SAME_EM ? em : null;
}

/** Gives the text a character width, in em. */
export function showCharWidth(em: number): void {
  document.documentElement.style.setProperty('--char-w', `${em}em`);
  for (const draw of drawers) draw();
}

/** Gives the text the character width of the body font that shows, as after a change of the theme. */
export function fitCharWidth(): void {
  const em = nextCharWidth();
  if (em !== null) showCharWidth(em);
}

/** Where the free space, the text and the ruler are, in px of the window. */
export interface WidthLayout {
  span: Span;
  /** The ruler runs from the left edge of the text at full width to its right edge. */
  rulerLeft: number;
  rulerRight: number;
  textLeft: number;
  textRight: number;
}

export function layoutOf(defaultChars: number): WidthLayout | null {
  const main = document.querySelector('main');
  const col = column();
  if (!main || !col) return null;
  const mainStyle = getComputedStyle(main);
  const colStyle = getComputedStyle(col);
  const freeLeft = main.getBoundingClientRect().left + main.clientLeft + px(mainStyle.paddingLeft);
  const free = main.clientWidth - px(mainStyle.paddingLeft) - px(mainStyle.paddingRight);
  // The marks strip, and the padding and the border that a look adds around the text.
  const before = px(colStyle.borderLeftWidth) + px(colStyle.paddingLeft);
  const after = px(colStyle.paddingRight) + px(colStyle.borderRightWidth);
  const charPx = shownCharEm() * px(colStyle.fontSize);
  if (!charPx) return null;
  const box = col.getBoundingClientRect();
  return {
    span: { charPx, minPx: COLUMN_MIN_PX - before - after, fullPx: free - before - after, defaultChars },
    rulerLeft: freeLeft + before,
    rulerRight: freeLeft + free - after,
    textLeft: box.left + before,
    textRight: box.right - after,
  };
}
