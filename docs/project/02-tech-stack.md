# Tech stack

::: casual
This page tells what nerDDocs is built from. Two needs shape the choice of parts: the docs open from disk with no server, and no file loads from the internet.

::: pro
This page names each part of nerDDocs and why nerDDocs uses it. Two needs shape the choice. The exported docs open from disk with no server, so a page loads only classic scripts. No file ever loads from the internet, so the docs work on a network with no internet access.

::: full-nerd
This doc covers the parts that nerDDocs is built from, and the use cases that each part serves. [Use cases](01-use-cases.md#full-nerd) lists the use cases.

Two needs shape the stack. The static export opens from disk with no server, so a page loads only classic scripts and never uses ES modules or `fetch`. No file ever loads from the internet, so the docs work in air-gapped networks.
:::

## Command

::: casual
nerDDocs is one Node command. It shows the docs as a site, and the site changes at each save.

::: pro
nerDDocs runs as one Node command, `npx nerddocs`, in one file with no dependencies, so it installs from a packed file with no internet. The command serves the docs as a site, watches their files and sends each change to the open pages, so the site shows each saved change. It also runs the author checks and writes the static export.

::: full-nerd
nerDDocs is a Node command, `npx nerddocs`, that Vite bundles into one file with no dependencies. The command serves the docs with `node:http`, watches the files with `fs.watch`, and sends each change to the open pages as server-sent events.

This part serves these use cases: the app as the docs site, each saved change on the site, static export, author checks, and install from a packed file with no internet.
:::

## Markdown

::: casual
nerDDocs reads each page as Markdown, and a short line starts the text of each level.

::: pro
nerDDocs reads Markdown with unified. A fence line, such as `::: details internals`, starts the text of the levels that it names. Before it reads a page, the command turns each fence line into HTML. This is how a page holds its text by level and hides or replaces text at a level. With unified, a page also shows wide tables and HTML wireframes.

::: full-nerd
nerDDocs reads Markdown with unified, with remark-parse, remark-gfm and rehype-raw. A fence line such as `::: details internals` starts a part and names the levels that show it. The command turns each fence into an HTML wrapper before parsing.

This part serves these use cases: levels, hide or replace by level, level marks, part ids, wide tables, and HTML wireframes.
:::

## Page

::: casual
React runs the slider, search and the settings of each page.

::: pro
Each page runs one script, written in TypeScript with React. The text of the page is HTML made when the site is built. React runs the parts that a reader works with: the slider, search, the settings and the outline.

::: full-nerd
The page script is React with TypeScript, built by Vite into one classic script. The text of a page is HTML made at build time. React runs the slider, search, settings and outline.

This part serves these use cases: slider by keyboard and screen reader, level name and icon, read time, 'All pages', default level, themes, outline, and the in-app editor.
:::

## Search

::: casual
Search runs in the browser, so it works with no internet.

::: pro
MiniSearch runs search in the browser. It indexes the text of every page on the first search. Search works offline, and a hit opens its page at its level.

::: full-nerd
MiniSearch runs the search. The text of each page ships in one classic script, and MiniSearch indexes it in the browser on the first search.

This part serves these use cases: search offline, and a hit that opens its page at its level.
:::

## Diagrams

::: casual
Mermaid draws the diagrams, and it ships inside nerDDocs.

::: pro
Mermaid draws the Mermaid diagrams. nerDDocs ships a tiny build and a full build of it, and the full build also draws math, `mindmap`, `architecture-beta` and the ELK layout. A page loads a build only when a diagram comes near the view.

::: full-nerd
Mermaid draws the diagrams, in two builds of one exact version. The tiny build comes from @mermaid-js/tiny. The full build comes from mermaid, and it also draws math, `mindmap`, `architecture-beta` and the ELK layout. Both builds ship inside the command. A page loads one of them only when a diagram comes near the view.

This part serves one use case: Mermaid diagrams.
:::

## Wireframes

::: casual
An HTML wireframe shows inside the page, even when the docs open from disk.

::: pro
parse5 reads each HTML wireframe when the site is built. The page shows the wireframe in an `iframe`, which also works when the docs open from disk.

::: full-nerd
parse5 reads each wireframe at build time, and the page holds it in an `iframe` with `srcdoc`, which also works from disk.

This part serves one use case: HTML wireframes.
:::

## Code colors

::: casual
Shiki colors the code in code blocks.

::: pro
Shiki colors the code blocks when the site is built, and each theme sets its own code colors.

::: full-nerd
Shiki core, with its JavaScript regex engine and the grammars of @shikijs/langs, colors the code at build time. Each token gets a class, and each theme sets the token colors.

This part serves one use case: code colors.
:::

## API reference

::: casual
nerDDocs turns an OpenAPI file into an API reference inside a page.

::: pro
The yaml package reads an OpenAPI file in YAML or JSON. The command writes the file as Markdown into the page that shows it, so search finds the API reference and the reference shows by level.

::: full-nerd
The yaml package reads an OpenAPI file in YAML or JSON, and the command writes it as Markdown into the page that embeds it.

This part serves one use case: the API reference, found by search and shown by level.
:::

## Editor

::: casual
A package opens a file of the docs in the editor of the author.

::: pro
The author checks open a file at a line in the editor of the author. The package launch-editor does this, and Vite uses the same package to open a file from its error screen.

::: full-nerd
The package launch-editor, which Vite uses to open a file from its error screen, opens a file at a line in the editor of the author. It ships inside the command.

This part serves one use case: author checks.
:::

## Fonts

::: casual
The fonts ship inside nerDDocs, so no font loads from the internet.

::: pro
Each theme has its own fonts, from Fontsource, and box diagrams use Fira Code in every theme. The fonts ship inside the command, so no font loads from the internet. A page loads only the fonts that it shows.

::: full-nerd
Each theme has its own font files, from Fontsource, and Fira Code from @fontsource/fira-code draws box diagrams in every theme. All of them ship inside the command, so no font loads from the internet. A page loads only the files of its theme, and the files of Fira Code only when it shows a box diagram.

This part serves these use cases: box-character diagrams, and themes.
:::

## Export

::: casual
The export writes the docs as plain files that open from disk.

::: pro
The static export writes one HTML file for each page. Its links are relative, so the docs open from disk and from any static host.

::: full-nerd
The static export is one HTML file per page, with relative links.

This part serves these use cases: open from disk, and any static host under a sub-path.
:::

## Tests

::: casual
Playwright runs the tests of nerDDocs.

::: pro
Playwright runs the tests. Each `.test.ts` file tests logic, and each `.spec.ts` file tests the pages in a browser.

::: full-nerd
Playwright runs the tests. A `.test.ts` file runs logic in Node, and a `.spec.ts` file opens the pages in Chromium.

This part serves every use case.
:::

## Licenses

::: casual
nerDDocs serves the licenses of the fonts and the packages that ship inside it.

::: pro
The command serves the licenses of the fonts and of each package inside the Mermaid builds at `/__nerddocs/licenses.txt`. The fonts are under the SIL Open Font License 1.1.

::: full-nerd
The command serves one file, `/__nerddocs/licenses.txt`, with the licenses of the fonts and of each package inside the Mermaid builds. The fonts are under the SIL Open Font License 1.1. The full Mermaid build holds elkjs, which is under EPL-2.0. DOMPurify is under MPL-2.0 or Apache-2.0. Each other package inside the Mermaid builds is under MIT, ISC, BSD-3-Clause or Apache-2.0.
:::
