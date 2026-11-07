import type { Dimension } from '../../src/site/config.ts';
import type { TreeNode } from '../../src/site/scan.ts';

// This file imports nothing from tests/support, so page.ts can import it, and it writes the levels of THREE_LEVELS again.
const LEVELS = [
  { id: 'overview', name: 'Overview', icon: 'eye' },
  { id: 'requirements', name: 'Requirements', icon: 'list' },
  { id: 'internals', name: 'Internals', icon: 'cpu' },
];

/** The levels of the backup app, with the given dimensions, or with no `dimensions` key when none are given. */
export const dimensionsConfig = (dimensions?: unknown[]) =>
  JSON.stringify({ levels: LEVELS, defaultLevel: 'overview', ...(dimensions ? { dimensions } : {}) });

export const DIMENSIONS_CONFIG = dimensionsConfig([
  { folder: 'user-guide' },
  { folder: 'administration' },
  { folder: 'legal', name: 'Legal and privacy' },
]);

export const DIMENSION_PAGES = {
  'user-guide/index.md': '# Get started\n\nThe backup app keeps a copy of each file.\n',
  'user-guide/backups/01-restore.md':
    '# Restore a file\n\n::: overview\nPick a file and a day.\n::: internals\nA restore is a job on the storage server.\n:::\n',
  'user-guide/backups/02-schedules.md': '# Schedules\n\nA plan says how often.\n',
  'administration/01-install.md': '# Install the server\n\nRun the installer on the storage server.\n',
  'administration/02-users.md': '# Users\n\nEach user has a role.\n',
  'legal/01-privacy.md': '# Privacy\n\nYour files stay on your own server.\n',
};

/** A page and a folder of pages outside every dimension, and a folder with no page. */
export const OUTSIDE_FILES = {
  'README.md': '# Backup app\n\nThe docs of the backup app.\n',
  'drafts/plan.md': '# Draft plan\n\n::: testers\nA plan.\n:::\n\n![Plan](plan.png)\n',
  'drafts/old/notes.md': '# Old notes\n',
  'images/restore-window.svg':
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40"/></svg>',
};

export const DIMENSION_SITE = { 'nerddocs.json': DIMENSIONS_CONFIG, ...DIMENSION_PAGES, ...OUTSIDE_FILES };

export const RESTORE = '/user-guide/backups/restore.html';

export const DIMENSIONS: Dimension[] = [
  { folder: 'user-guide', name: 'User guide' },
  { folder: 'administration', name: 'Administration' },
  { folder: 'legal', name: 'Legal and privacy' },
];

/** The tree that a scan of `DIMENSION_SITE` gives. */
export const DIMENSION_TREE: TreeNode[] = [
  {
    kind: 'section',
    id: 'user-guide',
    title: 'User guide',
    children: [
      { kind: 'page', url: '/user-guide/index.html', title: 'Get started' },
      {
        kind: 'section',
        id: 'user-guide/backups',
        title: 'Backups',
        children: [
          { kind: 'page', url: '/user-guide/backups/restore.html', title: 'Restore a file' },
          { kind: 'page', url: '/user-guide/backups/schedules.html', title: 'Schedules' },
        ],
      },
    ],
  },
  {
    kind: 'section',
    id: 'administration',
    title: 'Administration',
    children: [
      { kind: 'page', url: '/administration/install.html', title: 'Install the server' },
      { kind: 'page', url: '/administration/users.html', title: 'Users' },
    ],
  },
  {
    kind: 'section',
    id: 'legal',
    title: 'Legal',
    children: [{ kind: 'page', url: '/legal/privacy.html', title: 'Privacy' }],
  },
];
