import { expect, test } from '@playwright/test';
import type { TreeNode } from '../../src/site/scan.ts';
import {
  PANEL_KEY,
  readPanelOff,
  readPanelScroll,
  readSliderOff,
  readShut,
  sectionsAround,
  SHUT_KEY,
  SLIDER_KEY,
  writePanelOff,
  writePanelScroll,
  writeSliderOff,
  writeShut,
} from '../../src/page/panel-state.ts';

function fakeStorage(items = new Map<string, string>()): Storage {
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  } as Storage;
}

const blockedStorage = {
  getItem() {
    throw new Error('The browser blocks storage.');
  },
  setItem() {
    throw new Error('The browser blocks storage.');
  },
} as unknown as Storage;

function useStorage(storage: Storage): void {
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(globalThis, name, { value: storage, configurable: true });
  }
}

test.afterEach(() => {
  for (const name of ['localStorage', 'sessionStorage']) {
    Reflect.deleteProperty(globalThis, name);
  }
});

test('a hidden panel stays hidden on the next page, and a shown panel stays shown', () => {
  useStorage(fakeStorage());
  expect(readPanelOff()).toBe(false);
  writePanelOff(true);
  expect(readPanelOff()).toBe(true);
  writePanelOff(false);
  expect(readPanelOff()).toBe(false);
});

test('closed sections stay closed on the next page', () => {
  useStorage(fakeStorage());
  expect(readShut()).toEqual([]);
  writeShut(['backups', 'backups/plans']);
  expect(readShut()).toEqual(['backups', 'backups/plans']);
});

test('the scroll of the panel stays on the next page', () => {
  useStorage(fakeStorage());
  expect(readPanelScroll()).toBe(0);
  writePanelScroll(320);
  expect(readPanelScroll()).toBe(320);
});

test('a new tab opens with the panel at the top, wherever another tab left it', () => {
  const shared = fakeStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: shared, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: fakeStorage(), configurable: true });
  writePanelScroll(320);
  expect(readPanelScroll()).toBe(320);

  // A new tab shares the local storage of the site, with a session storage of its own.
  Object.defineProperty(globalThis, 'sessionStorage', { value: fakeStorage(), configurable: true });
  expect(readPanelScroll()).toBe(0);
});

test('broken stored state leaves the panel open at the top', () => {
  useStorage(
    fakeStorage(
      new Map([
        [PANEL_KEY, 'broken'],
        [SHUT_KEY, '{not json'],
        ['nerddocs-panel-scroll', 'broken'],
      ]),
    ),
  );
  expect(readPanelOff()).toBe(false);
  expect(readShut()).toEqual([]);
  expect(readPanelScroll()).toBe(0);
});

test('stored sections keep only section names', () => {
  useStorage(fakeStorage(new Map([[SHUT_KEY, '["backups", 42, null]']])));
  expect(readShut()).toEqual(['backups']);
  useStorage(fakeStorage(new Map([[SHUT_KEY, '{"backups":true}']])));
  expect(readShut()).toEqual([]);
});

test('a browser that blocks storage leaves the panel open and takes each change', () => {
  useStorage(blockedStorage);
  writePanelOff(true);
  writeShut(['backups']);
  writePanelScroll(320);
  expect(readPanelOff()).toBe(false);
  expect(readShut()).toEqual([]);
  expect(readPanelScroll()).toBe(0);
});

const tree: TreeNode[] = [
  { kind: 'page', url: '/README.html', title: 'Backup app' },
  {
    kind: 'section',
    id: 'backups',
    title: 'Backups',
    children: [
      { kind: 'page', url: '/backups/restore.html', title: 'Restore a file' },
      {
        kind: 'section',
        id: 'backups/plans',
        title: 'Plans',
        children: [{ kind: 'page', url: '/backups/plans/team.html', title: 'Team plan' }],
      },
    ],
  },
  {
    kind: 'section',
    id: 'agents',
    title: 'Agents',
    children: [{ kind: 'page', url: '/agents/install.html', title: 'Install the agent' }],
  },
];

test('the sections around the current page are known, so they can open', () => {
  expect(sectionsAround(tree, '/backups/plans/team.html')).toEqual(['backups', 'backups/plans']);
  expect(sectionsAround(tree, '/backups/restore.html')).toEqual(['backups']);
  expect(sectionsAround(tree, '/agents/install.html')).toEqual(['agents']);
});

test('a page at the top, or an address with no page, opens no section', () => {
  expect(sectionsAround(tree, '/README.html')).toEqual([]);
  expect(sectionsAround(tree, '/upgrade.html')).toEqual([]);
});

test('the slider panel state lasts in storage, apart from the contents panel', () => {
  const items = new Map<string, string>();
  useStorage(fakeStorage(items));
  expect(readSliderOff()).toBe(false);
  writeSliderOff(true);
  expect(items.get(SLIDER_KEY)).toBe('off');
  expect(readSliderOff()).toBe(true);
  expect(readPanelOff()).toBe(false);
  writeSliderOff(false);
  expect(readSliderOff()).toBe(false);
});

test('with blocked storage, the slider panel shows and a change does not throw', () => {
  useStorage(blockedStorage);
  expect(readSliderOff()).toBe(false);
  expect(() => writeSliderOff(true)).not.toThrow();
});
