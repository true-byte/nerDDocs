import { isLevelIcon } from '../page/icons.tsx';
import { errorLine } from '../cli/terminal-error.ts';
import { labelFromName } from './names.ts';

/** The file that names the levels of a site, in the folder that the command shows. */
export const CONFIG_FILE = 'nerddocs.json';

export const DEFAULT_WORDS_PER_MINUTE = 238;

/** The characters of a line of text when nerddocs.json sets no `textWidth`. */
export const DEFAULT_TEXT_WIDTH = 75;

export interface Level {
  id: string;
  name: string;
  /** A name from the closed set of icons. A level with none shows the first letter of its name. */
  icon?: string;
}

export interface Dimension {
  /** A top folder of the site, such as 'user-guide'. */
  folder: string;
  /** The name that the button and the list show. */
  name: string;
}

export interface SiteLevels {
  levels: Level[];
  defaultLevel: string;
}

export interface Config {
  levels: { id: string; name?: string; icon?: string }[];
  defaultLevel?: string;
  wordsPerMinute?: number;
  /** The characters of a line of text. */
  textWidth?: number;
  /** The top folders that split the site, in the order of the list. */
  dimensions?: { folder: string; name?: string }[];
}

export const EMPTY_CONFIG: Config = { levels: [] };

export type ConfigProblem = 'missing' | 'broken';

/** A level id goes in a space-separated attribute and in a CSS rule, so it holds no space or quote. */
const LEVEL_ID = /^[\p{L}\p{N}_.-]+$/u;

export function isLevelId(text: string): boolean {
  return LEVEL_ID.test(text);
}

const isOptionalText = (value: unknown) => value === undefined || (typeof value === 'string' && value !== '');

/** A missing value, or a finite number above 0, such as a reading speed or a text width. */
const isOptionalAmount = (value: unknown) =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0);

function isConfigLevel(value: unknown): value is Config['levels'][number] {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name, icon } = value as Record<string, unknown>;
  return typeof id === 'string' && isLevelId(id) && isOptionalText(name) && isOptionalText(icon);
}

/** A dimension folder is one top folder, so it holds no slash. */
function isConfigDimension(value: unknown): value is NonNullable<Config['dimensions']>[number] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { folder, name } = value as Record<string, unknown>;
  return typeof folder === 'string' && folder !== '' && !folder.includes('/') && isOptionalText(name);
}

/** A missing list, or a list of dimensions with each folder once. */
function isOptionalDimensions(value: unknown): value is Config['dimensions'] {
  if (value === undefined) return true;
  if (!Array.isArray(value) || !value.every(isConfigDimension)) return false;
  return new Set(value.map((dimension) => dimension.folder)).size === value.length;
}

/** Gives null for a file that is not a valid config. Every key is optional, and `"levels": false` lists none. */
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
  const { levels: given = [], defaultLevel, wordsPerMinute, textWidth, dimensions } = value as Record<string, unknown>;
  const levels = given === false ? [] : given;
  if (!Array.isArray(levels) || !levels.every(isConfigLevel) || !isOptionalText(defaultLevel)) return null;
  if (new Set(levels.map((level) => level.id)).size !== levels.length) return null;
  if (!isOptionalAmount(wordsPerMinute) || !isOptionalAmount(textWidth)) return null;
  if (!isOptionalDimensions(dimensions)) return null;
  const speed = wordsPerMinute === undefined ? {} : { wordsPerMinute: wordsPerMinute as number };
  const width = textWidth === undefined ? {} : { textWidth: textWidth as number };
  const split = dimensions === undefined ? {} : { dimensions };
  return { levels, defaultLevel: defaultLevel as string | undefined, ...speed, ...width, ...split };
}

/** An id of only marks, such as '_', still gives a level a name to show. */
const nameFromId = (id: string) => labelFromName(id) || id;

/** The dimensions that the config lists, in their order, each with its name. A config with none gives []. */
export function configDimensions(config: Config): Dimension[] {
  return (config.dimensions ?? []).map(({ folder, name }) => ({ folder, name: name ?? nameFromId(folder) }));
}

/** The levels of the config in their order. An id that a page uses and the config does not list is only reported. */
export function siteLevels(
  config: Config,
  configPath: string,
  pages: { unknownLevels: string[]; path: string }[],
  report: (line: string) => void,
): SiteLevels {
  const levels: Level[] = config.levels.map(({ id, name, icon }) => {
    if (icon !== undefined && !isLevelIcon(icon)) report(errorLine('Unknown icon', `${icon} ${configPath}`));
    return { id, name: name ?? nameFromId(id), ...(icon !== undefined && isLevelIcon(icon) ? { icon } : {}) };
  });
  for (const { unknownLevels, path } of pages) {
    for (const id of unknownLevels) report(errorLine('Unknown level', `${id} ${path}`));
  }
  const { defaultLevel } = config;
  const isListed = levels.some((level) => level.id === defaultLevel);
  if (defaultLevel !== undefined && !isListed) report(errorLine('Unknown level', `${defaultLevel} ${configPath}`));
  const chosen = isListed ? defaultLevel : levels[0]?.id;
  return { levels, defaultLevel: chosen ?? '' };
}
