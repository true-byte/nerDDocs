import { DEFAULT_THEME, themeById } from '../themes/index.ts';
import type { Mode } from '../themes/types.ts';
import { local, read, write } from './panel-state.ts';

/** The reader's theme holds for every page in the browser. */
export const THEME_KEY = 'nerddocs-theme';

/** The stored theme id. A missing, unknown or unreadable value gives the default theme. */
export function storedTheme(): string {
  const id = read(local, THEME_KEY);
  return id !== null && themeById(id) ? id : DEFAULT_THEME;
}

/** Shows the theme on the page at once and keeps it for the next pages. */
export function pickTheme(id: string): void {
  document.documentElement.setAttribute('data-theme', id);
  write(local, THEME_KEY, id);
}

/** Shows the theme that another page stored. */
export function showStoredTheme(): void {
  document.documentElement.setAttribute('data-theme', storedTheme());
}

/** The theme that the page shows now. */
export function shownTheme(): string {
  return document.documentElement.getAttribute('data-theme') ?? DEFAULT_THEME;
}

/** The reader's look setting: the light look, the dark look, or the look of the computer. */
export type LookSetting = 'light' | 'dark' | 'system';

/** The reader's look setting holds for every page in the browser. */
export const MODE_KEY = 'nerddocs-mode';

/** The media query that matches a computer set to the dark look. */
export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The stored setting. A missing, unknown or unreadable value gives 'system'. */
export function storedLook(): LookSetting {
  const setting = read(local, MODE_KEY);
  return setting === 'light' || setting === 'dark' ? setting : 'system';
}

/** The look that a setting shows now: 'system' gives the computer's look. */
export function lookOf(setting: LookSetting): Mode {
  if (setting !== 'system') return setting;
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Stores the setting and shows its look on the page at once. */
export function pickLook(setting: LookSetting): void {
  document.documentElement.setAttribute('data-mode', lookOf(setting));
  write(local, MODE_KEY, setting);
}

/** Shows the look of the stored setting. */
export function showStoredLook(): void {
  document.documentElement.setAttribute('data-mode', lookOf(storedLook()));
}
