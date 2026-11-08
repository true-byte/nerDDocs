/** @jsxImportSource react */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { Dimension, Level } from '../site/config.ts';
import { hrefTo } from '../site/urls.ts';
import { formatHash } from './address.ts';
import { currentDimension } from './dimensions.ts';
import { keepFound, showFound } from './found.ts';
import { Icon, LevelIcon } from './icons.tsx';
import { currentLevel } from './level-change.ts';
import { moveLevel, replaceAddress } from './level-address.ts';
import { openingLevelFor } from './level-memory.ts';
import { colorOf } from './levels.ts';
import { blockOf, createSearch, type Hit, type Reader, type SearchPage, type Searcher } from './search.ts';

/** The page that the box searches from. */
export interface SearchFrom {
  url: string;
  levels: Level[];
  defaultLevel: string;
  dimensions: Dimension[];
}

/** The search file sets this when it loads. */
declare global {
  var nerddocsSearch: { pages: SearchPage[] } | undefined;
}

interface Loaded {
  search: Searcher;
  pages: Map<string, SearchPage>;
}

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;
/** A live update of the site makes the next open load the search file again. */
let stale = false;

/** The next open of the box loads the search file again, since the text of the site changed. */
export function searchFileChanged(): void {
  stale = true;
}

/** Loads the search file with a classic script, so the box works with no `fetch` and no ES module, also from disk. */
function loadSearch(url: string): Promise<Loaded> {
  if (loaded && !stale) return Promise.resolve(loaded);
  if (loading) return loading;
  stale = false;
  loading = new Promise<Loaded>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = hrefTo(url, '/__nerddocs/search.js');
    script.onload = () => {
      script.remove();
      loading = null;
      const pages = globalThis.nerddocsSearch?.pages ?? [];
      loaded = { search: createSearch(pages), pages: new Map(pages.map((page) => [page.url, page])) };
      resolve(loaded);
    };
    script.onerror = () => {
      script.remove();
      loading = null;
      stale = true;
      reject(new Error('The search file did not load.'));
    };
    document.head.append(script);
  });
  return loading;
}

const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

const hitId = (at: number) => `nd-hit-${at}`;

/** The snippet with each mark in a `<mark>`. */
function Snippet({ hit }: { hit: Hit }) {
  const pieces: { text: string; marked: boolean }[] = [];
  let at = 0;
  for (const [start, end] of hit.marks) {
    if (start > at) pieces.push({ text: hit.snippet.slice(at, start), marked: false });
    pieces.push({ text: hit.snippet.slice(start, end), marked: true });
    at = end;
  }
  if (at < hit.snippet.length) pieces.push({ text: hit.snippet.slice(at), marked: false });
  return (
    <span className="hs">
      {pieces.map((piece, n) => (piece.marked ? <mark key={n}>{piece.text}</mark> : <Fragment key={n}>{piece.text}</Fragment>))}
    </span>
  );
}

function HitRow({
  hit,
  at,
  active,
  levels,
  from,
  onOpen,
  onPoint,
}: {
  hit: Hit;
  at: number;
  active: boolean;
  levels: Level[];
  from: string;
  onOpen: (hit: Hit, event: MouseEvent) => void;
  onPoint: (at: number) => void;
}) {
  const shown = hit.levels?.split(' ') ?? [];
  return (
    <div id={hitId(at)} role="option" aria-selected={active} className={active ? 'hit on' : 'hit'} onMouseMove={() => onPoint(at)}>
      <a
        href={hrefTo(from, hit.url) + formatHash(hit.level, hit.headingId)}
        tabIndex={-1}
        // The field keeps the focus, so the arrow keys and Enter still work after a click.
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => onOpen(hit, event)}
      >
        <span className="hl">
          {levels.map((level, stop) =>
            shown.includes(level.id) ? (
              <span key={level.id} className="lv" style={{ color: colorOf(stop) }}>
                <LevelIcon level={level} />
              </span>
            ) : null,
          )}
          <span className="ht">{hit.title}</span>
          {hit.heading && <span className="hh">{hit.heading}</span>}
        </span>
        <Snippet hit={hit} />
      </a>
    </div>
  );
}

/**
 * The search box: a field and the hits under it. The box opens at `from`, the button or the page that had the focus,
 * and gives the focus back to it on a close. A hit on the open page moves its level and its block, and a hit on
 * another page opens it with the hit kept for that page.
 */
export function SearchBox({
  page,
  from,
  onClose,
  onHere,
}: {
  page: SearchFrom;
  /** The element that had the focus when the box opened. */
  from: Element | null;
  onClose: () => void;
  /** Runs before a hit on the open page moves the text, so a layer over the text can close. */
  onHere: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [search, setSearch] = useState<Loaded | null>(null);
  const latest = useRef(page);
  latest.current = page;

  useLayoutEffect(() => {
    dialog.current?.showModal();
    field.current?.focus();
    let live = true;
    loadSearch(page.url).then(
      (found) => {
        if (!live) return;
        setSearch(found);
        setActive(0);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  // The cleanup form, since an effect body would also run on mount and close the box as it opens.
  useEffect(() => () => dialog.current?.close(), [page.url]);

  function readerOf(found: Loaded): Reader {
    const { url, levels, defaultLevel, dimensions } = latest.current;
    return {
      dimension: currentDimension(dimensions, url)?.folder ?? null,
      levels: levels.map((level) => level.id),
      levelOf(target) {
        if (!levels.length) return null;
        if (target === url) return currentLevel();
        const other = found.pages.get(target);
        return openingLevelFor({ levels, defaultLevel, parts: other?.parts ?? [], hasSharedText: other?.hasSharedText ?? true }, target);
      },
    };
  }

  // Each key in the field updates the hits in the same render, so Enter always opens a hit of the text in the field.
  // On a site with two dimensions or more, the hits of each other dimension sit together under its name, after the
  // hits of the open one.
  const hits = useMemo(() => {
    if (!search) return [];
    const found = search.search.find(text, readerOf(search));
    const { dimensions, url } = latest.current;
    const own = currentDimension(dimensions, url)?.folder ?? null;
    const groupOf = (hit: Hit) => (dimensions.length >= 2 && hit.dimension !== own ? hit.dimension : null);
    const order = [...new Set(found.map(groupOf))].sort((a, b) => Number(a !== null) - Number(b !== null));
    return order.flatMap((group) => found.filter((hit) => groupOf(hit) === group));
  }, [text, search]);

  useLayoutEffect(() => {
    list.current?.querySelector(`#${hitId(active)}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, hits]);

  function close(): void {
    dialog.current?.close();
  }

  /** Opens a hit. A hit on another page goes there with the hit kept, and a hit on this page moves to its block. */
  function open(hit: Hit): void {
    const block = blockOf(hit);
    const { url, levels } = latest.current;
    close();
    if (hit.url !== url) {
      if (block) keepFound({ ...hit, ...block });
      location.assign(hrefTo(url, hit.url) + formatHash(hit.level, hit.headingId));
      return;
    }
    onHere();
    const ids = levels.map((level) => level.id);
    moveLevel(hit.level, () => {
      if (block) showFound({ ...hit, ...block }, ids);
      replaceAddress(location.pathname + location.search + formatHash(hit.level, hit.headingId));
    });
  }

  function onOpen(hit: Hit, event: MouseEvent): void {
    // A click with a key held or with another button keeps what the browser does with a link, such as a new tab.
    if (!isPlainClick(event)) return;
    event.preventDefault();
    open(hit);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!hits.length) return;
      setActive((at) => Math.max(0, Math.min(hits.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[active];
      if (hit) open(hit);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  const own = currentDimension(page.dimensions, page.url)?.folder ?? null;
  const groups: { dimension: string | null; rows: { hit: Hit; at: number }[] }[] = [];
  hits.forEach((hit, at) => {
    const dimension = page.dimensions.length >= 2 && hit.dimension !== own ? hit.dimension : null;
    const last = groups.at(-1);
    if (last && last.dimension === dimension) last.rows.push({ hit, at });
    else groups.push({ dimension, rows: [{ hit, at }] });
  });
  const row = ({ hit, at }: { hit: Hit; at: number }) => (
    <HitRow
      key={at}
      hit={hit}
      at={at}
      active={at === active}
      levels={page.levels}
      from={page.url}
      onOpen={onOpen}
      onPoint={setActive}
    />
  );
  const nameOf = (folder: string) => page.dimensions.find((dimension) => dimension.folder === folder)?.name ?? folder;

  return (
    <dialog
      id="nd-search"
      ref={dialog}
      aria-label="Search"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onClose={() => {
        // A hit on the open page can close the layer that held the button, and the focus then leaves the box.
        const shown = from instanceof HTMLElement && from.isConnected && from !== document.body && from.getClientRects().length > 0;
        if (shown) from.focus({ preventScroll: true });
        else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        onClose();
      }}
    >
      <div className="set">
        <div className="find">
          <Icon name="search" />
          <input
            ref={field}
            id="nd-search-field"
            type="search"
            role="combobox"
            aria-label="Search"
            aria-controls="nd-hits"
            aria-expanded={hits.length > 0}
            aria-autocomplete="list"
            aria-activedescendant={hits.length ? hitId(active) : undefined}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            value={text}
            onChange={(event) => {
              // The first hit is active after each change of the hits.
              setText(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
          />
          <button id="nd-search-close" type="button" className="ib" aria-label="Close search" title="Close search" onClick={close}>
            <Icon name="close" />
          </button>
        </div>
        <div id="nd-hits" ref={list} role="listbox" hidden={!hits.length}>
          {groups.map((group, n) =>
            group.dimension === null ? (
              group.rows.map(row)
            ) : (
              <div key={group.dimension} role="group" aria-labelledby={`nd-dim-${n}`}>
                <div id={`nd-dim-${n}`} className="hd" role="presentation">
                  {nameOf(group.dimension)}
                </div>
                {group.rows.map(row)}
              </div>
            ),
          )}
        </div>
      </div>
    </dialog>
  );
}
