import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { REPO } from './run-command.ts';

/** The folder of the nerddocs skill in the clone, as `npx skills add` copies it. */
export const SKILL = join(REPO, '.claude/skills/nerddocs');

/** The Markdown files of the skill. */
export const SKILL_FILES = ['SKILL.md', 'format.md', 'move.md', 'levels.md'] as const;

export const readSkillFile = (name: string) => readFile(join(SKILL, name), 'utf8');

/** The levels of the backup app of the skill, as its file `nerddocs.json` lists them. */
export const SKILL_LEVELS = JSON.stringify({
  levels: [
    { id: 'basics', name: 'Basics', icon: 'eye' },
    { id: 'details', name: 'Details', icon: 'list' },
    { id: 'internals', name: 'Internals', icon: 'cpu' },
  ],
  defaultLevel: 'basics',
});

/** A node of a Markdown tree, with only the fields that the tests read. */
export interface MdNode {
  type: string;
  value?: string;
  url?: string;
  lang?: string | null;
  children?: MdNode[];
  position?: { start: { line: number } };
}

const markdown = unified().use(remarkParse).use(remarkGfm);

/** The tree of a Markdown text, with the tables of GitHub. A code block is one node, so nothing in it counts as a link or a table. */
export const markdownTree = (text: string): MdNode => markdown.parse(text);

/** Calls `visit` on each node of the tree, a parent before its children, with the parent and the place of the node in it. */
export function eachNode(
  node: MdNode,
  visit: (node: MdNode, parent: MdNode | null, index: number) => void,
  parent: MdNode | null = null,
  index = 0,
): void {
  visit(node, parent, index);
  node.children?.forEach((child, at) => eachNode(child, visit, node, at));
}

/** The text of a node as a reader sees it, such as inline code without its backticks. */
export const textOf = (node: MdNode): string => node.value ?? (node.children ?? []).map(textOf).join('');
