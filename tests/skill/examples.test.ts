import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { runCheck } from '../../src/cli/check.ts';
import { embedKind, resolveTarget } from '../../src/markdown/embed.ts';
import { folderWith, type FileContent } from '../support/folder.ts';
import { pngFile } from '../support/images.ts';
import { eachNode, markdownTree, readSkillFile, SKILL_FILES, SKILL_LEVELS, textOf, type MdNode } from '../support/skill.ts';

/** A ```md block of a skill file: a whole page, at its place in the docs folder. */
interface Example {
  page: string;
  text: string;
  /** The line of the skill file where the block opens. */
  line: number;
}

/** The file that a paragraph names: its last inline code that ends in `.md`, or null. */
function namedFile(paragraph: MdNode | undefined): string | null {
  if (paragraph?.type !== 'paragraph') return null;
  const paths: string[] = [];
  eachNode(paragraph, (node) => {
    if (node.type === 'inlineCode' && textOf(node).trim().endsWith('.md')) paths.push(textOf(node).trim());
  });
  return paths.at(-1) ?? null;
}

/** The place of a page in the docs folder: the path that names it, without its first folder `docs` or `docs-new`. */
const placeInDocs = (path: string) => path.replace(/^(?:\.\/)?docs(?:-new)?\//, '');

/** Each ```md block of a skill file in file order, as the page that the paragraph right before it names, else `example-<n>.md`. */
function examplesOf(text: string): Example[] {
  const examples: Example[] = [];
  eachNode(markdownTree(text), (node, parent, index) => {
    if (node.type !== 'code' || node.lang !== 'md') return;
    const named = index > 0 ? namedFile(parent?.children?.[index - 1]) : null;
    examples.push({
      page: named === null ? `example-${examples.length + 1}.md` : placeInDocs(named),
      text: node.value ?? '',
      line: node.position?.start.line ?? 0,
    });
  });
  return examples;
}

/**
 * The docs folders to check. Blocks that name the same page are its versions, such as a page before and after a fill.
 * Folder n holds version n of each page, or the last version of a page that has fewer.
 */
function docsFolders(examples: Example[]): Map<string, Example>[] {
  const versions = new Map<string, Example[]>();
  for (const example of examples) versions.set(example.page, [...(versions.get(example.page) ?? []), example]);
  const count = Math.max(0, ...[...versions.values()].map((list) => list.length));
  return Array.from(
    { length: count },
    (_, n) => new Map([...versions].map(([page, list]) => [page, list[Math.min(n, list.length - 1)]!])),
  );
}

const IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img\b[^>]*\bsrc=["']([^"']+)["']/g;

/** A PNG for each image that a page shows, as the copy that a move puts next to the page. */
function shownImages(pages: Map<string, string>): Record<string, FileContent> {
  const images: Record<string, FileContent> = {};
  for (const [page, text] of pages) {
    for (const match of text.matchAll(IMAGE)) {
      const target = match[1] ?? match[2]!;
      const place = resolveTarget(target, page);
      if (embedKind(target) === 'image' && place.kind === 'file') images[place.path] = pngFile(1, 1);
    }
  }
  return images;
}

/** Checks the pages in the folder `docs` of a backup app with the three levels, and gives the code and the report. */
async function check(pages: Map<string, string>) {
  const files = { ...shownImages(pages), 'nerddocs.json': SKILL_LEVELS, ...Object.fromEntries(pages) };
  const app = await folderWith(Object.fromEntries(Object.entries(files).map(([name, text]) => [`docs/${name}`, text])));
  let report = '';
  const code = await runCheck(join(app, 'docs'), (text) => (report += text), { cwd: app, color: false });
  return { code, report };
}

for (const file of SKILL_FILES) {
  test(`the examples of ${file} pass the check with no problem`, async () => {
    for (const folder of docsFolders(examplesOf(await readSkillFile(file)))) {
      const { code, report } = await check(new Map([...folder].map(([page, example]) => [page, example.text])));
      const blocks = [...folder].map(([page, example]) => `docs/${page} is the block at ${file}:${example.line}`);
      expect(report, blocks.join('\n')).toMatch(/\nProblems: 0\n$/);
      expect(code).toBe(0);
    }
  });
}
