import { expect, type Locator, type Page } from '@playwright/test';
import { CHECK_PATH } from '../../src/page/icons.tsx';
import { openOnStoppedClock, scrollPage, THREE_LEVELS } from '../support/levels.ts';
import { barButtons, hydrated, test as pageTest, TOGGLES } from '../support/page.ts';
import { copiedTexts, recordCopies, STEPS } from '../support/page-content.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

/** A long page with parts, whose heading 'Check the result' shows at every level. */
const RESTORE_PAGE = `# Restore a file

A restore never changes the copy.

${STEPS}

## Pick a day

::: overview
Pick a file and a day.
::: internals
A restore is a job on the storage server.
:::

## Check the result

Open the file and check it.

${STEPS}

${STEPS}
`;

const SITE = { 'nerddocs.json': THREE_LEVELS, 'restore.md': RESTORE_PAGE, 'storage.md': '# Storage\n\nBlocks are stored once.\n' };

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

const WIDE = { width: 1280, height: 720 };
const PHONE = { width: 500, height: 800 };
const COPIED_MS = 1500;
const LINK_PATHS = [
  'M9 15l6-6',
  'M11 6l.46-.54a5 5 0 017.07 7.07l-.53.47',
  'M13 18l-.4.53a5.07 5.07 0 01-7.13 0 4.97 4.97 0 010-7.07l.53-.46',
].join(' ');

const barLink = (page: Page) => page.locator('#lnkB');
const titleLink = (page: Page) => page.locator('#lnkT');
const menuLink = (page: Page) => page.locator('#lnk2');
const status = (page: Page) => page.locator('#nd-status');

/** The paths of each icon of the button that shows, as one string per icon. */
const shownIcons = (button: Locator) =>
  button.evaluate((element) =>
    [...element.querySelectorAll('svg')]
      .filter((icon) => icon.checkVisibility())
      .map((icon) => [...icon.querySelectorAll('path')].map((path) => path.getAttribute('d')).join(' ')),
  );

async function expectCopyLinkButton(button: Locator): Promise<void> {
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-label', 'Copy link');
  await expect(button).toHaveAttribute('title', 'Copy link');
  expect(await shownIcons(button)).toEqual([LINK_PATHS]);
}

/** Puts the heading at this top, in px from the top of the window. */
async function putHeadingAt(page: Page, id: string, top: number): Promise<void> {
  const now = await page.locator(`#${id}`).evaluate((heading) => heading.getBoundingClientRect().top + scrollY);
  await scrollPage(page, now - top);
}

/** Records each share that the page asks for. The share sheet opens, or the reader cancels it when `cancel` is set. */
async function stubShare(page: Page, cancel = false): Promise<void> {
  await page.addInitScript((cancelled) => {
    const record = window as unknown as { shared: unknown[] };
    record.shared = [];
    const share = (data: unknown) => {
      record.shared.push(data);
      return cancelled ? Promise.reject(new DOMException('Share canceled', 'AbortError')) : Promise.resolve();
    };
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  }, cancel);
}
const shared = (page: Page) => page.evaluate(() => (window as unknown as { shared: unknown[] }).shared);

/** A browser with no share sheet. */
const noShare = (page: Page) =>
  page.addInitScript(() => {
    delete (Navigator.prototype as { share?: unknown }).share;
  });

test.describe("the 'Copy link' buttons", () => {
  test("the bar ends with 'Copy link' after 'Themes', on a page with levels and on a site with no levels", async ({ page, docs, site }) => {
    await page.setViewportSize(WIDE);
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await expect.poll(async () => (await barButtons(page)).slice(-2), OFTEN).toEqual(['thmB', 'lnkB']);
    await expectCopyLinkButton(barLink(page));

    await page.goto(`${site.address}storage.html`);
    await hydrated(page);
    await expect.poll(() => barButtons(page), OFTEN).toEqual(TOGGLES);
    expect(TOGGLES.at(-1)).toBe('lnkB');
    await expectCopyLinkButton(barLink(page));
  });

  test("'Copy link' sits after the read time next to the title only while the panel is hidden, and never on a phone", async ({ page, docs }) => {
    await page.setViewportSize(WIDE);
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await expect(titleLink(page)).toBeHidden();
    expect(await page.locator('#tl-slot > button').evaluateAll((buttons) => buttons.map((button) => button.id))).toEqual(['tlB', 'lnkT']);

    await page.getByRole('button', { name: 'Hide panel' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-slider', 'off');
    await expectCopyLinkButton(titleLink(page));

    await page.setViewportSize(PHONE);
    await expect(titleLink(page)).toBeHidden();
    await expect(barLink(page)).toBeHidden();
  });

  test("on a phone, 'Copy link' sits at the foot of the menu panel after 'Themes'", async ({ page, docs }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await expect(barLink(page)).toBeHidden();
    await page.locator('#menuB').click();
    await expectCopyLinkButton(menuLink(page));
    expect(await page.locator('#panel .p-foot button').evaluateAll((buttons) => buttons.map((button) => button.id))).toEqual([
      'dfl2',
      'thm2',
      'lnk2',
    ]);
  });

  test.describe('with no script', () => {
    test.use({ javaScriptEnabled: false });

    test('the three buttons hide', async ({ page, docs }) => {
      for (const size of [WIDE, PHONE]) {
        await page.setViewportSize(size);
        await page.goto(`${docs.address}restore.html`);
        await expect(page.getByText('A restore never changes the copy.')).toBeVisible();
        for (const button of [barLink(page), titleLink(page), menuLink(page)]) await expect(button, `${size.width} wide`).toBeHidden();
      }
    });
  });
});

test.describe('a copy of the link', () => {
  test("a click writes the address of the place at once and copies it, shows the check for 1.5 s and says 'Link copied', and a new click starts the 1.5 s again", async ({ page, docs }) => {
    await page.setViewportSize(WIDE);
    await recordCopies(page);
    await openOnStoppedClock(page, `${docs.address}restore.html`);
    const button = barLink(page);
    await expect(status(page)).toBeEmpty();

    // The clock of the page stands still, so only the click can write the place into the address.
    await putHeadingAt(page, 'check-the-result', 100);
    await button.click();
    const placed = `${docs.address}restore.html#overview/check-the-result`;
    await expect.poll(() => copiedTexts(page), OFTEN).toEqual([placed]);
    expect(page.url()).toBe(placed);
    await expect.poll(() => shownIcons(button), OFTEN).toEqual([CHECK_PATH]);
    await expect(status(page)).toHaveText('Link copied');

    await page.clock.runFor(COPIED_MS - 100);
    expect(await shownIcons(button)).toEqual([CHECK_PATH]);
    await expect(status(page)).toHaveText('Link copied');
    await page.clock.runFor(200);
    await expect.poll(() => shownIcons(button), OFTEN).toEqual([LINK_PATHS]);
    await expect(status(page)).toBeEmpty();

    await button.click();
    await expect.poll(() => shownIcons(button), OFTEN).toEqual([CHECK_PATH]);
    await page.clock.runFor(1000);
    await button.click();
    // The page starts the check again once the copy resolves, which follows the write at once.
    await expect.poll(async () => (await copiedTexts(page)).length, OFTEN).toBe(3);
    await page.clock.runFor(1000);
    expect(await shownIcons(button)).toEqual([CHECK_PATH]);
    await page.clock.runFor(600);
    await expect.poll(() => shownIcons(button), OFTEN).toEqual([LINK_PATHS]);
  });

  test("'Copy link' next to the title copies the address of the place, which names no heading at the top of the page", async ({ page, docs }) => {
    await page.setViewportSize(WIDE);
    await recordCopies(page);
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await page.getByRole('button', { name: 'Hide panel' }).click();
    await putHeadingAt(page, 'check-the-result', 100);
    await expect.poll(() => page.evaluate(() => location.hash), OFTEN).toBe('#overview/check-the-result');
    // The click scrolls the button next to the title into view, at the top of the page.
    await titleLink(page).click();
    await expect.poll(() => copiedTexts(page), OFTEN).toEqual([`${docs.address}restore.html#overview`]);
    await expect.poll(() => shownIcons(titleLink(page)), OFTEN).toEqual([CHECK_PATH]);
  });

  test('on a phone with no share sheet, the menu copies the link and stays open', async ({ page, docs }) => {
    await page.setViewportSize(PHONE);
    await noShare(page);
    await recordCopies(page);
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await page.locator('#menuB').click();
    await menuLink(page).click();
    await expect.poll(() => copiedTexts(page), OFTEN).toEqual([`${docs.address}restore.html#overview`]);
    await expect.poll(() => shownIcons(menuLink(page)), OFTEN).toEqual([CHECK_PATH]);
    await expect(status(page)).toHaveText('Link copied');
    await expect(page.locator('#panel')).toBeVisible();
    await expect(menuLink(page)).toBeVisible();
  });

  test('on a phone with a share sheet, the menu opens it with the address in place of the copy, and shows no check', async ({ page, docs }) => {
    await page.setViewportSize(PHONE);
    await stubShare(page);
    await recordCopies(page);
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await page.locator('#menuB').click();
    await menuLink(page).click();
    await expect.poll(() => shared(page), OFTEN).toEqual([{ url: `${docs.address}restore.html#overview` }]);
    expect(await copiedTexts(page)).toEqual([]);
    expect(await shownIcons(menuLink(page))).toEqual([LINK_PATHS]);
    await expect(status(page)).toBeEmpty();
  });

  test('a share that the reader cancels changes nothing', async ({ page, docs }) => {
    await page.setViewportSize(PHONE);
    await stubShare(page, true);
    await recordCopies(page);
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await page.locator('#menuB').click();
    await menuLink(page).click();
    await expect.poll(async () => (await shared(page)).length, OFTEN).toBe(1);
    expect(await copiedTexts(page)).toEqual([]);
    expect(await shownIcons(menuLink(page))).toEqual([LINK_PATHS]);
    await expect(status(page)).toBeEmpty();
    await expect(menuLink(page)).toBeVisible();
  });

  test("on a wide window, 'Copy link' in the bar copies even where a share sheet exists", async ({ page, docs }) => {
    await page.setViewportSize(WIDE);
    await stubShare(page);
    await recordCopies(page);
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await barLink(page).click();
    await expect.poll(() => copiedTexts(page), OFTEN).toEqual([`${docs.address}restore.html#overview`]);
    expect(await shared(page)).toEqual([]);
  });
});
