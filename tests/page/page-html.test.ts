import { expect, test } from '@playwright/test';
import type { PageView } from '../../src/site/view.ts';
import { renderPage } from '../../src/page/page-html.tsx';

const view: PageView = {
  url: '/backups/restore.html',
  rev: 'r1',
  siteName: 'Backup <app>',
  tree: [
    {
      kind: 'section',
      id: 'backups',
      title: 'Backups',
      children: [
        { kind: 'page', url: '/backups/restore.html', title: 'Restore a <file>' },
        { kind: 'page', url: '/backups/schedules.html', title: 'Schedules' },
      ],
    },
    { kind: 'page', url: '/storage.html', title: 'Storage' },
  ],
  docTitle: 'Restore a <file> - Backup <app>',
  title: 'Restore a <file>',
  titleId: 'restore-a-file',
  html: '<p>Pick a file.</p>',
};

test('the page HTML holds the text and the nav', () => {
  const html = renderPage(view, { live: true });
  expect(html).toContain('<article id="page"><p>Pick a file.</p></article>');
  expect(html).toContain('<h1 id="restore-a-file">Restore a &lt;file&gt;</h1>');
  expect(html).toContain('<title>Restore a &lt;file&gt; - Backup &lt;app&gt;</title>');
  expect(html).toContain('href="schedules.html"');
  expect(html).toContain('href="../storage.html"');
  expect(html).toContain('aria-current="page"');
});

test('a title that shows &lt; as text keeps it in the heading and the window title', () => {
  const html = renderPage({ ...view, title: 'Use &lt; here', docTitle: 'Use &lt; here - Backup app' }, { live: true });
  expect(html).toContain('>Use &amp;lt; here</h1>');
  expect(html).toContain('<title>Use &amp;lt; here - Backup app</title>');
});

test('a phone lays out the page at its own width', () => {
  expect(renderPage(view, { live: true })).toContain('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">');
});

test('only the current page is marked in the nav', () => {
  const html = renderPage(view, { live: true });
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).toMatch(/href="restore\.html" aria-current="page"/);
});

test('the page loads one classic script and one style by relative address', () => {
  const html = renderPage(view, { live: true });
  expect(html.match(/<script [^>]*src=/g)).toHaveLength(1);
  expect(html).toContain('<script src="../__nerddocs/app.js" defer></script>');
  expect(html).toContain('<link rel="stylesheet" href="../__nerddocs/app.css">');
  expect(html).not.toContain('type="module"');
  expect(html).not.toMatch(/https?:\/\//);
});

test('a page with no title id has a heading with no id', () => {
  const html = renderPage({ ...view, title: '404', titleId: '' }, { live: true });
  expect(html).toContain('<h1>404</h1>');
});

test('a site name with a script tag cannot close the embedded data', () => {
  const html = renderPage({ ...view, siteName: '</script><b>' }, { live: true });
  expect(html).not.toContain('</script><b>"');
  expect(html).toContain('\\u003c/script>');
});

test('only a served page turns live updates on', () => {
  expect(renderPage(view, { live: true })).toContain('"live":true');
  expect(renderPage(view, { live: false })).toContain('"live":false');
});
