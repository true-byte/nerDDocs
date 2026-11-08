# nerDDocs: rules for Claude

This doc covers the rules for a Claude session that works on nerDDocs itself, and nothing else.

nerDDocs is an MIT open-source documentation platform. Each page holds its text at several levels, and the reader moves a slider on the page to switch between them.

| What | Where |
|---|---|
| What readers and authors need from nerDDocs | [docs/use-cases.md](docs/use-cases.md) |
| The parts that nerDDocs is built from | [docs/tech-stack.md](docs/tech-stack.md) |
| How to set up a clone, send a change, make a release, and find each folder | [CONTRIBUTING.md](CONTRIBUTING.md) |
| The rules that every edit to a doc follows | [CONTRIBUTING.md, section "Write docs"](CONTRIBUTING.md#write-docs) |
| The roadmap file format | [.claude/skills/roadmapper/format.md](.claude/skills/roadmapper/format.md) |
| How to keep a roadmap file | The `roadmapper` skill, [.claude/skills/roadmapper/SKILL.md](.claude/skills/roadmapper/SKILL.md) |
| nerDDocs's own roadmap file | `roadmap/roadmap.json` |

## Scope

- nerDDocs is not designed for any single application. It serves any text that comes in levels. A book can come at third-grade, high-school and university levels. Technical docs can come at levels for managers, developers and testers.
- The author names the levels, and a level need not build on the one before it. Moving to another level changes the text of the page, not only adds or removes parts.

## Rules

- Put each file in a folder by what it is, such as the plan in `roadmap/` and the docs in `docs/`. The repo root holds only the files that tools and GitHub look for there.
- Pick the tech stack only after all use cases are known.
- Delegate as much work as possible to agents, to keep the main context clean.
- License, contributing guide and GitHub files follow roadmapper's.

## nerDDocs's roadmap file

Plan and track all work in `roadmap/roadmap.json` with the `roadmapper` skill. Build nothing that `roadmap/roadmap.json` does not plan. Check the file with this command:

```sh
npx roadmapper validate roadmap/roadmap.json
```

This project adds these rules to the skill:

- No text of the roadmap file names a person or a role who acts. Write what is done, such as "A mock of the level slider on a docs page is reviewed and approved."
- Each feature has the shape of 'Level slider' in `roadmap/roadmap.json`. The group 'Level slider' holds the step 'Level slider design', then the group 'Level slider build'. 'Level slider build' has two tracks: 'Code', with the step 'Level slider code', and 'Tests', with the step 'Level slider tests'.
- The 'Code' track of a feature also holds the feature's docs, where it has any.
- Features go in a row in priority order. Two features go side by side in a branching only when they have the same priority and two sessions can build them at once without conflict.
- A step can take many sessions.
- Each version is a top-level branch. Its name is `v` followed by the version, such as 'v1.0.0'. Its first step waits for the release of the version before it, with `waitsFor`.
