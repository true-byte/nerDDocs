import { expect, type Locator, type Page } from '@playwright/test';
import { expectLevel, pressOnSlider, THREE_LEVELS } from '../support/levels.ts';
import { hydrated, test as pageTest } from '../support/page.ts';
import { CODE_SITE, SCHEDULES_SITE } from '../support/page-content.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';
import { storeOutlineHidden, storeWidth } from '../support/text-width.ts';

/** The tests only read 'Schedules', so they share one command on it. */
const test = pageTest.extend<object, { schedules: RunningCommand }>({
  schedules: [
    async ({}, use) => {
      const run = await runCommand(SCHEDULES_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

const PHONE_SIZE = { width: 390, height: 844 };

const cellsOf = (tag: string, texts: string[]) => texts.map((text) => `<${tag}>${text}</${tag}>`).join('');
const TARGETS = Array.from({ length: 8 }, () => 'Local disk and S3');

/** A wide raw HTML table whose first row spans two columns, under a heading that shows only at 'Internals'. */
const TARGETS_PAGE = `# Restore targets

A restore puts each file on a target.

::: internals
## Targets at internals

The agent picks a target.
:::

<table>
<tr><th colspan="2">Plan and runs</th>${cellsOf('th', TARGETS.map((_, n) => `Target ${n + 1}`))}</tr>
<tr>${cellsOf('td', ['Team', 'Daily', ...TARGETS])}</tr>
</table>
`;
const SCHEDULES = 'backups/schedules.html';

/** The wrapper of the table right under a heading. */
const tableUnder = (page: Page, heading: string) => page.locator(`#${heading} + .wide`);
const boxOf = (wide: Locator) => wide.locator(':scope > .sbox');

const pseudo = (element: Locator, which: '::before' | '::after', property: string) =>
  element.evaluate((node, [at, name]) => getComputedStyle(node, at).getPropertyValue(name), [which, property] as const);

const scrollBoxTo = (box: Locator, left: number) =>
  box.evaluate((node, x) => {
    node.scrollLeft = x;
  }, left);

async function openSchedules(page: Page, address: string): Promise<void> {
  await page.setViewportSize(PHONE_SIZE);
  await page.goto(`${address}${SCHEDULES}`);
  await hydrated(page);
}

test('a wide table shows a fade where columns hide, and pins a narrow first column while it scrolls', async ({ page, schedules }) => {
  await openSchedules(page, schedules.address);
  const settings = tableUnder(page, 'all-plan-settings');
  const box = boxOf(settings);
  await expect(settings).toHaveAttribute('data-more', 'right');
  await expect(settings).toHaveAttribute('data-pin', '');
  expect(await pseudo(settings, '::after', 'content')).toBe('""');
  expect(await pseudo(settings, '::after', 'width')).toBe('40px');
  expect(await pseudo(settings, '::before', 'content')).toBe('none');
  await expect(box).toHaveCSS('overscroll-behavior-x', 'contain');

  await scrollBoxTo(box, 150);
  await expect(settings).toHaveAttribute('data-more', 'left right');
  const pinned = await box.evaluate((node) => ({
    header: node.querySelector('th')!.getBoundingClientRect().left,
    box: node.getBoundingClientRect().left,
  }));
  expect(Math.abs(pinned.header - pinned.box)).toBeLessThanOrEqual(1);
  const firstCell = box.locator('td').first();
  expect(await pseudo(firstCell, '::after', 'width')).toBe('1px');
  expect(await pseudo(firstCell, '::after', 'background-color')).toBe(
    await firstCell.evaluate((cell) => getComputedStyle(cell).borderBottomColor),
  );

  await box.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await expect(settings).toHaveAttribute('data-more', 'left');

  const commands = tableUnder(page, 'restore-commands');
  await expect(commands).toHaveAttribute('data-more', 'right');
  await expect(commands).not.toHaveAttribute('data-pin');
  await scrollBoxTo(boxOf(commands), 100);
  await expect(commands).toHaveAttribute('data-more', 'left right');
  expect(await pseudo(commands, '::before', 'content')).toBe('""');
});

test('a box that scrolls is a region named by the heading above it, Tab and the arrow keys reach and scroll it, and a box that fits drops these', async ({ page, schedules }) => {
  await storeWidth(page, 'full');
  // With no outline column, the 10 columns fit a window 1440 px wide.
  await storeOutlineHidden(page);
  await openSchedules(page, schedules.address);
  const plans = page.getByRole('region', { name: 'Schedules', exact: true });
  await expect(plans).toHaveAttribute('tabindex', '0');
  expect(await plans.evaluate((node) => node === document.querySelector('#page .sbox'))).toBe(true);

  await plans.focus();
  await page.keyboard.press('Tab');
  const settings = page.getByRole('region', { name: 'All plan settings', exact: true });
  await expect(settings).toBeFocused();
  await expect(settings).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => settings.evaluate((node) => node.scrollLeft), OFTEN).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#page').getByRole('region')).toHaveCount(0);
  await expect(page.locator('#page .sbox[tabindex], #page .sbox[aria-labelledby]')).toHaveCount(0);
  await expect(page.locator('#page .wide[data-more], #page .wide[data-pin]')).toHaveCount(0);
});

test('a table with a spanned cell never pins, and a heading hidden at this level names no box', async ({ page, ownSite }) => {
  const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'backups/targets.md': TARGETS_PAGE });
  await page.goto(`${run.address}backups/targets.html`);
  await hydrated(page);
  const wide = page.locator('#page .wide');
  await expect(wide).toHaveAttribute('data-more', 'right');
  await expect(wide).not.toHaveAttribute('data-pin');
  await expect(page.getByRole('region', { name: 'Restore targets', exact: true })).toHaveCount(1);

  await pressOnSlider(page, 'End');
  await expect(page.getByRole('region', { name: 'Targets at internals', exact: true })).toHaveCount(1);
});

test('a code block gets its fade and its region when it shows after a level change, and when its text grows wider in the same box', async ({ page, ownSite }) => {
  const run = await ownSite(CODE_SITE);
  await page.setViewportSize(PHONE_SIZE);
  // The level change then ends at once, so only the box watch can see the text grow after it.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${run.address}backups/restore-by-script.html`);
  await hydrated(page);
  const job = page.locator('#page .code').filter({ hasText: 'closestCopy' });
  await expect(job).toHaveCount(1);
  await expect(job).not.toHaveAttribute('data-more');
  await expect(job.locator(':scope > pre')).not.toHaveAttribute('role');

  await pressOnSlider(page, 'End');
  await expectLevel(page, 'internals');
  await expect(job).toHaveAttribute('data-more', 'right');
  await expect(job).not.toHaveAttribute('data-pin');
  await expect(job.locator(':scope > pre')).toHaveAttribute('role', 'region');
  await expect(job.locator(':scope > pre')).toHaveAttribute('aria-labelledby', 'restore-by-script');

  const plan = page.locator('#page .code').filter({ hasText: 'plan: daily' });
  await expect(plan).toHaveCount(1);
  await expect(plan).not.toHaveAttribute('data-more');
  await plan.locator(':scope > pre > code').evaluate((code) => {
    (code as HTMLElement).style.letterSpacing = '40px';
  });
  await expect(plan).toHaveAttribute('data-more', 'right');
  await expect(plan.locator(':scope > pre')).toHaveAttribute('role', 'region');
  await expect(plan.locator(':scope > pre')).toHaveAttribute('aria-labelledby', 'change-the-schedule');
});
