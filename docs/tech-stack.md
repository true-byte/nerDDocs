# Tech stack

This doc covers the parts that nerDDocs is built from, and the use cases that each part serves. [use-cases.md](use-cases.md) lists the use cases.

Two needs shape the stack. The static export opens from disk with no server, so a page loads only classic scripts and never uses ES modules or `fetch`. No file ever loads from the internet, so the docs work in air-gapped networks.

| Part | Choice | Use cases it serves |
|---|---|---|
| Command | A Node command, `npx nerddocs`, bundled by Vite into one file with no dependencies. It serves the docs with `node:http`, watches the files with `fs.watch`, and sends page updates as server-sent events. | The app as the docs site, each saved change on the site, static export, author checks, install from a packed file with no internet |
| Markdown | unified, with remark-parse, remark-gfm and rehype-raw. A fence line such as `::: overview internals` marks the levels of a part, and the command turns each fence into an HTML wrapper before parsing. | Levels, hide or replace by level, level marks, part ids, wide tables, HTML wireframes |
| Page | React with TypeScript, built by Vite into one classic script. The text of a page is HTML made at build time. React runs the slider, search, settings and outline. | Slider by keyboard and screen reader, level name and icon, read time, 'All pages', default level, themes, outline, the in-app editor |
| Search | MiniSearch. The index is built ahead and ships as a classic script. | Search offline, a hit that opens its page at its level |
| Diagrams | Mermaid, in two builds of one exact version. The tiny build comes from @mermaid-js/tiny. The full build comes from mermaid, and it also draws math, `mindmap`, `architecture-beta` and the ELK layout. Both ship inside the command. A page loads one of them only when a diagram comes near the view. | Mermaid diagrams |
| Wireframes | parse5 reads each wireframe at build time, and the page holds it in an `iframe` with `srcdoc`, which also works from disk. | HTML wireframes |
| Code colors | Shiki core with its JavaScript regex engine and the grammars of @shikijs/langs, at build time. Each token gets a class, and each theme sets the token colors. | Code colors |
| API reference | yaml reads an OpenAPI file in YAML or JSON, and the command writes it as Markdown into the page that embeds it. | API reference, found by search and shown by level |
| Fonts | The font files of the themes from Fontsource, and Fira Code from @fontsource/fira-code for box diagrams in every theme. They ship inside the command. A page loads only the files of its theme, and the files of Fira Code only when it shows a box diagram. | Box-character diagrams, themes |
| Export | One HTML file per page with relative links. | Open from disk, any static host under a sub-path |
| Tests | Playwright. A `.test.ts` file runs logic in Node, and a `.spec.ts` file opens the pages in Chromium. | Every use case |

The command serves the licenses of the fonts and of each package inside the Mermaid builds at `/__nerddocs/licenses.txt`. The fonts are under the SIL Open Font License 1.1. The full Mermaid build holds elkjs, which is under EPL-2.0. DOMPurify is under MPL-2.0 or Apache-2.0. Each other package inside the Mermaid builds is under MIT, ISC, BSD-3-Clause or Apache-2.0.
