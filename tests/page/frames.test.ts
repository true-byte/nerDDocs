import { expect, test } from '@playwright/test';
import { absoluteSrcdoc, frameSizeKey, LOOP_RUN, nextRun, NO_RUN, readFramePost, type FrameRun } from '../../src/page/frames.ts';
import { WIZARD } from '../support/wireframes.ts';

test('the stored size of a wireframe has the key of its file', () => {
  expect(frameSizeKey(WIZARD)).toBe('wireframe design/wireframes/restore-wizard.html');
});

test('a height post and an escape post read back, and any other data reads as none', () => {
  expect(readFramePost({ nerddocs: 'frame', height: 521, width: 640, acted: true })).toEqual({
    kind: 'height',
    height: 521,
    width: 640,
    acted: true,
  });
  expect(readFramePost({ nerddocs: 'frame', height: 521 })).toEqual({ kind: 'height', height: 521, width: 0, acted: false });
  expect(readFramePost({ nerddocs: 'frame', height: 521, width: '640', acted: 'yes' })).toEqual({
    kind: 'height',
    height: 521,
    width: 0,
    acted: false,
  });
  expect(readFramePost({ nerddocs: 'frame', escape: true })).toEqual({ kind: 'escape' });

  for (const data of [
    'wf-load',
    null,
    undefined,
    { nerddocs: 'frame', ask: true },
    { nerddocs: 'other', height: 5 },
    { nerddocs: 'frame', height: '521' },
    { nerddocs: 'frame', height: Number.NaN },
    { nerddocs: 'frame', height: Number.POSITIVE_INFINITY },
  ]) {
    expect(readFramePost(data), JSON.stringify(data) ?? String(data)).toBeNull();
  }
});

test('a run starts empty and stops at its fourth post', () => {
  expect(NO_RUN).toEqual({ excess: 0, count: 0, from: 0 });
  expect(LOOP_RUN).toBe(4);
});

/** The counts of a run of posts, each `over` px taller than the frame, on a frame that takes each post that its run allows. */
function countsOf(overs: number[], start = 480): { counts: number[]; taken: boolean[]; shown: number; run: FrameRun } {
  let run: FrameRun = NO_RUN;
  let shown = start;
  const counts: number[] = [];
  const taken: boolean[] = [];
  for (const over of overs) {
    const posted = shown + over;
    run = nextRun(run, posted, shown, false);
    counts.push(run.count);
    taken.push(run.count < LOOP_RUN);
    if (run.count < LOOP_RUN) shown = posted;
  }
  return { counts, taken, shown, run };
}

test('four posts in a row that each exceed the frame by the same amount stop the frame at the fourth', () => {
  const { counts, taken, shown, run } = countsOf([16, 16, 16, 16]);
  expect(counts).toEqual([1, 2, 3, 4]);
  expect(taken).toEqual([true, true, true, false]);
  expect(shown).toBe(480 + 3 * 16);
  expect(run.from, 'the height from before the run').toBe(480);
});

test('a run keeps the height of the frame at its first post, and a new run or a post that fits starts from the frame', () => {
  expect(countsOf([16, 16]).run.from).toBe(480);
  expect(countsOf([16, 16, 24]).run.from).toBe(480 + 2 * 16);
  expect(nextRun({ excess: 16, count: 2, from: 448 }, 480, 480, false).from).toBe(480);
  expect(nextRun({ excess: 16, count: 2, from: 448 }, 496, 480, true).from).toBe(480);
});

test('another excess starts a new run, an excess in whole px counts as the same, and a post that fits ends the run', () => {
  expect(countsOf([16, 16, 24]).counts).toEqual([1, 2, 1]);
  expect(countsOf([16, 16.4, 15.6]).counts).toEqual([1, 2, 3]);
  const run: FrameRun = { excess: 16, count: 3, from: 432 };
  expect(nextRun(run, 480, 480, false).count).toBe(0);
  expect(nextRun(run, 470, 480, false).count).toBe(0);
});

test('a stopped run stays stopped for any post that the reader did not cause, and a post after a click or a key starts again', () => {
  const stopped: FrameRun = { excess: 16, count: LOOP_RUN, from: 432 };
  expect(nextRun(stopped, 490, 480, false)).toEqual(stopped);
  expect(nextRun(stopped, 470, 480, false)).toEqual(stopped);
  expect(nextRun(stopped, 496, 480, false)).toEqual(stopped);
  expect(nextRun(stopped, 600, 480, true).count).toBe(1);
  expect(nextRun({ excess: 16, count: 2, from: 448 }, 496, 480, true).count).toBe(1);
});

/** A frame document whose base and files are `addresses`, and the place of each address in it, as the build writes them. */
function frameDocument(addresses: string[]): { source: string; places: string } {
  const [base, ...files] = addresses;
  const source = `<!doctype html><html><head><base href="${base}"><script>parent.x = 1;</script>${files.map((file) => `<link rel="stylesheet" href="${file}">`).join('')}</head></html>`;
  let from = 0;
  const places = addresses.flatMap((address) => {
    const start = source.indexOf(`"${address}"`, from) + 1;
    from = start + address.length;
    return [start, from];
  });
  return { source, places: places.join(' ') };
}

const WIZARD_ADDRESSES = ['wireframes/', 'wizard.css?v=2', 'a&amp;b.png?v=4#mark'];

test('the frame document takes the base from the page and each file from the base, each one absolute', () => {
  const { source, places } = frameDocument(WIZARD_ADDRESSES);
  const served = frameDocument([
    'http://127.0.0.1:4000/design/wireframes/',
    'http://127.0.0.1:4000/design/wireframes/wizard.css?v=2',
    'http://127.0.0.1:4000/design/wireframes/a&amp;b.png?v=4#mark',
  ]);
  expect(absoluteSrcdoc(source, places, 'http://127.0.0.1:4000/design/decisions.html')).toBe(served.source);
  const onDisk = frameDocument([
    'file:///home/ana/docs/design/wireframes/',
    'file:///home/ana/docs/design/wireframes/wizard.css?v=2',
    'file:///home/ana/docs/design/wireframes/a&amp;b.png?v=4#mark',
  ]);
  expect(absoluteSrcdoc(source, places, 'file:///home/ana/docs/design/decisions.html#restore-wizard')).toBe(onDisk.source);
});

test('a base of ./ gives the folder of the page, and an address before the base in the document still takes it', () => {
  const { source, places } = frameDocument(['./', 'desktop.css?v=5']);
  expect(absoluteSrcdoc(source, places, 'http://127.0.0.1:4000/decisions.html')).toBe(
    frameDocument(['http://127.0.0.1:4000/', 'http://127.0.0.1:4000/desktop.css?v=5']).source,
  );

  const early = '<html src="step.png?v=4"><head><base href="wireframes/"></head></html>';
  const step = early.indexOf('step.png');
  const base = early.indexOf('wireframes/');
  expect(absoluteSrcdoc(early, `${base} ${base + 11} ${step} ${step + 12}`, 'http://127.0.0.1:4000/design/decisions.html')).toBe(
    '<html src="http://127.0.0.1:4000/design/wireframes/step.png?v=4"><head><base href="http://127.0.0.1:4000/design/wireframes/"></head></html>',
  );
});

test('places that do not fit the frame document give it as it is', () => {
  const { source } = frameDocument(WIZARD_ADDRESSES);
  for (const places of ['', '66', '66 60', '66 77 100 9000', 'a b', '66 77 70 80']) {
    expect(absoluteSrcdoc(source, places, 'http://127.0.0.1:4000/design/decisions.html'), places).toBe(source);
  }
});
