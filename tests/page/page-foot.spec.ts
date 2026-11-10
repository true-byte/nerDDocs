import { expect, type Locator, type Page } from '@playwright/test';
import { DEFAULT_KEY } from '../../src/page/level-memory.ts';
import { expectLevel, MOVE_MS, openOnStoppedClock, pressOnSlider, THREE_LEVELS } from '../support/levels.ts';
import { hydrated, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

/** At this speed 60 words take one minute. */
const CONFIG = JSON.stringify({ ...JSON.parse(THREE_LEVELS), wordsPerMinute: 60 });

/** 'Restore a file' takes 1 minute at 'Overview', has no text at 'Requirements', and takes 4 minutes at 'Internals'. */
const RESTORE_PAGE = `# Restore a file

::: overview
Pick a file and a day.
::: internals
${Array.from({ length: 40 }, () => 'The job reads each block.').join(' ')}
:::
`;

/** The tree holds 'Restore a file', 'Schedules' and 'Storage' in this order. */
const SITE = {
  'nerddocs.json': CONFIG,
  'restore.md': RESTORE_PAGE,
  'schedules.md': '# Schedules\n\nA plan says how often.\n\n::: overview\nA plan runs each day.\n::: internals\nA plan is a job.\n:::\n',
  'storage.md': '# Storage\n\nBlocks are stored once.\n',
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

const foot = (page: Page) => page.getByRole('navigation', { name: 'Pages', exact: true });
const footLink = (page: Page, name: string) => foot(page).getByRole('link', { name: new RegExp(`^${name}`) });
const ARROW = 'M5 12h14M13 6l6 6-6 6';

/** The minutes that a link of the foot shows: the text of each element in it that shows and holds only a time. */
const shownMinutes = (link: Locator) =>
  link.evaluate((element) =>
    [...element.querySelectorAll('*')]
      .filter((each) => each.children.length === 0 && each.checkVisibility())
      .map((each) => each.textContent?.trim() ?? '')
      .filter((text) => /^\d+(m|h)/.test(text)),
  );

async function expectMinutes(page: Page, restore: string): Promise<void> {
  await expect.poll(() => shownMinutes(footLink(page, 'Restore a file')), OFTEN).toEqual([restore]);
  expect(await shownMinutes(footLink(page, 'Storage'))).toEqual(['1m']);
}

/** The color that a token gives, as the browser computes it. */
const tokenColor = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.querySelector('.col')!.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);

const storedDefault = (page: Page) => page.evaluate((key) => localStorage.getItem(key), DEFAULT_KEY);

test("the foot sits right after the text in the column, with the page before on the left and the page after on the right, over a thin line in '--line'", async ({ page, docs }) => {
  await page.goto(`${docs.address}schedules.html`);
  await hydrated(page);
  await expect(foot(page)).toBeVisible();
  expect(
    await foot(page).evaluate((nav) => ({
      id: nav.id,
      className: nav.className,
      afterText: nav.previousElementSibling?.id,
      inColumn: nav.parentElement?.classList.contains('col'),
    })),
  ).toEqual({ id: 'pgFoot', className: 'pg-foot', afterText: 'page', inColumn: true });

  const previous = footLink(page, 'Restore a file');
  const next = footLink(page, 'Storage');
  await expect(previous).toHaveAttribute('href', 'restore.html');
  await expect(next).toHaveAttribute('href', 'storage.html');
  const box = (await foot(page).boundingBox())!;
  const left = (await previous.boundingBox())!;
  const right = (await next.boundingBox())!;
  expect(Math.abs(left.x - box.x)).toBeLessThanOrEqual(12);
  expect(Math.abs(right.x + right.width - (box.x + box.width))).toBeLessThanOrEqual(12);
  expect(left.x + left.width).toBeLessThan(right.x);

  const line = await foot(page).evaluate((nav) => {
    const style = getComputedStyle(nav);
    return { width: parseFloat(style.borderTopWidth), style: style.borderTopStyle, color: style.borderTopColor };
  });
  expect(line.width).toBeGreaterThan(0);
  expect(line.width).toBeLessThanOrEqual(2);
  expect(line.style).toBe('solid');
  expect(line.color).toBe(await tokenColor(page, '--line'));
});

test('the page before shows the arrow turned left, its title, then its minutes, and the page after its title, its minutes, then the arrow, with the minutes in --soft', async ({ page, docs }) => {
  await page.goto(`${docs.address}schedules.html`);
  await hydrated(page);
  /** The left edge of the arrow, the title and the minutes of a link, and how the arrow is turned: -1 points it left. */
  const layout = (link: Locator, title: string) =>
    link.evaluate(
      (element, name) => {
        const arrow = [...element.querySelectorAll('svg')].find((icon) => icon.innerHTML.includes('M5 12h14'))!;
        const shown = [...element.querySelectorAll('*')].filter((each) => each.children.length === 0 && each.checkVisibility());
        const titleBox = shown.find((each) => each.textContent?.trim() === name)!;
        const minutes = shown.find((each) => /^\d+m$/.test(each.textContent?.trim() ?? ''))!;
        const transform = getComputedStyle(arrow).transform;
        return {
          arrow: arrow.getBoundingClientRect().left,
          title: titleBox.getBoundingClientRect().left,
          minutes: minutes.getBoundingClientRect().left,
          turned: Math.sign(new DOMMatrix(transform === 'none' ? undefined : transform).a),
          minutesColor: getComputedStyle(minutes).color,
        };
      },
      title,
    );
  const previous = await layout(footLink(page, 'Restore a file'), 'Restore a file');
  const next = await layout(footLink(page, 'Storage'), 'Storage');
  expect(await footLink(page, 'Restore a file').locator(`svg path[d="${ARROW}"]`).count()).toBe(1);
  expect(previous.arrow).toBeLessThan(previous.title);
  expect(previous.title).toBeLessThan(previous.minutes);
  expect(previous.turned).toBe(-1);
  expect(next.title).toBeLessThan(next.minutes);
  expect(next.minutes).toBeLessThan(next.arrow);
  expect(next.turned).toBe(1);
  const soft = await tokenColor(page, '--soft');
  expect([previous.minutesColor, next.minutesColor]).toEqual([soft, soft]);
});

test("the minutes are those of the level that each page opens at for this reader, through a level change, 'Defaults' and 'All pages'", async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}schedules.html`);
  await expectMinutes(page, '1m');

  // 'Restore a file' still opens at 'Overview'.
  await pressOnSlider(page, '3');
  await page.clock.runFor(MOVE_MS);
  await expectLevel(page, 'internals');
  await expectMinutes(page, '1m');

  await page.locator('#dflB').click();
  await page.locator('#defaults-box').getByRole('button', { name: 'Internals', exact: true }).click();
  await page.clock.runFor(MOVE_MS);
  await expect.poll(() => storedDefault(page), OFTEN).toBe('internals');
  await expectMinutes(page, '4m');
  await page.keyboard.press('Escape');

  await pressOnSlider(page, '1');
  await page.clock.runFor(MOVE_MS);
  await expectLevel(page, 'overview');
  await expectMinutes(page, '4m');
  await page.getByRole('button', { name: 'All pages' }).click();
  await expect.poll(() => storedDefault(page), OFTEN).toBe('overview');
  await expectMinutes(page, '1m');
});

test("the minutes follow the level kept for 'Restore a file' in this tab", async ({ page, docs }) => {
  await page.goto(`${docs.address}restore.html`);
  await hydrated(page);
  await pressOnSlider(page, '3');
  await expectLevel(page, 'internals');
  await page.goto(`${docs.address}schedules.html`);
  await hydrated(page);
  await expectLevel(page, 'overview');
  await expectMinutes(page, '4m');
});

test('the first page has only the page after, and the last page only the page before', async ({ page, docs }) => {
  await page.goto(`${docs.address}restore.html`);
  await hydrated(page);
  await expect(foot(page).getByRole('link')).toHaveCount(1);
  await expect(footLink(page, 'Schedules')).toHaveAttribute('href', 'schedules.html');
  await page.goto(`${docs.address}storage.html`);
  await hydrated(page);
  await expect(foot(page).getByRole('link')).toHaveCount(1);
  await expect(footLink(page, 'Schedules')).toHaveAttribute('href', 'schedules.html');
});

test.describe('with no script', () => {
  test.use({ javaScriptEnabled: false });

  test('the foot shows the minutes at the level of the open page, and its links open their pages', async ({ page, docs }) => {
    await page.goto(`${docs.address}schedules.html`);
    await expect(foot(page)).toBeVisible();
    await expectMinutes(page, '1m');
    await footLink(page, 'Storage').click();
    await expect(page).toHaveURL(`${docs.address}storage.html`);
    await expect(page.locator('h1')).toHaveText('Storage');
  });
});
