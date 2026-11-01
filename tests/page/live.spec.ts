import { expect, type Page } from '@playwright/test';
import { hydrated, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import type { RunningCommand } from '../support/run-command.ts';

const LONG = Array.from({ length: 60 }, (_, n) => `Paragraph ${n} of the restore steps.`).join('\n\n');

/** Each test saves files, so each test has a folder and a command of its own. */
const test = pageTest.extend<{ run: RunningCommand }>({
  run: async ({ ownSite }, use) => {
    await use(
      await ownSite({
        'backups/restore.md': `# Restore a file\n\nFirst line.\n\n${LONG}\n\nLast line.`,
        'backups/schedules.md': '# Schedules\n\nA plan says how often.',
        'storage.md': '# Storage\n\nBlocks are stored once.',
      }),
    );
  },
});

/** Opens a page, waits for its live connection, and marks the window to detect a reload. */
async function open(page: Page, address: string): Promise<void> {
  const connected = page.waitForResponse((response) => response.url().includes('/__nerddocs/events'));
  await page.goto(address);
  await connected;
  await page.evaluate(() => {
    (window as unknown as { sameWindow: boolean }).sameWindow = true;
  });
}

async function expectNoReload(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { sameWindow?: boolean }).sameWindow)).toBe(true);
}

/** Tells the tab whether it shows, as a browser does when the reader changes tabs. */
async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** Waits until the site has a save that an open page does not get on its own. */
async function siteHas(run: RunningCommand, path: string, text: string): Promise<void> {
  await expect.poll(async () => (await fetch(run.address + path)).text(), OFTEN).toContain(text);
}

/** Turns off the scroll anchoring of Chromium, since Safari has none, and the page must hold the place itself. */
const noScrollAnchoring = (page: Page) => page.addStyleTag({ content: '* { overflow-anchor: none; }' });

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);
const topOf = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).evaluate((element) => element.getBoundingClientRect().top);

test('an edit shows in place and the scroll position stays', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await page.evaluate(() => window.scrollTo(0, 900));
  const before = await scrollY(page);

  await run.save('backups/restore.md', `# Restore a file\n\nFirst line.\n\n${LONG}\n\nA new last line.`);

  await expect(page.locator('#page')).toContainText('A new last line.');
  expect(await scrollY(page)).toBe(before);
  await expectNoReload(page);
});

test('an edit of the text on screen keeps the scroll position', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await page.evaluate(() => window.scrollTo(0, 900));
  const before = await scrollY(page);
  const paragraph = /Paragraph 20 of the restore steps\./;

  await run.save('backups/restore.md', `# Restore a file\n\nFirst line.\n\n${LONG.replace(paragraph, 'Paragraph 20 is new.')}\n\nLast line.`);

  await expect(page.locator('#page')).toContainText('Paragraph 20 is new.');
  expect(await scrollY(page)).toBe(before);
});

test('a save that passes through an empty file keeps the scroll position', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await page.evaluate(() => window.scrollTo(0, 900));
  const before = await scrollY(page);

  await run.save('backups/restore.md', '');
  await expect(page.locator('#page')).toBeEmpty();
  await run.save('backups/restore.md', `# Restore a file\n\nFirst line.\n\n${LONG}\n\nA new last line.`);

  await expect(page.locator('#page')).toContainText('A new last line.');
  expect(await scrollY(page)).toBe(before);
});

test('text added above the screen leaves the text on screen where it was', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await page.evaluate(() => window.scrollTo(0, 900));
  const text = 'Paragraph 30 of the restore steps.';
  const before = await topOf(page, text);

  await run.save('backups/restore.md', `# Restore a file\n\nNew one.\n\nNew two.\n\nFirst line.\n\n${LONG}\n\nLast line.`);

  await expect(page.locator('#page')).toContainText('New two.');
  expect(Math.abs((await topOf(page, text)) - before)).toBeLessThan(1);
});

test('at the top of the page, text added at the top shows', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await run.save('backups/restore.md', `# Restore a file\n\nNew first line.\n\nFirst line.\n\n${LONG}`);
  await expect(page.getByText('New first line.')).toBeInViewport();
  expect(await scrollY(page)).toBe(0);
});

test('an unchanged part of the page stays in place through an edit, so its images and open details stay', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  const paragraph = page.getByText('Paragraph 5 of', { exact: false });
  await paragraph.evaluate((element) => {
    (element as unknown as { kept: boolean }).kept = true;
  });

  await run.save('backups/restore.md', `# Restore a file\n\nFirst line edited.\n\n${LONG}\n\nLast line.`);

  await expect(page.locator('#page')).toContainText('First line edited.');
  expect(await paragraph.evaluate((element) => (element as unknown as { kept?: boolean }).kept)).toBe(true);
});

test('text the reader selected above an edit stays selected', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await page.getByText('Paragraph 5 of', { exact: false }).evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    getSelection()!.addRange(range);
  });

  await run.save('backups/restore.md', `# Restore a file\n\nFirst line.\n\n${LONG}\n\nA new last line.`);

  await expect(page.locator('#page')).toContainText('A new last line.');
  expect(await page.evaluate(() => getSelection()!.toString())).toBe('Paragraph 5 of the restore steps.');
});

test('details the reader opened stay open through a save of another block', async ({ page, ownSite }) => {
  const details = '<details><summary>Restore steps</summary>\n\nPick a day.\n\n</details>';
  const run = await ownSite({ 'restore.md': `# Restore a file\n\n${details}\n\nOld text.` });
  await open(page, `${run.address}restore.html`);
  await page.getByText('Restore steps').click();
  await expect(page.getByText('Pick a day.')).toBeVisible();

  await run.save('restore.md', `# Restore a file\n\n${details}\n\nNew text.`);

  await expect(page.locator('#page')).toContainText('New text.');
  await expect(page.getByText('Pick a day.')).toBeVisible();
});

test('deleting one of several equal paragraphs takes it off the page', async ({ page, ownSite }) => {
  const run = await ownSite({ 'restore.md': '# Restore a file\n\nKeep a copy.\n\nKeep a copy.\n\nKeep a copy.' });
  await open(page, `${run.address}restore.html`);
  await expect(page.locator('#page p')).toHaveCount(3);

  await run.save('restore.md', '# Restore a file\n\nKeep a copy.\n\nKeep a copy.');

  await expect(page.locator('#page p')).toHaveCount(2);
});

test('an edited first paragraph stays first', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);

  await run.save('backups/restore.md', `# Restore a file\n\nFirst line edited.\n\n${LONG}\n\nLast line.`);

  await expect(page.locator('#page p').first()).toHaveText('First line edited.');
});

test('a reader who scrolled after a save through an empty file stays there at the next save', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await page.evaluate(() => window.scrollTo(0, 900));
  await run.save('backups/restore.md', '');
  await expect(page.locator('#page')).toBeEmpty();
  const chosen = (await scrollY(page)) - 50;
  await page.evaluate((top) => window.scrollTo(0, top), chosen);

  await run.save('backups/restore.md', `# Restore a file\n\nFirst line.\n\n${LONG}\n\nA new last line.`);

  await expect(page.locator('#page')).toContainText('A new last line.');
  expect(await scrollY(page)).toBe(chosen);
});

test('the save after a save through an empty file keeps the reader in place', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await page.evaluate(() => window.scrollTo(0, 900));
  await run.save('backups/restore.md', '');
  await expect(page.locator('#page')).toBeEmpty();
  const landed = await scrollY(page);
  await run.save('backups/restore.md', `# Restore a file\n\nFirst line.\n\n${LONG}\n\nLast line.`);
  await expect(page.locator('#page')).toContainText('Last line.');

  await page.evaluate((top) => window.scrollTo(0, top), landed);
  await run.save('backups/restore.md', `# Restore a file\n\nFirst line.\n\n${LONG}\n\nA new last line.`);

  await expect(page.locator('#page')).toContainText('A new last line.');
  expect(await scrollY(page)).toBe(landed);
});

test('text added between the top and the screen leaves the text on screen where it was', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await noScrollAnchoring(page);
  await page.evaluate(() => window.scrollTo(0, 900));
  const text = 'Paragraph 30 of the restore steps.';
  const before = await topOf(page, text);

  await run.save('backups/restore.md', `# Restore a file\n\nFirst line.\n\nNew one.\n\nNew two.\n\n${LONG}\n\nLast line.`);

  await expect(page.locator('#page')).toContainText('New two.');
  expect(Math.abs((await topOf(page, text)) - before)).toBeLessThan(1);
});

test('in a browser with no scroll anchoring, text added above the screen leaves the text on screen where it was', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await noScrollAnchoring(page);
  await page.evaluate(() => window.scrollTo(0, 900));
  const text = 'Paragraph 30 of the restore steps.';
  const before = await topOf(page, text);

  await run.save('backups/restore.md', `# Restore a file\n\nNew one.\n\nNew two.\n\nFirst line.\n\n${LONG}\n\nLast line.`);

  await expect(page.locator('#page')).toContainText('New two.');
  expect(Math.abs((await topOf(page, text)) - before)).toBeLessThan(1);
});

test('in a browser with no scroll anchoring, a save through an empty file keeps the scroll position', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await noScrollAnchoring(page);
  await page.evaluate(() => window.scrollTo(0, 900));
  const before = await scrollY(page);

  await run.save('backups/restore.md', '');
  await expect(page.locator('#page')).toBeEmpty();
  await run.save('backups/restore.md', `# Restore a file\n\nFirst line.\n\n${LONG}\n\nA new last line.`);

  await expect(page.locator('#page')).toContainText('A new last line.');
  expect(await scrollY(page)).toBe(before);
});

test('at the top of the page, a new first line above unchanged text shows', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);

  await run.save('backups/restore.md', `# Restore a file\n\nNew first line.\n\nFirst line.\n\n${LONG}\n\nLast line.`);

  await expect(page.getByText('New first line.')).toBeInViewport();
  expect(await scrollY(page)).toBe(0);
});

test('a page with a & in its name follows saves', async ({ page, ownSite }) => {
  const run = await ownSite({ 'backup & restore.md': '# Backup and restore\n\nOld text.' });
  await open(page, `${run.address}backup%20%26%20restore.html`);

  await run.save('backup & restore.md', '# Backup and restore\n\nNew text.');

  await expect(page.locator('#page')).toContainText('New text.');
  await expect(page.locator('main h1')).toHaveText('Backup and restore');
});

test('a page renamed to a name with a ? gets the whole name in its address', async ({ page, run }) => {
  await open(page, `${run.address}backups/schedules.html`);

  await run.move('backups/schedules.md', 'backups/why?.md');

  await expect(page).toHaveURL(/\/backups\/why%3F\.html$/);
  await page.reload();
  await expect(page.locator('main h1')).toHaveText('Schedules');
});

test('a reader on a renamed page connects again at the new address, so a restart of the command finds the page', async ({ page, run }) => {
  await open(page, `${run.address}backups/schedules.html`);
  const connected = page.waitForRequest((request) => request.url().endsWith('events?page=%2Fbackups%2Fplans.html'));

  await run.move('backups/schedules.md', 'backups/plans.md');

  await connected;
});

test('a new title shows in the heading, the panel and the window title', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  await run.save('backups/restore.md', '# Get a file back\n\nFirst line.');

  await expect(page.locator('main h1')).toHaveText('Get a file back');
  await expect(page.locator('main h1')).toHaveId('get-a-file-back');
  await expect(page.locator('[aria-current="page"]')).toHaveText('Get a file back');
  await expect(page).toHaveTitle(/^Get a file back - /);
  await expectNoReload(page);
});

test('a new page and a new section show in the panel', async ({ page, run }) => {
  await open(page, `${run.address}storage.html`);

  await run.save('agents/install.md', '# Install the agent');

  await expect(page.locator('#panel').getByRole('button', { name: 'Agents' })).toBeVisible();
  const row = page.locator('#panel').getByRole('link', { name: 'Install the agent' });
  await expect(row).toBeVisible();
  await expectNoReload(page);

  await row.click();
  await expect(page.locator('main h1')).toHaveText('Install the agent');
});

test('a deleted page leaves the panel', async ({ page, run }) => {
  await open(page, `${run.address}storage.html`);
  await run.remove('backups/schedules.md');
  await expect(page.locator('#panel').getByRole('link', { name: 'Schedules' })).toHaveCount(0);
  await expectNoReload(page);
});

test('a reader on a renamed page follows it to its new address', async ({ page, run }) => {
  await open(page, `${run.address}backups/schedules.html`);

  await run.move('backups/schedules.md', 'backups/plans.md');

  await expect(page).toHaveURL(/\/backups\/plans\.html$/);
  await expect(page.locator('#page')).toContainText('A plan says how often.');
  await expect(page.locator('[aria-current="page"]')).toHaveText('Schedules');
  await expectNoReload(page);

  // The page still follows saves at its new address.
  await run.save('backups/plans.md', '# Schedules\n\nEdited after the rename.');
  await expect(page.locator('#page')).toContainText('Edited after the rename.');

  await page.reload();
  await expect(page.locator('#page')).toContainText('Edited after the rename.');
});

test('a reader on a renamed page keeps the heading named in the address', async ({ page, run }) => {
  await open(page, `${run.address}backups/schedules.html#plans`);

  await run.move('backups/schedules.md', 'backups/plans.md');

  await expect(page).toHaveURL(/\/backups\/plans\.html#plans$/);
});

test('a reader in a folder that moves keeps working links', async ({ page, run }) => {
  await open(page, `${run.address}backups/schedules.html`);

  await run.move('backups', 'guide');

  await expect(page).toHaveURL(/\/guide\/schedules\.html$/);
  await page.locator('#panel').getByRole('link', { name: 'Restore a file' }).click();
  await expect(page).toHaveURL(/\/guide\/restore\.html$/);
});

test('a reader in a folder renamed to a name with a space keeps following saves', async ({ page, run }) => {
  await open(page, `${run.address}backups/schedules.html`);

  await run.move('backups', 'user guide');

  await expect(page).toHaveURL(/\/user%20guide\/schedules\.html$/);
  await run.save('user guide/schedules.md', '# Schedules\n\nEdited in the new folder.');
  await expect(page.locator('#page')).toContainText('Edited in the new folder.');
  await expectNoReload(page);
});

test('a reader on a deleted page moves to the next page', async ({ page, run }) => {
  await open(page, `${run.address}backups/schedules.html`);

  await run.remove('backups/schedules.md');

  await expect(page).toHaveURL(/\/storage\.html$/);
  await expect(page.locator('main h1')).toHaveText('Storage');
  await expect(page.locator('[aria-current="page"]')).toHaveText('Storage');
  await expectNoReload(page);
});

test('an empty folder gains its first page with no reload, and loses it again', async ({ page, ownSite }) => {
  const run = await ownSite({});
  await open(page, run.address);
  await expect(page.locator('#panel a')).toHaveCount(0);

  await run.save('restore.md', '# Restore a file\n\nPick a file.');
  await expect(page).toHaveURL(/\/restore\.html$/);
  await expect(page.locator('#page')).toContainText('Pick a file.');
  await expectNoReload(page);

  await run.remove('restore.md');
  await expect(page.locator('#panel a')).toHaveCount(0);
  await expect(page.locator('#page')).toHaveText('');
  await expectNoReload(page);
});

test('a page at a 404 address fills in when its file is saved', async ({ page, run }) => {
  const response = await page.goto(`${run.address}upgrade.html`);
  expect(response?.status()).toBe(404);
  await expect(page.locator('main h1')).toHaveText('404');
  await expect(page.locator('#panel').getByRole('link', { name: 'Storage' })).toBeVisible();

  await run.save('upgrade.md', '# Upgrade');
  await expect(page.locator('main h1')).toHaveText('Upgrade');
});

test('a closed section stays closed through a live update', async ({ page, run }) => {
  await open(page, `${run.address}storage.html`);
  const backups = page.locator('#panel').getByRole('button', { name: 'Backups' });
  await backups.click();
  await expect(backups).toHaveAttribute('aria-expanded', 'false');

  await run.save('agents.md', '# Agents');

  await expect(page.locator('#panel').getByRole('link', { name: 'Agents' })).toBeVisible();
  await expect(backups).toHaveAttribute('aria-expanded', 'false');
});

test('a closed section around the current page stays closed through a live update', async ({ page, run }) => {
  await open(page, `${run.address}backups/restore.html`);
  const backups = page.locator('#panel').getByRole('button', { name: 'Backups' });
  await backups.click();
  await expect(backups).toHaveAttribute('aria-expanded', 'false');

  await run.save('backups/restore.md', '# Restore a file\n\nSaved with the section closed.');

  await expect(page.locator('#page')).toContainText('Saved with the section closed.');
  await expect(backups).toHaveAttribute('aria-expanded', 'false');
});

test('a tab that was hidden gets the change when it shows again', async ({ page, run }) => {
  await open(page, `${run.address}storage.html`);
  await setTabHidden(page, true);

  await run.save('storage.md', '# Storage\n\nSaved while the tab was hidden.');
  await siteHas(run, 'storage.html', 'Saved while the tab was hidden.');
  await expect(page.locator('#page')).toContainText('Blocks are stored once.');

  const connected = page.waitForResponse((response) => response.url().includes('/__nerddocs/events'));
  await setTabHidden(page, false);
  await connected;
  await expect(page.locator('#page')).toContainText('Saved while the tab was hidden.');
});

test('a tab opened hidden gets the change when it first shows', async ({ page, run }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  });
  await page.goto(`${run.address}storage.html`);
  await hydrated(page);

  await run.save('storage.md', '# Storage\n\nSaved before the tab showed.');
  await siteHas(run, 'storage.html', 'Saved before the tab showed.');
  await expect(page.locator('#page')).toContainText('Blocks are stored once.');

  const connected = page.waitForResponse((response) => response.url().includes('/__nerddocs/events'));
  await setTabHidden(page, false);
  await connected;
  await expect(page.locator('#page')).toContainText('Saved before the tab showed.');
});
