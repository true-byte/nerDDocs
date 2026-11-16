import { expect, test } from '@playwright/test';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { problemBox } from '../../src/markdown/embed.ts';
import { renderMarkdown } from '../../src/markdown/render.ts';
import { imagesIn, sortedTags } from '../support/html.ts';
import { fakeFiles, jpegHead, pairPicture, PLAN_PICTURE, pngFile, svgImage, type FakeFiles } from '../support/images.ts';

const LISTED = ['overview', 'requirements', 'internals'];

/** The files of the docs folder `/home/ana/docs`, by their path in it. */
const FILES = {
  'restore-window.png': { bytes: pngFile(1280, 720), version: 1730000000000 },
  'restore-window-light.png': { bytes: pngFile(1280, 720), version: 1 },
  'restore-window-dark.png': { bytes: pngFile(1280, 800), version: 2 },
  'restore window.png': { bytes: pngFile(1280, 720), version: 3 },
  'images/restore-window.svg': { bytes: svgImage('width="120" height="40"'), version: 4 },
  'shot.avif': { bytes: 'restore', version: 5 },
  'photo.jpg': { bytes: jpegHead(1366, 768, { orientation: 6 }), version: 6 },
};

const filesOf = (page = 'restore.md') => fakeFiles(FILES, page);

function render(source: string, files: FakeFiles = filesOf()) {
  return renderMarkdown(source, '/restore.html', 'Restore', LISTED, files);
}

/** The HTML of the text with no embed pass, as the page shows it today. */
const today = (source: string) => renderMarkdown(source, '/restore.html', 'Restore', LISTED).html;

const boxHtml = (label: string, line: string) => unified().use(rehypeStringify).stringify({ type: 'root', children: [problemBox(label, line)] });

const FULL = { 'data-full': '', tabindex: '0', role: 'button' };

const WINDOW = {
  src: 'restore-window.png?v=1730000000000',
  alt: 'Restore window',
  width: '1280',
  height: '720',
  loading: 'lazy',
};

const PAIR_HTML =
  '<p><img alt="Restore window" src="restore-window-light.png?v=1" width="1280" height="720" loading="lazy" data-look="light" data-full="" tabindex="0" role="button"><img alt="Restore window" src="restore-window-dark.png?v=2" width="1280" height="800" loading="lazy" data-look="dark" data-full="" tabindex="0" role="button"></p>';

const expectSameHtml = (html: string, expected: string) => expect(sortedTags(html)).toBe(sortedTags(expected));

const used = (file: string, version: number | null) => ({ file, path: `/home/ana/docs/${file}`, version });
/** The problem of a missing file that the page names, on the line `line` when it is given. */
const missing = (target: string, line?: number) =>
  expect.objectContaining({ name: 'Missing file', file: 'restore.md', value: target, ...(line === undefined ? {} : { line }) });

test('an image line gets its file size, a version, lazy loading and the full-size marks', () => {
  const page = render('![Restore window](restore-window.png)');
  expectSameHtml(
    page.html,
    '<p><img src="restore-window.png?v=1730000000000" alt="Restore window" width="1280" height="720" loading="lazy" data-full="" tabindex="0" role="button"></p>',
  );
  expect(page.uses).toEqual([used('restore-window.png', 1730000000000)]);
  expect(page.problems).toEqual([]);
});

test('a raw img alone in its paragraph gets the same marks', () => {
  const page = render('Text.\n\n<img src="restore-window.png" alt="Restore window" width="400">\n\nMore.');
  expectSameHtml(
    page.html,
    '<p>Text.</p><p><img src="restore-window.png?v=1730000000000" alt="Restore window" width="400" height="225" loading="lazy" data-full="" tabindex="0" role="button"></p><p>More.</p>',
  );
});

test("an author's size wins, and one side gives the other by the ratio", () => {
  const raw = (size: string) => imagesIn(render(`<img src="restore-window.png" alt="Restore window" ${size}>`).html);
  expect(raw('height="360"')).toEqual([{ ...WINDOW, width: '640', height: '360', ...FULL }]);
  expect(raw('width="400" height="300"')).toEqual([{ ...WINDOW, width: '400', height: '300', ...FULL }]);
  expect(raw('width="50%"')).toEqual([{ src: WINDOW.src, alt: 'Restore window', width: '50%', ...FULL }]);
});

test('a picture with a dark source makes a pair, light first', () => {
  const page = render(PLAN_PICTURE);
  expectSameHtml(page.html, PAIR_HTML);
  expect(page.uses).toEqual([used('restore-window-light.png', 1), used('restore-window-dark.png', 2)]);
  expect(page.problems).toEqual([]);
});

test('a picture takes the first URL of a srcset, and a light source over the img', () => {
  const dense = render(pairPicture({ dark: 'restore-window-dark.png 2x, restore-window-darker.png 3x' }));
  expect(imagesIn(dense.html).map((image) => image.src)).toEqual(['restore-window-light.png?v=1', 'restore-window-dark.png?v=2']);

  const lightSource = `<picture>
  <source media="(prefers-color-scheme: light)" srcset="restore-window.png">
  <source media="(prefers-color-scheme: dark)" srcset="restore-window-dark.png">
  <img alt="Restore window" src="restore-window-light.png">
</picture>`;
  const shown = imagesIn(render(lightSource).html);
  expect(shown.map((image) => [image['data-look'], image.src])).toEqual([
    ['light', 'restore-window.png?v=1730000000000'],
    ['dark', 'restore-window-dark.png?v=2'],
  ]);
});

test("the srcset of the img stays only on the copy of the img's own src", () => {
  const withSrcset = (sources: string) => `<picture>
${sources}
  <img alt="Restore window" src="restore-window-light.png" srcset="restore-window-light.png 1x, restore-window.png 2x" sizes="50vw">
</picture>`;
  const dark = '  <source media="(prefers-color-scheme: dark)" srcset="restore-window-dark.png">';
  const light = '  <source media="(prefers-color-scheme: light)" srcset="restore-window.png">';
  const marks = (source: string) =>
    imagesIn(render(source).html).map((image) => [image['data-look'], image.src, image.srcset, image.sizes]);

  expect(marks(withSrcset(dark))).toEqual([
    ['light', 'restore-window-light.png?v=1', 'restore-window-light.png 1x, restore-window.png 2x', '50vw'],
    ['dark', 'restore-window-dark.png?v=2', undefined, undefined],
  ]);
  expect(marks(withSrcset(`${light}\n${dark}`))).toEqual([
    ['light', 'restore-window.png?v=1730000000000', undefined, undefined],
    ['dark', 'restore-window-dark.png?v=2', undefined, undefined],
  ]);
});

test('any other picture stays as written', () => {
  const source = `<picture>
  <source type="image/webp" srcset="restore-window.webp">
  <img alt="Restore window" src="restore-window-light.png">
</picture>`;
  const page = render(source);
  expect(page.html).toBe(today(source));
  expect(page.uses).toEqual([]);
});

test("GitHub's mode fragments make a pair, in either order", () => {
  const page = render(
    '![Restore window](restore-window-dark.png#gh-dark-mode-only)\n![Restore window](restore-window-light.png#gh-light-mode-only)',
  );
  expectSameHtml(page.html, PAIR_HTML);

  const lightFirst = render(
    '![Restore window](restore-window-light.png#gh-light-mode-only)\n![Restore window](restore-window-dark.png#gh-dark-mode-only)',
  );
  expectSameHtml(lightFirst.html, PAIR_HTML);
});

test('a block image with an empty alt takes its name from the file', () => {
  for (const source of ['![](restore-window.png)', '<img src="restore-window.png">']) {
    expect(imagesIn(render(source).html).map((image) => image.alt), source).toEqual(['Restore window']);
  }
  const pair = imagesIn(render(pairPicture({ alt: '' })).html);
  expect(pair.map((image) => image.alt)).toEqual(['Restore window light', 'Restore window light']);
});

test('an image in a line of text or in a link gets its size and no full-size marks', () => {
  expectSameHtml(
    render('Open ![Restore window](restore-window.png) first.').html,
    '<p>Open <img src="restore-window.png?v=1730000000000" alt="Restore window" width="1280" height="720" loading="lazy"> first.</p>',
  );
  const linked = render('[![Restore window](restore-window.png)](schedules.md)').html;
  expect(imagesIn(linked)).toEqual([WINDOW]);
  expect(linked).toContain('href="schedules.html"');
});

test('a remote image shows as written and is never read', () => {
  const files = filesOf();
  const page = render('![Logo](https://backup.example/logo.png)', files);
  expectSameHtml(page.html, '<p><img src="https://backup.example/logo.png" alt="Logo" data-full="" tabindex="0" role="button"></p>');
  expect(page.uses).toEqual([]);
  expect(files.asked).toEqual([]);
});

test('a missing image leaves the problem box and a terminal line', () => {
  const page = render('![Restore window](restore-window-old.png)');
  expect(page.html).toBe(boxHtml('Restore window', 'Missing file: restore-window-old.png restore.md'));
  expect(page.html).not.toMatch(/<p[\s>]/);
  expect(page.uses).toEqual([used('restore-window-old.png', null)]);
  expect(page.problems).toEqual([missing('restore-window-old.png', 1)]);
});

test('a target outside the folder or under a dot name leaves the box and is not used', () => {
  for (const [alt, target] of [
    ['Key', '../keys.png'],
    ['Plan', '.drafts/plan.png'],
    ['Logo', 'node_modules/logo/logo.png'],
  ] as const) {
    const page = render(`![${alt}](${target})`);
    expect(page.html, target).toBe(boxHtml(alt, `Missing file: ${target} restore.md`));
    expect(page.uses, target).toEqual([]);
    expect(page.problems, target).toEqual([missing(target, 1)]);
  }
});

test('a pair with a missing copy leaves one box that names the first missing copy', () => {
  const dim = render(pairPicture({ dark: 'restore-window-dim.png' }));
  expect(dim.html).toBe(boxHtml('Restore window', 'Missing file: restore-window-dim.png restore.md'));
  expect(dim.uses).toEqual([used('restore-window-light.png', 1), used('restore-window-dim.png', null)]);
  expect(dim.problems).toEqual([missing('restore-window-dim.png')]);

  const both = render(pairPicture({ dark: 'restore-window-dim.png', light: 'restore-window-pale.png' }));
  expect(both.html).toBe(boxHtml('Restore window', 'Missing file: restore-window-pale.png restore.md'));
  expect(both.problems).toEqual([missing('restore-window-pale.png'), missing('restore-window-dim.png')]);
});

test('a missing image in a line of text stays as written and still reports', () => {
  const page = render('Open ![Restore window](restore-window-old.png) first.');
  expect(imagesIn(page.html)).toEqual([{ src: 'restore-window-old.png', alt: 'Restore window' }]);
  expect(page.html).not.toContain('class="problem"');
  expect(page.problems).toEqual([missing('restore-window-old.png', 1)]);
});

test('one missing file twice gives two boxes, one use and a problem at each place', () => {
  const page = render('![Restore window](restore-window-old.png)\n\n![Restore window](restore-window-old.png)');
  expect(page.html.match(/class="problem"/g)).toHaveLength(2);
  expect(page.uses).toEqual([used('restore-window-old.png', null)]);
  expect(page.problems).toEqual([missing('restore-window-old.png', 1), missing('restore-window-old.png', 3)]);
});

test('a target from the folder root, in a subfolder, gets a relative address', () => {
  for (const target of ['/images/restore-window.svg', '../images/restore-window.svg']) {
    const page = renderMarkdown(`![Restore window](${target})`, '/backups/restore.html', 'Restore', LISTED, filesOf('backups/restore.md'));
    const [image] = imagesIn(page.html);
    expect(image, target).toMatchObject({ src: '../images/restore-window.svg?v=4', width: '120', height: '40' });
    expect(page.uses, target).toEqual([used('images/restore-window.svg', 4)]);
  }
});

test('a name with a space, a capital extension, and a query and fragment work', () => {
  expect(imagesIn(render('![Restore window](<restore window.png>)').html)).toEqual([
    { ...WINDOW, src: 'restore%20window.png?v=3', ...FULL },
  ]);

  const capital = fakeFiles({ 'restore-window.PNG': { bytes: pngFile(1280, 720), version: 7 } });
  expect(imagesIn(render('![Restore window](restore-window.PNG)', capital).html)).toEqual([
    { ...WINDOW, src: 'restore-window.PNG?v=7', ...FULL },
  ]);

  expect(imagesIn(render('![Restore window](restore-window.png?raw=true#top)').html)).toEqual([{ ...WINDOW, ...FULL }]);
});

test('an AVIF file gets no size and keeps the other marks', () => {
  expect(imagesIn(render('![Shot](shot.avif)').html)).toEqual([{ src: 'shot.avif?v=5', alt: 'Shot', ...FULL }]);
});

test('a turned JPEG gives its turned size', () => {
  expect(imagesIn(render('![Photo](photo.jpg)').html)).toEqual([
    { src: 'photo.jpg?v=6', alt: 'Photo', width: '768', height: '1366', loading: 'lazy', ...FULL },
  ]);
});

test('an image of another type stays as today', () => {
  const files = filesOf();
  expect(render('![Logo](logo.bmp)', files).html).toBe(today('![Logo](logo.bmp)'));
  expect(files.asked).toEqual([]);
});

test('an image or a box in a fence shows at its levels', () => {
  const image = render('::: internals\n![Restore window](restore-window.png)\n:::').html;
  expect(image).toMatch(/<div class="part" data-l="internals"><div class="bd">\s*<p><img [^>]*data-full=""/);

  const box = render('::: internals\n![Restore window](restore-window-old.png)\n:::').html;
  expect(box).toMatch(/<div class="part" data-l="internals"><div class="bd">\s*<div class="problem"/);
});

test('with no files the images stay as today', () => {
  const page = renderMarkdown('![Restore window](restore-window.png)', '/restore.html', 'Restore', LISTED);
  expect(page.html).toBe('<p><img src="restore-window.png" alt="Restore window"></p>');
  expect(page.uses).toEqual([]);
  expect(page.problems).toEqual([]);
});
