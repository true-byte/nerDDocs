// Writes src/server/bundled-licenses.txt: the license entry of each package that the two Mermaid builds bundle, at the
// version that they bundle, from the package files on the npm registry. Run it after a change of the Mermaid version.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLED_LICENSES, bundledPackages } from '../src/server/bundled-packages.ts';
import { licenseEntry } from '../src/server/licenses.ts';

const repo = join(import.meta.dirname, '..');
const nodeModules = join(repo, 'node_modules');
const work = join(nodeModules, '.cache', 'bundled-licenses');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
try {
  const packages = bundledPackages(nodeModules);
  const specs = packages.map(({ name, version }) => `${name}@${version}`);
  const tarballs = execFileSync(npm, ['pack', ...specs, '--silent', '--pack-destination', work], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
    .trim()
    .split(/\r?\n/);

  // Each package gets a folder with the files at the top of its tarball: its package.json, license and README.
  const folders = new Map();
  for (const [at, tarball] of tarballs.entries()) {
    const folder = join(work, String(at));
    mkdirSync(folder);
    execFileSync('tar', ['-xzf', join(work, tarball), '-C', folder, '--strip-components=1', '--exclude=*/*/*']);
    const { name, version } = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
    folders.set(`${name}@${version}`, folder);
  }

  const entries = specs.map((spec) => {
    const folder = folders.get(spec);
    if (!folder) throw new Error(`npm pack gave no package ${spec}`);
    const entry = licenseEntry(folder);
    if (!entry.includes('\n\n')) throw new Error(`${spec} has no license text: ${readdirSync(folder).join(', ')}`);
    return entry;
  });
  writeFileSync(BUNDLED_LICENSES, entries.join('\n'));
  console.log(`Wrote the licenses of ${entries.length} packages to ${BUNDLED_LICENSES}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
