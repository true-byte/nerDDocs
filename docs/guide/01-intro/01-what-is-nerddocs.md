# What is nerDDocs

::: casual
nerDDocs turns a folder of Markdown files into a docs site where you pick how nerdy each page gets. A slider at the foot of the page sets the level, from plain words to every last detail, so you read only as deep as you need. You need not be a nerd, but nerds are welcome.

::: pro
nerDDocs is an open-source docs platform with a nerdiness slider. It shows a folder of Markdown files as a site, and each page holds its text at several levels, from plain to deep. The slider at the foot of the page switches the level, so you read only as deep as you need. The text changes in place, and the text at your place stays where it was on the screen.

::: full-nerd
nerDDocs is an MIT open-source docs platform with a nerdiness slider. One Node command, `npx nerddocs`, shows a folder of Markdown files as a site. Each page holds its text at several levels, from plain to deep. The file `nerddocs.json` lists the levels, and the slider at the foot of the page switches between them, so you read only as deep as you need. A switch swaps the text in place. The block on the line 30% down the window holds its place, and the text above and below it grows or shrinks around it.

You are at 'Full nerd', so from here on every rule is on the page.
:::

## Levels

::: casual
This page has three levels of nerdiness: 'Casual', 'Pro' and 'Full nerd'. Move the slider, and this text changes. 'Casual' tells each thing in plain words. 'Pro' adds what you need to use it every day. 'Full nerd' tells every rule and how it works inside. Each level tells all that the plainer levels tell, and more, so you pick one level and stay there.

::: pro full-nerd
A level is the whole page told at one depth. Each section of a page can have its own text at each level, so a move of the slider rewrites the page rather than only adding or hiding a part. These docs have three levels of nerdiness. 'Casual' tells each thing in plain words, 'Pro' adds what you need to use it every day, and 'Full nerd' adds every rule and how it works inside.

The author names the levels. A book can come at third-grade, high-school and university levels, and technical docs at levels for managers, developers and testers.

::: pro
Levels from plain to deep, such as those of the book, build on each other. Each level holds every fact of the levels below it, so you pick one and never need another. Levels by audience, such as those of the technical docs, need not build on each other.

A page opens at the level that you chose for it in this tab. After a move of the slider, the button 'All pages' makes that level your default for every page.

::: full-nerd
Levels that go from plain to deep, such as those of the book and of these docs, build on each other. Each level holds every fact of the levels below it and adds its own, so a reader picks one level and never needs another. A level can still tell a part again in its own words. Levels by audience, such as those of the technical docs, need not build on each other.

The levels go in `nerddocs.json`, each with an id, a name and an icon. In a page, a fence line such as `::: pro full-nerd` marks the text of one or more levels, and text outside a fence shows at every level. A page with no text at a level shows no stop for it.

A page opens at the level in its address, such as `#full-nerd`, or else at the level that you chose for it in this tab. With neither, it opens at your default, and otherwise at the `defaultLevel` of `nerddocs.json`. Your default holds for every page in this browser. The button 'All pages' sets it after a move of the slider, and the 'Defaults' button sets it to any level.

During a switch, the changed text shows a tint. A tick at the right edge of the window marks each change that is off screen.
:::

## Reading

::: casual
Search finds words at every level. Each page tells how long it takes to read at each level. You can also change the look of the site and the width of its text.

::: pro full-nerd
'Search', or `Ctrl+K`, finds words in the text of every level. A hit opens its page at the level that holds the words, and the words light up.

::: full-nerd
Search runs in the browser. MiniSearch indexes the text of every page on the first search, and the hits that your level of each page shows come first. A word of 5 letters or more also matches with one letter wrong, and the last word also matches the start of a word.

::: pro full-nerd
Each stop of the slider shows the read time of the page at that level, and the clock button gives the read time of each level on all pages.

::: full-nerd
The read time counts the words, images, diagrams and wireframes that a level shows. It reads 238 words per minute unless `wordsPerMinute` sets another speed. Each image, diagram and wireframe adds 12 seconds, and a read time rounds up to a whole minute.

::: pro full-nerd
The 'Themes' button changes the look of the site, and the 'Text width' button sets the width of the text. 'Copy link' copies the address of your place, with its level and its section.

::: full-nerd
A copied address, such as `restore.html#internals/pick-a-day`, opens the page at the same level and place.
:::

## Writing

::: casual
Each page is a Markdown file. A short line such as `::: pro` starts the text of a level. Claude can write the levels for you.

::: pro full-nerd
Each Markdown file is a page, and each folder is a row of the contents panel. A line such as `::: pro` starts the text of a level, and a line with `:::` alone ends it. Besides text, a page can hold tables, code, box diagrams, Mermaid diagrams, images, HTML wireframes and API references.

::: full-nerd
The command reads Markdown with unified, remark-gfm and rehype-raw. Before it parses a page, it turns each fence line into an HTML wrapper, so a part can hold any Markdown.

::: pro full-nerd
`npx nerddocs` prints an author address. In a browser at that address, each save moves the page to the change, draws a line through the words that leave and fades in the new ones.

::: full-nerd
The command watches the folder with `fs.watch` and sends each save to the open pages as a server-sent event, so a page updates with no reload. Every other browser shows the new text as a reader sees it.

::: pro full-nerd
`npx nerddocs check` finds broken links and empty pages. With the `nerddocs` skill, Claude writes pages at every level or moves old docs into nerDDocs, with no fact of its own.

::: full-nerd
The check prints each problem, such as 'Missing page' or 'Empty heading', and exits with `1` when the docs have one, so a CI job fails. The `nerddocs` skill moves old docs in batches of 20 pages and keeps their words. It takes each fact from the old docs, the pages, the author's words or the files of the project.
:::

## Build

::: casual
nerDDocs is one command, and your docs stay plain files. The site works with no internet.

::: pro full-nerd
nerDDocs is a Node command. Your docs stay Markdown files in a folder, and Git is optional. The site needs no internet, so it also works on a closed network.

::: full-nerd
Vite bundles the command into one file with no dependencies, and the command serves the docs with `node:http`. The page script is React with TypeScript, built into one classic script. The fonts and the Mermaid builds ship inside the command, so no file of the site loads from the internet. [Tech stack](../../project/02-tech-stack.md#full-nerd) lists each part of nerDDocs and the use cases that it serves.
:::
