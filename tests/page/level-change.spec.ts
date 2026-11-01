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
import { hydrated, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

const sentence = (text: string) => `${text} `.repeat(30).trim();
const paragraphs = (text: string, count: number) =>
  Array.from({ length: count }, (_, n) => `${text} paragraph ${n}. ${sentence('A restore is a job on the server.')}`).join('\n\n');

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

const test = pageTest.extend<object, { docs: RunningCommand }>({
  docs: [
    async ({}, use) => {
      const run = await runCommand(FILES);
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

const place = (page: Page) => page.evaluate(() => scrollY);
const lineOf = (page: Page) => page.evaluate((share) => innerHeight * share, LINE_AT);
const pageStyles = (page: Page) => page.locator('#page').evaluate((el) => el.style.length);
const flashes = (page: Page) => page.locator('#page .flash');
const ticks = (page: Page) => page.locator('#ticks i');

test('the one rule in #nd-level hides the other levels, and marks show only when they say something', async ({ page, docs }) => {
  await openOnStoppedClock(page, `${docs.address}mixed.html`);
  const visibleText = () => page.locator('.part:visible .bd').allInnerTexts();
  const rule = (level: string) => `.part[data-l]:not([data-l~="${level}"]){display:none}`;
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
    ['seam-code', 'PRE'],
    ['seam-table', 'DIV'],
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
      next: el.nextElementSibling?.tagName,
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
