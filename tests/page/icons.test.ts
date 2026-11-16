import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test } from '@playwright/test';
import { Icon, isLevelIcon, LevelIcon, levelIconHtml } from '../../src/page/icons.tsx';

test('the arrow of an open section points down', () => {
  // From the left at a height of 9, down to 15 in the middle, and back up to 9 on the right.
  expect(renderToString(createElement(Icon, { name: 'chev' }))).toContain('<path d="M6 9l6 6 6-6"/>');
});

test('the clock draws the same lines as the clock of a level', () => {
  expect(renderToString(createElement(Icon, { name: 'clock' }))).toContain('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
});

test('the link icon draws the line and the two rounded halves of a chain link', () => {
  expect(renderToString(createElement(Icon, { name: 'link' }))).toContain(
    '<path d="M9 15l6-6"/><path d="M11 6l.46-.54a5 5 0 017.07 7.07l-.53.47"/><path d="M13 18l-.4.53a5.07 5.07 0 01-7.13 0 4.97 4.97 0 010-7.07l.53-.46"/>',
  );
});

test('the up-down icon draws an arrow up over an arrow down', () => {
  expect(renderToString(createElement(Icon, { name: 'updown' }))).toContain('<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>');
});

test('the set of level icons is closed, and a name from JavaScript itself is not in it', () => {
  for (const name of ['eye', 'list', 'cpu', 'brief', 'code', 'flask', 'book', 'clock']) {
    expect(isLevelIcon(name), name).toBe(true);
  }
  for (const name of ['rocket', '', 'constructor', 'toString', '__proto__']) {
    expect(isLevelIcon(name), name).toBe(false);
  }
});

test('a level with no icon shows the first letter of its name in a circle, also for a special character', () => {
  expect(levelIconHtml({ name: 'high school' })).toContain('>H</text>');
  expect(levelIconHtml({ name: '<b>' })).toContain('>&lt;</text>');
  expect(levelIconHtml({ name: '😀 fun' })).toContain('>😀</text>');
});

test('the icon in the page text and the icon of a stop draw the same lines', () => {
  const level = { name: 'Overview', icon: 'eye' };
  const stop = renderToString(createElement(LevelIcon, { level }));
  expect(stop).toContain('<circle cx="12" cy="12" r="2.5"/>');
  expect(levelIconHtml(level)).toContain('<circle cx="12" cy="12" r="2.5"/>');
});
