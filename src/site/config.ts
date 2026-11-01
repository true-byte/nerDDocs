import { isLevelIcon } from '../page/icons.tsx';
import { errorLine } from '../cli/terminal-error.ts';
import { labelFromName } from './names.ts';

/** The optional file that names the levels of a site, in the folder that the command shows. */
export const CONFIG_FILE = 'nerddocs.json';

export interface Level {
  id: string;
  name: string;
  /** A name from the closed set of icons. A level with none shows the first letter of its name. */
  icon?: string;
}

export interface SiteLevels {
  levels: Level[];
  defaultLevel: string;
}

export interface Config {
  levels: { id: string; name?: string; icon?: string }[];
  defaultLevel?: string;
}

export const EMPTY_CONFIG: Config = { levels: [] };

/** A level id goes in a space-separated attribute and in a CSS rule, so it holds no space or quote. */
const LEVEL_ID = /^[\p{L}\p{N}_.-]+$/u;

export function isLevelId(text: string): boolean {
  return LEVEL_ID.test(text);
}

const isOptionalText = (value: unknown) => value === undefined || (typeof value === 'string' && value !== '');

function isConfigLevel(value: unknown): value is Config['levels'][number] {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name, icon } = value as Record<string, unknown>;
  return typeof id === 'string' && isLevelId(id) && isOptionalText(name) && isOptionalText(icon);
}

/** Gives null for a file that is not a valid config. Every key is optional. */
export function parseConfig(file: string): Config | null {
  const text = file.replace(/^\uFEFF/, '');
  if (!text.trim()) return EMPTY_CONFIG;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { levels = [], defaultLevel } = value as Record<string, unknown>;
  if (!Array.isArray(levels) || !levels.every(isConfigLevel) || !isOptionalText(defaultLevel)) return null;
  if (new Set(levels.map((level) => level.id)).size !== levels.length) return null;
  return { levels, defaultLevel: defaultLevel as string | undefined };
}

/** An id of only marks, such as '_', still gives a level a name to show. */
const nameFromId = (id: string) => labelFromName(id) || id;

/**
 * The levels of the config in their order, then each other id in order of first use across
 * the pages. An id that the config does not list still counts, so no text disappears.
 */
export function siteLevels(
  config: Config,
  configPath: string,
  pages: { levelIds: string[]; path: string }[],
  report: (line: string) => void,
): SiteLevels {
  const levels: Level[] = config.levels.map(({ id, name, icon }) => {
    if (icon !== undefined && !isLevelIcon(icon)) report(errorLine('Unknown icon', `${icon} ${configPath}`));
    return { id, name: name ?? nameFromId(id), ...(icon !== undefined && isLevelIcon(icon) ? { icon } : {}) };
  });
  const listed = new Set(levels.map((level) => level.id));
  const known = new Set(listed);
  for (const { levelIds, path } of pages) {
    for (const id of levelIds) {
      if (listed.size && !listed.has(id)) report(errorLine('Unknown level', `${id} ${path}`));
      if (!known.has(id)) levels.push({ id, name: nameFromId(id) });
      known.add(id);
    }
  }
  const { defaultLevel } = config;
  if (defaultLevel !== undefined && !known.has(defaultLevel)) {
    report(errorLine('Unknown level', `${defaultLevel} ${configPath}`));
  }
  const chosen = defaultLevel !== undefined && known.has(defaultLevel) ? defaultLevel : levels[0]?.id;
  return { levels, defaultLevel: chosen ?? '' };
}
