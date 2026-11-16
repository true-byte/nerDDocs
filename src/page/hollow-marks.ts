/** A place on the page where other levels have text that the current level hides. */
export interface HollowSpot {
  /** The index of the shown part that the icons sit under, or null for a gap. */
  anchor: number | null;
  /** For a gap, the index of the first part of its run. */
  gap: number | null;
  /** The levels that have text at this spot, in the order of the stops, without the current level. */
  levels: string[];
  /** For each of those levels, the index of the first part of the spot that shows at it. */
  first: Record<string, number>;
}

/**
 * Each place where the current level hides text, in page order. Consecutive parts form a run, and any shared block
 * ends a run. Each part of a run that the current level hides belongs to the nearest shown part before it in its run,
 * else to the nearest shown part after it. A run with no shown part is one gap.
 *
 * `blocks` holds the levels of each child of #page: the words of a part's data-l, or null for shared.
 */
export function hollowSpots(blocks: (string[] | null)[], level: string, order: string[]): HollowSpot[] {
  const runs: number[][] = [];
  let run: number[] | null = null;
  blocks.forEach((levels, index) => {
    if (levels === null) {
      run = null;
      return;
    }
    if (!run) runs.push((run = []));
    run.push(index);
  });

  const spots: HollowSpot[] = [];
  for (const parts of runs) {
    const shown = parts.filter((index) => blocks[index]!.includes(level));
    const hidden = parts.filter((index) => !blocks[index]!.includes(level));
    if (!hidden.length) continue;
    const byAnchor = new Map<number | null, number[]>();
    for (const index of hidden) {
      const anchor = shown.filter((at) => at < index).at(-1) ?? shown.find((at) => at > index) ?? null;
      byAnchor.set(anchor, [...(byAnchor.get(anchor) ?? []), index]);
    }
    // A run with a shown part gives each hidden part an anchor, so a gap is a run of its own.
    for (const [anchor, members] of [...byAnchor].sort(([a], [b]) => (a ?? 0) - (b ?? 0))) {
      const first: Record<string, number> = {};
      for (const id of order) {
        const at = id === level ? undefined : members.find((index) => blocks[index]!.includes(id));
        if (at !== undefined) first[id] = at;
      }
      const levels = Object.keys(first);
      if (levels.length) spots.push({ anchor, gap: anchor === null ? parts[0]! : null, levels, first });
    }
  }
  return spots;
}
