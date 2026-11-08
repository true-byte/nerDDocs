import { expect, type Page } from '@playwright/test';
import {
  expectLevel,
  levelStyle,
  MOVE_MS,
  openOnStoppedClock,
  pressOnSlider,
  scrollPage,
  SIGNALS_MS,
  THREE_LEVELS,
} from '../support/levels.ts';
import { levelRule } from '../../src/page/levels.ts';
import { themeById } from '../../src/themes/index.ts';
import { rgbOf } from '../support/css.ts';
import { diagramBox, DIAGRAMS_SITE, drawingOf, expectDrawn, isMarked, markDrawing, RESTORE_FLOW, storeLook } from '../support/diagrams.ts';
import { hydrated, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

const sentence = (text: string) => `${text} `.repeat(30).trim();
const paragraphs = (text: string, count: number) =>
  Array.from({ length: count }, (_, n) => `${text} paragraph ${n}. ${sentence('A restore is a job on the server.')}`).join('\n\n');

/** A fence with a part whose text starts with its name, so that a test can find the part. */
const named = (level: string, name: string) => `::: ${level}\n${name}. ${sentence('Text of the part.')}\n`;

/** Each step has a shared heading, a short text at two levels, a long text at one, and a shared last line. */
const STEPS = Array.from(
  { length: 14 },
  (_, n) => `## Step ${n}

::: overview
Overview of step ${n}.
::: requirements
Requirements of step ${n}.
::: internals
${paragraphs(`Internals of step ${n}`, 3)}
:::

Shared end of step ${n}.
`,
).join('\n');

/** Text at every level in each part, as a book has, with no shared text. */
const BOOK = Array.from(
  { length: 60 },
  (_, n) => `::: overview
Overview page ${n}. ${sentence('Pick a file.')}
::: requirements
Requirements page ${n}. ${sentence('The app restores it.')}
::: internals
Internals page ${n}. ${sentence('The agent asks the server.')}
`,
).join('\n');

const FILES: Record<string, string> = {
  'nerddocs.json': THREE_LEVELS,
  'restore.md': `# Restore a file

A restore never changes the copy.

::: overview
Pick a file and a day.
::: requirements
The app restores any file.
::: internals
A restore is a job.
:::

${paragraphs('Shared', 20)}

::: overview
Far text of overview.
::: requirements
Far text of requirements.
::: internals
Far text of internals.
:::
`,
  'steps.md': `# Steps\n\n${STEPS}`,
  'book.md': `# Book\n\n${BOOK}`,
  'book-end.md': `# Book end\n\n${BOOK}:::\n\nShared last line.\n`,
  'mixed.md': `# Mixed

::: overview internals
Text of overview and internals.
::: overview
Text of overview.
::: requirements
Text of requirements.
:::
`,
  'short-level.md': `# Short level

${paragraphs('Before', 2)}

::: overview
One line at overview.
::: requirements
One line at requirements.
::: internals
${paragraphs('Internals', 40)}
:::
`,
  'twins.md': `# Twins

${paragraphs('Before', 10)}

::: overview
First at overview.
::: internals
${paragraphs('First at internals', 3)}
::: overview
Second at overview.
::: internals
${paragraphs('Second at internals', 3)}
::: requirements
Text of requirements.
:::

${paragraphs('After', 10)}
`,
  'tall.md': `# Tall

${paragraphs('Before', 2)}

::: overview
${paragraphs('Overview', 30)}
::: requirements
Text of requirements.
::: internals
${paragraphs('Internals', 60)}
:::

${paragraphs('After', 2)}
`,
  'seam-code.md': `# Seam on code

A restore never changes the copy.

::: overview requirements internals
Text at each level.
::: internals
A restore is a job.
:::

\`\`\`sh
restore --from monday
\`\`\`
`,
  'seam-table.md': `# Seam on a table

A restore never changes the copy.

::: overview requirements internals
Text at each level.
::: internals
A restore is a job.
:::

| Plan | Days |
|---|---|
| Team | 14 |
`,
  'seam-end.md': `# No seam at the end

A restore never changes the copy.

::: overview requirements internals
Text at each level.
::: internals
A restore is a job.
:::
`,
  'heading.md': `# Heading

A restore never changes the copy.

::: overview
Pick a file.
::: requirements
Pick a day.
::: internals
Pick a job.
:::

## Pick a target

Text after the heading.

::: internals
The job checks the target.
:::

## Check the file

::: overview requirements internals
Text at each level.
:::
`,
  'wrapper.md': `# Wrapper

A restore never changes the copy.

<details open>
<summary>More</summary>

::: overview
Text in a wrapper at overview[^1].
::: requirements
Text in a wrapper at requirements.
::: internals
Text in a wrapper at internals[^2].
:::

</details>

[^1]: The first note.
[^2]: The second note.
`,
  'uneven.md': `# Uneven

${paragraphs('Before', 10)}

::: overview
One at overview.
::: internals
${paragraphs('First at internals', 3)}
::: internals
${paragraphs('Second at internals', 3)}
::: internals
${paragraphs('Third at internals', 3)}
:::

${paragraphs('After', 10)}
`,
  'uneven-three.md': `# Uneven at three levels

${paragraphs('Before', 10)}

::: overview
One at overview.
::: requirements
First at requirements.
::: requirements
Second at requirements.
::: internals
${paragraphs('First at internals', 3)}
::: internals
${paragraphs('Second at internals', 3)}
::: internals
${paragraphs('Third at internals', 3)}
:::

${paragraphs('After', 10)}
`,
  'both-ends-run.md': `# Both

${paragraphs('Before', 10)}

::: internals
${paragraphs('Internals', 3)}
::: overview requirements internals
Text at each level.
::: overview
Text at overview.
:::

${paragraphs('After', 10)}
`,
  'ids.md': `# Ids

A restore never changes the copy.

::: overview
## Pick a day

Text at overview[^1].
::: internals
## Pick a job

Text at internals.
:::

[^1]: The first note.
`,
  'hidden-heading.md': `# Hidden heading

A restore never changes the copy.

## Job details

### Job queue

::: internals
Text of the queue.
:::

## Pick a day

::: overview requirements internals
Text at each level.
:::

<details open>
<summary>More</summary>

::: internals
Text of more.
:::

</details>

## Last words

A restore ends here.
`,
  'heading-ends-run.md': `# Heading ends a run

A restore never changes the copy.

::: overview
Text at overview.
:::

## Job details

::: internals
Text at internals.
:::
`,
  'hidden-next.md': `# Next block is hidden

${paragraphs('Before', 10)}

## Job details

::: internals
${paragraphs('Details at internals', 3)}
:::

## Job queue

::: internals
${paragraphs('Queue at internals', 3)}
:::

## After the queue

${paragraphs('After', 10)}
`,
  'around.md': `# Around

${paragraphs('Intro', 3)}

## Run one

${named('overview', 'O1')}
${named('requirements', 'R1')}
${named('requirements', 'R2')}
${named('requirements', 'R3')}
${named('internals', 'I1')}
${named('internals', 'I2')}
:::

Middle of the page. ${sentence('A restore never changes the copy.')}

## Later

${paragraphs('Later', 30)}
`,
  'details-open.md': `# Details open

${paragraphs('Shared', 2)}

<details open>
<summary>More</summary>

::: internals
${paragraphs('Deep', 5)}
:::

</details>

## After

${paragraphs('After', 30)}
`,
  'details-near.md': `# Details near

${paragraphs('Shared', 3)}

<details open>
<summary>More</summary>

::: internals
${paragraphs('Deep', 5)}
:::

</details>

## After

${paragraphs('After', 30)}
`,
  'heading-over-details.md': `# Heading over details

${paragraphs('Shared', 2)}

## Gone

<details>
<summary>More</summary>

::: internals
${paragraphs('Deep', 5)}
:::

</details>

## After

${paragraphs('After', 30)}
`,
  'heading-h1.md': `${paragraphs('Lead', 2)}

# Gone

::: internals
${paragraphs('Deep', 5)}
:::

# After

${paragraphs('After', 30)}
`,
  'heading-with-part.md': `# Heading with a part

${paragraphs('Shared', 2)}

## Gone

::: internals
${paragraphs('Deep', 5)}
:::

## After

${paragraphs('After', 30)}
`,
  'coming-heading.md': `# Coming heading

::: overview
Text at overview.
::: internals
Text at internals.
:::

## Job details

::: internals
Details at internals.
:::
`,
  'wheel.md': `# Wheel

${paragraphs('Before', 10)}

${named('overview', 'O1')}
${named('requirements', 'R1')}
${named('requirements', 'R2')}
${named('internals', 'I1')}
${named('internals', 'I2')}
:::

${paragraphs('Between', 3)}

${named('overview', 'OL1')}
${named('internals', 'IL1')}
:::

${paragraphs('After', 10)}
`,
  'page-title.md': `# Page

A restore never changes the copy.

::: overview
Pick a file and a day.
::: internals
A restore is a job.
:::
`,
  'far.md': `# Far

A restore never changes the copy.

${paragraphs('Shared', 20)}

::: internals
Far text only at internals.
:::

${paragraphs('Shared end', 2)}

::: overview requirements
Far text at the other levels.
:::
`,
};

const test = pageTest.extend<object, { docs: RunningCommand; diagrams: RunningCommand }>({
  docs: [
    async ({}, use) => {
      const run = await runCommand(FILES);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
  diagrams: [
    async ({}, use) => {
      const run = await runCommand(DIAGRAMS_SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

const LINE_AT = 0.3;

/** Where a block that starts with the given text is now. */
function blockAt(page: Page, text: string) {
  return page.evaluate((start) => {
    const block = [...document.querySelectorAll<HTMLElement>('#page > *')].find((el) =>
      el.querySelector('.bd')?.textContent?.trim().startsWith(start) || el.textContent?.trim().startsWith(start),
    )!;
    const { top, height } = block.getBoundingClientRect();
    return { top, height };
  }, text);
}

/** Puts a block with its top a little above the line that a move holds on. */
async function scrollToBlock(page: Page, text: string, aboveLine = 40): Promise<void> {
  // The page takes a scroll soon after its own move for part of that move.
  await page.clock.runFor(200);
  const { top } = await blockAt(page, text);
  const { scrollY: y, innerHeight: height } = await page.evaluate(() => ({ scrollY, innerHeight }));
  await scrollPage(page, y + top - height * LINE_AT + aboveLine);
}

async function moveAndFinish(page: Page, key: string): Promise<void> {
  await pressOnSlider(page, key);
  await page.clock.runFor(MOVE_MS);
}

/**
 * Where the text of each named part stands now: the moving copy of the text during a move, or else
 * the part while it shows, or else null.
 */
const oldTextTops = (page: Page, names: string[]) =>
  page.evaluate(
    (all) =>
      all.map((name) => {
        const holds = (el: Element) => el.textContent?.trim().startsWith(`${name}.`);
        const copy = [...document.querySelectorAll('#page .ghost')].find(holds);
        const part = [...document.querySelectorAll('#page > .part')].find((el) => {
          const body = el.querySelector('.bd');
          return !!body && holds(body) && el.getClientRects().length > 0;
        });
        return (copy ?? part)?.getBoundingClientRect().top ?? null;
      }),
    names,
  );

/** Steps through a move, and gives the top of the element before it, at its first frame, at each step, and at rest. */
async function topsThroughMove(page: Page, selector: string, key: string): Promise<number[]> {
  const top = () => page.locator(selector).evaluate((el) => el.getBoundingClientRect().top);
  const tops = [await top()];
  await pressOnSlider(page, key);
  tops.push(await top());
  for (const ms of [100, 100, 100, 100, 100, 40]) {
    await page.clock.runFor(ms);
    tops.push(await top());
  }
  await page.clock.runFor(MOVE_MS);
  tops.push(await top());
  return tops;
}

/** The text starts where it stood, ends where it rests, and goes one way between them. */
function expectNoSnapOrOvershoot(tops: number[]): void {
  const before = tops[0]!;
  const rest = tops.at(-1)!;
  const way = Math.sign(rest - before);
  const shown = tops.map(Math.round).join(' ');
  expect(Math.abs(tops[1]! - before), `first frame: ${shown}`).toBeLessThan(2);
  expect(Math.abs(tops.at(-2)! - rest), `last frame: ${shown}`).toBeLessThan(3);
  for (const [at, top] of tops.entries()) {
    expect(top, `overshoot: ${shown}`).toBeGreaterThanOrEqual(Math.min(before, rest) - 2);
    expect(top, `overshoot: ${shown}`).toBeLessThanOrEqual(Math.max(before, rest) + 2);
    if (at) expect((top - tops[at - 1]!) * way, `way back: ${shown}`).toBeGreaterThanOrEqual(-2);
  }
}

const place = (page: Page) => page.evaluate(() => scrollY);
const lineOf = (page: Page) => page.evaluate((share) => innerHeight * share, LINE_AT);
const pageStyles = (page: Page) => page.locator('#page').evaluate((el) => el.style.length);
const flashes = (page: Page) => page.locator('#page .flash');
const ticks = (page: Page) => page.locator('#ticks i');

test('the level rule in #nd-level hides the other levels, and marks show only when they say something', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}mixed.html`);
  const visibleText = () => page.locator('.part:visible .bd').allInnerTexts();
  const rule = levelRule;
  const marks = page.locator('.part:visible .marks');

  expect(await levelStyle(page).textContent()).toBe(rule('overview'));
  expect(await visibleText()).toEqual(['Text of overview and internals.', 'Text of overview.']);
  await expect(marks).toHaveCount(2);
  await expect(marks.first()).toBeVisible();
  await expect(page.locator('#page')).not.toHaveClass('samemarks');

  // One kind of part and no shared text at this level.
  await moveAndFinish(page, '2');
  expect(await levelStyle(page).textContent()).toBe(rule('requirements'));
  expect(await visibleText()).toEqual(['Text of requirements.']);
  await expect(page.locator('#page')).toHaveClass('samemarks');
  await expect(marks.first()).toBeHidden();

  await moveAndFinish(page, '3');
  expect(await visibleText()).toEqual(['Text of overview and internals.']);
  await expect(page.locator('style#nd-level')).toHaveCount(1);

  await moveAndFinish(page, '1');
  await expect(page.locator('#page')).not.toHaveClass('samemarks');
  await expect(marks.first()).toBeVisible();
});

test('with unchanged text on screen, changed text gets the tint in its color, and off-screen text gets ticks', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}restore.html`);
  await pressOnSlider(page, '3');

  const part = page.locator('.part[data-l="internals"]').first();
  await expect(flashes(page)).toHaveCount(1);
  await expect(part).toHaveClass(/flash/);
  expect(await part.evaluate((el) => el.style.getPropertyValue('--fc'))).toBe('var(--l2)');
  await expect(ticks(page)).toHaveCount(0);

  await page.clock.runFor(MOVE_MS);
  await expect(ticks(page)).toHaveCount(1);
  const tick = await ticks(page).evaluate((el) => ({ top: parseFloat(el.style.top), color: el.style.getPropertyValue('--fc') }));
  expect(tick.top).toBeGreaterThan(50);
  expect(tick.color).toBe('var(--l2)');
  await expect(page.locator('#ticks')).toHaveAttribute('aria-hidden', 'true');

  await page.clock.runFor(SIGNALS_MS);
  await expect(flashes(page)).toHaveCount(0);
  await expect(ticks(page)).toHaveCount(0);
});

test('a book shows no tint, bar, ticks or marks, and only text within one screen of the view animates', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}book.html`);
  await expect(page.locator('#page')).toHaveClass('samemarks');
  await expect(page.locator('.part:visible .marks').first()).toBeHidden();

  await pressOnSlider(page, '3');
  await expect(flashes(page)).toHaveCount(0);
  await page.clock.runFor(MOVE_MS);
  await expect(flashes(page)).toHaveCount(0);
  await expect(page.locator('.seam')).toHaveCount(0);
  await expect(ticks(page)).toHaveCount(0);
  await expect(page.locator('#page')).toHaveClass('samemarks');
  await expect(page.locator('.part:visible .marks').first()).toBeHidden();
  await expect(page.locator('.part:visible').first()).toContainText('Internals page 0.');

  await scrollToBlock(page, 'Internals page 30.');
  await pressOnSlider(page, '1');
  const { moving, screen, total, shownWithNoMove } = await page.evaluate(() => {
    const parts = [...document.querySelectorAll<HTMLElement>('#page > .part')];
    const isMoving = (el: HTMLElement) => !!el.style.clipPath;
    return {
      moving: parts.filter(isMoving).map((el) => el.getBoundingClientRect()).map(({ top, bottom }) => ({ top, bottom })),
      screen: innerHeight,
      total: parts.length,
      shownWithNoMove: parts
        .filter((el) => !isMoving(el) && getComputedStyle(el).display !== 'none')
        .map((el) => el.getAttribute('data-l')),
    };
  });
  expect(moving.length).toBeGreaterThan(0);
  expect(moving.length).toBeLessThan(total / 3);
  // The rule counts one screen in the old or the new text, whose heights differ from this first frame.
  for (const { top, bottom } of moving) {
    expect(bottom).toBeGreaterThan(-screen * 3);
    expect(top).toBeLessThan(screen * 4);
  }
  expect(moving.some(({ top, bottom }) => top < screen && bottom > 0)).toBe(true);
  expect(new Set(shownWithNoMove)).toEqual(new Set(['overview']));
});

test('unchanged text gives a tint only while it is on screen', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}book-end.html`);
  await pressOnSlider(page, '3');
  await expect(flashes(page)).toHaveCount(0);
  await page.clock.runFor(MOVE_MS);
  await expect(ticks(page)).toHaveCount(0);

  await scrollToBlock(page, 'Shared last line.');
  await pressOnSlider(page, '1');
  await expect(flashes(page).first()).toBeAttached();
});

test('a part far from the view that comes or goes with a move changes at once, with no tint', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}far.html`);
  await moveAndFinish(page, '3');
  await page.clock.runFor(SIGNALS_MS);
  await pressOnSlider(page, '1');
  const entering = page.locator('.part[data-l="overview requirements"]');
  const leaving = page.locator('.part[data-l="internals"]');
  await expect(entering).toBeVisible();
  await expect(entering).not.toHaveClass(/flash/);
  await expect(leaving).toBeHidden();
  expect(await entering.evaluate((el) => el.style.length)).toBe(0);
  expect(await leaving.evaluate((el) => el.style.length)).toBe(0);
  await expect(page.locator('#page')).toHaveAttribute('style', /padding-bottom/);
});

test('when a move only takes text away, the line is an empty div before code or a table, and no line shows at the end of a page', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}seam-code.html`);
  for (const [file, follower] of [
    ['seam-code', 'DIV.code'],
    ['seam-table', 'DIV.wide'],
  ]) {
    await page.goto(`${docs.address}${file}.html`);
    await hydrated(page);
    await moveAndFinish(page, '3');
    await pressOnSlider(page, '1');

    const seam = page.locator('#page > .seam');
    await expect(seam).toHaveCount(1);
    const found = await seam.evaluate((el) => ({
      tag: el.tagName,
      text: el.textContent,
      children: el.children.length,
      height: el.getBoundingClientRect().height,
      next: `${el.nextElementSibling?.tagName}.${el.nextElementSibling?.className}`,
      color: (el as HTMLElement).style.getPropertyValue('--fc'),
      line: getComputedStyle(el, '::after').height,
    }));
    expect(found, file).toEqual({ tag: 'DIV', text: '', children: 0, height: 0, next: follower, color: 'var(--l0)', line: '2px' });
    await expect(seam).toHaveAttribute('aria-hidden', 'true');

    await page.clock.runFor(SIGNALS_MS);
    await expect(seam).toHaveCount(0);
  }

  await page.goto(`${docs.address}seam-end.html`);
  await hydrated(page);
  await moveAndFinish(page, '3');
  await pressOnSlider(page, '1');
  await expectLevel(page, 'overview');
  await expect(page.locator('.seam')).toHaveCount(0);
});

test('Internals, Overview, Internals comes back to the same block and scroll position on a long page, until the reader scrolls', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}steps.html`);

  // At the top of the page, a move stays at the top.
  await moveAndFinish(page, '3');
  expect(await place(page)).toBe(0);
  await moveAndFinish(page, '1');
  expect(await place(page)).toBe(0);
  await moveAndFinish(page, '3');

  await scrollToBlock(page, 'Internals of step 10');
  const startScroll = await place(page);
  const startBlock = await blockAt(page, 'Internals of step 10');
  expect(startScroll).toBeGreaterThan(2000);

  await moveAndFinish(page, '1');
  const line = await lineOf(page);
  expect(Math.abs((await blockAt(page, 'Overview of step 10.')).top - line)).toBeLessThan(2);
  expect(await place(page)).toBeLessThan(startScroll);
  expect(await pageStyles(page)).toBe(0);

  await moveAndFinish(page, '3');
  expect(Math.abs((await place(page)) - startScroll)).toBeLessThan(2);
  expect(Math.abs((await blockAt(page, 'Internals of step 10')).top - startBlock.top)).toBeLessThan(2);

  // On a slow frame, the scroll event of the move itself comes after its quiet time, and the place stays.
  await moveAndFinish(page, '1');
  await page.clock.runFor(200);
  await page.evaluate(() => dispatchEvent(new Event('scroll')));
  await moveAndFinish(page, '3');
  expect(Math.abs((await place(page)) - startScroll)).toBeLessThan(2);

  // A scroll of the reader starts from the new place, and forgets the place before it.
  await moveAndFinish(page, '1');
  await scrollToBlock(page, 'Overview of step 5.', 0);
  await moveAndFinish(page, '3');
  expect(Math.abs((await blockAt(page, 'Internals of step 5')).top - line)).toBeLessThan(2);
});

test('a round trip through a level shorter than the screen holds the place, and the page gets its height back', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}short-level.html`);
  await moveAndFinish(page, '3');
  const startHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.clock.runFor(200);
  await scrollPage(page, 2400);
  const start = await blockAt(page, 'Internals paragraph 0');

  await moveAndFinish(page, '1');
  const line = await lineOf(page);
  expect(Math.abs((await blockAt(page, 'One line at overview.')).top - line)).toBeLessThan(2);
  await expect(page.locator('#page')).toHaveAttribute('style', /min-height/);
  expect(await place(page)).toBeGreaterThan(0);

  await moveAndFinish(page, '3');
  expect(Math.abs((await place(page)) - 2400)).toBeLessThan(2);
  expect(Math.abs((await blockAt(page, 'Internals paragraph 0')).top - start.top)).toBeLessThan(2);
  expect(await pageStyles(page)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(startHeight);
});

test('shared text on the line stays at its place on the screen at each frame of a move', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}steps.html`);
  await scrollToBlock(page, 'Shared end of step 10.', 10);
  const start = await blockAt(page, 'Shared end of step 10.');

  await pressOnSlider(page, '3');
  for (const ms of [0, 100, 200, 200, MOVE_MS]) {
    await page.clock.runFor(ms);
    const now = await blockAt(page, 'Shared end of step 10.');
    expect(Math.abs(now.top - start.top), `after ${ms} ms more`).toBeLessThan(2);
  }
});

test('a part with text at the new level holds the place on the part that takes its place, not the first in its run', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}twins.html`);
  await moveAndFinish(page, '3');
  await scrollToBlock(page, 'Second at internals');
  await moveAndFinish(page, '1');
  expect(Math.abs((await blockAt(page, 'Second at overview.')).top - (await lineOf(page)))).toBeLessThan(2);
});

test('a part taller than the screen at both levels holds the same share of its text', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}tall.html`);
  await moveAndFinish(page, '3');
  const part = await blockAt(page, 'Internals paragraph 0');
  await scrollToBlock(page, 'Internals paragraph 0', part.height / 2);

  await moveAndFinish(page, '1');
  const { top, height } = await blockAt(page, 'Overview paragraph 0');
  expect(Math.abs(top - ((await lineOf(page)) - height / 2))).toBeLessThan(3);
});

for (const nth of ['First', 'Second', 'Third']) {
  test(`one part at a level holds the place on a move from the ${nth.toLowerCase()} of three parts at another`, async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}uneven.html`);
    await moveAndFinish(page, '3');
    await scrollToBlock(page, `${nth} at internals`);

    await pressOnSlider(page, '1');
    await expect(page.locator('.part[data-l="overview"] .ghost')).toContainText(`${nth} at internals`);
    await page.clock.runFor(MOVE_MS);
    expect(Math.abs((await blockAt(page, 'One at overview.')).top - (await lineOf(page)))).toBeLessThan(2);
    await expect(page.locator('#page .ghost')).toHaveCount(0);
  });
}

test('a round trip through one part comes back to the second of three parts', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}uneven.html`);
  await moveAndFinish(page, '3');
  await scrollToBlock(page, 'Second at internals');
  const start = await place(page);

  await moveAndFinish(page, '1');
  expect(Math.abs((await blockAt(page, 'One at overview.')).top - (await lineOf(page)))).toBeLessThan(2);
  await moveAndFinish(page, '3');
  expect(Math.abs((await place(page)) - start)).toBeLessThan(2);
});

test('a move from one part goes to the first of three parts at another level', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}uneven.html`);
  await scrollToBlock(page, 'One at overview.');
  await moveAndFinish(page, '3');
  expect(Math.abs((await blockAt(page, 'First at internals')).top - (await lineOf(page)))).toBeLessThan(2);
});

test('a run of moves that began on another level holds the part being read', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}uneven-three.html`);
  await moveAndFinish(page, '3');
  await scrollToBlock(page, 'Third at internals');

  // Two parts at the middle level: the third of three changes into the last of two.
  await pressOnSlider(page, '2');
  const read = page.locator('.part[data-l="requirements"]').filter({ hasText: 'Second at requirements.' });
  await expect(read.locator('.ghost')).toContainText('Third at internals');
  await page.clock.runFor(MOVE_MS);
  expect(Math.abs((await blockAt(page, 'Second at requirements.')).top - (await lineOf(page)))).toBeLessThan(2);

  // The origin is at another level, and the part on the line is the one that changes.
  await pressOnSlider(page, '1');
  await expect(page.locator('.part[data-l="overview"] .ghost')).toContainText('Second at requirements.');
  await page.clock.runFor(MOVE_MS);
  expect(Math.abs((await blockAt(page, 'One at overview.')).top - (await lineOf(page)))).toBeLessThan(2);
});

test('a run of moves that began on another level holds its place when the run is shorter at the level it passed through', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}uneven-three.html`);
  await moveAndFinish(page, '3');
  await scrollToBlock(page, 'Third at internals');
  const start = await place(page);

  await moveAndFinish(page, '1');
  expect(Math.abs((await blockAt(page, 'One at overview.')).top - (await lineOf(page)))).toBeLessThan(2);

  // The one part at the middle level changes into the origin's place, not into the first part.
  await pressOnSlider(page, '2');
  const read = page.locator('.part[data-l="requirements"]').filter({ hasText: 'Second at requirements.' });
  await expect(read.locator('.ghost')).toContainText('One at overview.');
  await page.clock.runFor(MOVE_MS);
  expect(Math.abs((await blockAt(page, 'Second at requirements.')).top - (await lineOf(page)))).toBeLessThan(2);

  await moveAndFinish(page, '3');
  expect(Math.abs((await place(page)) - start)).toBeLessThan(2);
});

for (const [read, fromKey, toKey, names] of [
  ['R2', '2', '1', ['R1', 'R2', 'R3']],
  ['R1', '2', '3', ['R1', 'R2', 'R3']],
  ['R3', '2', '3', ['R1', 'R2', 'R3']],
  ['I2', '3', '2', ['I1', 'I2']],
  ['O1', '1', '2', ['O1']],
] as const) {
  test(`on a move from ${read} with key ${toKey}, the text around the part moves on from where it stood, and the old parts keep their order`, async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}around.html`);
    if (fromKey !== '1') await moveAndFinish(page, fromKey);
    await scrollToBlock(page, `${read}.`, 5);
    const list = [...names];
    const before = await oldTextTops(page, list);
    const heading = () => page.locator('#run-one').evaluate((el) => el.getBoundingClientRect().top);
    const headings = [await heading()];

    await pressOnSlider(page, toKey);
    headings.push(await heading());
    const first = await oldTextTops(page, list);
    for (const [at, name] of list.entries()) {
      expect(first[at], `${name} is on the page`).not.toBeNull();
      expect(Math.abs(first[at]! - before[at]!), `${name}: ${before} then ${first}`).toBeLessThan(2);
    }

    for (const ms of [100, 100, 100, 100, 100, 40]) {
      await page.clock.runFor(ms);
      headings.push(await heading());
      const tops = (await oldTextTops(page, list)).filter((top) => top !== null);
      expect(tops, `order after ${ms} ms more`).toEqual([...tops].sort((a, b) => a - b));
    }
    await page.clock.runFor(MOVE_MS);
    headings.push(await heading());
    expectNoSnapOrOvershoot(headings);
  });
}

for (const [name, file, selector, scroll] of [
  ['an open details at the top of the page', 'details-open', '#after', 0],
  ['an open details below the line, within one screen of the view', 'details-near', '#after', 200],
  ['a heading over a closed details', 'heading-over-details', '#after', 0],
  ['a heading that is not the opening h1', 'heading-h1', '#after', 0],
  ['a heading over a part', 'heading-with-part', '#after', 0],
] as const) {
  test(`the text below ${name} never snaps or overshoots when it goes`, async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}${file}.html`);
    await moveAndFinish(page, '3');
    if (scroll) {
      await page.clock.runFor(200);
      await scrollPage(page, scroll);
    }
    expectNoSnapOrOvershoot(await topsThroughMove(page, selector, '1'));
  });

  test(`the text below ${name} never snaps or overshoots when it comes`, async ({ page, docs }) => {
    await openOnStoppedClock(page, `${docs.address}${file}.html`);
    if (scroll) await scrollPage(page, scroll);
    expectNoSnapOrOvershoot(await topsThroughMove(page, selector, '3'));
  });
}

test('a shared heading and details fade as they go and come, and a move leaves no style on them', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}hidden-heading.html`);
  const start = await page.locator('#page').innerHTML();
  const opacity = () => page.locator('#job-details').evaluate((el) => Number(getComputedStyle(el).opacity));

  await pressOnSlider(page, '3');
  await page.clock.runFor(MOVE_MS / 2);
  expect(await opacity()).toBeGreaterThan(0);
  expect(await opacity()).toBeLessThan(1);
  await page.clock.runFor(MOVE_MS);
  expect(await opacity()).toBe(1);
  await expect(page.locator('#page [data-shows][style]')).toHaveCount(0);

  await pressOnSlider(page, '1');
  await page.clock.runFor(MOVE_MS / 2);
  expect(await opacity()).toBeGreaterThan(0);
  expect(await opacity()).toBeLessThan(1);
  await page.clock.runFor(MOVE_MS);
  await expect(page.locator('#page [data-shows][style]')).toHaveCount(0);
  await expect(page.locator('#job-details')).toBeHidden();

  await page.clock.runFor(SIGNALS_MS);
  expect(await page.locator('#page').innerHTML()).toBe(start);
});

test('a heading that comes counts as changed text, so a screen with only changed text gets no tint', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}coming-heading.html`);
  await pressOnSlider(page, '3');
  await expect(page.locator('#page .ghost')).toHaveCount(1);
  await expect(flashes(page)).toHaveCount(0);
});

test('a wheel scroll right after a move counts, so the next move lands on the part the reader scrolled to', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}wheel.html`);
  await moveAndFinish(page, '2');
  await scrollToBlock(page, 'R2.', 5);
  await moveAndFinish(page, '1');

  // The clock of the page stands still here, so this scroll comes inside the quiet time after the move.
  const { top } = await blockAt(page, 'OL1.');
  const target = (await place(page)) + top - (await lineOf(page)) + 40;
  const seen = page.evaluate(() => new Promise((done) => addEventListener('scroll', done, { once: true })));
  await page.mouse.move(640, 300);
  await page.mouse.wheel(0, target - (await place(page)));
  await seen;
  await expect.poll(() => place(page), OFTEN).toBeCloseTo(target, -1);

  await moveAndFinish(page, '3');
  expect(Math.abs((await blockAt(page, 'IL1.')).top - (await lineOf(page)))).toBeLessThan(2);
});

test("a page titled 'Page' keeps its text element, and a move works", async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}page-title.html`);
  await expect(page.locator('main h1')).toHaveText('Page');
  expect(await page.evaluate(() => document.getElementById('page')?.tagName)).toBe('ARTICLE');
  await expect(page.locator('[id="page"]')).toHaveCount(1);

  await pressOnSlider(page, '3');
  await expect(page.locator('#page .ghost')).toHaveCount(1);
  await page.clock.runFor(MOVE_MS);
  await expectLevel(page, 'internals');
  await expect(page.getByText('A restore is a job.')).toBeVisible();
  await expect(page.getByText('Pick a file and a day.')).toBeHidden();
});

test('a part at both levels ends a run, so the part on the line goes to the next text and pairs with nothing', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}both-ends-run.html`);
  await moveAndFinish(page, '3');
  await scrollToBlock(page, 'Internals paragraph 0');

  await pressOnSlider(page, '1');
  await expect(page.locator('#page .ghost')).toHaveCount(0);
  await page.clock.runFor(MOVE_MS);
  expect(Math.abs((await blockAt(page, 'Text at each level.')).top - (await lineOf(page)))).toBeLessThan(2);
});

test('during a move no id shows twice, and the moving copy of the old text holds no id', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}ids.html`);
  await pressOnSlider(page, '3');
  const ghost = page.locator('.part[data-l="internals"] .ghost');
  await expect(ghost).toContainText('Pick a day');
  await expect(ghost).toContainText('Text at overview');
  await expect(ghost.locator('[id]')).toHaveCount(0);
  const ids = await page.evaluate(() => [...document.querySelectorAll('[id]')].map((el) => el.id));
  expect(ids.filter((id, at) => ids.indexOf(id) !== at)).toEqual([]);

  await page.clock.runFor(MOVE_MS);
  await expect(ghost).toHaveCount(0);
  await expect(page.locator('#pick-a-job')).toBeVisible();
  await expect(page.locator('#pick-a-day')).toBeHidden();
});

test('a shared heading or details with no text at a level hides at that level, and shows at a level with text', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}hidden-heading.html`);
  const hidden = [page.locator('#job-details'), page.locator('#job-queue'), page.locator('#page details')];
  const shown = [page.locator('#pick-a-day'), page.locator('#last-words')];

  for (const element of hidden) await expect(element).toBeHidden();
  for (const element of shown) await expect(element).toBeVisible();

  await moveAndFinish(page, '3');
  for (const element of [...hidden, ...shown]) await expect(element).toBeVisible();
  await expect(page.getByText('Text of the queue.')).toBeVisible();

  await moveAndFinish(page, '2');
  for (const element of hidden) await expect(element).toBeHidden();
  for (const element of shown) await expect(element).toBeVisible();
});

test('a heading with data-shows ends a run, as shared text does', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}heading-ends-run.html`);
  await expect(page.locator('#job-details')).toHaveAttribute('data-shows', 'internals');
  await pressOnSlider(page, '3');
  await expect(page.getByText('Text at internals.')).toBeVisible();
  await expect(page.locator('#page .ghost')).toHaveCount(0);
});

test('a move skips a heading that hides at the new level when it looks for the next text', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}hidden-next.html`);
  await moveAndFinish(page, '3');
  await scrollToBlock(page, 'Details at internals');

  await moveAndFinish(page, '1');
  await expect(page.locator('#job-queue')).toBeHidden();
  expect(Math.abs((await blockAt(page, 'After the queue')).top - (await lineOf(page)))).toBeLessThan(2);
});

test('a move holds the place when the heading on the line hides at the new level', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}hidden-next.html`);
  await moveAndFinish(page, '3');
  await scrollToBlock(page, 'Job queue', 2);

  await moveAndFinish(page, '1');
  await expect(page.locator('#job-queue')).toBeHidden();
  expect(Math.abs((await blockAt(page, 'After the queue')).top - (await lineOf(page)))).toBeLessThan(2);
});

test('a heading after a part does not jump at any frame of a move, also when the part goes away', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}heading.html`);
  const topOfHeading = (id: string) => page.locator(id).evaluate((el) => el.getBoundingClientRect().top);

  // Parts of one height take each other's place.
  const start = await topOfHeading('#pick-a-target');
  await pressOnSlider(page, '3');
  for (const ms of [0, 100, 200, 200, MOVE_MS]) {
    await page.clock.runFor(ms);
    expect(Math.abs((await topOfHeading('#pick-a-target')) - start), `after ${ms} ms more`).toBeLessThan(1);
  }

  // A part between shared text and a heading goes away. The last frames and the end agree.
  await pressOnSlider(page, '2');
  await page.clock.runFor(MOVE_MS - 60);
  const lastFrame = await topOfHeading('#check-the-file');
  await page.clock.runFor(60);
  expect(Math.abs((await topOfHeading('#check-the-file')) - lastFrame)).toBeLessThan(1);
});

test('a move, also one cut off by the next, leaves no attribute behind', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}restore.html`);
  const html = () => page.locator('#page').innerHTML();
  const start = await html();

  await pressOnSlider(page, '3');
  await expect(page.locator('#page .ghost')).toHaveCount(1);
  await expect(page.locator('#page')).toHaveAttribute('style', /padding-bottom/);
  await page.clock.runFor(100);
  await pressOnSlider(page, '2');
  await expect(page.locator('#page .ghost')).toHaveCount(1);
  await page.clock.runFor(100);
  await pressOnSlider(page, '1');
  await page.clock.runFor(MOVE_MS + SIGNALS_MS);

  await expect(page.locator('#page .ghost')).toHaveCount(0);
  expect(await html()).toBe(start);
  expect(await pageStyles(page)).toBe(0);
});

test('a part inside a raw HTML wrapper and its footnote change with the level', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}wrapper.html`);
  const parts = page.locator('details .part:visible .bd');
  const notes = page.locator('section.footnotes li:visible');
  await expect(parts).toHaveText(['Text in a wrapper at overview1.']);
  await expect(notes).toHaveCount(1);
  await expect(notes).toContainText('The first note.');
  await expect(notes).toHaveAttribute('value', '1');

  await moveAndFinish(page, '2');
  await expect(parts).toHaveText(['Text in a wrapper at requirements.']);
  await expect(page.locator('section.footnotes')).toBeHidden();

  await moveAndFinish(page, '3');
  await expect(parts).toHaveText(['Text in a wrapper at internals2.']);
  await expect(notes).toHaveCount(1);
  await expect(notes).toContainText('The second note.');
  await expect(notes).toHaveAttribute('value', '2');
  await expect(page.locator('details')).toHaveAttribute('open');
});

test('on a running clock, a round trip ends clean and comes back to the same place', async ({ page, docs }) => {
  await page.goto(`${docs.address}steps.html`);
  await hydrated(page);
  const moveDone = () => expect(page.locator('#page')).not.toHaveAttribute('style', /padding-bottom/);
  await pressOnSlider(page, '3');
  await moveDone();

  const target = await page.evaluate((share) => {
    const block = [...document.querySelectorAll('#page > .part')].find((el) => el.textContent?.includes('Internals of step 11'))!;
    return scrollY + block.getBoundingClientRect().top - innerHeight * share + 40;
  }, LINE_AT);
  await scrollPage(page, target);

  await pressOnSlider(page, '1');
  await expect(page.getByText('Overview of step 11.')).toBeVisible();
  await moveDone();
  await pressOnSlider(page, '3');
  await expect(page.locator('#page .part:visible').filter({ hasText: 'Internals of step 11' })).toBeVisible();
  await moveDone();
  await expect.poll(() => place(page), OFTEN).toBeCloseTo(target, -1);
});

test('the moving copy of a part with a drawn diagram shows the drawing itself, which goes back when the change ends', async ({ page, diagrams }) => {
  await storeLook(page, 'themelessness', 'light');
  await openOnStoppedClock(page, `${diagrams.address}flow-pair.html`);
  const flow = diagramBox(page, RESTORE_FLOW);
  await expectDrawn(flow);
  const overview = page.locator('#page .part[data-l="overview"]');
  const top = await overview.evaluate((part, share) => part.getBoundingClientRect().top + scrollY - innerHeight * share + 40, LINE_AT);
  await scrollPage(page, top);
  await markDrawing(flow);

  await pressOnSlider(page, 'ArrowRight');
  const lent = page.locator('#page .ghost .dg > .sbox > svg');
  await expect(lent).toHaveCount(1);
  expect(await isMarked(lent), 'the drawing itself').toBe(true);
  const fill = await lent.locator('g.node rect').first().evaluate((rect) => getComputedStyle(rect).fill);
  expect(fill).toBe(rgbOf(themeById('themelessness')!.light.code));
  await expect(overview.locator('.dg > .sbox > svg')).toHaveCount(0);

  await page.clock.runFor(MOVE_MS);
  await expect(page.locator('#page .ghost')).toHaveCount(0);
  expect(await isMarked(drawingOf(flow)), 'the drawing is back in its box').toBe(true);
  await expect(overview.locator('.dg > .sbox > svg')).toHaveCount(1);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a move ends at once, with the place held and nothing left behind', async ({ page, docs }) => {
    await page.goto(`${docs.address}restore.html`);
    await hydrated(page);
    await pressOnSlider(page, '3');
    await expectLevel(page, 'internals');
    await expect(page.locator('#page .ghost')).toHaveCount(0);
    expect(await pageStyles(page)).toBe(0);
    const part = page.locator('.part[data-l="internals"]').first();
    expect(await part.evaluate((el) => [el.style.height, el.style.opacity, el.style.clipPath])).toEqual(['', '', '']);
  });
});
