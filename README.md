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

The folder works with no config file. Each folder becomes a section of the contents panel, and each Markdown file becomes a page. The first heading of a file is its title, and the file name is the title of a file with no heading.

File names set the order, so `01-restore.md` comes before `02-schedules.md`. A file named `index.md` or `README.md` comes first in its folder. Dot folders, dot files, `node_modules` and a top folder named `__nerddocs` stay out of the site.

Each save of a Markdown file or of `nerddocs.json` shows on the open site with no reload, and the reader stays at the same place on the page.

## Write text at several levels

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

Text outside a fence shows at every level. A new opening fence also closes the part before it, and the end of the file closes an open part. A fence starts at the left margin, with at most three spaces before it. A fence line inside a code block stays text.

A level id holds letters, digits, `-`, `_` and `.`. A heading inside a fence never becomes the title of the page.

To name the levels, put a file named `nerddocs.json` in the folder that the command shows:

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
| `levels` | Lists the levels in the order of their stops on the slider. Each level needs an `id`. |
| `name` | Sets the name that the stop shows. The default comes from the id, so `high-school` shows as 'High school'. |
| `icon` | Sets the icon of the stop: `eye`, `list`, `cpu`, `brief`, `code`, `flask`, `book` or `clock`. The default is the first letter of the name in a circle. |
| `defaultLevel` | Sets the level that a page opens at. The default is the first level. |

Every key except `id` is optional, and the file itself is optional. A level id that the file does not list follows the listed levels, in order of first use across the pages. A site with fewer than two levels shows no slider.

The command prints each problem in the terminal:

| Line | What it means |
|---|---|
| `Bad config: <file>` | The file is not valid, and the site runs as if the file listed no levels. |
| `Unknown level: <id> <file>` | The file uses an id that `nerddocs.json` does not list. The id still shows as a level. |
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
