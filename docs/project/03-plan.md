# Plan

::: casual
The plan of nerDDocs is one file. One command shows the plan on a page, and another command checks the file.

::: pro
The plan of nerDDocs is the file `roadmap/roadmap.json`. Roadmapper shows the plan on a page with one command, and checks the file for errors with another.

::: full-nerd
The plan of nerDDocs is the file `roadmap/roadmap.json`. Roadmapper shows it on a page with `npx roadmapper dev`, and checks it for errors with `npx roadmapper validate`.
:::

## See the plan

::: casual
Run one command, and a page shows the plan. The page draws the plan again each time the file is saved.

::: pro full-nerd
Set up a clone, as [CONTRIBUTING.md](https://github.com/true-byte/nerDDocs/blob/master/CONTRIBUTING.md#set-up-a-clone) says. Then run this command in the clone:

```sh
npx roadmapper dev roadmap/roadmap.json
```

Open the address that the command prints. The page shows the plan and redraws it each time `roadmap/roadmap.json` is saved.

::: full-nerd
The page draws the file `roadmap/roadmap.json`, which follows the format of [format.md](https://github.com/true-byte/nerDDocs/blob/master/.claude/skills/roadmapper/format.md). The rules for the shape of the plan, such as the steps of each feature, are in [CLAUDE.md](https://github.com/true-byte/nerDDocs/blob/master/CLAUDE.md#nerddocss-roadmap-file).
:::

## Check the plan

::: casual
Another command checks the file and tells whether the plan has errors.

::: pro full-nerd
Run this command in the clone to check the file:

```sh
npx roadmapper validate roadmap/roadmap.json
```

For a right file, it prints `roadmap/roadmap.json: no errors`.

::: pro
For a wrong file, it prints one line for each error.

::: full-nerd
For a wrong file, it prints one line for each error, with the line of the file, the step, the key, the error and the value. It then exits with `1`.
:::
