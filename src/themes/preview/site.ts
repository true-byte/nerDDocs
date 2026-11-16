/**
 * The sample site of the theme preview: the files of a docs folder, as text. Its page 'Restore a file' shows most
 * elements of a page, so each theme shows on the same text. A theme never changes these files.
 */

/** The name of the sample site, at the top of the contents panel. */
export const SAMPLE_NAME = 'Backup app';

/** The address of the page that the preview shows. */
export const SAMPLE_PAGE = '/backups/restore.html';

const CONFIG = {
  levels: [
    { id: 'overview', name: 'Overview', icon: 'eye' },
    { id: 'requirements', name: 'Requirements', icon: 'list' },
    { id: 'internals', name: 'Internals', icon: 'cpu' },
  ],
  defaultLevel: 'requirements',
};

const RESTORE = `# Restore a file

::: overview
Pick a file and a day, and the app puts that copy back.
::: requirements
The app restores any file from any day that it still keeps a copy of. A restore **never changes** the copy in storage.
::: internals
A restore is a job on the storage server. The agent asks for the job, and the server sends the blocks back.
:::

## Pick a file

::: overview
Open the Restore window, type a part of the file name, and click the file.
::: requirements internals
**REQ-1.1** The Restore window opens with \`Ctrl+R\` from any screen. The search finds a file by any part of its name, as [Schedules](schedules.md) keeps it.

- The list shows each file once, with its folder.
- A file that the user cannot read does not show.
:::

### Pick a day

::: overview
Click a day on the calendar. A day with a copy has a dot.
::: requirements internals
| Plan | Days kept | Copies a day |
|---|---|---|
| Team | 14 | 4 |
| Office | 30 | 24 |
:::

\`\`\`sh
curl -X POST /restores -d '{"file":"report.xlsx"}'
\`\`\`

> A restore never deletes the file that sits in the folder now.
`;

/** Each file of the sample site, by its path in the docs folder. */
export const SAMPLE_FILES: Readonly<Record<string, string>> = {
  'nerddocs.json': JSON.stringify(CONFIG),
  'README.md': '# Backup app\n\nThe app keeps copies of your files.\n',
  'backups/restore.md': RESTORE,
  'backups/schedules.md': '# Schedules\n\nA plan says how often the app makes a copy.\n',
  'backups/storage.md': '# Storage\n\nThe app keeps copies on a local disk, on a network share, or in S3.\n',
  'agents/install.md': '# Install the agent\n\nThe agent runs on each computer that the app backs up.\n',
  'agents/logs.md': '# Agent logs\n\nEach agent writes one log a day.\n',
};
