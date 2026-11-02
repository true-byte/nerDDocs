import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test } from '@playwright/test';
import { Contents } from '../../src/page/contents.tsx';

const initial = {
  url: '/restore.html',
  rev: 'r1',
  siteName: 'Backup app',
  tree: [{ kind: 'page' as const, url: '/restore.html', title: 'Restore a file' }],
  live: false,
  levels: [],
  defaultLevel: '',
  parts: [],
  hasShared: false,
  hasSharedText: false,
  configProblem: null,
  readTimes: [],
};

test('each icon button shows its name as a tip on hover', () => {
  const html = renderToString(createElement(Contents, { initial }));
  for (const name of ['Hide contents', 'Show contents', 'Contents']) {
    expect(html).toContain(`aria-label="${name}" title="${name}"`);
  }
});
