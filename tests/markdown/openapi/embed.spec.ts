import { expect, type Locator, type Page } from '@playwright/test';
import { THEMES } from '../../../src/themes/index.ts';
import { rgbOf } from '../../support/css.ts';
import { storeLook } from '../../support/diagrams.ts';
import { expectLevel, pressOnSlider } from '../../support/levels.ts';
import { API_SITE, UNRESOLVED_SPEC } from '../../support/openapi.ts';
import { hydrated, test as pageTest } from '../../support/page.ts';
import { runCommand, type RunningCommand } from '../../support/run-command.ts';

/** The tests only read 'Backup API' and a page with a ref that points nowhere, so they share one command on them. */
const test = pageTest.extend<object, { api: RunningCommand }>({
  api: [
    async ({}, use) => {
      const unresolved = { 'unresolved.md': '# Unresolved ref\n\n![Backup API](api/unresolved.yaml)\n', 'api/unresolved.yaml': UNRESOLVED_SPEC };
      const run = await runCommand({ ...API_SITE, ...unresolved });
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const reference = (page: Page) => page.locator('#page section.api');
/** The outline rows under the row of the open page. */
const outlineRows = (page: Page) => page.locator('#tree li.pg:has(> .lr > a.leaf[aria-current="page"]) > ul.ol a.oln');
const outlineRow = (page: Page, name: string) => outlineRows(page).getByText(name, { exact: true });

/** The left edge of the text of a row, inside its padding. */
const textLeft = (row: Locator) =>
  row.evaluate((link) => {
    const range = document.createRange();
    range.selectNodeContents(link);
    return range.getBoundingClientRect().left;
  });

const ROWS = ['Restores', 'POST /restores', 'GET /restores/{id}', 'Schedules', 'GET /schedules'];

test("at 'Internals' the outline lists each tag with its endpoints further in, and at 'Overview' the text of the author shows", async ({ page, api }) => {
  await page.goto(`${api.address}api.html`);
  await hydrated(page);
  await expectLevel(page, 'internals');
  await expect(page.locator('#tree a.leaf[aria-current="page"]')).toHaveText('Backup API');
  await expect(outlineRows(page)).toHaveText(ROWS);
  for (const [tag, endpoints] of [
    ['Restores', ['POST /restores', 'GET /restores/{id}']],
    ['Schedules', ['GET /schedules']],
  ] as const) {
    const left = await textLeft(outlineRow(page, tag));
    for (const endpoint of endpoints) expect(await textLeft(outlineRow(page, endpoint)), endpoint).toBeGreaterThan(left);
  }

  await pressOnSlider(page, 'ArrowLeft');
  await expectLevel(page, 'requirements');
  await pressOnSlider(page, 'ArrowLeft');
  await expectLevel(page, 'overview');
  await expect(page.getByText('The backup app has an API for scripts.', { exact: true })).toBeVisible();
  await expect(reference(page)).toBeHidden();
  for (const name of ROWS) await expect(outlineRow(page, name), name).toBeHidden();
});

for (const [id, mode] of [
  ['themelessness', 'light'],
  ['i-fly-spaceships', 'dark'],
] as const) {
  const theme = THEMES.find((each) => each.id === id)!;

  test(`in '${theme.name}' ${mode}, the method has no color of its own and the reference takes the fonts and the ink of the page`, async ({ page, api }) => {
    await storeLook(page, id, mode);
    await page.goto(`${api.address}api.html`);
    await hydrated(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', id);
    await expect(page.locator('html')).toHaveAttribute('data-mode', mode);

    const mono = await page.locator('#page pre').first().evaluate((pre) => getComputedStyle(pre).fontFamily);
    const methods = reference(page).locator(':is(h1, h2, h3, h4, h5, h6) > code');
    await expect(methods).toHaveCount(3);
    const looks = await methods.evaluateAll((codes) =>
      codes.map((code) => {
        const own = getComputedStyle(code);
        return {
          text: code.textContent,
          font: own.fontFamily,
          background: own.backgroundColor,
          color: own.color,
        };
      }),
    );
    for (const look of looks) {
      expect(look.font, `${look.text} font`).toBe(mono);
      expect(look.background, `${look.text} background`).toBe('rgba(0, 0, 0, 0)');
    }
    // A theme can give code its own ink, so the methods share one color, whichever it is.
    expect(new Set(looks.map((look) => look.color)).size, 'the colors of the methods').toBe(1);
    expect(looks.map((look) => look.text)).toEqual(['POST /restores', 'GET /restores/{id}', 'GET /schedules']);

    await expect(reference(page).locator('.api-sum').first()).toHaveCSS('color', rgbOf(theme[mode].soft));
    const types = await reference(page)
      .locator('li em:not(a em)')
      .evaluateAll((ems) =>
        ems.map((em) => ({ text: em.textContent, color: getComputedStyle(em).color, item: getComputedStyle(em.closest('li')!).color })),
      );
    expect(types.length).toBeGreaterThan(0);
    for (const type of types) expect(type.color, `${type.text}`).toBe(type.item);
  });
}

/** Puts each theme in each look on the open page, and gives what `read` reads of it then, by theme and look. */
async function inEveryLook<T>(page: Page, read: () => Promise<T>): Promise<[string, T][]> {
  const found: [string, T][] = [];
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      await page.evaluate(([id, look]) => Object.assign(document.documentElement.dataset, { theme: id, mode: look }), [theme.id, mode]);
      found.push([`${theme.name} ${mode}`, await read()]);
    }
  }
  return found;
}

test('in every theme and look, the code of an endpoint has the size of its heading and no padding, and the code of a bad slot is not bold', async ({ page, api }) => {
  await page.goto(`${api.address}api.html`);
  await hydrated(page);
  const heading = reference(page).getByRole('heading', { name: 'POST /restores', exact: true });
  const endpoints = await inEveryLook(page, () =>
    heading.evaluate((element) => {
      const code = getComputedStyle(element.querySelector('code')!);
      return { size: code.fontSize, padding: code.padding, heading: getComputedStyle(element).fontSize };
    }),
  );
  for (const [look, { size, padding, heading: own }] of endpoints) {
    expect(size, `${look} size`).toBe(own);
    expect(padding, `${look} padding`).toBe('0px');
  }

  await page.goto(`${api.address}unresolved.html`);
  await hydrated(page);
  const slot = reference(page).locator('li .api-bad code');
  await expect(slot).toHaveText('Unresolved ref: #/components/schemas/Place api/unresolved.yaml:18');
  const slots = await inEveryLook(page, () => slot.evaluate((code) => ({ weight: getComputedStyle(code).fontWeight, padding: getComputedStyle(code).padding })));
  for (const [look, { weight, padding }] of slots) {
    expect(weight, `${look} weight`).toBe('400');
    expect(padding, `${look} padding`).toBe('0px');
  }
});

test('on a phone the reference stays in the column, and only the examples scroll sideways', async ({ page, api }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${api.address}api.html`);
  await hydrated(page);
  await expect(reference(page)).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const outside = await page.evaluate(() => {
    const column = document.getElementById('page')!.getBoundingClientRect();
    return [...document.querySelectorAll('#page section.api *')]
      .filter((element) => !element.closest('.code') && element.getClientRects().length > 0)
      .filter((element) => element.getBoundingClientRect().right > column.right + 0.5)
      .map((element) => `${element.tagName.toLowerCase()} ${(element.textContent ?? '').slice(0, 40)}`);
  });
  expect(outside).toEqual([]);

  const example = reference(page).locator('.code pre').filter({ hasText: 'bytesDone' });
  await expect(example).toHaveAttribute('role', 'region');
  expect(await example.evaluate((pre) => pre.scrollWidth - pre.clientWidth)).toBeGreaterThan(0);

  const heading = reference(page).getByRole('heading', { name: 'GET /restores/{id}', exact: true });
  const ends = await heading.evaluate((element) => element.getBoundingClientRect().right - document.getElementById('page')!.getBoundingClientRect().right);
  expect(ends).toBeLessThanOrEqual(0.5);
});
