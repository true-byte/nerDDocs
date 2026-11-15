# Write levels

::: casual
A page can hold its text at several levels, from plain to properly nerdy, such as 'Basics', 'Details' and 'Internals'. One small file names the levels, and short lines in each page mark the text of each level.

::: pro full-nerd
A page holds its text at several levels, from plain to deep. The levels of a site come from two places. The file `nerddocs.json` lists them, and fence lines in each page mark the text of each level. The examples come from the docs of a backup app, with the levels 'Basics', 'Details' and 'Internals'.

::: full-nerd
This page gives every key of the file, every rule of a fence and what the page shows in each case, even the odd ones.
:::

## List the levels

::: casual
A file named `nerddocs.json` lists the levels, from plain to deep, and gives each one its name. The slider on a page shows a stop for each level that has text on that page.

::: pro full-nerd
Write a file named `nerddocs.json` in the folder that [the command](../01-intro/02-get-started.md#run-nerddocs) shows. It lists the levels from plain to deep, in the order of their stops on the slider:

```json
{
  "levels": [
    { "id": "basics", "icon": "eye" },
    { "id": "details", "icon": "list" },
    { "id": "internals", "icon": "cpu" }
  ],
  "defaultLevel": "basics"
}
```

::: pro
Each level needs an `id`, which the fence lines of the pages name. The stop of a level shows its `icon`, one of `eye`, `list`, `cpu`, `brief`, `code`, `flask`, `book` and `clock`. It also shows a name that comes from the id, so `basics` shows as 'Basics', and a `name` key sets another name. A page opens at the `defaultLevel`, and its slider shows a stop only for each level with text on that page.

With no `nerddocs.json`, the page opens a modal with the title 'No nerddocs.json', shows no slider and shows each fence line as text. For docs with no levels, write `{ "levels": false }` in the file, and no modal opens.

::: full-nerd
| Key | What it does |
|---|---|
| `levels` | Lists the levels in the order of their stops on the slider. `false` makes a site with no levels. |
| `id` | Names the level in the fence lines of the pages. Each level needs an `id`, and no two levels share one. |
| `name` | Sets the name that the stop shows. The default comes from the id, so `basics` shows as 'Basics' and `on-call` as 'On call'. An id of marks alone, such as `_`, shows as itself. |
| `icon` | Sets the icon of the stop: `eye`, `list`, `cpu`, `brief`, `code`, `flask`, `book` or `clock`. The default is the first letter of the name in a circle. |
| `defaultLevel` | Sets the level that a page opens at. The default is the first level. |
| `wordsPerMinute` | Sets the reading speed that the read time uses, as a number above 0. The default is `238`. |
| `textWidth` | Sets the characters on a line of text, as a number above 0. The default is `75`. |
| `dimensions` | Lists the top folders that split the site, in the order of the list. Each one has a `folder` and an optional `name`, as [Dimensions](02-organize-pages.md#dimensions) says. |

Every key except `id` and the `folder` of a dimension is optional. An id holds letters, digits, `-`, `_` and `.`, with no space or quote, since the page puts it in an attribute of each part and in a style rule. An icon outside the list gives the problem 'Unknown icon', and the stop shows the default icon. A `defaultLevel` that `levels` does not list gives 'Unknown level', and a page opens at the first level.

The file decides what a page shows:

| File | What the page shows |
|---|---|
| The file is missing | A modal with the title 'No nerddocs.json'. No slider shows, and each fence line shows as text. |
| The file is broken or cannot be read | A modal with the title 'Broken nerddocs.json'. No slider shows, and each fence line shows as text. |
| The file is empty, lists no levels, or has `"levels": false` | No modal shows. No slider shows, and each fence line shows as text. |
| The file lists one level | No modal shows. No slider shows, and the text of that level shows with no fence line. |
| The file lists two or more levels, and the page has no part | The toolbar says 'No levels on this page'. |
| The file lists two or more levels, and the page has text at one of them | The toolbar shows no stops. |
| The file lists two or more levels, and the page has text at two or more of them | The slider shows a stop for each level with text on the page, in the order of `levels`. |

The check prints 'Missing config' for a missing file, 'Cannot read' for a file that it cannot read, and 'Bad config' for a broken file. These values make the file broken:

- Text that is not one JSON object.
- A `levels` that is neither a list nor `false`.
- A level with no `id`, or with an `id` that holds a character other than a letter, a digit, `-`, `_` or `.`.
- Two levels with the same `id`.
- A `name`, an `icon` or a `defaultLevel` that is empty or is not text.
- A `wordsPerMinute` or a `textWidth` that is not a number above 0.
- A `dimensions` list with an empty `folder`, a `folder` that holds `/`, or one `folder` twice.

To keep a site with no levels free of the modal, write `{ "levels": false }` in the file. The box 'Don't show again' in the modal holds for that browser only.
:::

## Mark text with fences

::: casual
In a page, a fence line such as `::: basics` starts the text of a level, and a line with `:::` alone ends it. Text with no fence line before it shows at every level.

::: pro full-nerd
A fence marks text for one or more levels. A line with `:::` and level ids opens a part, and a line with `:::` alone closes it. This file is the 'Restore a file' page of the backup app:

```md
# Restore a file

::: basics
Pick a file and a day, and the app puts that copy back.

::: details internals
Pick a file, then pick any day that still has a copy.
The app puts the copy of that day back.

::: internals
A restore is a job that the storage server runs.
:::

## Pick a day

Click a day on the calendar. A day with a copy has
a dot.

::: internals
The rule takes the newest closed copy of that day.
:::

A restore never changes the copy in storage.
```

At 'Basics', the page shows the text of each part that names `basics`, and the text outside the fences. 'Details' holds every fact of 'Basics', and 'Internals' holds every fact of 'Details', as [Build each level on the one below](#build-each-level-on-the-one-below) says. So the part `::: details internals` shows the text of 'Details' at 'Internals' too, and the part `::: internals` after it adds the job on the storage server. Under 'Pick a day', the calendar line and the last line have no fence, so they show at every level.

::: pro
A fence line starts at the left margin, and a fence line inside a code block stays text.

::: full-nerd
These rules hold for each fence line and each part:

- A new opening fence closes the part before it, and the end of the file closes an open part.
- A fence starts at the left margin, with at most three spaces before it.
- A fence line inside a code block stays text.
- A fence line with an id that `nerddocs.json` does not list stays text on its own line, and gives the problem 'Unknown level'. It neither opens nor closes a part.
- A line with `:::` alone stays text on its own line when no part is open.

To show a line `:::` inside a part, write `\:::`. The page prints `:::`, and the part stays open.
:::

## Share text between levels

::: casual
Text that every level says the same way, such as a heading, needs no fence line. A heading hides at a level that has no text under it.

::: pro full-nerd
Text outside a fence shows at every level. A heading outside a fence, though, hides at each level with no text under it. In this section of 'Restore a file', only 'Internals' has text:

```md
## Search index

::: internals
The agent keeps a list of the file paths of each copy.
:::
```

::: pro
At 'Basics' and 'Details', the heading 'Search index' hides. A fence goes between blocks only, so write a list or a table whole in each part, and write a changed sentence as a whole paragraph in each part.

::: full-nerd
These rules hold for text that levels share:

- A part that names two or more ids, such as `::: details internals`, shows at each of those levels.
- A heading at the top level of the page, outside any fence, list or quote, hides at each level with no text in its section, when another level has text there. The section of a heading runs to the next heading of the same or higher rank.
- A `<details>` at the top level of the page hides the same way, at each level with no text inside it.
- A heading inside a fence shows only at the levels of its part, and never becomes the title of the page.
- A fence goes between blocks only. Write a list or a table whole in each part, and write a changed sentence as a whole paragraph in each part.

So 'Search index' shows at 'Internals' only.
:::

## Build each level on the one below

::: casual
You name the levels. When they go from plain to deep, each level tells all that the levels below it tell, and adds more. So a reader picks one level and never needs another.

::: pro full-nerd
The author names the levels, so they fit any text that comes in levels. Levels that go from plain to deep build on each other, such as a book at third-grade, high-school and university levels. Each level tells the same sections at its own depth, holds every fact of the levels below it and adds facts of its own, so a reader picks one level and never needs another. Levels by audience, such as technical docs at levels for managers, developers and testers, need not build on each other.

::: pro
A block of a lower level shows at each deeper level too. Put it in a part that names each of those levels, such as `::: details internals`, or tell it again at each deeper level in its own words, with every fact of it. In 'Restore a file', the part `::: details internals` shows the text of 'Details' at 'Internals' too, and 'Internals' adds the job on the storage server.

::: full-nerd
At a level, the page shows only the parts that name that level and the text outside the fences. So a block of a lower level shows at each deeper level in one of two ways:

- A part names each level that shows the block, such as `::: details internals`. The part of the deeper level after it adds only its new facts, and never says the block again.
- The part of each deeper level tells the block again in its own words, with every fact of it. A move of the slider then changes the text of the page, not only adds or removes parts.

Text that every level says the same way goes outside the fences, as [Share text between levels](#share-text-between-levels) says.

In 'Restore a file', 'Details' holds the file, the day and the copy that 'Basics' names, and adds that the day must still have a copy. The part `::: details internals` shows that text at 'Internals' too, and the part `::: internals` after it adds the job on the storage server. Under 'Pick a day', the calendar line has no fence, so every level shows it, and 'Internals' adds the rule for the copy of a day.
:::
