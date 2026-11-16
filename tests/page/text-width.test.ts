import { expect, test } from '@playwright/test';
import { PAGE_IDS } from '../../src/page/page-ids.ts';
import {
  CHAR_KEY,
  keyWidth,
  parseWidth,
  pickWidth,
  shownChars,
  storedCharWidth,
  storedWidth,
  widthPx,
  WIDTH_KEY,
  withCharWidth,
  type Span,
  type Width,
} from '../../src/page/text-width.ts';

/** A window where a character is 10 px wide: the narrowest text is 258 px, and the text that fills the free space is 1114 px. */
const SPAN: Span = { charPx: 10, minPx: 258, fullPx: 1114, defaultChars: 75 };
/** A window narrower than the narrowest column. */
const TIGHT: Span = { charPx: 10, minPx: 258, fullPx: 200, defaultChars: 75 };

test('the reader width and the character widths have keys of their own', () => {
  expect(WIDTH_KEY).toBe('nerddocs-text-width');
  expect(CHAR_KEY).toBe('nerddocs-char-width');
});

test("the ids of the 'Text width' button, its menu, the ruler and its number are page ids", () => {
  expect(PAGE_IDS).toEqual(expect.arrayContaining(['widthB', 'width-menu', 'ruler', 'ruler-num']));
});

test.describe('the stored width', () => {
  test('digits with a value of at least 1 give a number of characters', () => {
    expect(parseWidth('100')).toBe(100);
    expect(parseWidth('1')).toBe(1);
    expect(parseWidth('007')).toBe(7);
  });

  test("'full' gives the whole free space", () => {
    expect(parseWidth('full')).toBe('full');
  });

  test('nothing stored, and any other text, gives the site default', () => {
    for (const stored of [null, '', 'abc', '0', '00', '-5', '10.5', ' 100', '100 ', '1e3', '+100', 'Full', 'full ', 'null']) {
      expect(parseWidth(stored), JSON.stringify(stored)).toBeNull();
    }
  });

  test('a width is stored as the text that gives it back, and the default removes the key', () => {
    expect(storedWidth(100)).toBe('100');
    expect(storedWidth('full')).toBe('full');
    expect(storedWidth(null)).toBeNull();
    for (const width of [1, 75, 100, 'full'] as Width[]) expect(parseWidth(storedWidth(width)), String(width)).toBe(width);
  });
});

test.describe('the stored character widths', () => {
  const stored = (widths: unknown) => JSON.stringify(widths);

  test('a theme gives its stored width from 0.2 to 1.5 em', () => {
    expect(storedCharWidth(stored({ themelessness: 0.47, 'im-in': 0.6 }), 'im-in')).toBe(0.6);
    for (const em of [0.2, 0.47, 1.5]) expect(storedCharWidth(stored({ x: em }), 'x'), String(em)).toBe(em);
  });

  test('a theme with no stored width, or with a bad one, gives none', () => {
    expect(storedCharWidth(null, 'im-in')).toBeNull();
    expect(storedCharWidth(stored({ themelessness: 0.47 }), 'im-in')).toBeNull();
    for (const em of [0.19, 1.51, 0, -0.5, 5, '0.5', null, true, [0.5], {}]) {
      expect(storedCharWidth(stored({ 'im-in': em }), 'im-in'), JSON.stringify(em)).toBeNull();
    }
  });

  test('a stored text that is no object of widths gives none', () => {
    for (const text of ['{not json', '', 'null', '0.5', '"im-in"', stored([0.5])]) {
      expect(storedCharWidth(text, '0'), text).toBeNull();
    }
  });

  test('only a key of the stored object itself counts as a theme', () => {
    expect(storedCharWidth('{}', 'toString')).toBeNull();
    expect(storedCharWidth('{}', 'constructor')).toBeNull();
  });

  test('a new width of a theme keeps the widths of the other themes', () => {
    expect(JSON.parse(withCharWidth(stored({ themelessness: 0.47, 'im-in': 0.5 }), 'im-in', 0.6))).toEqual({ themelessness: 0.47, 'im-in': 0.6 });
    expect(JSON.parse(withCharWidth(null, 'im-in', 0.6))).toEqual({ 'im-in': 0.6 });
  });

  test('a broken stored text gives way to the new width', () => {
    for (const text of ['{not json', '', 'null', '0.5', stored([0.5])]) {
      expect(JSON.parse(withCharWidth(text, 'im-in', 0.6)), text).toEqual({ 'im-in': 0.6 });
    }
  });

  test('a width that the page stores is the width that it reads back', () => {
    expect(storedCharWidth(withCharWidth(stored({ themelessness: 0.47 }), 'im-in', 0.625), 'im-in')).toBe(0.625);
  });
});

test.describe('the text width in px', () => {
  test('the default is the default number of characters, a number is that many characters, and full is the free space', () => {
    expect(widthPx(null, SPAN)).toBe(750);
    expect(widthPx(100, SPAN)).toBe(1000);
    expect(widthPx('full', SPAN)).toBe(1114);
    expect(widthPx(null, { ...SPAN, defaultChars: 60 })).toBe(600);
  });

  test('a width stays between the narrowest text and the free space', () => {
    expect(widthPx(5, SPAN)).toBe(258);
    expect(widthPx(200, SPAN)).toBe(1114);
    expect(widthPx(null, { ...SPAN, fullPx: 700 })).toBe(700);
  });

  test('a window narrower than the narrowest column gives the narrowest text for every width', () => {
    for (const width of [null, 'full', 5, 100] as Width[]) expect(widthPx(width, TIGHT), String(width)).toBe(258);
  });
});

test.describe('the width that a place on the ruler gives', () => {
  test('a width within 8 px of the free space is full', () => {
    expect(pickWidth(1114, null, SPAN)).toBe('full');
    expect(pickWidth(1106, null, SPAN)).toBe('full');
    expect(pickWidth(5000, null, SPAN)).toBe('full');
    expect(pickWidth(1105.9, null, SPAN)).toBe(111);
  });

  test('full wins over the opening width', () => {
    expect(pickWidth(1108, 111, SPAN)).toBe('full');
  });

  test('a width within half a character of the opening width is the opening width', () => {
    expect(pickWidth(1004.9, 100, SPAN)).toBe(100);
    expect(pickWidth(995.1, 100, SPAN)).toBe(100);
    // Half a character away is no longer the opening width, and the width rounds.
    expect(pickWidth(1005, 100, SPAN)).toBe(101);
    expect(pickWidth(995, 100, SPAN)).toBe(100);
    expect(pickWidth(268, 5, SPAN)).toBe(27);
    // The opening width shows at the narrowest text, and a place near it gives it back.
    expect(pickWidth(262, 5, SPAN)).toBe(5);
  });

  test('the opening width wins over the default', () => {
    expect(pickWidth(757, 76, SPAN)).toBe(76);
    expect(pickWidth(743, 74, SPAN)).toBe(74);
  });

  test('a width within one character of the default is the default', () => {
    expect(pickWidth(757, null, SPAN)).toBeNull();
    expect(pickWidth(740, 100, SPAN)).toBeNull();
    expect(pickWidth(760, 100, SPAN)).toBeNull();
    expect(pickWidth(739.9, 100, SPAN)).toBe(74);
    expect(pickWidth(760.1, 100, SPAN)).toBe(76);
    expect(pickWidth(600, null, { ...SPAN, defaultChars: 60 })).toBeNull();
  });

  test('any other width rounds to whole characters', () => {
    expect(pickWidth(784, null, SPAN)).toBe(78);
    expect(pickWidth(786, null, SPAN)).toBe(79);
    expect(pickWidth(500, 100, SPAN)).toBe(50);
  });

  test('a width under the narrowest text counts as the narrowest text', () => {
    expect(pickWidth(100, null, SPAN)).toBe(26);
    expect(pickWidth(-40, null, SPAN)).toBe(26);
  });
});

test.describe('the keys on the slider', () => {
  test('the arrows step 5 characters, and Page Up and Page Down step 25', () => {
    expect(keyWidth('ArrowRight', null, null, SPAN)).toBe(80);
    expect(keyWidth('ArrowUp', null, null, SPAN)).toBe(80);
    expect(keyWidth('ArrowLeft', null, null, SPAN)).toBe(70);
    expect(keyWidth('ArrowDown', null, null, SPAN)).toBe(70);
    expect(keyWidth('PageUp', null, null, SPAN)).toBe(100);
    expect(keyWidth('PageDown', null, null, SPAN)).toBe(50);
    expect(keyWidth('ArrowRight', 95, null, SPAN)).toBe(100);
  });

  test('five steps to the right from the default give 100 characters', () => {
    let width: Width = null;
    for (let step = 0; step < 5; step++) width = keyWidth('ArrowRight', width, null, SPAN)!;
    expect(width).toBe(100);
  });

  test('Home gives the narrowest text, and End gives full', () => {
    expect(keyWidth('Home', 100, null, SPAN)).toBe(26);
    expect(keyWidth('End', 100, null, SPAN)).toBe('full');
    expect(keyWidth('End', null, 'full', SPAN)).toBe('full');
  });

  test('a step starts from the width that shows', () => {
    expect(keyWidth('ArrowLeft', 'full', null, SPAN)).toBe(106);
    expect(keyWidth('ArrowRight', 'full', null, SPAN)).toBe('full');
    expect(keyWidth('ArrowLeft', 200, null, SPAN)).toBe(106);
    expect(keyWidth('PageDown', 30, null, SPAN)).toBe(26);
  });

  test('a step goes through the same snaps as a place on the ruler', () => {
    expect(keyWidth('ArrowLeft', 105, 100, SPAN)).toBe(100);
    expect(keyWidth('ArrowLeft', 80, null, SPAN)).toBeNull();
    expect(keyWidth('ArrowLeft', 80, 100, SPAN)).toBeNull();
    expect(keyWidth('ArrowRight', 106, null, SPAN)).toBe('full');
    expect(keyWidth('ArrowRight', 26, 5, SPAN)).toBe(31);
  });

  test('any other key gives no width', () => {
    for (const key of ['Enter', ' ', 'Tab', 'Escape', 'a', '5', 'Shift']) expect(keyWidth(key, 100, null, SPAN), key).toBeUndefined();
  });
});

test('the ruler shows the width that shows, in whole characters', () => {
  expect(shownChars(null, SPAN)).toBe(75);
  expect(shownChars(100, SPAN)).toBe(100);
  expect(shownChars('full', SPAN)).toBe(111);
  expect(shownChars(5, SPAN)).toBe(26);
  expect(shownChars(100, TIGHT)).toBe(26);
  expect(shownChars(null, { charPx: 9.4, minPx: 258, fullPx: 1114, defaultChars: 75 })).toBe(75);
  expect(shownChars('full', { charPx: 9.4, minPx: 258, fullPx: 1114, defaultChars: 75 })).toBe(119);
});
