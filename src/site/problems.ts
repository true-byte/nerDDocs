import { PROBLEM_NAMES, type ProblemName } from '../cli/terminal-error.ts';
import { parseHash } from '../page/address.ts';
import type { Page } from './scan.ts';

/** Where a problem shows on its page: an element of the page, and the words in it. */
export interface ProblemMark {
  /** The index of the element child of `#page` that holds the place. */
  block: number;
  /** In a part, the index of the element child of its `div.bd`. Null for a shared element. */
  inner: number | null;
  /** The words that get the mark: the first match in the text of that element. Null marks the whole element. */
  words: string | null;
}

/** A problem as one page gives it. */
export interface PageProblem {
  name: ProblemName;
  /** The path of the file or folder in the docs folder, with `/`. '' for the docs folder itself. */
  file: string;
  /** The line in the file, from 1, or null. */
  line: number | null;
  /** The column, from 1, and the length of the marked text in `text`. Null and 0 when nothing is marked. */
  column: number | null;
  length: number;
  /** The text of `line` as the file has it, or null. */
  text: string | null;
  /** The opening fence line of the hidden part, for a level problem that has one. */
  fence: { line: number; text: string } | null;
  /** The target, the id, the tag or the name that the problem is about, or ''. */
  value: string;
  /** The level ids at which it breaks, in the order of the levels. [] when it breaks at every level, or the site has none. */
  levels: string[];
  mark: ProblemMark | null;
}

/** A problem of the site. */
export interface Problem extends PageProblem {
  /** The address of the page that shows it, or null. */
  page: string | null;
  /** The name, the file, the value and the words of the mark, joined by tabs, then a tab and the count of earlier problems with the same four. */
  key: string;
}

/** The path in the docs folder of the Markdown file of each page that a scan built. */
const pageFiles = new WeakMap<object, string>();

/** Keeps the path of the Markdown file of a page, which its link problems name. */
export function setPageFile(page: object, file: string): void {
  pageFiles.set(page, file);
}

/** The path of the Markdown file of a page. A page that no scan built takes the path of its address. */
export function pageFile(page: Pick<Page, 'url'>): string {
  return pageFiles.get(page) ?? page.url.replace(/^\//, '').replace(/\.html$/i, '.md');
}

const nameOrder = (name: ProblemName) => PROBLEM_NAMES.indexOf(name);

/** A null line or column comes first. */
const byNumber = (a: number | null, b: number | null) => (a ?? 0) - (b ?? 0);

/** True when two problems have the same name, file, line, column and value. */
const sameProblem = (a: PageProblem, b: PageProblem) =>
  a.name === b.name && a.file === b.file && a.line === b.line && a.column === b.column && a.value === b.value;

/** The problems without repeats: a problem with the same name, file, line, column and value as one before it goes. */
export function withoutRepeats<T extends PageProblem>(problems: readonly T[]): T[] {
  const kept: T[] = [];
  for (const problem of problems) if (!kept.some((seen) => sameProblem(seen, problem))) kept.push(problem);
  return kept;
}

/** Every problem in print order, each with its key. Problems with the same name, file, line, column and value are one, at the first place. */
export function siteProblems(found: Omit<Problem, 'key'>[], pageOrder: readonly string[]): Problem[] {
  const unique = withoutRepeats(found);
  const order = new Map(pageOrder.map((url, at) => [url, at]));
  const rank = (problem: Omit<Problem, 'key'>) =>
    problem.page === null ? -1 : (order.get(problem.page) ?? pageOrder.length);
  const sorted = unique
    .map((problem, at) => ({ problem, at }))
    .sort((a, b) => {
      const pageA = rank(a.problem);
      const pageB = rank(b.problem);
      if (pageA !== pageB) return pageA - pageB;
      if (pageA === -1) return a.at - b.at;
      return (
        byNumber(a.problem.line, b.problem.line) ||
        byNumber(a.problem.column, b.problem.column) ||
        nameOrder(a.problem.name) - nameOrder(b.problem.name) ||
        a.at - b.at
      );
    })
    .map(({ problem }) => problem);
  const counts = new Map<string, number>();
  return sorted.map((problem) => {
    const base = [problem.name, problem.file, problem.value, problem.mark?.words ?? ''].join('\t');
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return { ...problem, key: `${base}\t${count}` };
  });
}

/** The 'Missing page' and 'Missing heading' problems of the pages, in page order. `levelIds` are the ids of the site levels. */
export function linkProblems(pages: readonly Page[], levelIds: readonly string[]): Omit<Problem, 'key'>[] {
  const byUrl = new Map(pages.map((page) => [page.url, page]));
  const found: Omit<Problem, 'key'>[] = [];
  for (const page of pages) {
    const file = pageFile(page);
    for (const spot of page.linkSpots ?? []) {
      const problem = (name: ProblemName): Omit<Problem, 'key'> => ({
        name,
        file,
        line: spot.line,
        column: spot.column,
        length: spot.length,
        text: spot.text,
        fence: null,
        value: spot.written,
        levels: [],
        mark: spot.mark,
        page: page.url,
      });
      if (spot.target === null) {
        found.push(problem('Missing page'));
        continue;
      }
      const at = spot.target.indexOf('#');
      const address = at < 0 ? spot.target : spot.target.slice(0, at);
      const target = byUrl.get(address);
      if (!target) {
        found.push(problem('Missing page'));
        continue;
      }
      const hash = at < 0 ? '' : spot.target.slice(at + 1);
      const { level, id } = parseHash(hash, levelIds);
      if (id === null) continue;
      let has = id === target.titleId || target.elementIds.includes(id);
      const anchors = target.anchors;
      if (has && level !== null && Object.hasOwn(anchors, id)) has = anchors[id]!.split(' ').includes(level);
      if (!has) found.push(problem('Missing heading'));
    }
  }
  return found;
}
