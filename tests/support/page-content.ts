import type { Page } from '@playwright/test';
import { THREE_LEVELS } from './levels.ts';

/** Twelve short paragraphs, so a section is taller than a window. */
export const STEPS = Array.from({ length: 12 }, (_, n) => `Step ${n + 1} of the restore.`).join('\n\n');

/**
 * The page 'Restore a file' of the backup app. Its outline rows are 'Pick a file', 'Search index' at 'Internals',
 * 'Pick a day', 'The copy rule' at 'Internals' and 'Check the result'.
 */
export const RESTORE_PAGE = `# Restore a file

::: overview
Pick a file and a day, and the app puts that copy back.
::: requirements internals
The app restores any file from any day that it still keeps a copy of.
:::

## Pick a file

${STEPS}

::: internals
### Search index

${STEPS}
:::

## Pick a day

${STEPS}

::: internals
### The copy rule

${STEPS}
:::

## Check the result

${STEPS}

<details>
<summary>Old restores</summary>

## Restore from tape

A restore from tape asks an admin.

</details>

#### Index size

The index takes about 40 bytes for each file.

${STEPS}

${STEPS}
`;

const twoDigits = (n: number) => String(n).padStart(2, '0');

/** Pages around 'backups/restore.md' in the tree. The rows after 'Restore a file' fill more than a phone window. */
export const LONG_TREE: Record<string, string> = Object.fromEntries([
  ...Array.from({ length: 20 }, (_, n) => [`archive/plan-${twoDigits(n + 1)}.md`, `# Old plan ${n + 1}`]),
  ...Array.from({ length: 40 }, (_, n) => [`storage/disk-${twoDigits(n + 1)}.md`, `# Disk ${n + 1}`]),
]);

/** The table of the 'Schedules' page under 'All plan settings': 10 columns, with short and long cells. */
export const ALL_PLAN_SETTINGS = `| Plan | Runs | Start | Delay | Copies kept | Days | Storage | Encryption | Bandwidth limit | Owner |
|---|---|---|---|---|---|---|---|---|---|
| Basic | Daily | 02:00 | up to 10 minutes | 14 | 14 | Local disk | AES-256 | none | Each user |
| Team | Every 6 hours | 00:00 | up to 10 minutes | 120 | 30 | Local disk and S3 | AES-256 with a team key | 50 MB/s | The team admin |
| Archive | Weekly | Sunday 03:00 | up to 1 hour | 52 | 365 | S3 Glacier | AES-256 with a company key | 10 MB/s | The backup admin |`;

/** The page 'Schedules' of the backup app: a plans table above every heading, 'All plan settings' and 'Plan rules'. */
export const SCHEDULES_PAGE = `# Schedules

A plan says how often the app makes a copy and how long it keeps it.

| Plan | Runs | Copies kept | Days | Storage |
|---|---|---|---|---|
| Basic | Daily | 14 | 14 | Local disk |
| Team | Every 6 hours | 120 | 30 | Local disk and S3 |
| Archive | Weekly | 52 | 365 | S3 Glacier |

## All plan settings

${ALL_PLAN_SETTINGS}

## Plan rules

::: requirements internals
| Rule | What it says |
|---|---|
| \`PLAN-1\` | A plan runs at its start time plus a random delay, so a thousand computers do not start at the same second, and the storage server never sees a burst of new jobs. |
| \`PLAN-2\` | A copy past its days goes away, oldest first, and each block that a newer copy still uses stays. |
:::

::: overview
Each plan keeps its copies for a set number of days.
:::

## Weekly plan

A weekly plan runs on Sunday.
`;

/** A table whose first column holds code that never breaks, so the column is too wide to pin. */
export const COMMANDS_TABLE = `| Command | Plan | Days | Storage |
|---|---|---|---|
| \`restore --from monday --to tuesday\` | Team | 30 | Local disk and S3 |`;

/** A page whose wide table shows only at 'Requirements' and 'Internals'. */
export const SETTINGS_PAGE = `# Plan settings

Each plan has its own settings.

::: overview
A plan keeps copies for a set number of days.
::: requirements internals
${ALL_PLAN_SETTINGS}
:::
`;

/** The levels of the backup app, opening at 'Requirements'. */
export const REQUIREMENTS_FIRST = JSON.stringify({ ...JSON.parse(THREE_LEVELS), defaultLevel: 'requirements' });

/** 'Restore a file' among many pages, at three levels. */
export const OUTLINE_SITE: Record<string, string> = {
  'nerddocs.json': THREE_LEVELS,
  'backups/restore.md': RESTORE_PAGE,
  ...LONG_TREE,
};

/** 'Schedules' with a table of commands at its end, opening at 'Requirements', so 'Plan rules' shows. */
export const SCHEDULES_SITE: Record<string, string> = {
  'nerddocs.json': REQUIREMENTS_FIRST,
  'backups/schedules.md': `${SCHEDULES_PAGE}\n\n## Restore commands\n\n${COMMANDS_TABLE}\n`,
};

/** The 'Architecture' diagram of the backup app: four lines of 51 code points, with the arrows '▶' and '◀'. */
export const ARCHITECTURE_DIAGRAM = [
  '┌──────────────┐    copy list    ┌────────────────┐',
  '│ Backup agent │ ──────────────▶ │ Storage server │',
  '│  on the PC   │ ◀────────────── │  keeps copies  │',
  '└──────────────┘   file blocks   └────────────────┘',
].join('\n');

/** The page 'Architecture': a paragraph, the diagram in a fence with no word, and a paragraph after it. */
export const ARCHITECTURE_PAGE = `# Architecture\n\nThe backup agent on each computer sends file blocks to the storage server.\n\n\`\`\`\n${ARCHITECTURE_DIAGRAM}\n\`\`\`\n\nThe agent sends a copy list, and the server answers with file blocks.\n`;

/** The 'Inside the storage server' diagram of the backup app: ten lines of 61 code points, with the arrow '▶'. */
export const STORAGE_DIAGRAM = [
  '┌───────────────────────────────────────────────────────────┐',
  '│ Storage server                                            │',
  '│ ┌────────────┐   ┌──────────────┐   ┌───────────────────┐ │',
  '│ │ Job queue  ├──▶│ Block index  ├──▶│ S3 or local disk  │ │',
  '│ └─────┬──────┘   └──────┬───────┘   └───────────────────┘ │',
  '│       │                 │                                 │',
  '│ ╔═════╧══════╗   ╔══════╧═══════╗                         │',
  '│ ║ Scheduler  ║   ║ Expiry sweep ║                         │',
  '│ ╚════════════╝   ╚══════════════╝                         │',
  '└───────────────────────────────────────────────────────────┘',
].join('\n');

/** The page 'Inside the storage server': a paragraph and the diagram in a fence with no word. */
export const STORAGE_PAGE = `# Inside the storage server\n\nThe storage server queues each job and keeps an index of the blocks.\n\n\`\`\`\n${STORAGE_DIAGRAM}\n\`\`\`\n`;

/**
 * The page 'Restore by script' of the backup app: a \`sh\` block, a \`ts\` block at 'Internals', a \`json\` block, and under
 * 'Change the schedule' a \`diff\`, a \`yaml\`, a \`python\`, a long \`sh\` line and a \`weirdlang\` block.
 */
export const RESTORE_SCRIPT_PAGE = `# Restore by script

A script restores a file from any day the app still keeps a copy of.

\`\`\`sh
# Restore one file from yesterday
curl -X POST https://backup.example.com/restores \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{"file": "/home/ana/report.pdf", "day": "2026-11-01", "target": "original"}'
\`\`\`

::: internals
The restore runs as a job on the storage server.

\`\`\`ts
export async function restore(file: string, day: Date): Promise<Job> {
  const copy = await storage.closestCopy(file, day); // newest closed copy of that day
  if (!copy) throw new Error(\`No copy of \${file} on \${day.toISOString()}\`);
  return jobs.start({ kind: 'restore', copy, retries: 3 });
}
\`\`\`
:::

The server answers with the job:

\`\`\`json
{ "id": "job-4821", "state": "running", "file": "/home/ana/report.pdf", "progress": 0.42 }
\`\`\`

## Change the schedule

\`\`\`diff
- schedule: every 6h
+ schedule: every 1h
\`\`\`

\`\`\`yaml
plan: daily
keep: 30   # days
storage: s3://backups/main
\`\`\`

\`\`\`python
def closest_copy(copies, day):
    """Newest closed copy on or before the day."""
    return max((c for c in copies if c.day <= day and c.closed), key=lambda c: c.day, default=None)
\`\`\`

\`\`\`sh
nerddocs-restore --file /home/ana/report.pdf --day 2026-11-01 --target original --keep-both --log /var/log/backup/restore-job-4821.log --notify ana@example.com
\`\`\`

\`\`\`weirdlang
some text in a language that does not ship
\`\`\`
`;

/** The code of the first block of 'Restore by script'. */
export const CURL_TEXT = [
  '# Restore one file from yesterday',
  'curl -X POST https://backup.example.com/restores \\',
  '  -H "Authorization: Bearer $TOKEN" \\',
  `  -d '{"file": "/home/ana/report.pdf", "day": "2026-11-01", "target": "original"}'`,
].join('\n');

/** The code of the \`json\` block of 'Restore by script'. */
export const JOB_JSON = '{ "id": "job-4821", "state": "running", "file": "/home/ana/report.pdf", "progress": 0.42 }';

/** The one line of the long \`sh\` block of 'Restore by script', wider than a phone. */
export const LONG_SH =
  'nerddocs-restore --file /home/ana/report.pdf --day 2026-11-01 --target original --keep-both --log /var/log/backup/restore-job-4821.log --notify ana@example.com';

/** 'Restore by script', 'Architecture' and 'Inside the storage server', at three levels. */
export const CODE_SITE: Record<string, string> = {
  'nerddocs.json': THREE_LEVELS,
  'backups/restore-by-script.md': RESTORE_SCRIPT_PAGE,
  'backups/architecture.md': ARCHITECTURE_PAGE,
  'backups/storage-server.md': STORAGE_PAGE,
};

/** Gives the page a clipboard whose \`writeText\` keeps each text in \`window.copied\` and resolves. */
export async function recordCopies(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = window as unknown as { copied: string[] };
    record.copied = [];
    const clipboard = {
      writeText: (text: string) => {
        record.copied.push(text);
        return Promise.resolve();
      },
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => clipboard });
  });
}

/** The texts that the page copied, in order. */
export const copiedTexts = (page: Page) => page.evaluate(() => (window as unknown as { copied?: string[] }).copied ?? []);
