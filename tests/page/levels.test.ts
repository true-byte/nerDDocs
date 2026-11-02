import { expect, test } from '@playwright/test';
import {
  colorOf,
  compactGuess,
  counterpartIn,
  hollowStops,
  isFlat,
  levelAfterUpdate,
  levelRule,
  nearestLive,
  openingLevel,
  pairRuns,
  sameMarks,
  stopAt,
  stopCenter,
  stopForKey,
  thumbAt,
} from '../../src/page/levels.ts';
import type { PageLevels } from '../../src/site/view.ts';

const LEVELS = [
  { id: 'overview', name: 'Overview' },
  { id: 'requirements', name: 'Requirements' },
  { id: 'internals', name: 'Internals' },
];

function pageWith(parts: string[], more: Partial<PageLevels> = {}): PageLevels {
  return { levels: LEVELS, defaultLevel: 'overview', parts, hasShared: false, hasSharedText: false, ...more };
}

test('the level colors repeat after five levels', () => {
  expect(colorOf(0)).toBe('var(--l0)');
  expect(colorOf(4)).toBe('var(--l4)');
  expect(colorOf(5)).toBe('var(--l0)');
  expect(colorOf(7)).toBe('var(--l2)');
});

test('the level rule hides each part and each element with data-shows without the level, and no level hides nothing', () => {
  const rule = levelRule('overview');
  expect(rule).toContain('.part[data-l]:not([data-l~="overview"])');
  expect(rule).toContain('[data-shows]:not([data-shows~="overview"])');
  expect(rule).toContain('display:none');
  expect(levelRule('')).toBe('');
});

test('a page with no parts is flat, and with text none of its stops is hollow', () => {
  expect(isFlat(pageWith([]))).toBe(true);
  expect(isFlat(pageWith(['overview']))).toBe(false);
  expect(hollowStops(pageWith([], { hasShared: true, hasSharedText: true }))).toEqual([false, false, false]);
});

test('a stop is hollow when its level has no part and the page has no shared text', () => {
  expect(hollowStops(pageWith(['overview', 'overview internals']))).toEqual([false, true, false]);
  expect(hollowStops(pageWith(['internals'], { hasShared: true }))).toEqual([true, true, false]);
});

test('a level with no part still has text on a page with shared text', () => {
  expect(hollowStops(pageWith(['internals'], { hasShared: true, hasSharedText: true }))).toEqual([false, false, false]);
});

test('a page with shared text opens at its default level, also with no part at that level', () => {
  expect(openingLevel(pageWith(['internals'], { hasShared: true, hasSharedText: true }))).toBe('overview');
  expect(openingLevel(pageWith(['internals'], { hasShared: true }))).toBe('internals');
});

test('a save that takes away the part of the level keeps the level while shared text stays', () => {
  expect(levelAfterUpdate('internals', pageWith(['overview'], { hasShared: true, hasSharedText: true }), false)).toBe('internals');
  expect(levelAfterUpdate('internals', pageWith(['overview'], { hasShared: true }), false)).toBe('overview');
});

test('the level stays through a page with no parts', () => {
  expect(levelAfterUpdate('internals', pageWith([], { hasShared: true, hasSharedText: true }), false)).toBe('internals');
  expect(levelAfterUpdate('internals', pageWith([]), false)).toBe('internals');
});

test.describe('the stop that a key moves to', () => {
  const none = [false, false, false, false];
  const hollow = [true, false, true, false];

  test('the arrows move one stop, Right and Up forward, Left and Down back', () => {
    expect(stopForKey('ArrowRight', 1, none)).toBe(2);
    expect(stopForKey('ArrowUp', 1, none)).toBe(2);
    expect(stopForKey('ArrowLeft', 1, none)).toBe(0);
    expect(stopForKey('ArrowDown', 1, none)).toBe(0);
  });

  test('the arrows stay at the first and last stops', () => {
    expect(stopForKey('ArrowLeft', 0, none)).toBe(0);
    expect(stopForKey('ArrowRight', 3, none)).toBe(3);
  });

  test('the arrows skip hollow stops, and stay when only hollow stops are left that way', () => {
    expect(stopForKey('ArrowRight', 1, hollow)).toBe(3);
    expect(stopForKey('ArrowLeft', 3, hollow)).toBe(1);
    expect(stopForKey('ArrowLeft', 1, hollow)).toBe(1);
    expect(stopForKey('ArrowRight', 1, [false, false, true])).toBe(1);
  });

  test('Home and End go to the first and last stops with text', () => {
    expect(stopForKey('Home', 3, none)).toBe(0);
    expect(stopForKey('End', 0, none)).toBe(3);
    expect(stopForKey('Home', 3, hollow)).toBe(1);
    expect(stopForKey('End', 1, [false, false, true])).toBe(1);
  });

  test('a digit jumps to its stop, and stays for a hollow stop or a stop past the end', () => {
    expect(stopForKey('4', 0, none)).toBe(3);
    expect(stopForKey('1', 3, none)).toBe(0);
    expect(stopForKey('3', 1, hollow)).toBe(1);
    expect(stopForKey('5', 1, none)).toBe(1);
    expect(stopForKey('0', 1, none)).toBeNull();
  });

  test('another key is not for the slider', () => {
    for (const key of ['Tab', 'a', 'Enter', 'PageDown', ' ']) expect(stopForKey(key, 1, none), key).toBeNull();
  });
});

test('the stop under a pointer comes from its place on the track, and stays on the track', () => {
  expect(stopAt(100, 100, 300, 3)).toBe(0);
  expect(stopAt(199, 100, 300, 3)).toBe(0);
  expect(stopAt(200, 100, 300, 3)).toBe(1);
  expect(stopAt(399, 100, 300, 3)).toBe(2);
  expect(stopAt(0, 100, 300, 3)).toBe(0);
  expect(stopAt(1000, 100, 300, 3)).toBe(2);
});

test('a stop center sits in the middle of its share of the track', () => {
  expect(stopCenter(0, 2)).toBe(25);
  expect(stopCenter(1, 2)).toBe(75);
  expect(stopCenter(0, 1)).toBe(50);
});

test('the thumb follows the pointer between the centers of the first and last stops', () => {
  expect(thumbAt(250, 100, 300, 3)).toBe(50);
  expect(thumbAt(0, 100, 300, 3)).toBeCloseTo(stopCenter(0, 3));
  expect(thumbAt(1000, 100, 300, 3)).toBeCloseTo(stopCenter(2, 3));
});

test('a hollow stop gives the nearest stop with text, and the later stop of two at the same distance', () => {
  expect(nearestLive(1, [false, false, false])).toBe(1);
  expect(nearestLive(1, [false, true, false])).toBe(2);
  expect(nearestLive(0, [true, true, false])).toBe(2);
  expect(nearestLive(3, [false, true, true, true])).toBe(0);
  expect(nearestLive(1, [true, true, true])).toBe(1);
});

test('the marks say nothing only with no shared text and one kind of part at the level', () => {
  expect(sameMarks(pageWith(['overview', 'internals']), 'overview')).toBe(true);
  expect(sameMarks(pageWith(['overview requirements', 'internals']), 'requirements')).toBe(true);
  expect(sameMarks(pageWith(['overview', 'overview internals']), 'overview')).toBe(false);
  expect(sameMarks(pageWith(['overview'], { hasShared: true }), 'overview')).toBe(false);
  expect(sameMarks(pageWith(['overview']), 'internals')).toBe(false);
  expect(sameMarks(pageWith([], { hasShared: true }), 'overview')).toBe(false);
});

test('a page opens at the default level, or else at the first level with text', () => {
  expect(openingLevel(pageWith(['overview', 'internals'], { defaultLevel: 'internals' }))).toBe('internals');
  expect(openingLevel(pageWith(['requirements', 'internals']))).toBe('requirements');
  expect(openingLevel(pageWith([], { defaultLevel: 'internals' }))).toBe('internals');
  expect(openingLevel(pageWith([], { levels: [], defaultLevel: '' }))).toBe('');
});

test('a live update keeps the level, unless the page moved or lost the level or its text', () => {
  const page = pageWith(['overview', 'internals']);
  expect(levelAfterUpdate('internals', page, false)).toBe('internals');
  expect(levelAfterUpdate('internals', page, true)).toBe('overview');
  expect(levelAfterUpdate('requirements', page, false)).toBe('overview');
  expect(levelAfterUpdate('testers', page, false)).toBe('overview');
  expect(levelAfterUpdate('internals', pageWith(['overview']), false)).toBe('overview');
});

test('the first paint guesses icons for more than four levels or more than 48 letters', () => {
  const named = (...names: string[]) => names.map((name) => ({ name }));
  expect(compactGuess(named('Overview', 'Requirements', 'Internals'))).toBe(false);
  expect(compactGuess(named('a', 'b', 'c', 'd'))).toBe(false);
  expect(compactGuess(named('a', 'b', 'c', 'd', 'e'))).toBe(true);
  expect(compactGuess(named('x'.repeat(24), 'y'.repeat(24)))).toBe(false);
  expect(compactGuess(named('x'.repeat(24), 'y'.repeat(25)))).toBe(true);
});

test.describe('moving between levels', () => {
  /** Each block is its own level list, and null is shared text. */
  const idsOf = (block: { ids: string[] | null }) => block.ids;
  const block = (...ids: string[]) => ({ ids: ids.length ? ids : null });

  test('parts in one run with no shared text between them pair up by order', () => {
    const [a1, b1, a2, b2] = [block('a'), block('b'), block('a'), block('b')];
    expect(pairRuns([a1, b1, a2, b2], idsOf, 'a', 'b')).toEqual({
      leave: [],
      enter: [],
      pairs: [
        { el: b1, old: a1 },
        { el: b2, old: a2 },
      ],
    });
  });

  test('shared text ends a run, so a part never pairs across it', () => {
    const [a1, shared, b1] = [block('a'), block(), block('b')];
    const swap = pairRuns([a1, shared, b1], idsOf, 'a', 'b');
    expect(swap.pairs).toEqual([]);
    expect(swap.leave).toEqual([a1]);
    expect(swap.enter).toEqual([b1]);
  });

  test('the parts past the shorter side of a run leave or enter alone', () => {
    const [a1, a2, b1] = [block('a'), block('a'), block('b')];
    const leaving = pairRuns([a1, a2, b1], idsOf, 'a', 'b');
    expect(leaving.pairs).toEqual([{ el: b1, old: a1 }]);
    expect(leaving.leave).toEqual([a2]);
    const entering = pairRuns([a1, a2, b1], idsOf, 'b', 'a');
    expect(entering.pairs).toEqual([{ el: a1, old: b1 }]);
    expect(entering.enter).toEqual([a2]);
  });

  test('a part at both levels stays, and a part at neither does nothing', () => {
    const [both, other] = [block('a', 'b'), block('c')];
    expect(pairRuns([both, other], idsOf, 'a', 'b')).toEqual({ leave: [], enter: [], pairs: [] });
  });

  test('a part at both levels ends a run, so a part never pairs across it', () => {
    const [a1, both, b1] = [block('a'), block('a', 'b'), block('b')];
    const swap = pairRuns([a1, both, b1], idsOf, 'a', 'b');
    expect(swap.pairs).toEqual([]);
    expect(swap.leave).toEqual([a1]);
    expect(swap.enter).toEqual([b1]);
    expect(counterpartIn([a1, both, b1], idsOf, a1, 'a', 'b')).toBeNull();
    expect(counterpartIn([a1, both, b1], idsOf, b1, 'b', 'a')).toBeNull();
  });

  test('the counterpart of a part is the part that pairs with it', () => {
    const [a1, b1, a2, b2] = [block('a'), block('b'), block('a'), block('b')];
    const blocks = [a1, b1, a2, b2];
    expect(counterpartIn(blocks, idsOf, a1, 'a', 'b')).toBe(b1);
    expect(counterpartIn(blocks, idsOf, a2, 'a', 'b')).toBe(b2);
    expect(counterpartIn(blocks, idsOf, b2, 'b', 'a')).toBe(a2);
  });

  test('the counterpart stays in the run of the part', () => {
    const [a1, b1, shared, a2, b2] = [block('a'), block('b'), block(), block('a'), block('b')];
    const blocks = [a1, b1, shared, a2, b2];
    expect(counterpartIn(blocks, idsOf, a1, 'a', 'b')).toBe(b1);
    expect(counterpartIn(blocks, idsOf, a2, 'a', 'b')).toBe(b2);
  });

  test('a run with no entering part, shared text, or a block that is gone gives none', () => {
    const [a1, shared, b1] = [block('a'), block(), block('b')];
    const blocks = [a1, shared, b1];
    expect(counterpartIn(blocks, idsOf, a1, 'a', 'b')).toBeNull();
    expect(counterpartIn(blocks, idsOf, shared, 'a', 'b')).toBeNull();
    expect(counterpartIn(blocks, idsOf, block('a'), 'a', 'b')).toBeNull();
  });

  test.describe('a run with uneven parts', () => {
    interface Named {
      name: string;
      ids: string[] | null;
    }
    const part = (name: string, ...ids: string[]): Named => ({ name, ids: ids.length ? ids : null });
    const ids = (named: Named) => named.ids;
    const [a1, a2, a3] = [part('a1', 'a'), part('a2', 'a'), part('a3', 'a')];
    const [b1, b2, b3] = [part('b1', 'b'), part('b2', 'b'), part('b3', 'b')];
    const other = part('c1', 'c');
    const shared = part('shared');

    /** What a move does, by the names of the parts, as `old>new` for each pair. */
    function moveOf(blocks: Named[], reading?: Named, from = 'a', to = 'b') {
      const swap = pairRuns(blocks, ids, from, to, reading);
      return {
        pairs: swap.pairs.map(({ el, old }) => `${old.name}>${el.name}`).sort(),
        leave: swap.leave.map(({ name }) => name),
        enter: swap.enter.map(({ name }) => name),
      };
    }

    test('with no part being read, the parts pair by order', () => {
      expect(moveOf([a1, a2, a3, b1])).toEqual({ pairs: ['a1>b1'], leave: ['a2', 'a3'], enter: [] });
    });

    test('the part being read changes into the entering part at its place in the run', () => {
      expect(moveOf([a1, a2, a3, b1, b2, b3], a2)).toEqual({ pairs: ['a1>b1', 'a2>b2', 'a3>b3'], leave: [], enter: [] });
    });

    test('the part being read changes into the last entering part when the run is shorter', () => {
      for (const reading of [a1, a2, a3]) {
        const others = [a1, a2, a3].filter((candidate) => candidate !== reading).map(({ name }) => name);
        expect(moveOf([a1, a2, a3, b1], reading), reading.name).toEqual({ pairs: [`${reading.name}>b1`], leave: others, enter: [] });
      }
    });

    test('the other parts pair by order around the part being read', () => {
      expect(moveOf([a1, a2, a3, b1, b2], a3)).toEqual({ pairs: ['a1>b1', 'a3>b2'], leave: ['a2'], enter: [] });
      expect(moveOf([a1, a2, a3, b1, b2], a2)).toEqual({ pairs: ['a1>b1', 'a2>b2'], leave: ['a3'], enter: [] });
      expect(moveOf([a1, a2, a3, b1, b2], a1)).toEqual({ pairs: ['a1>b1', 'a2>b2'], leave: ['a3'], enter: [] });
    });

    test('with more entering parts, the part being read changes into the one at its place, and the others enter alone', () => {
      expect(moveOf([a1, b1, b2, b3], a1)).toEqual({ pairs: ['a1>b1'], leave: [], enter: ['b2', 'b3'] });
      expect(moveOf([a1, a2, b1, b2, b3], a2)).toEqual({ pairs: ['a1>b1', 'a2>b2'], leave: [], enter: ['b3'] });
    });

    test('the rule holds in both directions of a move', () => {
      expect(moveOf([a1, b1, b2, b3], b3, 'b', 'a')).toEqual({ pairs: ['b3>a1'], leave: ['b1', 'b2'], enter: [] });
    });

    test('a part being read changes only its own run', () => {
      const blocks = [a1, a2, b1, shared, a3, b2];
      expect(moveOf(blocks, a3)).toEqual({ pairs: ['a1>b1', 'a3>b2'], leave: ['a2'], enter: [] });
      expect(moveOf(blocks, a2)).toEqual({ pairs: ['a2>b1', 'a3>b2'], leave: ['a1'], enter: [] });
    });

    test('a part being read that does not leave changes nothing', () => {
      const byOrder = moveOf([a1, a2, b1, other]);
      expect(moveOf([a1, a2, b1, other], other)).toEqual(byOrder);
      expect(moveOf([a1, a2, b1, other], b1)).toEqual(byOrder);
      expect(moveOf([a1, a2, b1, other], shared)).toEqual(byOrder);
    });

    test('a part at neither level stays in the run', () => {
      expect(moveOf([a1, other, b1])).toEqual({ pairs: ['a1>b1'], leave: [], enter: [] });
      expect(counterpartIn([a1, other, b1], ids, a1, 'a', 'b')).toBe(b1);
    });

    test('the counterpart of a part is the entering part at its place, or the last one', () => {
      const shorter = [a1, a2, a3, b1];
      for (const candidate of [a1, a2, a3]) expect(counterpartIn(shorter, ids, candidate, 'a', 'b')).toBe(b1);
      const two = [a1, a2, a3, b1, b2];
      expect(counterpartIn(two, ids, a1, 'a', 'b')).toBe(b1);
      expect(counterpartIn(two, ids, a2, 'a', 'b')).toBe(b2);
      expect(counterpartIn(two, ids, a3, 'a', 'b')).toBe(b2);
      expect(counterpartIn([a1, b1, b2, b3], ids, b3, 'b', 'a')).toBe(a1);
    });

    test('the counterpart of a part is the entering part that the part pairs with when it is read', () => {
      const both = part('both', 'a', 'b');
      const layouts = [
        [a1, a2, a3, b1],
        [a1, a2, a3, b1, b2],
        [a1, b1, b2, b3],
        [b1, a1, a2, b2, a3],
        [a1, a2, b1, shared, a3, b2, b3],
        [a1, both, a2, b1, b2],
        [a1, a2, both, b1],
      ];
      for (const blocks of layouts) {
        for (const reading of blocks.filter((block) => block.ids?.join() === 'a')) {
          const paired = pairRuns(blocks, ids, 'a', 'b', reading).pairs.find(({ old }) => old === reading)?.el ?? null;
          expect(counterpartIn(blocks, ids, reading, 'a', 'b')?.name, `${blocks.map(({ name }) => name)} from ${reading.name}`).toBe(paired?.name);
        }
      }
    });
  });
});
