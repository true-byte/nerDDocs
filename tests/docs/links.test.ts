import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import { pageFile } from '../../src/site/problems.ts';
import type { Site } from '../../src/site/scan.ts';
import { docsSite, DOCS, ROOT } from '../support/docs.ts';
import { eachNode, markdownTree } from '../support/skill.ts';

/** The files outside the docs that link into them, by their path in the clone. */
const LINKING_FILES = [
  'README.md',
  'CONTRIBUTING.md',
  'CLAUDE.md',
  ...readdirSync(join(ROOT, '.claude/skills/nerddocs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `.claude/skills/nerddocs/${name}`),
];

/** A target with a scheme, such as `https:` or `mailto:`, or one that starts with `//`. */
const isRemote = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');

const decoded = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** The heading ids of the page of a Markdown file of the docs, by the rule of the site, or null for a file with no page. */
function headingIds(site: Site, file: string): string[] | null {
  const page = site.pages.find((each) => pageFile(each) === file);
  if (!page) return null;
  return [page.titleId, ...[...page.html.matchAll(/<h[1-6]\b[^>]*\sid="([^"]*)"/g)].map(([, id]) => id!)];
}

/** Each link of the file into the docs whose file is missing, or whose hash names no heading of its page, as `file:line url`. */
async function brokenLinks(file: string): Promise<string[]> {
  const site = await docsSite();
  const broken: string[] = [];
  eachNode(markdownTree(await readFile(join(ROOT, file), 'utf8')), (node) => {
    if (!['link', 'image', 'definition'].includes(node.type) || !node.url || isRemote(node.url)) return;
    const [, path = '', hash] = /^([^?#]*)(?:\?[^#]*)?(?:#(.*))?$/.exec(node.url)!;
    if (!path) return;
    const target = resolve(dirname(join(ROOT, file)), decoded(path));
    const inDocs = relative(DOCS, target);
    if (inDocs.startsWith('..')) return;
    const ids = hash === undefined ? [] : headingIds(site, inDocs.split(sep).join('/'));
    const names = hash === undefined || ids?.includes(decoded(hash));
    if (!existsSync(target) || !names) broken.push(`${file}:${node.position?.start.line} ${node.url}`);
  });
  return broken;
}

for (const file of LINKING_FILES) {
  test(`each link of ${file} into the docs names a file that exists, and its hash names a heading of that page`, async () => {
    expect(await brokenLinks(file)).toEqual([]);
  });
}
