import { expect, type Page } from '@playwright/test';
import {
  expectLevel,
  levelsFile,
  litStop,
  liveRegion,
  MOVE_MS,
  pressOnSlider,
  scrollPage,
  stopPoint,
  stops,
  THREE_LEVELS,
  thumb,
} from '../support/levels.ts';
import {
  BROKEN_FLOW,
  diagramBox,
  drawingOf,
  expectDrawn,
  isMarked,
  markDrawing,
  mermaidBlock,
  recordBuilds,
  RESTORE_FLOW,
  RESTORE_MAP,
  storeLook,
} from '../support/diagrams.ts';
import { NO_LEVELS } from '../support/folder.ts';
import { pngFile } from '../support/images.ts';
import { BACKUP_API_PAGE, BACKUP_SPEC, ERROR_SCHEMA, INTERNALS_FIRST, SPLIT_SPEC } from '../support/openapi.ts';
import { ALL_PLAN_SETTINGS, COMMANDS_TABLE, copiedTexts, LONG_SH, recordCopies } from '../support/page-content.ts';
import {
  barButtons,
  expectNoReload,
  hydrated,
  openLive as open,
  openLiveOnStoppedClock,
  test as pageTest,
  TOGGLES,
} from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import type { RunningCommand } from '../support/run-command.ts';
import {
  AFTER_WIZARD,
  askedFiles,
  DECISIONS_PAGE,
  expectFrameFits,
  frameOf,
  innerFrame,
  isFrameMarked,
  markFrame,
  recordFrameLoads,
  unlessReplaced,
  WIREFRAME_FILES,
  WIREFRAMES_SITE,
  wireframeOf,
  WIZARD,
  WIZARD_HTML,
} from '../support/wireframes.ts';

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

test('a save keeps the scroll of a wide table that it does not change, and a wide table that it adds gets the marks', async ({ page, ownSite }) => {
  const run = await ownSite({ 'backups/schedules.md': `# Schedules\n\n${ALL_PLAN_SETTINGS}\n\nA plan says how often.\n` });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `${run.address}backups/schedules.html`);
  const boxes = page.locator('#page .sbox');
  await expect(boxes.first()).toHaveAttribute('role', 'region');
  await boxes.first().evaluate((box) => {
    box.scrollLeft = 150;
    (box as unknown as { kept: boolean }).kept = true;
  });
  await expect(page.locator('#page .wide').first()).toHaveAttribute('data-more', 'left right');

  await run.save('backups/schedules.md', `# Schedules\n\n${ALL_PLAN_SETTINGS}\n\nA plan says how often and how long.\n\n${COMMANDS_TABLE}\n`);

  await expect(page.locator('#page')).toContainText('A plan says how often and how long.');
  await expect(boxes).toHaveCount(2);
  expect(await boxes.first().evaluate((box) => ({ kept: (box as unknown as { kept?: boolean }).kept, left: box.scrollLeft }))).toEqual({
    kept: true,
    left: 150,
  });
  await expect(boxes.first()).toHaveAttribute('role', 'region');
  await expect(boxes.nth(1)).toHaveAttribute('role', 'region');
  await expectNoReload(page);
});

test('a save that renames the title or a heading names each wide table that it keeps by the new name', async ({ page, ownSite }) => {
  const schedules = (title: string, heading: string) => `# ${title}\n\n${COMMANDS_TABLE}\n\n## ${heading}\n\n${ALL_PLAN_SETTINGS}\n`;
  const run = await ownSite({ 'backups/schedules.md': schedules('Schedules', 'All plan settings') });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `${run.address}backups/schedules.html`);
  const region = (name: string) => page.getByRole('region', { name, exact: true });
  await expect(region('Schedules')).toHaveClass('sbox');
  await expect(region('All plan settings')).toHaveClass('sbox');
  const boxes = page.locator('#page .sbox');
  await boxes.evaluateAll((all) => all.forEach((box) => ((box as unknown as { kept: boolean }).kept = true)));

  await run.save('backups/schedules.md', schedules('Plans', 'Every plan setting'));

  await expect(region('Plans')).toHaveClass('sbox');
  await expect(region('Every plan setting')).toHaveClass('sbox');
  expect(await boxes.evaluateAll((all) => all.map((box) => (box as unknown as { kept?: boolean }).kept))).toEqual([true, true]);
  await expectNoReload(page);
});

test('a save keeps a code block that it does not change, with its scroll and its check, and a code block that it adds copies its own code', async ({ page, ownSite }) => {
  const script = (line: string, more = '') => `# Restore by script\n\n\`\`\`sh\n${LONG_SH}\n\`\`\`\n\n${line}\n${more}`;
  const job = '{ "id": "job-4821", "state": "running" }';
  const run = await ownSite({ 'backups/restore-by-script.md': script('The server answers with the job.') });
  await page.setViewportSize({ width: 390, height: 844 });
  await recordCopies(page);
  await openLiveOnStoppedClock(page, `${run.address}backups/restore-by-script.html`);
  const blocks = page.locator('#page .code');
  const first = blocks.first().locator(':scope > pre');
  await expect(first).toHaveAttribute('role', 'region');
  await first.evaluate((box) => {
    box.scrollLeft = 100;
    (box as unknown as { kept: boolean }).kept = true;
  });
  await expect(blocks.first()).toHaveAttribute('data-more', 'left right');
  await blocks.first().locator('.copy').click();
  await expect(blocks.first().locator('.copy')).toHaveAttribute('data-done', '');

  await run.save('backups/restore-by-script.md', script('The server answers with the job and its state.', `\n\`\`\`json\n${job}\n\`\`\`\n`));

  await expect(page.locator('#page')).toContainText('The server answers with the job and its state.');
  await expect(blocks).toHaveCount(2);
  expect(await first.evaluate((box) => ({ kept: (box as unknown as { kept?: boolean }).kept, left: box.scrollLeft }))).toEqual({
    kept: true,
    left: 100,
  });
  await expect(first).toHaveAttribute('role', 'region');
  await expect(blocks.first().locator('.copy')).toHaveAttribute('data-done', '');

  const copies = (await copiedTexts(page)).length;
  await blocks.nth(1).locator('.copy').click();
  await expect.poll(() => copiedTexts(page), OFTEN).toHaveLength(copies + 1);
  expect((await copiedTexts(page)).at(-1)).toBe(job);
  await expect(blocks.nth(1).locator('.copy')).toHaveAttribute('data-done', '');
  await page.clock.runFor(1600);
  await expect(page.locator('#page .copy[data-done]')).toHaveCount(0);
  await expectNoReload(page);
});

/** The `src` of each image of the page, in order. */
const imageSources = (page: Page) => page.locator('#page img').evaluateAll((images) => images.map((image) => image.getAttribute('src')));

test('a save of an image file shows the new file with no reload, and a wide table above it keeps its scroll', async ({ page, ownSite }) => {
  const run = await ownSite({
    'restore.md': `# Restore a file\n\n${ALL_PLAN_SETTINGS}\n\n![Restore window](restore-window.png)\n`,
    'restore-window.png': pngFile(1280, 720),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `${run.address}restore.html`);
  const image = page.getByAltText('Restore window', { exact: true });
  await expect(image).toHaveAttribute('height', '720');
  const [before] = await imageSources(page);
  expect(before).toMatch(/^restore-window\.png\?v=\d+$/);
  const box = page.locator('#page .sbox');
  await expect(box).toHaveAttribute('role', 'region');
  await box.evaluate((element) => (element.scrollLeft = 150));

  await run.save('restore-window.png', pngFile(1280, 800));

  await expect(image).toHaveAttribute('height', '800');
  expect((await imageSources(page))[0]).not.toBe(before);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalHeight), OFTEN).toBe(800);
  expect(await box.evaluate((element) => element.scrollLeft)).toBe(150);
  await expectNoReload(page);
});

test('a save that changes two images replaces every block between them, and the blocks outside keep their state', async ({ page, ownSite }) => {
  const run = await ownSite({
    'restore.md': `# Restore a file\n\n${ALL_PLAN_SETTINGS}\n\n![Restore window](restore-window.png)\n\n${COMMANDS_TABLE}\n\n![Restore window](restore-window.png)\n\n${ALL_PLAN_SETTINGS}\n`,
    'restore-window.png': pngFile(1280, 720),
  });
  await open(page, `${run.address}restore.html`);
  const boxes = page.locator('#page .sbox');
  await expect(boxes).toHaveCount(3);
  await boxes.evaluateAll((all) => all.forEach((box, at) => ((box as unknown as { kept: number }).kept = at)));
  const before = await imageSources(page);
  expect(before).toHaveLength(2);

  await run.save('restore-window.png', pngFile(1280, 800));

  await expect(page.locator('#page img[height="800"]')).toHaveCount(2);
  expect((await imageSources(page)).every((src) => !before.includes(src))).toBe(true);
  await expect(boxes).toHaveCount(3);
  expect(await boxes.evaluateAll((all) => all.map((box) => (box as unknown as { kept?: number }).kept))).toEqual([0, undefined, 2]);
  await expectNoReload(page);
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

test.describe('text at several levels', () => {
  const fenced = (...ids: string[]) => `# Restore a file\n\n${ids.map((id) => `::: ${id}\nText at ${id}.\n`).join('')}:::\n`;
  const RESTORE = `# Restore a file

A restore never changes the copy.

::: overview
Pick a file and a day.
::: requirements
The app restores any file.
::: internals
A restore is a job.
:::
`;

  /** Keeps each error of the page script, since a crash leaves the page in place. */
  function errorsOf(page: Page): Error[] {
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));
    return errors;
  }

  test('a save during a hover or a drag on a stop that goes away leaves the page working', async ({ page, ownSite }) => {
    const errors = errorsOf(page);
    const run = await ownSite({
      'nerddocs.json': levelsFile('overview', 'requirements', 'internals', 'testers'),
      'restore.md': fenced('overview', 'requirements', 'internals', 'testers'),
    });
    await openLiveOnStoppedClock(page, `${run.address}restore.html`);

    await stops(page).nth(3).hover();
    await run.save('nerddocs.json', levelsFile('overview', 'requirements', 'internals'));
    await expect(stops(page)).toHaveCount(3);

    const from = await stopPoint(page, 0, 3);
    const last = await stopPoint(page, 2, 3);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(last.x, last.y);
    await expect(thumb(page)).toHaveClass('drag');
    await expect(litStop(page)).toHaveText('Internals');

    await run.save('nerddocs.json', levelsFile('overview', 'requirements'));
    await expect(stops(page)).toHaveCount(2);
    await expect(thumb(page)).not.toHaveClass('drag');
    await expect(litStop(page)).toHaveText('Overview');
    await page.clock.runFor(1000);
    await page.mouse.up();
    await expectLevel(page, 'overview');

    await pressOnSlider(page, 'ArrowRight');
    await expectLevel(page, 'requirements');
    await expect(page.locator('.part:visible').first()).toContainText('Text at requirements.');
    await page.clock.runFor(MOVE_MS);

    const on = await stopPoint(page, 0, 2);
    await page.mouse.move(on.x, on.y);
    await page.mouse.down();
    await page.mouse.move(on.x + 40, on.y);
    await run.save('restore.md', '# Restore a file\n\nPick a file.\n');
    await expect(thumb(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(page.locator('#page')).toContainText('Pick a file.');
    expect(errors).toEqual([]);
  });

  test('a save keeps the level, and a save that takes away its text moves to the nearest lower level and says its name', async ({ page, ownSite }) => {
    const noShared = RESTORE.replace('A restore never changes the copy.\n\n', '');
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': noShared });
    await open(page, `${run.address}restore.html`);
    await hydrated(page);
    await pressOnSlider(page, 'End');
    await expectLevel(page, 'internals');
    await expect(liveRegion(page)).toContainText('Internals');

    await run.save('restore.md', noShared.replace('A restore is a job.', 'A restore is a job on the server.'));
    await expect(page.locator('#page')).toContainText('A restore is a job on the server.');
    await expectLevel(page, 'internals');
    await expect(litStop(page)).toHaveText('Internals');

    await run.save('restore.md', noShared.replace('::: internals\nA restore is a job.\n', ''));
    await expectLevel(page, 'requirements');
    await expect(litStop(page)).toHaveText('Requirements');
    await expect(liveRegion(page)).toContainText('Requirements');
    await expect(page.getByText('The app restores any file.')).toBeVisible();
    await expect(stops(page).nth(2)).toHaveClass(/hollow/);
    await expectNoReload(page);
  });

  test('a save that takes away the part of the level keeps the level while shared text stays', async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': RESTORE });
    await open(page, `${run.address}restore.html`);
    await hydrated(page);
    await pressOnSlider(page, 'End');
    await expectLevel(page, 'internals');

    await run.save('restore.md', RESTORE.replace('::: internals\nA restore is a job.\n', ''));
    await expect(page.getByText('A restore is a job.')).toHaveCount(0);
    await expectLevel(page, 'internals');
    await expect(litStop(page)).toHaveText('Internals');
    await expect(stops(page).nth(2)).not.toHaveClass(/hollow/);
    await expect(page.getByText('A restore never changes the copy.')).toBeVisible();
  });

  test('the level stays through a save that leaves the page with no parts', async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': RESTORE });
    await open(page, `${run.address}restore.html`);
    await hydrated(page);
    await pressOnSlider(page, 'End');
    await expectLevel(page, 'internals');

    await run.save('restore.md', '# Restore a file\n\nPick a file.\n');
    await expect(page.locator('#no-levels')).toBeVisible();
    await expectLevel(page, 'internals');

    await run.save('restore.md', RESTORE);
    await expect(page.locator('#no-levels')).toHaveCount(0);
    await expectLevel(page, 'internals');
    await expect(litStop(page)).toHaveText('Internals');
    await expect(page.getByText('A restore is a job.')).toBeVisible();
    await expectNoReload(page);
  });

  test('a save during a move ends the move, so no half-done text stays', async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': RESTORE });
    await openLiveOnStoppedClock(page, `${run.address}restore.html`);
    await pressOnSlider(page, 'End');
    await expect(page.locator('#page .ghost')).toHaveCount(1);

    await run.save('restore.md', RESTORE.replace('A restore is a job.', 'A restore is a job on the server.'));
    await expect(page.locator('#page')).toContainText('A restore is a job on the server.');
    await expect(page.locator('#page .ghost, #page .flash, #page .seam')).toHaveCount(0);
    expect(await page.locator('.part[data-l="internals"]').evaluate((el) => [el.style.height, el.style.opacity, el.style.clipPath])).toEqual(['', '', '']);
    expect(await page.locator('#page').evaluate((el) => el.style.length)).toBe(0);
    await expectLevel(page, 'internals');
  });

  test('a saved config changes the names, the order and the marks with no reload', async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': RESTORE });
    await open(page, `${run.address}restore.html`);
    await hydrated(page);
    await expect(page.locator('.stop .nm > span')).toHaveText(['Overview', 'Requirements', 'Internals']);

    await run.save(
      'nerddocs.json',
      JSON.stringify({ levels: [{ id: 'internals', name: 'Deep', icon: 'cpu' }, { id: 'overview', name: 'Short' }, { id: 'requirements' }] }),
    );
    await expect(page.locator('.stop .nm > span')).toHaveText(['Deep', 'Short', 'Requirements']);
    await expect(litStop(page)).toHaveText('Short');
    await expectLevel(page, 'overview');
    await expect(page.locator('.part:visible .marks svg text')).toHaveText('S');
    await expectNoReload(page);
  });

  test('the stops show when a save adds a part, and the label comes back when a save takes it away', async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': '# Restore a file\n\nPick a file.\n' });
    await open(page, `${run.address}restore.html`);
    await hydrated(page);
    await expect(page.locator('#thumb')).toHaveCount(0);
    await expect(page.locator('#no-levels')).toBeVisible();

    await run.save('restore.md', fenced('overview', 'internals'));
    await expect(thumb(page)).toBeVisible();
    await expect(page.locator('#no-levels')).toHaveCount(0);
    await expectLevel(page, 'overview');
    await expect(page.getByText('Text at internals.')).toBeHidden();

    await run.save('restore.md', '# Restore a file\n\nPick a file.\n');
    await expect(page.locator('#thumb')).toHaveCount(0);
    await expect(page.locator('#no-levels')).toBeVisible();
    await expect(page.getByText('Pick a file.')).toBeVisible();
    await expectNoReload(page);
  });

  test('on a site whose names do not fit, a save that brings the stops back measures the names', async ({ page, ownSite }) => {
    const run = await ownSite({
      'nerddocs.json': levelsFile('overview', 'requirements', 'internals', 'testers', 'managers', 'developers', 'writers', 'operators'),
      'restore.md': '# Restore a file\n\nPick a file.\n',
    });
    await open(page, `${run.address}restore.html`);
    await hydrated(page);
    await expect(page.locator('#no-levels')).toBeVisible();
    await expect(page.locator('#bar')).not.toHaveClass(/compact/);

    await run.save('restore.md', fenced('overview', 'requirements'));
    await expect(thumb(page)).toBeVisible();
    await expect(page.locator('#bar')).toHaveClass(/compact/);
    await expect(page.locator('.stop .nm > span').first()).toBeHidden();

    await run.save('restore.md', '# Restore a file\n\nPick a file.\n');
    await expect(page.locator('#no-levels')).toBeVisible();
    await expect(page.locator('#bar')).not.toHaveClass(/compact/);
    await expectNoReload(page);
  });

  test('a saved config that turns levels off takes the slider away, and a saved config with levels brings it back', async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': RESTORE });
    await open(page, `${run.address}restore.html`);
    await hydrated(page);
    await pressOnSlider(page, 'End');
    await expectLevel(page, 'internals');

    await run.save('nerddocs.json', NO_LEVELS);
    await expect(page.locator('#thumb')).toHaveCount(0);
    await expect.poll(() => barButtons(page), OFTEN).toEqual(TOGGLES);
    await expect(page.locator('#nd-level')).toHaveAttribute('data-level', '');
    await expect(page.locator('#page')).toContainText('::: overview');
    await expect(page.getByRole('alertdialog')).toBeHidden();

    await run.save('nerddocs.json', THREE_LEVELS);
    await expect(thumb(page)).toBeVisible();
    await expectLevel(page, 'internals');
    await expect(page.locator('#page')).not.toContainText('::: overview');
    await expectNoReload(page);
  });

  test('a saved config that lists a word changes its fence line from text into a part, with no save of the page', async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': levelsFile('overview', 'requirements'), 'restore.md': `${RESTORE}\n::: testers\nText at testers.\n:::\n` });
    await open(page, `${run.address}restore.html`);
    await hydrated(page);
    await expect(page.locator('#page')).toContainText('::: testers');
    await expect(stops(page)).toHaveCount(2);

    await run.save('nerddocs.json', levelsFile('overview', 'requirements', 'testers'));
    await expect(stops(page)).toHaveCount(3);
    await expect(page.locator('#page')).not.toContainText('::: testers');
    await expect(page.getByText('Text at testers.')).toBeHidden();
    await expectNoReload(page);
  });

  test('a renamed page opens at its opening level with no reload', async ({ page, ownSite }) => {
    const run = await ownSite({ 'restore.md': RESTORE, 'nerddocs.json': THREE_LEVELS });
    await open(page, `${run.address}restore.html`);
    await hydrated(page);
    await pressOnSlider(page, 'End');
    await expectLevel(page, 'internals');

    await run.move('restore.md', 'get-it-back.md');
    await expect(page).toHaveURL(/get-it-back\.html$/);
    await expectLevel(page, 'overview');
    await expect(litStop(page)).toHaveText('Overview');
    await expectNoReload(page);
  });

  test("the block that 'Go to text' marked stays in place through a save of another block", async ({ page, ownSite }) => {
    const source = `${RESTORE}\n${LONG}\n\nLast line.`;
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'restore.md': source });
    await open(page, `${run.address}restore.html`);
    await hydrated(page);
    await thumb(page).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const marked = page.locator('#page > :focus');
    await expect(marked).toHaveAttribute('tabindex', '-1');
    await marked.evaluate((el) => {
      (window as unknown as { kept: Element }).kept = el;
    });

    await run.save('restore.md', source.replace('Last line.', 'A new last line.'));
    await expect(page.locator('#page')).toContainText('A new last line.');
    expect(await page.evaluate(() => (window as unknown as { kept: Element }).kept.isConnected)).toBe(true);
    await expect(marked).toHaveCount(1);
  });
});

test.describe('a Mermaid diagram', () => {
  const FLOWS = `# User flows\n\nA user starts a restore.\n\n${mermaidBlock(RESTORE_FLOW)}\n`;

  /** Starts a command on 'User flows', opens it live in 'Themelessness' light, and waits until its diagram is drawn. */
  async function openFlows(page: Page, ownSite: (files: Record<string, string>) => Promise<RunningCommand>) {
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'user-flows.md': FLOWS });
    const asked = recordBuilds(page);
    await storeLook(page, 'themelessness', 'light');
    await open(page, `${run.address}user-flows.html`);
    await hydrated(page);
    await expectDrawn(diagramBox(page, RESTORE_FLOW));
    return { run, asked };
  }

  test('a save of another block keeps a drawn diagram with no new draw', async ({ page, ownSite }) => {
    const { run, asked } = await openFlows(page, ownSite);
    const flow = diagramBox(page, RESTORE_FLOW);
    const drawn = await flow.getAttribute('data-drawn');
    await markDrawing(flow);

    await run.save('user-flows.md', FLOWS.replace('A user starts a restore.', 'A user starts a restore from the button.'));
    await expect(page.locator('#page')).toContainText('A user starts a restore from the button.');
    expect(await isMarked(drawingOf(flow)), 'the same drawing').toBe(true);
    await expect(flow).toHaveAttribute('data-drawn', drawn!);
    expect(asked).toEqual(['mermaid.js']);
    await expectNoReload(page);
  });

  test('a save that adds lines above a diagram keeps its drawing, and a broken diagram names its new line', async ({ page, ownSite }) => {
    const text = `${FLOWS}\n${mermaidBlock(BROKEN_FLOW)}\n`;
    const run = await ownSite({ 'nerddocs.json': THREE_LEVELS, 'user-flows.md': text });
    await storeLook(page, 'themelessness', 'light');
    await open(page, `${run.address}user-flows.html`);
    await hydrated(page);
    const flow = diagramBox(page, RESTORE_FLOW);
    const broken = diagramBox(page, BROKEN_FLOW);
    await expectDrawn(flow);
    await expect(broken).toHaveAttribute('data-state', 'bad');
    const flowLine = Number(await flow.getAttribute('data-line'));
    const brokenLine = Number(await broken.getAttribute('data-line'));
    // Mermaid names line 3 of the broken source.
    await expect(broken.locator(':scope > .problem code')).toHaveText(`Bad Mermaid: user-flows.md:${brokenLine + 3}`);
    await markDrawing(flow);

    await run.save('user-flows.md', text.replace('A user starts a restore.', 'A user starts a restore.\n\nThe agent asks the server.'));
    await expect(page.locator('#page')).toContainText('The agent asks the server.');
    await expect(flow).toHaveAttribute('data-line', String(flowLine + 2));
    expect(await isMarked(drawingOf(flow)), 'the same drawing').toBe(true);
    await expect(broken).toHaveAttribute('data-line', String(brokenLine + 2));
    await expect(broken.locator(':scope > .problem code')).toHaveText(`Bad Mermaid: user-flows.md:${brokenLine + 5}`);
    await expectNoReload(page);
  });

  test('a save that changes a diagram draws the new one', async ({ page, ownSite }) => {
    const { run } = await openFlows(page, ownSite);
    const changed = RESTORE_FLOW.replace('F[Restored file]', 'F[Restored copy]');

    await run.save('user-flows.md', FLOWS.replace(RESTORE_FLOW, changed));
    const flow = diagramBox(page, changed);
    await expectDrawn(flow);
    await expect(drawingOf(flow)).toContainText('Restored copy');
    await expectNoReload(page);
  });

  test('a save that adds a mindmap loads the full build and draws every diagram again', async ({ page, ownSite }) => {
    const { run, asked } = await openFlows(page, ownSite);

    await run.save('user-flows.md', `${FLOWS}\n${mermaidBlock(RESTORE_MAP)}\n`);
    const boxes = page.locator('#page .dg');
    await expect(boxes).toHaveCount(2);
    await expect.poll(() => asked, OFTEN).toContain('mermaid-full.js');
    for (const box of await boxes.all()) await expect(box).toHaveAttribute('data-drawn', / full$/);
    await expectNoReload(page);
  });
});

test.describe('an HTML wireframe', () => {
  /** Starts a command on the wireframes, and opens 'Design decisions' live once 'Restore wizard' fits its frame. */
  async function openDecisions(page: Page, ownSite: (files: typeof WIREFRAMES_SITE) => Promise<RunningCommand>) {
    const run = await ownSite(WIREFRAMES_SITE);
    await open(page, `${run.address}design/decisions.html`);
    await hydrated(page);
    await expectFrameFits(page, WIZARD);
    return run;
  }

  /** A value that the document of the frame of 'Restore wizard' gives, as it is now. */
  const inFrame = <T,>(page: Page, read: () => T) => () => unlessReplaced(async () => (await innerFrame(page, WIZARD)).evaluate(read));

  test('a save of a file that a wireframe names shows it in the frame with no reload, and the new frames ask only for the files of the wireframes', async ({ page, ownSite }) => {
    const run = await openDecisions(page, ownSite);
    const loads = recordFrameLoads(page);

    await run.save('design/wireframes/wizard.css', 'body { background: #ffe0e0; }\n');
    // A new frame has no body while its head still loads, so the read gives '' then.
    await expect
      .poll(inFrame(page, () => (document.body ? getComputedStyle(document.body).backgroundColor : '')), OFTEN)
      .toBe('rgb(255, 224, 224)');
    // The next save replaces the frame, so the frame first loads all its files.
    await expectFrameFits(page, WIZARD);

    await run.save(WIZARD, WIZARD_HTML.replace('<strong>Restore</strong>', '<strong>Restore a file</strong>'));
    await expect.poll(inFrame(page, () => document.querySelector('header strong')?.textContent ?? ''), OFTEN).toBe('Restore a file');
    await expectNoReload(page);

    await expectFrameFits(page, WIZARD);
    await expect.poll(() => loads.waiting(), { ...OFTEN, message: 'each request of a frame has ended' }).toBe(0);
    expect(askedFiles(loads, run.address), 'the files that the new frames ask for').toEqual(WIREFRAME_FILES);
    expect(loads.failed, 'the requests that fail').toEqual([]);
    expect(loads.errors, 'the errors of the console').toEqual([]);
  });

  test('a save of another block keeps a wireframe with its step, its height and its full-size view', async ({ page, ownSite }) => {
    const run = await openDecisions(page, ownSite);
    await (await innerFrame(page, WIZARD)).locator('#go').click();
    await expect((await innerFrame(page, WIZARD)).locator('#step-2')).toBeVisible();
    await expectFrameFits(page, WIZARD);
    await markFrame(page, WIZARD);
    const height = () => frameOf(page, WIZARD).evaluate((frame: HTMLElement) => frame.style.height);
    const before = await height();
    expect(before).toMatch(/^\d+px$/);
    const block = wireframeOf(page, WIZARD);
    await block.getByRole('button', { name: 'Full size', exact: true }).click();
    await expect(block).toHaveClass(/(^|\s)full(\s|$)/);

    await run.save('design/decisions.md', DECISIONS_PAGE.replace(AFTER_WIZARD, 'See [Schedules](../schedules.md) for the days that each plan keeps.'));
    await expect(page.locator('#page')).toContainText('for the days that each plan keeps.');
    expect(await isFrameMarked(page, WIZARD), 'the same document').toBe(true);
    await expect((await innerFrame(page, WIZARD)).locator('#step-2')).toBeVisible();
    await expect(block).toHaveClass(/(^|\s)full(\s|$)/);
    expect(await height(), 'the height of the frame').toBe(before);
    await expectNoReload(page);
  });
});

test.describe('an API reference', () => {
  test('a save of the OpenAPI file or of a file that its $ref names shows the new reference with no reload', async ({ page, ownSite }) => {
    const run = await ownSite({
      'nerddocs.json': INTERNALS_FIRST,
      'api.md': BACKUP_API_PAGE,
      'api/openapi.yaml': SPLIT_SPEC,
      'api/schemas/error.yaml': ERROR_SCHEMA,
    });
    await open(page, `${run.address}api.html`);
    await hydrated(page);
    const reference = page.locator('#page section.api');
    await expect(reference.locator('.api-sum').first()).toHaveText('Start a restore');
    const hint = reference.locator('li > code', { hasText: /^hint$/ });
    await expect(hint).toHaveCount(0);

    await run.save('api/openapi.yaml', SPLIT_SPEC.replace('summary: Start a restore', 'summary: Start one restore'));
    await expect(reference.locator('.api-sum').first()).toHaveText('Start one restore');

    await run.save('api/schemas/error.yaml', `${ERROR_SCHEMA}  hint:\n    type: string\n`);
    await expect(hint.first()).toBeVisible();
    await expectNoReload(page);
  });

  test('a save above the line in a reference keeps the heading nearest above the line in place', async ({ page, ownSite }) => {
    const run = await ownSite({ 'nerddocs.json': INTERNALS_FIRST, 'api.md': BACKUP_API_PAGE, 'api/openapi.yaml': BACKUP_SPEC });
    await page.setViewportSize({ width: 1280, height: 600 });
    await open(page, `${run.address}api.html`);
    await hydrated(page);
    await noScrollAnchoring(page);
    const heading = page.locator('#get-restoresid');
    const top = () => heading.evaluate((element) => element.getBoundingClientRect().top);
    await scrollPage(page, (await heading.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)) - 150);
    expect(Math.abs((await top()) - 150), 'the heading before the save').toBeLessThanOrEqual(1);

    const one = '      description: Puts the copy of one file from one day back on the computer.\n';
    const four = [
      '      description: |',
      '        Puts the copy of one file from one day back on the computer.',
      '',
      '        The restore keeps the file that is there now under a new name.',
      '',
      '        A restore of a big file takes a few minutes.',
      '',
      '        The app shows a note when the restore is done.',
      '',
    ].join('\n');
    await run.save('api/openapi.yaml', BACKUP_SPEC.replace(one, four));

    await expect(page.locator('#page section.api')).toContainText('The app shows a note when the restore is done.');
    expect(Math.abs((await top()) - 150), 'the heading after the save').toBeLessThanOrEqual(1);
    await expectNoReload(page);
  });
});
