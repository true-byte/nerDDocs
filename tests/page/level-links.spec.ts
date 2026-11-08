import { expect, type Locator, type Page } from '@playwright/test';
import { expectLevel, pressOnSlider, THREE_LEVELS } from '../support/levels.ts';
import { hydrated, test } from '../support/page.ts';
import { STEPS } from '../support/page-content.ts';
import { OFTEN } from '../support/poll.ts';

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
const underline = (link: Locator) => link.evaluate((element) => getComputedStyle(element).textDecorationColor);
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

  expect(await underline(index)).toBe(await levelColor(page, 2));
  expect(await underline(weekly)).toBe(await levelColor(page, 1));
  const indexWithIcon = await width(index);
  const dayWithout = await width(day);

  await pressOnSlider(page, '2');
  await expectLevel(page, 'requirements');
  await expect(day).toHaveAttribute('data-level', 'overview');
  await expect(day).toHaveAttribute('href', '#overview/pick-a-day');
  await expect(weekly).not.toHaveAttribute('data-level');
  expect(await underline(day)).toBe(await levelColor(page, 0));
  expect(await width(day)).toBeGreaterThan(dayWithout + 4);

  await pressOnSlider(page, '3');
  await expectLevel(page, 'internals');
  await expect(index).not.toHaveAttribute('data-level');
  await expect(index).toHaveAttribute('href', '#internals/search-index');
  await expect(day).not.toHaveAttribute('data-level');
  await expect(day).toHaveAttribute('href', '#internals/pick-a-day');
  await expect(indexAtOverview).toHaveAttribute('data-level', 'overview');
  await expect(planAtInternals).not.toHaveAttribute('data-level');
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
