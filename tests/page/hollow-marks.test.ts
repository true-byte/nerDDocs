import { expect, test } from '@playwright/test';
import { hollowSpots } from '../../src/page/hollow-marks.ts';

const ORDER = ['overview', 'requirements', 'internals'];
/** A shared block, such as a heading or a paragraph outside the parts. */
const SHARED = null;

test('the parts that the level hides belong to the shown part of their run', () => {
  const blocks = [SHARED, ['overview'], ['requirements'], ['internals'], SHARED];
  expect(hollowSpots(blocks, 'overview', ORDER)).toEqual([
    { anchor: 1, gap: null, levels: ['requirements', 'internals'], first: { requirements: 2, internals: 3 } },
  ]);
});

test('a hidden part with no shown part before it in its run belongs to the shown part after it', () => {
  const blocks = [SHARED, ['internals'], ['requirements'], ['overview'], SHARED];
  expect(hollowSpots(blocks, 'overview', ORDER)).toEqual([
    { anchor: 3, gap: null, levels: ['requirements', 'internals'], first: { requirements: 2, internals: 1 } },
  ]);
});

test('each hidden part belongs to the nearest shown part before it', () => {
  const blocks = [['overview'], ['internals'], ['overview'], ['requirements'], ['internals']];
  expect(hollowSpots(blocks, 'overview', ORDER)).toEqual([
    { anchor: 0, gap: null, levels: ['internals'], first: { internals: 1 } },
    { anchor: 2, gap: null, levels: ['requirements', 'internals'], first: { requirements: 3, internals: 4 } },
  ]);
});

test('a run with no shown part is one gap, with its levels in the order of the stops', () => {
  const blocks = [SHARED, ['internals'], ['requirements'], ['internals'], SHARED];
  expect(hollowSpots(blocks, 'overview', ORDER)).toEqual([
    { anchor: null, gap: 1, levels: ['requirements', 'internals'], first: { requirements: 2, internals: 1 } },
  ]);
});

test('a shared block ends a run, so a hidden part after it never belongs to a part before it', () => {
  const blocks = [['overview'], ['requirements'], SHARED, ['internals'], SHARED, ['overview']];
  expect(hollowSpots(blocks, 'overview', ORDER)).toEqual([
    { anchor: 0, gap: null, levels: ['requirements'], first: { requirements: 1 } },
    { anchor: null, gap: 3, levels: ['internals'], first: { internals: 3 } },
  ]);
});

test('the first part of a spot that shows at a level is the one the icon of that level leads to', () => {
  const blocks = [SHARED, ['overview'], ['internals'], ['requirements', 'internals'], ['requirements']];
  expect(hollowSpots(blocks, 'overview', ORDER)).toEqual([
    { anchor: 1, gap: null, levels: ['requirements', 'internals'], first: { requirements: 3, internals: 2 } },
  ]);
});

test('a spot lists no level twice and never the current level', () => {
  const blocks = [['requirements'], ['overview', 'internals'], ['internals'], ['overview']];
  expect(hollowSpots(blocks, 'requirements', ORDER)).toEqual([
    { anchor: 0, gap: null, levels: ['overview', 'internals'], first: { overview: 1, internals: 1 } },
  ]);
});

test('the spots follow the current level', () => {
  const blocks = [SHARED, ['overview'], ['requirements'], ['internals'], SHARED, ['internals'], SHARED];
  expect(hollowSpots(blocks, 'internals', ORDER)).toEqual([
    { anchor: 3, gap: null, levels: ['overview', 'requirements'], first: { overview: 1, requirements: 2 } },
  ]);
  expect(hollowSpots(blocks, 'requirements', ORDER)).toEqual([
    { anchor: 2, gap: null, levels: ['overview', 'internals'], first: { overview: 1, internals: 3 } },
    { anchor: null, gap: 5, levels: ['internals'], first: { internals: 5 } },
  ]);
});

test('a page with no parts, or whose parts all show at the level, has no spot', () => {
  expect(hollowSpots([], 'overview', ORDER)).toEqual([]);
  expect(hollowSpots([SHARED, SHARED], 'overview', ORDER)).toEqual([]);
  expect(hollowSpots([SHARED, ['overview'], ['overview', 'internals'], SHARED], 'overview', ORDER)).toEqual([]);
  expect(hollowSpots([['overview', 'requirements', 'internals']], 'requirements', ORDER)).toEqual([]);
});
