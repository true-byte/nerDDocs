import { expect, test } from '@playwright/test';
import { formatHash, landingLevelFor, parseHash, placeId } from '../../src/page/address.ts';

const IDS = ['overview', 'requirements', 'internals'];

test.describe('parseHash', () => {
  test('a hash names a level and an id, a level alone, or an id alone', () => {
    expect(parseHash('#internals/pick-a-day', IDS)).toEqual({ level: 'internals', id: 'pick-a-day' });
    expect(parseHash('#internals', IDS)).toEqual({ level: 'internals', id: null });
    expect(parseHash('#pick-a-day', IDS)).toEqual({ level: null, id: 'pick-a-day' });
  });

  test('a first part that is no level id of the site leaves the whole hash an id', () => {
    expect(parseHash('#extra/pick-a-day', IDS)).toEqual({ level: null, id: 'extra/pick-a-day' });
    expect(parseHash('#testers', IDS)).toEqual({ level: null, id: 'testers' });
    expect(parseHash('#internals/pick-a-day', [])).toEqual({ level: null, id: 'internals/pick-a-day' });
  });

  test('only the first slash splits the level from the id', () => {
    expect(parseHash('#internals/plans/weekly', IDS)).toEqual({ level: 'internals', id: 'plans/weekly' });
  });

  test("a hash with no '#' reads the same", () => {
    expect(parseHash('internals/pick-a-day', IDS)).toEqual({ level: 'internals', id: 'pick-a-day' });
    expect(parseHash('pick-a-day', IDS)).toEqual({ level: null, id: 'pick-a-day' });
  });

  test('an empty hash names nothing', () => {
    expect(parseHash('', IDS)).toEqual({ level: null, id: null });
    expect(parseHash('#', IDS)).toEqual({ level: null, id: null });
  });

  test('each part is percent-decoded', () => {
    expect(parseHash('#internals/pick%20a%20day', IDS)).toEqual({ level: 'internals', id: 'pick a day' });
    expect(parseHash('#%C3%BCber-die-app', IDS)).toEqual({ level: null, id: 'über-die-app' });
    expect(parseHash('#intern%C3%A4ls/pick-a-day', ['internäls'])).toEqual({ level: 'internäls', id: 'pick-a-day' });
  });
});

test.describe('formatHash', () => {
  test('a hash names the level, then the id', () => {
    expect(formatHash('overview', 'pick-a-day')).toBe('#overview/pick-a-day');
    expect(formatHash('overview', null)).toBe('#overview');
    expect(formatHash(null, 'pick-a-day')).toBe('#pick-a-day');
    expect(formatHash(null, null)).toBe('');
  });

  test('each part is encoded with encodeURIComponent', () => {
    expect(formatHash('internals', 'pick a day')).toBe('#internals/pick%20a%20day');
    expect(formatHash(null, 'über-die-app')).toBe('#%C3%BCber-die-app');
    expect(formatHash('internals', 'plans/weekly')).toBe('#internals/plans%2Fweekly');
  });

  test('parseHash reads back each hash that formatHash writes', () => {
    for (const [level, id] of [
      ['internals', 'pick-a-day'],
      ['overview', null],
      [null, 'pick-a-day'],
      ['requirements', 'pick a day'],
      ['internals', 'plans/weekly'],
      [null, 'über-die-app'],
      [null, 'extra/pick-a-day'],
    ] as const) {
      expect(parseHash(formatHash(level, id), IDS), `${level} ${id}`).toEqual({ level, id });
    }
  });
});

test.describe('landingLevelFor', () => {
  test('text at every level opens at the wanted level', () => {
    for (const wanted of IDS) expect(landingLevelFor(null, wanted, IDS)).toBe(wanted);
  });

  test('text that shows at the wanted level opens there', () => {
    expect(landingLevelFor('overview internals', 'internals', IDS)).toBe('internals');
    expect(landingLevelFor('requirements', 'requirements', IDS)).toBe('requirements');
  });

  test('text without the wanted level opens at the nearest lower level that shows it', () => {
    expect(landingLevelFor('overview internals', 'requirements', IDS)).toBe('overview');
    expect(landingLevelFor('overview requirements', 'internals', IDS)).toBe('requirements');
  });

  test('text with no lower level opens at the nearest higher level that shows it', () => {
    expect(landingLevelFor('internals', 'overview', IDS)).toBe('internals');
    expect(landingLevelFor('requirements internals', 'overview', IDS)).toBe('requirements');
  });
});

test.describe('placeId', () => {
  test('once the window has scrolled, the place is the id of the bold row', () => {
    expect(placeId('pick-a-day', 420)).toBe('pick-a-day');
    expect(placeId('pick-a-day', 1)).toBe('pick-a-day');
  });

  test('at the top of the page the address names no place, even with a bold row', () => {
    expect(placeId('pick-a-day', 0)).toBeNull();
  });

  test('with no bold row the address names no place', () => {
    expect(placeId(null, 420)).toBeNull();
    expect(placeId(null, 0)).toBeNull();
  });
});
