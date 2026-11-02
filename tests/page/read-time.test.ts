import { expect, test } from '@playwright/test';
import { boxPlace, formatMinutes, titleTimeHtml } from '../../src/page/read-time.ts';

test('minutes show as minutes, hours, or hours and minutes, and 0 shows nothing', () => {
  for (const [minutes, text] of [
    [0, ''],
    [1, '1m'],
    [45, '45m'],
    [59, '59m'],
    [60, '1h'],
    [61, '1h 1m'],
    [80, '1h 20m'],
    [120, '2h'],
  ] as const) {
    expect(formatMinutes(minutes), `${minutes}`).toBe(text);
  }
});

test.describe('the button next to the title', () => {
  const row = (level: string, page: number) => ({ level, page, all: page + 100 });
  const opening = (html: string) => /^<button [^>]*>/.exec(html)?.[0] ?? '';

  test('shows the clock and the time of each level, with the rule of each level on its time', () => {
    const html = titleTimeHtml([row('overview', 1), row('internals', 12)], false);
    expect(opening(html)).toBe('<button type="button" id="tlB" class="tl" title="Read time" aria-haspopup="dialog">');
    expect(html).toMatch(/^<button [^>]*><svg class="i"[^>]*><circle cx="12" cy="12" r="9"\/><path d="M12 7v5l3 2"\/><\/svg>/);
    expect(html).toMatch(
      /<\/svg><span class="sr-only">Read time <\/span><span data-shows="overview">1m<\/span><span data-shows="internals">12m<\/span><\/button>$/,
    );
  });

  test('is marked to show always only when asked', () => {
    const rows = [row('overview', 1), row('internals', 12)];
    expect(opening(titleTimeHtml(rows, true))).toContain(' data-always');
    expect(opening(titleTimeHtml(rows, false))).not.toContain('data-always');
  });

  test('leaves out a level with no time, and shows only at the levels with a time', () => {
    const html = titleTimeHtml([row('overview', 1), row('requirements', 0), row('internals', 12)], true);
    expect(opening(html)).toBe(
      '<button type="button" id="tlB" class="tl" title="Read time" aria-haspopup="dialog" data-always data-shows="overview internals">',
    );
    expect(html).not.toContain('"requirements"');
    expect(html.match(/<span data-shows=/g)).toHaveLength(2);
  });

  test('has no level rule when each row has a time', () => {
    const html = titleTimeHtml([row('overview', 1), row('internals', 12)], false);
    expect(opening(html)).not.toContain('data-shows');
  });

  test('shows the one time of a site with fewer than two levels with no level rule', () => {
    const html = titleTimeHtml([row('', 80)], true);
    expect(opening(html)).not.toContain('data-shows');
    expect(html).toMatch(/<span>1h 20m<\/span><\/button>$/);
  });

  test('is gone when no row has a time', () => {
    expect(titleTimeHtml([], true)).toBe('');
    expect(titleTimeHtml([row('', 0)], true)).toBe('');
    expect(titleTimeHtml([row('overview', 0), row('internals', 0)], false)).toBe('');
  });
});

test.describe('the place of the box', () => {
  const VIEW = { width: 1000, height: 800 };
  const BOX_WIDTH = 320;
  const BAR_TOP = 720;
  /** The right edge of a box at the far right of the window, as `left`. */
  const FAR_RIGHT = VIEW.width - BOX_WIDTH - 8;

  const low = (left: number, right: number) => ({ top: 730, bottom: 760, left, right });
  const high = (left: number, right: number) => ({ top: 100, bottom: 130, left, right });
  const place = (from: { top: number; bottom: number; left: number; right: number }) => boxPlace(from, BOX_WIDTH, VIEW, BAR_TOP);

  test('from a low trigger, its right edge meets the right of the trigger, and it sits above the bar', () => {
    expect(place(low(600, 640))).toEqual({ left: 320, bottom: 108 });
  });

  test('from a high trigger, its left edge meets the left of the trigger, and it sits under the trigger', () => {
    expect(place(high(600, 640))).toEqual({ left: 600, top: 138 });
  });

  test('stays 8 px inside the left of the window', () => {
    expect(place(low(60, 100)).left).toBe(8);
    expect(place(high(-20, 20)).left).toBe(8);
  });

  test('stays 8 px inside the right of the window', () => {
    expect(place(low(1060, 1100)).left).toBe(FAR_RIGHT);
    expect(place(high(900, 940)).left).toBe(FAR_RIGHT);
  });

  test('keeps to the left of a window narrower than the box', () => {
    expect(boxPlace(high(100, 140), BOX_WIDTH, { width: 300, height: 800 }, BAR_TOP).left).toBe(8);
  });

  test('a trigger is low only below the middle of the window', () => {
    expect(place({ top: 400, bottom: 430, left: 600, right: 640 })).toEqual({ left: 600, top: 438 });
    expect(place({ top: 401, bottom: 431, left: 600, right: 640 })).toEqual({ left: 320, bottom: 108 });
  });
});
