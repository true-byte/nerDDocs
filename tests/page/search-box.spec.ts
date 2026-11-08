import { expect, type Page } from '@playwright/test';
import { dimensionsConfig } from '../support/dimensions.ts';
import { expectLevel, thumb } from '../support/levels.ts';
import { expectNoReload, hydrated, openLive, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

/** Lines of text with no word that a test searches for. */
const LINES = Array.from({ length: 12 }, () => 'Each copy stays on the disk until the end of its plan.').join('\n\n');

/** A long page: a hit at 'Internals' in its middle, a hit at 'Requirements' in a closed details, and a hit near its end. */
const RESTORE_PAGE = `# Restore a file

A restore never changes the copy. Press \`Ctrl+R\` to restore the file.

## Steps

${LINES}

${LINES}

## Pick a day

::: overview
Pick a file and a day.
::: internals
A restore is a job on the storage server.
:::

## Limits

<details>
<summary>Limits of a restore</summary>

::: requirements
REQ-2.1 A restore keeps at most 30 days.
:::

</details>

## Check the result

The checksum proves the copy.

${LINES}

${LINES}
`;

const SCHEDULES_PAGE = '# Schedules\n\nA plan says how often.\n\n## Weekly plan\n\n::: requirements\nA weekly plan runs on Sunday.\n:::\n';

const SITE = {
  'nerddocs.json': dimensionsConfig([{ folder: 'user-guide' }, { folder: 'administration' }]),
  'user-guide/backups/01-restore.md': RESTORE_PAGE,
  'user-guide/backups/02-schedules.md': SCHEDULES_PAGE,
  'administration/01-install.md': '# Install the server\n\nRun the installer on the storage server.\n',
};

const RESTORE = 'user-guide/backups/restore.html';
const SCHEDULES = 'user-guide/backups/schedules.html';

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

const box = (page: Page) => page.getByRole('dialog', { name: 'Search', exact: true });
const field = (page: Page) => box(page).getByRole('combobox', { name: 'Search', exact: true });
const hits = (page: Page) => box(page).getByRole('listbox').getByRole('option');

/** The place of the active hit among the hits, as the field names it, or -1. */
const activeHit = (page: Page) =>
  page.evaluate(() => {
    const active = document.querySelector('[role="combobox"]')?.getAttribute('aria-activedescendant');
    return [...document.querySelectorAll('[role="option"]')].findIndex((option) => !!active && option.id === active);
  });

/** Keeps each K key press from the first listener of the window, before any listener of the page. */
const watchKeys = (page: Page) =>
  page.addInitScript(() => {
    addEventListener(
      'keydown',
      (event) => {
        if (event.key.toLowerCase() === 'k') (window as unknown as { lastK: KeyboardEvent }).lastK = event;
      },
      true,
    );
  });
/** Whether the last K key press had its default prevented, so the browser never got it. */
const kPrevented = (page: Page) => page.evaluate(() => (window as unknown as { lastK?: KeyboardEvent }).lastK?.defaultPrevented);

/** Records each request of the search script, with its kind, and each script element that the page adds for it. */
async function recordSearchLoads(page: Page): Promise<{ kinds: string[] }> {
  const kinds: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/__nerddocs/search.js') kinds.push(request.resourceType());
  });
  await page.addInitScript(() => {
    const added: { src: string | null; type: string | null }[] = [];
    (window as unknown as { searchScripts: typeof added }).searchScripts = added;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLScriptElement && node.getAttribute('src')?.includes('search.js')) {
            added.push({ src: node.getAttribute('src'), type: node.getAttribute('type') });
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  return { kinds };
}
const searchScripts = (page: Page) =>
  page.evaluate(() => (window as unknown as { searchScripts: { src: string | null; type: string | null }[] }).searchScripts);

/** The words that the highlight `nd-found` covers, in their order. */
const foundWords = (page: Page) =>
  page.evaluate(() => {
    const found = CSS.highlights.get('nd-found');
    return found ? [...found].map((range) => range.toString().toLowerCase()) : [];
  });

async function expectFoundThenGone(page: Page, words: string[]): Promise<void> {
  await expect.poll(() => foundWords(page), OFTEN).toEqual(words);
  await expect.poll(() => foundWords(page), OFTEN).toEqual([]);
}

/** How far the top of the block sits from the line 30% down the window. A page that cannot scroll further toward the line gives 0. */
const offLine = (page: Page, text: string) =>
  page
    .locator('#page')
    .getByText(text, { exact: true })
    .evaluate((block) => {
      const line = innerHeight * 0.3;
      const top = block.getBoundingClientRect().top;
      const bottom = document.documentElement.scrollHeight - innerHeight;
      if ((top > line && scrollY >= bottom - 1) || (top < line && scrollY <= 0)) return 0;
      return Math.abs(top - line);
    });

async function expectOnLine(page: Page, text: string): Promise<void> {
  await expect.poll(() => offLine(page, text), OFTEN).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => scrollY), 'the page scrolled to the block').toBeGreaterThan(0);
}

/** The color that a level stop shows, as the browser computes it. */
const levelColor = (page: Page, stop: number) =>
  page.evaluate((at) => {
    const probe = document.createElement('span');
    probe.style.color = `var(--l${at})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, stop);

const openAt = async (page: Page, docs: RunningCommand, address: string) => {
  await page.goto(`${docs.address}${address}`);
  await hydrated(page);
};

test.describe('with no script', () => {
  test.use({ javaScriptEnabled: false });

  test('both Search buttons hide', async ({ page, docs }) => {
    await page.goto(`${docs.address}${RESTORE}`);
    await expect(page.getByText('A restore never changes the copy.', { exact: false })).toBeVisible();
    for (const id of ['#findP', '#findR']) {
      await expect(page.locator(id), id).toHaveCount(1);
      await expect(page.locator(id), id).toBeHidden();
    }
  });
});

test('the Search buttons, Ctrl+K and Cmd+K open the box with the focus in its field, and Escape and a click outside close it and give the focus back', async ({ page, docs }) => {
  await watchKeys(page);
  await openAt(page, docs, RESTORE);
  const findP = page.locator('#findP');
  await expect(findP).toBeVisible();
  const search = (await findP.boundingBox())!;
  const hide = (await page.locator('#closeP').boundingBox())!;
  expect(search.x + search.width).toBeLessThanOrEqual(hide.x + 1);
  expect(Math.abs(search.y + search.height / 2 - (hide.y + hide.height / 2))).toBeLessThanOrEqual(1);

  await findP.click();
  await expect(box(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  expect(await field(page).getAttribute('placeholder')).toBeNull();
  const shape = (await box(page).boundingBox())!;
  expect(shape.width).toBeLessThanOrEqual(640);
  expect(Math.abs(shape.x + shape.width / 2 - 640)).toBeLessThanOrEqual(1);
  expect(shape.y).toBeLessThan(720 / 4);
  await page.keyboard.press('Escape');
  await expect(box(page)).toBeHidden();
  await expect(findP).toBeFocused();

  await page.getByRole('button', { name: 'Hide contents', exact: true }).click();
  const findR = page.locator('#findR');
  await expect(findR).toBeVisible();
  const rail = (await findR.boundingBox())!;
  const show = (await page.locator('#openP').boundingBox())!;
  expect(rail.y).toBeGreaterThanOrEqual(show.y + show.height - 1);
  expect(Math.abs(rail.x + rail.width / 2 - (show.x + show.width / 2))).toBeLessThanOrEqual(1);
  await findR.click();
  await expect(box(page)).toBeVisible();
  await page.mouse.click(20, 400);
  await expect(box(page)).toBeHidden();
  await expect(findR).toBeFocused();

  await thumb(page).focus();
  await page.keyboard.press('Control+k');
  await expect(box(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  expect(await kPrevented(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(box(page)).toBeHidden();
  await expect(thumb(page)).toBeFocused();

  await page.keyboard.press('Meta+k');
  await expect(box(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  expect(await kPrevented(page)).toBe(true);
});

test("under 960 px the box fills the window and closes with 'Close search', and the button sits in the head of the menu panel", async ({ page, docs }) => {
  await page.setViewportSize({ width: 500, height: 800 });
  await openAt(page, docs, RESTORE);
  await page.getByRole('button', { name: 'Contents', exact: true }).click();
  const findP = page.locator('#panel .p-head #findP');
  await expect(findP).toBeVisible();
  await findP.click();
  await expect(box(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  const shape = (await box(page).boundingBox())!;
  for (const [key, value] of Object.entries({ x: 0, y: 0, width: 500, height: 800 })) {
    expect(Math.abs(shape[key as keyof typeof shape] - value), key).toBeLessThanOrEqual(1);
  }
  await box(page).getByRole('button', { name: 'Close search', exact: true }).click();
  await expect(box(page)).toBeHidden();
});

test('each key updates the hits, keys move the active hit, and Enter opens a hit of another page at its level, with its block on the line and its words lit', async ({ page, docs }) => {
  const loads = await recordSearchLoads(page);
  await openAt(page, docs, SCHEDULES);
  expect(loads.kinds).toEqual([]);

  await page.keyboard.press('Control+k');
  await field(page).pressSequentially('storage server');
  await expect(hits(page)).toHaveCount(2);
  expect(loads.kinds).toEqual(['script']);
  const [added] = await searchScripts(page);
  expect(added?.src).toBe('../../__nerddocs/search.js');
  expect(added?.type ?? 'text/javascript').toBe('text/javascript');

  const listbox = box(page).getByRole('listbox');
  await expect(field(page)).toHaveAttribute('aria-controls', (await listbox.getAttribute('id'))!);

  const [restoreHit, installHit] = [hits(page).nth(0), hits(page).nth(1)];
  await expect(restoreHit.getByRole('link')).toHaveCount(1);
  await expect(restoreHit.getByRole('link')).toHaveAttribute('href', 'restore.html#internals/pick-a-day');
  await expect(restoreHit).toContainText('Restore a file');
  await expect(restoreHit).toContainText('Pick a day');
  await expect(restoreHit.locator('mark')).toHaveText(['storage', 'server']);
  await expect(restoreHit.locator('svg')).toHaveCount(1);
  expect(await restoreHit.locator('svg').evaluate((icon) => getComputedStyle(icon).color)).toBe(await levelColor(page, 2));

  await expect(installHit.getByRole('link')).toHaveAttribute('href', '../../administration/install.html');
  await expect(installHit).toContainText('Install the server');
  await expect(installHit.locator('svg')).toHaveCount(0);
  const dimensionName = await listbox.getByText('Administration', { exact: true }).boundingBox();
  expect(dimensionName!.y).toBeGreaterThanOrEqual((await restoreHit.boundingBox())!.y);
  expect(dimensionName!.y).toBeLessThan((await installHit.boundingBox())!.y);

  await expect.poll(() => activeHit(page), OFTEN).toBe(0);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => activeHit(page), OFTEN).toBe(1);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => activeHit(page), OFTEN).toBe(0);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => activeHit(page), OFTEN).toBe(1);
  await field(page).fill('restore');
  await expect.poll(() => hits(page).count(), OFTEN).toBeGreaterThan(2);
  await expect.poll(() => activeHit(page), OFTEN).toBe(0);

  await field(page).fill('storage server');
  await expect(hits(page)).toHaveCount(2);
  await expect.poll(() => activeHit(page), OFTEN).toBe(0);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/${RESTORE}#internals/pick-a-day$`));
  await hydrated(page);
  await expectLevel(page, 'internals');
  await expectOnLine(page, 'A restore is a job on the storage server.');
  await expectFoundThenGone(page, ['storage', 'server']);
  expect(await page.evaluate(() => sessionStorage.getItem('nerddocs-found'))).toBeNull();
  await expect(box(page)).toBeHidden();
});

test('a hit on the open page changes the level with no reload, opens its closed details, puts its block on the line and replaces the address', async ({ page, docs }) => {
  await openLive(page, `${docs.address}${RESTORE}`);
  await hydrated(page);
  await expectLevel(page, 'overview');
  const length = await page.evaluate(() => history.length);
  const details = page.locator('#page details');
  await expect(details).not.toHaveAttribute('open');

  await page.keyboard.press('Control+k');
  await field(page).pressSequentially('REQ-2.1');
  await expect(hits(page).first()).toContainText('REQ-2.1 A restore keeps at most 30 days.');
  await page.keyboard.press('Enter');
  await expect(box(page)).toBeHidden();
  await expectLevel(page, 'requirements');
  await expect(details).toHaveAttribute('open');
  await expectOnLine(page, 'REQ-2.1 A restore keeps at most 30 days.');
  await expectFoundThenGone(page, ['req-2.1']);
  await expect(page).toHaveURL(new RegExp(`/${RESTORE}#requirements/limits$`));
  expect(await page.evaluate(() => history.length)).toBe(length);
  await expectNoReload(page);
});

test('the next open after a live update loads the script again, the address of a hit opens its level and heading alone in a new tab, and a click opens a hit', async ({ page, context, ownSite }) => {
  const run = await ownSite(SITE);
  const loads = await recordSearchLoads(page);
  await openLive(page, `${run.address}${SCHEDULES}`);
  await hydrated(page);

  await page.keyboard.press('Control+k');
  await field(page).pressSequentially('sunday');
  await expect(hits(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(box(page)).toBeHidden();
  await page.keyboard.press('Control+k');
  await field(page).fill('sunday');
  await expect(hits(page)).toHaveCount(1);
  expect(loads.kinds).toEqual(['script']);
  await page.keyboard.press('Escape');
  await expect(box(page)).toBeHidden();

  await run.save('user-guide/backups/02-schedules.md', SCHEDULES_PAGE.replace('Sunday', 'Saturday'));
  await expect(page.locator('#page')).toContainText('Saturday');
  await page.keyboard.press('Control+k');
  await field(page).fill('saturday');
  await expect(hits(page)).toHaveCount(1);
  expect(loads.kinds).toEqual(['script', 'script']);

  await field(page).fill('storage server');
  await expect(hits(page)).toHaveCount(2);
  const link = hits(page).first().getByRole('link');
  await expect(link).toHaveAttribute('href', 'restore.html#internals/pick-a-day');
  const tab = await context.newPage();
  await tab.goto(new URL((await link.getAttribute('href'))!, page.url()).href);
  await hydrated(tab);
  await expectLevel(tab, 'internals');
  await expect(tab).toHaveURL(new RegExp(`/${RESTORE}#internals/pick-a-day$`));
  await expect
    .poll(
      () =>
        tab
          .locator('#pick-a-day')
          .evaluate((heading) => Math.abs(heading.getBoundingClientRect().top - parseFloat(getComputedStyle(heading).scrollMarginTop))),
      OFTEN,
    )
    .toBeLessThanOrEqual(1);
  expect(await offLine(tab, 'A restore is a job on the storage server.'), 'the block is not on the line').toBeGreaterThan(50);
  expect(await foundWords(tab)).toEqual([]);
  await tab.close();

  await field(page).fill('saturday');
  await expect(hits(page)).toHaveCount(1);
  await hits(page).first().getByRole('link').click();
  await expect(box(page)).toBeHidden();
  await expectLevel(page, 'requirements');
  await expectFoundThenGone(page, ['saturday']);
  await expect(page).toHaveURL(new RegExp(`/${SCHEDULES}#requirements/weekly-plan$`));
  await expectNoReload(page);
});
