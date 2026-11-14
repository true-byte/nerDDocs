import MiniSearch, { type SearchResult } from 'minisearch';
import type { SearchUnit } from '../markdown/render.ts';
import { formatHash, landingLevelFor } from './address.ts';
import { wordsInRun, type RunWord as Word } from './word-split.ts';

/** One page of the search file. */
export interface SearchPage {
  url: string;
  title: string;
  /** The folder of the page's dimension, or null on a site with no dimensions. */
  dimension: string | null;
  parts: string[];
  hasSharedText: boolean;
  units: SearchUnit[];
}

export interface Reader {
  /** The folder of the open page's dimension, or null. */
  dimension: string | null;
  /** The level ids of the site, in order. */
  levels: readonly string[];
  /** The reader's level of the page at `url`, or null on a site with no levels. */
  levelOf(url: string): string | null;
}

export interface Hit {
  url: string;
  title: string;
  dimension: string | null;
  heading: string | null;
  headingId: string | null;
  /** The levels string of the unit, or null. */
  levels: string | null;
  /** The level the hit opens at, or null on a flat page or a site with no levels. */
  level: string | null;
  /** True when the reader's level of the page shows the unit. */
  seen: boolean;
  /** `url` and `formatHash(level, headingId)`. */
  href: string;
  /** The text of the hit row. */
  snippet: string;
  /** Each range [start, end) of `snippet` that a query word matches. */
  marks: [number, number][];
}

export interface Searcher {
  find(query: string, reader: Reader): Hit[];
}

/** What the page needs to find the block of a hit and mark its words. */
export interface HitBlock {
  /** The whole text of the unit. */
  text: string;
  /** How many units of the page with the same text and levels come before it. */
  before: number;
  /** The words of the query, as the search reads them. */
  query: string[];
  /** The words of the unit that matched. */
  matched: string[];
}

const MAX_HITS = 50;
const SNIPPET_CHARS = 160;
/** A word of this many letters or more also matches with one letter wrong. */
const FUZZY_FROM = 5;
const MORE = '…';

/** The characters that join the pieces of one word, such as `Ctrl+R` or `REQ-2.1`. */
const JOINERS = '+.\\-_/#';
const WORD = new RegExp(`[\\p{L}\\p{N}\\p{M}${JOINERS}]+`, 'gu');
const PIECE = new RegExp(`[\\p{L}\\p{N}\\p{M}]+`, 'gu');
/** A word drops these at its ends, such as the dot that ends a sentence. `+` and `#` stay at the end, as in `C++`. */
const LEADING = new RegExp(`^[${JOINERS}]+`, 'u');
const TRAILING = /[.\-_/]+$/u;

/**
 * The words of a text, with where each starts. A word in Chinese, Japanese, Thai, Lao, Khmer or Burmese text, which
 * has no spaces between words, comes from `wordsInRun`.
 */
function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  for (const found of text.matchAll(WORD)) {
    const raw = found[0];
    const lead = LEADING.exec(raw)?.[0].length ?? 0;
    const word = raw.slice(lead).replace(TRAILING, '');
    if (!word) continue;
    const start = found.index + lead;
    for (const part of wordsInRun(word)) words.push({ text: part.text, start: start + part.start });
  }
  return words;
}

/** The pieces of a joined word, without the word itself. A plain word has none. */
function piecesOf(word: Word): Word[] {
  const pieces = [...word.text.matchAll(PIECE)].map((found) => ({ text: found[0], start: word.start + found.index }));
  return pieces.length > 1 || pieces[0]?.text !== word.text ? pieces : [];
}

const lower = (text: string) => text.toLowerCase();

/** The words of a query, as the search reads them. */
export function queryWords(query: string): string[] {
  return wordsOf(query).map((word) => lower(word.text));
}

/**
 * Each range of `text` that a query word matches, merged and in order: a word or a piece that matched whole, or the
 * start of a word that the last query word matched as its start.
 */
export function rangesIn(text: string, query: readonly string[], matched: readonly string[]): [number, number][] {
  const terms = new Set(matched);
  const last = query.at(-1);
  const ranges: [number, number][] = [];
  const add = (word: Word) => {
    const term = lower(word.text);
    if (!terms.has(term)) return;
    const asStart = !query.includes(term) && last !== undefined && term.startsWith(last);
    ranges.push([word.start, word.start + (asStart ? last.length : word.text.length)]);
  };
  for (const word of wordsOf(text)) {
    add(word);
    piecesOf(word).forEach(add);
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const end = merged.at(-1);
    if (end && range[0] <= end[1]) end[1] = Math.max(end[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** The text cut to at most 160 characters around `at`, at spaces, with '…' at each cut end. */
function cutAround(text: string, at: number): string {
  if (text.length <= SNIPPET_CHARS) return text;
  const room = SNIPPET_CHARS - 2 * MORE.length;
  let start = Math.max(0, at - Math.floor(room / 3));
  let end = Math.min(text.length, start + room);
  start = Math.max(0, end - room);
  if (start > 0 && text[start - 1] !== ' ') {
    const space = text.indexOf(' ', start);
    if (space >= 0 && space < at) start = space + 1;
  }
  if (end < text.length && text[end] !== ' ') {
    const space = text.lastIndexOf(' ', end);
    if (space > Math.max(start, at)) end = space;
  }
  return `${start > 0 ? MORE : ''}${text.slice(start, end)}${end < text.length ? MORE : ''}`;
}

interface Doc {
  id: number;
  text: string;
  heading: string;
  title: string;
  /** The pieces of each joined word of the unit, its heading and its page title. */
  parts: string;
}

interface Entry {
  page: SearchPage;
  unit: SearchUnit;
  before: number;
}

const hitBlocks = new WeakMap<Hit, HitBlock>();

/** The block of a hit that `find` gave. */
export function blockOf(hit: Hit): HitBlock | undefined {
  return hitBlocks.get(hit);
}

/** The fields whose words count whole. A word that matches only a piece of a joined word ranks lower. */
const WHOLE_FIELDS = ['text', 'heading', 'title'];

export function createSearch(pages: readonly SearchPage[]): Searcher {
  const entries: Entry[] = [];
  const docs: Doc[] = [];
  for (const page of pages) {
    const seen = new Map<string, number>();
    for (const unit of page.units) {
      const key = `${unit.levels ?? ''}\n${unit.text}`;
      const before = seen.get(key) ?? 0;
      seen.set(key, before + 1);
      const pieces = [unit.text, unit.heading ?? '', page.title].flatMap((text) => wordsOf(text).flatMap(piecesOf));
      docs.push({
        id: entries.length,
        text: unit.text,
        heading: unit.heading ?? '',
        title: page.title,
        parts: pieces.map((piece) => piece.text).join(' '),
      });
      entries.push({ page, unit, before });
    }
  }

  const index = new MiniSearch<Doc>({
    fields: ['text', 'heading', 'title', 'parts'],
    tokenize: (text, field) => (field === 'parts' ? text.split(' ') : wordsOf(text).map((word) => word.text)),
    processTerm: (term) => lower(term) || null,
    searchOptions: {
      tokenize: (text) => wordsOf(text).map((word) => word.text),
      processTerm: (term) => lower(term) || null,
    },
  });
  index.addAll(docs);

  /** The reader's level of the page of an entry, the level its hit opens at, and whether that level shows it. */
  function placeOf({ page, unit }: Entry, reader: Reader): { level: string | null; seen: boolean } {
    const own = reader.levels.length ? reader.levelOf(page.url) : null;
    const level = page.parts.length && own !== null ? landingLevelFor(unit.levels, own, reader.levels) : null;
    return { level, seen: unit.levels === null || (own !== null && unit.levels.split(' ').includes(own)) };
  }

  function hitOf(entry: Entry, result: SearchResult, query: string[], place: { level: string | null; seen: boolean }): Hit {
    const { page, unit, before } = entry;
    const matched = result.terms;
    const first = rangesIn(unit.text, query, matched)[0]?.[0] ?? 0;
    const snippet = cutAround(unit.text, first);
    const hit: Hit = {
      url: page.url,
      title: page.title,
      dimension: page.dimension,
      heading: unit.heading,
      headingId: unit.headingId,
      levels: unit.levels,
      level: place.level,
      seen: place.seen,
      href: `${page.url}${formatHash(place.level, unit.headingId)}`,
      snippet,
      marks: rangesIn(snippet, query, matched),
    };
    hitBlocks.set(hit, { text: unit.text, before, query, matched });
    return hit;
  }

  return {
    find(query, reader) {
      const words = queryWords(query);
      if (!words.length) return [];
      const results = index.search(words.join(' '), {
        combineWith: 'AND',
        prefix: (_term, at, terms) => at === terms.length - 1,
        fuzzy: (term) => ([...term].length >= FUZZY_FROM ? 1 : false),
        boost: { text: 1, heading: 0.6, title: 0.4, parts: 0.5 },
      });
      // A query word that a field holds whole counts more than one that only a piece or the start of a word holds.
      const wholeCount = (result: SearchResult) =>
        result.queryTerms.filter((term) => result.match[term]?.some((field) => WHOLE_FIELDS.includes(field))).length;
      const ranked = results.map((result, at) => {
        const entry = entries[result.id as number]!;
        const place = placeOf(entry, reader);
        const group = (entry.page.dimension === reader.dimension ? 0 : 2) + (place.seen ? 0 : 1);
        return { entry, result, place, group, whole: wholeCount(result), at };
      });
      ranked.sort((a, b) => a.group - b.group || b.whole - a.whole || a.at - b.at);
      return ranked.slice(0, MAX_HITS).map(({ entry, result, place }) => hitOf(entry, result, words, place));
    },
  };
}
