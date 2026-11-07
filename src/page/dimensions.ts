import type { Dimension } from '../site/config.ts';
import { withoutOrder } from '../site/names.ts';
import type { TreeNode } from '../site/scan.ts';
import { local, read, write } from './panel-state.ts';

/** In localStorage: the last page that the reader opened in each dimension, as a JSON object of urls by folder. */
export const DIMENSION_KEY = 'nerddocs-dimension-pages';

/**
 * The dimension whose folder holds `url`, else the first dimension, or null for a site with none. A folder name with an
 * order prefix gives an address without it, unless another name has that address.
 */
export function currentDimension(dimensions: readonly Dimension[], url: string): Dimension | null {
  const holds = (name: string) => url.startsWith(`/${name}/`);
  return (
    dimensions.find((dimension) => holds(dimension.folder)) ??
    dimensions.find((dimension) => holds(withoutOrder(dimension.folder))) ??
    dimensions[0] ??
    null
  );
}

/** The nodes inside the folder of a dimension: the children of the top section with `id === folder`, else []. */
export function dimensionNodes(tree: readonly TreeNode[], folder: string): TreeNode[] {
  const section = tree.find((node) => node.kind === 'section' && node.id === folder);
  return section?.kind === 'section' ? section.children : [];
}

/** The page of a folder comes before the rows under it. */
function pagesOf(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'page' ? [node.url] : [...(node.url ? [node.url] : []), ...pagesOf(node.children)],
  );
}

/** The page urls of a dimension, in tree order. */
export function dimensionPages(tree: readonly TreeNode[], folder: string): string[] {
  return pagesOf(dimensionNodes(tree, folder));
}

/** The page that a link to a dimension opens: its stored page while the dimension holds it, else its first page, or null for a dimension with no page. */
export function dimensionTarget(
  tree: readonly TreeNode[],
  folder: string,
  stored: Readonly<Record<string, string>>,
): string | null {
  const pages = dimensionPages(tree, folder);
  const last = Object.hasOwn(stored, folder) ? stored[folder] : undefined;
  return last !== undefined && pages.includes(last) ? last : (pages[0] ?? null);
}

/** The stored last pages from the text of `DIMENSION_KEY`: each string value by its key. Any other text gives {}. */
export function lastPagesOf(text: string | null): Record<string, string> {
  let value: unknown;
  try {
    value = JSON.parse(text ?? '');
  } catch {
    return {};
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/** `lastPagesOf(read(local, DIMENSION_KEY))`. */
export function readLastPages(): Record<string, string> {
  return lastPagesOf(read(local, DIMENSION_KEY));
}

/** Stores `url` as the last page of `folder`, and keeps the other folders. */
export function writeLastPage(folder: string, url: string): void {
  write(local, DIMENSION_KEY, JSON.stringify({ ...readLastPages(), [folder]: url }));
}
