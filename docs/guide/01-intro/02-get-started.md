# Get started

::: casual
One command, one small file and a few marked lines turn a folder of Markdown files into a site with levels. You need no nerd skills for it.

::: pro
These steps take a folder of Markdown files to a site with levels. They need one command, the small file `nerddocs.json` and a few fence lines. The examples come from the docs of a backup app, in the folder `backup-app/docs`.

::: full-nerd
These steps take a folder of Markdown files to a site with levels, with every option and rule of each step. You picked 'Full nerd', so nothing is left out. The steps need one command, `npx nerddocs`, the small file `nerddocs.json` and a few fence lines. The examples come from the docs of a backup app, in the folder `backup-app/docs`.
:::

## Run nerDDocs

::: casual
Run one command in a clone of nerDDocs, and name the folder of your docs. Your browser opens them as a site.

::: pro full-nerd
Set up a clone, as [CONTRIBUTING.md](https://github.com/true-byte/nerDDocs/blob/master/CONTRIBUTING.md#set-up-a-clone) says. Then run this command in the clone, with the folder of your docs:

```sh
npx nerddocs ../backup-app/docs
```

The command prints the address of the site and its author address, and opens the author address in your browser. Each folder becomes a row of the contents panel, and each Markdown file becomes a page. With no folder, the command shows `./docs`, or the current folder when `./docs` is missing. Press `Ctrl+C` to stop it.

::: full-nerd
| Argument | What it does |
|---|---|
| `check` | As the first argument, checks the folder once, prints each problem and stops. |
| `[folder]` | Sets the folder to show. |
| `--port <port>` | Sets the first port to try. A busy port moves to the next port. The default is `4000`. |
| `--no-open` | Keeps the browser closed. |

File names set the order, so `01-restore.md` comes before `02-schedules.md`. A prefix of up to three digits and then `-`, `_`, `.` or a space sets only the order, and stays out of the address: `01-backups/01-restore.md` opens at `/backups/restore.html`. The first heading of a file is its title. Dot folders, dot files and `node_modules` stay out of the site.
:::

## Set the levels

::: casual
A file named `nerddocs.json` lists the levels, from plain to deep, such as 'Basics', 'Details' and 'Internals'.

::: pro full-nerd
Write a file named `nerddocs.json` in the docs folder. It lists the levels in the order of the slider, from plain to deep:

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

The stop of each level shows its icon and a name that comes from its id, such as 'Basics'. Each level of the backup app tells the same pages at its own depth. It holds every fact of the levels before it and adds its own: 'Basics' says what to click, 'Details' adds every option and limit, and 'Internals' adds how the app works inside.

::: full-nerd
Each level needs an `id` of letters, digits, `-`, `_` and `.`. Every other key is optional. A `name` key sets another name for the stop, and without it `on-call` shows as 'On call'. The `icon` is one of `eye`, `list`, `cpu`, `brief`, `code`, `flask`, `book` and `clock`, and a level with none shows the first letter of its name in a circle. `defaultLevel` sets the level that a page opens at, and the first level is the default. With `"levels": false`, the site has no levels and no slider.
:::

## Write a page

::: casual
In a page, a line such as `::: basics` starts the text of a level. Text with no such line shows at every level.

::: pro full-nerd
Write the file `01-restore.md` in the docs folder. The page holds its text at each level, from plain to deep:

```md
# Restore a file

::: basics
Pick a file and a day, and the app puts that copy back.

::: details internals
Pick a file, then click a day on the calendar. A day
with a copy has a dot. The app restores any file from
any day that it still keeps a copy of.

::: internals
A restore is a job on the storage server. It takes the
newest closed copy of the day that you click.
:::

A restore never changes the copy in storage.
```

A line with `:::` and level ids opens the text of those levels, and a line with `:::` alone closes it. The last line has no fence, so it shows at every level.

'Details' tells again, deeper, how to pick a file and a day. 'Internals' shares the part `::: details internals`, so it holds every fact of 'Details'. Click 'Restore a file' in the contents panel and move the slider to 'Internals'. Under the steps of 'Details', the page tells the restore as a job on the storage server.

::: full-nerd
These rules hold for each fence:

- A new fence closes the part before it, and the end of the file closes an open part.
- A fence starts at the left margin, with at most three spaces before it.
- A fence line inside a code block stays text.
- A fence line with an id that `nerddocs.json` does not list stays text.
- A fence goes between blocks only, so a list or a table goes whole in each part.
- A heading that two or more levels share stays outside a fence, and it hides at a level with no text under it.
- A level with no text on a page shows no stop on the slider of that page.
:::

## Check the page

::: casual
Save the file, and the browser shows the change at once. A pill in a corner counts the problems of the docs, such as a broken link.

::: pro full-nerd
In the browser at the author address, each save moves the page to the change. A line draws through the words that leave, and the new words fade in. A pill in a corner of the window shows the count of problems, such as a broken link, and a click on it opens their list.

To check the docs in a terminal or in a CI job, run this command in the clone:

```sh
npx nerddocs check ../backup-app/docs
```

It prints each problem and the count of problems. It exits with `1` when the docs have a problem, so a CI job fails.

::: full-nerd
The check finds links to pages or headings that the docs lack, as 'Missing page' and 'Missing heading'. It also finds a page with no text, as 'Empty page', and a heading with no text after it at a level, as 'Empty heading'. Each problem prints as a block: the path and the line, the name of the problem and its value, then the source line with carets under its words. A browser at the plain address shows no pill and no problems, as a reader sees the docs.
:::

## Write with Claude

::: casual
Claude can write each level of your pages, or move your old docs into nerDDocs, with no facts of its own.

::: pro full-nerd
Install the `nerddocs` skill in the folder of your project:

```sh
npx skills add https://github.com/true-byte/nerDDocs \
  --skill nerddocs -a claude-code --copy
```

Then ask Claude, such as "Write the page on restoring a whole folder", "Move old-docs/ into nerDDocs", "Split restore.md into levels" or "Fill the missing levels". A move keeps the words of your old docs. Each new fact comes from your docs, your words or the files of your project.

::: full-nerd
A move and a fill run from the folder `nerddocs-work/`, next to the docs folder, in batches of 20. A fresh session picks the work up from `nerddocs-work/progress.md`. A level that needs a fact that the page lacks stays empty. Each answer of Claude comes after a run of `npx nerddocs check`, and the last answer of a job comes with `Problems: 0`.
:::
