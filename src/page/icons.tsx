/** @jsxImportSource react */
import type { Level } from '../site/config.ts';

const CLOCK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';

const PATHS = {
  panel: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  clock: CLOCK,
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg
      className="i"
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}

const LEVEL_PATHS: Record<string, string> = {
  eye: '<circle cx="12" cy="12" r="2.5"/><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/>',
  list: '<path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9"/>',
  cpu: '<rect x="7" y="7" width="10" height="10"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  brief: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 18a2 2 0 001.7 3h11.6a2 2 0 001.7-3L14 9V3M7 15h10"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19v2"/>',
  clock: CLOCK,
};

export function isLevelIcon(name: string): boolean {
  return Object.hasOwn(LEVEL_PATHS, name);
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/** The first letter of the level name in a circle, for a level with no icon. */
function letterIcon(name: string): string {
  const letter = escapeText([...name][0]?.toLocaleUpperCase() ?? '');
  return `<circle cx="12" cy="12" r="9"/><text x="12" y="16.2" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" stroke="none">${letter}</text>`;
}

function levelPaths(level: Pick<Level, 'name' | 'icon'>): string {
  return (level.icon && LEVEL_PATHS[level.icon]) || letterIcon(level.name);
}

/** The same icon as text, for the marks that the server puts in the page text. */
export function levelIconHtml(level: Pick<Level, 'name' | 'icon'>): string {
  return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${levelPaths(level)}</svg>`;
}

export function LevelIcon({ level }: { level: Pick<Level, 'name' | 'icon'> }) {
  return (
    <svg
      className="i"
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: levelPaths(level) }}
    />
  );
}
