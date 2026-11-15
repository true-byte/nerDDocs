# Check the docs

::: casual
While you write, your browser shows each change as you save it, and each problem of your docs. One command also checks all the docs at once, so a broken link never reaches a reader.

::: pro
The author browser shows each save and each problem of the docs while you write. `npx nerddocs check` checks the whole docs folder from a terminal or a CI job, so a broken link never reaches a reader. The examples come from the docs of a backup app, in the folder `backup-app/docs`, with the levels 'Basics', 'Details' and 'Internals'.

::: full-nerd
The author browser shows each save and each problem of the docs while you write, and `npx nerddocs check` checks the whole docs folder from a terminal or a CI job, so a broken link never reaches a reader. These sections give every rule of both, and every single line that the command prints. The examples come from the docs of a backup app, in the folder `backup-app/docs`, with the levels 'Basics', 'Details' and 'Internals'.
:::

## See your saves

::: casual
When you run nerDDocs, it opens your browser at its author address. In this author browser, each save shows on the page at once. The page moves to the change, a line draws through the words that leave, and the new words fade in. Any other browser shows the new text as a reader sees it.

::: pro full-nerd
The command prints two addresses, and opens your browser at the second one:

```text
Address: http://127.0.0.1:4000/
Author address: http://127.0.0.1:4000/__nerddocs/author/kq3Vb8TzX1wN0pLm5RcY2dHf7sJgA4eU
```

The browser that opens the author address is the author browser. It alone shows the changes of each save and the problems of the docs. Any other browser is a reader browser. It shows each save as a reader sees it, and stays at the same place on the page. Each save of a Markdown file or of `nerddocs.json` shows in both browsers with no reload. Each run of the command has a new author address.

When you save the open page, the author browser shows the change. Say that 'Restore a file' is open at 'Basics', and you save new words in the 'Internals' paragraph under 'Pick a day'. The page moves to 'Internals'. When the paragraph is out of view, the page scrolls it to the line 30% down the window. The old text shows for a moment, and then the paragraph changes:

| Change | What the page shows |
|---|---|
| Words of a paragraph | A line draws through each word that leaves. The new words then fade in on a tint. |
| Lines of a code block or a box diagram | The new code shows, and each new line sits on a band of the tint. |
| An image | The new image fades in over the old one once it loads. |
| A Mermaid diagram | The new drawing fades in over the old one once it draws. Each new node shows a thick ring. |
| A new block | The block grows into its place, and its text sits on the tint. |
| A removed block | The block fades out, and its place closes. |
| Any other change | The new block fades in over the old one. |

::: full-nerd
A bar stands left of each changed block. The bar and the tint take the color of the level, or gray for text that every level shows. Both fade within 3 seconds. With reduced motion on the computer, the page moves at once, and the bar and the tint show for 1.5 seconds.

When a save holds pages other than the open one, the author browser does this:

| What you save | What the author browser does |
|---|---|
| The open page and other pages | It shows the change on the open page. |
| One page that is not open | It opens that page with its old text, and then shows the change. |
| Several pages that are not open | It stays on the open page. |

A row of the contents panel shows a dot for each page that changed since you last opened it. A shut folder row shows the dot when it holds such a page, and so does a dimension in the list of dimensions. The dot goes when you open the page.

::: pro full-nerd
Left of each part, every browser shows the icons of its levels. Under them, a dashed icon stands for each other level that has hidden text at that place. At 'Basics', the paragraph under 'Pick a day' shows a dashed 'Internals' icon, since 'Internals' adds a paragraph of its own there. Click a dashed icon to move to its level. Its text then sits where the icon was.
:::

## Run the check

::: casual
One command checks the links and the text of every page. It finds links to pages or headings that the docs lack, pages with no text, and headings with no text after them. It prints each problem, then the count of problems. A CI job that runs the check fails when the docs have a problem.

::: pro full-nerd
Run this command in the clone, with the folder of your docs:

```sh
npx nerddocs check ../backup-app/docs
```

With no folder, the command checks `./docs` when it exists, and the current folder otherwise. It prints each problem as a block, then the count of problems, such as `Problems: 1`, and stops. It starts no server and opens no browser.

From a clone in `/work/nerDDocs`, the check prints this block for the 'Schedules' page. The heading 'Keep old copies' sits in the fence of 'Basics' and 'Details', and has no text after it at those levels:

```text
/work/backup-app/docs/02-schedules.md:18  Empty heading  Basics, Details
  18 │ ## Keep old copies
     │ ^^^^^^^^^^^^^^^^^^
  20 │ ::: internals
```

::: full-nerd
The first line of a block is its head. It holds the path of the file and its line, the name of the problem, and its value or the levels that have the problem. The next line is the source line, with its number, and the carets under it mark the words of the problem. The gray last line is the fence line of the hidden part. Each path is relative to the folder that the command runs in. A path outside that folder prints in full, as the path of the backup app does in the block above.

::: pro full-nerd
The check finds these problems in the links and the text of the pages:

| Problem | Value | What it finds |
|---|---|---|
| 'Missing page' | The link | A link to a Markdown file that is no page of the docs, such as `[Undo a restore](undo.md)`. |
| 'Missing heading' | The link | A link to a heading that its page lacks, such as `01-restore.md#pick-a-time`. With a level in the hash, such as `#basics/pick-a-day`, the heading must show at that level. |
| 'Empty page' | None | A page with no text at any level, such as a page that holds only its title. |
| 'Empty heading' | The levels | A heading in a fence with no text after it at a level of the fence, before the next heading of its rank or higher. |

::: full-nerd
A heading outside a fence hides at each level with no text under it, when another level has text there. When no level has text under it, it gives 'Empty heading'. A part that replaces the hidden part counts as text. Say that a paragraph in `::: details internals` follows the part at 'Internals' under 'Keep old copies'. Then the block of 'Empty heading' names only 'Basics'.

The check also prints each problem that [Read the terminal lines](#read-the-terminal-lines) lists.

::: pro full-nerd
The command exits with `0` when the docs have no problem, and with `1` when they have one, so a CI job fails on a problem. In a terminal, the blocks have colors. Set the variable `NO_COLOR` to print them with no color.
:::

## See the problems

::: casual
The author browser also shows the problems of the docs. A pill in a corner of the window counts them, and a click on it opens their list. A wavy line marks the words of each problem on the page. A click on a problem in the list brings its words into view. A reader browser shows none of this.

::: pro full-nerd
The author browser shows the problems that [Run the check](#run-the-check) finds. A reader browser shows no pill, no list and no wavy line.

A pill in the bottom-right corner of the window shows a warning icon and the count of problems. With no problem, no pill shows. On a phone, the pill sits above the slider.

Click the pill to open the list of problems, and click it again or press `Esc` to shut it. The list stays open on each page that opens in the same tab. The problems of the open page come first, and each other page follows under its title. Click the title of a page to fold or unfold its rows.

Each row shows the name of the problem, the icon of each level that has it, its value, and its file with its line. Say that you save the 'Schedules' page with the heading 'Keep old copies' of [Run the check](#run-the-check). Then an 'Empty heading' row shows the 'Basics' and 'Details' icons.

When a save adds a problem, the list opens by itself. Uncheck 'Pop up' at the foot of the list to keep it shut. The browser keeps this choice.

::: full-nerd
With more than 20 problems, each page but the open one starts folded.

A save that only fixes problems never opens the list. A line then draws through each fixed row, and the rows fly out of the list. When the last problem is fixed, the list or the pill shows 'No more problems' for 1.5 seconds and then goes.

::: pro full-nerd
The text of the open page shows a wavy line under the words of each problem, at the levels that have it. A click does this:

| Click | What happens |
|---|---|
| A row of the open page | The page moves to a level where the problem shows and brings its words into view. The words then flash. |
| A row of another page | That page opens and does the same. |
| A row of a file with no page, such as `nerddocs.json` | The file opens in your editor. |
| The file and the line at the end of a row | The file opens in your editor at that line. |

::: full-nerd
The command picks the editor in this order:

1. The program that the variable `LAUNCH_EDITOR` names. It gets the file, the line and the column.
2. A common editor that already runs on the computer, such as VS Code, Cursor, Zed, Sublime Text, Vim, Emacs or a JetBrains editor.
3. The program that the variable `VISUAL` names, or else `EDITOR`.

When no editor opens, the terminal prints `Cannot open editor: <file>`.
:::

## Read the terminal lines

::: casual
While the command runs, the terminal shows each problem of the docs once at the start, and after each save only the new ones. A problem of the command itself, such as a folder that does not exist, prints one line.

::: pro full-nerd
While the command runs, it prints each problem of the docs as a block, as [Run the check](#run-the-check) shows. It prints the problems once at the start. After each save, it prints only the problems that the docs did not have before the save.

::: full-nerd
The blocks go to standard error, each followed by an empty line. Besides the problems of links and text in [Run the check](#run-the-check), the command and the check print these problems of the docs:

| Problem | Value | What it finds |
|---|---|---|
| 'Missing config' | None | The folder has no `nerddocs.json`. |
| 'Bad config' | None | `nerddocs.json` is not valid. |
| 'Cannot read' | None | The command cannot read a file or a folder of the docs, such as `nerddocs.json`. |
| 'Duplicate page' | None | A Markdown file gives the address of a page before it, such as `restore.md` after `restore.MD`. It stays out of the site. |
| 'Unknown level' | The id | A fence line of a page, or `defaultLevel` of `nerddocs.json`, names an id that `nerddocs.json` does not list. A fence line with that id stays text. |
| 'Unknown icon' | The icon | `nerddocs.json` names an icon outside [the list of icons](03-write/01-write-levels.md#list-the-levels). The level shows its default icon. |
| 'Missing dimension' | The folder | `nerddocs.json` lists a folder that is missing or holds no page. The list of dimensions leaves it out. |
| 'Outside dimensions' | None | A Markdown file or a folder of pages sits outside every folder that `dimensions` lists. It stays out of the site. |
| 'Missing file' | The target | A page shows an image, a wireframe or an OpenAPI file that is missing or outside the docs folder. A path with a name that starts with a dot, or with the name `node_modules`, counts as outside. |
| 'Bad OpenAPI' | None | An OpenAPI file, or a file that its `$ref` names, is not valid YAML or JSON, or the OpenAPI file is not OpenAPI 2.0, 3.0, 3.1 or 3.2. |
| 'Unresolved ref' | The `$ref` | A `$ref` of an OpenAPI file points to nothing in the docs folder, or to an address such as `https://`. |
| 'Unknown tag' | The tag | A page names a tag after the `#` of an OpenAPI file, and neither the `tags` nor the endpoints of that file list it. |

::: pro full-nerd
A problem of the command itself prints one line: its name, then a value. Say that you run `npx nerddocs ../backup-app/docs`, and that folder does not exist. The command prints this line and stops with the exit code `1`:

```text
Missing folder: ../backup-app/docs
```

::: full-nerd
Each such line goes to standard error. These lines stop the command, with the exit code `1`:

| Line | When it shows |
|---|---|
| `Unknown flag: <flag>` | The command gets a flag that it does not know, such as `--port` after `check`. |
| `Bad port: <port>` | The port is not a whole number from `0` to `65535`. |
| `Too many folders: <folder>` | The command gets more than one folder. |
| `Missing folder: <folder>` | The folder does not exist. |
| `Not a folder: <path>` | The path is a file. |
| `No free port: <port>` | Every port from `<port>` up is busy. |
| `Port refused: <port>` | The computer does not let the command use the port. |

These lines leave the command running, except a server failure at the start, which stops it with the exit code `1`:

| Line | When it shows |
|---|---|
| `Cannot open browser: <address>` | The command cannot open the browser. The site stays up. |
| `Cannot watch: <folder>` | The command cannot watch a folder of the docs for saves. |
| `Cannot open editor: <file>` | A click on a row or a path in the author browser finds no editor that opens the file. |
| `Server failure: <message>` | The server fails on a request or a scan. The message says why. |
:::
