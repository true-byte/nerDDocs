import { expect, type Page } from '@playwright/test';
import { hydrated, panel, rowOf, test } from '../support/page.ts';
import { columns } from '../support/text-width.ts';

const sideways = (page: Page, selector: string) =>
  page.locator(selector).evaluate((box) => box.scrollWidth - box.clientWidth);

for (const width of [320, 360, 390, 560, 580, 1440]) {
  test(`at ${width} wide, the text column does not scroll sideways`, async ({ page, site }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${site.address}long-names.html`);
    expect(await sideways(page, 'main')).toBe(0);
    await page.goto(`${site.address}backups/schedules.html`);
    expect(await sideways(page, 'main')).toBe(0);
  });
}

test('a long title wraps in the panel, and code and tables keep their own sideways scroll', async ({ page, site }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${site.address}long-names.html`);
  expect(await sideways(page, 'pre')).toBeGreaterThan(0);
  expect(await sideways(page, '.wide')).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1440, height: 800 });
  expect(await sideways(page, '#tree')).toBe(0);
});

test('a table column keeps the alignment that the Markdown sets', async ({ page, site }) => {
  await page.goto(`${site.address}long-names.html`);
  const cells = page.locator('tbody td');
  await expect(cells.nth(0)).toHaveCSS('text-align', /left/);
  await expect(cells.nth(1)).toHaveCSS('text-align', /right/);
  await expect(cells.nth(2)).toHaveCSS('text-align', /center/);
});

test('at 960 wide the panel sits beside the text, and at 959 wide the menu button takes its place', async ({ page, site }) => {
  await page.setViewportSize({ width: 960, height: 700 });
  await page.goto(`${site.address}backups/restore.html`);
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Contents', exact: true })).toBeHidden();

  await page.setViewportSize({ width: 959, height: 700 });
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Contents', exact: true })).toBeVisible();
});

test('the scroll anchoring of the browser stays on, for content that loads late above the reader', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  for (const selector of ['html', 'body', 'main', '#page']) await expect(page.locator(selector), selector).toHaveCSS('overflow-anchor', 'auto');
});

test.describe('the frame', () => {
  test('with the panel hidden, the text takes the whole window', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Hide contents' }).click();
    await expect(panel(page)).toBeHidden();

    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect((await page.locator('main').boundingBox())!.width).toBe(width);
  });

  test('with the panel hidden on a wide window, the free space keeps 48 px at each side', async ({ page, site }) => {
    await page.setViewportSize({ width: 960, height: 700 });
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Hide contents' }).click();
    await expect(panel(page)).toBeHidden();
    await expect(page.locator('main')).toHaveCSS('padding-left', '48px');
    await expect(page.locator('main')).toHaveCSS('padding-right', '48px');

    await page.setViewportSize({ width: 959, height: 700 });
    await expect(page.locator('main')).toHaveCSS('padding-left', '16px');
    await expect(page.locator('main')).toHaveCSS('padding-right', '16px');
  });

  test('the panel stays on screen when the text scrolls', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await page.evaluate(() => window.scrollTo(0, 1000));
    expect((await panel(page).boundingBox())!.y).toBe(0);
  });

  test('with the panel hidden, the button that shows it floats over the text', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Hide contents' }).click();
    await page.evaluate(() => window.scrollTo(0, 1000));
    await expect(page.getByRole('button', { name: 'Show contents' })).toBeInViewport();
  });

  test('an icon draws its lines', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    for (const icon of [page.getByRole('button', { name: 'Hide contents' }).locator('svg'), page.locator('.chev svg').first()]) {
      await expect(icon).toHaveCSS('stroke', /^rgb/);
      await expect(icon).toHaveCSS('fill', 'none');
    }
  });

  test('a keyboard user sees which control has focus', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveCSS('outline-style', 'solid');
    await expect(page.locator(':focus')).toHaveCSS('outline-width', '2px');
  });

  test('a reader who asks for reduced motion gets section arrows that do not animate', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await expect(page.locator('.chev svg').first()).toHaveCSS('transition-duration', '0.2s');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.chev svg').first()).toHaveCSS('transition-duration', '0s');
  });
});

test.describe('the panel rows', () => {
  test('the row of the current page has a highlight and bold text, and the other rows do not', async ({ page, site }) => {
    await page.goto(`${site.address}backups/restore.html`);
    const current = rowOf(page, 'Restore a file');
    const other = rowOf(page, 'Schedules');

    await expect(current.locator('..')).toHaveCSS('background-color', 'rgb(227, 233, 239)');
    await expect(other.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(current).toHaveCSS('font-weight', '700');
    await expect(other).toHaveCSS('font-weight', '400');
  });

  test('the arrow of a closed section turns', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    const backups = panel(page).getByRole('button', { name: 'Backups' });
    await expect(backups.locator('svg')).toHaveCSS('transform', 'none');

    await backups.click();
    await expect(backups.locator('svg')).not.toHaveCSS('transform', 'none');
  });

  test('the rows of a subsection sit further in than their parent rows', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    const parent = await panel(page).getByRole('button', { name: 'Backups' }).boundingBox();
    const child = await panel(page).getByRole('button', { name: 'Plans' }).boundingBox();
    expect(child!.x).toBeGreaterThan(parent!.x);
  });

  test('the rows have no bullets and no underline', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await expect(page.locator('#tree li').first()).toHaveCSS('list-style-type', 'none');
    await expect(rowOf(page, 'Schedules')).toHaveCSS('text-decoration-line', 'none');
  });
});

test.describe('the text', () => {
  test('on a wide window the text column sits in the middle of the free space, with room at each side', async ({ page, site }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto(`${site.address}storage.html`);
    const { free, freeLeft, col, colLeft } = await columns(page);
    expect(col).toBeLessThan(free - 100);
    expect(Math.abs(colLeft - freeLeft - (freeLeft + free - (colLeft + col)))).toBeLessThanOrEqual(1);
  });

  test('on a short page, a link to a heading near the end brings that heading to the top', async ({ page, site }) => {
    await page.goto(`${site.address}backups/schedules.html#weekly-plan`);
    await expect
      .poll(() => page.locator('#weekly-plan').evaluate((heading) => heading.getBoundingClientRect().top))
      .toBeLessThan(5);
  });

  test('a table header with no alignment in the Markdown starts at the left', async ({ page, site }) => {
    await page.goto(`${site.address}restore-checklist.html`);
    await expect(page.locator('th').first()).toHaveCSS('text-align', 'left');
  });

  test('a big image fits the column', async ({ page, site }) => {
    await page.goto(`${site.address}restore-checklist.html`);
    const image = page.getByAltText('Wide window');
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(3000);

    expect((await image.boundingBox())!.width).toBeLessThanOrEqual((await page.locator('#page').boundingBox())!.width);
    expect(await sideways(page, 'main')).toBe(0);
  });

  test('a code block sits in a shaded box, and a quote has a side bar', async ({ page, site }) => {
    await page.goto(`${site.address}restore-checklist.html`);
    await expect(page.locator('pre')).toHaveCSS('background-color', 'rgb(237, 241, 244)');
    await expect(page.locator('blockquote')).toHaveCSS('border-left-width', '3px');
    await expect(page.locator('blockquote')).toHaveCSS('border-left-style', 'solid');
  });

  test('the Footnotes heading is for a screen reader and takes no room on the page', async ({ page, site }) => {
    await page.goto(`${site.address}restore-checklist.html`);
    const box = await page.locator('h2.sr-only').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(1);
    expect(box!.height).toBeLessThanOrEqual(1);
  });
});

test.describe('under 960px wide', () => {
  test.use({ viewport: { width: 800, height: 700 } });

  test('the open contents layer hides the text behind it and covers the menu bar', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Contents', exact: true }).click();

    await expect(panel(page)).toHaveCSS('background-color', 'rgb(246, 248, 250)');
    const layer = Number(await panel(page).evaluate((element) => getComputedStyle(element).zIndex));
    const bar = Number(await page.locator('#bar').evaluate((element) => getComputedStyle(element).zIndex));
    expect(layer).toBeGreaterThan(bar);
  });

  test('the menu button stays at the bottom of the window', async ({ page, site }) => {
    await page.goto(`${site.address}storage.html`);
    const box = await page.locator('#bar').boundingBox();
    expect(box!.y + box!.height).toBe(700);
  });

  test('with the panel hidden, only the menu button shows', async ({ page, site }) => {
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Hide contents' }).click();
    await expect(page.getByRole('button', { name: 'Show contents' })).toBeVisible();

    await page.setViewportSize({ width: 800, height: 700 });
    await expect(page.getByRole('button', { name: 'Show contents' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Contents', exact: true })).toBeVisible();
  });
});
