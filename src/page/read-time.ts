import type { ReadRow } from '../site/read-time.ts';
import type { PageLevels } from '../site/view.ts';
import { levelIconHtml } from './icons.tsx';
import { isFlat } from './levels.ts';

const EDGE_PX = 8;
const ABOVE_BAR_PX = 28;

export function formatMinutes(minutes: number): string {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes}m`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)}h${rest ? ` ${rest}m` : ''}`;
}

/** A page with no slider has only the time next to the title. */
export const hasNoSlider = (page: Pick<PageLevels, 'levels' | 'parts'>) => page.levels.length === 0 || isFlat(page);

/** The button next to the title as HTML, or '' when no row has a time. The level rule picks the time to show. */
export function titleTimeHtml(rows: ReadRow[], always: boolean): string {
  const timed = rows.filter((row) => row.page > 0);
  if (!timed.length) return '';
  const shows = timed.length < rows.length ? ` data-shows="${timed.map((row) => row.level).join(' ')}"` : '';
  const times = timed.map(({ level, page }) => {
    const shown = level ? ` data-shows="${level}"` : '';
    return `<span${shown}>${formatMinutes(page)}</span>`;
  });
  const icon = levelIconHtml({ name: '', icon: 'clock' });
  return `<button type="button" id="tlB" class="tl" title="Read time" aria-haspopup="dialog"${always ? ' data-always' : ''}${shows}>${icon}<span class="sr-only">Read time </span>${times.join('')}</button>`;
}

export function boxPlace(
  from: { top: number; bottom: number; left: number; right: number },
  boxWidth: number,
  view: { width: number; height: number },
  barTop: number,
): { left: number; top?: number; bottom?: number } {
  const low = from.top > view.height / 2;
  const left = Math.max(EDGE_PX, Math.min(view.width - boxWidth - EDGE_PX, low ? from.right - boxWidth : from.left));
  return low ? { left, bottom: view.height - barTop + ABOVE_BAR_PX } : { left, top: from.bottom + EDGE_PX };
}
