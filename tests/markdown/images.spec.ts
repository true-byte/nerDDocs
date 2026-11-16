import { expect, type Page } from '@playwright/test';
import { MODE_KEY } from '../../src/page/theme-memory.ts';
import { IMAGES_SITE } from '../support/images.ts';
import { pressOnSlider } from '../support/levels.ts';
import { hydrated, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

/** The tests only read 'Restore a file', so they share one command on it. */
const test = pageTest.extend<object, { images: RunningCommand }>({
  images: [
    async ({}, use) => {
      const run = await runCommand(IMAGES_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const lightCopy = (page: Page) => page.locator('#page img[data-look="light"]');
const darkCopy = (page: Page) => page.locator('#page img[data-look="dark"]');
const naturalWidth = (page: Page, alt: string) =>
  page.getByAltText(alt, { exact: true }).first().evaluate((image: HTMLImageElement) => image.naturalWidth);

/** Expects the copy of one look to have a box and the copy of the other look to take no room. */
async function expectShows(page: Page, look: 'light' | 'dark', because: string): Promise<void> {
  const [shown, hidden] = look === 'light' ? [lightCopy(page), darkCopy(page)] : [darkCopy(page), lightCopy(page)];
  await expect(shown, because).toBeVisible();
  expect((await shown.boundingBox())?.height, because).toBeGreaterThan(0);
  await expect(hidden, because).toHaveCSS('display', 'none');
}

test('the picked look shows its own copy, also on a computer set to the other look', async ({ page, images }) => {
  for (const [picked, computer] of [
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const) {
    await page.emulateMedia({ colorScheme: computer });
    await page.goto(`${images.address}restore.html`);
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [MODE_KEY, picked] as const);
    await page.reload();
    await hydrated(page);
    await expect(page.locator('html')).toHaveAttribute('data-mode', picked);
    await expectShows(page, picked, `'${picked}' picked on a ${computer} computer`);
  }
});

test.describe('with scripts off', () => {
  test.use({ javaScriptEnabled: false });

  test("the copy of the computer's look shows", async ({ page, images }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${images.address}restore.html`);
    await expect(page.locator('html')).not.toHaveAttribute('data-mode');
    await expectShows(page, 'dark', 'a dark computer');

    await page.emulateMedia({ colorScheme: 'light' });
    await expectShows(page, 'light', 'a light computer');
  });

  test('a block image shows the plain pointer, since no view can open', async ({ page, images }) => {
    await page.goto(`${images.address}restore.html`);
    await expect(lightCopy(page)).toHaveAttribute('data-full', '');
    await expect(lightCopy(page)).toHaveCSS('cursor', 'auto');
  });
});

test('the hidden copy and an image of another level do not download', async ({ page, images }) => {
  const asked: string[] = [];
  page.on('request', (request) => asked.push(new URL(request.url()).pathname));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${images.address}restore.html`);
  await hydrated(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => naturalWidth(page, 'Restore window'), OFTEN).toBeGreaterThan(0);
  await expect.poll(() => naturalWidth(page, 'Schedules window'), OFTEN).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.readyState), OFTEN).toBe('complete');
  expect(asked.filter((path) => /restore-window-dark\.png|search-index\.png/.test(path))).toEqual([]);

  await pressOnSlider(page, 'End');
  const index = page.getByAltText('Search index', { exact: true });
  await expect(index).toBeVisible();
  await index.scrollIntoViewIfNeeded();
  await expect.poll(() => asked.some((path) => path.endsWith('/search-index.png')), OFTEN).toBe(true);
});

test('each image holds its exact space before it loads', async ({ page, images }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => url.pathname.endsWith('.png'),
    async (route) => {
      await held;
      await route.continue().catch(() => {});
    },
  );
  try {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`${images.address}restore.html`, { waitUntil: 'domcontentloaded' });
    const copy = lightCopy(page);
    await expect(copy).toHaveAttribute('loading', 'lazy');
    const box = () => copy.evaluate((image: HTMLImageElement) => ({ width: image.clientWidth, height: image.clientHeight }));

    const before = await box();
    expect(before.width).toBeGreaterThan(0);
    expect(Math.abs(before.height - (before.width * 720) / 1280)).toBeLessThanOrEqual(1);
    expect(await copy.evaluate((image: HTMLImageElement) => image.naturalWidth), 'the copy waits for its file').toBe(0);

    release();
    await expect.poll(() => copy.evaluate((image: HTMLImageElement) => image.naturalWidth), OFTEN).toBe(1280);
    const after = await box();
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
    expect(after.width).toBe(before.width);
  } finally {
    release();
  }
});
