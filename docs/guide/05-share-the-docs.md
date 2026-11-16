# Share the docs

::: casual
One command writes your docs as plain files. They open from a folder with no server and no internet, and they go on any web host. The slider comes along, of course.

::: pro
One command writes the docs as plain files. The files open from disk with no server and no internet, and any static web host serves them. These sections export the docs of a backup app, in the folder `backup-app/docs`, with the levels 'Basics', 'Details' and 'Internals'. Then they open the export from disk and put it online.

::: full-nerd
One command writes the docs as plain files. The files open from disk with no server and no internet, and any static web host serves them. These sections export the docs of a backup app, in the folder `backup-app/docs`, with the levels 'Basics', 'Details' and 'Internals'. Then they open the export from disk and put it online. You are at 'Full nerd', so you also get each file of the export and the query key that carries your settings.
:::

## Export the docs

::: casual
Run one command in a clone of nerDDocs, and name the folder of your docs. It writes each page as a file into a new folder, with all that the pages need, such as images and fonts. The terminal shows each problem of the docs, and the files still get written.

::: pro full-nerd
Run this command in the clone, with the folder of your docs:

```sh
npx nerddocs export ../backup-app/docs
```

From a clone in `/work/nerDDocs`, the command writes the folder `nerddocs-export` and prints these lines:

```text
Folder: /work/backup-app/docs
Pages: 9
Export: nerddocs-export
Address: file:///work/nerDDocs/nerddocs-export/index.html
```

The folder holds each page as an HTML file, and all that the pages need: the page script, the style, the fonts, the Mermaid builds and each image. `--out` names another folder, such as `--out ../backup-app/site`. A relative path starts at the current folder. The command starts no server and opens no browser.

Each problem of the docs prints as a block, as [Run the check](04-check-the-docs.md#run-the-check) shows. The export still writes every file, and the exit code stays `0`. To stop on a problem, as a CI job does, run `npx nerddocs check` before the export.

An export replaces the export before it. The command deletes all that the folder holds but a `.git` at its top, and then writes. So it writes only into a missing folder, an empty folder, a folder that holds only `.git`, or the folder of an export. Any other folder stops the command before it writes or deletes anything, with a line that [Read the terminal lines](04-check-the-docs.md#read-the-terminal-lines) lists.

::: full-nerd
The export holds these files:

| Path | What it holds |
|---|---|
| The address of each page, such as `user-guide/backups/restore.html` | The page as a reader browser shows it, with no live update. |
| `index.html` | A page that opens the first page of the site, with the hash of its own address. With no script, a refresh opens the first page. |
| `__nerddocs/app.js` and `__nerddocs/app.css` | The page script and the style. |
| `__nerddocs/fonts/` | The font files of the themes and of box diagrams. |
| `__nerddocs/mermaid.js` and `__nerddocs/mermaid-full.js` | The two Mermaid builds. |
| `__nerddocs/licenses.txt` | The licenses of the fonts and of what the Mermaid builds bundle. |
| `__nerddocs/search.js` | The text of every page, which search reads. |
| `__nerddocs/theme-preview.html` | The sample page of the theme box. |
| Each other file that the site serves, such as `user-guide/01-backups/restore-window.png` | A copy at its path in the docs folder, with its order prefixes, since the links of the pages name that path. |
| `.nojekyll` | An empty file for GitHub Pages, as [Put the docs online](#full-nerd/put-the-docs-online) says. |

Markdown files, dot names, `node_modules` and the folder `__nerddocs` of the docs folder stay out of the copy. So does the out folder when it sits in the docs folder, and a `nerddocs-export` folder of an older run. Each link to a folder of pages, to `/` or to an old address already names its page, as [Links](03-write/02-organize-pages.md#full-nerd/links) says, so no link of the export needs a server.
:::

## Open from disk

::: casual
Open the file `index.html` of the new folder in your browser. The docs open with no server and no internet, and the slider, search and themes work as on the site. Your theme, level and text width stay with you from page to page.

::: pro full-nerd
Open `index.html` of the export in a browser, or paste the 'Address' line into its address bar. It opens the first page, and `index.html#details` opens the first page at 'Details'. Each page is the page that a reader browser shows. The slider, 'All pages', 'Defaults', search, the theme box, diagrams, images and wireframes all work from disk. No page loads a file from the internet, so an administrator on a network with no internet reads 'Restore a file' from a copy of the folder on the backup server.

A link from one page to another carries your settings in its address. So your theme, look, level, text width, panels and search hit hold on the next page. The next page removes them from its address at once, so 'Copy link' copies a clean address.

::: full-nerd
A browser can keep the storage of each file on disk apart. Firefox gives each file its own `localStorage`, and shares `sessionStorage` only within one folder. So on a page from disk, a click on a link to another `.html` file adds `?nd=` and your settings before the hash. A middle click and a click with `Ctrl` or `Cmd` held carry them too, and so does a search hit on another page.

The value of `nd` is JSON in `encodeURIComponent`. It holds each key of `localStorage` and of `sessionStorage` that starts with `nerddocs-`, except `nerddocs-sizes`, which keeps the sizes of the drawings of each page. The first head script of the next page runs before every other script. It writes each carried entry into its storage, and removes each other key that starts with `nerddocs-`, except `nerddocs-sizes`. A key of any other name in the value stays out, so a hand-made `?nd=` address writes no other key. The next page then holds the same settings as the page before it. Last, `history.replaceState` takes `?nd=` out of the address. A bad value leaves the address too, and changes no storage.

A link to the same page, a link to a file that is no page, and every link of a page from a web host carry nothing.
:::

## Put the docs online

::: casual
Upload the folder to any web host, and link to it from the landing page of your product. GitHub can also put the docs on GitHub Pages at each push, with one small workflow file.

::: pro full-nerd
Any static web host serves the export as it is. Every link of the export is relative, so the docs work at the root of a host and under a sub-path. Say that the team of the backup app uploads the export to `example.com/docs`. These links on the landing page of the backup app open the docs:

```html
<a href="https://example.com/docs/">Docs</a>
<a href="https://example.com/docs/user-guide/backups/restore.html#details">Restore a file</a>
```

The first link opens the first page. The second link opens 'Restore a file' at 'Details', as [Addresses](03-write/02-organize-pages.md#addresses) says.

To put the docs on GitHub Pages at each push to `main`, write this file in the repo of the backup app as `.github/workflows/docs.yml`:

```yaml
name: Docs

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/checkout@v7
        with:
          repository: true-byte/nerDDocs
          path: nerddocs
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: nerddocs/package-lock.json
      - run: npm ci
        working-directory: nerddocs
      - run: node nerddocs/dist/nerddocs.cjs check docs
      - run: node nerddocs/dist/nerddocs.cjs export docs --out _site
      - uses: actions/upload-pages-artifact@v5
        with:
          path: _site
      - id: deployment
        uses: actions/deploy-pages@v5
```

Then open the repo on GitHub, click 'Settings' and then 'Pages', and set 'Source' to 'GitHub Actions'. The next push to `main` puts the docs online. The run of the workflow shows their address.

::: full-nerd
The workflow checks out the backup app, and a clone of nerDDocs into the folder `nerddocs`. `npm ci` installs the clone and builds the command into `nerddocs/dist/`. The check fails the run on a problem of the docs, so a broken link never goes online. The export writes `_site`, `actions/upload-pages-artifact` uploads it, and `actions/deploy-pages` puts it online. The permissions `pages: write` and `id-token: write` let the run publish, and the environment `github-pages` shows the address.

A site that GitHub Pages builds from a branch goes through Jekyll, which leaves out each folder whose name starts with `_`. The empty file `.nojekyll` at the top of the export keeps `__nerddocs/`, so the export also works from a branch.
:::
