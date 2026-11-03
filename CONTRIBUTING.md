# Contributing

This doc covers how to work on nerDDocs itself. It says how to set up a clone, build and test, send a change and make a release. It also gives the rules for docs, the steps to add a theme, and what each folder of the clone holds.

## Set up a clone

Run these commands to clone nerDDocs and install what it needs:

```sh
git clone https://github.com/true-byte/nerDDocs
cd nerDDocs
npm install
```

`npm install` installs Roadmapper, which draws and checks the plan in `roadmap/roadmap.json`. It also installs the build and test tools, and builds the `nerddocs` command into `dist/`.

The browser tests need Chromium. Run this command once to install it:

```sh
npx playwright install chromium
```

## Build and test

Run this command to build the `nerddocs` command again after a change:

```sh
npm run build
```

Run this command before you push a change:

```sh
npm run check
```

`npm run check` runs the type check and the build. Then it runs the full tests once, and once more with every CPU core busy.

The folders of `tests/` are the folders of `src/`. Name each test file after the source file that it tests, so `tests/site/scan.test.ts` tests `src/site/scan.ts`. [docs/tech-stack.md](docs/tech-stack.md) says what each kind of test file runs. A test waits for what the product does, never for a fixed time.

## Write docs

These rules hold for `README.md`, every file in `docs/`, `CONTRIBUTING.md` and `CLAUDE.md`.

### Scope

- Each doc covers one subject. Its first line names it: "This doc covers …".
- One fact lives in one doc. Other docs link to it.
- A doc says what is. It names a missing thing only where the reader would fail without it, and then says what to do instead.

### Sentences

- Put one idea in each sentence, in 25 words or fewer.
- Write whole sentences. Leave out no word that the reader must guess: write "The same id is also on line 41.", not "Also on line 41."
- Write each step as a command, such as "Run", "Open" or "Copy". Write each fact in the present tense.
- Use plain words, for a reader whose first language may not be English. Use no metaphor and no word of your own.
- Explain in terms the reader can see: what changes in a file, on a page or in a command's output.
- Use no filler, such as "simply", "just", "easily", "note that" or "powerful".

### Words

- Give each thing one name, the name that the page shows, and use it in every file.
- Put a label that a page shows in single quotes, such as 'Create pull request'. Put a command, key, path or value in backticks, such as `git fetch`.
- Call Claude "Claude". Call the reader "you".

### Layout

- Write headings in sentence case.
- Use a table to look things up: three rows or more of one kind, with a header row. For fewer rows, write a list.
- Give rows of one kind one fixed format.
- Put each command in a `sh` code block, one command per line, so that it runs as written.

### Examples

- Take all examples in one doc from one case.
- The docs take their examples from the docs of one made-up product, a backup app, as [docs/use-cases.md](docs/use-cases.md) does.
- Use names that a person would write, never 'Page A' or 'foo'.
- Write a request to Claude the way a person types it. Say what Claude does as what changes in a file or on a page.

## Add a theme

Each theme is a folder of `src/themes/`, and the folder name is the id of the theme, such as `im-a-serious-person`. In these steps, `<id>` is the id of the new theme.

1. Copy the folder of the theme that is closest to the new one. `<closest>` is the id of that theme, such as `themelessness`:

   ```sh
   cp -r src/themes/<closest> src/themes/<id>
   ```

2. Set `id` to `<id>` in `src/themes/<id>/theme.ts`, and set `name` to the name that the theme box shows.
3. Import the theme in `src/themes/index.ts`, and add it to `THEMES`. The order of `THEMES` is the order of the theme box.
4. Set the colors of `light` and `dark`, the font stacks of `fonts` and the values of `shape` in `theme.ts`. The comments in `src/themes/types.ts` say what each key paints. The page shows `light` or `dark` by the look that the reader picks in the theme box: 'Light', 'Dark', or 'System' for the look of the computer. Each text color needs a contrast ratio of at least 4.5 on each background that it sits on. Each level color needs a ratio of at least 3.
5. If a font stack names a font that is not a system font, install the package of that font from Fontsource. `<font>` is the name of the package, such as `vt323`:

   ```sh
   npm install -D @fontsource/<font>
   ```

   Then add one entry to `faces` for each woff2 file that the stacks need, such as `{ family: 'VT323', file: '@fontsource/vt323/files/vt323-latin-400-normal.woff2', weight: 400 }`.

6. For art and for shapes that the tokens cannot give, add `src/themes/<id>/look.css`, as [Write look.css](#write-lookcss) says. Put each SVG file that it uses in the same folder. The build adds `look.css` to the page with no import line.
7. Run the check, as [Build and test](#build-and-test) says:

   ```sh
   npm run check
   ```

8. Show a docs folder with the command that the check built. `<folder>` is the path of the folder:

   ```sh
   node dist/nerddocs.cjs <folder>
   ```

   Click 'Themes', and click the new theme in the list. The box shows it on the sample page of `src/themes/preview/`, which is the same for every theme. Click 'Light' and 'Dark' to see both looks.

9. Set `charWidth` in `theme.ts`: the average width of a character of the body font, in em. A page with no script takes the width of the text from it. In a theme with `faces`, the first page that a browser opens in the theme also takes it until the page script runs. The page measures the font as the text renders and keeps the width in the browser. Click 'Apply' to show the new theme on the page. Then type `JSON.parse(localStorage.getItem('nerddocs-char-width'))` in the console of the browser, and copy the number of `<id>` into `charWidth`.
10. Run the check again, as step 7 says.

The tests check each theme in `THEMES` with no new test. They check the contrast of each color pair, each face file and each selector of `look.css`.

### Write look.css

Start each selector of `look.css` with `:root[data-theme="<id>"]`, or with `.sw [data-theme="<id>"]` for the chip of the theme in the theme box. A look then never changes another theme. The chip holds 'Aa' in `.aa` and three level dots in `.dots`. Keep the art still. Move only text, and only inside `@media (prefers-reduced-motion: no-preference)`.

A rule of `look.css` holds in the light look and in the dark look. To make a rule hold only in the dark look, put `[data-mode="dark"]` right after `[data-theme="<id>"]`. For example, `:root[data-theme="<id>"][data-mode="dark"] #thumb` styles the thumb in the dark look, and `.sw [data-theme="<id>"][data-mode="dark"]` styles the dark chip. Never use `@media (prefers-color-scheme: dark)`. A reader who picks 'Dark' on a computer set to light gets `data-mode="dark"`, and that media query does not match.

The page gives each look these hooks:

| Hook | What it is |
|---|---|
| `#art` | An empty element behind everything, fixed to the window. It paints nothing until a look paints it, such as with `background-color: var(--art)` and a `mask` of an SVG file. |
| `.col` | The text column, on `var(--sheet)`. A look can add a border, a radius and a padding to it. A look that changes the padding or the border at the left or the right sets `--frame` on `.col` to their sum, such as `--frame: 92px`, so a line still holds the number of characters of the text width. |
| `#ruler`, `.rmid` and `#width-menu` | The ruler of the text width at the top of the window, the middle of the ruler with its number, and the menu of the 'Text width' button. A look that frames the bar frames these to match. |
| `#panel`, `#bar` and the dialogs | Solid areas on `var(--bg)` or `var(--raise)`, so no art shows behind their text. |
| `--t` | A number from 0 to 1 on each `.tick`, each `.stop` and `#thumb`: the place on the slider. A look can draw the stops on a curve with it. |
| `--n` | The count of levels, on `.track` and `.stops`. |

## Send a change

`master` holds the release with the highest version. The work for each release is on its release branch, which is named `release/` followed by the version, such as `release/1.0.0`. Each change is made on a branch of its own and goes into a release branch by a pull request. Only a finished release goes into `master`, by a pull request from its release branch, as [Finish a release](#finish-a-release) says.

1. If you have no write access to `true-byte/nerDDocs`, fork it on GitHub. Then add your fork as the remote `fork` of your clone, where `<you>` is your GitHub user name:

   ```sh
   git remote add fork https://github.com/<you>/nerDDocs
   ```

2. List the release branches of `true-byte/nerDDocs`:

   ```sh
   git ls-remote origin 'refs/heads/release/*'
   ```

   Each line of the output ends with `refs/heads/release/` and a version, such as `refs/heads/release/1.0.0`. Most changes go into the release branch with the highest version. A fix to an older release goes into the release branch of its patch, as [Patch an older release](#patch-an-older-release) says.

   If no release branch fits the change, open an issue at https://github.com/true-byte/nerDDocs/issues that says which release the change is for. Go on to step 3 when the command lists the release branch.

3. From that release branch, make a branch for one change. `<version>` is the version of that release branch, and `<branch>` is the name of the new branch. Name a fix `fix/<version>-` followed by a short name, such as `fix/1.0.0-slider-reset`. Name any other change `feature/<version>-` followed by a short name, such as `feature/1.0.0-level-slider`. A `fix/` branch only fixes a bug of a released version, or of a change that is already merged. It holds nothing else.

   ```sh
   git fetch origin
   git switch -c <branch> --no-track origin/release/<version>
   ```

4. Make the change. Follow [Write docs](#write-docs). Run `npm run check`, as [Build and test](#build-and-test) says.
5. Push the branch to your fork:

   ```sh
   git push -u fork <branch>
   ```

   If you have write access to `true-byte/nerDDocs`, run this command in its place:

   ```sh
   git push -u origin <branch>
   ```

6. Open `https://github.com/true-byte/nerDDocs/compare/release/<version>...<you>:<branch>?expand=1`, say in the description, in 1 to 3 lines, what changes for the user and why, and click 'Create pull request'. The page opens with `release/<version>` as the base branch. If you pushed the branch to `origin`, put `true-byte` in place of `<you>`.

A person with write access to `true-byte/nerDDocs` reviews each pull request and decides whether to merge it into its release branch.

## Repository rules

GitHub rulesets on `true-byte/nerDDocs` hold these rules:

| Ruleset | Holds for | Rules |
|---|---|---|
| 'Master' | `master` | A change arrives only by a pull request whose check 'All tests' passes. No force push, no delete, and no person can bypass these rules. |
| 'Release branches' | `release/*` | A change arrives only by a pull request whose check 'All tests' passes. No force push, and no person can bypass these rules. A person with write access can create or delete such a branch, as [Make a release](#make-a-release) says. |
| 'Release tags' | `v*` | Only a repository admin can create, move or delete such a tag. |

## Make a release

Each release has a tag. The name of the tag is `v` followed by the version, such as `v1.0.0`. The tag keeps the commits of the release after its release branch is deleted.

In [Start a release](#start-a-release) and [Finish a release](#finish-a-release), `<version>` is the version of the release, such as `1.0.0`. A prerelease follows the same steps. For a prerelease, `<version>` is the version of the prerelease, such as `1.0.0-beta`.

### Start a release

When the work on a release starts, make its release branch from `master`:

```sh
git switch master
git pull origin master
git switch -c release/<version>
git push -u origin release/<version>
```

### Finish a release

1. Open `https://github.com/true-byte/nerDDocs/compare/master...release/<version>?expand=1`, list in the description what the release brings for the user, and click 'Create pull request'. Merge the pull request with 'Create a merge commit', so that `master` keeps the commits of the release.
2. Tag `master`, and push the tag:

   ```sh
   git switch master
   git pull origin master
   git tag -a v<version> -m v<version>
   git push origin v<version>
   ```

3. Move each open pull request into `release/<version>` to the release branch of the next version. GitHub closes each pull request whose base branch is deleted. If the next version has no release branch yet, make it first, as [Start a release](#start-a-release) says. To move a pull request, open it, click 'Edit title', pick the new branch in the base branch menu, and click 'Change base'.
4. Delete the release branch:

   ```sh
   git push origin --delete release/<version>
   git branch -d release/<version>
   ```

### Patch an older release

A patch fixes a release with a lower version than the release that `master` holds. For example, `1.1.1` fixes `1.1.0` while `master` holds `2.0.0`. In these steps, `<release>` is the version to fix, such as `1.1.0`, and `<patch>` is the version of the patch, such as `1.1.1`.

1. Make the release branch of the patch from the tag of the release to fix:

   ```sh
   git fetch --tags origin
   git switch -c release/<patch> v<release>
   git push -u origin release/<patch>
   ```

   A plain `git fetch` gets no tag of a past patch, because the commits of a past patch are on no branch. `--tags` gets every tag, so `<release>` can be a past patch.

2. Send each pull request of the patch into `release/<patch>`, as [Send a change](#send-a-change) says, with `<patch>` as `<version>`.
3. When the patch is done, tag the release branch, and push the tag:

   ```sh
   git fetch origin
   git switch release/<patch>
   git pull origin release/<patch>
   git tag -a v<patch> -m v<patch>
   git push origin v<patch>
   ```

4. If pull requests into `release/<patch>` are still open, make the release branch of the next patch from the tag `v<patch>`, as step 1 says. For example, make `release/1.1.2` from `v1.1.1`. Then move each of those pull requests to it, as step 3 of [Finish a release](#finish-a-release) says.
5. Delete the release branch of the patch:

   ```sh
   git switch master
   git push origin --delete release/<patch>
   git branch -D release/<patch>
   ```

   The branch never merges into `master`, so `git branch -d` refuses to delete it. `-D` deletes it, and the tag keeps its commits.

6. If the release branch with the highest version needs the fix too, copy the fix into a new branch from it. `<newest>` is the highest version that step 2 of [Send a change](#send-a-change) lists, such as `2.1.0`. If no listed version is higher than the release that `master` holds, start the next release first, as [Start a release](#start-a-release) says. `<branch>` is the name of the new branch, named as step 3 of [Send a change](#send-a-change) says.

   ```sh
   git fetch --tags origin
   git switch -c <branch> --no-track origin/release/<newest>
   git log --reverse --no-merges --oneline v<release>..v<patch>
   git cherry-pick <commit>
   ```

   `git log` lists the commits of the patch, oldest first. Each line of its output starts with the hash of a commit. Run `git cherry-pick` for each of those commits, where `<commit>` is its hash.

   Then send the branch as steps 5 and 6 of [Send a change](#send-a-change) say, with `<newest>` as `<version>`.

## Where each part is

| Folder | What it holds |
|---|---|
| `roadmap/` | The plan of nerDDocs, `roadmap.json`. |
| `docs/` | The docs of nerDDocs, such as its use cases and its tech stack. |
| `src/cli/` | The `nerddocs` command: its arguments, its error lines and the step that opens the browser. |
| `src/server/` | The server: its addresses, its watch on the folder and the updates that it sends to open pages. |
| `src/site/` | The site that a folder makes: its sections, its pages, their order, their addresses and its levels. |
| `src/markdown/` | The step that turns a Markdown file into the HTML and the title of a page. |
| `src/page/` | The page in the browser: its HTML, its style, the contents panel, the level slider, the level memory, the read time, the theme box, the text width and the live updates. |
| `src/themes/` | The themes, one folder each, with their colors, fonts and looks. It also holds the step that turns them into the style of the page, and in `preview/` the sample page of the theme box. |
| `tests/cli/`, `tests/server/`, `tests/site/`, `tests/markdown/`, `tests/page/`, `tests/themes/` | The tests of the `src/` folder with the same name. |
| `tests/support/` | The helpers that the tests share. |
| `scripts/` | The script behind `npm run check`. |
| `dist/` | The build output, which `npm run build` writes and Git ignores. |
| `.claude/skills/roadmapper/` | The `roadmapper` skill, with the roadmap file format. `npx skills update roadmapper` replaces it with the skill of the latest Roadmapper. |
