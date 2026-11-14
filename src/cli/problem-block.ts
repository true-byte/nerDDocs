import { isAbsolute, join, relative, sep } from 'node:path';
import type { Problem } from '../site/problems.ts';

export interface PrintOptions {
  folder: string;
  cwd: string;
  color: boolean;
  /** The name of each level, by its id. */
  levelNames: Record<string, string>;
}

/** The SGR codes of each part of a block. */
const STYLE = {
  path: '36;4',
  name: '1;31',
  value: '33',
  levels: '1',
  frame: '2',
  carets: '31',
} as const;

/** A path as the command prints it: relative to `cwd` when it lies in `cwd`, else `path` as given. */
export function shownPath(path: string, cwd: string): string {
  const shown = relative(cwd, path);
  if (shown === '..' || shown.startsWith(`..${sep}`) || isAbsolute(shown)) return path;
  return shown || '.';
}

/** True when `stream` is a TTY and `NO_COLOR` is unset or empty. */
export function useColor(stream: { isTTY?: boolean }, env: NodeJS.ProcessEnv): boolean {
  return !!stream.isTTY && !env.NO_COLOR;
}

/** The lines of one problem, with no line end at the end. */
export function problemBlock(problem: Problem, options: PrintOptions): string {
  const paint = (text: string, style: string) => (options.color && text ? `\x1b[${style}m${text}\x1b[0m` : text);
  const place = shownPath(join(options.folder, problem.file), options.cwd) + (problem.line === null ? '' : `:${problem.line}`);
  let head = `${paint(place, STYLE.path)}  ${paint(problem.name, STYLE.name)}`;
  if (problem.levels.length) {
    head += `  ${paint(problem.levels.map((id) => options.levelNames[id] ?? id).join(', '), STYLE.levels)}`;
  } else if (problem.value) head += `  ${paint(problem.value, STYLE.value)}`;

  const numbered = (line: number) => `${String(line).padStart(4)} │`;
  const shown = (text: string) => text.replace(/\t/g, ' ');
  const rows: { line: number; text: string }[] = [];
  if (problem.line !== null && problem.text !== null) {
    let row = `${paint(numbered(problem.line), STYLE.frame)} ${shown(problem.text)}`;
    if (problem.column !== null) {
      const carets = '^'.repeat(problem.length);
      row += `\n     ${paint('│', STYLE.frame)} ${' '.repeat(problem.column - 1)}${paint(carets, STYLE.carets)}`;
    }
    rows.push({ line: problem.line, text: row });
  }
  if (problem.fence) {
    rows.push({ line: problem.fence.line, text: paint(`${numbered(problem.fence.line)} ${shown(problem.fence.text)}`, STYLE.frame) });
  }
  return [head, ...rows.map((row) => row.text)].join('\n');
}
