/** What became of one block of a page through a save. */
export type BlockChange =
  | { kind: 'same'; before: number; after: number }
  | { kind: 'changed'; before: number; after: number }
  | { kind: 'added'; after: number }
  | { kind: 'removed'; before: number };

/** Above this many pairs to compare in the middle of a page, the same blocks of the middle pair in order only. */
const MAX_CELLS = 4_000_000;

/**
 * The pairs of a longest common run of `a` old items and `b` new items, from the start of each. A tie drops an old
 * item first.
 */
function commonRun(a: number, b: number, match: (i: number, j: number) => boolean): [number, number][] {
  if (a * b > MAX_CELLS) {
    // A page too long to compare in full pairs each item with the next match in order.
    const pairs: [number, number][] = [];
    let j = 0;
    for (let i = 0; i < a && j < b; i++) {
      for (let k = j; k < b; k++) {
        if (!match(i, k)) continue;
        pairs.push([i, k]);
        j = k + 1;
        break;
      }
    }
    return pairs;
  }
  const width = b + 1;
  const run = new Uint32Array((a + 1) * width);
  for (let i = a - 1; i >= 0; i--) {
    for (let j = b - 1; j >= 0; j--) {
      run[i * width + j] = match(i, j)
        ? run[(i + 1) * width + j + 1]! + 1
        : Math.max(run[(i + 1) * width + j]!, run[i * width + j + 1]!);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a && j < b) {
    if (run[i * width + j] === run[(i + 1) * width + j + 1]! + 1 && match(i, j)) pairs.push([i++, j++]);
    else if (run[(i + 1) * width + j]! >= run[i * width + j + 1]!) i++;
    else j++;
  }
  return pairs;
}

/**
 * Pairs the old blocks with the new ones. `same(i, j)` says that old block i and new block j are the same; `kind(i)`
 * and `kindNew(j)` give a block's tag and its `data-l`. Same blocks pair by the longest common run. Between two same
 * pairs, an old and a new block of the same kind pair as changed, in order. The rest are added or removed.
 */
export function pairBlocks(
  before: number,
  after: number,
  same: (i: number, j: number) => boolean,
  kind: (i: number) => string,
  kindNew: (j: number) => string,
): BlockChange[] {
  let head = 0;
  while (head < before && head < after && same(head, head)) head++;
  let tail = 0;
  while (tail < before - head && tail < after - head && same(before - 1 - tail, after - 1 - tail)) tail++;

  const changes: BlockChange[] = [];
  for (let at = 0; at < head; at++) changes.push({ kind: 'same', before: at, after: at });

  const oldEnd = before - tail;
  const newEnd = after - tail;
  const kept = commonRun(oldEnd - head, newEnd - head, (i, j) => same(head + i, head + j)).map(
    ([i, j]) => [head + i, head + j] as const,
  );
  let i = head;
  let j = head;
  for (const [keptOld, keptNew] of [...kept, [oldEnd, newEnd] as const]) {
    // Between two same pairs: the blocks of one kind pair as changed, by the longest common run of kinds.
    const oldStart = i;
    const newStart = j;
    const gap = commonRun(keptOld - oldStart, keptNew - newStart, (x, y) => kind(oldStart + x) === kindNew(newStart + y));
    for (const [x, y] of gap) {
      for (; i < oldStart + x; i++) changes.push({ kind: 'removed', before: i });
      for (; j < newStart + y; j++) changes.push({ kind: 'added', after: j });
      changes.push({ kind: 'changed', before: i++, after: j++ });
    }
    for (; i < keptOld; i++) changes.push({ kind: 'removed', before: i });
    for (; j < keptNew; j++) changes.push({ kind: 'added', after: j });
    if (keptOld < oldEnd) changes.push({ kind: 'same', before: i++, after: j++ });
  }
  for (let at = 0; at < tail; at++) changes.push({ kind: 'same', before: oldEnd + at, after: newEnd + at });
  return changes;
}
