import { expect, type Page } from '@playwright/test';
import { NO_LEVELS } from '../support/folder.ts';
import { THREE_LEVELS } from '../support/levels.ts';
import { barButtons, expectNoReload, hydrated, openLive, rowOf, test, TOGGLES, type PageFixtures } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';

const RESTORE = '# Restore a file\n\n::: overview\nPick a file and a day.\n::: internals\nA restore is a job.\n:::\n';
const BROKEN = '{"levels":';
const NO_FILE = 'No nerddocs.json';
const BROKEN_FILE = 'Broken nerddocs.json';

const modal = (page: Page) => page.getByRole('alertdialog');
const okButton = (page: Page) => modal(page).getByRole('button', { name: 'OK' });
const noAgainBox = (page: Page) => modal(page).getByRole('checkbox', { name: "Don't show again" });

const missingSite = (ownSite: PageFixtures['ownSite']) =>
  ownSite({ 'restore.md': RESTORE, 'schedules.md': '# Schedules\n\nA plan says how often.\n' }, { noConfig: true });

/**
 * Makes the clock of the page one that a test can run on, so that `settled` can run out each timer.
 * A page with no script has no clock.
 */
test.beforeEach(async ({ page, javaScriptEnabled }) => {
  if (javaScriptEnabled) await page.clock.install();
});

/**
 * Lets the page script do all that it still would, so that a modal that would open is open.
 * React runs the effects of one commit before the next commit, so a commit from a click proves that the
 * effects of hydration have run. The click fails while a modal is open. Then each timer of the page runs out.
 */
async function settled(page: Page): Promise<void> {
  await hydrated(page);
  await page.getByRole('button', { name: 'Hide contents' }).click();
  await page.getByRole('button', { name: 'Show contents' }).click();
  await expect(page.getByRole('button', { name: 'Hide contents' })).toBeVisible();
  await page.clock.runFor(10_000);
}

/** Clicks the backdrop, in the corner of the window that no modal box reaches. */
const clickBackdrop = (page: Page) => page.mouse.click(4, 4);

const CLOSE_WAYS: Record<string, (page: Page) => Promise<void>> = {
  OK: (page) => okButton(page).click(),
  Esc: (page) => page.keyboard.press('Escape'),
  'a click on the backdrop': clickBackdrop,
};

for (const [name, config, title] of [
  ['missing', null, NO_FILE],
  ['broken', BROKEN, BROKEN_FILE],
] as const) {
  test(`a ${name} config opens a modal with its title, its one line, the box and OK, with no other text`, async ({ page, ownSite }) => {
    const run = config === null ? await missingSite(ownSite) : await ownSite({ 'nerddocs.json': config, 'restore.md': RESTORE });
    await page.goto(`${run.address}restore.html`);
    await expect(modal(page)).toBeVisible();
    await expect(modal(page)).toContainText(title);
    await expect(modal(page)).toContainText('No levels will show.');
    await expect(noAgainBox(page)).not.toBeChecked();
    await expect(okButton(page)).toBeFocused();

    let rest = await modal(page).innerText();
    for (const label of [title, 'No levels will show.', "Don't show again", 'OK']) rest = rest.replace(label, '');
    expect(rest.trim()).toBe('');
  });

  test(`a page with a ${name} config has no slider, and each fence line shows as text`, async ({ page, ownSite }) => {
    const run = config === null ? await missingSite(ownSite) : await ownSite({ 'nerddocs.json': config, 'restore.md': RESTORE });
    await page.goto(`${run.address}restore.html`);
    await okButton(page).click();
    await expect(page.locator('#page')).toContainText('::: overview');
    await expect(page.getByText('A restore is a job.')).toBeVisible();
    await expect.poll(() => barButtons(page), OFTEN).toEqual(TOGGLES);
    await expect(page.locator('#thumb, #tab, #no-levels, .marks')).toHaveCount(0);
  });
}

test('the modal shows on a folder with no fence lines', async ({ page, ownSite }) => {
  const run = await ownSite({ 'storage.md': '# Storage\n\nBlocks are stored once.\n' }, { noConfig: true });
  await page.goto(`${run.address}storage.html`);
  await expect(modal(page)).toContainText(NO_FILE);
});

test('the modal is a real modal dialog', async ({ page, ownSite }) => {
  const run = await missingSite(ownSite);
  await page.goto(`${run.address}restore.html`);
  await expect(modal(page)).toBeVisible();
  const { tag, isModal } = await modal(page).evaluate((el) => ({ tag: el.tagName, isModal: el.matches(':modal') }));
  expect(tag).toBe('DIALOG');
  expect(isModal).toBe(true);
});

for (const [way, close] of Object.entries(CLOSE_WAYS)) {
  test(`${way} closes the modal, and with no check it shows again on the next full page load`, async ({ page, ownSite }) => {
    const run = await missingSite(ownSite);
    await page.goto(`${run.address}restore.html`);
    await expect(okButton(page)).toBeFocused();
    await close(page);
    await expect(modal(page)).toBeHidden();

    await page.reload();
    await expect(modal(page)).toBeVisible();
  });

  test(`${way} with the box checked keeps the modal closed on later loads`, async ({ page, ownSite }) => {
    const run = await missingSite(ownSite);
    await page.goto(`${run.address}restore.html`);
    await noAgainBox(page).check();
    await close(page);
    await expect(modal(page)).toBeHidden();

    await page.reload();
    await settled(page);
    await expect(modal(page)).toBeHidden();
    await rowOf(page, 'Schedules').click();
    await expect(page.locator('main h1')).toHaveText('Schedules');
    await settled(page);
    await expect(modal(page)).toBeHidden();
  });
}

test('a click inside the modal leaves it open', async ({ page, ownSite }) => {
  const run = await missingSite(ownSite);
  await page.goto(`${run.address}restore.html`);
  await modal(page).getByText('No levels will show.').click();
  await expect(modal(page)).toBeVisible();
  await noAgainBox(page).check();
  await expect(modal(page)).toBeVisible();
});

test('a load of another page shows the modal again when it closed with no check', async ({ page, ownSite }) => {
  const run = await missingSite(ownSite);
  await page.goto(`${run.address}restore.html`);
  await okButton(page).click();
  await hydrated(page);
  await rowOf(page, 'Schedules').click();
  await expect(page.locator('main h1')).toHaveText('Schedules');
  await expect(modal(page)).toBeVisible();
});

test('a closed modal stays closed through a live update and a move inside the same load', async ({ page, ownSite }) => {
  const run = await missingSite(ownSite);
  await openLive(page, `${run.address}restore.html`);
  await okButton(page).click();
  await expect(modal(page)).toBeHidden();

  await run.save('restore.md', '# Restore a file\n\nSaved with the modal closed.\n');
  await expect(page.locator('#page')).toContainText('Saved with the modal closed.');
  await settled(page);
  await expect(modal(page)).toBeHidden();

  await run.move('restore.md', 'get-it-back.md');
  await expect(page).toHaveURL(/get-it-back\.html$/);
  await settled(page);
  await expect(modal(page)).toBeHidden();
  await expectNoReload(page);
});

test('an open modal stays open through a live update that leaves the same case', async ({ page, ownSite }) => {
  const run = await missingSite(ownSite);
  await openLive(page, `${run.address}restore.html`);
  await expect(modal(page)).toBeVisible();

  await run.save('restore.md', '# Restore a file\n\nSaved with the modal open.\n');
  await expect(page.locator('#page')).toContainText('Saved with the modal open.');
  await expect(modal(page)).toBeVisible();
  await expect(modal(page)).toContainText(NO_FILE);
});

for (const [name, fixed] of [
  ['levels', THREE_LEVELS],
  ['`"levels": false`', NO_LEVELS],
] as const) {
  test(`a live update that fixes the file with ${name} closes the modal`, async ({ page, ownSite }) => {
    const run = await missingSite(ownSite);
    await openLive(page, `${run.address}restore.html`);
    await expect(modal(page)).toBeVisible();

    await run.save('nerddocs.json', fixed);
    await expect(modal(page)).toBeHidden();
    await expectNoReload(page);
  });
}

test('a live update that lists the levels brings the slider and the parts in place of the fence lines', async ({ page, ownSite }) => {
  const run = await ownSite({ 'nerddocs.json': BROKEN, 'restore.md': RESTORE });
  await openLive(page, `${run.address}restore.html`);
  await okButton(page).click();

  await run.save('nerddocs.json', THREE_LEVELS);
  await expect(page.locator('#thumb')).toBeVisible();
  await expect(page.locator('#page')).not.toContainText('::: overview');
  await expect(page.getByText('A restore is a job.')).toBeHidden();
  await expectNoReload(page);
});

test('a live update to the other case shows that case, with the modal open or closed', async ({ page, ownSite }) => {
  const run = await missingSite(ownSite);
  await openLive(page, `${run.address}restore.html`);
  await expect(modal(page)).toContainText(NO_FILE);

  await run.save('nerddocs.json', BROKEN);
  await expect(modal(page)).toContainText(BROKEN_FILE);
  await expect(modal(page)).not.toContainText(NO_FILE);
  await okButton(page).click();
  await expect(modal(page)).toBeHidden();

  await run.remove('nerddocs.json');
  await expect(modal(page)).toBeVisible();
  await expect(modal(page)).toContainText(NO_FILE);
  await okButton(page).click();

  await run.save('nerddocs.json', BROKEN);
  await expect(modal(page)).toContainText(BROKEN_FILE);
  await expectNoReload(page);
});

test('a live update from a good file to a missing or broken one opens the modal and takes the panel away', async ({ page, ownSite }) => {
  const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': RESTORE });
  await openLive(page, `${run.address}restore.html`);
  await settled(page);
  await expect(modal(page)).toBeHidden();
  await expect(page.locator('#thumb')).toBeVisible();

  await run.save('nerddocs.json', BROKEN);
  await expect(modal(page)).toContainText(BROKEN_FILE);
  await expect(page.locator('#thumb')).toHaveCount(0);
  await expect(page.locator('#page')).toContainText('::: overview');
  await okButton(page).click();

  await run.save('nerddocs.json', THREE_LEVELS);
  await expect(page.locator('#thumb')).toBeVisible();
  await run.remove('nerddocs.json');
  await expect(modal(page)).toContainText(NO_FILE);
  await expectNoReload(page);
});

test('the box keeps one value for each case', async ({ page, ownSite }) => {
  const run = await missingSite(ownSite);
  await openLive(page, `${run.address}restore.html`);
  await noAgainBox(page).check();
  await okButton(page).click();
  await expect(modal(page)).toBeHidden();

  // The other case still shows, also after a reload.
  await run.save('nerddocs.json', BROKEN);
  await expect(modal(page)).toContainText(BROKEN_FILE);
  await page.reload();
  await expect(modal(page)).toContainText(BROKEN_FILE);
  await noAgainBox(page).check();
  await okButton(page).click();

  // Each case stays closed once its box was checked.
  await page.reload();
  await settled(page);
  await expect(modal(page)).toBeHidden();
  await run.remove('nerddocs.json');
  await expect(page.locator('#page')).toContainText('::: overview');
  await settled(page);
  await expect(modal(page)).toBeHidden();
  await page.reload();
  await settled(page);
  await expect(modal(page)).toBeHidden();
});

test('an unchecked box stores nothing, also through a live update', async ({ page, ownSite }) => {
  const run = await missingSite(ownSite);
  await page.goto(`${run.address}restore.html`);
  await okButton(page).click();
  await run.save('restore.md', '# Restore a file\n\nSaved with the modal closed.\n');
  await expect(page.locator('#page')).toContainText('Saved with the modal closed.');
  await page.reload();
  await expect(modal(page)).toBeVisible();
  await expect(noAgainBox(page)).not.toBeChecked();
});

test('a box checked and then unchecked before the modal closes stores nothing', async ({ page, ownSite }) => {
  const run = await missingSite(ownSite);
  await page.goto(`${run.address}restore.html`);
  await noAgainBox(page).check();
  await noAgainBox(page).uncheck();
  await okButton(page).click();
  await expect(modal(page)).toBeHidden();

  await page.reload();
  await expect(modal(page)).toBeVisible();
  await expect(noAgainBox(page)).not.toBeChecked();
});

test('with storage blocked the modal still shows and closes, and the page throws no error', async ({ page, ownSite }) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Storage is blocked.');
      },
    });
  });
  const run = await missingSite(ownSite);
  await page.goto(`${run.address}restore.html`);
  await noAgainBox(page).check();
  await okButton(page).click();
  await expect(modal(page)).toBeHidden();

  await page.reload();
  await expect(modal(page)).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [name, file] of Object.entries({
  '`"levels": false`': NO_LEVELS,
  'an empty file': '',
  '`{}`': '{}',
  '`"levels": []`': '{"levels":[]}',
})) {
  test(`${name} opens no modal, draws no slider, and each fence line shows as text`, async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': file, 'restore.md': RESTORE });
    await page.goto(`${run.address}restore.html`);
    await settled(page);
    await expect(modal(page)).toBeHidden();
    await expect.poll(() => barButtons(page), OFTEN).toEqual(TOGGLES);
    await expect(page.locator('#thumb, #tab, #no-levels, .marks')).toHaveCount(0);
    await expect(page.locator('#page')).toContainText('::: overview');
  });
}

test('a file that lists levels opens no modal', async ({ page, ownSite }) => {
  const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': RESTORE });
  await page.goto(`${run.address}restore.html`);
  await settled(page);
  await expect(modal(page)).toBeHidden();
});

test.describe('with no script', () => {
  test.use({ javaScriptEnabled: false });

  test('no modal covers the text, and each fence line shows as text', async ({ page, ownSite }) => {
    const run = await missingSite(ownSite);
    await page.goto(`${run.address}restore.html`);
    await expect(page.locator('#page')).toContainText('::: overview');
    await expect(modal(page)).toBeHidden();
  });
});
