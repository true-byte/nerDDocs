import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test } from '@playwright/test';
import { Icon } from '../../src/page/icons.tsx';

test('the arrow of an open section points down', () => {
  // From the left at a height of 9, down to 15 in the middle, and back up to 9 on the right.
  expect(renderToString(createElement(Icon, { name: 'chev' }))).toContain('<path d="M6 9l6 6 6-6"/>');
});
