import { watch, type FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { CONFIG_FILE } from '../site/config.ts';
import { isMarkdownName, isPublicName } from '../site/names.ts';

const ROOT_CHECK_MS = 500;

interface Watched {
  watcher: FSWatcher;
  inode: number;
}

/** Only a Markdown file, the config file or a folder can change what a page shows. */
export async function isSiteChange(
  dir: string,
  name: string | null,
  knownFolders: { has(path: string): boolean },
): Promise<boolean> {
  if (name === null) return true;
  if (!isPublicName(name)) return false;
  if (isMarkdownName(name) || name === CONFIG_FILE) return true;
  const path = join(dir, name);
  if (knownFolders.has(path)) return true;
  return stat(path).then(
    (found) => found.isDirectory(),
    () => false,
  );
}

/**
 * Watches each public folder on its own. A recursive watch would also walk node_modules
 * and dot folders, which can use up the watchers of the system.
 */
export class FolderWatcher {
  private watched = new Map<string, Watched>();
  private rootInode: number | null = null;
  private rootCheck: NodeJS.Timeout;

  constructor(
    private readonly root: string,
    private readonly onChange: () => void,
    private readonly onError: (path: string) => void,
  ) {
    // No event says that the root came back, or that a folder above it moved.
    this.rootCheck = setInterval(() => void this.checkRoot(), ROOT_CHECK_MS);
    this.rootCheck.unref();
  }

  /** Matches the watchers to the folders. Returns true when a new watcher started. */
  async sync(folders: string[]): Promise<boolean> {
    this.rootInode = await inodeOf(this.root);
    const wanted = new Set(folders);
    for (const [path, item] of this.watched) {
      if (!wanted.has(path)) this.unwatch(path, item);
    }
    let started = false;
    for (const path of folders) {
      const inode = await inodeOf(path);
      const item = this.watched.get(path);
      if (item?.inode === inode) continue;
      if (item) this.unwatch(path, item);
      if (inode !== null) started = this.start(path, inode) || started;
    }
    return started;
  }

  close(): void {
    clearInterval(this.rootCheck);
    for (const [path, item] of this.watched) this.unwatch(path, item);
  }

  private async checkRoot(): Promise<void> {
    if ((await inodeOf(this.root)) !== this.rootInode) this.onChange();
  }

  private start(path: string, inode: number): boolean {
    try {
      const watcher = watch(path, (event, name) => {
        const text = name?.toString() ?? null;
        if (event === 'rename' && text === basename(path)) {
          // The folder itself went away. A new folder can get the same inode, so never keep this watcher.
          this.unwatch(path, { watcher, inode });
          this.onChange();
          return;
        }
        void isSiteChange(path, text, this.watched).then((counts) => {
          if (counts) this.onChange();
        });
      });
      watcher.on('error', () => {
        this.unwatch(path, { watcher, inode });
        this.onChange();
      });
      this.watched.set(path, { watcher, inode });
      return true;
    } catch {
      this.onError(path);
      return false;
    }
  }

  private unwatch(path: string, item: Watched): void {
    item.watcher.close();
    if (this.watched.get(path)?.watcher === item.watcher) this.watched.delete(path);
  }
}

async function inodeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).ino;
  } catch {
    return null;
  }
}
