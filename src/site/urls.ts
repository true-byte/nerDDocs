import { isMarkdownName, stemOf, withoutOrder } from './names.ts';

/**
 * The address of a Markdown file, from its path in the docs folder with `/`: each folder name and the stem of the file
 * drop their order prefix. A page address is decoded inside the program and encoded only in a link. `SiteAddresses`
 * also tells apart two names that give one address.
 */
export function pageUrl(relativeFile: string): string {
  const parts = relativeFile.split('/');
  const file = parts.pop()!;
  const name = isMarkdownName(file) ? `${withoutOrder(stemOf(file))}.html` : file;
  return `/${[...parts.map(withoutOrder), name].join('/')}`;
}

export function encodeUrl(url: string): string {
  return url.split('/').map(encodeURIComponent).join('/');
}

/** Every link is relative, so a page also works from disk or under a sub-path. */
export function hrefTo(from: string, to: string): string {
  const fromFolders = from.split('/').slice(1, -1);
  const toParts = to.split('/').slice(1);
  let shared = 0;
  while (
    shared < fromFolders.length &&
    shared < toParts.length - 1 &&
    fromFolders[shared] === toParts[shared]
  ) {
    shared++;
  }
  const up = fromFolders.slice(shared).map(() => '..');
  return [...up, ...toParts.slice(shared).map(encodeURIComponent)].join('/');
}
