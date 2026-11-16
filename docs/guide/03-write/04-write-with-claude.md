# Write with Claude

::: casual
The `nerddocs` skill teaches Claude to write the docs of a nerDDocs site. Claude writes each level of your pages, or moves your old docs into nerDDocs, and adds no fact of its own. Claude does the typing, and the facts stay yours.

::: pro
The `nerddocs` skill tells Claude how to write the docs of a nerDDocs site. With it, Claude writes a new page at its levels, splits a page into levels, fills the missing levels and moves old docs into nerDDocs, with no fact of its own. The examples come from the docs of a backup app, with the levels 'Basics', 'Details' and 'Internals'.

::: full-nerd
The `nerddocs` skill tells Claude how to write the docs of a nerDDocs site, with every rule of each job and each file of the skill. With it, Claude writes a new page at its levels, splits a page into levels, fills the missing levels and moves old docs into nerDDocs, with no fact of its own. The examples come from the docs of a backup app, with the levels 'Basics', 'Details' and 'Internals'.
:::

## Install the skill

::: casual
Run one command in the folder of your project, and Claude Code gets the skill.

::: pro full-nerd
Run this command in your project's folder. It installs the skill for Claude Code, in your project's `.claude/skills/nerddocs/`.

```sh
npx skills add https://github.com/true-byte/nerDDocs \
  --skill nerddocs -a claude-code --copy
```

::: full-nerd
| Part | What it does |
|---|---|
| `npx skills add` | Runs `skills`, a tool that installs a skill from a GitHub repo. |
| `https://github.com/true-byte/nerDDocs` | Names the GitHub repo of nerDDocs, which holds the skill. |
| `--skill nerddocs` | Picks the `nerddocs` skill in that repo. |
| `-a claude-code` | Picks Claude Code as the tool that gets the skill. |
| `--copy` | Writes the files themselves, not links to them, so that you can commit them in your project. |

::: pro full-nerd
The command also writes `skills-lock.json` in your project's folder, which says where the skill comes from. Commit it with the skill, since `npx skills update` reads it to find the skill.

::: full-nerd
The skill has these files:

| File | What it holds |
|---|---|
| [SKILL.md](https://github.com/true-byte/nerDDocs/blob/master/.claude/skills/nerddocs/SKILL.md) | The jobs, the file to read for each job, and the rules of every job. |
| [format.md](https://github.com/true-byte/nerDDocs/blob/master/.claude/skills/nerddocs/format.md) | The format of a docs folder: `nerddocs.json`, fences, page content and each problem of the check. |
| [move.md](https://github.com/true-byte/nerDDocs/blob/master/.claude/skills/nerddocs/move.md) | The steps of a move, its progress log and the brief of each subagent. |
| [levels.md](https://github.com/true-byte/nerDDocs/blob/master/.claude/skills/nerddocs/levels.md) | How Claude writes a page, splits a page into levels and fills the missing levels. |
| [scripts/progress.mjs](https://github.com/true-byte/nerDDocs/blob/master/.claude/skills/nerddocs/scripts/progress.mjs) | The script that prints the next item and the counts of a job on many pages. |
:::

## What to ask Claude

::: casual
Ask Claude in plain words, such as "Write the page on restoring a whole folder". Claude writes a new page, splits a page into levels, or fills the levels that a page lacks. When your levels go from plain to deep, each level keeps every fact of the plainer levels. Each fact comes from your docs, your words or the files of your project.

::: pro full-nerd
Type a request to Claude, such as one of these. They work on the docs of the backup app in `docs/`.

| You type | What changes in the files |
|---|---|
| "Write the page on restoring a whole folder" | Claude writes `docs/05-restore-folder.md`, which held only its title, at each level that its facts fill. |
| "Split restore.md into levels" | Claude puts each block of `docs/02-restore.md` at its level and at each deeper level, and adds no word. A requirement goes in `::: details internals`, and a plain step stays outside the fences. |
| "Fill the missing levels" | Claude writes the 'Basics' part of the 'Encryption' page from its 'Details' part. 'Internals' of the 'Schedules' page stays empty, because the page lacks the facts for it. |

In every job, levels that go from plain to deep build on each other. Each level holds every fact of the levels below it, at its own depth, and adds its own. So 'Details' of the backup app holds every fact of 'Basics', and 'Internals' holds every fact of 'Details'. A fill gives a new level every fact of the levels below it. Levels by audience, such as levels for managers, developers and testers, need not build on each other. Claude treats the levels as plain to deep, unless you say that they are audiences.

::: pro
Claude adds no fact of its own. A new page takes each fact from your words, another page or a file of your project, and a split and a fill take each fact from the page. Before each answer, Claude checks that each deeper level gives every fact of the levels below it. Then it checks the docs, as [Check the docs](../04-check-the-docs.md#run-the-check) says.

::: full-nerd
Claude Code loads the skill for each request that writes or changes a page of a docs folder or `nerddocs.json`. No job adds a fact of its own. A split and a fill take each fact from the page. A new page takes each fact from your words, another page or a file of your project, such as code, and Claude asks you about each fact that none of them holds. A level that needs a fact that the page lacks stays empty.

A level can tell a part of a lower level again in its own words, as long as it keeps every fact of that part. A block that two or more levels say the same way goes once: outside the fences when every level says it, and else in one fence with all their ids. A fill takes the facts that suit the depth of the new level from the nearest deeper level with text. An empty level deeper than every level with text stays empty, since with no new fact it could only tell the level below it again. With levels by audience, each job puts a block at the levels of its audiences only.

Before each answer, Claude lists each fact of each level of the pages of the job, and fixes each fact that a deeper level lacks. In a move and a fill, checker subagents list these facts, and writer subagents fix them. With levels by audience, this check does not apply. Each answer of Claude then comes after a run of `npx nerddocs check`, as [Check the docs](../04-check-the-docs.md#run-the-check) says, and the last answer of a job comes with `Problems: 0`. The chat holds counts and questions only, and Claude asks one question at a time.
:::

## Move old docs

::: casual
Claude can move your old docs into nerDDocs and keep their words. The levels go from plain to deep, so plain old text goes to every level, and deep old text only to the deeper levels. Claude shows you the plan first, and your old files stay as they are.

::: pro
Type "Move old-docs/ into nerDDocs". The old docs of the backup app are `overview.md`, `requirements.md`, `restore-design.md` and the Word file `install-guide.docx`, in `old-docs/`.

Claude writes `nerddocs.json` and a page for each topic, in `docs/`, or in `docs-new/` when `docs/` holds files. The levels are depths of the same topic, from plain to deep, and each piece of old text goes to the level of its depth and to each deeper level. So the restore text of `overview.md`, `requirements.md` and `restore-design.md` goes on the 'Restore a file' page. The steps of `overview.md` show at every level, the requirements of `requirements.md` at 'Details' and 'Internals', and the work of the server in `restore-design.md` at 'Internals' only. A move keeps the words of the old docs, and `old-docs/` stays as it is.

Before the move, Claude shows the page tree in your browser and the plan in the chat, and asks 'Move the docs?'. After it, Claude asks you about each fact that two pages state in different ways.

::: full-nerd
Type "Move old-docs/ into nerDDocs". The old docs of the backup app are `overview.md`, `requirements.md`, `restore-design.md` and the Word file `install-guide.docx`, in `old-docs/`. Old docs can be Markdown, AsciiDoc, Word or PDF.

Claude writes `nerddocs.json` and a page for each topic. The new docs go to `docs/` when it is missing or empty, and to `docs-new/` otherwise. The levels are depths of the same topic, from plain to deep, not kinds of doc. An overview doc is plain, a spec holds the details, and a design doc tells the internals. Each piece of old text goes once, at the level of its depth and at each deeper level. A piece at every level stays outside the fences, and any other piece goes in one fence with the ids of all its levels, such as `::: details internals`.

So the restore text of all three Markdown files goes on the 'Restore a file' page. The steps of `overview.md` show at every level, the requirements of `requirements.md` at 'Details' and 'Internals', and the server job of `restore-design.md` at 'Internals' only.

A move keeps the words of the old docs, and never changes, moves or deletes an old file. It changes only a line that breaks in the move, such as a line that names section 4.2 of `restore-design.md`. That line becomes a link to the page that holds the section. Such a line is a changed line.

Before the move, Claude shows the page tree in your browser and the plan in the chat, and asks 'Move the docs?'. The pages then move in batches of 20. After the move, Claude asks you about each fact that two pages state in different ways, one at a time. `nerddocs-work/report.md` lists each changed line, each clash and each empty level.
:::

## Go on in a new session

::: casual
A big move can take many sessions. Claude keeps a list of its work, so a new session goes on where the last one stopped.

::: pro full-nerd
A move and a fill run from the folder `nerddocs-work/`, next to the docs folder, and so does a split of more than 20 pages. `nerddocs-work/progress.md` lists each step and each page, and Claude checks off each one once it is done. So a move can stop after any batch.

To go on, start a new session of Claude Code in the same folder and type "Go on with the move". Claude prints the pages that are done and the batch that is next, and goes on from there.

::: full-nerd
While `nerddocs-work/progress.md` exists, any request goes on with that work first. When all work in `nerddocs-work/progress.md` is checked off, Claude says that the folder `nerddocs-work/` can go. Claude deletes it only when you say so.
:::

## Update the skill

::: casual
One command in the folder of your project updates the skill.

::: pro
Run this command in your project's folder:

::: full-nerd
Run this command in your project's folder. It reads `skills-lock.json` to find where the skill comes from.

::: pro full-nerd
```sh
npx skills update nerddocs
```
:::
