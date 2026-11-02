# nerDDocs

This doc covers what nerDDocs is, how to run it, how to write text at several levels and how to see its plan.

nerDDocs is an open-source documentation platform. Each page holds its text at several levels, and the reader moves a slider on the page to switch between them. The author names the levels, and moving to another level changes the text of the page.

A book can come at third-grade, high-school and university levels. Technical docs can come at levels for managers, developers and testers.

## Run nerDDocs

Set up a clone, as [CONTRIBUTING.md](CONTRIBUTING.md#set-up-a-clone) says. Then run this command in the clone:

```sh
npx nerddocs
```

The command shows `./docs` as a site, prints its address and opens it in your browser. Press `Ctrl+C` to stop the command.

To show the docs of the backup app from another folder, run this command:

```sh
npx nerddocs ../backup-app/guide
```

| Argument | What it does |
|---|---|
| `[folder]` | Sets the folder to show. The default is `./docs` when it exists, and the current folder otherwise. |
| `--port <port>` | Sets the first port to try. A busy port moves to the next port. The default is `4000`. |
| `--no-open` | Keeps the browser closed. |

Each folder becomes a section of the contents panel, and each Markdown file becomes a page. The first heading of a file is its title, and the file name is the title of a file with no heading.

File names set the order, so `01-restore.md` comes before `02-schedules.md`. A file named `index.md` or `README.md` comes first in its folder. Dot folders, dot files, `node_modules` and a top folder named `__nerddocs` stay out of the site.

Each save of a Markdown file or of `nerddocs.json` shows on the open site with no reload, and the reader stays at the same place on the page.

## Write text at several levels

Levels need a file named `nerddocs.json` in the folder that the command shows. The file lists the levels:

```json
{
  "levels": [
    { "id": "overview", "name": "Overview", "icon": "eye" },
    { "id": "requirements", "name": "Requirements", "icon": "list" },
    { "id": "internals", "name": "Internals", "icon": "cpu" }
  ],
  "defaultLevel": "overview"
}
```

| Key | What it does |
|---|---|
| `levels` | Lists the levels in the order of their stops on the slider. Each level needs an `id`. Set it to `false` for a site with no levels. |
| `name` | Sets the name that the stop shows. The default comes from the id, so `on-call` shows as 'On call'. |
| `icon` | Sets the icon of the stop: `eye`, `list`, `cpu`, `brief`, `code`, `flask`, `book` or `clock`. The default is the first letter of the name in a circle. |
| `defaultLevel` | Sets the level that a page opens at. The default is the first level. |
| `wordsPerMinute` | Sets the reading speed that the read time uses, as a number above 0. The default is `238`. |

Every key except `id` is optional. A level id holds letters, digits, `-`, `_` and `.`.

The file decides what a page shows:

| File | What the page shows |
|---|---|
| The file is missing | A modal with the title 'No nerddocs.json'. No slider shows, and each fence line shows as text. |
| The file is broken or cannot be read | A modal with the title 'Broken nerddocs.json'. No slider shows, and each fence line shows as text. |
| The file lists no levels, or has `"levels": false` | No modal shows. No slider shows, and each fence line shows as text. |
| The file lists one level | No modal shows. No slider shows, and the text of that level shows with no fence line. |
| The file lists two or more levels, and the page has no part | The toolbar says 'No levels on this page'. |

To keep a site with no levels free of the modal, write `{ "levels": false }` in the file. The box 'Don't show again' in the modal holds for that browser only.

### Mark text with fences

A fence marks text for one or more levels. A line with `:::` and level ids opens a part, and a line with `:::` alone closes it.

This file is the 'Restore a file' page of the backup app:

```md
# Restore a file

::: overview
Pick a file and a day, and the app puts that copy back.

::: requirements
The app restores any file from any day that it still keeps a copy of.

::: internals
A restore is a job on the storage server.
:::

## Pick a day

::: overview requirements
Click a day on the calendar. A day with a copy has a dot.

::: internals
The rule takes the newest closed copy of that day.
:::

A restore never changes the copy in storage.
```

These rules hold for each fence and each part:

- Text outside a fence shows at every level.
- A new opening fence closes the part before it, and the end of the file closes an open part.
- A fence starts at the left margin, with at most three spaces before it.
- A fence line inside a code block stays text.
- A fence line with an id that `nerddocs.json` does not list stays text on its own line. It neither opens nor closes a part.
- A line with `:::` alone stays text on its own line when no part is open.
- A heading inside a fence never becomes the title of the page.
- A top-level shared heading or `<details>` hides at a level with no text in it, when another level has text there. The text of a heading runs to the next heading of the same or higher rank.

To show a line with `:::` inside a part, write `\:::`. The page prints `:::`, and the part stays open.

A fence goes between blocks only. Write a list or a table whole in each part, and write a changed sentence as a whole paragraph in each part.

### See which level a page opens at

A page opens at the level that you last chose for it in this tab. With no such level, it opens at your default level, and otherwise at the level that `defaultLevel` sets. A page with no text at that level opens at the nearest lower level with text, or else at the nearest higher level with text.

After a move of the slider, the button 'All pages' sets the current level as your default. The 'Defaults' button sets any level as your default. When a page that you moved would open at another level, the modal 'Change 2 pages?' lists each such page first. Your default holds in this browser, and it replaces the level that you chose for each page.

### See the read time

On a wide window, each stop of the slider shows the read time of the page at that level. On a phone, the row above the slider shows the read time of the current level.

The clock button opens a box with a table. The table gives the read time of each level on 'This page' and on 'All pages'.

The read time shows next to the title after a click on 'Hide panel', and on a page with no slider.

The read time counts the words and images that a level shows, with text in code blocks and tables. A word is any text between spaces that holds a letter or a digit, in every language. Each image adds 12 seconds. The title counts when the level shows a word or an image. A read time rounds up to a whole minute.

### Read the terminal lines

The command prints each problem in the terminal:

| Line | What it means |
|---|---|
| `Missing config: <file>` | The folder has no `nerddocs.json`. |
| `Bad config: <file>` | `nerddocs.json` is not valid. |
| `Cannot read: <file>` | The command cannot read a file or a folder of the site, such as `nerddocs.json`. |
| `Unknown level: <id> <file>` | The file uses an id that `nerddocs.json` does not list. A fence line with that id stays text. |
| `Unknown icon: <name> <file>` | `nerddocs.json` names an icon outside the list. The level shows its default icon. |

## See the plan

Set up a clone, as [CONTRIBUTING.md](CONTRIBUTING.md#set-up-a-clone) says. Then run this command in the clone:

```sh
npx roadmapper dev roadmap/roadmap.json
```

Open the address that the command prints. The page shows the plan and redraws it each time `roadmap/roadmap.json` is saved.

## Learn more

| Subject | Doc |
|---|---|
| What readers, authors, teams and AI tools do with nerDDocs | [docs/use-cases.md](docs/use-cases.md) |
| The parts that nerDDocs is built from | [docs/tech-stack.md](docs/tech-stack.md) |
| How to work on nerDDocs | [CONTRIBUTING.md](CONTRIBUTING.md) |
| The license, MIT | [LICENSE](LICENSE) |
