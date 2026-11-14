import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { folderWith } from '../support/folder.ts';
import { SKILL } from '../support/skill.ts';

const SCRIPT = join(SKILL, 'scripts/progress.mjs');

interface Count {
  done: number;
  total: number;
}

/** What `readProgress` gives. The tests read 'Next' and the section lines through `formatProgress`, whose lines the contract fixes. */
interface Progress {
  pages: Count;
  clashes: Count;
  fill: Count;
}

interface ProgressScript {
  readProgress(folder: string): Progress | Promise<Progress>;
  formatProgress(result: Progress): string;
}

/** The script is plain JavaScript in the skill folder, which the type check does not read, so its types are the ones above. */
const progressScript = () => import(pathToFileURL(SCRIPT).href) as Promise<ProgressScript>;

/** A new work folder `nerddocs-work` that holds the files, and the folder that holds it. */
async function workFolder(files: Record<string, string>) {
  const app = await folderWith(Object.fromEntries(Object.entries(files).map(([name, text]) => [`nerddocs-work/${name}`, text])));
  return { app, work: join(app, 'nerddocs-work') };
}

/** The lines that `formatProgress` gives for the work folder. */
async function progressLines(files: Record<string, string>): Promise<string[]> {
  const { readProgress, formatProgress } = await progressScript();
  const { work } = await workFolder(files);
  return formatProgress(await readProgress(work)).trimEnd().split('\n');
}

/** Runs the script in `cwd` with the arguments, and gives its exit code, its standard output and all that it printed once it stops. */
function runScript(cwd: string, args: string[] = []): Promise<{ code: number | null; stdout: string; output: string }> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', fail);
    child.on('close', (code) => done({ code, stdout, output }));
  });
}

/** The text with `from` changed to `to`. A test that changes a line the text lacks fails here. */
function changed(text: string, from: string, to: string): string {
  expect(text, `the line to change: ${from}`).toContain(from);
  return text.replace(from, to);
}

const MOVE = `# Move of old-docs/ into docs/

To go on, run the progress script and do the item that it prints after 'Next:'.

## Steps

- [x] Read the old files
- [x] Plan the pages
- [x] The author says yes to the plan
- [ ] Move the pages
- [ ] Check the docs
- [ ] Find the clashes
- [ ] Ask about each clash
- [ ] Write the report

## Pages

### Batch 1

- [x] P001 docs/01-install.md 'Install the agent'
  - S0004 overview
  - S0016 internals
- [ ] P002 docs/02-restore.md 'Restore a file'
  - S0005 overview
  - S0006 overview requirements

## Left out

- S0001 left out: Says what the old doc is.
`;

/** The sections of the old files, each named by a page or a left-out line of `MOVE`. */
const SECTIONS = {
  'sections/01.md': `# old-docs/overview.md

- S0001 old-docs/overview.md:1-3 'Backup app' 12 words
- S0004 old-docs/overview.md:4-20 'Install the agent' 96 words
- S0005 old-docs/overview.md:21-34 'Restore a file' 70 words
`,
  'sections/02.md': `# old-docs/requirements.md

- S0006 old-docs/requirements.md:15-40 'Restore' 140 words

# old-docs/restore-design.md

- S0016 old-docs/restore-design.md:1-30 'Agent install' 160 words
`,
};

/** A third page that also takes the section S0006 of P002. */
const P003 = `- [ ] P003 docs/03-schedules.md 'Schedules'
  - S0006 internals
`;

test('a move prints the first unchecked page item as next, then the counts', async () => {
  const { readProgress, formatProgress } = await progressScript();
  const { work } = await workFolder({ 'progress.md': MOVE, ...SECTIONS });
  const result = await readProgress(work);
  expect(Object.keys(result)).toEqual(expect.arrayContaining(['clashes', 'double', 'fill', 'next', 'pages', 'unplaced']));
  expect([result.pages, result.clashes, result.fill]).toEqual([
    { done: 1, total: 2 },
    { done: 0, total: 0 },
    { done: 0, total: 0 },
  ]);
  expect(formatProgress(result).trimEnd().split('\n')).toEqual([
    "Next: - [ ] P002 docs/02-restore.md 'Restore a file'",
    'Pages: 1 of 2',
    'Clashes: 0 of 0',
    'Fill: 0 of 0',
  ]);
});

test('the step Move the pages is next once each page item is checked', async () => {
  const done = changed(MOVE, "- [ ] P002 docs/02-restore.md 'Restore a file'", "- [x] P002 docs/02-restore.md 'Restore a file'");
  const lines = await progressLines({ 'progress.md': done, ...SECTIONS });
  expect(lines.slice(0, 2)).toEqual(['Next: - [ ] Move the pages', 'Pages: 2 of 2']);
});

test('an unchecked step before Move the pages is next, even while a page item is unchecked', async () => {
  const unplanned = changed(MOVE, '- [x] The author says yes to the plan', '- [ ] The author says yes to the plan');
  const lines = await progressLines({ 'progress.md': unplanned, ...SECTIONS });
  expect(lines[0]).toBe('Next: - [ ] The author says yes to the plan');
});

test('with each item checked, next is none', async () => {
  const lines = await progressLines({ 'progress.md': MOVE.replaceAll('- [ ]', '- [x]'), ...SECTIONS });
  expect(lines).toEqual(['Next: none', 'Pages: 2 of 2', 'Clashes: 0 of 0', 'Fill: 0 of 0']);
});

test('a fill counts its fill items, and its first unchecked fill item is next', async () => {
  const fill = `# Fill of docs/

## Fill

- [x] Find the empty levels

### Batch 1

- [x] F001 docs/03-schedules.md internals
- [ ] F002 docs/04-encryption.md overview
- [ ] F003 docs/04-encryption.md internals

- [ ] Write the report
`;
  const lines = await progressLines({ 'progress.md': fill });
  expect(lines).toEqual([
    'Next: - [ ] F002 docs/04-encryption.md overview',
    'Pages: 0 of 0',
    'Clashes: 0 of 0',
    'Fill: 1 of 3',
  ]);
});

test('the clash items of clashes.md count, and next stays an item of progress.md', async () => {
  const clashing = MOVE.replace(/- \[ \] P002/, '- [x] P002').replace(/- \[ \] (Move|Check|Find)/g, '- [x] $1');
  const clashes = `# Clashes

- [x] C01 Copies kept
  - docs/01-install.md 'Keeps 14 copies' old-docs/overview.md:8
  - docs/02-restore.md 'Keeps 30 copies' old-docs/requirements.md:22
- [ ] C02 Restore days
`;
  const lines = await progressLines({ 'progress.md': clashing, 'clashes.md': clashes, ...SECTIONS });
  expect(lines).toEqual(['Next: - [ ] Ask about each clash', 'Pages: 2 of 2', 'Clashes: 1 of 2', 'Fill: 0 of 0']);
});

test('each section that no page and no left-out line names prints as unplaced, in the order of its sections file', async () => {
  const sections = {
    ...SECTIONS,
    'sections/02.md': `${SECTIONS['sections/02.md']}- S0019 old-docs/requirements.md:41-52 'Limits' 40 words
- S0020 old-docs/specs/requirements.docx#REQ-2.1 'Restore days' 30 words
`,
  };
  const lines = await progressLines({ 'progress.md': MOVE, ...sections });
  expect(lines.slice(4)).toEqual([
    'Unplaced section: S0019 old-docs/requirements.md:41-52',
    'Unplaced section: S0020 old-docs/specs/requirements.docx#REQ-2.1',
  ]);
});

test('a section of each sections file counts, so one left out of a later file prints as unplaced', async () => {
  const sections = { ...SECTIONS, 'sections/03.md': "- S0030 old-docs/faq.md:1-9 'Questions' 50 words\n" };
  const lines = await progressLines({ 'progress.md': MOVE, ...sections });
  expect(lines.slice(4)).toEqual(['Unplaced section: S0030 old-docs/faq.md:1-9']);
});

test('a section that two page items name prints as double, with the ids of both pages', async () => {
  const lines = await progressLines({ 'progress.md': changed(MOVE, '\n## Left out', `${P003}\n## Left out`), ...SECTIONS });
  expect(lines).toEqual([
    "Next: - [ ] P002 docs/02-restore.md 'Restore a file'",
    'Pages: 1 of 3',
    'Clashes: 0 of 0',
    'Fill: 0 of 0',
    'Double section: S0006 P002 P003',
  ]);
});

test('a section that a page item and a left-out line both name prints as double, with the id of the page', async () => {
  const leftOut = changed(MOVE, '- S0001 left out:', '- S0004 left out: Repeats the install page.\n- S0001 left out:');
  const lines = await progressLines({ 'progress.md': leftOut, ...SECTIONS });
  expect(lines.slice(4)).toHaveLength(1);
  expect(lines[4]).toMatch(/^Double section: S0004 P001\b/);
});

test('the unplaced sections print before the double sections', async () => {
  const sections = { ...SECTIONS, 'sections/03.md': "- S0019 old-docs/requirements.md:3-14 'Scope' 40 words\n" };
  const lines = await progressLines({ 'progress.md': changed(MOVE, '\n## Left out', `${P003}\n## Left out`), ...sections });
  expect(lines.slice(4)).toEqual(['Unplaced section: S0019 old-docs/requirements.md:3-14', 'Double section: S0006 P002 P003']);
});

/** A second section line with the id S0005, which `sections/01.md` already carries. */
const SECOND_S0005 = "- S0005 old-docs/restore-design.md:31-44 'Restore a file' 70 words\n";

test('a section id that two sections files carry prints as a duplicate, with both sections files', async () => {
  const sections = { ...SECTIONS, 'sections/02.md': `${SECTIONS['sections/02.md']}${SECOND_S0005}` };
  const lines = await progressLines({ 'progress.md': MOVE, ...sections });
  expect(lines.slice(4)).toEqual(['Duplicate section id: S0005 sections/01.md sections/02.md']);
});

test('a section id that one sections file carries twice prints as a duplicate, with that file named twice', async () => {
  const sections = { ...SECTIONS, 'sections/01.md': `${SECTIONS['sections/01.md']}${SECOND_S0005}` };
  const lines = await progressLines({ 'progress.md': MOVE, ...sections });
  expect(lines.slice(4)).toEqual(['Duplicate section id: S0005 sections/01.md sections/01.md']);
});

test('the duplicate section ids print before the unplaced sections and the double sections', async () => {
  const sections = { ...SECTIONS, 'sections/03.md': `- S0019 old-docs/requirements.md:3-14 'Scope' 40 words\n${SECOND_S0005}` };
  const lines = await progressLines({ 'progress.md': changed(MOVE, '\n## Left out', `${P003}\n## Left out`), ...sections });
  expect(lines.slice(4)).toEqual([
    'Duplicate section id: S0005 sections/01.md sections/03.md',
    'Unplaced section: S0019 old-docs/requirements.md:3-14',
    'Double section: S0006 P002 P003',
  ]);
});

test('the script prints the lines of formatProgress and exits with 0 when each section has one place', async () => {
  const { formatProgress, readProgress } = await progressScript();
  const { app, work } = await workFolder({ 'progress.md': MOVE, ...SECTIONS });
  const { code, stdout } = await runScript(app, [work]);
  expect(stdout.trimEnd()).toBe(formatProgress(await readProgress(work)).trimEnd());
  expect(stdout).toContain("Next: - [ ] P002 docs/02-restore.md 'Restore a file'\n");
  expect(code).toBe(0);
});

test('with no folder given, the script reads nerddocs-work in the folder that it runs in', async () => {
  const { app } = await workFolder({ 'progress.md': MOVE, ...SECTIONS });
  const { code, stdout } = await runScript(app);
  expect(stdout).toContain("Next: - [ ] P002 docs/02-restore.md 'Restore a file'\n");
  expect(code).toBe(0);
});

test('the script exits with 1 when it prints an unplaced section', async () => {
  const sections = { ...SECTIONS, 'sections/03.md': "- S0030 old-docs/faq.md:1-9 'Questions' 50 words\n" };
  const { app, work } = await workFolder({ 'progress.md': MOVE, ...sections });
  const { code, stdout } = await runScript(app, [work]);
  expect(stdout).toContain('Unplaced section: S0030 old-docs/faq.md:1-9\n');
  expect(code).toBe(1);
});

test('the script exits with 1 when it prints a double section', async () => {
  const { app, work } = await workFolder({ 'progress.md': changed(MOVE, '\n## Left out', `${P003}\n## Left out`), ...SECTIONS });
  const { code, stdout } = await runScript(app, [work]);
  expect(stdout).toContain('Double section: S0006 P002 P003\n');
  expect(code).toBe(1);
});

test('the script exits with 1 when it prints a duplicate section id', async () => {
  const sections = { ...SECTIONS, 'sections/02.md': `${SECTIONS['sections/02.md']}${SECOND_S0005}` };
  const { app, work } = await workFolder({ 'progress.md': MOVE, ...sections });
  const { code, stdout } = await runScript(app, [work]);
  expect(stdout).toContain('Duplicate section id: S0005 sections/01.md sections/02.md\n');
  expect(code).toBe(1);
});

test('a missing work folder prints Missing folder with the folder, and the script exits with 1', async () => {
  const { app } = await workFolder({ 'progress.md': MOVE });
  const missing = join(app, 'other-work');
  const { code, output } = await runScript(app, [missing]);
  expect(output).toContain(`Missing folder: ${missing}\n`);
  expect(code).toBe(1);
});
