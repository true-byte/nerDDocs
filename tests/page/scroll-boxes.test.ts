import { expect, test } from '@playwright/test';
import { boxMarks } from '../../src/page/scroll-boxes.ts';

/** The marks of a box with these sizes, in px. */
const marks = (scrollLeft: number, clientWidth: number, scrollWidth: number, firstColumn: number | null) =>
  boxMarks({ scrollLeft, clientWidth, scrollWidth, firstColumn });

test('a box that fits has no marks', () => {
  expect(marks(0, 500, 500, 80)).toEqual({ scrolls: false, more: [], pin: false });
  expect(marks(0, 500, 501, 80)).toEqual({ scrolls: false, more: [], pin: false });
});

test('at the start the right side hides', () => {
  expect(marks(0, 300, 900, 80)).toEqual({ scrolls: true, more: ['right'], pin: true });
  expect(marks(1, 300, 900, 80).more).toEqual(['right']);
});

test('in the middle both sides hide', () => {
  expect(marks(200, 300, 900, 80).more).toEqual(['left', 'right']);
});

test('at the end the left side hides, also a fraction of a pixel short', () => {
  expect(marks(600, 300, 900, 80).more).toEqual(['left']);
  expect(marks(599.5, 300, 900, 80).more).toEqual(['left']);
});

test('a first column of at most a third of the box pins', () => {
  expect(marks(0, 300, 900, 100).pin).toBe(true);
  expect(marks(0, 300, 900, 101).pin).toBe(false);
});

test('a box with no first column never pins', () => {
  expect(marks(0, 300, 900, null).pin).toBe(false);
});
