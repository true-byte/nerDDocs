import type { Root } from 'hast';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

/** Markdown with GitHub's extensions and raw HTML into hast, and hast into HTML. */
export const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeStringify);

/** The hast of a Markdown text, by `processor`. */
export function parseMarkdown(markdown: string): Root {
  return processor.runSync(processor.parse(markdown)) as Root;
}
