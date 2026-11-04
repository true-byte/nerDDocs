import { expect, test } from '@playwright/test';
import { licenseEntry } from '../../src/server/licenses.ts';
import { folderWith } from '../support/folder.ts';

/** The first lines of the license of elkjs, with the white space that a license file has around its text. */
const EPL_TEXT = 'Eclipse Public License - v 2.0\n\n    THE ACCOMPANYING PROGRAM IS PROVIDED UNDER THE TERMS OF THIS ECLIPSE PUBLIC LICENSE.';
const ELK_SOURCE = 'https://github.com/kieler/elkjs';

/** A package folder of elkjs 0.9.3 with these fields in its `package.json`, and these other files. */
function elkjsWith(fields: Record<string, unknown>, files: Record<string, string> = {}): Promise<string> {
  return folderWith({ 'package.json': JSON.stringify({ name: 'elkjs', version: '0.9.3', ...fields }), ...files });
}

const sourceOf = async (fields: Record<string, unknown>) => /^Source: (.*)$/m.exec(licenseEntry(await elkjsWith(fields)))?.[1];

test('an entry gives the name, version, license, source and license text', async () => {
  const folder = await elkjsWith(
    { license: 'EPL-2.0', repository: { type: 'git', url: 'git+https://github.com/kieler/elkjs.git' } },
    { 'LICENSE.md': `\n${EPL_TEXT}\n\n` },
  );
  expect(licenseEntry(folder)).toBe(`elkjs 0.9.3\nLicense: EPL-2.0\nSource: ${ELK_SOURCE}\n\n${EPL_TEXT}\n`);
});

test('each form of a repository gives one https address', async () => {
  for (const repository of [
    'git://github.com/kieler/elkjs.git',
    'git@github.com:kieler/elkjs.git',
    'ssh://git@github.com/kieler/elkjs.git',
    'github:kieler/elkjs',
    'kieler/elkjs',
    'https://github.com/kieler/elkjs/',
    { url: 'git://github.com/kieler/elkjs.git' },
  ]) {
    expect(await sourceOf({ repository }), JSON.stringify(repository)).toBe(ELK_SOURCE);
  }
  expect(await sourceOf({ homepage: 'https://eclipse.dev/elk' })).toBe('https://eclipse.dev/elk');
  expect(await sourceOf({})).toBe('https://www.npmjs.com/package/elkjs');
});

test('an older license list and a missing license file still give an entry', async () => {
  const licenseOf = async (fields: Record<string, unknown>) => /^License: (.*)$/m.exec(licenseEntry(await elkjsWith(fields)))?.[1];
  expect(await licenseOf({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] })).toBe('MIT OR Apache-2.0');
  expect(await licenseOf({})).toBe('UNKNOWN');

  const noText = licenseEntry(await elkjsWith({ license: 'EPL-2.0' }, { 'README.md': 'The ELK layout.' }));
  expect(noText).toMatch(/^elkjs 0\.9\.3\nLicense: EPL-2\.0\nSource: https:\/\/www\.npmjs\.com\/package\/elkjs\n?$/);

  for (const name of ['LICENCE', 'license.txt', 'COPYING']) {
    const entry = licenseEntry(await elkjsWith({ license: 'EPL-2.0' }, { [name]: EPL_TEXT }));
    expect(entry, name).toContain(`\n\n${EPL_TEXT}\n`);
  }
  const first = licenseEntry(await elkjsWith({ license: 'EPL-2.0' }, { 'LICENSE.md': 'The text of LICENSE.md.', COPYING: 'The text of COPYING.' }));
  expect(first).toContain('The text of COPYING.');
  expect(first).not.toContain('The text of LICENSE.md.');
});

test('a package with no license file gives the license section of its README', async () => {
  const readme = `# elkjs\n\nThe ELK layout.\n\n## License\n\n${EPL_TEXT}\n\n## Building\n\nRun the build.\n`;
  const entry = licenseEntry(await elkjsWith({ license: 'EPL-2.0' }, { 'README.md': readme }));
  expect(entry).toBe(`elkjs 0.9.3\nLicense: EPL-2.0\nSource: https://www.npmjs.com/package/elkjs\n\n${EPL_TEXT}\n`);
});
