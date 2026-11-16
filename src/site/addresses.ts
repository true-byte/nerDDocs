import { compareEntries, isMarkdownName, stemOf, withoutOrder } from './names.ts';

/** One public entry of a folder of the docs. */
export interface FolderEntry {
  name: string;
  /** True for a folder, false for a file. */
  folder: boolean;
}

/**
 * The name that each folder and each Markdown file of one folder takes in an address, by the name of its entry: the
 * name of the folder or the stem of the file, without its order prefix. A name with no prefix keeps its address. Of
 * the other names that give one address, the first in the order of `compareEntries` takes it, and each other one keeps
 * its full name. Folders and files never share an address, since a page address ends in `.html`.
 */
export function addressNames(entries: readonly FolderEntry[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const folders of [true, false]) {
    const kind = entries
      .filter((entry) => entry.folder === folders && (folders || isMarkdownName(entry.name)))
      .sort((a, b) => compareEntries(a.name, b.name));
    const full = (entry: FolderEntry) => (folders ? entry.name : stemOf(entry.name));
    const taken = new Set(kind.map(full).filter((name) => withoutOrder(name) === name));
    for (const entry of kind) {
      const name = full(entry);
      const short = withoutOrder(name);
      const free = short !== name && !taken.has(short);
      if (free) taken.add(short);
      names.set(entry.name, free ? short : name);
    }
  }
  return names;
}

/** The addresses of the pages and folders of one docs folder. Each folder is listed once, on its first use. */
export class SiteAddresses {
  private known = new Map<string, Map<string, string>>();

  /** `list` gives the public entries of a folder of the docs, by its path with `/`, '' for the docs folder itself. */
  constructor(private readonly list: (folder: string) => FolderEntry[]) {}

  private namesIn(folder: string): Map<string, string> {
    let names = this.known.get(folder);
    if (!names) {
      names = addressNames(this.list(folder));
      this.known.set(folder, names);
    }
    return names;
  }

  /** The address part of each part of `path`. A name that its folder does not list drops its prefix. */
  private partsOf(path: string, lastIsPage: boolean): string[] {
    const parts = path.split('/');
    return parts.map((part, at) => {
      const isPage = lastIsPage && at === parts.length - 1;
      const own = this.namesIn(parts.slice(0, at).join('/')).get(part);
      return own ?? withoutOrder(isPage ? stemOf(part) : part);
    });
  }

  /** The address of the page of the Markdown file at `path`, a path in the docs folder with `/`. */
  pageUrl(path: string): string {
    const parts = this.partsOf(path, true);
    return `/${parts.join('/')}.html`;
  }

  /** The address of the folder at `path`, a path in the docs folder with `/`, with no `/` at its end. */
  folderUrl(path: string): string {
    return `/${this.partsOf(path, false).join('/')}`;
  }
}
