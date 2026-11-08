import { expect, type Page } from '@playwright/test';
import { hydrated } from './page.ts';

/** The levels of the backup app, as the file `nerddocs.json` lists them. */
export const THREE_LEVELS = JSON.stringify({
  levels: [
    { id: 'overview', name: 'Overview', icon: 'eye' },
    { id: 'requirements', name: 'Requirements', icon: 'list' },
    { id: 'internals', name: 'Internals', icon: 'cpu' },
  ],
  defaultLevel: 'overview',
});

/** A config that lists the given level ids, with each name made from its id. */
export const levelsFile = (...ids: string[]) => JSON.stringify({ levels: ids.map((id) => ({ id })) });

/** Longer than a move takes and shorter than a signal lasts, on the clock of the page. */
export const MOVE_MS = 600;
/** Longer than the signals of a move last, on the clock of the page. */
export const SIGNALS_MS = 3000;

/**
 * Opens a page with its clock stopped, so that a test decides when each timer and each frame
 * of an animation runs. A slow machine then runs the same steps as a fast one.
 */
export async function openOnStoppedClock(page: Page, address: string): Promise<void> {
  await page.clock.install({ time: 0 });
  await page.goto(address);
  await hydrated(page);
  await page.clock.pauseAt(3_600_000);
}

export const thumb = (page: Page) => page.locator('#thumb');
export const stops = (page: Page) => page.locator('.stop');
/** The name of the lit stop. */
export const litStop = (page: Page) => page.locator('.stop.on .nm > span');
export const liveRegion = (page: Page) => page.locator('#stopsWrap [aria-live]');
export const levelStyle = (page: Page) => page.locator('#nd-level');

export async function expectLevel(page: Page, level: string): Promise<void> {
  await expect(levelStyle(page)).toHaveAttribute('data-level', level);
}

/** Presses a key on the slider. The move starts before the key press returns. */
export async function pressOnSlider(page: Page, key: string): Promise<void> {
  await thumb(page).focus({ timeout: 15_000 });
  await page.keyboard.press(key);
}

/** The place on the track at a share of its width, from 0 to 1. */
export async function trackPoint(page: Page, share: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator('.track').boundingBox())!;
  return { x: box.x + box.width * share, y: box.y + box.height / 2 };
}

/** The center of a stop on the track. */
export const stopPoint = (page: Page, stop: number, count: number) => trackPoint(page, (stop + 0.5) / count);

export async function thumbCenter(page: Page): Promise<number> {
  const box = (await thumb(page).boundingBox())!;
  return box.x + box.width / 2;
}

/** Scrolls as a reader does, and comes back after the page has seen the scroll. */
export async function scrollPage(page: Page, y: number): Promise<void> {
  await page.evaluate(
    (top) =>
      new Promise<void>((done) => {
        if (Math.abs(scrollY - top) < 1) return done();
        addEventListener('scroll', () => done(), { once: true });
        scrollTo(0, top);
      }),
    y,
  );
}
