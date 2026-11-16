import iFlySpaceships from './i-fly-spaceships/theme.ts';
import iLoveMsdos from './i-love-msdos/theme.ts';
import iVoidWarranties from './i-void-warranties/theme.ts';
import imASeriousPerson from './im-a-serious-person/theme.ts';
import imIn from './im-in/theme.ts';
import originalNerd from './original-nerd/theme.ts';
import themelessness from './themelessness/theme.ts';
import type { Theme } from './types.ts';

/** Every theme, in the order of the theme box. A new theme folder needs an import above and an entry here. */
export const THEMES: readonly Theme[] = [
  themelessness,
  iLoveMsdos,
  originalNerd,
  imIn,
  iVoidWarranties,
  iFlySpaceships,
  imASeriousPerson,
];

/** The id of the theme that a page shows when the reader has picked none. */
export const DEFAULT_THEME = 'themelessness';

export function themeById(id: string): Theme | undefined {
  return THEMES.find((theme) => theme.id === id);
}
