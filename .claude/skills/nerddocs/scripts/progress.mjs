#!/usr/bin/env node
// @ts-check
/**
 * Reads the progress log of a nerDDocs job in a work folder, such as `nerddocs-work`, and prints the next item, the
 * counts, each section id that two section lines carry, and each section that no page or more than one page takes.
 *
 * Run it as `node progress.mjs [work folder]`. It prints a line `Duplicate section id: <id> <sections file> <sections file>`,
 * such as `Duplicate section id: S1001 sections/01.md sections/02.md`, for each id that two section lines carry. These
 * lines print before the 'Unplaced section' lines. It exits with 1 when it prints a 'Duplicate section id', an
 * 'Unplaced section' or a 'Double section' line, or when the work folder is missing, and with 0 otherwise.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The work folder when the command names none. */
export const DEFAULT_FOLDER = 'nerddocs-work';

/** The step of a move whose items are the page items further down in `progress.md`. */
const MOVE_STEP = 'Move the pages';

/**
 * @typedef {object} Count
 * @property {number} done The checked items of the kind.
 * @property {number} total All items of the kind.
 */

/**
 * @typedef {object} Progress
 * @property {string} next The first unchecked item of `progress.md` as written, or `none`.
 * @property {Count} pages The page items of `progress.md`.
 * @property {Count} clashes The clash items of `clashes.md`.
 * @property {Count} fill The fill items of `progress.md`.
 * @property {string[]} duplicate Each section id that two or more section lines carry, as the id and the sections file
 *   of each of those lines, such as `S1001 sections/01.md sections/02.md`.
 * @property {string[]} unplaced Each section that no page source and no left-out line names, as its id and its old
 *   place, such as `S0019 old-docs/requirements.md:3-14`.
 * @property {string[]} double Each section that two or more pages name, or that a page and a left-out line name, as its
 *   id and the ids of the pages that name it, such as `S0006 P002 P003`.
 */

/**
 * @typedef {object} Item
 * @property {boolean} done
 * @property {string} line The line as written, with no space around it.
 * @property {string} text The text after the box.
 */

const ITEM = /^\s*- \[([ xX])\] (.*?)\s*$/;
const PAGE_ITEM = /^(P\d+)\s/;
const FILL_ITEM = /^F\d+\s/;
const CLASH_ITEM = /^C\d+\s/;
const LEFT_OUT = /^\s*- (S\d+) left out:/;
const SOURCE = /^\s+- (S\d+)(?:\s|$)/;
const HEADING = /^#{1,6}\s/;
const SECTION = /^\s*- (S\d+)\s+(.*?)\s*$/;
const SECTION_PLACE = /^(.*?) '.*' \d+ words$/;

/**
 * The lines of a file, or none when the file is missing.
 * @param {string} path
 * @returns {string[]}
 */
function linesOf(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  return text.replace(/^﻿/, '').split(/\r?\n/);
}

/**
 * The checkbox item of a line, or null for any other line.
 * @param {string} line
 * @returns {Item | null}
 */
function itemOf(line) {
  const match = ITEM.exec(line);
  if (!match) return null;
  return { done: match[1] !== ' ', line: line.trim(), text: match[2] ?? '' };
}

/**
 * The checked items and all items.
 * @param {Item[]} items
 * @returns {Count}
 */
function countOf(items) {
  return { done: items.filter((item) => item.done).length, total: items.length };
}

/**
 * Whether the path is a folder.
 * @param {string} path
 */
function isFolder(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Each section of the `.md` files of `sections/`, in the order of the file names and then of the lines.
 * @param {string} folder
 * @returns {{ id: string, place: string, file: string }[]}
 */
function sectionsOf(folder) {
  const sections = join(folder, 'sections');
  if (!isFolder(sections)) return [];
  const names = readdirSync(sections)
    .filter((name) => name.endsWith('.md'))
    .sort();
  /** @type {{ id: string, place: string, file: string }[]} */
  const found = [];
  for (const name of names) {
    for (const line of linesOf(join(sections, name))) {
      const match = SECTION.exec(line);
      if (!match || !match[1]) continue;
      const rest = match[2] ?? '';
      found.push({ id: match[1], place: SECTION_PLACE.exec(rest)?.[1] ?? rest, file: `sections/${name}` });
    }
  }
  return found;
}

/**
 * Reads the progress log of the work folder: `progress.md`, `sections/*.md` and `clashes.md`.
 * Throws an error with the message `Missing folder: <folder>` when the folder is missing.
 * @param {string} folder
 * @returns {Progress}
 */
export function readProgress(folder) {
  if (!isFolder(folder)) throw new Error(`Missing folder: ${folder}`);

  /** @type {Item[]} */
  const items = [];
  /** @type {Item[]} */
  const pageItems = [];
  /** @type {Item[]} */
  const fillItems = [];
  /** @type {Map<string, string[]>} The ids of the pages that name each section, in the order of the file. */
  const named = new Map();
  /** @type {Set<string>} */
  const leftOut = new Set();
  /** @type {string | null} The page item that the source lines below belong to. */
  let page = null;

  for (const line of linesOf(join(folder, 'progress.md'))) {
    const item = itemOf(line);
    if (item) {
      items.push(item);
      const pageId = PAGE_ITEM.exec(item.text)?.[1] ?? null;
      if (pageId) pageItems.push(item);
      else if (FILL_ITEM.test(item.text)) fillItems.push(item);
      page = pageId;
      continue;
    }
    const left = LEFT_OUT.exec(line);
    if (left?.[1]) {
      leftOut.add(left[1]);
      if (!named.has(left[1])) named.set(left[1], []);
      continue;
    }
    const source = SOURCE.exec(line);
    if (source?.[1] && page) {
      const pages = named.get(source[1]) ?? [];
      if (!pages.includes(page)) pages.push(page);
      named.set(source[1], pages);
      continue;
    }
    if (HEADING.test(line)) page = null;
  }

  const clashItems = linesOf(join(folder, 'clashes.md'))
    .map(itemOf)
    .filter((item) => item !== null && CLASH_ITEM.test(item.text));

  const first = items.find((item) => !item.done);
  const firstPage = pageItems.find((item) => !item.done);
  const next = first?.text === MOVE_STEP && firstPage ? firstPage : first;

  const sections = sectionsOf(folder);
  /** @type {Map<string, string[]>} The sections file of each line that carries an id, in the order of the lines. */
  const files = new Map();
  for (const section of sections) files.set(section.id, [...(files.get(section.id) ?? []), section.file]);
  const duplicate = [...files]
    .filter(([, carriers]) => carriers.length >= 2)
    .map(([id, carriers]) => [id, ...carriers].join(' '));

  const unplaced = sections
    .filter((section) => !named.has(section.id))
    .map((section) => `${section.id} ${section.place}`.trim());

  const double = [...named]
    .filter(([id, pages]) => pages.length >= 2 || (pages.length >= 1 && leftOut.has(id)))
    .map(([id, pages]) => [id, ...pages].join(' '));

  return {
    next: next?.line ?? 'none',
    pages: countOf(pageItems),
    clashes: countOf(/** @type {Item[]} */ (clashItems)),
    fill: countOf(fillItems),
    duplicate,
    unplaced,
    double,
  };
}

/**
 * The text that the command prints for the result: one line for each value, each as a name, a colon and the value.
 * @param {Progress} result
 * @returns {string}
 */
export function formatProgress(result) {
  const count = (/** @type {Count} */ { done, total }) => `${done} of ${total}`;
  const lines = [
    `Next: ${result.next}`,
    `Pages: ${count(result.pages)}`,
    `Clashes: ${count(result.clashes)}`,
    `Fill: ${count(result.fill)}`,
    ...(result.duplicate ?? []).map((section) => `Duplicate section id: ${section}`),
    ...result.unplaced.map((section) => `Unplaced section: ${section}`),
    ...result.double.map((section) => `Double section: ${section}`),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Runs the command with its arguments, and gives the exit code.
 * @param {string[]} args
 * @returns {number}
 */
function main(args) {
  const folder = args[0] ?? DEFAULT_FOLDER;
  if (!isFolder(folder)) {
    process.stderr.write(`Missing folder: ${folder}\n`);
    return 1;
  }
  const result = readProgress(folder);
  process.stdout.write(formatProgress(result));
  return result.duplicate.length > 0 || result.unplaced.length > 0 || result.double.length > 0 ? 1 : 0;
}

/** Whether node runs this file itself, not a module that imports it. */
function isRunDirectly() {
  const script = process.argv[1];
  if (!script) return false;
  try {
    return realpathSync(script) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isRunDirectly()) process.exitCode = main(process.argv.slice(2));
