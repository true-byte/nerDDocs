# Contributing

This doc covers how to work on nerDDocs itself. It says how to set up a clone, build and test, send a change and make a release. It also gives the rules for docs, and what each folder of the clone holds.

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
| `src/page/` | The page in the browser: its HTML, its style, the contents panel, the level slider and the live updates. |
| `tests/cli/`, `tests/server/`, `tests/site/`, `tests/markdown/`, `tests/page/` | The tests of the `src/` folder with the same name. |
| `tests/support/` | The helpers that the tests share. |
| `scripts/` | The script behind `npm run check`. |
| `dist/` | The build output, which `npm run build` writes and Git ignores. |
| `.claude/skills/roadmapper/` | The `roadmapper` skill, with the roadmap file format. `npx skills update roadmapper` replaces it with the skill of the latest Roadmapper. |
