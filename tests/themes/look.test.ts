import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { expect, test } from '@playwright/test';
import { THEMES } from '../../src/themes/index.ts';
import { cssRules, declarations, selectorsOf, urlsIn, withoutComments } from '../support/css.ts';
import { REPO } from '../support/run-command.ts';

const lookOf = (id: string) => join(REPO, 'src/themes', id, 'look.css');

/** The last compound selector of a selector, such as `tr:nth-child(odd)` for `#page tbody tr:nth-child(odd)`. */
function lastCompound(selector: string): string {
  let flat = selector;
  while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, '');
  return flat.split(/\s*[\s>+~]\s*/).at(-1) ?? '';
}

/** A selector with one space on each side of each `>`. */
const spacedChildren = (selector: string) => selector.replace(/\s*>\s*/g, ' > ');

const paints = (body: string) => ['background', 'background-color'].some((name) => declarations(body).has(name));

/** A url() that names a file in the folder, by a path relative to look.css. */
function isOwnFile(folder: string, url: string): boolean {
  if (url === '' || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('#')) return false;
  const file = join(folder, url.split(/[?#]/)[0]!);
  const path = relative(folder, file);
  return !path.startsWith('..') && !isAbsolute(path) && existsSync(file) && statSync(file).isFile();
}

for (const theme of THEMES) {
  test.describe(`the look.css of '${theme.name}'`, () => {
    const file = lookOf(theme.id);
    const css = () => (existsSync(file) ? readFileSync(file, 'utf8') : '');

    test('each selector starts with the page or the box button of its own theme', () => {
      const own = [`:root[data-theme="${theme.id}"]`, `.sw [data-theme="${theme.id}"]`];
      const strays = cssRules(css())
        .filter((rule) => !rule.selector.startsWith('@'))
        .flatMap(selectorsOf)
        .filter((selector) => !own.some((start) => selector.startsWith(start)));
      expect(strays, file).toEqual([]);
    });

    test('it holds no prefers-color-scheme, so the dark look follows the reader, not the computer', () => {
      expect(withoutComments(css()), file).not.toMatch(/prefers-color-scheme/i);
    });

    test('a rule for one look names [data-mode] right after its theme', () => {
      const starts = [`:root[data-theme="${theme.id}"]`, `.sw [data-theme="${theme.id}"]`].flatMap((own) =>
        ['dark', 'light'].map((mode) => `${own}[data-mode="${mode}"]`),
      );
      const strays = cssRules(css())
        .filter((rule) => !rule.selector.startsWith('@'))
        .flatMap(selectorsOf)
        .filter((selector) => selector.includes('data-mode') && !starts.some((start) => selector.startsWith(start)));
      expect(strays, file).toEqual([]);
    });

    test('each url() names a file in its folder', () => {
      const folder = join(REPO, 'src/themes', theme.id);
      expect(urlsIn(css()).filter((url) => !isOwnFile(folder, url)), file).toEqual([]);
    });

    test('an animation runs only for a reader who allows motion', () => {
      const moving = cssRules(css()).filter(
        (rule) =>
          !rule.selector.startsWith('@') &&
          [...declarations(rule.body).keys()].some((name) => name === 'animation' || name === 'animation-name') &&
          !rule.at.some((at) => /prefers-reduced-motion\s*:\s*no-preference/.test(at)),
      );
      expect(moving.map((rule) => rule.selector), file).toEqual([]);
    });

    test('a row stripe paints the cells, so a pinned first cell keeps it', () => {
      const onRows = cssRules(css())
        .filter((rule) => !rule.selector.startsWith('@') && paints(rule.body))
        .flatMap(selectorsOf)
        .filter((selector) => /^tr(?![\w-])/.test(lastCompound(selector)));
      expect(onRows, file).toEqual([]);
    });

    test('a glyph in the slot of a row arrow leaves its display to the page, which hides it while the arrow shows', () => {
      const glyphs = cssRules(css())
        .filter((rule) => !rule.selector.startsWith('@') && declarations(rule.body).has('display'))
        .flatMap(selectorsOf)
        .filter((selector) => /\.nochev\b[^]*::?before$/.test(lastCompound(selector)));
      expect(glyphs, file).toEqual([]);
    });

    test('it leaves the API reference to the page', () => {
      const named = cssRules(css())
        .filter((rule) => !rule.selector.startsWith('@'))
        .flatMap(selectorsOf)
        .filter((selector) => /\.api(?:-sum|-bad)?(?![\w-])/.test(selector));
      expect(named, file).toEqual([]);
    });
  });
}

test("'Original Nerd' paints its stripe on each cell of an odd body row", () => {
  const stripe = ':root[data-theme="original-nerd"] #page tbody tr:nth-child(odd) > *';
  const rules = cssRules(readFileSync(lookOf('original-nerd'), 'utf8')).filter(
    (rule) => !rule.selector.startsWith('@') && selectorsOf(rule).map(spacedChildren).includes(stripe),
  );
  expect(rules.some((rule) => declarations(rule.body).get('background') === 'var(--code)')).toBe(true);
});
