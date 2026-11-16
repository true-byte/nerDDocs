import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/** The name of a license file, such as `LICENSE`, `LICENSE.md`, `LICENCE`, `license.txt` or `COPYING`. */
const LICENSE_FILE = /^(licen[cs]e|copying)([.-].*)?$/i;
/** The name of a README, such as `README.md`. */
const README_FILE = /^readme(\.md|\.markdown)?$/i;
/** A Markdown heading that names the license, such as `## License`. */
const LICENSE_HEADING = /^(#+)[ \t]*licen[cs]e\b.*$/im;

interface PackageJson {
  name?: string;
  version?: string;
  license?: unknown;
  licenses?: unknown;
  repository?: unknown;
  homepage?: unknown;
}

function licenseOf(pkg: PackageJson): string {
  if (typeof pkg.license === 'string' && pkg.license) return pkg.license;
  if (Array.isArray(pkg.licenses)) {
    const types = pkg.licenses
      .map((item) => (item as { type?: unknown } | null)?.type)
      .filter((type): type is string => typeof type === 'string' && type !== '');
    if (types.length) return types.join(' OR ');
  }
  return 'UNKNOWN';
}

/** An https address for the forms of a `repository` field. */
function repositoryUrl(repository: string): string {
  let url = repository.trim().replace(/^git\+/, '');
  url = url
    .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^git:\/\//, 'https://')
    .replace(/^github:/, 'https://github.com/');
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}`;
  return url.replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '');
}

function sourceOf(pkg: PackageJson, name: string): string {
  const { repository } = pkg;
  const url = typeof repository === 'string' ? repository : (repository as { url?: unknown } | null)?.url;
  if (typeof url === 'string' && url) return repositoryUrl(url);
  if (typeof pkg.homepage === 'string' && pkg.homepage) return pkg.homepage;
  return `https://www.npmjs.com/package/${name}`;
}

/** The text of the section of a README whose heading names the license, up to the next heading of its level or above. */
function readmeLicense(folder: string, entries: string[]): string | null {
  const readme = entries.filter((entry) => README_FILE.test(entry)).sort()[0];
  if (!readme) return null;
  const text = readFileSync(join(folder, readme), 'utf8');
  const heading = LICENSE_HEADING.exec(text);
  if (!heading) return null;
  const rest = text.slice(heading.index + heading[0].length);
  const next = new RegExp(`^#{1,${heading[1]!.length}}[ \\t]`, 'm').exec(rest);
  return rest.slice(0, next?.index).trim() || null;
}

/** The entry of one package folder in licenses.txt. A package with no license file gives the license section of its README. */
export function licenseEntry(folder: string): string {
  const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as PackageJson;
  const name = pkg.name ?? basename(folder);
  const head = `${name} ${pkg.version ?? ''}\nLicense: ${licenseOf(pkg)}\nSource: ${sourceOf(pkg, name)}\n`;
  const entries = readdirSync(folder);
  const file = entries.filter((entry) => LICENSE_FILE.test(entry)).sort()[0];
  const text = file ? readFileSync(join(folder, file), 'utf8').trim() : readmeLicense(folder, entries);
  return text ? `${head}\n${text}\n` : head;
}
