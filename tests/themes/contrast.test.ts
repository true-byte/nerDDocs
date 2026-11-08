import { expect, test } from '@playwright/test';
import { contrastRatio } from '../../src/themes/contrast.ts';

test('black on white is 21, and the ratio is the same both ways', () => {
  expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
  expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
  expect(contrastRatio('#55626e', '#f6f8fa')).toBe(contrastRatio('#f6f8fa', '#55626e'));
});

test('a mid grey on white is just under 4.5, as WCAG 2 counts it', () => {
  expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
});

test('a color reads the same as #rgb, as #rrggbb and in capitals', () => {
  expect(contrastRatio('#abc', '#fff')).toBe(contrastRatio('#aabbcc', '#ffffff'));
  expect(contrastRatio('#AABBCC', '#FFFFFF')).toBe(contrastRatio('#aabbcc', '#ffffff'));
});

test('a color on itself is 1', () => {
  expect(contrastRatio('#2b6ca3', '#2b6ca3')).toBe(1);
});
