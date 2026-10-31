# The roadmap file format

This doc covers the roadmap file format: each key and its values, the states of a step, and the errors that `validate` finds.

A roadmap file is one JSON file, such as `roadmap.json`. Roadmapper draws it as a tree on a page. [SKILL.md](SKILL.md) says where to put each step, so that the plan reads as a row of main steps in priority order.

## Example

This roadmap file plans the opening of a bakery. Every example in [SKILL.md](SKILL.md) comes from this plan, or names a step or a change that this plan could get later.

```json
{
  "title": "Corner bakery",
  "about": "A small bakery on Main Street that sells bread and cakes.",
  "branches": [
    { "name": "First shop", "holds": "Fit out the shop, name it, hire the bakers, pick the recipes, and open the doors.", "items": [
      { "id": "sign-the-lease", "name": "Sign the lease", "state": "done", "icon": "signature", "why": "Nothing goes into the shop before the lease is signed.", "doneWhen": "The owner and the landlord have both signed the lease." },
      { "name": "Fit out the shop", "split": [
        { "name": "Kitchen", "items": [
          { "id": "install-ovens", "name": "Install ovens", "state": "in-progress", "start": "2027-03-01", "end": "2027-03-19", "why": "The bread needs two big ovens.", "doneWhen": "Both ovens bake a test batch." }
        ] },
        { "name": "Front", "items": [
          { "id": "build-the-counter", "name": "Build the counter", "why": "People choose and pay at the counter.", "doneWhen": "The counter stands, with the till on it." }
        ] }
      ] },
      { "name": "Name and sign", "split": [
        { "items": [
          { "id": "pick-a-name", "name": "Pick a name", "why": "The sign shows the name of the bakery.", "doneWhen": "The town has registered the name of the business." },
          { "id": "make-the-sign", "name": "Make the sign", "why": "The sign shows the name and fits the front of the shop.", "doneWhen": "The sign hangs over the door." }
        ] }
      ] },
      { "id": "hire-bakers", "name": "Hire bakers", "why": "The bakery needs two bakers for the early shift.", "doneWhen": "Two bakers have signed a work contract." },
      { "name": "Menu", "split": [
        { "items": [
          { "id": "pick-the-recipes", "name": "Pick the recipes", "icon": "bread", "why": "The menu and the shopping list come from the recipes. The bakers help pick them.", "doneWhen": "The list of recipes for the first month is written down." },
          { "id": "print-the-menu", "name": "Print the menu", "state": "tbd", "why": "People read the bread, the cakes and the prices on the menu." }
        ] }
      ] },
      { "id": "town-gives-the-food-permit", "name": "Town gives the food permit", "why": "The town inspects the finished shop before the bakery may sell food.", "doneWhen": "The town sends the signed permit." },
      { "id": "opening-day", "name": "Opening day", "icon": "confetti", "milestone": true, "deadline": "2027-06-12", "why": "The bakery opens to the public on this day.", "doneWhen": "The doors open and the first loaf is sold." }
    ] },
    { "name": "Second shop", "holds": "Open a second bakery across town.", "items": [
      { "id": "second-shop", "name": "Second shop", "state": "tbd", "waitsFor": ["opening-day"] }
    ] }
  ]
}
```

Roadmapper also comes with the sample roadmap file, 'Plant care app', which plans a phone app. It uses every state and every key that a person writes. It is at one of these paths:

- `node_modules/roadmapper/data/sample.roadmap.json` in a folder where Roadmapper is installed.
- `data/sample.roadmap.json` in a clone of Roadmapper.

## The pieces

A roadmap file is made of five kinds of piece.

| Piece | What it is |
|---|---|
| Roadmap | The whole file: one JSON object. |
| Branch | A list of items, done in order. The roadmap holds the top-level branches, and each split holds branches too. |
| Split | An item of a branch that holds branches side by side, done in any order. |
| Step | An item of a branch: one piece of work. |
| Link | An object in the `links` of a step: a page that the step links to. |

An item with the key `split` is a split. Every other item is a step.

A value is one of these kinds: a text, `true` or `false`, a day written `YYYY-MM-DD`, an address, a list, or an object. An address starts with `https://` or `http://`, such as `https://example.com/menu.pdf`. A key marked "Needed" must be in its piece. A key with no mark may be left out.

The tables below name two parts of the page. The tip is the short box that shows when the pointer is on a piece. The side bar shows all that the file says about the piece that is clicked.

### Roadmap

| Key | Value | What it means |
|---|---|---|
| `title` | A text that is not empty. Needed. | The name of the roadmap. The page shows it at the top. |
| `branches` | A list of one or more branches. Needed. | The top-level branches. The page draws them one under the other, in the order of the list, with a faint line across the page between two of them. No line joins one top-level branch to another. |
| `about` | A text. | One line on what the plan is. The HTML export makes it the description of its page. Search results and link previews can show that description. |
| `icons` | An object. | The drawings of the icons that the steps name. Only the HTML export writes this key. |

### Branch

| Key | Value | What it means |
|---|---|---|
| `items` | A list of steps and splits. Needed. | The items of the branch, done in order. They go left to right when the plan runs across, and top to bottom when it runs down. A line joins each item to the next item. |
| `name` | A text. | The caption of the branch. |
| `holds` | A text. | One line on what the branch holds. The tip and the side bar of the branch show it. |
| `ends` | `true` or `false`. | With `true`, a branch of a split ends on its own: it joins nothing after the split. Without it, the branch joins the item that comes after the split. When the split is the last item of its branch, its branches come back at the end of that branch. They then join what that branch joins, by the same rules. The end of a top-level branch joins nothing. |
| `private` | `true` or `false`. | With `true`, the branch is private, with all that is in it. See [Private items](#private-items). |

### Split

| Key | Value | What it means |
|---|---|---|
| `split` | A list of one or more branches. Needed. | The branches of the split, side by side, done in any order. |
| `name` | A text. | The name of a group, which the page shows. See [Groups and branchings](#groups-and-branchings). The page shows no `name` of a branching: it shows the `name` of each of its branches. Only the `<path>` of an error shows the `name` of a branching. |
| `branching` | `true` or `false`. | With `true`, the split is a branching, even when all of its branches come back together. |
| `private` | `true` or `false`. | With `true`, the split is private, with all that is in it. See [Private items](#private-items). |

### Step

| Key | Value | What it means |
|---|---|---|
| `id` | A text that is not empty, and that no other step in the file has. Needed. | The page follows a step by its id. A step whose id changes looks like a new step. |
| `name` | A text that is not empty. Needed. | The name that the page shows for the step. |
| `state` | `"todo"`, `"in-progress"`, `"done"`, `"canceled"` or `"tbd"`. | Where the step stands. A step with no `state` is still to do. See [States](#states). |
| `why` | A text. | One line on why the step is there. The tip and the side bar show it. |
| `doneWhen` | A text. | One line with the check that shows that the step is done. The side bar shows it. |
| `icon` | A text. | The name of an icon. See [Icons](#icons). |
| `milestone` | `true` or `false`. | With `true`, the step has a ring around it, and its name is bold. |
| `links` | A list of links. | The pages that the step produced, such as a doc or a demo. The side bar lists them under 'Links', before 'Why'. See [Link](#link). |
| `start` | A day. | The day the work is planned to start. The side bar shows it. |
| `end` | A day. | The day the work is planned to end. The side bar shows it. |
| `deadline` | A day. | The day the step must be done by. The side bar shows it. |
| `waitsFor` | A list of the ids of other steps. The steps may be on any branch. | The steps that this step waits for. While one of them is neither done nor canceled, this step is blocked, unless this step is done or canceled itself. The side bar lists the steps that block it under 'Blocked by'. The page draws no line for `waitsFor`. [SKILL.md, section "Pick the piece that says what you mean"](SKILL.md#pick-the-piece-that-says-what-you-mean) says when to use it. |
| `private` | `true` or `false`. | With `true`, the step is private. See [Private items](#private-items). |
| `waitsForPrivate` | `true` or `false`. | With `true`, the step waits for private work that is neither done nor canceled, and that the HTML export left out. The step is blocked, as with `waitsFor`, and the side bar shows no 'Blocked by'. Only the HTML export writes this key. |

### Link

| Key | Value | What it means |
|---|---|---|
| `name` | A text that is not empty. Needed. | The name of the page. The side bar shows it in bold, with an arrow after it. |
| `url` | An address. Needed. | The page that opens in a new tab when the link is clicked. |
| `icon` | A text. | The name of an icon that says what the page is, such as `file-text` for a doc. A link with no `icon`, or with a name that is not in the set, shows the icon `link`. See [Icons](#icons). |

To link 'Sign the lease' in the bakery plan to the signed lease, add this key to the step:

```json
"links": [
  { "name": "Signed lease", "url": "https://example.com/bakery/lease.pdf", "icon": "file-text" }
]
```

## Groups and branchings

A split is either a group or a branching.

| | A group | A branching |
|---|---|---|
| What it is | One piece of work whose parts go side by side, as tracks: branches that always come back together. A group with one track is steps in a row. | Separate branches side by side. They come back together, or they end on their own. |
| How the file says it | A split with no `"branching": true`, and no branch with `"ends": true`. | A split with `"branching": true`, or with a branch that has `"ends": true`. |
| How the page draws it | It changes with the level. At the level 'Main steps', it shows as one step. At the level 'Tracks', it opens into a frame. | Its branches are open at every level, each with its `name` as a caption. |

[view.md, section "Levels"](https://github.com/true-byte/roadmapper/blob/master/docs/view.md#levels) says what each level shows. In a project that has Roadmapper installed, that doc is `node_modules/roadmapper/docs/view.md`.

## States

| `state` | What it means | How the page draws it |
|---|---|---|
| None, or `"todo"` | The step is still to do. | An empty ring. |
| `"in-progress"` | The step is in progress. | A ring with a dot. |
| `"done"` | The step is finished. | A filled ring with a check. |
| `"canceled"` | The step is dropped: no one works on it. | A ring with a cross, and the name struck out. |
| `"tbd"` | The step is still a guess, with no `doneWhen` yet. It is far off, or it may not happen at all. | A dashed ring. |
| Never written: blocked | The step is blocked: it waits for a step that is neither done nor canceled, as its `waitsFor` says. | A ring with a bar. |

A file that has `"state": "blocked"` has the error `Invalid value`. A step is blocked only by what it waits for.

## Private items

A branch, a split or a step with `"private": true` is private, with all that is in it.

- The HTML export for strangers leaves out every private item.
- Where the page draws a private item, the tip and the side bar give it and all that is in it a 'Private' tag.
- The words and links of an item that is not private go into the export as they are written. So they must not name a private item or point to it.

## Icons

The `icon` of a step or of a link is the name of an icon in Tabler Icons, the icon set of the theme. [icon-sets.iconify.design/tabler](https://icon-sets.iconify.design/tabler/) lists the names. A step with no `icon`, or with a name that is not in the set, shows the mark of its state.

To check a name with no web, run this command in a project that has Roadmapper installed. Write the name in place of `bread`:

```sh
grep -c -F '\"bread\":{' node_modules/roadmapper/dist/lib/tabler.js
```

The command prints `1` when an icon of the set has that name. When it prints `0`, leave `icon` out. In a clone of Roadmapper, run `npm run build:lib` first, and use the path `dist/lib/tabler.js`.

## Errors

Roadmapper's `validate` command checks a roadmap file, as check 5 of [SKILL.md, section "Before you answer"](SKILL.md#before-you-answer) says. The command prints each error on a line of its own:

```text
<file>:<line>  <path>  <key>  <error>  <value>
```

| Field | What it holds |
|---|---|
| `<file>` | The path of the roadmap file, as the command was given it. |
| `<line>` | The line of the file that the error is on, counted from 1. It is empty for `Unreadable file`. |
| `<path>` | The piece that the error is in, as the page names it. It names the top-level branch, then the groups, branchings and branches in it, then the step, then the link, joined by ` › `. Each piece goes by its `name`. A step with no name goes by its id. A top-level branch with no name goes by its place, such as `#2`. Any other piece with no name is left out. The field is empty for the roadmap itself. |
| `<key>` | The key that is wrong or missing. It is empty for an error of a whole piece, of text that is not JSON, or of a file that cannot be read. |
| `<error>` | One of the names in the table of errors below. |
| `<value>` | The wrong value, as the file writes it. A value longer than 60 characters is cut to its first 59 characters and `…`. For `Invalid JSON`, it is the text where the file breaks, if there is any. It is empty for `Unknown key`, `Missing key` and `Unreadable file`, which have no wrong value. |

Two spaces separate the fields, and each field keeps its place when it is empty. A file with no error prints one line, `<file>: no errors`.

The page does not draw a roadmap file that has errors. It shows the error list in place of the plan. This holds in the app, in the page of an HTML export, and in a box on another page.

| Error | What it means |
|---|---|
| `Invalid JSON` | The text is not JSON. The one error is on the line where the text breaks. |
| `Unknown key` | The piece has a key that its table above does not list. |
| `Missing key` | A needed key is missing. The tables above mark each needed key "Needed". |
| `Wrong type` | A value is of the wrong kind, such as a text where a list goes. A roadmap, a branch, an item or a link that is not an object has this error too. An id in `waitsFor` that is not a text has this error too. |
| `Invalid value` | The key does not take the value. This error is for an empty text in `title`, `id` or `name`, or an empty list in `branches` or `split`. It is also for a `state` other than `"todo"`, `"in-progress"`, `"done"`, `"canceled"` or `"tbd"`, and for a `waitsFor` with the id of its own step. |
| `Invalid date` | A `start`, `end` or `deadline` is not written `YYYY-MM-DD`, or is not a day on the calendar, such as `2026-02-30`. |
| `Invalid URL` | A `url` is not an address: it does not start with `https://` or `http://`, or a browser cannot read it, such as `https://` alone. |
| `Duplicate id` | More than one step has the same `id`. The error is on each line that holds that id. |
| `Unknown id` | An id in `waitsFor` is the id of no step. |
| `Unreadable file` | The roadmap file cannot be read. Either no file is at that path, or the page that draws the file is not allowed to read it. For example, a page opened from disk cannot read the file at the `src` of its `<roadmapper-view>`, and shows this error when the tag holds no text of a roadmap file. |
