# Tech stack

This doc covers the parts that nerDDocs is built from, and the use cases that each part serves. [use-cases.md](use-cases.md) lists the use cases.

Two needs shape the stack. The static export opens from disk with no server, so a page loads only classic scripts and never uses ES modules or `fetch`. No file ever loads from the internet, so the docs work in air-gapped networks.

| Part | Choice | Use cases it serves |
|---|---|---|
| Command | A Node command, `npx nerddocs`, bundled by Vite into one file with no dependencies. It serves the docs with `node:http`, watches the files with `fs.watch`, and sends page updates as server-sent events. | The app as the docs site, each saved change on the site, static export, author checks, install from a packed file with no internet |
| Markdown | unified, with remark-parse, remark-gfm and rehype-raw. A fence line such as `::: overview internals` marks the levels of a part, and the command turns each fence into an HTML wrapper before parsing. | Levels, hide or replace by level, level marks, part ids, wide tables, HTML wireframes |
| Page | React with TypeScript, built by Vite into one classic script. The text of a page is HTML made at build time. React runs the slider, search, settings and outline. | Slider by keyboard and screen reader, level name and icon, read time, 'All pages', default level, themes, outline, the in-app editor |
| Search | MiniSearch. The index is built ahead and ships as a classic script. | Search offline, a hit that opens its page at its level |
| Diagrams | Mermaid, loaded only on a page that has a diagram. | Mermaid diagrams |
| Code colors | Shiki through @shikijs/rehype, at build time, with both themes as CSS variables. | Code colors |
| API reference | yaml and @apidevtools/swagger-parser turn an OpenAPI file into a Markdown page. | API reference, found by search and shown by level |
| Fonts | The font files of the themes, from Fontsource. They ship inside the command, and a page loads only the files of its theme. | Box-character diagrams, themes |
| Export | One HTML file per page with relative links. | Open from disk, any static host under a sub-path |
| Tests | Playwright. A `.test.ts` file runs logic in Node, and a `.spec.ts` file opens the pages in Chromium. | Every use case |
