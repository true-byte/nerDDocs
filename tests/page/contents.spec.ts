import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { KEPT_KEY } from '../../src/page/level-memory.ts';
import { MODE_KEY } from '../../src/page/theme-memory.ts';
import { computedColor, dotOf, openAuthorLive } from '../support/author.ts';
import { DIMENSION_SITE, RESTORE } from '../support/dimensions.ts';
import { NO_LEVELS, saveAtOnce } from '../support/folder.ts';
import { IMAGES_SITE, svgImage } from '../support/images.ts';
import { expectLevel, pressOnSlider, scrollPage } from '../support/levels.ts';
import { expectNoReload, holdPageScript, hydrated, openLive, panel, rowOf, test } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import type { RunningCommand } from '../support/run-command.ts';
import { expectMarkAt, LINE_AT, markLine, noScrollAnchoring } from '../support/text-width.ts';

test('the current page is marked in the panel, and a link there moves the mark', async ({ page, site }) => {
  await page.goto(`${site.address}backups/restore.html`);
  await expect(page.locator('[aria-current="page"]')).toHaveText('Restore a file');
  await rowOf(page, 'Schedules').click();
  await expect(page).toHaveURL(/schedules\.html$/);
  await expect(page.locator('[aria-current="page"]')).toHaveText('Schedules');
});

test('the contents panel hides and shows again, also on the next page', async ({ page, site }) => {
  await page.goto(`${site.address}backups/restore.html`);
  await hydrated(page);

  await page.getByRole('button', { name: 'Hide contents' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show contents' })).toBeFocused();

  await page.goto(`${site.address}storage.html`);
  await expect(panel(page)).toBeHidden();
  await hydrated(page);
  await expect(panel(page)).toBeHidden();

  await page.getByRole('button', { name: 'Show contents' }).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show contents' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Hide contents' })).toBeFocused();

  await page.reload();
  await expect(panel(page)).toBeVisible();
});

test('a section arrow closes and opens its subsections', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  const backups = panel(page).getByRole('button', { name: 'Backups' });

  await expect(backups).toHaveAttribute('aria-expanded', 'true');
  await expect(rowOf(page, 'Restore a file')).toBeVisible();

  await backups.click();
  await expect(backups).toHaveAttribute('aria-expanded', 'false');
  await expect(rowOf(page, 'Restore a file')).toBeHidden();
  await expect(rowOf(page, 'Team plan')).toBeHidden();

  await backups.click();
  await expect(rowOf(page, 'Restore a file')).toBeVisible();

  const plans = panel(page).getByRole('button', { name: 'Plans' });
  await plans.click();
  await expect(rowOf(page, 'Team plan')).toBeHidden();
  await expect(rowOf(page, 'Restore a file')).toBeVisible();
});

test('a closed section stays closed on the next page', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await panel(page).getByRole('button', { name: 'Backups' }).click();
  await expect(rowOf(page, 'Restore a file')).toBeHidden();

  await page.goto(`${site.address}README.html`);
  await hydrated(page);
  await expect(rowOf(page, 'Restore a file')).toBeHidden();
});

test('a closed section opens when its page opens', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await panel(page).getByRole('button', { name: 'Backups' }).click();
  await expect(rowOf(page, 'Restore a file')).toBeHidden();

  await page.goto(`${site.address}backups/restore.html`);
  await expect(rowOf(page, 'Restore a file')).toBeVisible();
  await hydrated(page);
  await expect(rowOf(page, 'Restore a file')).toBeVisible();
  await expect(page.locator('[aria-current="page"]')).toBeVisible();
});

test('a closed section that opened for its page stays open on the next page', async ({ page, site }) => {
  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await panel(page).getByRole('button', { name: 'Backups' }).click();
  await expect(rowOf(page, 'Restore a file')).toBeHidden();

  await page.goto(`${site.address}backups/restore.html`);
  await hydrated(page);
  await expect(rowOf(page, 'Restore a file')).toBeVisible();

  await page.goto(`${site.address}storage.html`);
  await hydrated(page);
  await expect(rowOf(page, 'Restore a file')).toBeVisible();
});

test.describe('a folder with a page of its own', () => {
  test.use({ viewport: { width: 1200, height: 800 } });

  /** 'Backups overview', the page of the folder 'guide/backups', with two pages under it in the folder 'Guide'. */
  const FOLDER_SITE = {
    'README.md': '# Backup app\n\nThe app keeps copies of your files.',
    'guide/backups/index.md': '# Backups overview\n\nA backup is a copy of your files.',
    'guide/backups/restore.md': '# Restore a file\n\nPick a file and a day.',
    'guide/backups/schedules.md': '# Schedules\n\nA plan says how often.',
    'storage.md': '# Storage\n\nBlocks are stored once.',
  };
  const subtopics = (page: Page) => panel(page).getByRole('button', { name: 'Subtopics', exact: true });

  /** The weight and the color of the text of a row, and the first background color around it, up to its item. */
  const lookOf = (page: Page, name: string) =>
    rowOf(page, name).evaluate((link) => {
      let background = 'rgba(0, 0, 0, 0)';
      for (let box: Element | null = link; box && box.tagName !== 'LI'; box = box.parentElement) {
        const color = getComputedStyle(box).backgroundColor;
        if (color !== 'rgba(0, 0, 0, 0)') {
          background = color;
          break;
        }
      }
      return { weight: getComputedStyle(link).fontWeight, color: getComputedStyle(link).color, background };
    });

  test("the name of a folder row opens its page, and its arrow 'Subtopics' hides and shows the rows under it", async ({ page, ownSite }) => {
    const run = await ownSite(FOLDER_SITE);
    await page.goto(`${run.address}storage.html`);
    await hydrated(page);
    await expect(rowOf(page, 'Backups overview')).toBeVisible();
    await expect(subtopics(page)).toHaveCount(1);
    await expect(subtopics(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(rowOf(page, 'Restore a file')).toBeVisible();

    await subtopics(page).click();
    await expect(subtopics(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(rowOf(page, 'Restore a file')).toBeHidden();
    await expect(rowOf(page, 'Schedules')).toBeHidden();
    await expect(rowOf(page, 'Backups overview')).toBeVisible();

    await subtopics(page).click();
    await expect(rowOf(page, 'Restore a file')).toBeVisible();

    await rowOf(page, 'Backups overview').click();
    await expect(page).toHaveURL(/\/guide\/backups\/index\.html$/);
    await expect(page.locator('h1')).toHaveText('Backups overview');
  });

  test('the open folder page marks its row with the look of the open row, and the folders around it open', async ({ page, ownSite }) => {
    const run = await ownSite(FOLDER_SITE);
    await page.goto(`${run.address}guide/backups/restore.html`);
    await hydrated(page);
    const openPage = await lookOf(page, 'Restore a file');

    await page.goto(`${run.address}storage.html`);
    await hydrated(page);
    await panel(page).getByRole('button', { name: 'Guide', exact: true }).click();
    await expect(rowOf(page, 'Backups overview')).toBeHidden();

    await page.goto(`${run.address}guide/backups/index.html`);
    await hydrated(page);
    await expect(rowOf(page, 'Backups overview')).toBeVisible();
    await expect(rowOf(page, 'Backups overview')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#tree [aria-current="page"]')).toHaveCount(1);
    expect(await lookOf(page, 'Backups overview')).toEqual(openPage);
    expect(Number(openPage.weight)).toBeGreaterThanOrEqual(700);
  });

  test('a folder row that the reader shut stays shut on the next page and after a reload, with no flash', async ({ page, ownSite }) => {
    // The arrow turns at once, so its turn can be read.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const run = await ownSite(FOLDER_SITE);
    await page.goto(`${run.address}storage.html`);
    await hydrated(page);
    await subtopics(page).click();
    await expect(rowOf(page, 'Restore a file')).toBeHidden();
    const turned = await subtopics(page).locator('svg').evaluate((icon) => getComputedStyle(icon).transform);
    expect(turned).not.toBe('none');

    await page.goto(`${run.address}README.html`);
    await hydrated(page);
    await expect(rowOf(page, 'Restore a file')).toBeHidden();
    await expect(subtopics(page)).toHaveAttribute('aria-expanded', 'false');

    const release = await holdPageScript(page);
    await page.reload({ waitUntil: 'commit' });
    await expect(rowOf(page, 'Storage')).toBeVisible();
    await expect(rowOf(page, 'Backups overview')).toBeVisible();
    await expect(rowOf(page, 'Restore a file')).toBeHidden();
    await expect(subtopics(page).locator('svg')).toHaveCSS('transform', turned);

    release();
    await hydrated(page);
    await expect(rowOf(page, 'Restore a file')).toBeHidden();
    await expect(subtopics(page)).toHaveAttribute('aria-expanded', 'false');
  });
});

test('with storage blocked, the panel still hides and sections still close', async ({ page, site }) => {
  await page.addInitScript(() => {
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, name, {
        get() {
          throw new Error('The browser blocks storage.');
        },
      });
    }
  });
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));

  await page.goto(`${site.address}storage.html`);
  await hydrated(page);

  await panel(page).getByRole('button', { name: 'Backups' }).click();
  await expect(rowOf(page, 'Restore a file')).toBeHidden();
  await page.getByRole('button', { name: 'Hide contents' }).click();
  await expect(panel(page)).toBeHidden();
  await page.getByRole('button', { name: 'Show contents' }).click();
  await expect(panel(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('with more pages than the panel can show', () => {
  const LONG_PANEL = Object.fromEntries(
    Array.from({ length: 60 }, (_, n) => [`plans/plan-${String(n + 1).padStart(2, '0')}.md`, `# Team plan ${n + 1}`]),
  );

  test.use({ viewport: { width: 1200, height: 500 } });

  test('the row of the current page shows with no scrolling', async ({ page, ownSite }) => {
    const run = await ownSite(LONG_PANEL);
    await page.goto(`${run.address}plans/plan-60.html`);
    await hydrated(page);
    await expect(page.locator('[aria-current="page"]')).toBeInViewport();
  });

  test('with the panel scrolled down, the row of a page higher in the list shows', async ({ page, ownSite }) => {
    const run = await ownSite(LONG_PANEL);
    await page.goto(`${run.address}plans/plan-60.html`);
    await hydrated(page);
    await expect(page.locator('[aria-current="page"]')).toBeInViewport();

    await page.goto(`${run.address}plans/plan-01.html`);
    await hydrated(page);
    await expect(page.locator('[aria-current="page"]')).toBeInViewport();
  });

  test('under 960px wide, the layer opens with the row of the current page on screen', async ({ page, ownSite }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    const run = await ownSite(LONG_PANEL);
    await page.goto(`${run.address}plans/plan-60.html`);
    await hydrated(page);

    await page.getByRole('button', { name: 'Contents', exact: true }).click();

    await expect(page.locator('[aria-current="page"]')).toBeInViewport();
  });

  test('the panel keeps its scroll on the next page', async ({ page, ownSite }) => {
    const run = await ownSite(LONG_PANEL);
    await page.goto(`${run.address}plans/plan-30.html`);
    await hydrated(page);
    const next = rowOf(page, 'Team plan 31');
    await next.evaluate((row) => row.scrollIntoView({ block: 'center' }));
    const scrollTop = () => page.locator('#tree').evaluate((box) => box.scrollTop);
    const before = await scrollTop();
    expect(before).toBeGreaterThan(0);

    await next.click();
    await expect(page).toHaveURL(/plan-31\.html$/);
    await hydrated(page);

    await expect.poll(scrollTop).toBe(before);
  });
});

test.describe('under 960px wide', () => {
  test.use({ viewport: { width: 800, height: 700 } });

  test('the menu button opens the panel as a full-height layer', async ({ page, site }) => {
    await page.goto(`${site.address}backups/restore.html`);
    await hydrated(page);
    await expect(panel(page)).toBeHidden();

    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await expect(panel(page)).toBeVisible();
    expect(await panel(page).boundingBox()).toEqual({ x: 0, y: 0, width: 800, height: 700 });
    await expect(page.getByRole('button', { name: 'Hide contents' })).toBeFocused();
    await expect(page.locator('main')).toHaveAttribute('inert');
    await expect(page.locator('#bar')).toHaveAttribute('inert');

    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Contents', exact: true })).toBeFocused();
    await expect(page.locator('main')).not.toHaveAttribute('inert');
    await expect(page.locator('#bar')).not.toHaveAttribute('inert');

    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await page.getByRole('button', { name: 'Hide contents' }).click();
    await expect(panel(page)).toBeHidden();

    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await rowOf(page, 'Schedules').click();
    await expect(page).toHaveURL(/schedules\.html$/);
    await expect(panel(page)).toBeHidden();
  });

  test('the layer closes when the window grows wide', async ({ page, site }) => {
    await page.goto(`${site.address}backups/restore.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await expect(panel(page)).toBeVisible();

    await page.setViewportSize({ width: 1200, height: 700 });
    await expect(page.locator('main')).not.toHaveAttribute('inert');
    const box = await panel(page).boundingBox();
    expect(box!.width).toBe(264);
  });
});

test.describe('a look from outside the page, on a page with a light and a dark copy of an image', () => {
  test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });

  const lightCopy = (page: Page) => page.locator('#page img[data-look="light"]');
  const darkCopy = (page: Page) => page.locator('#page img[data-look="dark"]');

  /** Opens 'Restore a file' and scrolls so the line 30% down the window falls in the steps below the pair. */
  async function openBelowPair(page: Page, address: string): Promise<void> {
    await page.goto(`${address}restore.html`);
    await hydrated(page);
    await noScrollAnchoring(page);
    const pair = page.locator('#page p:has(> img[data-look])');
    await expect(pair).toHaveCount(1);
    await expect(lightCopy(page)).toBeVisible();
    const top = await pair.evaluate((p, share) => p.getBoundingClientRect().bottom + scrollY - innerHeight * share + 150, LINE_AT);
    await scrollPage(page, top);
  }

  test("with 'System' stored, a change of the computer's look shows the other copy and keeps the line", async ({ page, ownSite }) => {
    const run = await ownSite(IMAGES_SITE);
    await openBelowPair(page, run.address);
    const before = await markLine(page);

    await page.emulateMedia({ colorScheme: 'dark' });

    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expect(darkCopy(page)).toBeVisible();
    await expect(lightCopy(page)).toBeHidden();
    await expectMarkAt(page, before, "a change of the computer's look");
  });

  test('a look stored in another tab shows the other copy and keeps the line', async ({ page, ownSite, context }) => {
    const run = await ownSite(IMAGES_SITE);
    await openBelowPair(page, run.address);
    const before = await markLine(page);

    const other = await context.newPage();
    await other.goto(`${run.address}schedules.html`);
    await other.evaluate(([key]) => localStorage.setItem(key, 'dark'), [MODE_KEY] as const);

    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expect(darkCopy(page)).toBeVisible();
    await expect(lightCopy(page)).toBeHidden();
    await expectMarkAt(page, before, 'a look stored in another tab');
    await other.close();
  });
});

test.describe('dimensions', () => {
  test.use({ viewport: { width: 1200, height: 800 } });

  const list = (page: Page) => page.getByRole('list', { name: 'Dimensions' });
  const pick = (page: Page, name: string) => list(page).getByRole('link', { name, exact: true });
  const treeRow = (page: Page, name: string) => page.locator('#tree').getByRole('link', { name, exact: true });
  const dimButton = (page: Page) => page.locator('#dimB');
  const dimList = (page: Page) => page.locator('#dimL');
  const NAMES = ['User guide', 'Administration', 'Legal and privacy'];
  const INSTALL = '/administration/install.html';
  const USERS = '/administration/users.html';
  /** The address of a page of the site of `run`. */
  const at = (run: RunningCommand, url: string) => `${run.address}${url.slice(1)}`;
  const endsIn = (url: string) => new RegExp(`${url.replace(/[.]/g, '\\.')}$`);
  const box = async (locator: Locator) => (await locator.boundingBox())!;

  /** Opens the list, and waits until it shows. */
  async function openList(page: Page): Promise<void> {
    await dimButton(page).click();
    await expect(dimButton(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(list(page)).toBeVisible();
  }

  test('the button opens the list over the tree, and a dimension opens its last page at its level, or else its first page', async ({ page, dimensionSite }) => {
    await page.goto(at(dimensionSite, RESTORE));
    await hydrated(page);
    await expect(dimButton(page)).toHaveText('User guide');
    await expect(dimButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(dimList(page)).toBeHidden();
    await expect(treeRow(page, 'Restore a file')).toBeVisible();
    await expect(treeRow(page, 'Install the server')).toHaveCount(0);
    await expect(page.locator('#tree [data-section="user-guide"]')).toHaveCount(0);
    await pressOnSlider(page, 'End');
    await expectLevel(page, 'internals');
    await expect
      .poll(() => page.evaluate(([key, url]) => JSON.parse(sessionStorage.getItem(key) ?? '{}')[url]?.level, [KEPT_KEY, RESTORE] as const), OFTEN)
      .toBe('internals');

    await openList(page);
    await expect(list(page).getByRole('link')).toHaveText(NAMES);
    await expect(pick(page, 'User guide')).toBeFocused();
    await expect(pick(page, 'User guide')).toHaveAttribute('aria-current', 'true');
    const button = await box(dimButton(page));
    const shown = await box(dimList(page));
    const tree = await box(page.locator('#tree'));
    expect(shown.y).toBeGreaterThanOrEqual(button.y + button.height);
    expect(shown.y + shown.height).toBeGreaterThan(tree.y);
    expect(
      await pick(page, 'Legal and privacy').evaluate((link) => {
        const rect = link.getBoundingClientRect();
        return link.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      }),
    ).toBe(true);

    await pick(page, 'Administration').click();
    await expect(page).toHaveURL(endsIn(INSTALL));
    await expect(dimButton(page)).toHaveText('Administration');
    await expect(page.locator('#tree [aria-current="page"]')).toHaveText('Install the server');
    await hydrated(page);
    await treeRow(page, 'Users').click();
    await expect(page).toHaveURL(endsIn(USERS));
    await hydrated(page);

    await openList(page);
    await pick(page, 'User guide').click();
    await expect(page).toHaveURL(endsIn(`${RESTORE}#internals`));
    await hydrated(page);
    await expectLevel(page, 'internals');

    await openList(page);
    await expect(pick(page, 'Administration')).toHaveAttribute('href', `../..${USERS}`);
    await pick(page, 'Administration').click();
    await expect(page).toHaveURL(endsIn(USERS));
  });

  test('the arrow keys move through the list, and Esc, a click on the current dimension, a click outside and Tab close it', async ({ page, dimensionSite }) => {
    await openLive(page, at(dimensionSite, RESTORE));
    await hydrated(page);

    await openList(page);
    for (const name of ['Administration', 'Legal and privacy', 'User guide']) {
      await page.keyboard.press('ArrowDown');
      await expect(pick(page, name)).toBeFocused();
    }
    await page.keyboard.press('ArrowUp');
    await expect(pick(page, 'Legal and privacy')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dimList(page)).toBeHidden();
    await expect(dimButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(dimButton(page)).toBeFocused();

    await openList(page);
    await pick(page, 'User guide').click();
    await expect(dimList(page)).toBeHidden();
    await expect(dimButton(page)).toBeFocused();
    await expect(page).toHaveURL(endsIn(`${RESTORE}#overview`));
    await expectNoReload(page);

    await openList(page);
    await page.locator('main h1').click();
    await expect(dimList(page)).toBeHidden();

    await openList(page);
    await page.keyboard.press('Shift+Tab');
    await expect(dimButton(page)).toBeFocused();
    await expect(list(page)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(pick(page, 'User guide')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(pick(page, 'Legal and privacy')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dimList(page)).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.getElementById('dims')!.contains(document.activeElement)), OFTEN).toBe(false);
  });

  test('with storage blocked, the list opens, and each link goes to the first page of its dimension', async ({ page, dimensionSite }) => {
    await page.addInitScript(() => {
      for (const name of ['localStorage', 'sessionStorage']) {
        Object.defineProperty(window, name, {
          get() {
            throw new Error('The browser blocks storage.');
          },
        });
      }
    });
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));

    await page.goto(at(dimensionSite, RESTORE));
    await hydrated(page);
    await openList(page);
    await expect(pick(page, 'Administration')).toHaveAttribute('href', `../..${INSTALL}`);
    await pick(page, 'Administration').click();
    await expect(page).toHaveURL(endsIn(INSTALL));
    await hydrated(page);
    expect(errors).toEqual([]);
  });

  test('on a phone, the button sits at the top of the menu above the tree, Esc closes only the list, and a pick opens the dimension', async ({ page, dimensionSite }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(at(dimensionSite, RESTORE));
    await hydrated(page);
    await page.getByRole('button', { name: 'Contents', exact: true }).click();

    await expect(dimButton(page)).toBeVisible();
    const head = await box(page.locator('#panel .p-head'));
    const button = await box(dimButton(page));
    const tree = await box(page.locator('#tree'));
    expect(button.y).toBeGreaterThanOrEqual(head.y + head.height);
    expect(button.y + button.height).toBeLessThanOrEqual(tree.y);

    await openList(page);
    await page.keyboard.press('Escape');
    await expect(dimList(page)).toBeHidden();
    await expect(panel(page)).toHaveClass(/\bmenu\b/);
    await expect(dimButton(page)).toBeFocused();

    await openList(page);
    await pick(page, 'Legal and privacy').click();
    await expect(page).toHaveURL(endsIn('/legal/privacy.html'));
  });
});

test.describe('the dots of unseen pages', () => {
  test.use({ viewport: { width: 1200, height: 800 } });

  /** 'Restore a file' and 'Storage' show one image, so one save of the image saves both pages. */
  const DOT_SITE = {
    'nerddocs.json': NO_LEVELS,
    'README.md': '# Backup app\n\nThe app keeps copies of your files.\n',
    'backups/restore.md': '# Restore a file\n\nPick a file and a day.\n\n![Restore window](../images/restore-window.svg)\n',
    'backups/schedules.md': '# Schedules\n\nA plan says how often.\n',
    'storage.md': '# Storage\n\nBlocks are stored once.\n\n![Restore window](images/restore-window.svg)\n',
    'images/restore-window.svg': svgImage('width="120" height="40"'),
  };
  const saveImage = (run: RunningCommand) => saveAtOnce(join(run.folder, 'images'), 'restore-window.svg', svgImage('width="240" height="80"'));

  test('each saved page that the author browser does not show gets a dot at the end of its row, in the soft color, also after a reload', async ({
    page,
    ownSite,
  }) => {
    const run = await ownSite(DOT_SITE);
    await openAuthorLive(page, run, 'backups/schedules.html');
    await hydrated(page);
    expect(await dotOf(page, 'Storage')).toBeNull();

    await saveImage(run);

    await expect.poll(() => dotOf(page, 'Storage'), OFTEN).not.toBeNull();
    await expect.poll(() => dotOf(page, 'Restore a file'), OFTEN).not.toBeNull();
    const dot = (await dotOf(page, 'Storage'))!;
    expect(dot.width).toBeCloseTo(6, 0);
    expect(dot.height).toBeCloseTo(6, 0);
    expect(dot.color).toBe(await computedColor(page, 'var(--soft)'));
    expect(dot.left).toBeGreaterThanOrEqual(dot.textEnd);
    expect(await dotOf(page, 'Schedules')).toBeNull();
    expect(await dotOf(page, 'Backup app')).toBeNull();
    await expect(page).toHaveURL(`${run.address}backups/schedules.html`);

    await page.reload();
    await hydrated(page);
    expect(await dotOf(page, 'Storage')).not.toBeNull();
    expect(await dotOf(page, 'Restore a file')).not.toBeNull();
    expect(await dotOf(page, 'Schedules')).toBeNull();
  });

  test('the dot of a page goes when the page opens, also in another author tab', async ({ page, ownSite }) => {
    const run = await ownSite(DOT_SITE);
    await openAuthorLive(page, run, 'backups/schedules.html');
    const other = await page.context().newPage();
    await openLive(other, `${run.address}README.html`);
    await hydrated(page);
    await hydrated(other);

    await saveImage(run);
    await expect.poll(() => dotOf(other, 'Storage'), OFTEN).not.toBeNull();
    await expect.poll(() => dotOf(page, 'Storage'), OFTEN).not.toBeNull();

    await rowOf(page, 'Storage').click();
    await expect(page).toHaveURL(`${run.address}storage.html`);
    await hydrated(page);
    await expect.poll(() => dotOf(page, 'Storage'), OFTEN).toBeNull();
    expect(await dotOf(page, 'Restore a file')).not.toBeNull();
    await expect.poll(() => dotOf(other, 'Storage'), OFTEN).toBeNull();
    expect(await dotOf(other, 'Restore a file')).not.toBeNull();
  });

  test('a closed folder that holds an unseen page shows the dot on its row, and its open row does not', async ({ page, ownSite }) => {
    const run = await ownSite(DOT_SITE);
    await openAuthorLive(page, run, 'README.html');
    await hydrated(page);
    const backups = panel(page).getByRole('button', { name: 'Backups' });
    await backups.click();
    await expect(rowOf(page, 'Restore a file')).toBeHidden();

    await saveImage(run);

    await expect.poll(() => dotOf(page, 'Backups'), OFTEN).not.toBeNull();
    expect((await dotOf(page, 'Backups'))!.width).toBeCloseTo(6, 0);
    expect(await dotOf(page, 'Storage')).not.toBeNull();

    await backups.click();
    await expect(rowOf(page, 'Restore a file')).toBeVisible();
    await expect.poll(() => dotOf(page, 'Restore a file'), OFTEN).not.toBeNull();
    expect(await dotOf(page, 'Backups')).toBeNull();
    expect(await dotOf(page, 'Schedules')).toBeNull();
  });

  test('on a site with dimensions, the row of a dimension that holds an unseen page shows the dot', async ({ page, ownSite }) => {
    const run = await ownSite({
      ...DIMENSION_SITE,
      'administration/01-install.md': '# Install the server\n\nRun the installer.\n\n![Restore window](../images/restore-window.svg)\n',
      'administration/02-users.md': '# Users\n\nEach user has a role.\n\n![Restore window](../images/restore-window.svg)\n',
    });
    await openAuthorLive(page, run, RESTORE.slice(1));
    await hydrated(page);

    await saveImage(run);

    await page.locator('#dimB').click();
    await expect(page.getByRole('list', { name: 'Dimensions' })).toBeVisible();
    await expect.poll(() => dotOf(page, 'Administration'), OFTEN).not.toBeNull();
    expect(await dotOf(page, 'User guide')).toBeNull();
    expect(await dotOf(page, 'Legal and privacy')).toBeNull();
  });

  test('a reader browser shows no dot', async ({ page, ownSite, browser }) => {
    const run = await ownSite(DOT_SITE);
    const author = await browser.newPage();
    try {
      await openAuthorLive(author, run, 'backups/schedules.html');
      await openLive(page, `${run.address}backups/restore.html`);
      await hydrated(page);
      await hydrated(author);

      await saveImage(run);

      await expect.poll(() => dotOf(author, 'Storage'), OFTEN).not.toBeNull();
      await expect(page.locator('#page img')).toHaveAttribute('height', '80');
      await expect(page.locator('span.unseen')).toHaveCount(0);
      await expect(page).toHaveURL(`${run.address}backups/restore.html`);
    } finally {
      await author.close();
    }
  });
});
