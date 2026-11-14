import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import {
  alphaOf,
  computedColor,
  openAuthorLive,
  openAuthorLiveOnStoppedClock,
  recordSaveStages,
  runUntil,
  runUntilStage,
  saveLog,
  settled,
} from '../support/author.ts';
import { fakeEditor, type FakeEditor } from '../support/fake-editor.ts';
import { saveAtOnce, type FileContent } from '../support/folder.ts';
import { expectLevel, pressOnSlider, scrollPage, THREE_LEVELS } from '../support/levels.ts';
import { hydrated, openLive, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import type { RunningCommand } from '../support/run-command.ts';

const notes = Array.from({ length: 16 }, (_, n) => `Note ${n} of the restore.`);
const steps = Array.from({ length: 40 }, (_, n) => `Step ${n} of the restore.`);

/**
 * 'Restore a file': below a run of notes, a heading that shows at every level and gives an 'Empty heading' at
 * 'Overview' and 'Requirements', and a 'Missing page' at every level far below.
 */
const RESTORE_LINES = [
  '# Restore a file',
  '',
  'Pick a file and a day.',
  '',
  ...notes.flatMap((note) => [note, '']),
  'Click a day on the calendar.',
  '',
  '::: overview requirements internals',
  '## Pick a copy',
  ':::',
  '',
  '::: internals',
  'The agent restores the newest copy of the day.',
  ':::',
  '',
  '## Check the file',
  '',
  'Open the file and check it.',
  '',
  ...steps.flatMap((step) => [step, '']),
  'To undo a restore, see [Undo a restore](undo.md).',
  '',
  'Keep the restored file.',
  '',
];
const RESTORE = RESTORE_LINES.join('\n');
const COPY_LINE = RESTORE_LINES.indexOf('## Pick a copy') + 1;
const UNDO_LINE = RESTORE_LINES.indexOf('To undo a restore, see [Undo a restore](undo.md).') + 1;

/** 'Schedules': a 'Missing heading' at line 3 and an 'Empty heading' at line 5. */
const SCHEDULES = '# Schedules\n\nSee [the rule for a day](restore.md#pick-a-time).\n\n## Weekly plan\n';

const FILES: Record<string, FileContent> = {
  // The unknown default level is a problem of the config, with no page.
  'nerddocs.json': JSON.stringify({ ...JSON.parse(THREE_LEVELS), defaultLevel: 'testers' }),
  'restore.md': RESTORE,
  'schedules.md': SCHEDULES,
  'storage.md': '# Storage\n\nBlocks are stored once.\n',
};

const KEYS = {
  copy: 'Empty heading\trestore.md\t\t\t0',
  undo: 'Missing page\trestore.md\tundo.md\tUndo a restore\t0',
  config: 'Unknown level\tnerddocs.json\ttesters\t\t0',
  heading: 'Missing heading\tschedules.md\trestore.md#pick-a-time\tthe rule for a day\t0',
  empty: 'Empty heading\tschedules.md\t\t\t0',
  plans: 'Missing page\trestore.md\tplans.md\tthe plans\t0',
};

/** Restore with a new link to a page that does not exist, at line 3. */
const WITH_PLANS = RESTORE.replace('Pick a file and a day.', 'Pick a file and a day. See [the plans](plans.md).');
/** Restore with the link to 'undo.md' gone. */
const WITHOUT_UNDO = RESTORE.replace('To undo a restore, see [Undo a restore](undo.md).', 'To undo a restore, delete the restored copy.');
/** Restore with no problem. */
const CLEAN = WITHOUT_UNDO.replace('::: overview requirements internals\n## Pick a copy\n:::\n\n', '');
/** A site whose one problem is the link to 'plans.md' on 'Restore a file'. */
const ONE_PROBLEM = {
  'nerddocs.json': THREE_LEVELS,
  'restore.md': CLEAN.replace('Pick a file and a day.', 'Pick a file and a day. See [the plans](plans.md).'),
  'storage.md': '# Storage\n\nBlocks are stored once.\n',
};

/** Each test has a command of its own, since a test may save, with an editor that only records what it opens. */
const test = pageTest.extend<{ editor: FakeEditor; run: RunningCommand; siteWith: (files: Record<string, FileContent>) => Promise<RunningCommand> }>({
  editor: async ({}, use) => {
    await use(await fakeEditor());
  },
  siteWith: async ({ ownSite, editor }, use) => {
    await use((files) => ownSite(files, { env: { LAUNCH_EDITOR: editor.program } }));
  },
  run: async ({ siteWith }, use) => {
    await use(await siteWith(FILES));
  },
});

const box = (page: Page) => page.locator('#ck');
const pill = (page: Page) => page.locator('#ck button.ck-pill');
const count = (page: Page) => page.locator('#ck .ck-num');
/** A CSS string for a key, whose tabs need an escape. */
const cssKey = (key: string) => key.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\9 ');
const row = (page: Page, key: string) => page.locator(`#ck .ck-row[data-key="${cssKey(key)}"]`);
const mark = (page: Page, key: string) => page.locator(`#page .ck-bad[data-key="${cssKey(key)}"]`);
const group = (page: Page, address: string) => page.locator(`#ck .ck-grp[data-group="${address}"]`);

/** Opens a page in the author browser and waits for the pill with its count. */
async function openAuthor(page: Page, run: RunningCommand, path = 'restore.html', problems = '5'): Promise<void> {
  await openAuthorLive(page, run, path);
  await hydrated(page);
  await expect(count(page)).toHaveText(problems);
}

async function openPanel(page: Page): Promise<void> {
  await pill(page).click();
  await expect(box(page)).toHaveClass(/(^|\s)open(\s|$)/);
}

const isOpen = (page: Page) => box(page).evaluate((el) => el.classList.contains('open'));

/** The place of the box from the right edge and the bottom edge of the window. */
const cornerOf = (page: Page) =>
  box(page).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { right: innerWidth - rect.right, bottom: innerHeight - rect.bottom, width: rect.width };
  });

/**
 * Records, on each page that the browser opens from now on, each state of the box and the page: the classes of the box,
 * the stage of a save show, the keys of the rows, the count and the marks, at the time of the page clock.
 */
async function recordProblems(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: unknown[] = [];
    (window as unknown as { ckLog: unknown[] }).ckLog = log;
    const snap = () => {
      const ck = document.getElementById('ck');
      return {
        t: performance.now(),
        classes: ck ? ck.className : null,
        save: document.getElementById('page')?.getAttribute('data-save') ?? null,
        rows: [...document.querySelectorAll('#ck .ck-row:not(.gone)')].map((el) => el.getAttribute('data-key')),
        count: document.querySelector('#ck .ck-num')?.textContent ?? null,
        marks: document.querySelectorAll('#page .ck-bad').length,
        /** True while the list shows only the check of no problem. */
        check: !document.querySelector('#ck .ck-grp') && !!document.querySelector('#ck .ck-body svg'),
      };
    };
    const same = (a: ReturnType<typeof snap>, b: ReturnType<typeof snap>) =>
      a.classes === b.classes &&
      a.save === b.save &&
      a.rows.join('|') === b.rows.join('|') &&
      a.count === b.count &&
      a.marks === b.marks &&
      a.check === b.check;
    new MutationObserver(() => {
      const now = snap();
      const last = log.at(-1) as ReturnType<typeof snap> | undefined;
      if (!last || !same(last, now)) log.push(now);
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['class', 'data-save'] });
  });
}

interface Snap {
  t: number;
  classes: string | null;
  save: string | null;
  rows: string[];
  count: string | null;
  marks: number;
  check: boolean;
}
const ckLog = (page: Page) => page.evaluate(() => (window as unknown as { ckLog: Snap[] }).ckLog);
const hasClass = (snap: Snap, name: string) => (snap.classes ?? '').split(/\s+/).includes(name);

test.describe('the reader browser', () => {
  test('shows no pill, no panel and no mark, and its data holds no problems, also after a save that adds a problem', async ({ page, run }) => {
    await openLive(page, `${run.address}restore.html`);
    await hydrated(page);
    expect(await page.locator('#nd-data').textContent()).not.toContain('"problems"');
    await settled(page);
    await expect(box(page)).toHaveCount(0);
    await expect(page.locator('.ck-bad')).toHaveCount(0);

    await saveAtOnce(run.folder, 'restore.md', WITH_PLANS);
    await expect(page.locator('#page')).toContainText('See the plans');
    await settled(page);
    await expect(box(page)).toHaveCount(0);
    await expect(page.locator('.ck-bad')).toHaveCount(0);
  });
});

test.describe('the pill', () => {
  test('holds the warning icon and the count of the problems, in the bottom-right corner, 16px from the edges, outside every panel', async ({ page, run }) => {
    await openAuthor(page, run);
    expect(
      await box(page).evaluate((el) => ({
        children: [...el.children].map((child) => child.className),
        body: [...el.querySelector(':scope > .ck-body')!.children].map((child) => child.className),
        foot: [...el.querySelector(':scope > .ck-foot')!.children].map((child) => `${child.tagName.toLowerCase()}.${child.className}`),
        pop: [...el.querySelectorAll('label.ck-pop > input')].map((input) => input.id),
        popText: el.querySelector('label.ck-pop')!.textContent!.trim(),
        pill: [...el.querySelector('button.ck-pill')!.children].map((child) => child.getAttribute('class')),
        icons: [...el.querySelectorAll('button.ck-pill > span.ck-ico > svg')].map((svg) => svg.getAttribute('class')),
        position: getComputedStyle(el).position,
        inPanel: !!el.closest('#panel, #bar, #page, article, nav'),
      })),
    ).toEqual({
      children: ['ck-body', 'ck-foot'],
      body: ['ck-list'],
      foot: ['label.ck-pop', 'button.ck-pill'],
      pop: ['ck-auto'],
      popText: 'Pop up',
      pill: ['ck-ico', 'ck-num', expect.stringMatching(/(^|\s)ck-chev(\s|$)/)],
      icons: [expect.stringMatching(/(^|\s)ck-warn-i(\s|$)/), expect.stringMatching(/(^|\s)ck-ok-i(\s|$)/)],
      position: 'fixed',
      inPanel: false,
    });
    await expect(pill(page)).toHaveAttribute('title', 'Problems');
    await expect(pill(page)).toHaveAttribute('aria-label', 'Problems');
    await expect(pill(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(box(page)).not.toHaveClass(/(^|\s)(open|ok)(\s|$)/);

    await expect.poll(() => cornerOf(page), OFTEN).toMatchObject({ right: 16, bottom: 16 });
    expect(await pill(page).evaluate((el) => el.getBoundingClientRect().height)).toBe(32);
    expect(await pill(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await computedColor(page, 'var(--sx-d)'));
    await expect(page.locator('#ck .ck-body')).toBeHidden();
    await expect(page.locator('#ck .ck-chev')).toBeHidden();
    await expect(page.locator('#ck .ck-warn-i')).toBeVisible();
  });

  test('stays in its corner when the bar and the contents panel hide', async ({ page, run }) => {
    await openAuthor(page, run);
    await expect.poll(() => cornerOf(page), OFTEN).toMatchObject({ right: 16, bottom: 16 });
    await page.locator('#tab').click();
    await expect(page.locator('html')).toHaveAttribute('data-slider', 'off');
    await page.locator('#closeP').click();
    await settled(page);
    await expect.poll(() => cornerOf(page), OFTEN).toMatchObject({ right: 16, bottom: 16 });
  });

  test('shows on a 404 page with the problems of the site', async ({ page, run }) => {
    await becomeAuthorAt(page, run, 'gone.html');
    await expect(count(page)).toHaveText('5');
  });

  test('with no problem shows a check in the ok color on no fill, with no count and no chevron', async ({ page, siteWith }) => {
    const run = await siteWith({ 'nerddocs.json': THREE_LEVELS, 'storage.md': '# Storage\n\nBlocks are stored once.\n' });
    await openAuthorLive(page, run, 'storage.html');
    await hydrated(page);
    await expect(box(page)).toHaveClass(/(^|\s)ok(\s|$)/);
    await expect(box(page)).not.toHaveClass(/(^|\s)fresh(\s|$)/);
    await expect(page.locator('#ck .ck-ok-i')).toBeVisible();
    await expect.poll(() => page.locator('#ck .ck-ok-i').evaluate((el) => getComputedStyle(el).opacity), OFTEN).toBe('1');
    await expect(count(page)).toBeHidden();
    await expect(page.locator('#ck .ck-chev')).toBeHidden();
    const look = await pill(page).evaluate((el) => ({ fill: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
    expect(alphaOf(look.fill)).toBe(0);
    expect(look.color).toBe(await computedColor(page, 'var(--sx-s)'));
  });
});

/** Opens an address of the command in the author browser. */
async function becomeAuthorAt(page: Page, run: RunningCommand, path: string): Promise<void> {
  await page.goto(await run.authorAddress(), { waitUntil: 'commit' });
  await page.goto(`${run.address}${path}`);
  await hydrated(page);
}

test.describe('the panel', () => {
  test('a click on the pill opens the panel, 420px wide with a chevron after the count, and another click or Escape shuts it', async ({ page, run }) => {
    await openAuthor(page, run);
    await openPanel(page);
    await expect(pill(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#ck .ck-body')).toBeVisible();
    await expect(page.locator('#ck .ck-chev')).toBeVisible();
    await expect.poll(async () => (await cornerOf(page)).width, OFTEN).toBe(420);

    await pill(page).click();
    await expect.poll(() => isOpen(page), OFTEN).toBe(false);
    await expect(pill(page)).toHaveAttribute('aria-expanded', 'false');

    await openPanel(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => isOpen(page), OFTEN).toBe(false);
  });

  test('a page that opens in the same tab keeps the panel open or shut, and a new tab starts shut', async ({ page, run, context }) => {
    await openAuthor(page, run);
    await openPanel(page);
    expect(await page.evaluate(() => sessionStorage.getItem('nerddocs-problems-open'))).not.toBeNull();

    await page.goto(`${run.address}storage.html`);
    await hydrated(page);
    await expect(box(page)).toHaveClass(/(^|\s)open(\s|$)/);
    await pill(page).click();
    await expect.poll(() => isOpen(page), OFTEN).toBe(false);

    await page.goto(`${run.address}restore.html`);
    await hydrated(page);
    await expect(count(page)).toHaveText('5');
    expect(await isOpen(page)).toBe(false);

    const other = await context.newPage();
    await other.goto(`${run.address}restore.html`);
    await hydrated(other);
    await expect(count(other)).toHaveText('5');
    expect(await isOpen(other)).toBe(false);
  });

  test('scrolls past 52vh, and on a phone is at most the width of the window less 32px', async ({ page, run }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAuthor(page, run);
    await openPanel(page);
    expect(
      await page.locator('#ck .ck-body').evaluate((el) => ({ max: parseFloat(getComputedStyle(el).maxHeight), overflow: getComputedStyle(el).overflowY })),
    ).toEqual({ max: expect.closeTo(844 * 0.52, 1), overflow: 'auto' });
    await expect.poll(async () => (await cornerOf(page)).width, OFTEN).toBe(390 - 32);
  });

  test('a storage that throws on the keys of the problems leaves the pill and the panel working', async ({ page, run }) => {
    await page.addInitScript(() => {
      for (const name of ['getItem', 'setItem', 'removeItem'] as const) {
        const real = Storage.prototype[name] as (this: Storage, ...args: string[]) => unknown;
        (Storage.prototype as unknown as Record<string, unknown>)[name] = function (this: Storage, key: string, ...rest: string[]) {
          if (/^nerddocs-(problems-open|popup|problem-go)$/.test(key)) throw new Error('The storage is off.');
          return real.call(this, key, ...rest);
        };
      }
    });
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));
    await openAuthor(page, run);
    await openPanel(page);
    await page.locator('#ck-auto').uncheck();
    await expect(page.locator('#ck-auto')).not.toBeChecked();
    expect(errors).toEqual([]);
  });
});

test.describe('pop up', () => {
  test('starts checked, and a save that adds a problem opens the panel', async ({ page, run }) => {
    await openAuthor(page, run);
    await expect(page.locator('#ck-auto')).toBeChecked();
    expect(await isOpen(page)).toBe(false);

    await saveAtOnce(run.folder, 'restore.md', WITH_PLANS);
    await expect(count(page)).toHaveText('6');
    await expect(box(page)).toHaveClass(/(^|\s)open(\s|$)/);
    await expect(row(page, KEYS.plans)).toHaveCount(1);
  });

  test('unchecked, it keeps the panel shut on a new problem, and it stays unchecked on the next page', async ({ page, run }) => {
    await openAuthor(page, run);
    await openPanel(page);
    await page.locator('#ck-auto').uncheck();
    expect(await page.evaluate(() => localStorage.getItem('nerddocs-popup'))).toBe('off');
    await pill(page).click();
    await expect.poll(() => isOpen(page), OFTEN).toBe(false);

    await saveAtOnce(run.folder, 'restore.md', WITH_PLANS);
    await expect(count(page)).toHaveText('6');
    await settled(page);
    expect(await isOpen(page)).toBe(false);

    await page.reload();
    await hydrated(page);
    await expect(page.locator('#ck-auto')).not.toBeChecked();
    await page.locator('#ck-auto').evaluate((input) => (input as HTMLInputElement).click());
    await expect(page.locator('#ck-auto')).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('nerddocs-popup'))).not.toBe('off');
  });

  test('a list that only loses keys, and the list in the data of the page, never open the panel', async ({ page, run }) => {
    await openAuthor(page, run);
    await settled(page);
    expect(await isOpen(page)).toBe(false);

    await saveAtOnce(run.folder, 'restore.md', WITHOUT_UNDO);
    await expect(count(page)).toHaveText('4');
    await settled(page);
    expect(await isOpen(page)).toBe(false);
  });

  test('while a save show runs the panel waits, and it applies the newest list once the change starts', async ({ page, run }) => {
    await recordSaveStages(page);
    await recordProblems(page);
    await openAuthor(page, run);
    await saveAtOnce(run.folder, 'restore.md', WITH_PLANS);
    await expect(row(page, KEYS.plans)).toHaveCount(1);
    expect(stagesSeen(await saveLog(page))).toContain('change');

    const log = await ckLog(page);
    const during = log.filter((snap) => snap.save === 'move' || snap.save === 'hold');
    expect(during.length).toBeGreaterThan(0);
    for (const snap of during) {
      expect(snap.rows, `while ${snap.save}`).not.toContain(KEYS.plans);
      expect(hasClass(snap, 'open'), `while ${snap.save}`).toBe(false);
      expect(snap.count, `while ${snap.save}`).toBe('5');
    }
  });
});

const stagesSeen = (log: { stage: string | null }[]) => log.map((entry) => entry.stage);

test.describe('groups and rows', () => {
  test('each group holds the rows of one page or one file, the open page first, with its title and its count', async ({ page, run }) => {
    await openAuthor(page, run);
    await openPanel(page);
    expect(
      await page.locator('#ck .ck-grp').evaluateAll((groups) =>
        groups.map((el) => {
          const button = el.querySelector(':scope > button.ck-pg')!;
          return {
            group: el.getAttribute('data-group'),
            expanded: button.getAttribute('aria-expanded'),
            fold: !!button.querySelector('svg.ck-fold'),
            label: [...button.childNodes]
              .filter((node) => !(node instanceof Element && (node.matches('svg') || node.matches('.ck-n'))))
              .map((node) => node.textContent)
              .join('')
              .trim(),
            n: button.querySelector('span.ck-n')!.textContent,
            rows: [...el.querySelectorAll(':scope > div.ck-rows > div.ck-row')].map((rowEl) => rowEl.getAttribute('data-key')),
          };
        }),
      ),
    ).toEqual([
      { group: '/restore.html', expanded: 'true', fold: true, label: 'Restore a file', n: '2', rows: [KEYS.copy, KEYS.undo] },
      { group: 'nerddocs.json', expanded: 'true', fold: true, label: 'nerddocs.json', n: '1', rows: [KEYS.config] },
      { group: '/schedules.html', expanded: 'true', fold: true, label: 'Schedules', n: '2', rows: [KEYS.heading, KEYS.empty] },
    ]);
  });

  test('a row shows its name, the icon of each level in its color, its value or its line, and its path', async ({ page, run }) => {
    await openAuthor(page, run);
    await openPanel(page);
    const rowOf = (key: string) =>
      row(page, key).evaluate((el) => {
        const inner = el.querySelector(':scope > div.ck-in')!;
        const at = inner.querySelector('a.ck-at')!;
        return {
          name: inner.querySelector('span.ck-name')!.textContent,
          levels: [...inner.querySelectorAll('span.ck-lv svg')].map((svg) => ({
            title: svg.closest('[title]')?.getAttribute('title') ?? null,
            color: getComputedStyle(svg).color,
          })),
          value: inner.querySelector('span.ck-val')!.textContent!.replace(/\u200b/g, ''),
          path: at.textContent,
          title: at.getAttribute('title'),
          dot: getComputedStyle(inner.querySelector('span.ck-name')!, '::before').backgroundColor,
        };
      });
    const bad = await computedColor(page, 'var(--sx-d)');
    expect(await rowOf(KEYS.copy)).toEqual({
      name: 'Empty heading',
      levels: [
        { title: 'Overview', color: await computedColor(page, 'var(--l0)') },
        { title: 'Requirements', color: await computedColor(page, 'var(--l1)') },
      ],
      value: '## Pick a copy',
      path: `restore.md:${COPY_LINE}`,
      title: 'Open in editor',
      dot: bad,
    });
    expect(await rowOf(KEYS.undo)).toMatchObject({ name: 'Missing page', levels: [], value: 'undo.md', path: `restore.md:${UNDO_LINE}` });
    expect(await rowOf(KEYS.config)).toMatchObject({ name: 'Unknown level', value: 'testers', path: 'nerddocs.json' });
    expect(await rowOf(KEYS.empty)).toMatchObject({ name: 'Empty heading', value: '## Weekly plan', path: 'schedules.md:5' });
    expect(await rowOf(KEYS.heading)).toMatchObject({ name: 'Missing heading', value: 'restore.md#pick-a-time', path: 'schedules.md:3' });
  });

  test('a long value breaks after each slash and hash', async ({ page, siteWith }) => {
    const run = await siteWith({ ...FILES, 'schedules.md': '# Schedules\n\nSee [the steps](../administration/upgrade/01-plan.md#before-you-start).\n' });
    await openAuthor(page, run, 'restore.html', '4');
    await openPanel(page);
    // The text of the value, with each break as a zero-width space.
    const shown = await page
      .locator('#ck .ck-row')
      .filter({ hasText: 'Missing page' })
      .last()
      .locator('span.ck-val')
      .evaluate(function text(node: Node): string {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
        if (node instanceof Element && node.tagName === 'WBR') return '\u200b';
        return [...node.childNodes].map((child) => text(child)).join('');
      });
    expect(shown).toBe('../\u200badministration/\u200bupgrade/\u200b01-plan.md#\u200bbefore-you-start');
  });

  test('a click on a group folds and unfolds its rows, and the fold stays through a new list', async ({ page, run }) => {
    await openAuthor(page, run);
    await openPanel(page);
    const schedules = group(page, '/schedules.html');
    await schedules.locator('button.ck-pg').click();
    await expect(schedules).toHaveClass(/(^|\s)shut(\s|$)/);
    await expect(schedules.locator('button.ck-pg')).toHaveAttribute('aria-expanded', 'false');
    await expect(schedules.locator('.ck-rows')).toBeHidden();

    await saveAtOnce(run.folder, 'restore.md', WITH_PLANS);
    await expect(row(page, KEYS.plans)).toHaveCount(1);
    await expect(count(page)).toHaveText('6');
    await expect(schedules).toHaveClass(/(^|\s)shut(\s|$)/);

    await schedules.locator('button.ck-pg').click();
    await expect(schedules).not.toHaveClass(/(^|\s)shut(\s|$)/);
    await expect(schedules.locator('button.ck-pg')).toHaveAttribute('aria-expanded', 'true');
    await expect(schedules.locator('.ck-row')).toHaveCount(2);
  });

  test('past 20 problems every group but the one of the open page starts folded', async ({ page, siteWith }) => {
    const links = Array.from({ length: 18 }, (_, n) => `See [plan ${n}](plan-${n}.md).`).join('\n\n');
    const run = await siteWith({ ...FILES, 'plans.md': `# Plans\n\n${links}\n` });
    await openAuthor(page, run, 'restore.html', '23');
    await openPanel(page);
    await expect(group(page, '/restore.html')).not.toHaveClass(/(^|\s)shut(\s|$)/);
    for (const address of ['nerddocs.json', '/plans.html', '/schedules.html']) await expect(group(page, address), address).toHaveClass(/(^|\s)shut(\s|$)/);
  });
});

test.describe('the place of the box', () => {
  test('on a phone the box sits 10px above the bar, and it moves to the corner when the window grows', async ({ page, run }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAuthor(page, run);
    const aboveBar = () =>
      page.evaluate(() => {
        const bar = document.getElementById('bar')!.getBoundingClientRect();
        return Math.round(bar.top - document.getElementById('ck')!.getBoundingClientRect().bottom);
      });
    await expect.poll(aboveBar, OFTEN).toBe(10);

    await page.setViewportSize({ width: 1400, height: 900 });
    await expect.poll(() => cornerOf(page), OFTEN).toMatchObject({ right: 16, bottom: 16 });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(aboveBar, OFTEN).toBe(10);
  });

  test('the open panel lies on top of the bar', async ({ page, run }) => {
    await openAuthor(page, run);
    await openPanel(page);
    const layers = await page.evaluate(() => ({
      box: Number(getComputedStyle(document.getElementById('ck')!).zIndex),
      bar: Number(getComputedStyle(document.getElementById('bar')!).zIndex),
    }));
    expect(layers.box).toBeGreaterThan(layers.bar);
  });
});

test.describe('marks', () => {
  test('each problem of the open page with a mark gets a wavy underline on its words, or on its element, with its key', async ({ page, run }) => {
    await openAuthor(page, run);
    await expect(mark(page, KEYS.undo)).toHaveText('Undo a restore');
    expect(await mark(page, KEYS.undo).evaluate((el) => el.tagName)).toBe('SPAN');
    expect(await mark(page, KEYS.copy).evaluate((el) => [el.tagName, el.textContent])).toEqual(['H2', 'Pick a copy']);
    const look = await mark(page, KEYS.undo).evaluate((el) => {
      const style = getComputedStyle(el);
      return { line: style.textDecorationLine, style: style.textDecorationStyle, color: style.textDecorationColor };
    });
    expect(look).toEqual({ line: 'underline', style: 'wavy', color: await computedColor(page, 'var(--sx-d)') });

    await page.goto(`${run.address}schedules.html`);
    await hydrated(page);
    await expect(mark(page, KEYS.empty)).toHaveCount(1);
    expect(await mark(page, KEYS.empty).evaluate((el) => [el.tagName, el.textContent])).toEqual(['H2', 'Weekly plan']);
    await expect(mark(page, KEYS.heading)).toHaveText('the rule for a day');
  });

  test('a mark shows no line at a level where its problem does not break, and a problem of every level shows its line at each', async ({ page, run }) => {
    await openAuthor(page, run);
    const lineOf = (key: string) => mark(page, key).evaluate((el) => getComputedStyle(el).textDecorationLine);
    await expectLevel(page, 'overview');
    await expect.poll(() => lineOf(KEYS.copy), OFTEN).toBe('underline');
    await pressOnSlider(page, '3');
    await expectLevel(page, 'internals');
    await expect.poll(() => lineOf(KEYS.copy), OFTEN).toBe('none');
    await expect.poll(() => lineOf(KEYS.undo), OFTEN).toBe('underline');
    await pressOnSlider(page, '2');
    await expectLevel(page, 'requirements');
    await expect.poll(() => lineOf(KEYS.copy), OFTEN).toBe('underline');
  });

  test('the marks go before a save show starts and come back when it ends, with the marks of the new list', async ({ page, run }) => {
    await recordSaveStages(page);
    await recordProblems(page);
    await openAuthor(page, run);
    await expect(mark(page, KEYS.copy)).toHaveCount(1);

    await saveAtOnce(run.folder, 'restore.md', WITH_PLANS);
    await expect(mark(page, KEYS.plans)).toHaveText('the plans');
    await expect(mark(page, KEYS.copy)).toHaveCount(1);
    const during = (await ckLog(page)).filter((snap) => snap.save !== null);
    expect(during.length).toBeGreaterThan(0);
    for (const snap of during) expect(snap.marks, `while ${snap.save}`).toBe(0);
  });
});

test.describe('a click on a row', () => {
  test('on the open page moves to a level of its problem, scrolls its mark to the line, and flashes it', async ({ page, run }) => {
    await openAuthor(page, run);
    await pressOnSlider(page, '3');
    await expectLevel(page, 'internals');
    await scrollPage(page, await page.evaluate(() => document.documentElement.scrollHeight));
    await openPanel(page);

    await row(page, KEYS.copy).locator('div.ck-in').click();
    await expectLevel(page, 'requirements');
    await expect(page.locator('#page .ck-flash')).toHaveCount(1);
    expect(await page.locator('#page .ck-flash').evaluate((el, key) => el.matches(`[data-key="${key}"]`) || !!el.querySelector(`[data-key="${key}"]`), cssKey(KEYS.copy))).toBe(true);
    await expect
      .poll(() => mark(page, KEYS.copy).evaluate((el) => Math.abs(el.getBoundingClientRect().top - innerHeight * 0.3)), OFTEN)
      .toBeLessThanOrEqual(2);
    await expect(page.locator('#page .ck-flash')).toHaveCount(0, { timeout: 15_000 });
  });

  test('of a problem of every level keeps the level', async ({ page, run }) => {
    await openAuthor(page, run);
    await pressOnSlider(page, '3');
    await expectLevel(page, 'internals');
    await openPanel(page);
    await row(page, KEYS.undo).locator('div.ck-in').click();
    await expect(page.locator('#page .ck-flash')).toHaveCount(1);
    await expectLevel(page, 'internals');
  });

  test('on another page opens that page, and there runs the row and takes its key out of the storage', async ({ page, run }) => {
    await openAuthor(page, run);
    await openPanel(page);
    await row(page, KEYS.empty).locator('div.ck-in').click();
    await page.waitForURL(/\/schedules\.html/);
    await hydrated(page);
    await expect(page.locator('#page .ck-flash')).toHaveCount(1);
    expect(await page.locator('#page .ck-flash').evaluate((el) => [el.tagName, el.textContent])).toEqual(['H2', 'Weekly plan']);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('nerddocs-problem-go')), OFTEN).toBeNull();
  });

  test('with no page opens its file in the editor, and the browser shows nothing more', async ({ page, run, editor }) => {
    await openAuthor(page, run);
    await openPanel(page);
    const url = page.url();
    const asked = page.waitForResponse((response) => response.url().includes('/__nerddocs/open'));
    await row(page, KEYS.config).locator('div.ck-in').click();
    const response = await asked;
    expect(new URL(response.url()).search).toBe('?file=nerddocs.json');
    expect(response.status()).toBe(204);
    await expect.poll(editor.opened, OFTEN).toEqual([join(run.folder, 'nerddocs.json')]);
    expect(page.url()).toBe(url);
    await expect(page.locator('#page .ck-flash')).toHaveCount(0);
  });

  test('on the open page with no mark opens its file in the editor at its line', async ({ page, siteWith, editor }) => {
    const run = await siteWith({ ...FILES, 'users.md': '# Users\n' });
    await openAuthor(page, run, 'users.html', '6');
    await openPanel(page);
    const asked = page.waitForResponse((response) => response.url().includes('/__nerddocs/open'));
    await page.locator('#ck .ck-row').filter({ hasText: 'Empty page' }).locator('div.ck-in').click();
    const response = await asked;
    expect(new URL(response.url()).searchParams.get('file')).toBe('users.md');
    expect(new URL(response.url()).searchParams.get('line')).toBe('1');
    await expect.poll(editor.opened, OFTEN).toEqual([`${join(run.folder, 'users.md')} 1 1`]);
  });
});

test('a click on a path opens its file in the editor at its line, and the page stays as it was', async ({ page, run, editor }) => {
  await openAuthor(page, run);
  await openPanel(page);
  const url = page.url();
  const asked = page.waitForResponse((response) => response.url().includes('/__nerddocs/open'));
  await row(page, KEYS.copy).locator('a.ck-at').click();
  const response = await asked;
  expect(new URL(response.url()).search).toBe(`?file=restore.md&line=${COPY_LINE}`);
  expect(response.status()).toBe(204);
  await expect.poll(editor.opened, OFTEN).toEqual([`${join(run.folder, 'restore.md')} ${COPY_LINE} 1`]);
  expect(page.url()).toBe(url);
  await expectLevel(page, 'overview');
  await expect(page.locator('#page .ck-flash')).toHaveCount(0);
});

test.describe('the change of the list', () => {
  /** Opens the restore page with its clock stopped and the panel open, with the stages of the save show and the box recorded. */
  async function openStopped(page: Page, run: RunningCommand, problems = '5'): Promise<void> {
    await recordSaveStages(page);
    await recordProblems(page);
    await openAuthorLiveOnStoppedClock(page, run, 'restore.html');
    await runUntil(page, async () => (await count(page).textContent()) === problems);
  }

  /** Runs the stopped clock through the save show of a save of restore, until the show reaches its 'change' stage. */
  async function saveAndShow(page: Page, run: RunningCommand, text: string): Promise<void> {
    const from = (await saveLog(page)).length;
    await saveAtOnce(run.folder, 'restore.md', text);
    await runUntilStage(page, 'change', 20, from);
  }


  test('a fixed row strikes its name, gathers and flies out, then its place closes, and the count rolls 520 ms after it starts', async ({ page, run }) => {
    await openStopped(page, run);
    await pill(page).click();
    await runUntil(page, () => isOpen(page));
    const ok = await computedColor(page, 'var(--sx-s)');
    const dot = () => row(page, KEYS.undo).locator('span.ck-name').evaluate((el) => getComputedStyle(el, '::before').backgroundColor).catch(() => null);

    await saveAndShow(page, run, WITHOUT_UNDO);
    // The list changes 600 ms after the show reaches its 'change' stage.
    const start = (await saveLog(page)).at(-1)!.t + 600;
    const now = () => page.evaluate(() => performance.now());
    await runUntil(page, async () => (await dot()) === ok, 10);
    expect(await now()).toBeLessThan(start + 400);

    await page.clock.runFor(start + 400 - (await now()));
    await expect(row(page, KEYS.undo)).toHaveCount(1);
    expect((await count(page).textContent())?.trim()).toBe('5');

    // The count starts to roll 520 ms after the start. The roll itself runs on the clock of the screen.
    await page.clock.runFor(start + 600 - (await now()));
    expect(await count(page).textContent()).toContain('4');
    await expect(count(page)).toHaveText('4');

    await runUntil(page, async () => (await row(page, KEYS.undo).count()) === 0);
    expect((await now()) - start).toBeLessThanOrEqual(3000);
  });

  test('a new problem opens the panel, and its rows come 120 ms after the open, then min(140, 600 / count) ms apart', async ({ page, run }) => {
    await openStopped(page, run);
    const keys = [KEYS.plans, 'Missing page\trestore.md\tchecks.md\tthe checks\t0'];
    const two = WITH_PLANS.replace('Open the file and check it.', 'Open the file and check it. See [the checks](checks.md).');
    await saveAndShow(page, run, two);
    await runUntil(page, () => isOpen(page), 5);
    const opened = (await ckLog(page)).find((snap) => hasClass(snap, 'open'))!.t;
    const now = () => page.evaluate(() => performance.now());
    /** The height of the row, 0 while it has not come. Its growth runs on the clock of the screen. */
    const heightOf = (key: string) => row(page, key).evaluateAll((rows) => rows[0]?.getBoundingClientRect().height ?? 0);
    const runTo = async (at: number) => page.clock.runFor(Math.max(0, opened + at - (await now())));

    await runTo(100);
    expect(await heightOf(keys[0]!)).toBe(0);
    expect(await heightOf(keys[1]!)).toBe(0);

    await runTo(130);
    await expect.poll(() => heightOf(keys[0]!), OFTEN).toBeGreaterThan(0);
    await runTo(250);
    expect(await heightOf(keys[1]!)).toBe(0);

    await runTo(270);
    await expect.poll(() => heightOf(keys[1]!), OFTEN).toBeGreaterThan(0);
  });

  test('the fixed rows go first, then the new rows come', async ({ page, run }) => {
    await openStopped(page, run);
    await pill(page).click();
    await runUntil(page, () => isOpen(page));
    await saveAndShow(page, run, WITHOUT_UNDO.replace('Pick a file and a day.', 'Pick a file and a day. See [the plans](plans.md).'));
    await runUntil(page, async () => (await row(page, KEYS.plans).count()) === 1 && (await row(page, KEYS.undo).count()) === 0);
    const log = await ckLog(page);
    const gone = log.findIndex((snap) => !snap.rows.includes(KEYS.undo));
    const added = log.findIndex((snap) => snap.rows.includes(KEYS.plans));
    expect(gone).toBeGreaterThanOrEqual(0);
    expect(added).toBeGreaterThan(gone);
  });

  test('at 0 an open panel shows the 34px check, shuts 1 s later, and the pill turns to the fresh check for 2.6 s', async ({ page, siteWith }) => {
    const run = await siteWith(ONE_PROBLEM);
    await openStopped(page, run, '1');
    await pill(page).click();
    await runUntil(page, () => isOpen(page));

    await saveAndShow(page, run, CLEAN);
    await runUntil(page, async () => (await ckLog(page)).some((snap) => snap.check));
    const check = await page.locator('#ck .ck-body svg').first().evaluate((svg) => {
      const style = getComputedStyle(svg);
      return { width: style.width, height: style.height, color: style.color };
    });
    expect(check).toEqual({ width: '34px', height: '34px', color: await computedColor(page, 'var(--sx-s)') });

    await runUntil(page, async () => !(await isOpen(page)), 50);
    const log = await ckLog(page);
    const shown = log.find((snap) => snap.check)!;
    const shut = log.find((snap) => snap.t > shown.t && !hasClass(snap, 'open'))!;
    expect(shut.t - shown.t).toBeGreaterThanOrEqual(950);
    expect(shut.t - shown.t).toBeLessThanOrEqual(1200);
    const fresh = log.find((snap) => hasClass(snap, 'ok') && hasClass(snap, 'fresh'))!;
    expect(fresh).toBeDefined();

    await runUntil(page, async () => !(await box(page).evaluate((el) => el.classList.contains('fresh'))), 50);
    const ended = (await ckLog(page)).find((snap) => snap.t > fresh.t && hasClass(snap, 'ok') && !hasClass(snap, 'fresh'))!;
    expect(ended.t - fresh.t).toBeGreaterThanOrEqual(2550);
    expect(ended.t - fresh.t).toBeLessThanOrEqual(2700);
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('the rows and the count change at once', async ({ page, run }) => {
      await openStopped(page, run);
      await pill(page).click();
      await runUntil(page, () => isOpen(page));
      await saveAndShow(page, run, WITHOUT_UNDO);
      const ended = (await saveLog(page)).at(-1)!.t + 600;
      await runUntil(page, async () => (await row(page, KEYS.undo).count()) === 0 && (await count(page).textContent())?.trim() === '4', 5);
      const changed = (await ckLog(page)).find((snap) => snap.t >= ended && !snap.rows.includes(KEYS.undo) && snap.count?.trim() === '4');
      expect(changed).toBeDefined();
      expect(changed!.t - ended).toBeLessThanOrEqual(50);
    });

    test('at 0 the check shows for 1 s', async ({ page, siteWith }) => {
      const run = await siteWith(ONE_PROBLEM);
      await openStopped(page, run, '1');
      await pill(page).click();
      await runUntil(page, () => isOpen(page));
      await saveAndShow(page, run, CLEAN);
      await runUntil(page, async () => !(await isOpen(page)), 50);
      const log = await ckLog(page);
      const shown = log.find((snap) => snap.check)!;
      expect(shown).toBeDefined();
      const shut = log.find((snap) => snap.t > shown.t && !hasClass(snap, 'open'))!;
      expect(shut.t - shown.t).toBeGreaterThanOrEqual(950);
      expect(shut.t - shown.t).toBeLessThanOrEqual(1200);
    });
  });
});
