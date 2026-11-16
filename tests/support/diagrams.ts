import { createHash } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { MODE_KEY, THEME_KEY } from '../../src/page/theme-memory.ts';
import type { Mode } from '../../src/themes/types.ts';
import { THREE_LEVELS } from './levels.ts';
import { STEPS } from './page-content.ts';

/** The `accDescr` of `RESTORE_FLOW`. */
export const RESTORE_FLOW_DESCRIPTION = 'The reader picks a day, then a file, and gets the file back.';

/** The restore flowchart of the 'User flows' page of the backup app, named 'Restore a file' by its `accTitle`. */
export const RESTORE_FLOW = [
  'flowchart TD',
  '  accTitle: Restore a file',
  `  accDescr: ${RESTORE_FLOW_DESCRIPTION}`,
  '  A[Restore button] --> B{Pick a day}',
  '  B -->|Copy kept| C[Pick a file]',
  '  B -->|No copy| D[Show nearest day]',
  '  C --> E[(Storage server)]',
  '  E --> F[Restored file]',
].join('\n');

/** The sequence diagram 'Restore job' of the 'User flows' page. */
export const RESTORE_JOB = [
  'sequenceDiagram',
  '  participant Agent',
  '  participant Server',
  '  participant Storage',
  '  Agent->>Server: POST /restores',
  '  Server->>Storage: Pin the blocks of the copy',
  '  Storage-->>Server: Block list',
  '  Server-->>Agent: Job 4821, running',
  '  Agent->>Storage: Read the missing blocks',
  '  Agent->>Server: Job done',
].join('\n');

/** The pie 'Restores by day' of the 'User flows' page, with eight slices. */
export const RESTORES_BY_DAY = [
  'pie title Restores by day',
  '  "Today" : 42',
  '  "Yesterday" : 21',
  '  "This week" : 30',
  '  "Last week" : 14',
  '  "This month" : 11',
  '  "Last month" : 7',
  '  "This year" : 5',
  '  "Older" : 3',
].join('\n');

/** The flowchart 'Backup run' of the 'User flows' page: ten nodes in one row, wider than the text column. */
export const BACKUP_RUN = [
  'flowchart LR',
  '  A[Timer] --> B[Scan folders] --> C[Find changed files] --> D[Split into blocks] --> E[Skip known blocks] --> F[Encrypt] --> G[Upload] --> H[Write copy list] --> I[Close copy] --> J[Expire old copies]',
].join('\n');

/** A flowchart that Mermaid cannot read. Mermaid names its line 3, the arrow `-->>`. */
export const BROKEN_FLOW = 'flowchart TD\n  A[Restore button] --> B{Pick a day}\n  B -->> C[Restored file]\n  C --> D[Done]';

/** A flowchart whose node B the author colored. */
export const STYLED_FLOW = 'flowchart TD\n  A[Restore button] --> B[Restored file]\n  style B fill:#f96';

/** A mindmap, which needs the full build. */
export const RESTORE_MAP = 'mindmap\n  root((Restore))\n    Pick a file\n    Pick a day\n    Restored file';

/** An architecture diagram of the backup API, a group of two services, which needs the full build. */
export const BACKUP_SYSTEM = [
  'architecture-beta',
  '  group api(cloud)[Backup API]',
  '  service server(server)[Server] in api',
  '  service storage(disk)[Storage] in api',
  '  server:R --> L:storage',
].join('\n');

/** The smallest flowchart of the restore, of two nodes. */
export const SHORT_FLOW = 'flowchart TD\n  A[Restore button] --> B[Restored file]';

/** A Mermaid block as an author writes it. */
export const mermaidBlock = (source: string) => `\`\`\`mermaid\n${source}\n\`\`\``;

/** The 1-based number of each line of `text` that starts with ```` ```mermaid ````. */
export const mermaidFenceLines = (text: string) =>
  text.split(/\r\n?|\n/).flatMap((line, at) => (line.startsWith('```mermaid') ? [at + 1] : []));

/**
 * A page with a short flowchart at 'Internals' after a line of text, then a pie after the part. The fence lines of the
 * two blocks are lines 6 and 12 of the file.
 */
export const FLOWS_IN_PART = `# User flows\n\n::: internals\nText.\n\n${mermaidBlock(SHORT_FLOW)}\n:::\n\n${mermaidBlock('pie\n  "Today" : 42')}`;

/** The `data-dg` of a source: the first 12 hex digits of its sha1, without its last line break. */
export const hashOf = (source: string) => createHash('sha1').update(source.replace(/\n$/, '')).digest('hex').slice(0, 12);

/** The 'User flows' page of the backup app, with its four diagrams, and the pages that the diagram tests open. */
export const DIAGRAMS_SITE: Record<string, string> = {
  'nerddocs.json': THREE_LEVELS,
  'user-flows.md': [
    '# User flows',
    STEPS,
    '## Restore a file',
    mermaidBlock(RESTORE_FLOW),
    '::: internals\n## Restore job',
    `${mermaidBlock(RESTORE_JOB)}\n:::`,
    '## Restores by day',
    mermaidBlock(RESTORES_BY_DAY),
    STEPS,
    '## Backup run',
    mermaidBlock(BACKUP_RUN),
    STEPS,
  ].join('\n\n'),
  'broken-files.md': `# Broken files\n\n## Broken diagram\n\n${mermaidBlock(BROKEN_FLOW)}\n`,
  'restore-job.md': `# Restore job\n\nThe agent asks the server for a job.\n\n::: internals\n${mermaidBlock(RESTORE_JOB)}\n:::\n`,
  'long-flow.md': ['# Long flow', ...Array.from({ length: 6 }, () => STEPS), mermaidBlock(RESTORE_FLOW)].join('\n\n'),
  'flow-levels.md': [
    '# Flow levels',
    STEPS,
    `::: requirements internals\n${mermaidBlock(RESTORE_FLOW)}\n:::`,
    STEPS,
    STEPS,
  ].join('\n\n'),
  'flow-pair.md': [
    '# Flow pair',
    STEPS,
    `::: overview\n${mermaidBlock(RESTORE_FLOW)}\n::: requirements internals\n${mermaidBlock(BACKUP_RUN)}\n:::`,
    STEPS,
  ].join('\n\n'),
  'flow-guide.md': ['# Restore guide', STEPS, mermaidBlock(RESTORE_FLOW), STEPS, STEPS].join('\n\n'),
  'restore-map.md': `# Restore map\n\n${mermaidBlock(RESTORE_MAP)}\n`,
  'backup-system.md': `# Backup system\n\n${mermaidBlock(BACKUP_SYSTEM)}\n`,
  'styled-flow.md': `# Styled flow\n\n${mermaidBlock(STYLED_FLOW)}\n`,
  'restore-twice.md': `# Restore twice\n\n${mermaidBlock(RESTORE_FLOW)}\n\n${mermaidBlock(RESTORE_FLOW)}\n`,
  'schedules.md': '# Schedules\n\nA plan says how often.\n',
};

/** The box of the diagram of a source on the open page. Two boxes of one source share it. */
export const diagramBox = (page: Page, source: string) => page.locator(`#page .dg[data-dg="${hashOf(source)}"]`);

/** The drawing of a box. */
export const drawingOf = (box: Locator) => box.locator(':scope > .sbox > svg');

/** Waits until the box shows a drawing. */
export const expectDrawn = (box: Locator) => expect(box).toHaveAttribute('data-state', 'drawn');

/** The name of each Mermaid build that the page asked for, in order, as `mermaid.js` or `mermaid-full.js`. */
export function recordBuilds(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    const name = pathname.slice(pathname.lastIndexOf('/') + 1);
    if (pathname.includes('/__nerddocs/') && (name === 'mermaid.js' || name === 'mermaid-full.js')) asked.push(name);
  });
  return asked;
}

/** Holds each request of a Mermaid build while the gate is shut. The gate starts shut. */
export interface BuildGate {
  /** Shuts the gate for the requests that come next. */
  hold(): void;
  /** Lets each held request and each later one go. */
  release(): void;
}

/** Holds the Mermaid builds of the page until `release` runs. */
export async function holdBuilds(page: Page): Promise<BuildGate> {
  let open = () => {};
  let gate = Promise.resolve();
  const builds = (url: URL) => /\/__nerddocs\/mermaid(-full)?\.js$/.test(url.pathname);
  await page.route(builds, async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  const shut: BuildGate = {
    hold() {
      gate = new Promise((resolve) => (open = resolve));
    },
    release: () => open(),
  };
  shut.hold();
  return shut;
}

/** Stores a theme and a look for the pages of the test, unless the page has stored others since. */
export async function storeLook(page: Page, theme: string, mode: Mode): Promise<void> {
  await page.addInitScript(
    ([themeKey, modeKey, id, look]) => {
      if (localStorage.getItem(themeKey) === null) localStorage.setItem(themeKey, id);
      if (localStorage.getItem(modeKey) === null) localStorage.setItem(modeKey, look);
    },
    [THEME_KEY, MODE_KEY, theme, mode] as const,
  );
}

/** Picks a theme and a look in the theme box, and applies them. */
export async function applyLook(page: Page, theme: string, mode: Mode): Promise<void> {
  await page.locator('#thmB').click();
  await page.locator(`#theme-opt-${theme}`).click();
  await page.locator(`#theme-mode [data-look="${mode}"]`).click();
  await page.locator('#theme-apply').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
}

/** Gives the drawing of a box a JS property, so that a test can tell the same node from a new one. */
export const markDrawing = (box: Locator) =>
  drawingOf(box).evaluate((svg) => {
    (svg as unknown as { kept: boolean }).kept = true;
  });

/** True when the element carries the JS property of `markDrawing`. */
export const isMarked = (element: Locator) => element.evaluate((node) => (node as unknown as { kept?: boolean }).kept === true);
