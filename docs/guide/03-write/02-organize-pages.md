# Organize pages

::: casual
The files and folders of your docs set the pages of the site, their order and their addresses. Tidy folders make a tidy site.

::: pro
The files and folders of the docs folder set the pages of the site, the rows of the contents panel, their order and their addresses. The examples come from the docs of a backup app, in the folder `backup-app/docs`, which [Run nerDDocs](../01-intro/02-get-started.md#run-nerddocs) shows as a site. Each file path below starts from that folder.

::: full-nerd
The files and folders of the docs folder set the pages of the site, the rows of the contents panel, their order, their addresses and the dimensions, with every rule. The examples come from the docs of a backup app, in the folder `backup-app/docs`, which [Run nerDDocs](../01-intro/02-get-started.md#run-nerddocs) shows as a site. Each file path below starts from that folder.
:::

## Folders and pages

::: casual
Every Markdown file of your docs is a page of the site, and its first heading is its title. Every folder is a row of the contents panel, and a click on the row shows or hides the pages in it.

::: pro full-nerd
Each Markdown file in the docs folder becomes a page, and the first heading of the file is the title of the page. Each folder becomes a row of the contents panel.

A folder with an `index.md`, or else a `README.md`, is one row with the title of that page. A click on its name opens the page, and its arrow 'Subtopics' shows or hides the rows of the other pages and folders in it. A folder with neither file is a row with the name of the folder, and a click on it shows or hides its rows.

Two folders of the backup app give these rows:

| Row | Comes from |
|---|---|
| 'Backups' | The folder `user-guide/01-backups`, which holds no `index.md` or `README.md`. A click on the row shows or hides the two rows below it. |
| 'Restore a file' | The first heading of `user-guide/01-backups/01-restore.md`. |
| 'Schedules' | The first heading of `user-guide/01-backups/02-schedules.md`. |
| 'Encryption' | The first heading of `user-guide/02-encryption/index.md`. A click on the name opens this page, and the arrow 'Subtopics' shows or hides the row below it. |
| 'Encryption keys' | The first heading of `user-guide/02-encryption/01-keys.md`. |

::: full-nerd
A file with no heading takes its file name as its title, without its order prefix, so `01-restore.md` with no heading shows as 'Restore'.

With both an `index.md` and a `README.md` in a folder, the `index.md` is the page of the folder, and the `README.md` is a row under it. A folder whose only page is its `index.md` or `README.md` is a page row. The `index.md` at the top of the docs folder stays a page row, such as 'Welcome'.

A folder row that you shut stays shut on every page and after a reload. Dot folders, dot files, `node_modules` and a top folder named `__nerddocs` stay out of the site.
:::

## Order

::: casual
Pages and folders show in the order of their names. A number at the start of a name, such as `01-`, sets that order, and the site does not show it. The foot of each page links to the page before it and the page after it.

::: pro full-nerd
The names of the files and folders set the order of the rows, so `01-restore.md` comes before `02-schedules.md`. A prefix such as `01-` sets only the order, so the folder `01-backups` shows as 'Backups'. An `index.md` or a `README.md` comes first in its folder.

The foot of each page links to the page before it and the page after it, in the order of the contents panel. Each link shows the read time of its page at the level that the page opens at for you.

::: full-nerd
An order prefix is up to three digits and then `-`, `_`, `.` or a space. A file name of four digits, such as `2024-report.md`, has no prefix. The prefix also stays out of the address of the page, as [Addresses](#addresses) says.
:::

## Addresses

::: casual
Each page has its own address, made from the path of its file. An address can also name a level and a heading, and then the page opens at that level and place. The address always names the level that shows, so a copied address opens the page as you see it.

::: pro full-nerd
The address of a page is the path of its file without the order prefixes, so `user-guide/01-backups/01-restore.md` opens at `/user-guide/backups/restore.html`.

The hash of an address can name a level, a heading or both:

| Address | What it opens |
|---|---|
| `restore.html#internals` | The page 'Restore a file' at 'Internals'. |
| `restore.html#internals/pick-a-day` | The page at 'Internals', with the heading 'Pick a day' at the top of the window. |
| `restore.html#search-index` | The page at a level that shows the heading 'Search index'. |

On a page with levels, the hash always holds the level that shows, such as `restore.html#basics`. So a copied address opens at the same level, as [Share a link](../02-read-a-page.md#share-a-link) says.

::: full-nerd
When two names in one folder give one address, the name with no prefix takes it, or else the first name in the order. Each other name keeps its prefix in its address, so `02-restore.md` next to `01-restore.md` opens at `/user-guide/backups/02-restore.html`.

An address with the order prefixes, such as `/user-guide/01-backups/01-restore.html`, opens the page at its address. So does the address of the Markdown file, `/user-guide/01-backups/01-restore.md`.

A page with no text at the level of the hash opens at the nearest lower level with text, or else at the nearest higher level with text. A page with no level in its hash opens at the level that [Pick a level](../02-read-a-page.md#full-nerd/pick-a-level) gives. A move of the slider adds no step to 'Back' of the browser.
:::

## Links

::: casual
To link to another page, link to its Markdown file. A link can also open the page at one level. Then the icon of that level shows after the words of the link.

::: pro full-nerd
Link to a page by the path of its Markdown file, from the folder of the page that holds the link. The hash of a link names a level, a heading or both, as the hash of an address does. This link in `user-guide/01-backups/02-schedules.md` opens 'Restore a file' at 'Internals', at the heading 'Pick a day':

```md
[Pick a day](01-restore.md#internals/pick-a-day)
```

A link in the text has no underline. A link that opens its page at another level than the level that the page opens at for you shows the icon of that level after its text, in the color of that level. While 'Restore a file' opens at 'Basics' for you, the link 'Pick a day' shows the 'Internals' icon.

::: full-nerd
The site turns each link to a Markdown file into the address of its page, so the link above opens `/user-guide/backups/restore.html#internals/pick-a-day`. A link to a folder of pages, such as `01-backups/`, gets the address of the first page of the folder, here 'Restore a file'. A link to `/` gets the address of the first page of the site. A link to an old address, such as `01-restore.html`, gets the address of its page. An image, or a link to any other file, keeps the path of its file. `npx nerddocs check` finds each link to a page or a heading that the docs lack, as [See the problems](../04-check-the-docs.md#see-the-problems) says.
:::

## Dimensions

::: casual
A dimension is a top folder of the docs, such as the 'User guide', 'Administration' or 'Legal and privacy' of the backup app. The contents panel shows the pages of one dimension at a time. A button above the contents tree switches to another dimension.

::: pro full-nerd
Each dimension is a top folder of the docs, and the contents panel shows its pages on their own. The key `dimensions` in `nerddocs.json` lists the three dimensions of the backup app:

```json
{
  "dimensions": [
    { "folder": "user-guide" },
    { "folder": "administration" },
    { "folder": "legal", "name": "Legal and privacy" }
  ]
}
```

The button above the contents tree shows the name of the dimension of the open page, such as 'User guide'. The tree shows the pages and the folders inside the folder of that dimension. On a phone, the button is at the top of the contents panel.

A click on the button opens the list of dimensions. A click on another dimension opens the page of that dimension that you last opened in that browser, and a dimension with no such page opens at its first page. A click on the dimension of the open page closes the list. The up and down arrow keys move through the list, and Esc closes it.

::: full-nerd
| Key | What it does |
|---|---|
| `dimensions` | Lists the dimensions in the order that the list of dimensions shows them. |
| `folder` | Sets the top folder of the dimension, such as `user-guide`. Each dimension needs a `folder`. |
| `name` | Sets the name that the button and the list show. The default comes from the folder name, so `user-guide` shows as 'User guide'. |

A `folder` holds no `/`, and each folder shows once in the list. Any other value of `dimensions` makes `nerddocs.json` broken, and the check prints 'Bad config'.

Every dimension has the levels of `nerddocs.json`. The foot of a page links only to pages of its dimension, so the first page of a dimension has no page before it. 'All pages' in the read time box counts the pages of every dimension.

The `index.md` of the folder of a dimension stays a page row. The address of the site opens the first page of the first dimension.

A Markdown file or a folder of pages outside every listed folder stays out of the site, and the terminal prints 'Outside dimensions' for it. A listed folder that is missing or holds no page stays out of the list, and the terminal prints 'Missing dimension' for it. [Read the terminal lines](../04-check-the-docs.md#full-nerd/read-the-terminal-lines) shows these lines.

With one dimension, the site shows only the pages of its folder, and no button shows. When no listed folder holds a page, the site shows every folder, as with no `dimensions` key.
:::
