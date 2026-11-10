import { expect, type Locator, type Page } from '@playwright/test';
import { DEFAULT_KEY } from '../../src/page/level-memory.ts';
import { expectLevel, MOVE_MS, openOnStoppedClock, pressOnSlider, THREE_LEVELS } from '../support/levels.ts';
import { expectNoReload, hydrated, openLive, test as pageTest } from '../support/page.ts';
import { STEPS } from '../support/page-content.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

/** Links to a heading at two levels, to a heading at one level, to a heading at every level, and links with a level in the hash. */
const RESTORE_PAGE = `# Restore a file

See [the index](#search-index), [the index at overview](#overview/search-index), [the day](#pick-a-day), [the weekly plan](schedules.md#weekly-plan), [the plans](schedules.md#plans) and [the plan at internals](schedules.md#internals/weekly-plan).

## Pick a day

::: overview
Pick a file and a day.
::: internals
A restore is a job on the storage server.
:::

## Search index

::: internals
The index maps each block to its file.
:::

## Check the result

Open the file and check it.
`;

const SCHEDULES_PAGE = `# Schedules

## Plans

A plan says how often.

## Weekly plan

::: requirements
A weekly plan runs on Sunday.

${STEPS}
:::

## More plans

${STEPS}

${STEPS}
`;

const SITE = { 'nerddocs.json': THREE_LEVELS, 'restore.md': RESTORE_PAGE, 'schedules.md': SCHEDULES_PAGE };

/** 'Restore a file' with shared text, a heading at 'Overview' and 'Internals', and a heading at every level. */
const LINKED_RESTORE = `# Restore a file

A restore never changes the copy.

## Pick a day

::: overview
Pick a file and a day.
::: internals
A restore is a job on the storage server.
:::

## Keys

Each seat needs a key.
`;

/** 'Schedules' with links to 'Restore a file': at a level in the hash, to a heading at two levels, and to a heading at every level. */
const LINKING_SCHEDULES = `# Schedules

See [the day at internals](restore.md#internals/pick-a-day), [the day](restore.md#pick-a-day) and [the keys](restore.md#keys).

::: overview
A plan says how often.
::: internals
A plan is a job on the storage server.
:::
`;

const LINKED_SITE = { 'nerddocs.json': THREE_LEVELS, 'restore.md': LINKED_RESTORE, 'schedules.md': LINKING_SCHEDULES };

/** Tests that only read the linked site share one command on it. */
const test = pageTest.extend<object, { linked: RunningCommand }>({
  linked: [
    async ({}, use) => {
      const run = await runCommand(LINKED_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

test.use({ viewport: { width: 1280, height: 720 } });

const textLink = (page: Page, name: string) => page.locator('#page').getByRole('link', { name, exact: true });

/** The color that a level stop shows, as the browser computes it. */
const levelColor = (page: Page, stop: number) =>
  page.evaluate((at) => {
    const probe = document.createElement('span');
    probe.style.color = `var(--l${at})`;
    document.querySelector('#page')!.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, stop);
const colorOf = (link: Locator) => link.evaluate((element) => getComputedStyle(element).color);
const width = (link: Locator) => link.evaluate((element) => element.getBoundingClientRect().width);

test('a link that opens another level names it, shows its icon after its text and its color, and follows each level change', async ({ page, ownSite }) => {
  const run = await ownSite(SITE);
  await page.goto(`${run.address}restore.html`);
  await hydrated(page);
  const index = textLink(page, 'the index');
  const indexAtOverview = textLink(page, 'the index at overview');
  const day = textLink(page, 'the day');
  const weekly = textLink(page, 'the weekly plan');
  const plans = textLink(page, 'the plans');
  const planAtInternals = textLink(page, 'the plan at internals');

  await expect(index).toHaveAttribute('data-level', 'internals');
  await expect(index).toHaveAttribute('href', '#internals/search-index');
  await expect(weekly).toHaveAttribute('data-level', 'requirements');
  await expect(weekly).toHaveAttribute('href', 'schedules.html#requirements/weekly-plan');
  await expect(planAtInternals).toHaveAttribute('data-level', 'internals');
  await expect(planAtInternals).toHaveAttribute('href', 'schedules.html#internals/weekly-plan');
  await expect(day).not.toHaveAttribute('data-level');
  await expect(day).toHaveAttribute('href', '#overview/pick-a-day');
  await expect(indexAtOverview).not.toHaveAttribute('data-level');
  await expect(plans).not.toHaveAttribute('data-level');
  await expect(plans).toHaveAttribute('href', 'schedules.html#plans');

  await expect.poll(() => colorOf(index), OFTEN).toBe(await levelColor(page, 2));
  await expect.poll(() => colorOf(weekly), OFTEN).toBe(await levelColor(page, 1));
  const indexWithIcon = await width(index);
  const dayWithout = await width(day);

  await pressOnSlider(page, '2');
  await expectLevel(page, 'requirements');
  await expect(day).toHaveAttribute('data-level', 'overview');
  await expect(day).toHaveAttribute('href', '#overview/pick-a-day');
  // 'Schedules' still opens at 'Overview' for this reader.
  await expect(weekly).toHaveAttribute('data-level', 'requirements');
  await expect.poll(() => colorOf(day), OFTEN).toBe(await levelColor(page, 0));
  expect(await width(day)).toBeGreaterThan(dayWithout + 4);

  await pressOnSlider(page, '3');
  await expectLevel(page, 'internals');
  await expect(index).not.toHaveAttribute('data-level');
  await expect(index).toHaveAttribute('href', '#internals/search-index');
  await expect(day).not.toHaveAttribute('data-level');
  await expect(day).toHaveAttribute('href', '#internals/pick-a-day');
  await expect(indexAtOverview).toHaveAttribute('data-level', 'overview');
  await expect(planAtInternals).toHaveAttribute('data-level', 'internals');
  await expect(weekly).toHaveAttribute('data-level', 'requirements');
  expect(await width(index)).toBeLessThan(indexWithIcon - 4);

  await weekly.click();
  await expect(page).toHaveURL(/\/schedules\.html#requirements\/weekly-plan$/);
  await hydrated(page);
  await expectLevel(page, 'requirements');
  await expect
    .poll(
      () =>
        page
          .locator('#weekly-plan')
          .evaluate((heading) => Math.abs(heading.getBoundingClientRect().top - parseFloat(getComputedStyle(heading).scrollMarginTop))),
      OFTEN,
    )
    .toBeLessThanOrEqual(1);
});

test.describe('the icon of a link to another page', () => {
  const dayAtInternals = (page: Page) => textLink(page, 'the day at internals');
  const day = (page: Page) => textLink(page, 'the day');
  const keys = (page: Page) => textLink(page, 'the keys');
  const storedDefault = (page: Page) => page.evaluate((key) => localStorage.getItem(key), DEFAULT_KEY);

  test("it shows when the level of the link differs from the level that 'Restore a file' opens at for this reader, and follows a level change, 'Defaults' and 'All pages'", async ({ page, linked }) => {
    await openOnStoppedClock(page, `${linked.address}schedules.html`);
    await expect(dayAtInternals(page)).toHaveAttribute('data-level', 'internals');
    await expect(day(page)).not.toHaveAttribute('data-level');
    await expect(day(page)).toHaveAttribute('href', 'restore.html#overview/pick-a-day');
    await expect(keys(page)).not.toHaveAttribute('data-level');

    // 'Schedules' moves to 'Internals' in this tab only, and 'Restore a file' still opens at 'Overview'.
    await pressOnSlider(page, '3');
    await page.clock.runFor(MOVE_MS);
    await expectLevel(page, 'internals');
    await expect(dayAtInternals(page)).toHaveAttribute('data-level', 'internals');
    await expect(day(page)).toHaveAttribute('data-level', 'internals');
    await expect(day(page)).toHaveAttribute('href', 'restore.html#internals/pick-a-day');
    await expect(keys(page)).not.toHaveAttribute('data-level');

    // The reader's default makes 'Restore a file' open at 'Internals'.
    await page.locator('#dflB').click();
    await page.locator('#defaults-box').getByRole('button', { name: 'Internals', exact: true }).click();
    await page.clock.runFor(MOVE_MS);
    await expect.poll(() => storedDefault(page), OFTEN).toBe('internals');
    await expect(dayAtInternals(page)).not.toHaveAttribute('data-level');
    await expect(day(page)).not.toHaveAttribute('data-level');
    await page.keyboard.press('Escape');

    await pressOnSlider(page, '1');
    await page.clock.runFor(MOVE_MS);
    await expectLevel(page, 'overview');
    await expect(dayAtInternals(page)).not.toHaveAttribute('data-level');
    await expect(day(page)).toHaveAttribute('data-level', 'overview');
    await expect(day(page)).toHaveAttribute('href', 'restore.html#overview/pick-a-day');

    await page.getByRole('button', { name: 'All pages' }).click();
    await expect.poll(() => storedDefault(page), OFTEN).toBe('overview');
    await expect(dayAtInternals(page)).toHaveAttribute('data-level', 'internals');
    await expect(day(page)).not.toHaveAttribute('data-level');
    await expect(keys(page)).not.toHaveAttribute('data-level');
  });

  test("it follows the level kept for 'Restore a file' in this tab, and a live update that changes that level", async ({ page, ownSite }) => {
    const run = await ownSite(LINKED_SITE);
    await page.goto(`${run.address}restore.html`);
    await hydrated(page);
    await pressOnSlider(page, '3');
    await expectLevel(page, 'internals');

    await openLive(page, `${run.address}schedules.html`);
    await hydrated(page);
    await expectLevel(page, 'overview');
    await expect(dayAtInternals(page)).not.toHaveAttribute('data-level');
    await expect(day(page)).toHaveAttribute('data-level', 'overview');
    await expect(day(page)).toHaveAttribute('href', 'restore.html#overview/pick-a-day');

    // With text at 'Overview' only, 'Restore a file' opens at 'Overview' again.
    await run.save('restore.md', '# Restore a file\n\n## Pick a day\n\n::: overview\nPick a file and a day.\n:::\n');
    await expect(dayAtInternals(page)).toHaveAttribute('data-level', 'internals');
    await expect(day(page)).not.toHaveAttribute('data-level');
    await expectNoReload(page);
  });
});
