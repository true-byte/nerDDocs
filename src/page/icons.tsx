/** @jsxImportSource react */
import type { Level } from '../site/config.ts';
import { colorOf } from './levels.ts';

const CLOCK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';

const PATHS = {
  panel: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  clock: CLOCK,
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  knobs:
    '<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 010 18z" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M12 3a6 6 0 009 9 9 9 0 11-9-9z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
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

/** The old level icon, an arrow and the new level icon, in the level colors. */
export function MoveIcons({ levels, from, to }: { levels: Level[]; from: string; to: string }) {
  const stopOf = (id: string) => levels.findIndex((level) => level.id === id);
  const old = levels[stopOf(from)];
  const next = levels[stopOf(to)];
  if (!old || !next) return null;
  return (
    <span className="to" role="img" aria-label={`${old.name} to ${next.name}`}>
      <span style={{ color: colorOf(stopOf(from)) }}>
        <LevelIcon level={old} />
      </span>
      <Icon name="arrow" />
      <span style={{ color: colorOf(stopOf(to)) }}>
        <LevelIcon level={next} />
      </span>
    </span>
  );
}
