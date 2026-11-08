import { expect, type Page } from '@playwright/test';
import { DEFAULT_KEY } from '../../src/page/level-memory.ts';
import { expectLevel, pressOnSlider, scrollPage, THREE_LEVELS } from '../support/levels.ts';
import { expectNoReload, hydrated, openLive, test as pageTest } from '../support/page.ts';
import { STEPS } from '../support/page-content.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

/**
 * Shared text with links, a shared heading at 'Overview' and 'Internals', a shared heading at 'Internals' only, a shared
 * heading at every level, and the heading 'Design' at 'Overview' and again at 'Internals'.
 */
const RESTORE_PAGE = `# Restore a file

A restore never changes the copy.

See [the index](#search-index), [the index at overview](#overview/search-index), [the day](#pick-a-day), [the weekly plan](schedules.md#weekly-plan), [the plans](schedules.md#plans) and [the plan at internals](schedules.md#internals/weekly-plan).

${STEPS}

## Pick a day

::: overview
Pick a file and a day.
::: internals
A restore is a job on the storage server.
:::

## Search index

::: internals
The index maps each block to its file.

${STEPS}
:::

## Check the result

Open the file and check it.

${STEPS}

::: overview
## Design

The design at overview.
::: internals
## Design

The design at internals.

${STEPS}
:::

## Last steps

${STEPS}

${STEPS}
`;

/** A shared heading with text at every level, and a heading at 'Requirements' only. */
const SCHEDULES_PAGE = `# Schedules

## Plans

A plan says how often.

${STEPS}

## Weekly plan

::: requirements
A weekly plan runs on Sunday.

${STEPS}
:::

## More plans

${STEPS}

${STEPS}
`;

const SITE = {
  'nerddocs.json': THREE_LEVELS,
  'restore.md': RESTORE_PAGE,
  'schedules.md': SCHEDULES_PAGE,
  'licenses.md': '# Licenses\n\n::: requirements\nEach seat needs a key.\n::: internals\nThe key holds an end date.\n:::\n',
  'storage.md': `# Storage\n\nBlocks are stored once.\n\n${STEPS}\n\n## Blocks\n\nA block.\n\n${STEPS}\n`,
};

/** Tests that only read the site share one command on it. */
const test = pageTest.extend<object, { docs: RunningCommand }>({
  docs: [
    async ({}, use) => {
      const run = await runCommand(SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

test.use({ viewport: { width: 1280, height: 720 } });

const historyLength = (page: Page) => page.evaluate(() => history.length);
const hashOf = (page: Page) => new URL(page.url()).hash;
const markWindow = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { sameWindow: boolean }).sameWindow = true;
  });

/** How far the element sits from the place that the browser gives a jump to its id: its scroll margin below the top of the window. */
const offTop = (page: Page, id: string) =>
  page
    .locator(`[id="${id}"]`)
    .evaluate((element) => Math.abs(element.getBoundingClientRect().top - parseFloat(getComputedStyle(element).scrollMarginTop || '0')));

async function expectAtTop(page: Page, id: string): Promise<void> {
  await expect.poll(() => offTop(page, id), OFTEN).toBeLessThanOrEqual(1);
}

async function expectScrollNear(page: Page, y: number): Promise<void> {
  await expect.poll(() => page.evaluate(() => scrollY), OFTEN).toBeGreaterThan(y - 3);
  expect(await page.evaluate(() => scrollY)).toBeLessThan(y + 3);
}

/** Opens a page as a new arrival, from another page of the site. */
async function arrive(page: Page, docs: RunningCommand, address: string): Promise<void> {
  if (page.url().startsWith(docs.address)) await page.goto('about:blank');
  await page.goto(`${docs.address}${address}`);
  await hydrated(page);
}

const textLink = (page: Page, name: string) => page.locator('#page').getByRole('link', { name, exact: true });

test.describe('the hash holds the level', () => {
  test('a page with parts gets its level in the hash at once and at each level change, with no new history entry', async ({ page, docs }) => {
    await arrive(page, docs, 'restore.html');
    await expect(page).toHaveURL(/\/restore\.html#overview$/);
    const length = await historyLength(page);

    await page.locator('#dflB').click();
    await page.locator('#defaults-box').getByRole('button', { name: 'Internals' }).click();
    await expectLevel(page, 'internals');
    await expect(page).toHaveURL(/\/restore\.html#internals$/);
    await page.keyboard.press('Escape');

    await pressOnSlider(page, '2');
    await expectLevel(page, 'requirements');
    await expect(page).toHaveURL(/\/restore\.html#requirements$/);
    await pressOnSlider(page, 'Home');
    await expectLevel(page, 'overview');
    await expect(page).toHaveURL(/\/restore\.html#overview$/);
    expect(await historyLength(page)).toBe(length);

    await arrive(page, docs, 'restore.html#check-the-result');
    await expect(page).toHaveURL(/\/restore\.html#overview\/check-the-result$/);
  });

  test('a live update that changes the level names the new level in the hash', async ({ page, ownSite }) => {
    const run = await ownSite({
      'nerddocs.json': THREE_LEVELS,
      'licenses.md': '# Licenses\n\n::: overview\nEach seat needs a key.\n::: internals\nThe key holds an end date.\n:::\n',
    });
    await openLive(page, `${run.address}licenses.html#internals`);
    await hydrated(page);
    await expectLevel(page, 'internals');
    await expect(page).toHaveURL(/\/licenses\.html#internals$/);
    const length = await historyLength(page);

    await run.save('licenses.md', '# Licenses\n\n::: overview\nEach seat needs a key.\n:::\n');
    await expect(page.getByText('The key holds an end date.')).toHaveCount(0);
    await expectLevel(page, 'overview');
    await expect(page).toHaveURL(/\/licenses\.html#overview$/);
    expect(await historyLength(page)).toBe(length);
    await expectNoReload(page);
  });

  test('a flat page and a site with no levels never write a level into the hash', async ({ page, docs, site }) => {
    await arrive(page, docs, 'storage.html');
    await expect(page.locator('#no-levels')).toBeVisible();
    expect(hashOf(page)).toBe('');
    await arrive(page, docs, 'storage.html#blocks');
    expect(hashOf(page)).toBe('#blocks');

    await page.goto(`${site.address}backups/schedules.html`);
    await hydrated(page);
    expect(hashOf(page)).toBe('');
    await page.goto(`${site.address}storage.html#blocks`);
    await hydrated(page);
    expect(hashOf(page)).toBe('#blocks');
  });
});

test.describe('opening a page at the level of its address', () => {
  test('a level in the hash opens the page at it and keeps it for the page in this tab, with no chip', async ({ page, docs }) => {
    await arrive(page, docs, 'restore.html#internals');
    await expectLevel(page, 'internals');
    await expect(page).toHaveURL(/\/restore\.html#internals$/);
    await expect(page.locator('#chip')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'All pages' })).toHaveCount(0);

    await arrive(page, docs, 'schedules.html');
    await arrive(page, docs, 'restore.html');
    await expectLevel(page, 'internals');
    await expect(page).toHaveURL(/\/restore\.html#internals$/);
  });

  test('a level that the page lacks opens the page at the level that it opens at for that level', async ({ page, docs }) => {
    await arrive(page, docs, 'licenses.html#overview');
    await expectLevel(page, 'requirements');
    await expect(page).toHaveURL(/\/licenses\.html#requirements$/);
  });

  test('an id that shows at some levels only opens the page at a level that shows it, with the id at the top of the window', async ({ page, docs }) => {
    await arrive(page, docs, 'restore.html#search-index');
    await expectLevel(page, 'internals');
    await expect(page).toHaveURL(/\/restore\.html#internals\/search-index$/);
    await expectAtTop(page, 'search-index');

    await arrive(page, docs, 'restore.html#internals/pick-a-day');
    await expectLevel(page, 'internals');
    await expectAtTop(page, 'pick-a-day');
  });

  test('headings with the same text count as one target: a reader at Internals stays there and lands on the heading of Internals', async ({ page, docs }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'internals'), DEFAULT_KEY);
    await arrive(page, docs, 'restore.html#design');
    await expectLevel(page, 'internals');
    await expect(page).toHaveURL(/\/restore\.html#internals\/design(-1)?$/);
    await expectAtTop(page, 'design-1');
  });

  test('an id that names no element and an unknown level change nothing', async ({ page, docs }) => {
    for (const hash of ['#no-such-heading', '#testers/search-index', '#testers']) {
      await arrive(page, docs, `restore.html${hash}`);
      await expectLevel(page, 'overview');
      await expect(page, hash).toHaveURL(/\/restore\.html#overview$/);
      expect(await page.evaluate(() => scrollY), hash).toBe(0);
    }
  });

  test('a reload, Back and Forward keep the scroll that the browser restores, and never jump to the id', async ({ page, docs }) => {
    await arrive(page, docs, 'restore.html#check-the-result');
    await expectAtTop(page, 'check-the-result');
    const away = (await page.evaluate(() => scrollY)) + 300;
    await scrollPage(page, away);

    await page.reload();
    await hydrated(page);
    await expectScrollNear(page, away);
    expect(await offTop(page, 'check-the-result')).toBeGreaterThan(100);

    await page.goto(`${docs.address}schedules.html#plans`);
    await expect(page).toHaveURL(/\/schedules\.html#overview\/plans$/);
    await hydrated(page);
    await expectAtTop(page, 'plans');
    const further = (await page.evaluate(() => scrollY)) + 300;
    await scrollPage(page, further);

    await page.goBack();
    await expect(page).toHaveURL(/\/restore\.html#overview\/check-the-result$/);
    await hydrated(page);
    await expectScrollNear(page, away);

    await page.goForward();
    await expect(page).toHaveURL(/\/schedules\.html#overview\/plans$/);
    await hydrated(page);
    await expectScrollNear(page, further);
  });

  test('a hash change on the open page changes the level first and then puts the target at the top', async ({ page, docs }) => {
    await arrive(page, docs, 'restore.html');
    await markWindow(page);

    await textLink(page, 'the index').click();
    await expectLevel(page, 'internals');
    await expect(page).toHaveURL(/\/restore\.html#internals\/search-index$/);
    await expectAtTop(page, 'search-index');

    await page.goBack();
    await expectLevel(page, 'overview');
    await expect(page).toHaveURL(/\/restore\.html#overview$/);

    await page.goForward();
    await expectLevel(page, 'internals');
    await expect(page).toHaveURL(/\/restore\.html#internals\/search-index$/);

    await page.evaluate(() => {
      location.hash = '#requirements';
    });
    await expectLevel(page, 'requirements');
    await expect(page).toHaveURL(/\/restore\.html#requirements$/);

    await page.locator('aside[aria-label="Outline"]').getByRole('link', { name: 'Check the result', exact: true }).click();
    await expectLevel(page, 'requirements');
    await expect(page).toHaveURL(/\/restore\.html#requirements\/check-the-result$/);
    await expectAtTop(page, 'check-the-result');
    await expectNoReload(page);
  });
});
