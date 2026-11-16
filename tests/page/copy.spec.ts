import { expect, type Page } from '@playwright/test';
import { openOnStoppedClock } from '../support/levels.ts';
import { hydrated, test as pageTest } from '../support/page.ts';
import { CODE_SITE, copiedTexts, CURL_TEXT, JOB_JSON, recordCopies } from '../support/page-content.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

/** The tests only read 'Restore by script', so they share one command on it. */
const test = pageTest.extend<object, { code: RunningCommand }>({
  code: [
    async ({}, use) => {
      const run = await runCommand(CODE_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

const SCRIPT = 'backups/restore-by-script.html';
const copyOf = (page: Page, index = 0) => page.locator('#page .code').nth(index).locator('.copy');

test("a click on the copy icon copies the code, shows the check for 1.5 s and says 'Copied', and a new click starts the 1.5 s again", async ({ page, code }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await recordCopies(page);
  await openOnStoppedClock(page, `${code.address}${SCRIPT}`);
  const button = copyOf(page);
  const copyIcon = button.locator('svg').first();
  const checkIcon = button.locator('svg').nth(1);
  const status = page.locator('#nd-status');
  await expect(checkIcon).toBeHidden();
  await expect(status).toBeEmpty();

  await button.click();
  await expect.poll(() => copiedTexts(page), OFTEN).toEqual([CURL_TEXT]);
  await expect(button).toHaveAttribute('data-done', '');
  await expect(copyIcon).toBeHidden();
  await expect(checkIcon).toBeVisible();
  await expect(status).toHaveText('Copied');

  await page.clock.runFor(1400);
  await expect(button).toHaveAttribute('data-done', '');
  await expect(checkIcon).toBeVisible();
  await expect(status).toHaveText('Copied');

  await page.clock.runFor(200);
  await expect(button).not.toHaveAttribute('data-done');
  await expect(copyIcon).toBeVisible();
  await expect(checkIcon).toBeHidden();
  await expect(status).toBeEmpty();

  await button.click();
  await expect(button).toHaveAttribute('data-done', '');
  await page.clock.runFor(1000);
  await button.click();
  // The page starts the check again once the copy resolves, which follows the write at once.
  await expect.poll(async () => (await copiedTexts(page)).length, OFTEN).toBe(3);
  await page.clock.runFor(1000);
  await expect(button).toHaveAttribute('data-done', '');
  await page.clock.runFor(600);
  await expect(button).not.toHaveAttribute('data-done');

  await button.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => copiedTexts(page), OFTEN).toEqual([CURL_TEXT, CURL_TEXT, CURL_TEXT, CURL_TEXT]);
});

test("a copy of another block within 1.5 s writes 'Copied' to the status line again", async ({ page, code }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await recordCopies(page);
  await openOnStoppedClock(page, `${code.address}${SCRIPT}`);
  await page.evaluate(() => {
    const record = window as unknown as { writes: number };
    record.writes = 0;
    new MutationObserver((list) => {
      record.writes += list.length;
    }).observe(document.getElementById('nd-status')!, { childList: true });
  });
  const writes = () => page.evaluate(() => (window as unknown as { writes: number }).writes);

  await copyOf(page).click();
  await expect.poll(writes, OFTEN).toBe(1);
  await page.clock.runFor(1000);
  await page.locator('#page .code').filter({ hasText: '"job-4821"' }).locator('.copy').click();
  await expect.poll(writes, OFTEN).toBe(2);
  await expect(page.locator('#nd-status')).toHaveText('Copied');
});

test('with no Clipboard API, or with one that refuses, the copy selects the code and copies it', async ({ page, code }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const record = window as unknown as { copied: string[] };
    record.copied = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => undefined });
    document.addEventListener('copy', () => record.copied.push(getSelection()?.toString() ?? ''));
  });
  await page.goto(`${code.address}${SCRIPT}`);
  await hydrated(page);
  const copied = () => page.evaluate(() => (window as unknown as { copied: string[] }).copied);

  await copyOf(page).click();
  await expect.poll(copied, OFTEN).toEqual([CURL_TEXT]);
  await expect(copyOf(page)).toHaveAttribute('data-done', '');
  expect(await page.evaluate(() => getSelection()?.rangeCount)).toBe(0);

  await page.evaluate(() => {
    const clipboard = { writeText: () => Promise.reject(new Error('NotAllowedError')) };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => clipboard });
  });
  await page.locator('#page .code').filter({ hasText: '"job-4821"' }).locator('.copy').click();
  await expect.poll(async () => (await copied()).at(-1), OFTEN).toBe(JOB_JSON);
  expect(await page.evaluate(() => getSelection()?.rangeCount)).toBe(0);
});
