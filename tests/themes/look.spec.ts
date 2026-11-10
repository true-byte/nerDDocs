import { expect, type Locator, type Page } from '@playwright/test';
import { PREVIEW_URL } from '../../src/page/theme-preview.ts';
import { MODE_KEY, THEME_KEY } from '../../src/page/theme-memory.ts';
import { THEMES } from '../../src/themes/index.ts';
import type { Mode, Theme } from '../../src/themes/types.ts';
import { rgbOf } from '../support/css.ts';
import { THREE_LEVELS } from '../support/levels.ts';
import { hydrated, test as pageTest } from '../support/page.ts';
import { OFTEN } from '../support/poll.ts';
import { runCommand, type RunningCommand } from '../support/run-command.ts';

/** A plain link, a link to a heading at 'Internals' only, and the page foot with a link to 'Storage'. */
const SITE = {
  'nerddocs.json': THREE_LEVELS,
  'restore.md': `# Restore a file

See [the storage](storage.md) and [the index](#search-index).

::: overview
Pick a file and a day.
:::

## Search index

::: internals
The index maps each block to its file.
:::
`,
  'storage.md': '# Storage\n\nBlocks are stored once.\n',
};

/** Tests that only read the site share one command on it. */
const test = pageTest.extend<object, { docs: RunningCommand }>({
  docs: [
    async ({}, use) => {
      const run = await runCommand(SITE);
      await use(run);
      await run.stop();
    },
    { scope: 'worker' },
  ],
});

test.use({ viewport: { width: 1280, height: 720 } });

const MODES: Mode[] = ['light', 'dark'];
/** The stop of 'Internals', whose color a link to it takes. */
const INTERNALS = 2;

/** What a hovered link shows, from its computed style and the computed style of its pseudo-elements. */
interface Hovered {
  color: string;
  backgroundColor: string;
  backgroundSize: string;
  textShadow: string;
  beforeOpacity: string;
  afterOpacity: string;
}

/** The weight of a link in each theme, and the end state of its hover, as `mock/links.css` writes them. */
const LOOKS: Record<string, { weight: string | null; hovered: (shown: Hovered, theme: Theme, mode: Mode) => void }> = {
  themelessness: { weight: null, hovered: (shown) => expect(shown.backgroundSize).toBe('100% 1.5px') },
  'im-a-serious-person': { weight: '600', hovered: (shown) => expect(shown.backgroundColor).not.toBe('rgba(0, 0, 0, 0)') },
  'i-love-msdos': {
    weight: '700',
    hovered: (shown, theme, mode) => {
      expect(shown.backgroundColor).toBe(rgbOf(theme[mode].link));
      expect(shown.color).toBe(rgbOf(theme[mode].sheet));
    },
  },
  'im-in': { weight: '700', hovered: (shown) => expect(shown.textShadow).toContain('12px') },
  'original-nerd': { weight: '700', hovered: (shown) => expect(shown.backgroundSize).toBe('100% 55%') },
  'i-void-warranties': {
    weight: '600',
    hovered: (shown) => {
      expect(shown.backgroundSize).toBe('100% 2px');
      expect(shown.afterOpacity).toBe('1');
    },
  },
  'i-fly-spaceships': { weight: '600', hovered: (shown) => expect(shown.beforeOpacity).toBe('1') },
};

const textLink = (page: Page, name: string) => page.locator('#page').getByRole('link', { name, exact: true });
const footLink = (page: Page) => page.getByRole('navigation', { name: 'Pages', exact: true }).getByRole('link');

const style = (link: Locator) =>
  link.evaluate((element) => {
    const own = getComputedStyle(element);
    return {
      color: own.color,
      decoration: own.textDecorationLine,
      weight: own.fontWeight,
      caps: own.fontVariantCaps,
      textWeight: getComputedStyle(element.parentElement!).fontWeight,
      iconColor: element.querySelector('.lk') ? getComputedStyle(element.querySelector('.lk')!).color : null,
    };
  });

/** Hovers the link and waits until the page shows it hovered. */
async function hover(link: Locator): Promise<void> {
  await link.hover();
  await expect.poll(() => link.evaluate((element) => element.matches(':hover')), OFTEN).toBe(true);
}

/** Opens the page in a theme and a look, as a reader who picked them. */
async function openIn(page: Page, address: string, theme: Theme, mode: Mode): Promise<void> {
  const stored = await page.addInitScript(
    ([themeKey, modeKey, id, look]) => {
      localStorage.setItem(themeKey!, id!);
      localStorage.setItem(modeKey!, look!);
    },
    [THEME_KEY, MODE_KEY, theme.id, mode],
  );
  await page.goto(address);
  await stored.dispose();
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
  await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
}

for (const theme of THEMES) {
  const look = LOOKS[theme.id];

  test(`in '${theme.name}', a link shows the link color and the weight of the theme with no underline, and a level link the color of its level`, async ({ page, docs }) => {
    expect(look, 'a look of the mock').toBeDefined();
    for (const mode of MODES) {
      const at = `${theme.name} ${mode}`;
      await openIn(page, `${docs.address}restore.html`, theme, mode);
      const plain = textLink(page, 'the storage');
      const level = textLink(page, 'the index');
      await expect(level).toHaveAttribute('data-level', 'internals');

      const rest = await style(plain);
      expect(rest.color, at).toBe(rgbOf(theme[mode].link));
      expect(rest.decoration, at).toBe('none');
      expect(rest.weight, at).toBe(look!.weight ?? rest.textWeight);
      if (theme.id === 'original-nerd') expect(rest.caps, at).toBe('small-caps');
      // The page marks the level link after it loads, and its color runs the color transition of the theme.
      await expect(level, at).toHaveCSS('color', rgbOf(theme[mode].levels[INTERNALS]));
      const leveled = await style(level);
      expect(leveled.iconColor, at).toBe(leveled.color);
      expect(leveled.decoration, at).toBe('none');
      expect((await style(footLink(page))).decoration, at).toBe('none');

      for (const link of [plain, level, footLink(page)]) {
        await hover(link);
        expect((await style(link)).decoration, `${at} hovered`).toBe('none');
      }
    }
  });

  test(`in '${theme.name}', with reduced motion a hover shows its end state at once, with no transition and no animation`, async ({ page, docs }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const mode of MODES) {
      await openIn(page, `${docs.address}restore.html`, theme, mode);
      const link = textLink(page, 'the storage');
      await hover(link);
      const shown = await link.evaluate((element) => {
        const parts = [null, '::before', '::after'].map((pseudo) => getComputedStyle(element, pseudo));
        const [own, before, after] = parts;
        return {
          hovered: {
            color: own!.color,
            backgroundColor: own!.backgroundColor,
            backgroundSize: own!.backgroundSize,
            textShadow: own!.textShadow,
            beforeOpacity: before!.opacity,
            afterOpacity: after!.opacity,
          },
          durations: parts.flatMap((part) => part.transitionDuration.split(',').map((each) => each.trim())),
          animations: parts.map((part) => part.animationName),
          running: document.getAnimations().filter((animation) => (animation.effect as KeyframeEffect | null)?.target === element).length,
        };
      });
      expect(new Set(shown.durations), mode).toEqual(new Set(['0s']));
      expect(shown.animations, mode).toEqual(['none', 'none', 'none']);
      expect(shown.running, mode).toBe(0);
      look!.hovered(shown.hovered, theme, mode);
    }
  });

  test(`the theme box preview of '${theme.name}' shows its links as the page does`, async ({ page, docs }) => {
    for (const mode of MODES) {
      await page.goto(`${docs.address}${PREVIEW_URL.slice(1)}#${theme.id}/${mode}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      const link = page.locator('#page a').first();
      // A new look on the same preview runs the color transition of its links.
      await expect(link, mode).toHaveCSS('color', rgbOf(theme[mode].link));
      const rest = await style(link);
      expect(rest.decoration, mode).toBe('none');
      expect(rest.weight, mode).toBe(look!.weight ?? rest.textWeight);
    }
  });
}

test('a theme with no link rule of its own shows links in its link color, with no change on hover', async ({ page, docs }) => {
  // With reduced motion, a change of a hover would show at once.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${docs.address}restore.html`);
  await hydrated(page);
  await page.addStyleTag({ content: ':root[data-theme="plain-test"]{--lk:#123456;--ink:#000000;--sheet:#ffffff}' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'plain-test'));
  const link = textLink(page, 'the storage');
  const shown = () =>
    link.evaluate((element) => {
      const parts = [null, '::before', '::after'].map((pseudo) => getComputedStyle(element, pseudo));
      return parts.map((part) =>
        [part.color, part.backgroundColor, part.backgroundImage, part.backgroundSize, part.textShadow, part.textDecorationLine, part.content, part.opacity].join(' | '),
      );
    });
  await expect(link).toHaveCSS('color', 'rgb(18, 52, 86)');
  await expect(link).toHaveCSS('text-decoration-line', 'none');
  const atRest = await shown();
  await hover(link);
  expect(await shown()).toEqual(atRest);
});
