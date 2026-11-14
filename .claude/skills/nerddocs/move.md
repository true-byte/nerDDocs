# Move old docs into nerDDocs

This doc covers a move of old docs into nerDDocs: its steps, its chat blocks, its progress log and the brief of each subagent. It also covers how a new session picks the work up.

A move puts the text of each old file on the pages of a new docs folder, each part in the fence of its levels. The old files can be Markdown, AsciiDoc, Word or PDF, and they stay as they are. Read [SKILL.md, section "Rules of every job"](SKILL.md#rules-of-every-job) for what a move may change, such as its headings, and [format.md](format.md) for the format of the pages.

The examples move the four old files of the backup app into four pages in `docs/`. The chat blocks come from a larger move of the same app: 418 old files into 243 pages.

## The old files

This is `old-docs/overview.md`:

```md
# Backup app overview

## About this doc

This doc gives a short overview of the backup app for managers and new staff.

## Install

Install the agent on each PC. The agent backs up the PC in the background.

## Restore a file

Pick a file and a day, and the app puts that copy back.

Screenshots: restore-window.png

## Pick a day

Click a day on the calendar. A day with a copy has a dot.

## Schedules

The app backs up each PC every night. It keeps each copy for 30 days.
```

This is `old-docs/requirements.md`:

```md
# Backup app requirements

## REQ-1 Schedules

REQ-1.1 The agent starts a backup at 01:00 local time every day.

REQ-1.2 A backup that misses its time runs within 10 minutes after the PC wakes.

The rule for which copy a day restores is in section 4.2 of restore-design.md.

## REQ-2 Restore

REQ-2.1 The app restores any file from any day of the last 14 days.

REQ-2.2 A restore never changes the copy in storage.

## REQ-4 Encryption

REQ-4.1 The agent encrypts each copy with AES-256 before the copy leaves the PC.

REQ-4.2 Only the password of the user opens the key of a copy.
```

This is `old-docs/restore-design.md`:

```md
# Restore design

## 1 Purpose

This doc describes how a restore works on the server.

## 2 Restore job

A restore is a job on the storage server. The server queues the job and sends the file blocks to the agent.

## 3 Search index

The agent keeps a list of the file paths of each copy.

## 4 Copies

### 4.1 Copy states

A copy is open while the backup runs, and closed once the last block is stored.

### 4.2 Rule for a day

The rule takes the newest closed copy of that day.

## 5 Encryption

The key of each copy is wrapped with a key made from the password, with Argon2id.
```

`old-docs/install-guide.docx` is a Word file. Its reader writes its text as Markdown, word for word, to `nerddocs-work/text/old-docs/install-guide.docx.md`:

```md
# Install guide

## Install the agent

Run the installer with no window:

setup.exe /quiet SERVER=backup.example.com

The agent runs as the service BackupAgent.
```

The writers and the checkers read this copy. The section lines keep the old path `old-docs/install-guide.docx` as their place.

## The steps

`progress.md` lists the steps of a move in this order. Do them in this order, and check off each step once it is done.

| Step | What happens |
|---|---|
| Read the old files | Reader subagents write each old section on one line of `sections/`, and a Markdown copy of each old file that is not Markdown in `text/`. |
| Plan the pages | A planner subagent places each section on a page and its levels, or leaves it out with a reason. |
| The author says yes to the plan | The browser shows the page tree, and the chat shows the plan. |
| Move the pages | Writer and checker subagents write the pages, in batches of 20. |
| Check the docs | `npx nerddocs check` prints `Problems: 0`. |
| Find the clashes | Clash subagents list each fact that two pages state in different ways. |
| Write the report | `report.md` holds the counts and the full lists, and the chat shows the counts. |
| Ask about each clash | The author picks the right fact of each clash, one at a time, and `report.md` gets each answer. |

### Read the old files

Write `nerddocs-work/progress.md` first, with the steps and no page. Then start one reader subagent for each 40 old files, all at the same time. Give each reader the brief of [The reader](#the-reader).

Each file of `sections/` holds at most 999 sections. It takes its ids from a first id of its own, so that no two files give one id:

| File | First id |
|---|---|
| `sections/01.md` | `S0001` |
| `sections/02.md` | `S1001` |
| `sections/03.md` | `S2001` |

The first id of each next file is 1000 more. A reader whose files hold more than 999 sections stops after the last whole file that fits. It answers with the first file that did not fit. Start a new reader for that file and the rest of its files, with the next free file of `sections/`.

The one reader of the backup app writes `nerddocs-work/sections/01.md`:

```text
- S0001 old-docs/overview.md:1-1 'Backup app overview' 0 words
- S0002 old-docs/overview.md:3-5 'About this doc' 15 words
- S0003 old-docs/overview.md:7-9 'Install' 15 words
- S0004 old-docs/overview.md:11-15 'Restore a file' 15 words
- S0005 old-docs/overview.md:17-19 'Pick a day' 14 words
- S0006 old-docs/overview.md:21-23 'Schedules' 15 words
- S0007 old-docs/requirements.md:1-1 'Backup app requirements' 0 words
- S0008 old-docs/requirements.md:3-9 'REQ-1 Schedules' 41 words
- S0009 old-docs/requirements.md:11-15 'REQ-2 Restore' 23 words
- S0010 old-docs/requirements.md:17-21 'REQ-4 Encryption' 27 words
- S0011 old-docs/restore-design.md:1-1 'Restore design' 0 words
- S0012 old-docs/restore-design.md:3-5 '1 Purpose' 10 words
- S0013 old-docs/restore-design.md:7-9 '2 Restore job' 22 words
- S0014 old-docs/restore-design.md:11-13 '3 Search index' 12 words
- S0015 old-docs/restore-design.md:15-15 '4 Copies' 0 words
- S0016 old-docs/restore-design.md:17-19 '4.1 Copy states' 16 words
- S0017 old-docs/restore-design.md:21-23 '4.2 Rule for a day' 10 words
- S0018 old-docs/restore-design.md:25-27 '5 Encryption' 16 words
- S0019 old-docs/install-guide.docx#Install guide 'Install guide' 0 words
- S0020 old-docs/install-guide.docx#Install the agent 'Install the agent' 16 words
```

### Plan the pages

Start one planner subagent with the brief of [The planner](#the-planner), without its line 'Folders'. When the sections do not fit one subagent, plan in two rounds:

1. Start one planner with the lines 'Levels', 'Dimensions' and 'Folders' of the brief. It writes `plans/01.md`, with each old file under the folder that it goes to.
2. Start one planner for each folder, all at the same time, with the line 'Pages' and the lines after it. Give each planner only the section ids of the old files of its folder.

Then do these things, in order:

1. Write `nerddocs.json` from the levels and the dimensions of the plan.
2. Copy the page items of each plan into `progress.md`, under `## Pages`, in batches of 20 under `### Batch 1`, `### Batch 2` and so on. Give the pages the ids `P001`, `P002` and so on, in the order of the plan. Copy the left-out lines under `## Left out`.
3. Write each new page with its title only, such as `# Restore a file`.
4. Run the progress script. Fix each 'Duplicate section id', 'Unplaced section' and 'Double section' line, until the script prints none. For a 'Duplicate section id', give one of the two sections a free id of its sections file, in that file and in `progress.md`.

The plan of the backup app makes `nerddocs-work/progress.md` this:

```text
# Move of old-docs/ into docs/

To go on, run the progress script and do the item that it prints after 'Next:'.

## Steps

- [x] Read the old files
- [x] Plan the pages
- [ ] The author says yes to the plan
- [ ] Move the pages
- [ ] Check the docs
- [ ] Find the clashes
- [ ] Write the report
- [ ] Ask about each clash

## Pages

### Batch 1

- [ ] P001 docs/01-install.md 'Install the agent'
  - S0003 overview
  - S0020 internals
- [ ] P002 docs/02-restore.md 'Restore a file'
  - S0004 overview
  - S0005 overview requirements
  - S0009 requirements
  - S0013 internals
  - S0014 internals
  - S0016 internals
  - S0017 internals
- [ ] P003 docs/03-schedules.md 'Schedules'
  - S0006 overview
  - S0008 requirements
- [ ] P004 docs/04-encryption.md 'Encryption'
  - S0010 requirements
  - S0018 internals

## Left out

- S0001 left out: Holds only the title of the old doc.
- S0002 left out: Says what the old doc is.
- S0007 left out: Holds only the title of the old doc.
- S0011 left out: Holds only the title of the old doc.
- S0012 left out: Says what the old doc is.
- S0015 left out: Holds only the heading of S0016 and S0017.
- S0019 left out: Holds only the title of the old doc.
```

### The author says yes to the plan

Start the docs site, as [The docs site](#the-docs-site) says. The author browser opens with the page tree, and its problems pill counts each title-only page as 'Empty page'. Then print the plan and ask the question, in these words and this order:

```text
> Move old-docs/ into nerDDocs

⏺ Read 418 files in old-docs/ with 11 subagents: 301 Markdown, 61 Word, 43 AsciiDoc, 13 PDF.

⏺ Plan saved to nerddocs-work/progress.md. The page tree is in your browser.

  Levels              Files
    Overview             41    guides, brochures, release notes
    Requirements         96    specs, requirements
    Internals           269    design docs, API, runbooks

  Dimensions          Pages
    User guide          114
    Administration       85
    Developer guide      44

  Left out            12 files, 140 sections   each with its reason in nerddocs-work/progress.md

  Work      243 pages · 3,912 sections · 13 batches of 20 pages
  Writes    docs/ · old-docs/ stays as it is

  Move the docs?
```

The block 'Levels' takes the count of old files and their kinds for each level from `plans/01.md`. With no dimensions, the plan holds the line `  Dimensions          none` in place of the block 'Dimensions'.

When the author asks for a change, change the plan in `progress.md`, the pages and `nerddocs.json`. Run the progress script again, and print the plan again. When the author says yes, check off the step.

### Move the pages

Move the pages one batch at a time:

1. Start one writer subagent for each page of the batch, all at the same time, with the brief of [The writer](#the-writer).
2. Start one checker subagent for each page, all at the same time, with the brief of [The checker](#the-checker). A checker never checks a page that it wrote.
3. For each page with lost facts, start its writer again to fix them, and then its checker. Stop after three rounds of checks.
4. Check off the page items of the batch, and print one line for the batch.

The batch lines read as follows. 'Lost facts found' counts the lost-fact lines of the batch in `pages/`, and 'left' counts the unchecked ones:

```text
> yes

⏺ npx nerddocs runs. Your browser shows each page as it is saved.

⏺ Batch  1 of 13   20 pages   lost facts found 0, left 0
⏺ Batch  2 of 13   20 pages   lost facts found 3, left 0
  ⋮
⏺ Batch  6 of 13   20 pages   lost facts found 1, left 0
```

After the last batch, check off 'Move the pages'.

The writer of the 'Schedules' page of the backup app writes `docs/03-schedules.md`:

```md
# Schedules

::: overview
The app backs up each PC every night. It keeps each copy for 30 days.

::: requirements
REQ-1.1 The agent starts a backup at 01:00 local time every day.

REQ-1.2 A backup that misses its time runs within 10 minutes after the PC wakes.

The rule for which copy a day restores is in [Pick a day](02-restore.md#internals/pick-a-day).
:::
```

The words of the old sections stay. The line that named 'section 4.2 of restore-design.md' now links to the page of that section, at its level. The writer found that page in `progress.md`, under the id of the section '4.2 Rule for a day'. The writer also writes the detail file `nerddocs-work/pages/P003.md`. Its checker found one lost fact in the first round, and the writer put it back:

```text
# P003 docs/03-schedules.md 'Schedules'

## Old sections

- S0006 overview
- S0008 requirements

## Changed lines

- old-docs/requirements.md:9
  - Old: The rule for which copy a day restores is in section 4.2 of restore-design.md.
  - New: The rule for which copy a day restores is in [Pick a day](02-restore.md#internals/pick-a-day).

## Facts

- overview: The app backs up each PC every night. old-docs/overview.md:23
- overview: It keeps each copy for 30 days. old-docs/overview.md:23
- requirements: REQ-1.1 The agent starts a backup at 01:00 local time every day. old-docs/requirements.md:5
- requirements: REQ-1.2 A backup that misses its time runs within 10 minutes after the PC wakes. old-docs/requirements.md:7

## Lost facts

- [x] REQ-1.1 The page leaves out 'local time'. old-docs/requirements.md:5
```

The writer of the 'Restore a file' page copies `old-docs/restore-window.png` to `docs/restore-window.png`. Its detail file `nerddocs-work/pages/P002.md` lists the changed line of the screenshot:

```text
- old-docs/overview.md:15
  - Old: Screenshots: restore-window.png
  - New: ![Restore window](restore-window.png)
```

The writer of the 'Restore a file' page writes `docs/02-restore.md`:

```md
# Restore a file

::: overview
Pick a file and a day, and the app puts that copy back.

![Restore window](restore-window.png)

::: requirements
REQ-2.1 The app restores any file from any day of the last 14 days.

REQ-2.2 A restore never changes the copy in storage.

::: internals
A restore is a job on the storage server. The server queues the job and sends the file blocks to the agent.

## Search index

The agent keeps a list of the file paths of each copy.
:::

## Pick a day

::: overview requirements
Click a day on the calendar. A day with a copy has a dot.

::: internals
A copy is open while the backup runs, and closed once the last block is stored.

The rule takes the newest closed copy of that day.
:::
```

The section 'Pick a day' of `old-docs/overview.md` fits both 'Overview' and 'Requirements', so it goes in the fence of both. Every level shares the heading 'Pick a day', so it stays outside a fence. 'Search index' has text at 'Internals' only, so its heading goes inside that fence.

The old heading '3 Search index' becomes 'Search index'. The old headings '2 Restore job', '4.1 Copy states' and '4.2 Rule for a day' go. The plan puts their text under the title and under 'Pick a day'. These changes are no changed lines.

The writer of the 'Install the agent' page takes its 'Internals' text from the copy of `old-docs/install-guide.docx`, and writes `docs/01-install.md`:

```md
# Install the agent

::: overview
Install the agent on each PC. The agent backs up the PC in the background.

::: internals
Run the installer with no window:

setup.exe /quiet SERVER=backup.example.com

The agent runs as the service BackupAgent.
:::
```

The old headings 'Install' and 'Install the agent' go, since the plan puts their text under the title of the page.

### Check the docs

Run `npx nerddocs check <docs folder>`, and fix each problem as [format.md, section "Check the docs"](format.md#check-the-docs) says. A fix that changes a line of an old section goes in 'Changed lines' of the detail file of its page. Check off the step when the check prints `Problems: 0`.

### Find the clashes

Start one clash subagent for each dimension, one after another, with the brief of [The clash subagent](#the-clash-subagent). Then start one more for all dimensions, which lists only the clashes between pages of two dimensions. A docs folder with no dimensions needs one clash subagent. Each one adds its clashes to the end of `nerddocs-work/clashes.md`.

The clash subagent of the backup app writes `nerddocs-work/clashes.md`:

```text
# Clashes

- [ ] C01 Copies kept
  - docs/03-schedules.md 'Schedules': It keeps each copy for 30 days. old-docs/overview.md:23
  - docs/02-restore.md 'Restore a file': REQ-2.1 The app restores any file from any day of the last 14 days. old-docs/requirements.md:13
```

### Write the report

Write `nerddocs-work/report.md` with the counts and their full lists. Print the counts:

```text
⏺ Moved 243 pages into docs/. Full report: nerddocs-work/report.md

  Lost facts        0
  Changed lines 1,214
  Clashes          37
  Empty levels    402
  Problems          0   npx nerddocs check
```

An empty level is a level of a page with no text at it. The report of the backup app is `nerddocs-work/report.md`:

```text
# Move of old-docs/ into docs/

## Counts

- Pages: 4
- Lost facts: 0
- Changed lines: 2
- Clashes: 1
- Empty levels: 3
- Problems: 0

## Changed lines

- docs/02-restore.md: old-docs/overview.md:15
- docs/03-schedules.md: old-docs/requirements.md:9

## Clashes

- C01 Copies kept: docs/03-schedules.md, docs/02-restore.md

## Empty levels

- docs/01-install.md requirements
- docs/03-schedules.md internals
- docs/04-encryption.md overview
```

### Ask about each clash

Ask about each unchecked clash of `clashes.md`, one at a time. Give both quotes, their pages and their old files, and number the answers:

```text
⏺ Clash 1 of 37 · Copies kept

    Schedules        It keeps each copy for 30 days.                       old-docs/guide/schedules.md:22
    Restore a file   The app restores any file from any day of the last 14 days.   old-docs/specs/requirements.docx REQ-2.1

  Which is right?
    1. 30 days
    2. 14 days
    3. Both: each page names its plan
    4. Keep both as they are
```

Change the pages that the answer names, and list each changed line in the detail file of its page. Check off the clash in `clashes.md`.

After the last answer, write each answer under 'Clashes' in `report.md`, on a line under its clash. The part 'Clashes' of the report of the backup app then reads:

```text
## Clashes

- C01 Copies kept: docs/03-schedules.md, docs/02-restore.md
  - Answer: Keep both as they are
```

Then check off the step, and say that the folder `nerddocs-work/` can go.

## The progress log

The work of a move runs from the folder `nerddocs-work/`, next to the new docs folder. [SKILL.md, section "Work on many pages"](SKILL.md#work-on-many-pages) says which other jobs run from it. A fresh session picks the work up from `progress.md` alone.

| File | What it holds | Who writes it |
|---|---|---|
| `progress.md` | The todo list of every job, checked off item by item | The main session only |
| `sections/<NN>.md` | Each old section, one line each, at most 999 sections | One reader subagent per file |
| `text/<old path>.md` | The text of an old file that is not Markdown, as Markdown, word for word, with its images next to it | The reader subagent of that old file |
| `plans/<NN>.md` | The levels with their counts of old files, the dimensions, and the folders with their old files or the pages of one folder | One planner subagent per file |
| `pages/<id>.md` | The old sections, changed lines, facts and lost facts of one page, or the new facts of one fill item | The writer and checker subagents of that page or item |
| `clashes.md` | Each clash, checked off once the author answers | The clash subagents write it; the main session checks items off |
| `report.md` | The counts, the full lists of the report, and the answer to each clash | The main session, at the end |
| `site.log` | The lines that the docs site prints, such as its 'Author address' | The docs site |

### Line formats

The progress script reads these lines. Every other line is free text.

| Line | Format | Example |
|---|---|---|
| Section | `- S<digits> <old path><place> '<heading>' <N> words` | `- S0008 old-docs/requirements.md:3-9 'REQ-1 Schedules' 41 words` |
| Page item | `- [ ] P<digits> <new path> '<title>'` | `- [x] P003 docs/03-schedules.md 'Schedules'` |
| Page source | Two spaces, then `- S<digits> <level id> [<level id> …]` | `  - S0005 overview requirements` |
| Left out | `- S<digits> left out: <reason>` | `- S0002 left out: Says what the old doc is.` |
| Fill item | `- [ ] F<digits> <new path> <level id>` | `- [ ] F003 docs/04-encryption.md overview` |
| Clash item, in `clashes.md` | `- [ ] C<digits> <subject>` | `- [ ] C01 Copies kept` |
| Any other item | `- [ ] <text>` | `- [x] Read the old files` |

`<place>` is `:<first line>-<last line>` for a Markdown file, and `#<heading>` for every other file, such as `old-docs/install-guide.docx#Install the agent`. `<N>` counts the words of the text under the heading.

Check off an item by writing `x` in its box, such as `- [x] P003 docs/03-schedules.md 'Schedules'`. Change no other part of the line.

### The progress script

Run the progress script from the project folder. It reads `progress.md`, `sections/*.md` and `clashes.md` of the work folder, and the default work folder is `nerddocs-work`:

```sh
node .claude/skills/nerddocs/scripts/progress.mjs nerddocs-work
```

It prints its lines in this order. Say that the author said yes to the plan, and P001 is checked off. Say also that `sections/02.md` holds a second section with the id S0020. Say last that `progress.md` lacks the left-out line of S0012, and P003 also names S0005. Then the script prints:

```text
Next: - [ ] P002 docs/02-restore.md 'Restore a file'
Pages: 1 of 4
Clashes: 0 of 0
Fill: 0 of 0
Duplicate section id: S0020 sections/01.md sections/02.md
Unplaced section: S0012 old-docs/restore-design.md:3-5
Double section: S0005 P002 P003
```

| Line | What it says |
|---|---|
| `Next` | The first unchecked item of `progress.md`, or `none`. While 'Move the pages' is unchecked, it is the first unchecked page item. |
| `Pages`, `Clashes`, `Fill` | The checked items and all items of their kind. |
| `Duplicate section id` | An id that two section lines carry, with the sections file of each line. |
| `Unplaced section` | A section of `sections/` that no page source and no left-out line names. |
| `Double section` | A section that two pages name, or that a page and a left-out line name, with the ids of the pages. |

The script exits with `1` when it prints a 'Duplicate section id', an 'Unplaced section' or a 'Double section' line, and with `0` otherwise. A missing work folder prints `Missing folder: <folder>`.

## The docs site

The docs site runs for the whole move, so that the author browser shows each page as it is saved. A background command of the chat stops after a time limit, so never start the site as one. Start it on its own, with its lines in `nerddocs-work/site.log`, and with the docs folder in place of `docs`:

```sh
nohup npx nerddocs docs > nerddocs-work/site.log 2>&1 &
```

The line 'Author address' of `site.log` gives the address of the author browser. Before you start the site, check whether it still runs: `curl -s -o /dev/null <author address>` succeeds while it runs. Start the site only when that check fails.

## Pick up the work

When `nerddocs-work/progress.md` exists, each request goes on with its work first. Start the docs site, as [The docs site](#the-docs-site) says. Run the progress script, and print one line with the counts and the next item:

```text
> Go on with the move

⏺ nerddocs-work/progress.md: 120 of 243 pages done. Batch 7 of 13 is next.
⏺ Batch  7 of 13   20 pages   lost facts found 0, left 0
  ⋮
⏺ Batch 13 of 13    3 pages   lost facts found 0, left 0
```

When 'Next' is a step, the line names it, such as `nerddocs-work/progress.md: 243 of 243 pages done. 'Check the docs' is next.` Then go on from 'Next'. A batch with some checked page items goes on from its first unchecked page item.

When 'Next' is `none`, say that the folder `nerddocs-work/` can go, and do the request.

## The subagent briefs

Fill in each `<...>` of a brief, and pass the brief on as the whole prompt of the subagent. Each subagent answers in one line, so the chat of the main session stays short.

### The reader

```text
Read these old files: <old paths>.
Write nerddocs-work/sections/<NN>.md. For each old file that is not Markdown, such as Word, PDF or AsciiDoc, also write its text as Markdown, word for word, to nerddocs-work/text/<old path>.md, and its images next to that file.

Write one line for each section of each file, in the order of the files and of their lines:
- S<digits> <old path><place> '<heading>' <N> words
A section is a heading and the text under it, down to the next heading. Text before the first heading of a file is a section too, with the file name as its heading. So is the whole text of a file with no heading.
<place> is :<first line>-<last line> for a Markdown file, and #<heading> for every other file, such as old-docs/install-guide.docx#Install the agent.
<N> counts the words of the text under the heading.
Number the sections from <first id> on. Write at most 999 sections. When the files hold more, stop after the last whole file that fits.
Write no other line. Change no old file.

Answer in one line: sections/<NN>.md done: <count> sections, or sections/<NN>.md stopped: <count> sections, first file left <old path>
```

### The planner

```text
Read <nerddocs-work/sections/*.md | the lines of the sections <section ids> in nerddocs-work/sections/*.md, and the levels in nerddocs-work/plans/01.md>, and each old file where a heading does not say what its section holds.
Read .claude/skills/nerddocs/format.md for the format of a docs folder.
Write one file: nerddocs-work/plans/<NN>.md.

Plan <the levels, the dimensions and the pages | the levels, the dimensions and the folders | the pages of the folder <folder>> of a move of <old folder> into <docs folder>.
- Levels: <the levels of nerddocs.json | propose the levels from the kinds of old docs, such as guides, specs and design docs>. Write each level as - <id> '<name>' <icon>: <count> files: <kinds>, such as - internals 'Internals' cpu: 269 files: design docs, API, runbooks. Count each old file once, at the level that fits it best.
- Dimensions: one top folder for each kind of reader, such as 'User guide' and 'Administration'. A docs folder of 20 pages or fewer needs none.
- Folders: write each folder of the docs as - <folder>, and under it each old file that goes in it, as   - <old path>. Each old file goes in one folder.
- Pages: one page for each topic. The old sections of one topic, from every old file, go on one page.
- Write each page as - [ ] <new path> '<title>', and under it each of its sections as   - S<digits> <level id> [<level id> ...].
- A section goes at each level whose kind of reader it fits.
- Write each section that no page needs as - S<digits> left out: <reason>.
- Each section goes on one page, or is left out. No section goes on two pages.

Answer in one line: plans/<NN>.md done: <count> pages, <count> left out, or plans/01.md done: <count> levels, <count> folders
```

### The writer

```text
Read .claude/skills/nerddocs/format.md, the lines of the sections <section ids> in nerddocs-work/sections/*.md, and the text of each section in its old file. For an old file that is not Markdown, read its copy nerddocs-work/text/<old path>.md.
Write two files: the page <new path>, and its detail file nerddocs-work/pages/<P-id>.md.

Write the page '<title>' at the levels of nerddocs.json: <level ids>.
- Put the text of each section in the fence of its levels: <the page source lines>.
- Keep the words of the old docs. Change only a line that breaks in the move: a reference to an old file, section or place. Make it a link to the page that holds that text, or an image.
- To make a link, find the section that the reference names in nerddocs-work/sections/*.md. Then find the page and the levels of that section in nerddocs-work/progress.md.
- The plan sets the title and the headings of the page. An old heading becomes a heading of the page without its old number, such as '3 Search index' to 'Search index'. An old heading goes when the plan puts its text under another heading.
- Markup of another format, such as AsciiDoc or Word, becomes Markdown. A heading change and a markup change are no changed lines.
- Copy each image that the page shows next to the page. When another image of the same name is already there, give the copy a new name, and list its line under 'Changed lines'.
- Add no fact. A level with no text stays empty.
- Each level reads whole on its own. Keep the same headings in the same order at each level that has text under them.
- Text that every level says the same way stays outside a fence. So does a heading that two or more levels share, even when only some levels have text under it. A heading of one level goes in the fence of that level.
<In round 2 or 3: Fix each unchecked line under 'Lost facts' of the detail file, and check it off.>

Write the detail file in this layout. <old place> is the old path and its line, such as old-docs/requirements.md:9, or the old path and its heading for a file that is not Markdown, such as old-docs/install-guide.docx#Install the agent.

# <P-id> <new path> '<title>'

## Old sections

- S<digits> <level id> [<level id> ...]

## Changed lines

- <old place>
  - Old: <old line>
  - New: <new line>

## Facts

- <level id>: <fact> <old place>

## Lost facts

Answer in one line: <P-id> written: changed lines <count>
```

### The checker

```text
You did not write this page. Read nerddocs-work/pages/<P-id>.md and the page <new path>.
Find the old place of each section that the detail file lists in nerddocs-work/sections/*.md. Read the text of each section in its old file, or in its copy nerddocs-work/text/<old path>.md for an old file that is not Markdown.
Write one file: nerddocs-work/pages/<P-id>.md, under its heading 'Lost facts' only.

List each fact of the old sections that the page loses or changes, as - [ ] <fact> <old place>.
A fact is a number, a name, a limit, a step, a rule or a claim. A line that 'Changed lines' lists is no lost fact.
An old heading without its old number, an old heading that the plan put under another heading, and markup that became Markdown are no lost facts.
A fact at a level that the page sources do not name is a lost fact.

Answer in one line: <P-id> done: lost facts 0, or <P-id> lost facts <count>
```

### The clash subagent

```text
Read the heading 'Facts' of each detail file in nerddocs-work/pages/ <of the pages in the dimension <folder> | of all pages>.
Write one file: nerddocs-work/clashes.md. Add to its end, and keep each line that is there.

List each fact that two pages state in different ways, such as two numbers of days for one thing. <For all dimensions: List only the clashes between a page of one dimension and a page of another.>
Write each clash as - [ ] C<digits> <subject>, numbered on from the last clash of the file.
Under it, write each of the two facts as   - <new path> '<title>': <fact> <old place>.
A fact that two pages state the same way is no clash. The values of a sample output, such as a size or an id in an example, give no clash.

Answer in one line: <the dimension <folder> | all dimensions> done: clashes <count>
```
