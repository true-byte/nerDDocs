import type { Problem } from '../site/problems.ts';

/** Past this count of problems, each new group but the one of the open page starts folded. */
export const FOLD_PAST = 20;

/** The problems of one page, or of one file with no page. */
export interface ProblemGroup {
  /** The address of the page, or the file of a group with no page. */
  key: string;
  label: string;
  page: string | null;
  problems: Problem[];
}

/** The group of the open page first, then the other groups in the order of the list. A page group is labeled with the page title, and a group of no page with its file. */
export function problemGroups(problems: readonly Problem[], openPage: string, titles: Record<string, string>): ProblemGroup[] {
  const groups = new Map<string, ProblemGroup>();
  for (const problem of problems) {
    const key = problem.page ?? problem.file;
    let group = groups.get(key);
    if (!group) {
      const label = problem.page === null ? problem.file : (titles[problem.page] ?? problem.page);
      group = { key, label, page: problem.page, problems: [] };
      groups.set(key, group);
    }
    group.problems.push(problem);
  }
  const list = [...groups.values()];
  const open = list.findIndex((group) => group.page === openPage);
  if (open > 0) list.unshift(...list.splice(open, 1));
  return list;
}

/** The keys that `after` has and `before` lacks, and the keys that `before` has and `after` lacks. */
export function problemChanges(before: readonly Problem[], after: readonly Problem[]): { added: string[]; gone: string[] } {
  const had = new Set(before.map((problem) => problem.key));
  const has = new Set(after.map((problem) => problem.key));
  return {
    added: after.map((problem) => problem.key).filter((key) => !had.has(key)),
    gone: before.map((problem) => problem.key).filter((key) => !has.has(key)),
  };
}

/** True when a new group starts folded: the list holds more than FOLD_PAST problems, and the group is not the open page. */
export function startsFolded(group: ProblemGroup, total: number, openPage: string): boolean {
  return total > FOLD_PAST && group.page !== openPage;
}

/** The file name and the line, such as 'restore.md:25', or the file name alone. */
export function pathLabel(problem: Problem): string {
  const name = problem.file.split('/').pop() ?? '';
  return problem.line === null ? name : `${name}:${problem.line}`;
}
