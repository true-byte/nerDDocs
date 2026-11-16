import { expect, test } from '@playwright/test';
import { DEFAULT_WORDS_PER_MINUTE } from '../../src/site/config.ts';
import { readRows } from '../../src/site/read-time.ts';
import { docsSite, pagesIn } from '../support/docs.ts';

/** The 'Guide' pages read in this many minutes or fewer at 'Casual'. */
const GUIDE_MINUTES = 15;

/** The 'Guide' pages, and the row of 'Casual' in the read time table. */
async function guideAtCasual() {
  const site = await docsSite();
  const pages = pagesIn(site, 'guide');
  expect(pages.length, "the 'Guide' dimension holds pages").toBeGreaterThan(0);
  const at = site.levels.findIndex((level) => level.id === 'casual');
  expect(at, "nerddocs.json lists 'Casual'").toBeGreaterThanOrEqual(0);
  return { site, pages, at };
}

test("each 'Guide' page has text at 'Casual'", async () => {
  const { site, pages, at } = await guideAtCasual();
  const empty = pages.filter((page) => readRows(site, site.levels, page)[at]!.page === 0).map((page) => page.title);
  expect(empty).toEqual([]);
});

test(`the 'Guide' pages read in ${GUIDE_MINUTES} minutes or fewer at 'Casual', at the default reading speed`, async () => {
  const { site, pages, at } = await guideAtCasual();
  const row = readRows({ pages, wordsPerMinute: DEFAULT_WORDS_PER_MINUTE }, site.levels, undefined)[at]!;
  expect(row.all).toBeLessThanOrEqual(GUIDE_MINUTES);
});
