import { expect, test } from '@playwright/test';
import { boldRow, menuScrollTop, scrollToShow, type BoldInput, type HeadingPlace } from '../../src/page/outline.ts';

/** Headings named a, b, c and on, at these tops, each shown unless its id is in `hidden`. */
function headingsAt(tops: number[], hidden: string[] = []): HeadingPlace[] {
  return tops.map((top, at) => {
    const id = String.fromCharCode(97 + at);
    return { id, top, shown: !hidden.includes(id) };
  });
}

const bold = (headings: HeadingPlace[], more: Partial<BoldInput> = {}) =>
  boldRow({ headings, line: 270, windowHeight: 900, atEnd: false, clicked: null, ...more });

test.describe('the bold row', () => {
  test('above the first heading no row is bold', () => {
    expect(bold(headingsAt([400, 900]))).toBeNull();
  });

  test('the last shown heading at or above the line is bold', () => {
    expect(bold(headingsAt([-500, 100, 600]))).toBe('b');
    expect(bold(headingsAt([-500, 270, 600]))).toBe('b');
  });

  test('a heading hidden at this level is skipped', () => {
    expect(bold(headingsAt([-500, 100, 600], ['b']))).toBe('a');
  });

  test('at the end of the page the last heading on screen is bold', () => {
    expect(bold(headingsAt([-800, 300, 500]), { atEnd: true })).toBe('c');
    expect(bold(headingsAt([-800, 300, 500], ['c']), { atEnd: true })).toBe('b');
  });

  test('a clicked row wins over both rules, unless it hides', () => {
    expect(bold(headingsAt([-500, 500, 600]), { clicked: 'b' })).toBe('b');
    expect(bold(headingsAt([-500, 500, 600]), { clicked: 'b', atEnd: true })).toBe('b');
    expect(bold(headingsAt([-500, 500, 600], ['b']), { clicked: 'b' })).toBe('a');
  });

  test('no headings give no bold row', () => {
    expect(bold([])).toBeNull();
  });
});

test.describe('the scroll of the tree', () => {
  const box = { top: 100, bottom: 500 };

  test('a row in view keeps the scroll', () => {
    expect(scrollToShow(300, { top: 150, bottom: 180 }, box)).toBe(300);
  });

  test('a row out of view scrolls the least that shows it', () => {
    expect(scrollToShow(300, { top: 50, bottom: 70 }, box)).toBe(250);
    expect(scrollToShow(300, { top: 490, bottom: 520 }, box)).toBe(320);
  });

  test('the menu puts the page row at the top and scrolls the least that shows the bold row', () => {
    expect(menuScrollTop(400, 600, 500)).toBe(400);
    expect(menuScrollTop(400, 1000, 500)).toBe(500);
    expect(menuScrollTop(400, null, 500)).toBe(400);
  });
});
