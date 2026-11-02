# Use cases

This doc covers what readers, authors, teams and AI tools do with nerDDocs. Every example comes from the docs of one made-up product, a backup app. Most examples use its 'Restore a file' page, which says how a user gets a lost file back.

## Readers

| Use case | Example | Release |
|----------|---------|---------|
| A reader moves the slider, and the current page shows its text at another level. | At the lowest level, the 'Restore a file' page says 'Pick a file and a day, and the app puts that copy back'. At the highest level, it lists the steps that run on the server during a restore. | `1.0.0` |
| A reader sees the name and the icon of the current level next to the slider. | A manager sees the name 'Overview' and its icon next to the slider on the 'Restore a file' page. | `1.0.0` |
| A reader sees a faint mark beside each part, which shows the level that the part belongs to. | On the 'Restore a file' page, the steps that run on the server carry the mark of the highest level. | `1.0.0` |
| A reader sees the read time of the page, and the read time changes with the level. | The 'Restore a file' page shows a short read time at the lowest level and a long one at the highest level. | `1.0.0` |
| A reader who moves the slider sees a chip with the old and new level icons and an 'All pages' button. | A user moves the 'Restore a file' page from the lowest to the highest level, and the chip shows the icons of both levels. | `1.0.0` |
| A reader clicks 'All pages', and every page opens at the level of the current page. | A user clicks 'All pages' on the 'Restore a file' page, and the 'Schedules' page then also opens at the highest level. | `1.0.0` |
| A reader picks a theme with the theme button. | A manager who checks whether the backup app fits the team picks 'I'm a serious person'. | `1.0.0` |
| A reader sets a default level with the defaults button, and each page opens at that level. The button offers every level of the docs. | A developer sets the highest level, so the 'Restore a file' page opens with the rule that picks the copy closest to the chosen day. | `1.0.0` |
| A reader reads the whole site at the lowest level in about 15 minutes. | A manager learns what the backup app does, who uses it and where it runs, and then decides whether it fits the team. | `1.0.0` |
| A reader picks a topic in the topic tree, and the page of the topic opens. | A user picks 'Restore a file' next to 'Schedules' and 'Storage' under 'Backups', and the 'Restore a file' page opens. | `1.0.0` |
| A reader switches between dimensions, such as 'User guide' and 'Administration', and each dimension shows its own topic tree. | A user reads the 'Restore a file' page in 'User guide', and an administrator finds the license steps in 'Administration'. | `1.0.0` |
| A reader searches the docs, and a hit opens its page at the level of the hit. | A search for `Ctrl+R` opens the 'Restore a file' page at the level that holds the 'Restore' window. | `1.0.0` |
| A reader follows a link or clicks an id, such as `RESTORE-1`, and the target page opens at the level of the linked part. | A click on `RESTORE-1` on the 'Restore a file' page opens the 'Design decisions' page at the level that holds that decision. | `1.0.0` |
| A reader sees under a part the list of pages that link to it. | Under `REQ-2.1` on the 'Restore a file' page, the reader sees a link to the 'Storage plugins' page, which cites that requirement. | `1.1.0` |
| A reader hovers over or taps a term, and the glossary meaning of the term shows next to it. | On the 'Restore a file' page, the term 'Snapshot' shows 'A copy of all files at one moment' from the glossary. | `1.1.0` |
| A reader hides the contents panel and opens it again, and opens or closes each section that has subsections. | A user closes 'Backups' in the topic tree, and 'Restore a file', 'Schedules' and 'Storage' no longer show. | `1.0.0` |
| A reader hides the panel that holds the slider, and the read time of the page then shows next to the title. | A user who reads the whole 'Restore a file' page at one level hides the panel, and the title shows '12m'. | `1.0.0` |
| A reader goes to the previous page or the next page from the foot of a page. | At the foot of the 'Schedules' page, a user clicks 'Storage'. | `1.0.0` |
| A reader copies a link to the page at the current level and at the current place. | A user copies a link to the server steps of `REQ-2.1` on the 'Restore a file' page and sends it to an administrator. | `1.0.0` |
| A reader widens the window, and the text widens up to a default width. A ruler then widens the text as far as the window allows. | On a wide screen, a user drags the ruler so that the table of plans on the 'Schedules' page fills the window. | `1.0.0` |
| A reader narrows the window, and the text narrows down to a limit. Past that limit, the text area scrolls sideways. | A user narrows the window beside another app, and the lines of the 'Restore a file' page keep a readable width. | `1.0.0` |
| A reader jumps to a heading of a long page from the outline of the page. | The outline of the 'Restore a file' page lists 'Pick a file', 'Pick a day' and 'Check the result'. | `1.0.0` |
| A reader sees each Mermaid diagram drawn as a picture. | The restore flow in `user-flows.md`, which leads from the 'Restore' button to the restored file, shows as a flowchart. | `1.0.0` |
| A reader sees code blocks with syntax colors and copies a block with its copy button. | A developer sees the shell script with `curl -X POST /restores` on the 'Restore by script' page in color and copies it. | `1.0.0` |
| A reader sees a text diagram of box characters with every line in place, also on a phone. | The 'Architecture' diagram in `architecture.md` keeps its boxes around the backup agent and the storage server. | `1.0.0` |
| A reader sees each table with all its columns and scrolls a wide table sideways. | The table of plans on the 'Schedules' page keeps its 'Plan', 'Runs', 'Copies kept', 'Days' and 'Storage' columns side by side. | `1.0.0` |
| A reader browses an OpenAPI file as an API reference, with each endpoint and its fields. | The `POST /restores` endpoint of `api/openapi.yaml` lists the `file`, `day` and `target` fields of a restore. | `1.0.0` |
| A reader sees each image in the page and opens it at full size with a click. | The `restore-window.png` screenshot on the 'Restore a file' page shows a restore in the middle of a run. | `1.0.0` |
| A reader sees the light or the dark copy of an image, to match a light or a dark theme. | The 'Restore a file' page shows `restore-window-light.png` in a light theme and `restore-window-dark.png` in a dark theme. | `1.0.0` |
| A reader clicks through an HTML wireframe inside the page. | A user switches the theme of the `restore-wizard.html` wireframe inside the 'Design decisions' page. | `1.0.0` |
| A reader moves the slider with the keyboard, and a screen reader says the name of the new level. | A user moves the 'Restore a file' page up one level with an arrow key and hears the name of the new level. | `1.0.0` |
| A reader opens the docs from disk, with no server and no internet. | An administrator on a network with no internet reads the 'Restore a file' page from a folder on the backup server. | `1.0.0` |
| A reader picks a product version, and the docs show that version. | A user whose team runs version `2.0.0` of the backup app reads the 'Restore a file' page of that version. | `1.1.0` |
| A reader picks a language, and the page shows in that language. | A user in Germany reads the 'Restore a file' page in German. | `1.1.0` |

## Authors

| Use case | Example | Release |
|----------|---------|---------|
| An author keeps the docs as Markdown files in a folder, and Git is optional. | The docs of the backup app stay Markdown files under `docs/`, and an author with a plain copy of that folder and no Git still works on them. | `1.0.0` |
| An author decides which levels exist and gives each level a name and an icon. | The author names the lowest level 'Overview', for managers, and the highest level 'Internals', for developers, each with an icon. | `1.0.0` |
| An author sets the default level, at which each page opens for a new reader. | The docs open at 'Overview', so a manager on a first visit reads the short version. | `1.0.0` |
| An author marks each part with the levels that show it, so each level can have a text of its own. A page need not have every level of the docs. | The line 'Pick a file and a day, and the app puts that copy back' shows at the lowest level, and the server steps of `REQ-2.1` replace it at the highest level. | `1.0.0` |
| An author previews a page at each level. | The author reads the 'Restore a file' page at the lowest and the highest level and checks that each reads well. | `1.0.0` |
| An author runs a check that flags text that breaks when a part is hidden. | The check flags 'see below' in the table of options on the 'Restore a file' page when the rules below it show only at a higher level. | `1.0.0` |
| An author runs a check that lists each link whose target page is missing. | The check lists the link to `upgrade.md` in the table of contents of `intro.md`. | `1.0.0` |
| An author runs a check that lists each page with a heading and no text. | The check lists `encryption.md`, which holds only the heading of `REQ-4.2`. | `1.0.0` |
| An author sees the read time of each level, for each page and for the whole site. | The author sees whether the whole site still reads in about 15 minutes at the lowest level. | `1.0.0` |
| An author orders topics in the topic tree, and the levels of a page hold the depth of its topic. | The tree holds one 'Restore a file' topic, and its overview, requirements and design are levels of the 'Restore a file' page. | `1.0.0` |
| An author splits the docs into dimensions, each with its own topic tree and pages. | The 'Storage plugin guide' goes in 'Contributing', and the license steps of `install-guide.md` go in 'Administration'. | `1.0.0` |
| An author writes a shared part once and reuses it on pages in several dimensions. | The line 'Pick a file and a day, and the app puts that copy back' is written once and shows in 'User guide' and in 'Administration'. | `1.0.0` |
| An author gives a part an id, such as `REQ-2.1`, and any page links to that part by its id. | The 'Storage plugins' page names `REQ-2.1`, and the id links to the server steps on the 'Restore a file' page. | `1.0.0` |
| An author gives a page levels of its own, in place of the one set of levels of the docs. | The 'Licenses' page has the levels 'Managers', 'Developers' and 'Testers', while the 'Restore a file' page has 'Overview', 'Requirements' and 'Internals'. | `1.1.0` |
| An author defines a term once in the glossary, and every page uses that meaning. | The term 'Snapshot' gets one glossary entry in place of the separate entries in `requirements.md` and `appendix.md`. | `1.1.0` |
| An author asks Claude to write a new page, and Claude writes it with parts for each level. | An author types 'Write the page on restoring a whole folder', and Claude writes it in place of `restore-folder.md`, which holds only a heading. | `1.0.0` |
| An author asks Claude to move existing Markdown docs into nerDDocs, and Claude merges each topic into one page with levels. | Claude merges the restore text of `overview.md`, `requirements.md` and `restore-design.md` into the 'Restore a file' page. | `1.0.0` |
| An author moves docs with Claude, and Claude turns each written reference to a section or file into a link. | Claude turns 'section 4.2 of `restore-design.md`' on the 'Schedules' page into a link. It also turns `restore-window.png` in the list of screenshots into the image. | `1.0.0` |
| An author moves docs with Claude, and Claude lists each fact that two docs state in different ways. | Claude lists that the 'Schedules' page says the app keeps copies for 30 days, while the 'Restore a file' page says 14 days. | `1.0.0` |
| An author edits a page in the app, and the app saves the change to the same Markdown file. | An author fixes a line of the 'Restore a file' page in the app, and the Markdown file of the page changes on disk. | `1.1.0` |

## Teams that publish

| Use case | Example | Release |
|----------|---------|---------|
| A team runs the nerDDocs app as its docs site, and the site shows each change to the Markdown files. | The team runs the app, and a part that an author adds to the 'Restore a file' page shows on the site once the author saves the file. | `1.0.0` |
| A team keeps all docs of one product on one site, guides included. | The requirements, design pages, API reference and 'Storage plugin guide' of the backup app sit on one site. | `1.0.0` |
| A team keeps chosen files out of the published site. | The notes in `drafts/` and `release-checklist.md` stay out of the site. | `1.1.0` |
| A team runs one command that writes the whole site as plain files that open from disk. | The team gives a customer on a network with no internet the export together with the install files of the backup app. | `1.0.0` |
| A team uploads the same files to any static host and links them from a landing page. | The docs open at `example.com/docs` from a link on the landing page of the backup app. | `1.0.0` |
| A team links a screen of its product to a docs page at a chosen level. | The help button in the 'Restore' window opens the 'Restore a file' page at the level that lists the keyboard shortcuts. | `1.0.0` |
| A team publishes one set of docs for each product version. | The docs of version `2.0.0` stay online after the next version of the backup app comes out. | `1.1.0` |
| A team publishes the docs in several languages. | The team publishes the 'User guide' in English and in German. | `1.1.0` |

## AI tools

| Use case | Example | Release |
|----------|---------|---------|
| An AI tool reads `llms.txt` to find the pages of the docs. | Claude reads the `llms.txt` of the backup app docs and finds the 'Restore a file' page. | `1.1.0` |
| An AI tool reads the Markdown copy of a page at the level that it picks. | Claude reads the 'Restore a file' page at the highest level before it changes the restore code. | `1.1.0` |
| An AI tool on an air-gapped network reads `llms.txt` and the Markdown copies from the static export. | A local AI model at a customer site with no internet reads the docs of the backup app from the export. | `1.1.0` |
| An AI coding tool searches and reads the docs at a chosen level through the nerDDocs MCP server. | Claude searches for 'snapshot' through the nerDDocs MCP server and reads that part of the 'Restore a file' page at the highest level. | `1.1.0` |
