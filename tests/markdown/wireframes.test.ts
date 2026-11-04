import { expect, test } from '@playwright/test';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { problemBox } from '../../src/markdown/embed.ts';
import { renderMarkdown } from '../../src/markdown/render.ts';
import { FRAME_SCRIPT } from '../../src/markdown/wireframes.ts';
import { frameAddressesOf, sortedTags, srcdocsOf } from '../support/html.ts';
import { fakeFiles, pngFile, type FakeFiles } from '../support/images.ts';
import { WIZARD_CSS, WIZARD_HTML, WIZARD_JS, WIZARD_LINE } from '../support/wireframes.ts';

const LISTED = ['overview', 'requirements', 'internals'];
const PAGE = 'design/decisions.md';

type Files = Record<string, { bytes: string | Uint8Array; version: number }>;

/** The files of the docs folder `/home/ana/docs` under `design/wireframes/`, with their versions. */
const FILES: Files = {
  'design/wireframes/restore-wizard.html': { bytes: WIZARD_HTML, version: 1730000000001 },
  'design/wireframes/wizard.css': { bytes: WIZARD_CSS, version: 2 },
  'design/wireframes/wizard.js': { bytes: WIZARD_JS, version: 3 },
  'design/wireframes/step.png': { bytes: pngFile(1280, 720), version: 4 },
  'design/wireframes/desktop.html': { bytes: '<!doctype html><p>Desktop</p>', version: 5 },
  'design/wireframes/steps.html': { bytes: '<!doctype html><p>Steps</p>', version: 6 },
};

const filesWith = (more: Files = {}) => fakeFiles({ ...FILES, ...more }, PAGE);

function render(source: string, files: FakeFiles = filesWith()) {
  return renderMarkdown(source, '/design/decisions.html', 'Decisions', LISTED, files);
}

/** The frame document of 'Restore wizard' when its file holds `html`, and the page that shows it. */
function frameOf(html: string, more: Files = {}) {
  const page = render(WIZARD_LINE, filesWith({ 'design/wireframes/restore-wizard.html': { bytes: html, version: 1730000000001 }, ...more }));
  const docs = srcdocsOf(page.html);
  expect(docs, 'one frame').toHaveLength(1);
  return { doc: docs[0]!, page };
}

/** What the build puts in a frame document whose wireframe sits at `base`. */
const inserted = (base = 'wireframes/') => `<base href="${base}"><script>${FRAME_SCRIPT}</script>`;

/** The block of 'Restore wizard' on 'Design decisions', with the frame document left out. */
const BLOCK =
  '<div class="wf" data-wf="design/wireframes/restore-wizard.html"><div class="wf-box"><div class="wf-bar"><button type="button" class="wf-open" aria-label="Full size"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"></path></svg></button><button type="button" class="wf-close" aria-label="Close"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div><iframe class="wf-frame" title="Restore wizard" data-srcdoc="" data-urls=""></iframe><noscript><iframe class="wf-frame" title="Restore wizard" src="wireframes/restore-wizard.html"></iframe></noscript></div></div>';

/** The HTML with each frame document and each `data-urls` emptied, so its tags compare by `sortedTags`. */
const withoutSrcdoc = (html: string) => html.replace(/\sdata-srcdoc="[^"]*"/g, ' data-srcdoc=""').replace(/\sdata-urls="[^"]*"/g, ' data-urls=""');

const expectBlock = (html: string) => expect(sortedTags(withoutSrcdoc(html))).toBe(sortedTags(BLOCK));

const boxHtml = (label: string, line: string) => unified().use(rehypeStringify).stringify({ type: 'root', children: [problemBox(label, line)] });

const used = (file: string, version: number | null) => ({ file, path: `/home/ana/docs/${file}`, version });

/** The frame document of `WIZARD_HTML` as the build writes it. */
const WIZARD_DOC = WIZARD_HTML.replace('<head>', `<head>${inserted()}`)
  .replace('href="wizard.css"', 'href="wizard.css?v=2"')
  .replace('src="wizard.js"', 'src="wizard.js?v=3"')
  .replace('src="step.png"', 'src="step.png?v=4"');

test('an embed line of an HTML file gives the wireframe block, with no paragraph around it', () => {
  const page = render(WIZARD_LINE);
  expectBlock(page.html);
  expect(withoutSrcdoc(page.html)).not.toMatch(/<p[\s>]/);
});

test('the frame document is the wireframe with the base and the frame script first in its head, and a version on each file', () => {
  expect(frameOf(WIZARD_HTML).doc).toBe(WIZARD_DOC);
});

test('the frame gives the place of the base and of each address with a version in its frame document, the base first', () => {
  expect(frameAddressesOf(render(WIZARD_LINE).html)).toEqual([['wireframes/', 'wizard.css?v=2', 'wizard.js?v=3', 'step.png?v=4']]);

  const html = [
    '<!doctype html><html src="step.png"><head>',
    '<link rel="stylesheet" href="a&b.css#x">',
    '</head><body>',
    '<img src="old-step.png" alt="">',
    '<a href="#step-2">Pick a day</a>',
    '</body></html>',
  ].join('\n');
  const page = render(WIZARD_LINE, filesWith({
    'design/wireframes/restore-wizard.html': { bytes: html, version: 1730000000001 },
    'design/wireframes/a&b.css': { bytes: 'p { margin: 0; }', version: 8 },
  }));
  expect(frameAddressesOf(page.html)).toEqual([['wireframes/', 'step.png?v=4', 'a&amp;b.css?v=8#x']]);
});

test('the uses are the wireframe, then each file that it names, in order, and there is no problem', () => {
  const page = render(WIZARD_LINE);
  expect(page.uses).toEqual([
    used('design/wireframes/restore-wizard.html', 1730000000001),
    used('design/wireframes/wizard.css', 2),
    used('design/wireframes/wizard.js', 3),
    used('design/wireframes/step.png', 4),
  ]);
  expect(page.problems).toEqual([]);
});

test('the frame document names the style, the script and the image, and holds none of their text', () => {
  const { doc } = frameOf(WIZARD_HTML);
  for (const name of ['wizard.css?v=2', 'wizard.js?v=3', 'step.png?v=4']) expect(doc).toContain(name);
  const own = doc.replace(FRAME_SCRIPT, '');
  const lines = [...WIZARD_CSS.split('\n'), ...WIZARD_JS.split('\n')].map((line) => line.trim()).filter((line) => line.length >= 8);
  for (const line of lines) expect(own, line).not.toContain(line);
});

test('the base and the frame script go after the head tag, else after html, else after the doctype, else at the start', () => {
  const head = '<!doctype html><html><HEAD lang="en"><title>Restore wizard</title></HEAD><body><p>Restore</p></body></html>';
  expect(frameOf(head).doc).toBe(head.replace('<HEAD lang="en">', `<HEAD lang="en">${inserted()}`));

  const html = '<!doctype html><html lang="en"><body><p>Restore</p></body></html>';
  expect(frameOf(html).doc).toBe(html.replace('<html lang="en">', `<html lang="en">${inserted()}`));

  const doctype = '<!doctype html><p>Restore</p>';
  expect(frameOf(doctype).doc).toBe(`<!doctype html>${inserted()}<p>Restore</p>`);

  expect(frameOf('<p>Restore</p>').doc).toBe(`${inserted()}<p>Restore</p>`);
});

test('a head tag in a comment does not count, and a byte order mark goes away', () => {
  const commented = '<!doctype html><html><!-- <head> --><head><title>Restore wizard</title></head><body></body></html>';
  expect(frameOf(commented).doc).toBe(commented.replace('<head><title>', `<head>${inserted()}<title>`));

  expect(frameOf(`﻿${WIZARD_HTML}`).doc).toBe(WIZARD_DOC);
});

test('the base is the folder of the wireframe from the page, or ./ for the folder of the page, and the frame in noscript shows the file', () => {
  const at = (target: string, file: string) => {
    const page = render(`![Restore wizard](${target})`, filesWith({ [file]: { bytes: WIZARD_HTML, version: 7 } }));
    const [doc] = srcdocsOf(page.html);
    return { base: /<base href="([^"]*)">/.exec(doc ?? '')?.[1], own: /<noscript><iframe [^>]*src="([^"]*)"/.exec(page.html)?.[1] };
  };
  expect(at('restore-wizard.html', 'design/restore-wizard.html')).toEqual({ base: './', own: 'restore-wizard.html' });
  expect(at('/wireframes/restore-wizard.html', 'wireframes/restore-wizard.html')).toEqual({
    base: '../wireframes/',
    own: '../wireframes/restore-wizard.html',
  });
  expect(at('my%20frames/restore-wizard.html', 'design/my frames/restore-wizard.html')).toEqual({
    base: 'my%20frames/',
    own: 'my%20frames/restore-wizard.html',
  });
});

test('a value with no file of the folder stays as written and adds no use, and so does the base of the author', () => {
  const html = [
    '<!doctype html><html><head>',
    '<base href="x/">',
    '<link rel="stylesheet" href="../../../outside.css">',
    '<link rel="stylesheet" href=".drafts/x.css">',
    '<script src="https://cdn.example/x.js"></script>',
    '<script src="//cdn.example/x.js"></script>',
    '</head><body>',
    '<a href="#step-2">Pick a day</a>',
    '<a href="">Here</a>',
    '<a href="?step=2">Step 2</a>',
    '<img src="data:image/png;base64,AA==" alt="">',
    '<a href="mailto:ana@example.com">Ana</a>',
    '</body></html>',
  ].join('\n');
  const { doc, page } = frameOf(html);
  expect(doc).toBe(html.replace('<head>', `<head>${inserted()}`));
  expect(page.uses).toEqual([used('design/wireframes/restore-wizard.html', 1730000000001)]);
  expect(page.problems).toEqual([]);
});

test('each src and href of a file gets its version, in a template too, with any quotes and a fragment', () => {
  const html = [
    '<!doctype html><html><head>',
    '<link rel="icon" href="step.png">',
    "<script src='wizard.js'></script>",
    '<script src=wizard.js></script>',
    '<link rel="stylesheet" href="a&b.css">',
    '</head><body>',
    '<template><img src="step.png" alt=""></template>',
    '<video><source src="step.png"></video>',
    '<a href="steps.html?x=1#s2">Steps</a>',
    '</body></html>',
  ].join('\n');
  const { doc } = frameOf(html, { 'design/wireframes/a&b.css': { bytes: 'p { margin: 0; }', version: 8 } });
  const expected = [
    `<!doctype html><html><head>${inserted()}`,
    '<link rel="icon" href="step.png?v=4">',
    '<script src="wizard.js?v=3"></script>',
    '<script src="wizard.js?v=3"></script>',
    '<link rel="stylesheet" href="a&amp;b.css?v=8">',
    '</head><body>',
    '<template><img src="step.png?v=4" alt=""></template>',
    '<video><source src="step.png?v=4"></video>',
    '<a href="steps.html?v=6#s2">Steps</a>',
    '</body></html>',
  ].join('\n');
  expect(doc).toBe(expected);
});

test('a path from the docs folder becomes a path from the folder of the wireframe, with its version, and a missing one stays', () => {
  const html = [
    '<!doctype html><html><head>',
    '<link rel="stylesheet" href="/design/wireframes/wizard.css">',
    '</head><body>',
    '<img src="/shared/my%20logo.png#mark" alt="">',
    '<img src="/design/old-step.png" alt="">',
    '</body></html>',
  ].join('\n');
  const { doc, page } = frameOf(html, { 'shared/my logo.png': { bytes: pngFile(64, 64), version: 9 } });
  expect(doc).toBe(
    html
      .replace('<head>', `<head>${inserted()}`)
      .replace('href="/design/wireframes/wizard.css"', 'href="wizard.css?v=2"')
      .replace('src="/shared/my%20logo.png#mark"', 'src="../../shared/my%20logo.png?v=9#mark"'),
  );
  expect(page.uses).toEqual([
    used('design/wireframes/restore-wizard.html', 1730000000001),
    used('design/wireframes/wizard.css', 2),
    used('shared/my logo.png', 9),
    used('design/old-step.png', null),
  ]);
});

test('a missing file of the wireframe stays as written, adds a use with no version, and is no problem', () => {
  const html = '<!doctype html><html><head></head><body><img src="old-step.png" alt=""></body></html>';
  const { doc, page } = frameOf(html);
  expect(doc).toBe(html.replace('<head>', `<head>${inserted()}`));
  expect(page.uses).toEqual([
    used('design/wireframes/restore-wizard.html', 1730000000001),
    used('design/wireframes/old-step.png', null),
  ]);
  expect(page.problems).toEqual([]);
});

test('an empty alt gives the name of the file, and a raw img alone in its paragraph gives the same block', () => {
  expectBlock(render('![](wireframes/restore-wizard.html)').html);
  expectBlock(render('<img src="wireframes/restore-wizard.html" alt="Restore wizard">').html);
});

test('in a line of text an image of a wireframe is a link to the file, and in a link it is the text of that link', () => {
  for (const alt of ['Restore wizard', '']) {
    const files = filesWith();
    const page = render(`See ![${alt}](wireframes/restore-wizard.html) now.`, files);
    expect(page.html, alt).toBe('<p>See <a href="wireframes/restore-wizard.html">Restore wizard</a> now.</p>');
    expect(files.asked, alt).toEqual([]);
    expect(page.uses, alt).toEqual([]);
    expect(page.problems, alt).toEqual([]);
  }
  const linked = render('[![Restore wizard](wireframes/restore-wizard.html)](../schedules.md)');
  expect(linked.html).toBe('<p><a href="../schedules.html">Restore wizard</a></p>');
});

test('a remote wireframe is a link to it, and the build asks for no file', () => {
  const files = filesWith();
  const page = render('![Restore wizard](https://example.com/restore-wizard.html)', files);
  expect(page.html).toBe('<p><a href="https://example.com/restore-wizard.html">Restore wizard</a></p>');
  expect(files.asked).toEqual([]);
  expect(page.uses).toEqual([]);
  expect(page.problems).toEqual([]);
});

test('a missing wireframe leaves the problem box and a terminal line, and one outside the folder adds no use', () => {
  const page = render('![Restore wizard](wireframes/old-wizard.html)');
  expect(page.html).toBe(boxHtml('Restore wizard', 'Missing file: wireframes/old-wizard.html design/decisions.md'));
  expect(page.uses).toEqual([used('design/wireframes/old-wizard.html', null)]);
  expect(page.problems).toEqual([{ name: 'Missing file', value: 'wireframes/old-wizard.html /home/ana/docs/design/decisions.md' }]);

  for (const target of ['../../outside.html', '.drafts/wizard.html']) {
    const outside = render(`![Restore wizard](${target})`);
    expect(outside.html, target).toBe(boxHtml('Restore wizard', `Missing file: ${target} design/decisions.md`));
    expect(outside.uses, target).toEqual([]);
    expect(outside.problems, target).toEqual([{ name: 'Missing file', value: `${target} /home/ana/docs/design/decisions.md` }]);
  }
});

test('one wireframe twice gives two blocks and one entry for each file', () => {
  const page = render(`${WIZARD_LINE}\n\n${WIZARD_LINE}`);
  expect(page.html.match(/<div class="wf"/g)).toHaveLength(2);
  expect(page.uses.map((use) => use.file)).toEqual([
    'design/wireframes/restore-wizard.html',
    'design/wireframes/wizard.css',
    'design/wireframes/wizard.js',
    'design/wireframes/step.png',
  ]);
});

test('a wireframe in a fence shows at its levels', () => {
  const html = render(`::: internals\n${WIZARD_LINE}\n:::`).html;
  expect(html).toMatch(/<div class="part" data-l="internals"><div class="bd">\s*<div class="wf" /);
});

test('with no files the line stays as today', () => {
  const page = renderMarkdown(WIZARD_LINE, '/design/decisions.html', 'Decisions', LISTED);
  expect(page.html).toBe('<p><img src="wireframes/restore-wizard.html" alt="Restore wizard"></p>');
  expect(page.uses).toEqual([]);
  expect(page.problems).toEqual([]);
});

test('the frame script cannot end its script tag or open a comment, and it compiles', () => {
  expect(FRAME_SCRIPT).not.toContain('</script');
  expect(FRAME_SCRIPT).not.toContain('<!--');
  expect(() => new Function(FRAME_SCRIPT)).not.toThrow();
});
