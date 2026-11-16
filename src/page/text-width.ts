/** The reader's text width holds for every page in the browser. */
export const WIDTH_KEY = 'nerddocs-text-width';

/**
 * The average character width of the body font of each theme, in em, as the page measured it last: a JSON object from
 * theme id to width. The head script reads it, so the first paint of the next page already has the right width.
 */
export const CHAR_KEY = 'nerddocs-char-width';

/** A number of characters, 'full' for the whole free space, or null for the site default. */
export type Width = number | 'full' | null;

/** Where the page measures the average character width of the body font: a sentence of plain English. */
export const CHAR_SAMPLE =
  'Pick the file in the list, then pick the copy from the day you want and press Restore. The app puts the file back in its own folder and keeps the newer copy next to it.';

/** The stored character widths that the page uses, in em. Any other value is a bad value. */
export const CHAR_EM_MIN = 0.2;
export const CHAR_EM_MAX = 1.5;

/** The width under `WIDTH_KEY`. Only digits with a value of at least 1, or 'full', give a width. */
export function parseWidth(stored: string | null): Width {
  if (stored === 'full') return 'full';
  if (stored === null || !/^\d+$/.test(stored)) return null;
  const chars = Number(stored);
  return chars >= 1 ? chars : null;
}

/** The text to store under `WIDTH_KEY`, or null to remove the key. */
export function storedWidth(width: Width): string | null {
  return width === null ? null : String(width);
}

/** The character width of a theme in the text under `CHAR_KEY`, or null when it holds none that the page can use. */
export function storedCharWidth(stored: string | null, theme: string): number | null {
  try {
    const widths: unknown = JSON.parse(stored ?? 'null');
    if (typeof widths !== 'object' || widths === null || Array.isArray(widths) || !Object.hasOwn(widths, theme)) return null;
    const em = (widths as Record<string, unknown>)[theme];
    return typeof em === 'number' && em >= CHAR_EM_MIN && em <= CHAR_EM_MAX ? em : null;
  } catch {
    return null;
  }
}

/** The text under `CHAR_KEY` with the character width of one theme set. */
export function withCharWidth(stored: string | null, theme: string, em: number): string {
  let widths: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(stored ?? '{}');
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) widths = value as Record<string, unknown>;
  } catch {
    // A broken value gives way to the new one.
  }
  return JSON.stringify({ ...widths, [theme]: em });
}

/** What a width is in px on the page now. */
export interface Span {
  /** The px of an average character of the body font. */
  charPx: number;
  /** The narrowest text width: the 288 px column less the marks strip. */
  minPx: number;
  /** The text width that fills the free space. */
  fullPx: number;
  /** The site default: `textWidth` of nerddocs.json, else 75. */
  defaultChars: number;
}

/** A px width between the narrowest text and the free space. When the window is too narrow for both, the narrowest wins. */
function clamp(px: number, span: Span): number {
  return Math.max(span.minPx, Math.min(span.fullPx, px));
}

/** The text width in px that a width shows. */
export function widthPx(width: Width, span: Span): number {
  const px = width === null ? span.defaultChars * span.charPx : width === 'full' ? span.fullPx : width * span.charPx;
  return clamp(px, span);
}

/** Edges this close to the free space give 'full'. */
const FULL_SNAP_PX = 8;

/**
 * The width that a text width in px gives: 'full' near the edge, the opening width within half a character of it,
 * the default within one character of it, and otherwise a whole number of characters.
 */
export function pickWidth(px: number, opening: Width, span: Span): Width {
  const at = clamp(px, span);
  if (at >= span.fullPx - FULL_SNAP_PX) return 'full';
  if (Math.abs(at - widthPx(opening, span)) < span.charPx / 2) return opening;
  if (Math.abs(at - span.defaultChars * span.charPx) <= span.charPx) return null;
  return Math.round(at / span.charPx);
}

/** The characters of one step of the arrow keys, and of Page Up and Page Down. */
const STEP_CHARS = 5;
const PAGE_CHARS = 25;

/** The width that a key on the slider gives, or undefined for a key that the slider does not take. */
export function keyWidth(key: string, current: Width, opening: Width, span: Span): Width | undefined {
  const at = widthPx(current, span);
  const to: Record<string, number> = {
    ArrowRight: at + STEP_CHARS * span.charPx,
    ArrowUp: at + STEP_CHARS * span.charPx,
    ArrowLeft: at - STEP_CHARS * span.charPx,
    ArrowDown: at - STEP_CHARS * span.charPx,
    PageUp: at + PAGE_CHARS * span.charPx,
    PageDown: at - PAGE_CHARS * span.charPx,
    Home: span.minPx,
    End: span.fullPx,
  };
  return Object.hasOwn(to, key) ? pickWidth(to[key]!, opening, span) : undefined;
}

/** The number in the middle of the ruler: the characters that the width shows. */
export function shownChars(width: Width, span: Span): number {
  return Math.round(widthPx(width, span) / span.charPx);
}
