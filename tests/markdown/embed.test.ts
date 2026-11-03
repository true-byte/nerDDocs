import { expect, test } from '@playwright/test';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { embedKind, problemBox, resolveTarget } from '../../src/markdown/embed.ts';
import { renderMarkdown } from '../../src/markdown/render.ts';
import { WARN_PATH } from '../../src/page/icons.tsx';

const LISTED = ['overview', 'requirements', 'internals'];

test('the file type picks the kind, in any case and before a query', () => {
  for (const target of ['restore-window.png', 'photo.JPEG', 'flow.svg?raw=1#top', 'shot.avif']) {
    expect(embedKind(target), target).toBe('image');
  }
  for (const target of ['restore-window.jpg', 'restore-window.gif', 'restore-window.webp']) {
    expect(embedKind(target), target).toBe('image');
  }
  expect(embedKind('wireframes/restore-wizard.html')).toBe('wireframe');
  for (const target of ['api/openapi.yaml', 'api/openapi.yml', 'api/openapi.json']) {
    expect(embedKind(target), target).toBe('api');
  }
  for (const target of ['photo.bmp', 'restore.md', '#top', '', 'images/restore-window']) {
    expect(embedKind(target), target).toBeNull();
  }
});

test('a target counts from the Markdown file, or from the folder with a /', () => {
  const page = 'backups/restore.md';
  expect(resolveTarget('restore-window.png', page)).toEqual({ kind: 'file', path: 'backups/restore-window.png' });
  expect(resolveTarget('../images/restore-window.svg', page)).toEqual({ kind: 'file', path: 'images/restore-window.svg' });
  expect(resolveTarget('/images/restore-window.svg', page)).toEqual({ kind: 'file', path: 'images/restore-window.svg' });
  expect(resolveTarget('./a/../restore-window.png?raw=true#top', page)).toEqual({ kind: 'file', path: 'backups/restore-window.png' });
});

test('a target is decoded, and a bad escape stays', () => {
  expect(resolveTarget('restore%20window.png', 'restore.md')).toEqual({ kind: 'file', path: 'restore window.png' });
  expect(resolveTarget('restore-100%.png', 'restore.md')).toEqual({ kind: 'file', path: 'restore-100%.png' });
});

test('a target outside the folder or under a dot name is outside', () => {
  for (const target of ['../keys.png', '.drafts/plan.png', 'images/.cache/shot.png', 'node_modules/logo/logo.png']) {
    expect(resolveTarget(target, 'restore.md'), target).toEqual({ kind: 'outside' });
  }
});

test('a target with a scheme or // is remote', () => {
  for (const target of [
    'https://backup.example/logo.png',
    'HTTP://backup.example/logo.png',
    '//cdn.example/logo.png',
    'data:image/png;base64,iVBOR',
  ]) {
    expect(resolveTarget(target, 'restore.md'), target).toEqual({ kind: 'remote' });
  }
});

test('the problem box has the icon, the line and the label', () => {
  const box = problemBox('Restore window', 'Missing file: restore-window-old.png restore.md');
  const html = unified().use(rehypeStringify).stringify({ type: 'root', children: [box] });
  expect(WARN_PATH).toBe('M12 3 2 21h20L12 3zM12 10v5M12 18v.5');
  expect(html).toBe(
    '<div class="problem" role="img" aria-label="Restore window"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3zM12 10v5M12 18v.5"></path></svg><code>Missing file: restore-window-old.png restore.md</code></div>',
  );
});

test('with no files, an embed line of an OpenAPI file stays as today', () => {
  for (const target of ['api/openapi.yaml', 'api/openapi.yml', 'api/openapi.json']) {
    const page = renderMarkdown(`![Backup API](${target})`, '/restore.html', 'Restore', LISTED);
    expect(page.html, target).toBe(`<p><img src="${target}" alt="Backup API"></p>`);
    expect(page.uses, target).toEqual([]);
    expect(page.problems, target).toEqual([]);
  }
});
