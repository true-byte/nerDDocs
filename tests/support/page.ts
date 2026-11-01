import { test as base, type Page } from '@playwright/test';
import { runCommand, type RunningCommand } from './run-command.ts';

export const BACKUP_SITE = {
  'README.md': '# Backup app\n\nThe app keeps copies of your files. See [Storage](storage.md).',
  'backups/restore.md':
    '# Restore a file\n\nPick a file and a day.\n\n[Schedules](schedules.md) and [Storage](../storage.md#blocks).\n\n![Restore window](../images/restore-window.svg)',
  'backups/schedules.md': '# Schedules\n\nA plan says how often.\n\n## Weekly plan\n\nA weekly plan runs on Sunday.',
  'backups/plans/team.md': '# Team plan\n\nEvery 6 hours.',
  'storage.md': `# Storage\n\n${'Blocks are stored once.\n\n'.repeat(40)}## Blocks\n\nA block.`,
  'images/restore-window.svg':
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40"/></svg>',
  'images/wide-window.svg':
    '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="40"><rect width="3000" height="40"/></svg>',
  '.drafts/plan.md': '# Draft plan',
  'restore-checklist.md': `# Restore checklist

> Check the day before you restore.

\`\`\`
restore --from monday
\`\`\`

| Plan | Days |
|---|---|
| Team | 14 |

Keep a copy.[^1]

[^1]: A copy on another disk.

![Wide window](images/wide-window.svg)
`,
  'long-names.md': `# ${'Restoreeveryfile'.repeat(8)}

See https://backups.example/${'restore'.repeat(30)} and \`${'BACKUP_AGENT_'.repeat(20)}\` and ${'snapshot'.repeat(25)}.

## ${'Schedule'.repeat(26)}

\`\`\`
${'restore --from '.repeat(30)}
\`\`\`

| Plan | Days | Storage |
|:---|---:|:-:|
| Team | 14 | Local |
`,
};

export interface PageFixtures {
  /** Starts a command on a folder of its own, for a test that changes its files. It stops with the test. */
  ownSite: (files: Record<string, string>) => Promise<RunningCommand>;
}

export interface SharedFixtures {
  /** One command on `BACKUP_SITE` for all the tests of a worker. Its files never change. */
  site: RunningCommand;
}

export const test = base.extend<PageFixtures, SharedFixtures>({
  site: [
    async ({}, use) => {
      const run = await runCommand(BACKUP_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
  ownSite: async ({}, use) => {
    const runs: RunningCommand[] = [];
    await use(async (files) => {
      const run = await runCommand(files);
      runs.push(run);
      return run;
    });
    await Promise.all(runs.map((run) => run.stop()));
  },
});

export async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Object.keys(document.querySelector('#closeP') ?? {}).some((key) => key.startsWith('__react')),
  );
}

export const panel = (page: Page) => page.locator('#panel');
export const rowOf = (page: Page, name: string) => panel(page).getByRole('link', { name, exact: true });
