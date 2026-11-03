import type { ConfigProblem } from '../site/config.ts';
import type { TreeNode } from '../site/scan.ts';

/** Browser storage can throw or come back empty, and the panel works without it. */
export const PANEL_KEY = 'nerddocs-panel';
export const SHUT_KEY = 'nerddocs-shut';
export const SLIDER_KEY = 'nerddocs-slider';
const CONFIG_KEY = 'nerddocs-config-modal';
const SCROLL_KEY = 'nerddocs-panel-scroll';
export const PHONE = '(max-width:959px)';

export function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

export function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // The state then lasts until the page closes.
  }
}

export function remove(storage: () => Storage, key: string): void {
  try {
    storage().removeItem(key);
  } catch {
    // The state then lasts until the page closes.
  }
}

export const local = () => localStorage;
export const session = () => sessionStorage;

export function readPanelOff(): boolean {
  return read(local, PANEL_KEY) === 'off';
}

export function writePanelOff(off: boolean): void {
  write(local, PANEL_KEY, off ? 'off' : 'on');
}

export function readSliderOff(): boolean {
  return read(local, SLIDER_KEY) === 'off';
}

export function writeSliderOff(off: boolean): void {
  write(local, SLIDER_KEY, off ? 'off' : 'on');
}

export function readShut(): string[] {
  try {
    const list: unknown = JSON.parse(read(local, SHUT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function writeShut(shut: string[]): void {
  write(local, SHUT_KEY, JSON.stringify(shut));
}

export function readPanelScroll(): number {
  return Number(read(session, SCROLL_KEY)) || 0;
}

export function writePanelScroll(top: number): void {
  write(session, SCROLL_KEY, String(top));
}

export function readConfigDismissed(problem: ConfigProblem): boolean {
  return read(local, `${CONFIG_KEY}-${problem}`) === 'off';
}

export function writeConfigDismissed(problem: ConfigProblem, dismissed: boolean): void {
  write(local, `${CONFIG_KEY}-${problem}`, dismissed ? 'off' : 'on');
}

function findPath(nodes: TreeNode[], url: string): string[] | null {
  for (const node of nodes) {
    if (node.kind === 'page') {
      if (node.url === url) return [];
    } else {
      const inner = findPath(node.children, url);
      if (inner) return [node.id, ...inner];
    }
  }
  return null;
}

/** The ids of the sections around a page. They open, so the mark of the page shows. */
export function sectionsAround(tree: TreeNode[], url: string): string[] {
  return findPath(tree, url) ?? [];
}
