import { DEFAULT_THEME, THEMES } from '../themes/index.ts';
import { computerLookScript, safeJson } from './first-paint.ts';

/** The address of the theme preview, a sample page that the theme box shows in a frame. */
export const PREVIEW_URL = '/__nerddocs/theme-preview.html';

/** The size of the frame of the preview, in CSS pixels, before the theme box scales it down. */
export const PREVIEW_WIDTH = 1280;
export const PREVIEW_HEIGHT = 800;

/**
 * The head script of the preview, in place of the first-paint script. The hash of the address is
 * `#<theme id>/<light|dark>`, such as `#im-in/dark`. The script shows that theme, or the default theme for an
 * unknown id, in that look, or in the computer's look for a missing or unknown look. It shows the next ones on each
 * hash change.
 */
export function themeHashScript(): string {
  const ids = THEMES.map((theme) => theme.id);
  return `(function(){var i=${safeJson(ids)},r=document.documentElement;
function s(){var h=location.hash.slice(1).split("/"),t=h[0],m=h[1];
r.setAttribute("data-theme",i.indexOf(t)<0?${safeJson(DEFAULT_THEME)}:t);
r.setAttribute("data-mode",m==="light"||m==="dark"?m:${computerLookScript()})}
s();addEventListener("hashchange",s)
})();`;
}
