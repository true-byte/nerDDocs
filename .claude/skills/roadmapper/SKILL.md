---
name: roadmapper
description: This skill says how to write and change a roadmap file for Roadmapper. A roadmap file is a JSON file, such as roadmap.json, that Roadmapper draws as a tree of steps. A good roadmap file reads as a row of main steps in priority order. A roadmap file plans any goal that takes steps, such as opening a shop, a wedding, a move, a research project or a product launch. Use this skill to create a roadmap file, or to add, move, split or remove its steps. Use it also to mark steps started, done or canceled, to change what comes first, to reshape a plan, or to check whether a plan is right. Use it even for a short request, such as "mark the ovens done", "add a delivery van to the plan" or "review the roadmap".
---

# Keep a roadmap file

This doc covers how to write and change a roadmap file: where each step goes, which keys it gets, and the checks before you answer.

Roadmapper draws a roadmap file as a tree on a page. The owner is the person, or the people, whose plan it is. The owner reads the page, not the file. The page shows what is done, what is in progress, and what comes next. So the shape of the tree is the plan. A wrong shape makes the plan wrong, however good its words are.

A roadmap file plans any goal that takes steps, such as opening a shop, a wedding, a move, a research project or a product launch. Each rule in this doc holds for every kind of goal. Write each step in the words that the owner uses for the goal.

[format.md](format.md), next to this doc, gives every key, value, state and error of a roadmap file. Read it before you write a roadmap file. This doc says how to use those keys well.

All examples in this doc come from one plan: opening a bakery. [format.md, section "Example"](format.md#example) gives that plan in full. Each example here shows only the items and keys that its rule needs. Some examples name a step or a change that the plan could get later, such as 'Bank lends the money'.

## A line means "comes next"

An item is a step or a split. On a branch, a line joins each item to the next item. A reader takes that line to mean that the next item comes next. An item comes next for one of two reasons:

- It waits for the item before it.
- It comes next by priority: the owner wants it done after the item before it.

When neither is true, the line is wrong.

In this doc, a wait means that one step cannot start until another step is done. A line shows a wait, or `waitsFor` does, as [Pick the piece that says what you mean](#pick-the-piece-that-says-what-you-mean) says.

A plan is a row of main steps in priority order. A main step is a step, or a group with a `name` that holds the steps of one piece of work, such as 'Fit out the shop'. At the level 'Main steps', each group shows as one step.

- Put each step after the steps that it waits for. Order the rest by priority, as [Decide each wait and the order](#decide-each-wait-and-the-order) says.
- Inside a group, the steps follow each other in order too, unless the next rule puts them side by side.
- Put two steps or branches side by side when, and only when, they have the same priority and two people can work on them at once without getting in each other's way. Side by side tells the reader "same priority".

The most common mistake is a fan: many branches side by side that differ in priority.

This fan is wrong:

```json
{ "id": "sign-the-lease", "name": "Sign the lease", "state": "done" },
{ "branching": true, "split": [
  { "name": "Shop", "items": [
    { "name": "Fit out the shop", "split": [ … ] },
    { "id": "town-gives-the-food-permit", "name": "Town gives the food permit" }
  ] },
  { "name": "Name", "items": [
    { "id": "pick-a-name", "name": "Pick a name" },
    { "id": "make-the-sign", "name": "Make the sign" }
  ] },
  { "name": "Staff", "items": [ { "id": "hire-bakers", "name": "Hire bakers" } ] },
  { "name": "Recipes", "items": [
    { "id": "pick-the-recipes", "name": "Pick the recipes" },
    { "id": "print-the-menu", "name": "Print the menu" }
  ] }
] },
{ "id": "opening-day", "name": "Opening day", "milestone": true }
```

`[ … ]` stands for the tracks 'Kitchen' and 'Front' of the right plan below. The fan is wrong in three ways:

- 'Shop', 'Name', 'Staff' and 'Recipes' side by side say that all four have the same priority. The owner wants the shop fitted out first.
- The page shows 'Install ovens', 'Pick a name', 'Hire bakers' and 'Pick the recipes' as work for now. It does not say which one comes next.
- 'Pick the recipes' can start before the bakers are hired. The bakers help pick the recipes, so the recipes may be picked twice.

This plan is right. It holds the same steps, as a row of main steps in priority order:

```json
{ "id": "sign-the-lease", "name": "Sign the lease", "state": "done" },
{ "name": "Fit out the shop", "split": [
  { "name": "Kitchen", "items": [ { "id": "install-ovens", "name": "Install ovens" } ] },
  { "name": "Front", "items": [ { "id": "build-the-counter", "name": "Build the counter" } ] }
] },
{ "name": "Name and sign", "split": [ { "items": [
  { "id": "pick-a-name", "name": "Pick a name" },
  { "id": "make-the-sign", "name": "Make the sign" }
] } ] },
{ "id": "hire-bakers", "name": "Hire bakers" },
{ "name": "Menu", "split": [ { "items": [
  { "id": "pick-the-recipes", "name": "Pick the recipes" },
  { "id": "print-the-menu", "name": "Print the menu" }
] } ] },
{ "id": "town-gives-the-food-permit", "name": "Town gives the food permit" },
{ "id": "opening-day", "name": "Opening day", "milestone": true }
```

- The owner said: "Fit out the shop first, then the name and the sign. The bakers and the menu come later." The row follows those words.
- 'Install ovens' and 'Build the counter' are side by side. They have the same priority, and two crews can fit the kitchen and the front at once.
- 'Town gives the food permit' comes right before 'Opening day', because the town inspects the finished shop.

## Groups and branchings

A split is a group or a branching. The two hold different kinds of work:

- A group is one piece of work, and its tracks are the parts of that work. 'Fit out the shop' is a group with the tracks 'Kitchen' and 'Front'. 'Menu' is a group with one track, which holds its steps in a row.
- A branching holds separate pieces of work side by side, each with a goal of its own. Write `"branching": true` on its split. The branches of a branching show at every level.

To choose, try to name the whole split as one step, in the owner's words. If one step name covers it, such as 'Fit out the shop', use a group. If only a list of names covers it, such as 'Shop', 'Name', 'Staff' and 'Recipes', the split holds separate pieces of work. Put those pieces in a row, each as a main step of its own. Use a branching only for pieces that may go side by side.

- Name each top-level branch, group, track and branch of a branching by what it holds, in the owner's words.
- When a step joins a branch, a track or a group, rename that branch, track or group if its name no longer covers all that it holds.
- The page shows a branching by the names of its branches, so a branching needs no `name`.

A group can hold a group. When one piece of work has a step and then parts side by side, the parts go in a group inside the group of that work. The level 'Main steps' then shows the whole piece of work as one step. Say the owner wants 'Draw the shop plan' before the kitchen and the front:

```json
{ "name": "Fit out the shop", "split": [ { "items": [
  { "id": "draw-the-shop-plan", "name": "Draw the shop plan" },
  { "name": "Build the shop", "split": [
    { "name": "Kitchen", "items": [ { "id": "install-ovens", "name": "Install ovens" } ] },
    { "name": "Front", "items": [ { "id": "build-the-counter", "name": "Build the counter" } ] }
  ] }
] } ] }
```

A branch that holds only one piece of work needs no group around it, because its name already names that work. Add no group inside a group for any other reason. At the level 'Tracks', every group is open, so each group inside a group makes that level more crowded.

## Place each step after what comes before it

The rules of a line hold at every depth. Steps in a row inside a track also come next by a wait or by priority.

- The branches of a split can all start at once. So a step that waits for a step on another branch of the same split is in the wrong place. Put it on that other branch, after the step that it waits for, or put the two branches in a row.
- Keep the steps of one piece of work together, in one group, such as 'Pick the recipes' and 'Print the menu' in 'Menu'. A group among those steps goes in that group too, as [Groups and branchings](#groups-and-branchings) shows.
- A step that waits for two steps goes after both. 'Make the sign' waits for 'Sign the lease' and 'Pick a name'. Both come before it on the row, so it needs no `waitsFor`.

## The test of a good plan

The owner asks: "What do we work on now, and what comes after it?" The page alone must answer that question.

- At the level 'Main steps', each top-level branch reads as a row of main steps in priority order. In the bakery plan, 'First shop' reads 'Sign the lease', 'Fit out the shop', 'Name and sign', 'Hire bakers', 'Menu', 'Town gives the food permit' and 'Opening day'.
- Each main step is a whole piece of work, not a part of one.
- The work for now is the first item on each top-level branch that is neither done nor canceled. When that item is a split, it is the first such step on each of its branches. A step that is blocked or `"tbd"` is not in the answer. In the bakery plan, the answer is 'Install ovens' and 'Build the counter'.
- No line and no split on the page is wrong.

If your answer needs a "but" or a "not sure", the plan is not done yet.

## Decide each wait and the order

Decide each wait and the order before you save, in a new plan and in each change to a plan. The order comes from the waits first, then from priority.

- Write each wait that the owner states.
- When the owner says that a step needs a thing, such as the name, the step waits for the step that makes that thing. 'Make the sign' needs the name, so it waits for 'Pick a name'. When no step in the plan makes that thing, ask the owner which step makes it.
- Words such as "first", "then" or "later" set the order. "Fit out the shop first" puts 'Fit out the shop' before the other main steps.
- Work that would have to be done again if another step changed later goes after that step. The bakers help pick the recipes, so 'Menu' goes after 'Hire bakers'.
- For any other wait, read the `why` and the `doneWhen` of both steps. Read also what the owner has said or written about them.
- A wait is sure when the names of the steps, their `why`, their `doneWhen` or the owner's words make it plain. The menu lists the recipes, so 'Print the menu' waits for 'Pick the recipes'.
- If you are still not sure of a wait, or of which of two steps comes first, ask the owner one short question before you save. Ask even when the owner asked for the whole plan at once.
- When the owner names a part of the plan but no step in it, ask the owner one short question about its steps. Such a part can be a phase or a year.
- When the owner names the things that a part of the plan brings, write a step for each thing. When the owner says that 'Fit out the shop' brings the ovens and the counter, write 'Install ovens' and 'Build the counter'. Make each such step exact or "tbd", as [Make near steps exact and far steps "tbd"](#make-near-steps-exact-and-far-steps-tbd) says.
- Never save a plan with a wait or an order that you are not sure of. Never give the owner a list of doubts in place of the plan.
- Where a wait is not plain from the names, write it in the `why` of the step that waits. Then the next person who reshapes the plan keeps it. Write no order in a `why`, because the row shows the order.

## Add to a plan that has wrong lines

A wrong line is a line that is neither a wait nor priority order. A wrong split is a split whose branches differ in priority, or would get in each other's way.

Put new work where its waits and its priority put it. When a wrong line or a wrong split is next to that place, put those steps in order in the same change. Do these three things, in order:

1. Put the steps that are not done in order: by their waits first, then by priority. Put steps side by side only where [A line means "comes next"](#a-line-means-comes-next) allows it.
2. Keep each wait that is true.
3. Tell the owner in one sentence what else moved.

When you move a step, it loses every wait that its lines gave it. It loses both what it waited for and what waited for it. Drop only the waits that you know are wrong. Show each other wait again: by a line, or by `waitsFor` where the other step is on another top-level branch.

Never move steps into a track or group whose name tells the owner nothing. 'Other tasks' and 'Rest of the fit-out' are such names.

- At the level 'Main steps', a group with no `name` shows how many tracks it has, such as '3 tracks', when the names of its tracks do not fit. That tells the owner nothing. So give each group a short `name` of what it holds or makes.
- A group of separate pieces of work also tells the owner nothing. Put those pieces in a row, each as a main step of its own.

Done steps stay where they are, because they show how the work went. Move only steps that are not done.

In a new plan, place a done step by its waits and its priority, as any other step. A wait for a done step counts as any other wait.

## Pick the piece that says what you mean

| What you mean | The piece |
|---|---|
| Steps where each one waits for the one before, or comes after it by priority | The items of one branch, in order. |
| One piece of work, such as the name and the sign | A group with a `name` and one track, which holds the steps in order. At 'Main steps', it shows as one step. |
| Parts of one piece of work that may go side by side, such as the kitchen and the front of 'Fit out the shop' | A group with a track for each part: a `split` with no `"branching": true` and no branch with `"ends": true`. Give it a `name`. |
| One piece of work with a step, then parts side by side, such as 'Draw the shop plan', then the kitchen and the front | A group with a `name` and one track. The track holds the step, then a group with a track for each part. |
| Separate pieces of work that may go side by side, such as a website and a delivery van that the owner rates the same | A branching that comes back: a `split` with `"branching": true`. |
| A side branch that leaves and does not come back, such as a stall at the summer market | A branching that ends: a `split` with a branch that has `"ends": true`. |
| Parts of the plan that the owner plans on their own, such as the first shop and a second shop. One part may wait for another. | Top-level `branches`. |
| A later part of the plan that can start only after a milestone of an earlier part, such as a second shop after 'Opening day' | A top-level branch whose first step waits for that milestone, by `waitsFor`. |
| A step that waits for a step on another top-level branch | `waitsFor` on the step that waits. |
| A step that waits for something outside the plan, such as a bank or a supplier | A step of its own for that, such as 'Bank lends the money'. |
| Work that may not happen at all, such as a delivery service | A step with the state `"tbd"`. |

Place a step for something outside the plan, or for work that may not happen, as you place any step. When it needs a thing that no step in the plan makes, ask the owner which step makes it.

Something outside the plan can still wait for a step in the plan. 'Town gives the food permit' waits for the finished shop. Decide such a wait as [Decide each wait and the order](#decide-each-wait-and-the-order) says.

- Name the step by what the next step needs from outside, such as 'Bank lends the money' or 'Town gives the food permit'.
- Add the owner's own step to ask for it, such as 'Apply for the food permit', only when the owner names that step.

No line joins two top-level branches. So `waitsFor` is the only way to show that a step waits for a step on another top-level branch.

- Use `waitsFor` only for a wait on another top-level branch. Inside one top-level branch, show each wait by a line.
- Never write a `waitsFor` between two branches of one split. The page then draws a branch that looks free to start, but is blocked. Place the step as [Place each step after what comes before it](#place-each-step-after-what-comes-before-it) says.
- Write no `waitsFor` for what a line already shows. A step already comes after each item before it on the same branch.
- Never write `"state": "blocked"`, because it is an error. When a step waits for a step on another top-level branch, write that step in `waitsFor`. The page then draws the waiting step as blocked until that step is done or canceled.

## The keys of a step

| Key | What to write |
|---|---|
| `id` | Write the name in lowercase, with `-` between the words, such as `sign-the-lease`. When that id is taken, add `-2`, then `-3`, such as `test-bake-2` for a second step named 'Test bake'. Never change an id once it exists, even when you rename or move the step. |
| `name` | Write a few words that the owner would use. Steps on different branches may have the same name, such as 'Test bake' on the branch 'Bread' and on the branch 'Cakes'. |
| `why` | Write one line on why the step is there, such as 'The bread needs two big ovens.' |
| `doneWhen` | Write a check that a person can do, such as 'Both ovens bake a test batch.' A check names what a person can see or count. A word such as 'ready' or 'good' alone is a wish, not a check. |
| `state` | Write `"in-progress"` when work starts, and `"done"` when the `doneWhen` check passes. Write `"canceled"` when the owner drops planned work. Keep the canceled step, so that the plan keeps its history. |
| `milestone` | Write `true` only for the few big moments, such as 'Opening day'. |
| `start`, `end`, `deadline` | Write a day only when the owner has set that day. When the owner names only a month, a season or a span, such as "next June" or "in three months", write no day. Write what the owner named in the `why` of the step that it is for. Write a month with its year, such as 'June 2027', in place of "next June". The month of the goal is for the milestone of the goal. So for "we open next June", the `why` of 'Opening day' says 'The bakery opens in June 2027.' Write a span of the whole plan in `about`, and a span of a top-level branch in its `holds`. |
| `icon` | Write only a name that is in the icon set, such as `bread`. [format.md, section "Icons"](format.md#icons) names the set, and says how to check a name. The `validate` command does not find a wrong name, so leave `icon` out when you are not sure. |
| `links` | Write a link only to a page that you know exists, such as the signed lease at the address that the owner gave. Never guess an address. Copy it in full, from `https://` or `http://`. Pick its `icon` as for the `icon` of a step, such as `file-text` for a doc. |

Write each `why` and `doneWhen` as a plain fact in the third person, such as 'The town sends the signed permit.'

## Make near steps exact and far steps "tbd"

A step is near when it is in progress or can start now. A step can start now when each step that it waits for is done or canceled, wherever the priority order puts it. A step is near too when each step that it waits for is done, canceled or in progress, or can start now. Every other step is far. In the bakery plan, 'Make the sign' is near, because 'Sign the lease' is done and 'Pick a name' can start now. 'Print the menu' is far, because it waits for 'Pick the recipes', which waits for 'Hire bakers'. 'Second shop' is far too.

- Give each near step a clear `why` and a `doneWhen`.
- When the owner gave no check, write the simplest check that fits the name of the step. For 'Make the sign', that check is 'The sign hangs over the door.' Write no count, name or day that the owner did not give.
- Give each far step a name and the state `"tbd"`. A `why` is optional, and a far step has no `doneWhen`. This holds even when the owner named the step, because its detail is still a guess.
- A milestone that the owner set as the goal, such as 'Opening day', stays exact however far it is. Give it a `why` and a `doneWhen`.
- When a far step becomes near, make it exact then.
- Invent no detail for a far step. Add no step from a guess about what the owner might want. Ask the owner instead.

## Plan only the work

The plan shows the work toward the goal, the way the owner thinks of it. It does not record who worked on what, or when. Your own mistakes and their fixes are never steps.

## Before you answer

1. Read the plan as the page shows it. Go along each branch from its first item to its last. For each line, say why the next item comes next. It is a wait, such as "'Make the sign' waits for 'Pick a name'", or priority, such as "the owner wants 'Fit out the shop' first". Where neither is true, move the next item. For each split, check that its branches have the same priority, and that two people can work on them at once. Where not, put them in a row.
2. For each step that you moved, list what it waited for and what waited for it before the move. Each of those waits must still be there, by a line, or by `waitsFor` where it is on another top-level branch. Only a wait that you know was wrong may go.
3. Answer the question of [The test of a good plan](#the-test-of-a-good-plan).
4. Check that every step from before keeps its `id`.
5. Save the file. Then run Roadmapper's `validate` command on it yourself. Do not ask the owner to run it. The command needs Node. Run it in a folder where Roadmapper is installed. Give it the path of the roadmap file, which may be in any folder:

   ```sh
   npx roadmapper validate roadmap.json
   ```

   The command prints each error on a line of its own. [format.md, section "Errors"](format.md#errors) says what each error means. Fix each error, and run the command again until it prints `roadmap.json: no errors`.

## When you are done

- Write only the roadmap file, unless the owner asks for more.
- Tell the owner in one or two sentences what changed on the page.
