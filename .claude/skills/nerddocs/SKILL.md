---
name: nerddocs
description: This skill says how to write the docs of a nerDDocs site. nerDDocs shows a folder of Markdown files as a site, and each page holds its text at several levels, such as 'Basics', 'Details' and 'Internals'. Each level tells the same page at its own depth, from plain to deep, and holds every fact of the levels below it, so a reader never has to switch levels to find a fact. A slider on the page switches between them. Use this skill to write or change a nerDDocs page, to move old docs into nerDDocs, to split pages into levels, to fill the missing levels of pages, or to go on with a move from nerddocs-work/progress.md. Use it also to write or change nerddocs.json, and to fix what npx nerddocs check prints. Use it even for a short request, such as "Write the page on restoring a whole folder", "Move old-docs/ into nerDDocs", "Split restore.md into levels", "Fill the missing levels" or "Go on with the move".
---

# Write nerDDocs docs

This doc covers the jobs of this skill, the file of the skill to read for each job, and the rules of every job.

nerDDocs shows a folder of Markdown files as a docs site. Each page holds its text at several levels, and a slider on the page switches between them. The levels are depths of the same page, from plain to deep: each level tells each section of the page again, plainer or deeper. Each level holds every fact of the levels below it. `nerddocs.json` names the levels. A fence such as `::: internals` marks the text of a level, and a fence such as `::: details internals` marks text that two levels share.

Read [format.md](format.md) before you write a page. It gives the files of a docs folder, `nerddocs.json`, fences, page content and each problem that `npx nerddocs check` finds.

All examples of this skill come from the docs of one made-up product, a backup app. Its old docs are four files in `old-docs/`: `overview.md`, `requirements.md`, `restore-design.md` and the Word file `install-guide.docx`. Its new docs in `docs/` have the levels 'Basics', 'Details' and 'Internals'.

## The jobs

| The author types | Job | Read | New words |
|---|---|---|---|
| "Write the page on restoring a whole folder" | Write a page | [levels.md](levels.md#write-a-page) | Yes. Each fact comes from the author's words, another page, or a file of the project such as code. |
| "Move old-docs/ into nerDDocs" | Move | [move.md](move.md) | Only the changed lines. |
| "Split restore.md into levels" | Split | [levels.md](levels.md#split-a-page-into-levels) | None. |
| "Fill the missing levels" | Fill | [levels.md](levels.md#fill-the-missing-levels) | Yes, with no new fact. |
| "Go on with the move", or any request while `nerddocs-work/progress.md` exists | Pick up | [move.md](move.md#pick-up-the-work) | None. |

Any other change to a page, such as a fixed typo, follows [format.md](format.md) and the rules below.

## Rules of every job

- A move keeps the words of the old docs. It changes only text that breaks in the move: a reference to an old file, section or place. Such a reference, such as 'see above', 'section 4.2 of restore-design.md' or 'Screenshots: restore-window.png', becomes a link or an image. Each changed line goes in the detail file of its page, as [move.md](move.md#the-progress-log) says.
- The plan of a move sets the title and the headings of each page. An old heading becomes a heading of the page without its old number, such as '3 Search index' to 'Search index'. An old heading goes when the plan puts its text under another heading. Markup of another format, such as AsciiDoc or Word, becomes Markdown. Neither change counts as a changed line.
- No job adds a fact of its own. A fact is a number, a name, a limit, a step, a rule or a claim. A move, a split and a fill take each fact from the old docs or the page. A new page takes each fact from the author's words, another page, or a file of the project.
- A level that needs a fact that the page lacks stays empty, with the reason 'needs facts the page lacks'.
- Each level of a page tells the same sections at its own depth, and reads whole on its own. The levels of a page keep the same headings in the same order, where the level has text under them.
- Levels from plain to deep build on each other. Each level holds every fact of the levels below it, told at its own depth, and adds facts of its own. So a reader picks one level, and never has to switch to another to find a fact. A level can tell a part again in its own words, as long as its text keeps every fact of the part that it replaces.
- A block that two or more levels say the same way goes once, in a fence of all their ids, such as `::: details internals`. New words never state one fact twice at one level.
- Levels by audience, such as for managers, developers and testers, need not build on each other. Treat the levels as plain to deep, unless the author says that they are audiences. With levels by audience, each job puts a block at the levels of its audiences only, and the fact check of [Before you answer](#before-you-answer) does not apply.
- Text that every level says the same way stays outside a fence.
- A heading that two or more levels share stays outside a fence, even when only some levels have text under it. It then shows only at the levels with text under it. A heading of one level goes in the fence of that level.
- A heading inside a fence gives 'Empty heading' at each level of the fence that has no text after it, as [format.md](format.md#check-the-docs) says.
- A move never changes, moves or deletes a file of the old docs. Its new docs go to a folder that holds no old file: `docs/` when it is missing or empty, and `docs-new/` otherwise. A split and a fill change the pages of the docs folder.
- A move copies each image that a page shows next to that page. When two different images in one folder have the same name, the second copy gets a new name, such as `restore-window-2.png`. Its line then goes in 'Changed lines'.
- A project with no `nerddocs.json` gets one, with depth levels from plain to deep, such as 'Basics', 'Details' and 'Internals'. A level is a depth of each topic, not a kind of doc. So a move puts each topic on one page, and each piece of old text at the level of its depth and at each deeper level: the text of an overview doc at every level, the text of a spec at 'Details' and 'Internals', and the text of a design doc at 'Internals' only. Each piece goes once, in one fence with all its ids, so each deeper level shows the text of the levels below it.
- Each answer comes after a run of `npx nerddocs check <docs folder>`. While a move runs, each title-only page gives 'Empty page', and those problems stay until their page is moved. Every other problem is fixed until the check prints only those. The last answer of a job comes with `Problems: 0`.
- The chat holds counts and questions only. Lists go to files in `nerddocs-work/`. The author gets one question at a time.
- The subagents of a step start in one message, not in the background, and the main session waits for all of them. The chat gets no line while they run.
- When all work in `nerddocs-work/progress.md` is checked off, the answer says that the folder `nerddocs-work/` can go. The folder goes only when the author says so.

## Work on many pages

A move and a fill always run from the folder `nerddocs-work/`, next to the docs folder, whatever their size. A fill needs it for the lists of new facts that its checkers write. A split runs from it only on more than 20 pages. A smaller split uses only its copies in `nerddocs-work/before/`, with no `progress.md`.

The work goes in batches of 20 pages, or of 20 fill items for a fill. A fresh session picks the work up from `nerddocs-work/progress.md` alone. [move.md, section "The progress log"](move.md#the-progress-log) gives its files and the formats of their lines.

The progress script, [scripts/progress.mjs](scripts/progress.mjs), prints the next item and the counts of the work. Run it from the project folder:

```sh
node .claude/skills/nerddocs/scripts/progress.mjs
```

Do the item that it prints after 'Next:', then check that item off in `progress.md`.

## Before you answer

1. Check each page of the job. List each fact of each level, and check that each deeper level gives it. Fix each fact that a deeper level lacks. In a move and a fill, the checker subagents list these facts for each page, and the writer subagents fix them.
2. Run `npx nerddocs check <docs folder>`. Fix each problem, until the check prints `Problems: 0`. While a move runs, leave the 'Empty page' of each title-only page, since it goes once that page is moved.
3. For a job that runs from `nerddocs-work/`, run the progress script. Fix each 'Duplicate section id', 'Unplaced section' and 'Double section' line that it prints.
4. Answer with the chat block of the job, as [move.md](move.md) and [levels.md](levels.md) show it. Give the last answer of a job only when the check prints `Problems: 0`.
