import { expect, test } from '@playwright/test';
import { hollowStops, isFlat } from '../../src/page/levels.ts';
import { docsSite } from '../support/docs.ts';

test('no two levels of a page show the same text', async () => {
  const site = await docsSite();
  const same = site.pages.flatMap((page) => {
    if (isFlat(page)) return [];
    const hollow = hollowStops({ levels: site.levels, parts: page.parts, hasSharedText: page.hasSharedText });
    const shown = site.levels.filter((_, at) => !hollow[at]);
    const parts = page.parts.map((value) => value.split(' '));
    return shown.flatMap((one, at) =>
      shown
        .slice(at + 1)
        .filter((other) => parts.every((ids) => ids.includes(one.id) === ids.includes(other.id)))
        .map((other) => `${page.title}: '${one.name}' = '${other.name}'`),
    );
  });
  expect(same).toEqual([]);
});
