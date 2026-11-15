# Write pages at their levels

This doc covers three jobs on the pages of a docs folder: write a page, split a page into levels, and fill the missing levels.

Read [SKILL.md](SKILL.md) for the rules of every job, and [format.md](format.md) for the format of the pages. The examples use the pages of the backup app in `docs/`, with the levels 'Basics', 'Details' and 'Internals'.

## Write a page

A new page gets new words at each of its levels. Each level tells the same sections at its own depth, from plain to deep, and reads whole on its own. Each deeper level holds every fact of the levels below it, and adds facts of its own. Each fact comes from the author's words, another page, or a file of the project, such as code.

1. Read `nerddocs.json`, the pages next to the new page, and each file of the project that holds its subject.
2. For a fact that no source holds, ask the author one question. Ask one question at a time.
3. Write the levels in order, from the plainest to the deepest, with the same headings in the same order. Write 'Basics' first, plain. Then write 'Details' with every fact of 'Basics', told at its depth, and the facts of its own. Then write 'Internals' with every fact of 'Details', and the facts of its own.
4. Write a block that two levels say the same way once, in a fence of both ids, such as `::: details internals`. Never state one fact twice at one level.
5. Leave a level empty when it needs a fact that the page lacks.
6. List each fact of each level, and check that each deeper level gives it. Fix each fact that a deeper level lacks.

The author types "Write the page on restoring a whole folder". The page `docs/05-restore-folder.md` holds only its title, `# Restore a folder`, so the check prints this block for it:

```text
docs/05-restore-folder.md:1  Empty page
   1 │ # Restore a folder
     │ ^^^^^^^^^^^^^^^^^^
```

`docs/02-restore.md` says how a file comes back, but no source says which files a folder restore takes. So Claude asks:

```text
> Write the page on restoring a whole folder

⏺ Does a folder restore also put back the files of its subfolders?

> Yes, all of them, from the same day. The server runs the whole folder as one restore job.
```

Then Claude writes `docs/05-restore-folder.md`:

```md
# Restore a folder

::: basics
Pick a folder and a day, and the app puts back the whole folder from that day.

::: details internals
Pick a folder and a day. The app puts back each file of the folder and of each of its subfolders, and every file comes from the day that you pick.

::: internals
The storage server runs the whole folder as one restore job. It queues the job and sends the file blocks of each file to the agent.
:::

To pick the day, follow [Pick a day](02-restore.md#pick-a-day).
```

'Basics' tells the folder restore in one plain line. 'Details' tells the same facts again, the folder and the day, and adds each file of each subfolder. 'Internals' shows the text of 'Details' through the fence `::: details internals`, and adds the restore job from the author's answer and from `docs/02-restore.md`. The link to 'Pick a day' shows at every level, so it stays outside a fence.

Claude then lists the facts of each level. It finds each fact of 'Basics' at 'Details', and each fact of 'Details' at 'Internals', so no fact is missing. The answer gives the counts:

```text
⏺ Wrote docs/05-restore-folder.md at Basics, Details and Internals.

  Missing facts     0   each deeper level gives every fact of the levels below it
  Problems          0   npx nerddocs check
```

## Split a page into levels

A split puts each block of a page in the fence of its levels. It adds only fence lines, and no word. Each level then tells the sections of the page at its own depth, holds every block of the levels below it, and reads whole on its own.

1. Copy the page to `nerddocs-work/before/`, at its path, such as `nerddocs-work/before/docs/02-restore.md`.
2. Put each block in one fence with the id of its own level and of each deeper level: a plain block at every level, a block of details at 'Details' and 'Internals', and a deep block at 'Internals' only. A block at every level stays outside a fence. A block can move, so that the blocks of one level stand together.
3. Keep a heading that two or more levels share outside a fence, even when only some levels have text under it. Put a heading of one level in the fence of that level.
4. Run this command for the page. It prints each line that the page lost after `<`, and each line that the page gained after `>`. It prints nothing when no line was lost or gained:

   ```sh
   diff <(grep -v '^ \{0,3\}:::' nerddocs-work/before/docs/02-restore.md | sort) <(grep -v '^ \{0,3\}:::' docs/02-restore.md | sort)
   ```

5. Put back each line that the command prints after `<`. Remove each line that it prints after `>`, unless it is a blank line or a heading that the page repeats in the fence of another level. Run the command again, until it prints only such `>` lines.

The author types "Split restore.md into levels". Claude copies the page, written as one text, to `nerddocs-work/before/docs/02-restore.md`:

```md
# Restore a file

Pick a file and a day, and the app puts that copy back.

![Restore window](restore-window.png)

REQ-2.1 The app restores any file from any day of the last 14 days.

REQ-2.2 A restore never changes the copy in storage.

A restore is a job on the storage server. The server queues the job and sends the file blocks to the agent.

## Search index

The agent keeps a list of the file paths of each copy.

## Pick a day

Click a day on the calendar. A day with a copy has a dot.

A copy is open while the backup runs, and closed once the last block is stored.

The rule takes the newest closed copy of that day.
```

Then Claude writes `docs/02-restore.md`:

```md
# Restore a file

Pick a file and a day, and the app puts that copy back.

![Restore window](restore-window.png)

::: details internals
REQ-2.1 The app restores any file from any day of the last 14 days.

REQ-2.2 A restore never changes the copy in storage.

::: internals
A restore is a job on the storage server. The server queues the job and sends the file blocks to the agent.

## Search index

The agent keeps a list of the file paths of each copy.
:::

## Pick a day

Click a day on the calendar. A day with a copy has a dot.

::: internals
A copy is open while the backup runs, and closed once the last block is stored.

The rule takes the newest closed copy of that day.
:::
```

The plain steps go to every level, so they stay outside a fence. The exact rules with a requirement id go to 'Details' and 'Internals'. The work of the server, the deepest text, goes to 'Internals' only. So 'Details' holds every block of 'Basics', and 'Internals' every block of 'Details'. 'Search index' has text at 'Internals' only, so its heading goes inside that fence. 'Pick a day' has text at every level, so its heading stays outside a fence.

## Fill the missing levels

A fill writes each empty level of a page as a plainer or deeper version of the same sections, from the text of its other levels, with no new fact. A level of a page is empty when no text of the page shows at it. The new level reads whole on its own.

- The new level gives every fact of the levels below it, told at its depth.
- It takes the other facts that suit its depth from the nearest deeper level with text. A new lower level can have fewer words and plainer words than that level.
- An empty level deeper than every level with text stays empty. With no new fact, it could only tell the level below it again.

The steps of a fill:

1. Find the empty levels of each page, and write one fill item for each in `nerddocs-work/progress.md`, as [Work on many pages](#work-on-many-pages) shows.
2. Start one writer subagent for each page of the batch, all at the same time, with the first brief below. Give each writer every fill item of its page, so that two writers never write one file.
3. Start one checker subagent for each fill item of the batch, all at the same time, with the second brief below. A checker never checks text that it wrote. In `nerddocs-work/pages/<F-id>.md`, it lists each new fact of the new text, and each fact of a lower level that the new text lacks.
4. For each page with new or missing facts, start its writer again to fix them, and then its checkers. Stop after three rounds of checks.
5. Check off the fill items of each page once its checks are done, and print one line for the batch.

A level that needs a fact that the page lacks stays empty, with the reason 'needs facts the page lacks'.

The author types "Fill the missing levels". The 'Encryption' page has text at 'Details' and 'Internals' only. Claude writes its 'Basics' part from its 'Details' part, in `docs/04-encryption.md`:

```md
# Encryption

::: basics
The agent locks each copy before the copy leaves the PC. Only your password opens it.

::: details internals
REQ-4.1 The agent encrypts each copy with AES-256 before the copy leaves the PC.

REQ-4.2 Only the password of the user opens the key of a copy.

::: internals
The key of each copy is wrapped with a key made from the password, with Argon2id.
:::
```

The new part tells the same section as 'Details', in plainer words. It leaves out 'AES-256' and the requirement ids, and adds no fact. 'Details' gives both facts of the new part, and 'Internals' shows the text of 'Details', so no level misses a fact of the levels below it.

The batch lines and the counts read as follows:

```text
> Fill the missing levels

⏺ Batch  1 of 21   20 levels   new facts 1, missing facts 2, left 0
  ⋮
⏺ Batch 21 of 21    2 levels   new facts 0, missing facts 0, left 0

⏺ Filled 318 of 402 empty levels. Full report: nerddocs-work/report.md

  Filled          318
  Empty            84   need facts the pages lack
  New facts         0
  Missing facts     0
  Problems          0
```

'New facts' and 'missing facts' count the lines that the checkers of the batch listed, and 'left' counts those that stay after three rounds.

Fill in each `<...>` of these briefs, and pass each brief on as the whole prompt of its subagent.

```text
Read .claude/skills/nerddocs/format.md and the page <new path>.
Write one file: the page <new path>.

Write the text of each of these empty levels of the page, from the text of its other levels: <the fill items of the page, such as F001 basics>.
- Write each level as a plainer or deeper version of the same sections, at the depth of the level.
- Give every fact of the levels below the level, told at its depth. Take the other facts that suit its depth from the nearest deeper level with text.
- Add no fact. A fact is a number, a name, a limit, a step, a rule or a claim. Fewer words and plainer words are fine.
- When the level says a block of another level the same way, add the id of the level to the fence of that block, and write no copy of it. Never state one fact twice at one level.
- Each level reads whole on its own, with the same headings in the same order as the other levels.
- A heading that two or more levels share stays outside a fence, even when only some levels have text under it.
- When a level needs a fact that the page lacks, leave that level empty. An empty level deeper than every level with text always needs such a fact.
<In round 2 or 3: Fix each unchecked line of nerddocs-work/pages/<F-id>.md, and check it off. Remove each new fact from the new text, and add each missing fact to it.>

Answer in one line: <new path> done: filled <F-ids or none>, empty <F-ids or none>
```

```text
You did not write this text. Read the page <new path>.
Write one file: nerddocs-work/pages/<F-id>.md.

List each fact of the level <level id> that the nearest deeper level with text lacks, as - [ ] New: <fact>.
List each fact of a level below <level id> that <level id> lacks, as - [ ] Missing: <fact>.
A fact is a number, a name, a limit, a step, a rule or a claim. A fact told in other words is the same fact.

Answer in one line: <F-id> done: new facts 0, missing facts 0, or <F-id> new facts <count>, missing facts <count>
```

## Work on many pages

A fill always runs from `nerddocs-work/progress.md`. A split runs from it only on more than 20 pages, as [SKILL.md, section "Work on many pages"](SKILL.md#work-on-many-pages) says. [move.md, section "The progress log"](move.md#the-progress-log) gives the formats of its lines.

- A split adds `## Split` to `progress.md`, with one page item for each page, in batches of 20. Check off each page item once the diff command prints only the `>` lines that step 5 keeps.
- A fill adds `## Fill` to `progress.md`, with the item `- [ ] Find the empty levels`, then one `### Batch <n>` for each 20 fill items, then `- [ ] Write the report`. A fill item names a page and one empty level of it.

The fill of the backup app makes `nerddocs-work/progress.md` this:

```text
# Fill of docs/

To go on, run the progress script and do the item that it prints after 'Next:'.

## Fill

- [x] Find the empty levels

### Batch 1

- [ ] F001 docs/04-encryption.md basics

- [ ] Write the report
```

The move of the backup app left one empty level, 'Basics' of 'Encryption'. When a session picks the work up, its first line names the fill items, such as `nerddocs-work/progress.md: 0 of 1 levels done. Batch 1 of 1 is next.`

Each level that stays empty goes in `nerddocs-work/report.md`, with its reason. After the last item, say that the folder `nerddocs-work/` can go.
