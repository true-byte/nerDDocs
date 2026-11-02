import { chromium, expect, type Locator, type Page } from '@playwright/test';
import {
  expectLevel,
  levelsFile,
  litStop,
  liveRegion,
  MOVE_MS,
  openOnStoppedClock,
  pressOnSlider,
  scrollPage,
  stopPoint,
  stops,
  THREE_LEVELS,
  thumb,
  thumbCenter,
} from '../support/levels.ts';
import {
  expectNoReload,
  failOnPageError,
  holdPageScript,
  hydrated,
  openLive,
  rowOf,
  test as pageTest,
} from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

const DEFAULT_KEY = 'nerddocs-default-level';
const KEPT_KEY = 'nerddocs-page-levels';
const ALL = ['overview', 'requirements', 'internals'];

const CHIP_MS = 8000;
const CHECK_MS = 1200;
/** Longer than each timer of the chip, for a test that shows a timer does not run. */
const LONG_WAIT_MS = 60_000;

const PHONE = { width: 500, height: 800 };

const THREE_PARTS =
  '::: overview\nPick a file and a day.\n::: requirements\nThe app restores any file.\n::: internals\nA restore is a job.\n:::\n';

/** Each step has a shared heading, a short part at two levels, a long part at the third, and a shared last line. */
const STEPS_PAGE = `# Steps

${Array.from(
  { length: 14 },
  (_, n) => `## Step ${n}

::: overview
Overview of step ${n}.
::: requirements
Requirements of step ${n}.
::: internals
${Array.from({ length: 3 }, (_, p) => `Internals of step ${n} paragraph ${p}. ${'A restore is a job on the server. '.repeat(30)}`).join('\n\n')}
:::

Shared end of step ${n}.
`,
).join('\n')}`;

const FILES: Record<string, string> = {
  'nerddocs.json': THREE_LEVELS,
  'install.md': `# Install the agent\n\n${THREE_PARTS}`,
  'licenses.md': '# Licenses\n\n::: internals\nThe key holds an end date.\n:::\n',
  'marks.md': '# Marks\n\n::: overview\nOnly at overview.\n::: overview internals\nAt two levels.\n:::\n',
  'plugins.md': '# Plugins\n\n::: overview\nA plugin adds a store.\n::: requirements\nA plugin answers four calls.\n:::\n',
  'restore.md': `# Restore a file\n\nA restore never changes the copy.\n\n${THREE_PARTS}`,
  'schedules.md': '# Schedules\n\n::: overview\nA plan says how often.\n::: internals\nThe scheduler adds a delay.\n:::\n',
  'steps.md': STEPS_PAGE,
  'storage.md': '# Storage\n\nBlocks are stored once.\n',
};

const LONG_TITLE = 'Restore to another computer and keep the original folder structure with every permission intact';
const MANY_TITLES = [
  'Schedules for laptops',
  'Storage on S3',
  'Retention rules',
  'Restore a whole folder',
  LONG_TITLE,
  'Agents',
  'Agent install',
  'Agent update',
  'Network limits',
  'Encryption keys',
  'Audit log',
  'Alerts',
  'Reports',
  'Quotas',
  'Users',
  'Groups',
  'Single sign-on',
  'Command line',
  'API tokens',
  'Webhooks',
  'Upgrades',
  'Troubleshooting',
  'Known limits',
  'Glossary of terms',
  'Release notes',
];
const topicFile = (n: number) => `topic-${String(n).padStart(2, '0')}`;

const test = pageTest.extend<object, { docs: RunningCommand; manyPages: RunningCommand }>({
  docs: [
    async ({}, use) => {
      const run = await runCommand(FILES);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
  manyPages: [
    async ({}, use) => {
      const topics = MANY_TITLES.map((title, n) => [`${topicFile(n)}.md`, `# ${title}\n\n${THREE_PARTS}`]);
      const run = await runCommand({
        'nerddocs.json': THREE_LEVELS,
        'current.md': `# Current page\n\n${THREE_PARTS}`,
        ...Object.fromEntries(topics),
      });
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

const chip = (page: Page) => page.locator('#chip');
const allPages = (page: Page) => chip(page).getByRole('button');
const defaultsButton = (page: Page) => page.locator('#dflB');
const defaultsBox = (page: Page) => page.locator('#defaults-box');
const levelButton = (page: Page, name: string) => defaultsBox(page).getByRole('button', { name, exact: true });
const modal = (page: Page) => page.locator('#change-pages');
const modalList = (page: Page) => modal(page).locator('.lost');
const modalRows = (page: Page) => modalList(page).locator('> *');
const cancelButton = (page: Page) => modal(page).getByRole('button', { name: 'Cancel' });
const changeButton = (page: Page) => modal(page).getByRole('button', { name: 'Change' });

const storedDefault = (page: Page) => page.evaluate((key) => localStorage.getItem(key), DEFAULT_KEY);
const keptLevels = (page: Page) => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '{}'), KEPT_KEY);

interface Stored {
  defaultLevel?: string;
  kept?: Record<string, { level: string; live: string[] }>;
}

/** Stores levels as earlier visits to the site would have stored them. */
async function seed(page: Page, address: string, { defaultLevel, kept }: Stored): Promise<void> {
  await page.goto(`${address}storage.html`);
  await page.evaluate(
    ([defaultKey, keptKey, level, map]) => {
      if (level) localStorage.setItem(defaultKey!, level);
      if (map) sessionStorage.setItem(keptKey!, map);
    },
    [DEFAULT_KEY, KEPT_KEY, defaultLevel, kept && JSON.stringify(kept)],
  );
}

/** Clicks a stop, and runs the move out on the stopped clock of the page. */
async function moveAndFinish(page: Page, stop: number): Promise<void> {
  await stops(page).nth(stop).click();
  await page.clock.runFor(MOVE_MS);
}

/** The colors of the levels, as the browser works them out. */
const levelColors = (page: Page) =>
  page.evaluate((count) => {
    const probe = document.body.appendChild(document.createElement('i'));
    const colors = Array.from({ length: count }, (_, n) => {
      probe.style.color = `var(--l${n})`;
      return getComputedStyle(probe).color;
    });
    probe.remove();
    return colors;
  }, ALL.length);

/** The colors of the old and the new level icon of an element, which are its first and its last icon. */
const iconColors = (icons: Locator) =>
  icons.evaluateAll((all) => [all[0], all.at(-1)].map((icon) => getComputedStyle(icon!).color));

const rowsOfModal = (page: Page) =>
  modalRows(page).evaluateAll((rows) =>
    rows.map((row) => {
      const icons = row.querySelectorAll('svg');
      return {
        title: (row as HTMLElement).innerText.trim(),
        from: getComputedStyle(icons[0]!).color,
        to: getComputedStyle(icons[icons.length - 1]!).color,
      };
    }),
  );

const clickOutside = (page: Page) => page.mouse.click(4, 4);

/** The event that the browser fires when it restores a page from its back cache. */
const showFromBackCache = (page: Page) =>
  page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));

const backdropColor = (dialog: Locator) => dialog.evaluate((el) => getComputedStyle(el, '::backdrop').backgroundColor);
const CLEAR = 'rgba(0, 0, 0, 0)';

const CLOSE_WAYS: Record<string, (page: Page) => Promise<void>> = {
  Cancel: (page) => cancelButton(page).click(),
  Esc: (page) => page.keyboard.press('Escape'),
  'a click outside': clickOutside,
};

test.describe('a kept level', () => {
  test('a slider move holds on a reload, a tree click and back, another page opens at the default, and a move back to the default ends the hold', async ({ page, docs }) => {
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await stops(page).nth(2).click();
    await expectLevel(page, 'internals');
    await expect
      .poll(() => keptLevels(page), OFTEN)
      .toEqual({ '/restore.html': { level: 'internals', live: ALL } });

    await page.reload();
    await hydrated(page);
    await expectLevel(page, 'internals');
    await expect(litStop(page)).toHaveText('Internals');
    await expect(thumb(page)).toHaveAttribute('aria-valuetext', 'Internals');
    await expect(page.getByText('A restore is a job.')).toBeVisible();
    await expect(chip(page)).toHaveCount(0);

    await rowOf(page, 'Schedules').click();
    await expect(page.locator('main h1')).toHaveText('Schedules');
    await hydrated(page);
    await expectLevel(page, 'overview');
    await expect(chip(page)).toHaveCount(0);

    await rowOf(page, 'Restore a file').click();
    await expect(page.locator('main h1')).toHaveText('Restore a file');
    await hydrated(page);
    await expectLevel(page, 'internals');

    await page.goBack();
    await expect(page.locator('main h1')).toHaveText('Schedules');
    await page.goBack();
    await expect(page.locator('main h1')).toHaveText('Restore a file');
    await hydrated(page);
    await expectLevel(page, 'internals');

    await stops(page).nth(0).click();
    await expect.poll(() => keptLevels(page), OFTEN).toEqual({});
  });

  test('a new tab opens at the default, and the first tab keeps its level', async ({ page, context, docs }) => {
    await seed(page, docs.address, { defaultLevel: 'requirements' });
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await expectLevel(page, 'requirements');
    await stops(page).nth(2).click();
    await expect.poll(() => keptLevels(page), OFTEN).not.toEqual({});

    const newTab = await context.newPage();
    await newTab.goto(`${docs.address}restore.html`);
    await hydrated(newTab);
    await expectLevel(newTab, 'requirements');
    await expect(chip(newTab)).toHaveCount(0);

    await expectLevel(page, 'internals');
  });

  test('a storage that throws leaves the page working, and a change lasts until the page closes', async ({ page, docs }) => {
    await page.addInitScript(() => {
      for (const name of ['localStorage', 'sessionStorage']) {
        Object.defineProperty(window, name, {
          get() {
            throw new Error('The browser blocks storage.');
          },
        });
      }
    });
    const errors = failOnPageError(page);
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await expectLevel(page, 'overview');

    await stops(page).nth(1).click();
    await expectLevel(page, 'requirements');
    await showFromBackCache(page);
    await expectLevel(page, 'requirements');

    await defaultsButton(page).click();
    await levelButton(page, 'Internals').click();
    await expect(modal(page)).toContainText('Change 1 page?');
    await changeButton(page).click();
    await expectLevel(page, 'internals');
    await expect(levelButton(page, 'Internals')).toHaveAttribute('aria-pressed', 'true');
    await showFromBackCache(page);
    await expectLevel(page, 'internals');
    await expect(levelButton(page, 'Internals')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });
});

test.describe('the first paint', () => {
  test('a kept level shows before the page script runs, in the text, the lit stop and the thumb, and hydrates with no error', async ({ page, docs }) => {
    const errors = failOnPageError(page);
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await stops(page).nth(2).click();
    await expect.poll(() => keptLevels(page), OFTEN).not.toEqual({});

    const release = await holdPageScript(page);
    await page.reload({ waitUntil: 'commit' });
    await expect(page.getByText('A restore is a job.')).toBeVisible();
    await expect(page.getByText('Pick a file and a day.')).toBeHidden();

    const color = (await levelColors(page))[2]!;
    await expect(stops(page).nth(2)).toHaveCSS('font-weight', '700');
    await expect(stops(page).nth(2)).toHaveCSS('color', color);
    await expect(stops(page).nth(0)).not.toHaveCSS('font-weight', '700');
    await expect(thumb(page)).toHaveCSS('background-color', color);
    const stopBox = (await stops(page).nth(2).boundingBox())!;
    const before = await thumbCenter(page);
    expect(Math.abs(before - (stopBox.x + stopBox.width / 2))).toBeLessThan(2);

    release();
    await hydrated(page);
    await expectLevel(page, 'internals');
    await expect(litStop(page)).toHaveText('Internals');
    await expect(thumb(page)).toHaveAttribute('aria-valuenow', '3');
    await expect(stops(page).nth(0)).not.toHaveCSS('font-weight', '700');
    await expect.poll(() => thumbCenter(page), OFTEN).toBeCloseTo(before, 0);
    await expect(chip(page)).toHaveCount(0);
    expect(errors).toEqual([]);

    // The style of the head script is gone, so the thumb and the lit stop follow a move.
    await stops(page).nth(0).click();
    const first = (await stops(page).nth(0).boundingBox())!;
    await expect.poll(async () => Math.abs((await thumbCenter(page)) - (first.x + first.width / 2)), OFTEN).toBeLessThan(2);
    await expect(stops(page).nth(2)).not.toHaveCSS('font-weight', '700');
  });

  test('a page without the default shows a lower level before the page script runs, or a higher one when none is lower, and the default stays stored', async ({ page, docs }) => {
    const errors = failOnPageError(page);
    await seed(page, docs.address, { defaultLevel: 'internals' });
    const release = await holdPageScript(page);
    await page.goto(`${docs.address}plugins.html`, { waitUntil: 'commit' });
    await expect(page.getByText('A plugin answers four calls.')).toBeVisible();
    await expect(page.getByText('A plugin adds a store.')).toBeHidden();
    await expect(stops(page).nth(1)).toHaveCSS('font-weight', '700');

    release();
    await hydrated(page);
    await expectLevel(page, 'requirements');
    await expect(litStop(page)).toHaveText('Requirements');
    await expect(chip(page)).toHaveCount(0);
    expect(await storedDefault(page)).toBe('internals');

    await page.evaluate((key) => localStorage.setItem(key, 'requirements'), DEFAULT_KEY);
    await page.goto(`${docs.address}licenses.html`);
    await expect(page.getByText('The key holds an end date.')).toBeVisible();
    await hydrated(page);
    await expectLevel(page, 'internals');
    await expect(chip(page)).toHaveCount(0);
    expect(await storedDefault(page)).toBe('requirements');
    expect(errors).toEqual([]);
  });

  test('the marks follow the kept level after hydration', async ({ page, docs }) => {
    await seed(page, docs.address, { kept: { '/marks.html': { level: 'internals', live: ['overview', 'internals'] } } });
    await page.goto(`${docs.address}marks.html`);
    await hydrated(page);
    await expectLevel(page, 'internals');
    await expect(page.locator('#page')).toHaveClass('samemarks');
  });

  test.describe('on a phone', () => {
    test.use({ viewport: PHONE });

    test('the row above the stops names no wrong level before the page script runs', async ({ page, docs }) => {
      await seed(page, docs.address, { kept: { '/restore.html': { level: 'internals', live: ALL } } });
      const release = await holdPageScript(page);
      await page.goto(`${docs.address}restore.html`, { waitUntil: 'commit' });
      await expect(page.getByText('A restore is a job.')).toBeVisible();
      await expect(page.locator('.b1').getByText('Overview')).toBeHidden();

      release();
      await hydrated(page);
      await expect(page.locator('.b1 > span')).toHaveText('Internals');
    });
  });

  test('back after a default change on another page opens at the new default, and so does a page from the back cache, with no chip', async ({ page, docs }) => {
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await expectLevel(page, 'overview');
    await rowOf(page, 'Schedules').click();
    await expect(page.locator('main h1')).toHaveText('Schedules');
    await hydrated(page);
    await defaultsButton(page).click();
    await levelButton(page, 'Internals').click();
    await expect(levelButton(page, 'Internals')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');

    await page.goBack();
    await expect(page.locator('main h1')).toHaveText('Restore a file');
    await hydrated(page);
    await expectLevel(page, 'internals');
    await expect(chip(page)).toHaveCount(0);

    // The Chromium of Playwright runs with its back cache off. So the test changes storage as another
    // page does, and fires the event that the browser fires when it restores a page from that cache.
    await page.evaluate((key) => localStorage.setItem(key, 'requirements'), DEFAULT_KEY);
    await showFromBackCache(page);
    await expectLevel(page, 'requirements');
    await expect(litStop(page)).toHaveText('Requirements');
    await expect(chip(page)).toHaveCount(0);
  });
});

test.describe('the chip', () => {
  test('a move shows the first level and the new level, the live region says it, and a move back takes it away', async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await expect(chip(page)).toHaveCount(0);
    const colors = await levelColors(page);

    await moveAndFinish(page, 2);
    await expect(allPages(page)).toHaveText('All pages');
    await expect(liveRegion(page)).toContainText('All pages');
    expect(await iconColors(chip(page).locator('svg'))).toEqual([colors[0], colors[2]]);

    await moveAndFinish(page, 1);
    await expect(chip(page)).toBeVisible();
    expect(await iconColors(chip(page).locator('svg'))).toEqual([colors[0], colors[1]]);

    await moveAndFinish(page, 0);
    await expect(chip(page)).toHaveCount(0);
  });

  test('a move back to the first level or to what the default gives this page takes it away', async ({ page, docs }) => {
    await seed(page, docs.address, {
      defaultLevel: 'requirements',
      kept: { '/restore.html': { level: 'internals', live: ALL } },
    });
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await expectLevel(page, 'internals');

    await moveAndFinish(page, 0);
    await expect(chip(page)).toBeVisible();

    await moveAndFinish(page, 2);
    await expect(chip(page)).toHaveCount(0);

    await moveAndFinish(page, 0);
    await expect(chip(page)).toBeVisible();

    await moveAndFinish(page, 1);
    await expect(chip(page)).toHaveCount(0);
  });

  test('it leaves 8 s after the last move', async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await moveAndFinish(page, 2);
    await page.clock.runFor(CHIP_MS - 3000);
    await expect(chip(page)).toBeVisible();

    await moveAndFinish(page, 1);
    await page.clock.runFor(CHIP_MS - 1000);
    await expect(chip(page)).toBeVisible();

    await page.clock.runFor(1000 + MOVE_MS);
    await expect(chip(page)).toHaveCount(0);
  });

  test('a hover pauses its timer, and the timer runs again once the pointer leaves', async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await moveAndFinish(page, 2);

    await chip(page).hover();
    await expect(chip(page)).toHaveAttribute('data-held');
    await page.clock.runFor(LONG_WAIT_MS);
    await expect(chip(page)).toBeVisible();

    await page.mouse.move(4, 4);
    await expect(chip(page)).not.toHaveAttribute('data-held');
    await page.clock.runFor(CHIP_MS + MOVE_MS);
    await expect(chip(page)).toHaveCount(0);
  });

  test('focus inside it pauses its timer after a mouse move', async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await moveAndFinish(page, 2);
    await allPages(page).focus();
    await expect(chip(page)).toHaveAttribute('data-held');
    await page.clock.runFor(LONG_WAIT_MS);
    await expect(chip(page)).toBeVisible();
  });

  test('after a keyboard move, a click on a stop or on the track keeps the first level', async ({ page, docs }) => {
    await seed(page, docs.address, {
      defaultLevel: 'requirements',
      kept: { '/restore.html': { level: 'internals', live: ALL } },
    });
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    const colors = await levelColors(page);

    await pressOnSlider(page, 'Home');
    await page.clock.runFor(MOVE_MS);
    await expect(chip(page)).toBeVisible();
    await moveAndFinish(page, 2);
    await expect(chip(page)).toHaveCount(0);

    await pressOnSlider(page, 'Home');
    await page.clock.runFor(MOVE_MS);
    await moveAndFinish(page, 1);
    await expect(chip(page)).toHaveCount(0);

    await page.evaluate(([defaultKey, keptKey]) => {
      localStorage.removeItem(defaultKey!);
      sessionStorage.removeItem(keptKey!);
    }, [DEFAULT_KEY, KEPT_KEY]);
    await page.reload();
    await hydrated(page);
    await expectLevel(page, 'overview');

    await pressOnSlider(page, 'End');
    await page.clock.runFor(MOVE_MS);
    await moveAndFinish(page, 1);
    expect(await iconColors(chip(page).locator('svg'))).toEqual([colors[0], colors[1]]);

    await pressOnSlider(page, 'End');
    await page.clock.runFor(MOVE_MS);
    const { x, y } = await stopPoint(page, 1, ALL.length);
    await page.mouse.click(x, y);
    await page.clock.runFor(MOVE_MS);
    await expectLevel(page, 'requirements');
    expect(await iconColors(chip(page).locator('svg'))).toEqual([colors[0], colors[1]]);
  });

  test('after a keyboard move it stays until focus leaves the slider and the chip, and it is the next Tab stop after the slider', async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await pressOnSlider(page, 'End');
    await page.clock.runFor(LONG_WAIT_MS);
    await expect(chip(page)).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'All pages' })).toBeFocused();
    await page.clock.runFor(LONG_WAIT_MS);
    await expect(chip(page)).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Go to text' })).toBeFocused();
    await page.clock.runFor(CHIP_MS + MOVE_MS);
    await expect(chip(page)).toHaveCount(0);
  });

  test('hiding the panel removes it, and showing the panel does not bring it back', async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await moveAndFinish(page, 2);
    await expect(chip(page)).toBeVisible();

    await page.getByRole('button', { name: 'Hide panel' }).click();
    await expect(chip(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show panel' }).click();
    await page.clock.runFor(MOVE_MS);
    await expect(thumb(page)).toBeVisible();
    await expect(chip(page)).toHaveCount(0);
  });

  test('it sits right above the panel on a wide window, and centered above the bar on a phone', async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await moveAndFinish(page, 2);
    const wide = (await chip(page).boundingBox())!;
    const wideBar = (await page.locator('#bar').boundingBox())!;
    expect(wide.y + wide.height).toBeLessThanOrEqual(wideBar.y);
    expect(Math.abs(wide.x + wide.width - (wideBar.x + wideBar.width))).toBeLessThan(2);

    await page.setViewportSize(PHONE);
    await expect(page.locator('#menuB')).toBeVisible();
    await expect.poll(async () => {
      const box = (await chip(page).boundingBox())!;
      return Math.abs(box.x + box.width / 2 - PHONE.width / 2);
    }, OFTEN).toBeLessThan(2);
    const phone = (await chip(page).boundingBox())!;
    const tab = (await page.locator('#tab').boundingBox())!;
    expect(phone.y + phone.height).toBeLessThanOrEqual(tab.y);
  });
});

test.describe("'All pages'", () => {
  test('with no kept page it sets the default at once, shows a check for 1.2 s, then the chip leaves and focus is on the thumb', async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await moveAndFinish(page, 2);

    await page.getByRole('button', { name: 'All pages' }).click();
    await expect(modal(page)).toBeHidden();
    await expect(allPages(page)).toBeDisabled();
    await expect(allPages(page).locator('svg')).toBeVisible();
    await expect(thumb(page)).toBeFocused();
    expect(await storedDefault(page)).toBe('internals');
    expect(await keptLevels(page)).toEqual({});

    await page.clock.runFor(CHECK_MS - 100);
    await expect(allPages(page)).toBeDisabled();
    await page.clock.runFor(200);
    await expect(chip(page)).toHaveCount(0);
    await expectLevel(page, 'internals');
  });

  test('with kept pages it opens the modal with a row for each changed page in tree order, and Cancel has the focus', async ({ page, docs }) => {
    // Real moves, so that the rows come from the live levels that the pages stored.
    for (const [file, stop] of [['schedules', 2], ['plugins', 1], ['install', 2]] as const) {
      await page.goto(`${docs.address}${file}.html`);
      await hydrated(page);
      const before = Object.keys(await keptLevels(page)).length;
      await stops(page).nth(stop).click();
      await expect.poll(async () => Object.keys(await keptLevels(page)).length, OFTEN).toBe(before + 1);
    }

    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await moveAndFinish(page, 1);
    await page.getByRole('button', { name: 'All pages' }).click();

    await expect(modal(page)).toBeVisible();
    await expect(modal(page)).toHaveRole('alertdialog');
    await expect(modal(page)).toContainText('Change 2 pages?');
    await expect(cancelButton(page)).toBeFocused();
    const colors = await levelColors(page);
    expect(await rowsOfModal(page)).toEqual([
      { title: 'Install the agent', from: colors[2], to: colors[1] },
      { title: 'Schedules', from: colors[2], to: colors[0] },
    ]);

    const no = (await cancelButton(page).boundingBox())!;
    const yes = (await changeButton(page).boundingBox())!;
    expect(yes.height).toBeLessThan(no.height);
    expect(Math.abs(yes.y + yes.height / 2 - (no.y + no.height / 2))).toBeLessThan(1);
  });

  test('Cancel, Esc and a click outside change nothing, and the chip timer stops while the modal is open and starts again on a cancel', async ({ page, docs }) => {
    const kept = { '/schedules.html': { level: 'internals', live: ['overview', 'internals'] } };
    await seed(page, docs.address, { kept });
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await moveAndFinish(page, 1);
    const all = { ...kept, '/restore.html': { level: 'requirements', live: ALL } };

    for (const [name, close] of Object.entries(CLOSE_WAYS)) {
      await page.getByRole('button', { name: 'All pages' }).click();
      await expect(modal(page), name).toBeVisible();
      await close(page);
      await expect(modal(page), name).toBeHidden();
      expect(await storedDefault(page), name).toBeNull();
      expect(await keptLevels(page), name).toEqual(all);
      await expectLevel(page, 'requirements');
      await expect(page.getByRole('button', { name: 'All pages' }), name).toBeEnabled();
    }

    await page.getByRole('button', { name: 'All pages' }).click();
    await page.clock.runFor(LONG_WAIT_MS);
    await expect(modal(page)).toBeVisible();
    await expect(chip(page)).toBeVisible();

    await cancelButton(page).click();
    await expect(thumb(page)).toBeFocused();
    await page.mouse.move(4, 4);
    await expect(chip(page)).not.toHaveAttribute('data-held');
    await page.clock.runFor(CHIP_MS + MOVE_MS);
    await expect(chip(page)).toHaveCount(0);
  });

  test('after a keyboard move the chip stays through the modal: Cancel leaves it, and Change shows the check', async ({ page, docs }) => {
    await seed(page, docs.address, { kept: { '/schedules.html': { level: 'internals', live: ['overview', 'internals'] } } });
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await pressOnSlider(page, 'ArrowRight');
    await page.keyboard.press('Tab');
    await expect(allPages(page)).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(modal(page)).toBeVisible();
    await expect(chip(page)).toBeVisible();
    await cancelButton(page).click();
    await expect(modal(page)).toBeHidden();
    await expect(chip(page)).toBeVisible();
    await expect(thumb(page)).toBeFocused();

    await allPages(page).click();
    await expect(modal(page)).toBeVisible();
    await expect(chip(page)).toBeVisible();
    await changeButton(page).click();
    await expect(allPages(page)).toBeDisabled();
    await expect(allPages(page).locator('svg')).toBeVisible();
    await expect(thumb(page)).toBeFocused();
  });

  test('Change sets the default and clears the kept levels, then the check shows and the current page stays', async ({ page, docs }) => {
    await seed(page, docs.address, { kept: { '/schedules.html': { level: 'internals', live: ['overview', 'internals'] } } });
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await moveAndFinish(page, 1);

    await page.getByRole('button', { name: 'All pages' }).click();
    await changeButton(page).click();

    await expect(modal(page)).toBeHidden();
    await expect.poll(() => storedDefault(page), OFTEN).toBe('requirements');
    await expect.poll(() => keptLevels(page), OFTEN).toEqual({});
    await expect(allPages(page)).toBeDisabled();
    await expect(thumb(page)).toBeFocused();
    await expectLevel(page, 'requirements');

    await page.clock.runFor(CHECK_MS + 100);
    await expect(chip(page)).toHaveCount(0);
  });
});

test.describe('the modal with many pages', () => {
  const COUNT_TITLE = `Change ${MANY_TITLES.length} pages?`;
  const allKept = () =>
    Object.fromEntries(MANY_TITLES.map((_, n) => [`/${topicFile(n)}.html`, { level: 'internals', live: ALL }]));

  /** Keeps a level for each page, and opens the modal by a pick in 'Defaults', from the panel on a phone. */
  async function openWithManyRows(page: Page, manyPages: RunningCommand): Promise<void> {
    await seed(page, manyPages.address, { kept: allKept() });
    await page.goto(`${manyPages.address}current.html`);
    await hydrated(page);
    if (await page.locator('#menuB').isVisible()) {
      await page.locator('#menuB').click();
      await page.locator('#dfl2').click();
    } else {
      await defaultsButton(page).click();
    }
    await levelButton(page, 'Requirements').click();
    await expect(modal(page)).toBeVisible();
  }

  const fixedParts = (page: Page) => [modal(page).getByText(COUNT_TITLE), cancelButton(page), changeButton(page)];
  /** The tops of the heading and the buttons, which a scroll of the list must not move. */
  const fixedTops = (page: Page) => Promise.all(fixedParts(page).map(async (part) => (await part.boundingBox())!.y));

  const WINDOWS = {
    'wide window': { width: 1280, height: 800 },
    'short window': { width: 1280, height: 400 },
    'phone window': { width: 360, height: 640 },
    'phone window on its side': { width: 667, height: 375 },
  };

  for (const [name, viewport] of Object.entries(WINDOWS)) {
    test.describe(`in a ${name}`, () => {
      test.use({ viewport });

      test('the list scrolls at 40vh in tree order, the heading and buttons stay in view, the last row is reachable, and a long title wraps', async ({ page, manyPages }) => {
        await openWithManyRows(page, manyPages);
        await expect(modalRows(page)).toHaveCount(MANY_TITLES.length);
        expect((await modalRows(page).allInnerTexts()).map((text) => text.trim())).toEqual(MANY_TITLES);

        const list = await modalList(page).evaluate((el) => ({
          height: el.clientHeight,
          content: el.scrollHeight,
          sideways: el.scrollWidth - el.clientWidth,
          overscroll: getComputedStyle(el).overscrollBehaviorY,
          right: el.getBoundingClientRect().left + el.clientWidth,
        }));
        expect(list.content).toBeGreaterThan(list.height);
        expect(list.height).toBeLessThanOrEqual(viewport.height * 0.4 + 1);
        expect(list.sideways).toBe(0);
        expect(list.overscroll).toBe('contain');

        for (const part of fixedParts(page)) await expect(part).toBeInViewport({ ratio: 1 });
        await expect(modalRows(page).last()).not.toBeInViewport();
        const tops = await fixedTops(page);

        const long = modalRows(page).nth(MANY_TITLES.indexOf(LONG_TITLE));
        await long.scrollIntoViewIfNeeded();
        expect((await long.boundingBox())!.height).toBeGreaterThan((await modalRows(page).nth(MANY_TITLES.indexOf(LONG_TITLE) + 1).boundingBox())!.height * 1.5);
        for (const icon of await long.locator('svg').all()) {
          const box = (await icon.boundingBox())!;
          expect(box.x + box.width).toBeLessThanOrEqual(list.right + 1);
        }

        await modalRows(page).last().scrollIntoViewIfNeeded();
        await expect(modalRows(page).last()).toBeInViewport({ ratio: 1 });
        for (const part of fixedParts(page)) await expect(part).toBeInViewport({ ratio: 1 });
        expect(await fixedTops(page)).toEqual(tops);
      });
    });
  }

  test('a key reaches the last row: Shift+Tab from Cancel lands on the list, and End scrolls it', async ({ page, manyPages }) => {
    await openWithManyRows(page, manyPages);
    await expect(cancelButton(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(modalList(page)).toBeFocused();
    await page.keyboard.press('End');
    await expect(modalRows(page).last()).toBeInViewport();
  });

  test('from a scrolled list, Cancel leaves every page and returns to the box, and Change clears every page', async ({ page, manyPages }) => {
    await openWithManyRows(page, manyPages);
    await modalRows(page).last().scrollIntoViewIfNeeded();
    await cancelButton(page).click();
    await expect(modal(page)).toBeHidden();
    await expect(defaultsBox(page)).toBeVisible();
    expect(Object.keys(await keptLevels(page))).toHaveLength(MANY_TITLES.length);
    expect(await storedDefault(page)).toBeNull();

    await levelButton(page, 'Requirements').click();
    await modalRows(page).last().scrollIntoViewIfNeeded();
    await changeButton(page).click();
    await expect(modal(page)).toBeHidden();
    await expect(defaultsBox(page)).toBeVisible();
    await expect.poll(() => keptLevels(page), OFTEN).toEqual({});
    await expect.poll(() => storedDefault(page), OFTEN).toBe('requirements');
  });

  test("'All pages' opens the same list", async ({ page, manyPages }) => {
    await seed(page, manyPages.address, { kept: allKept() });
    await openOnStoppedClock(page, `${manyPages.address}current.html`);
    await moveAndFinish(page, 1);
    await page.getByRole('button', { name: 'All pages' }).click();
    await expect(modal(page)).toContainText(COUNT_TITLE);
    await expect(modalRows(page)).toHaveCount(MANY_TITLES.length);
  });
});

test.describe("the 'Defaults' box", () => {
  test('it lists each level under its label, and Esc and a click outside close it', async ({ page, docs }) => {
    await seed(page, docs.address, { kept: { '/restore.html': { level: 'internals', live: ALL } } });
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await expectLevel(page, 'internals');

    await expect(defaultsButton(page)).toHaveAttribute('aria-label', 'Defaults');
    await expect(defaultsButton(page)).toHaveAttribute('title', 'Defaults');
    const clock = (await page.locator('#timeB').boundingBox())!;
    expect((await defaultsButton(page).boundingBox())!.x).toBeGreaterThan(clock.x);

    await defaultsButton(page).click();
    await expect(defaultsBox(page)).toBeVisible();
    await expect(defaultsBox(page)).toHaveAttribute('aria-label', 'Defaults');
    await expect(defaultsBox(page)).toContainText('Default level');
    await expect(defaultsBox(page).getByRole('button')).toHaveText(['Overview', 'Requirements', 'Internals']);
    await expect(levelButton(page, 'Overview')).toHaveAttribute('aria-pressed', 'true');
    await expect(levelButton(page, 'Internals')).toHaveAttribute('aria-pressed', 'false');

    await page.keyboard.press('Escape');
    await expect(defaultsBox(page)).toBeHidden();
    await expect(defaultsButton(page)).toBeFocused();

    await defaultsButton(page).click();
    await clickOutside(page);
    await expect(defaultsBox(page)).toBeHidden();
    await expect(defaultsButton(page)).toBeFocused();
  });

  test('with no reader default, the author default shows as selected', async ({ page, ownSite }) => {
    const run = await ownSite({
      'nerddocs.json': JSON.stringify({ ...JSON.parse(THREE_LEVELS), defaultLevel: 'requirements' }),
      'restore.md': `# Restore a file\n\n${THREE_PARTS}`,
    });
    await page.goto(`${run.address}restore.html`);
    await hydrated(page);
    await defaultsButton(page).click();
    await expect(levelButton(page, 'Requirements')).toHaveAttribute('aria-pressed', 'true');
    await expect(levelButton(page, 'Overview')).toHaveAttribute('aria-pressed', 'false');
  });

  test('a default set in another tab shows in the box and ends the chip for that level, and the open page stays', async ({ page, context, docs }) => {
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);

    const otherTab = await context.newPage();
    await otherTab.goto(`${docs.address}restore.html`);
    await hydrated(otherTab);
    await defaultsButton(otherTab).click();
    await levelButton(otherTab, 'Internals').click();
    await expect(levelButton(otherTab, 'Internals')).toHaveAttribute('aria-pressed', 'true');
    await otherTab.close();

    await defaultsButton(page).click();
    await expect(levelButton(page, 'Internals')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expectLevel(page, 'overview');

    await stops(page).nth(2).click();
    await expectLevel(page, 'internals');
    await expect(chip(page)).toHaveCount(0);
  });

  test('a pick with no changed page applies at once, holds the place, leaves the box open and shows no chip', async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}steps.html`);
    const topOf = (text: string) => page.getByText(text).evaluate((el) => el.getBoundingClientRect().top);
    const line = await page.evaluate(() => innerHeight * 0.3);
    await scrollPage(page, (await page.evaluate(() => scrollY)) + (await topOf('Overview of step 7.')) - line);
    const before = await topOf('Overview of step 7.');

    await defaultsButton(page).click();
    await levelButton(page, 'Internals').click();
    await expect(modal(page)).toBeHidden();
    await expectLevel(page, 'internals');
    await page.clock.runFor(MOVE_MS);

    expect(await storedDefault(page)).toBe('internals');
    await expect(defaultsBox(page)).toBeVisible();
    await expect(levelButton(page, 'Internals')).toHaveAttribute('aria-pressed', 'true');
    await expect(levelButton(page, 'Overview')).toHaveAttribute('aria-pressed', 'false');
    expect(Math.abs((await topOf('Internals of step 7 paragraph 0')) - before)).toBeLessThan(2);
    await expect(chip(page)).toHaveCount(0);
  });

  test('a pick with a changed page returns to the box after a cancel, and stays open after a change', async ({ page, docs }) => {
    const kept = { '/schedules.html': { level: 'internals', live: ['overview', 'internals'] } };
    await seed(page, docs.address, { kept });
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await defaultsButton(page).click();

    for (const close of ['Cancel', 'Esc']) {
      await levelButton(page, 'Requirements').click();
      await expect(modal(page), close).toBeVisible();
      await expect(modal(page), close).toContainText('Change 1 page?');
      await expect(cancelButton(page), close).toBeFocused();
      await expect(defaultsBox(page), close).toHaveCSS('opacity', '0');
      expect(await backdropColor(defaultsBox(page)), close).toBe(CLEAR);
      await CLOSE_WAYS[close]!(page);
      await expect(modal(page), close).toBeHidden();
      await expect(defaultsBox(page), close).toHaveCSS('opacity', '1');
      expect(await backdropColor(defaultsBox(page)), close).not.toBe(CLEAR);
      await expect(levelButton(page, 'Requirements'), close).toBeFocused();
      await expect(levelButton(page, 'Overview'), close).toHaveAttribute('aria-pressed', 'true');
      await expectLevel(page, 'overview');
      expect(await storedDefault(page), close).toBeNull();
      expect(await keptLevels(page), close).toEqual(kept);
    }

    await levelButton(page, 'Requirements').click();
    await changeButton(page).click();
    await expect(modal(page)).toBeHidden();
    await expect(defaultsBox(page)).toBeVisible();
    await expect(levelButton(page, 'Requirements')).toHaveAttribute('aria-pressed', 'true');
    await expectLevel(page, 'requirements');
    expect(await storedDefault(page)).toBe('requirements');
    expect(await keptLevels(page)).toEqual({});
    await expect(chip(page)).toHaveCount(0);
  });

  test('a pick takes away a chip that shows', async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    await moveAndFinish(page, 2);
    await expect(chip(page)).toBeVisible();
    await defaultsButton(page).click();
    await levelButton(page, 'Internals').click();
    await expect(chip(page)).toHaveCount(0);
    await expectLevel(page, 'internals');
    expect(await storedDefault(page)).toBe('internals');
  });

  test('the button shows on a page with no parts, and a pick there moves nothing on the page', async ({ page, docs }) => {
    await page.goto(`${docs.address}storage.html`);
    await hydrated(page);
    await expect(page.locator('#no-levels')).toBeVisible();
    await expect(page.locator('#bar #dflB')).toBeVisible();

    await defaultsButton(page).click();
    await levelButton(page, 'Internals').click();
    await expect(levelButton(page, 'Internals')).toHaveAttribute('aria-pressed', 'true');
    expect(await storedDefault(page)).toBe('internals');
    await expect(page.locator('.stop, .track, #thumb')).toHaveCount(0);
    await expect(page.getByText('Blocks are stored once.')).toBeVisible();
  });

  test('no button shows on a site with no levels or one level, on a wide window and on a phone', async ({ page, site, ownSite }) => {
    const oneLevel = await ownSite({
      'nerddocs.json': levelsFile('overview'),
      'restore.md': '# Restore a file\n\n::: overview\nPick a file and a day.\n:::\n',
    });
    for (const address of [`${site.address}storage.html`, `${oneLevel.address}restore.html`]) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(address);
      await hydrated(page);
      await expect(page.locator('#dflB, #dfl2, #defaults-box')).toHaveCount(0);

      await page.setViewportSize(PHONE);
      await page.locator('#menuB').click();
      await expect(page.locator('#panel')).toBeVisible();
      await expect(page.locator('#dflB, #dfl2, #defaults-box')).toHaveCount(0);
    }
  });

  test('the box and the modal keep the side gutter next to a classic scrollbar', async ({ docs }) => {
    const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    const gutterWidth = async (dialog: Locator) =>
      (await page.evaluate(() => document.documentElement.clientWidth)) - (await dialog.boundingBox())!.width;

    await seed(page, docs.address, { kept: { '/schedules.html': { level: 'internals', live: ['overview', 'internals'] } } });
    await page.goto(`${docs.address}steps.html`);
    await hydrated(page);
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBeLessThan(390);
    await page.locator('#menuB').click();
    await page.locator('#dfl2').click();
    expect(await gutterWidth(defaultsBox(page))).toBeCloseTo(32, 0);

    await levelButton(page, 'Requirements').click();
    await expect(modal(page)).toBeVisible();
    expect(await gutterWidth(modal(page))).toBeCloseTo(32, 0);
    await browser.close();
  });

  test.describe('on a phone', () => {
    test.use({ viewport: PHONE });

    test('the button sits at the foot of the contents panel, opens the box, and takes the focus back', async ({ page, docs }) => {
      await page.goto(`${docs.address}restore.html`);
      await hydrated(page);
      await expect(defaultsButton(page)).toBeHidden();
      await page.locator('#menuB').click();

      const button = page.locator('#panel #dfl2');
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('aria-label', 'Defaults');
      await button.click();
      await expect(defaultsBox(page)).toBeVisible();
      await levelButton(page, 'Internals').click();
      await expect(levelButton(page, 'Internals')).toHaveAttribute('aria-pressed', 'true');
      expect(await storedDefault(page)).toBe('internals');

      await page.keyboard.press('Escape');
      await expect(defaultsBox(page)).toBeHidden();
      await expect(button).toBeFocused();
    });
  });
});

test.describe('live updates', () => {
  test('a save keeps the kept level with no chip, and a save that takes away its text moves to the nearest lower level', async ({ page, ownSite }) => {
    const source = `# Restore a file\n\n${THREE_PARTS}`;
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': source });
    await page.goto(`${run.address}restore.html`);
    await hydrated(page);
    await stops(page).nth(2).click();
    await expect.poll(() => keptLevels(page), OFTEN).not.toEqual({});

    await openLive(page, `${run.address}restore.html`);
    await hydrated(page);
    await expectLevel(page, 'internals');

    await run.save('restore.md', source.replace('A restore is a job.', 'A restore is a job on the server.'));
    await expect(page.getByText('A restore is a job on the server.')).toBeVisible();
    await expectLevel(page, 'internals');
    await expect(chip(page)).toHaveCount(0);

    await run.save('restore.md', source.replace('::: internals\nA restore is a job.\n', ''));
    await expectLevel(page, 'requirements');
    await expect(litStop(page)).toHaveText('Requirements');
    await expect(chip(page)).toHaveCount(0);
    expect((await keptLevels(page))['/restore.html'].level).toBe('internals');
    await expectNoReload(page);
  });

  test('a page that moves opens at the reader default, not the author default', async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': `# Restore a file\n\n${THREE_PARTS}` });
    await seed(page, run.address, { defaultLevel: 'requirements' });
    await openLive(page, `${run.address}restore.html`);
    await hydrated(page);
    await stops(page).nth(2).click();
    await expectLevel(page, 'internals');

    await run.move('restore.md', 'get-it-back.md');
    await expect(page).toHaveURL(/get-it-back\.html$/);
    await expectLevel(page, 'requirements');
    await expectNoReload(page);
  });
});
