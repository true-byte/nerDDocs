import { scanSite } from '../site/scan.ts';
import { problemBlock, shownPath, type PrintOptions } from './problem-block.ts';

/** Prints the report to `write` and gives the exit code: 0 with no problem, else 1. */
export async function runCheck(
  folder: string,
  write: (text: string) => void,
  options: Omit<PrintOptions, 'folder' | 'levelNames'>,
): Promise<number> {
  const site = await scanSite(folder);
  const levelNames = Object.fromEntries(site.levels.map((level) => [level.id, level.name]));
  const print: PrintOptions = { ...options, folder, levelNames };
  write(`Folder: ${shownPath(folder, options.cwd)}\nPages: ${site.pages.length}\n\n`);
  for (const problem of site.problems) write(`${problemBlock(problem, print)}\n\n`);
  const count = site.problems.length;
  const total = `Problems: ${count}`;
  write(`${options.color ? `\x1b[${count ? '1;31' : '32'}m${total}\x1b[0m` : total}\n`);
  return count ? 1 : 0;
}
