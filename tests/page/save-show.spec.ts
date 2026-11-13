import { expect, type Page } from '@playwright/test';
import {
  barOf,
  computedColor,
  durationOf,
  entryOf,
  expectAbout,
  HOLD_AFTER_LEVEL_MS,
  HOLD_AFTER_SCROLL_MS,
  HOLD_STILL_MS,
  inView,
  isKept,
  markBlocks,
  moveSigns,
  NEW_WORDS_MS,
  openAuthorLive,
  newHeightsOf,
  NO_MOVE_SIGNS,
  openAuthorLiveOnStoppedClock,
  paragraph,
  paragraphs,
  placeOf,
  recordNewHeights,
  recordSaveStages,
  runUntil,
  runUntilStage,
  SAVE_SCROLL_MS,
  saveLog,
  stagesOf,
  waitForStage,
} from '../support/author.ts';
import { hashOf, holdBuilds, mermaidBlock } from '../support/diagrams.ts';
import { saveAtOnce } from '../support/folder.ts';
import { svgImage } from '../support/images.ts';
import { expectLevel, MOVE_MS, pressOnSlider, THREE_LEVELS } from '../support/levels.ts';
import { openLive, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import type { RunningCommand } from '../support/run-command.ts';

const LONG = Array.from({ length: 60 }, (_, n) => `Paragraph ${n} of the restore steps.`).join('\n\n');
const TAIL = Array.from({ length: 16 }, (_, n) => `Note ${n} of the restore steps.`).join('\n\n');

/**
 * The 'Restore a file' page: shared text and parts near the top, a long run of shared paragraphs, then a part at
 * 'Internals', a shared line and more shared paragraphs far below.
 */
const RESTORE = `# Restore a file

Pick a file and a day.

::: overview
The app shows each day with a copy.
::: requirements
The app keeps a copy for 30 days.
::: internals
The agent asks the server for the copy list.
:::

Open the file and check it.

::: overview requirements
Each copy has a day and a time.
::: internals
Each copy is a list of blocks.
:::

Check the day before you restore.

::: overview
The app lists the days.
::: requirements internals
The server lists the days from the copy list.
:::

${LONG}

::: internals
The server pins the blocks of the copy.
:::

Keep the restored file.

${TAIL}
`;

const RESTORE_FLOW = 'flowchart LR\n  A[Agent] --> B[Server] --> C[Copy]';
const INDEX_FLOW = `${RESTORE_FLOW}\n  B --> D[Index]`;

const FILES = {
  'nerddocs.json': THREE_LEVELS,
  'restore.md': RESTORE,
  'storage.md': '# Storage\n\nBlocks are stored once.\n',
  'restore-by-script.md': '# Restore by script\n\nRun the restore with the agent.\n\n```sh\nrestore --from monday\nrestore --check\n```\n\nKeep a copy.\n',
  'restore-window.md': '# Restore window\n\nThe window shows the days.\n\n![Restore window](restore-window.svg)\n\nKeep a copy.\n',
  'restore-window.svg': svgImage('width="240" height="80"'),
  'restore-window-2.svg': svgImage('width="240" height="120"'),
  'restore-flow.md': `# Restore flow\n\nThe agent asks the server.\n\n${mermaidBlock(RESTORE_FLOW)}\n\nKeep a copy.\n`,
};

/** Each test saves files, so each test has a folder and a command of its own. */
const test = pageTest.extend<{ run: RunningCommand }>({
  run: async ({ ownSite }, use) => {
    await use(await ownSite(FILES));
  },
});

/** Saves the restore page with each pair of texts replaced. */
const saveRestore = (run: RunningCommand, ...edits: [string, string][]) =>
  saveAtOnce(
    run.folder,
    'restore.md',
    edits.reduce((text, [from, to]) => {
      expect(text, from).toContain(from);
      return text.replace(from, to);
    }, RESTORE),
  );

/** Opens a page in the author browser with its clock stopped and its save stages recorded. */
async function openAuthor(page: Page, run: RunningCommand, path = 'restore.html'): Promise<void> {
  await recordSaveStages(page);
  await openAuthorLiveOnStoppedClock(page, run, path);
}

const scrollTop = (page: Page) => page.evaluate(() => scrollY);
const levelNow = (page: Page) => page.locator('#nd-level').getAttribute('data-level');

/** Moves to a level by the slider and lets the move and its signals end. */
async function moveTo(page: Page, key: string, level: string): Promise<void> {
  await pressOnSlider(page, key);
  await page.clock.runFor(MOVE_MS);
  await expectLevel(page, level);
  await page.clock.runFor(3000);
}

/** The stages of a show: an optional `move`, then `hold`, `change` and the end. */
function expectStages(stages: (string | null)[], withMove: boolean): void {
  if (withMove) expect(stages).toEqual(['move', 'hold', 'change', null]);
  else expect([['hold', 'change', null], ['move', 'hold', 'change', null]]).toContainEqual(stages);
}

test('a save of shared text in view holds the old copy 160 ms, strikes the words that leave, shows the new words on a tint, and ends as plain HTML', async ({
  page,
  run,
}) => {
  await openAuthor(page, run);
  expect(await inView(page, 'Open the file and check it.')).toBe(true);
  await markBlocks(page);
  const top = await scrollTop(page);

  await saveRestore(run, ['Open the file and check it.', 'Open the file and read it.']);

  await runUntilStage(page, 'hold');
  expect(await levelNow(page)).toBe('overview');
  expect(await scrollTop(page)).toBe(top);
  expect((await paragraph(page, 'Open the file')).html).toBe('Open the file and check it.');

  await runUntilStage(page, 'change');
  expectAbout(durationOf(await saveLog(page), 'hold'), HOLD_STILL_MS, 20, 'hold');
  const struck = await paragraph(page, 'Open the file');
  expect(struck.text).toBe('Open the file and check it.');
  expect(struck.inner).toContain('check');
  expect(await barOf(page, 'Open the file')).toEqual({ width: '3px', color: await computedColor(page, 'var(--soft)') });

  await page.clock.runFor(NEW_WORDS_MS);
  await runUntil(page, async () => (await paragraph(page, 'Open the file')).text === 'Open the file and read it.');
  const added = await paragraph(page, 'Open the file');
  expect(added.inner).toContain('read');
  expect(added.tinted).toContain('read');
  expect(added.inner).not.toContain('check');

  await runUntilStage(page, null, 100);
  expect((await paragraph(page, 'Open the file')).html).toBe('Open the file and read it.');
  expectStages(stagesOf(await saveLog(page)), false);
  expect(await levelNow(page)).toBe('overview');
  for (const kept of ['Pick a file and a day.', 'Check the day before you restore.', 'Paragraph 30 of', 'Keep the restored file.']) {
    expect(await isKept(page, kept), kept).toBe(true);
  }
});

test('when no word leaves, the new words show at once, wrapped without the space before them', async ({ page, run }) => {
  await openAuthor(page, run);

  await saveRestore(run, ['Open the file and check it.', 'Open the file and check it twice.']);

  await runUntilStage(page, 'change');
  const shown = await paragraph(page, 'Open the file');
  expect(shown.text).toBe('Open the file and check it twice.');
  expect(shown.inner).toContain('twice');
  expect(shown.inner).not.toContain(' twice');
  await runUntilStage(page, null, 100);
  expect((await paragraph(page, 'Open the file')).html).toBe('Open the file and check it twice.');
});

test('a block that grows with a save glides from its old height to its new one', async ({ page, run }) => {
  await openAuthor(page, run);
  const height = async () => {
    const { top, bottom } = await placeOf(page, 'Open the file');
    return bottom! - top!;
  };
  const old = await height();
  const more = ' The restored copy keeps its old date, so sort the folder by date to find it among the other files of that day.';

  await saveRestore(run, ['Open the file and check it.', `Open the file and check it.${more.repeat(3)}`]);

  await runUntilStage(page, 'change', 5);
  // No word leaves, so the new words are there at once. The block still has its old height, or it glides from it on
  // the clock of the screen.
  expect((await paragraph(page, 'Open the file')).text).toContain('among the other files');
  const glide = await page.evaluate(() => {
    const block = [...document.querySelectorAll('#page > *')].find((el) => el.textContent?.includes('Open the file'))!;
    const animatesHeight = (animation: Animation) =>
      (animation as CSSTransition).transitionProperty === 'height' ||
      ((animation.effect as KeyframeEffect | null)?.getKeyframes() ?? []).some((frame) => 'height' in frame);
    return { height: block.getBoundingClientRect().height, gliding: block.getAnimations().some(animatesHeight) };
  });
  expect(glide.gliding || glide.height < old + 10, JSON.stringify({ old, ...glide })).toBe(true);
  await runUntilStage(page, null, 100);
  expect(await height()).toBeGreaterThan(old * 2);
});

test('a save of shared text below the view scrolls its old copy to the line over 380 ms with an ease in and out, holds it 320 ms, and a block far from the view changes at once', async ({
  page,
  run,
}) => {
  await openAuthor(page, run);
  expect(await inView(page, 'Paragraph 20 of')).toBe(false);

  await saveRestore(
    run,
    ['Paragraph 20 of the restore steps.', 'Paragraph 20 of the backup steps.'],
    ['Keep the restored file.', 'Keep the restored file safe.'],
  );

  await runUntilStage(page, 'move', 5);
  const tops: number[] = [await scrollTop(page)];
  for (let step = 0; step < 40; step++) {
    if (entryOf(await saveLog(page), 'hold')) break;
    await page.clock.runFor(20);
    tops.push(await scrollTop(page));
  }
  await runUntilStage(page, 'hold');
  const end = (await saveLog(page)).find((entry) => entry.stage === 'hold')!.y;
  const start = tops[0]!;
  expect(end).toBeGreaterThan(start + 200);
  const still = tops.findLastIndex((y) => y === start);
  const there = tops.findIndex((y) => Math.abs(y - end) < 1);
  expectAbout((there - still) * 20, SAVE_SCROLL_MS, 45, 'scroll');
  const share = (at: number) => ((tops[Math.min(still + at, tops.length - 1)] ?? end) - start) / (end - start);
  expect(share(5), `a quarter in: ${tops.join(' ')}`).toBeLessThan(0.2);
  expect(share(10), `halfway: ${tops.join(' ')}`).toBeGreaterThan(0.3);
  expect(share(10), `halfway: ${tops.join(' ')}`).toBeLessThan(0.75);

  const { top, line } = await placeOf(page, 'Paragraph 20 of');
  expect(Math.abs(top! - line)).toBeLessThan(2.5);
  expect((await paragraph(page, 'Paragraph 20 of')).html).toBe('Paragraph 20 of the restore steps.');

  await runUntilStage(page, 'change');
  expectAbout(durationOf(await saveLog(page), 'hold'), HOLD_AFTER_SCROLL_MS, 20, 'hold');
  expect((await paragraph(page, 'Keep the restored')).html).toBe('Keep the restored file safe.');

  await runUntilStage(page, null, 100);
  expect((await paragraph(page, 'Paragraph 20 of')).html).toBe('Paragraph 20 of the backup steps.');
  expectStages(stagesOf(await saveLog(page)), true);
});

test('a save of a part at another level moves to its level with no signs of the move, holds 650 ms, and gives the bar the color of the level', async ({
  page,
  run,
}) => {
  await openAuthor(page, run);

  await saveRestore(
    run,
    ['The agent asks the server for the copy list.', 'The agent asks the server for the list of copies.'],
    ['Open the file and check it.', 'Open the file and read it.'],
  );

  await runUntilStage(page, 'move');
  await page.clock.runFor(100);
  expect(await moveSigns(page)).toEqual(NO_MOVE_SIGNS);
  await runUntilStage(page, 'hold');
  expect(await levelNow(page)).toBe('internals');
  expect(await moveSigns(page)).toEqual(NO_MOVE_SIGNS);
  expect((await paragraph(page, 'The agent asks')).text).toBe('The agent asks the server for the copy list.');

  await runUntilStage(page, 'change');
  expectAbout(durationOf(await saveLog(page), 'hold'), HOLD_AFTER_LEVEL_MS, 20, 'hold');
  expect(await barOf(page, 'The agent asks')).toEqual({ width: '3px', color: await computedColor(page, 'var(--l2)') });

  await runUntilStage(page, null, 100);
  expect(await levelNow(page)).toBe('internals');
  expect((await paragraph(page, 'The agent asks')).html).toBe('The agent asks the server for the list of copies.');
  expect((await paragraph(page, 'Open the file')).html).toBe('Open the file and read it.');
  expectStages(stagesOf(await saveLog(page)), true);
});

test('a save of a part that the level hides moves to the nearest lower level that shows it', async ({ page, run }) => {
  await openAuthor(page, run);
  await moveTo(page, '3', 'internals');

  await saveRestore(run, ['Each copy has a day and a time.', 'Each copy has a day, a time and a size.']);

  await runUntilStage(page, 'hold');
  expect(await levelNow(page)).toBe('requirements');
  await runUntilStage(page, null, 100);
  expect(await levelNow(page)).toBe('requirements');
});

test('a save of a part that no lower level shows moves to the nearest higher level that shows it', async ({ page, run }) => {
  await openAuthor(page, run);

  await saveRestore(run, ['The server lists the days from the copy list.', 'The server lists the days from the list of copies.']);

  await runUntilStage(page, 'hold');
  expect(await levelNow(page)).toBe('requirements');
  await runUntilStage(page, null, 100);
  expect(await levelNow(page)).toBe('requirements');
});

test('the first changed block in page order is the target, so shared text before a changed part keeps the level', async ({ page, run }) => {
  await openAuthor(page, run);

  await saveRestore(
    run,
    ['Open the file and check it.', 'Open the file and read it.'],
    ['The server pins the blocks of the copy.', 'The server pins the blocks of the copy first.'],
  );

  await runUntilStage(page, 'hold');
  expect(await levelNow(page)).toBe('overview');
  await runUntilStage(page, null, 100);
  expect(await levelNow(page)).toBe('overview');
  expect((await paragraph(page, 'The server pins')).html).toBe('The server pins the blocks of the copy first.');
  expectStages(stagesOf(await saveLog(page)), false);
});

test('a save that adds a part at another level moves to that level, and the part grows from no height', async ({ page, run }) => {
  await openAuthor(page, run);
  await recordNewHeights(page);

  await saveRestore(run, ['Open the file and check it.\n', 'Open the file and check it.\n\n::: internals\nThe agent checks each block.\n:::\n']);

  await runUntilStage(page, 'hold');
  expect(await levelNow(page)).toBe('internals');
  expect(await paragraphs(page, 'The agent checks')).toEqual([]);
  await runUntilStage(page, 'change');
  expectAbout(durationOf(await saveLog(page), 'hold'), HOLD_AFTER_LEVEL_MS, 20, 'hold');

  await runUntilStage(page, null, 50);
  const heights = await newHeightsOf(page, 'The agent checks');
  const final = (await placeOf(page, 'The agent checks')).bottom! - (await placeOf(page, 'The agent checks')).top!;
  expect(final).toBeGreaterThan(10);
  expect(Math.min(...heights), heights.join(' ')).toBeLessThan(final / 2);
  expect(await levelNow(page)).toBe('internals');
});

test('a save that only removes a part below the view moves to its level, scrolls its old copy to the line, and fades it out', async ({
  page,
  run,
}) => {
  await openAuthor(page, run);

  await saveRestore(run, ['::: internals\nThe server pins the blocks of the copy.\n:::\n\n', '']);

  await runUntilStage(page, 'hold');
  expect(await levelNow(page)).toBe('internals');
  const { top, line, count } = await placeOf(page, 'The server pins');
  expect(count).toBe(1);
  expect(Math.abs(top! - line)).toBeLessThan(2.5);

  await runUntilStage(page, 'change');
  expect((await placeOf(page, 'The server pins')).count).toBe(1);
  await runUntilStage(page, null, 50);
  expect(await paragraphs(page, 'The server pins')).toEqual([]);
  expect(await levelNow(page)).toBe('internals');
});

test('a save that adds shared text below the view scrolls the place where it goes to the line, and the text grows from no height', async ({
  page,
  run,
}) => {
  await openAuthor(page, run);
  await recordNewHeights(page);

  await saveRestore(run, ['Paragraph 40 of the restore steps.', 'Paragraph 40 of the restore steps.\n\nCheck the restored file.']);

  await runUntilStage(page, 'hold');
  expect(await levelNow(page)).toBe('overview');
  expect(await paragraphs(page, 'Check the restored')).toEqual([]);
  const before = await placeOf(page, 'Paragraph 40 of');
  const after = await placeOf(page, 'Paragraph 41 of');
  expect(before.bottom!).toBeLessThanOrEqual(before.line + 2.5);
  expect(after.top!).toBeGreaterThanOrEqual(after.line - 2.5);

  await runUntilStage(page, 'change');
  expectAbout(durationOf(await saveLog(page), 'hold'), HOLD_AFTER_SCROLL_MS, 20, 'hold');
  await runUntilStage(page, null, 50);
  expect((await paragraph(page, 'Check the restored')).html).toBe('Check the restored file.');
  const heights = await newHeightsOf(page, 'Check the restored');
  const { top, bottom } = await placeOf(page, 'Check the restored');
  expect(Math.min(...heights), heights.join(' ')).toBeLessThan((bottom! - top!) / 2);
});

test('a save of a code block shows its new copy at once', async ({ page, run }) => {
  await openAuthor(page, run, 'restore-by-script.html');
  const code = (text: string) => paragraphs(page, text, 'pre');

  await saveAtOnce(
    run.folder,
    'restore-by-script.md',
    '# Restore by script\n\nRun the restore with the agent.\n\n```sh\nrestore --from monday\nrestore --check\nrestore --notify\n```\n\nKeep a copy.\n',
  );

  await runUntilStage(page, 'change');
  const shown = await code('restore --from');
  expect(shown).toHaveLength(1);
  expect(shown[0]!.text).toContain('restore --notify');
  await runUntilStage(page, null, 100);
  expect(await code('restore --from')).toHaveLength(1);
});

test('a save of an image fades the new image in over the old one, and ends with the new image alone', async ({ page, run }) => {
  await openAuthor(page, run, 'restore-window.html');
  await expect(page.locator('#page img')).toHaveCount(1);
  const sources = () => page.locator('#page img').evaluateAll((images) => images.map((image) => image.getAttribute('src') ?? ''));

  await saveAtOnce(run.folder, 'restore-window.md', '# Restore window\n\nThe window shows the days.\n\n![Restore window](restore-window-2.svg)\n\nKeep a copy.\n');

  await runUntilStage(page, 'change');
  await runUntil(page, async () => (await sources()).length === 2);
  const both = await sources();
  expect(both.some((src) => src.startsWith('restore-window.svg'))).toBe(true);
  expect(both.some((src) => src.startsWith('restore-window-2.svg'))).toBe(true);

  await runUntilStage(page, null, 50);
  expect((await sources()).map((src) => src.replace(/\?.*/, ''))).toEqual(['restore-window-2.svg']);
});

/** True when the element has a box and no layer around it hides it. */
const SHOWS = `(el) => {
  if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return false;
  for (let up = el; up; up = up.parentElement) if (Number(getComputedStyle(up).opacity) === 0) return false;
  return true;
}`;

/** The Mermaid drawings of `#page` that show, by the labels of their nodes. */
const drawings = (page: Page) =>
  page.evaluate(
    (shows) =>
      [...document.querySelectorAll('#page .dg svg[aria-roledescription]')]
        .filter(eval(shows) as (el: Element) => boolean)
        .map((svg) => [...svg.querySelectorAll('g.node')].map((node) => node.textContent?.trim() ?? '')),
    SHOWS,
  );

/** True when the problem box of a diagram shows. */
const problemShows = (page: Page) =>
  page.evaluate((shows) => [...document.querySelectorAll('#page .dg .problem')].some(eval(shows) as (el: Element) => boolean), SHOWS);

/** The stroke width of the shape of each node of the drawings of `#page`, by the label of the node. */
const nodeStrokes = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#page .dg svg g.node')].map((node) => {
      const shape = node.querySelector('rect, polygon, path, circle, ellipse');
      return { label: node.textContent?.trim() ?? '', stroke: shape ? getComputedStyle(shape).strokeWidth : '' };
    }),
  );

/** True when the source of a Mermaid diagram shows on the page in place of its drawing. */
const sourceShows = (page: Page) =>
  page.evaluate(
    (shows) =>
      [...document.querySelectorAll('#page *')].some(
        (el) => !el.children.length && !!el.textContent?.includes('A[Agent]') && (eval(shows) as (el: Element) => boolean)(el),
      ),
    SHOWS,
  );

test.describe('a Mermaid diagram', () => {
  test('keeps its old drawing until the new one is drawn, then rings each new node', async ({ page, run }) => {
    await openAuthor(page, run, 'restore-flow.html');
    await runUntil(page, async () => (await drawings(page)).length === 1, 50);

    await saveAtOnce(run.folder, 'restore-flow.md', `# Restore flow\n\nThe agent asks the server.\n\n${mermaidBlock(INDEX_FLOW)}\n\nKeep a copy.\n`);

    await runUntilStage(page, 'change');
    await runUntil(
      page,
      async () => {
        const shown = await drawings(page);
        expect(shown.length, 'a drawing shows').toBeGreaterThan(0);
        expect(await sourceShows(page), 'the source shows').toBe(false);
        return shown.some((labels) => labels.includes('Index'));
      },
      10,
    );
    await runUntil(page, async () => (await nodeStrokes(page)).some(({ label, stroke }) => label === 'Index' && stroke === '3px'), 10);
    const strokes = await nodeStrokes(page);
    expect(strokes.filter(({ label, stroke }) => label === 'Agent' && stroke === '3px')).toEqual([]);

    await runUntilStage(page, null, 100);
    const shown = await drawings(page);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain('Index');
  });

  test('that Mermaid cannot read shows its new copy at once', async ({ page, run }) => {
    await openAuthor(page, run, 'restore-flow.html');
    await runUntil(page, async () => (await drawings(page)).length === 1, 50);

    await saveAtOnce(run.folder, 'restore-flow.md', `# Restore flow\n\nThe agent asks the server.\n\n${mermaidBlock(`${RESTORE_FLOW}\n  B -->> D[Index]`)}\n\nKeep a copy.\n`);

    await runUntilStage(page, 'change');
    await runUntil(page, () => problemShows(page), 10);
    expect(await drawings(page)).toEqual([]);
    await runUntilStage(page, null, 100);
  });

  test('whose new drawing is not drawn within 2 s shows its new copy then', async ({ page, run }) => {
    await openAuthor(page, run, 'restore-flow.html');
    await runUntil(page, async () => (await drawings(page)).length === 1, 50);
    // The new diagram needs the full build, which the page cannot load while the gate is shut.
    const gate = await holdBuilds(page);
    const map = 'mindmap\n  root((Restore))\n    Agent\n    Server';

    await saveAtOnce(run.folder, 'restore-flow.md', `# Restore flow\n\nThe agent asks the server.\n\n${mermaidBlock(map)}\n\nKeep a copy.\n`);

    await runUntilStage(page, 'change');
    await page.clock.runFor(1500);
    expect(await drawings(page)).toHaveLength(1);
    const newBoxShows = () =>
      page.evaluate(([shows, hash]) => [...document.querySelectorAll(`#page .dg[data-dg="${hash}"]`)].some(eval(shows) as (el: Element) => boolean), [
        SHOWS,
        hashOf(map),
      ] as const);
    expect(await newBoxShows()).toBe(false);
    await runUntil(page, newBoxShows, 50);
    expect(await drawings(page)).toEqual([]);
    gate.release();
    await runUntilStage(page, null, 100);
  });
});

test('a save that adds a link to a paragraph fades the new copy in over the old one', async ({ page, run }) => {
  await openAuthor(page, run);

  await saveRestore(run, ['Open the file and check it.', 'Open the file and check it in [Storage](storage.md).']);

  await runUntilStage(page, 'change');
  await runUntil(page, async () => (await paragraphs(page, 'Open the file')).length === 2);
  await runUntilStage(page, null, 50);
  const [shown] = await paragraphs(page, 'Open the file');
  expect(shown!.text).toBe('Open the file and check it in Storage.');
  expect(await paragraphs(page, 'Open the file')).toHaveLength(1);
});

test('a save of a text too long to diff by words fades the new copy in over the old one', async ({ page, ownSite }) => {
  const words = (last: string) => `${Array.from({ length: 2100 }, (_, n) => `block${n}`).join(' ')} ${last}.`;
  const run = await ownSite({ ...FILES, 'blocks.md': `# Blocks\n\n${words('end')}\n\nKeep a copy.\n` });
  await openAuthor(page, run, 'blocks.html');

  await saveAtOnce(run.folder, 'blocks.md', `# Blocks\n\n${words('done')}\n\nKeep a copy.\n`);

  await runUntilStage(page, 'change');
  await runUntil(page, async () => (await paragraphs(page, 'block0 ')).length === 2);
  await runUntilStage(page, null, 50);
  const shown = await paragraphs(page, 'block0 ');
  expect(shown).toHaveLength(1);
  expect(shown[0]!.text.endsWith('block2099 done.')).toBe(true);
});

test('a save that arrives during a show ends that show in its final state, then shows its own change', async ({ page, run }) => {
  await openAuthor(page, run);

  await saveRestore(run, ['Pick a file and a day.', 'Pick a file and a time.']);
  await runUntilStage(page, 'hold');
  const first = (await saveLog(page)).length;

  await saveRestore(run, ['Pick a file and a day.', 'Pick a file and a place.']);

  // The clock stands still, so only the new save can end the first show. Its final state is the old copy of the next show.
  await expect.poll(async () => (await paragraphs(page, 'Pick a file'))[0]?.html, OFTEN).toBe('Pick a file and a time.');
  expect(await page.locator('#page').getAttribute('data-save')).not.toBeNull();
  expect(stagesOf((await saveLog(page)).slice(first))).toContain('hold');

  await runUntil(
    page,
    async () =>
      (await paragraphs(page, 'Pick a file'))[0]?.html === 'Pick a file and a place.' &&
      (await page.locator('#page').getAttribute('data-save')) === null,
    50,
  );
});

test('a level move by the reader during a show ends the show in its final state', async ({ page, run }) => {
  await openAuthor(page, run);

  await saveRestore(run, ['Pick a file and a day.', 'Pick a file and a time.']);
  await runUntilStage(page, 'hold');

  await pressOnSlider(page, '2');

  await expect(page.locator('#page')).not.toHaveAttribute('data-save');
  expect((await paragraph(page, 'Pick a file')).html).toBe('Pick a file and a time.');
  expect(await barOf(page, 'Pick a file')).toBeNull();
  await page.clock.runFor(MOVE_MS);
  await expectLevel(page, 'requirements');
});

test('a reader browser shows a save at once as before, with no save show', async ({ page, run }) => {
  await recordSaveStages(page);
  await openLive(page, `${run.address}restore.html`);

  await saveRestore(run, ['Open the file and check it.', 'Open the file and read it.']);

  await expect.poll(async () => (await paragraphs(page, 'Open the file'))[0]?.html, OFTEN).toBe('Open the file and read it.');
  expect(await saveLog(page)).toEqual([]);
  expect(await page.locator('#page').getAttribute('data-save')).toBeNull();
  expect(await barOf(page, 'Open the file')).toBeNull();
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the level and the scroll jump, the hold lasts 0 ms, the new copy shows at once, and the bar stays 1.5 s', async ({ page, run }) => {
    await openAuthor(page, run);

    await saveRestore(run, ['The server pins the blocks of the copy.', 'The server pins the blocks of the copy first.']);

    await runUntilStage(page, 'hold', 5);
    const log = await saveLog(page);
    const hold = entryOf(log, 'hold')!;
    // A jump may wait for the next frame, and a move takes longer than two.
    expect(hold.t - log[0]!.t, 'the level and the scroll jump').toBeLessThan(40);
    expect(hold.level).toBe('internals');
    expect(await page.locator('#page .ghost').count()).toBe(0);
    const { top, line } = await placeOf(page, 'The server pins');
    expect(Math.abs(top! - line)).toBeLessThan(2.5);

    await runUntilStage(page, 'change', 5);
    expect(durationOf(await saveLog(page), 'hold')).toBeLessThan(20);
    const shown = await paragraph(page, 'The server pins');
    expect(shown.text).toBe('The server pins the blocks of the copy first.');
    expect(await barOf(page, 'The server pins')).not.toBeNull();

    await page.clock.runFor(1300);
    expect(await barOf(page, 'The server pins')).not.toBeNull();
    await page.clock.runFor(400);
    await runUntil(page, async () => (await barOf(page, 'The server pins')) === null, 50);
    await runUntilStage(page, null, 50);
    expect((await paragraph(page, 'The server pins')).html).toBe('The server pins the blocks of the copy first.');
  });

  test('a save of shared text in view shows the new words at once', async ({ page, run }) => {
    await openAuthor(page, run);

    await saveRestore(run, ['Open the file and check it.', 'Open the file and read it.']);

    await runUntilStage(page, 'change', 5);
    expect(durationOf(await saveLog(page), 'hold')).toBeLessThan(20);
    const shown = await paragraph(page, 'Open the file');
    expect(shown.text).toBe('Open the file and read it.');
    await runUntilStage(page, null, 50);
    expect((await paragraph(page, 'Open the file')).html).toBe('Open the file and read it.');
  });
});

test('on a running clock, a save of a part at another level runs every stage and ends at the new copy', async ({ page, run }) => {
  await recordSaveStages(page);
  await openAuthorLive(page, run, 'restore.html');

  await saveRestore(run, ['The agent asks the server for the copy list.', 'The agent asks the server for the list of copies.']);

  await waitForStage(page, null);
  expectStages(stagesOf(await saveLog(page)), true);
  await expectLevel(page, 'internals');
  expect((await paragraph(page, 'The agent asks')).html).toBe('The agent asks the server for the list of copies.');
});
