import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { parse } from 'yaml';
import { eachNode, markdownTree, readSkillFile, SKILL, SKILL_FILES } from '../support/skill.ts';

test('SKILL.md starts with the name nerddocs and a description of 1024 characters or fewer', async () => {
  const head = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(await readSkillFile('SKILL.md'));
  expect(head, 'SKILL.md starts with its frontmatter between two lines ---').not.toBeNull();
  const { name, description } = parse(head![1]!) as Record<string, unknown>;
  expect(name).toBe('nerddocs');
  expect(typeof description).toBe('string');
  expect((description as string).trim()).not.toBe('');
  expect((description as string).length).toBeLessThanOrEqual(1024);
});

/** A target with a scheme, such as `https:` or `mailto:`, or one that starts with `//`. */
const isRemote = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');

/** The path of a link target up to its first `?` or `#`, decoded. A bad escape keeps the path as written. */
function pathOf(url: string): string {
  const path = /^[^?#]*/.exec(url)![0];
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

for (const file of SKILL_FILES) {
  // `npx skills add` copies only the skill folder, so a link out of it breaks once the skill is installed.
  test(`each relative link of ${file} points to a file in the skill folder`, async () => {
    const broken: string[] = [];
    eachNode(markdownTree(await readSkillFile(file)), (node) => {
      if (!['link', 'image', 'definition'].includes(node.type) || !node.url || isRemote(node.url)) return;
      const path = pathOf(node.url);
      if (!path) return;
      const target = resolve(dirname(join(SKILL, file)), path);
      const inSkill = !relative(SKILL, target).startsWith('..');
      if (!inSkill || !existsSync(target)) broken.push(`${file}:${node.position?.start.line} ${node.url}`);
    });
    expect(broken).toEqual([]);
  });
}
