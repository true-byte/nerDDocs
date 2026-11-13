/** @jsxImportSource react */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as LinkClick,
} from 'react';
import { flushSync } from 'react-dom';
import type { OutlineRow } from '../markdown/render.ts';
import { DEFAULT_TEXT_WIDTH, type ConfigProblem, type Dimension } from '../site/config.ts';
import type { TreeNode } from '../site/scan.ts';
import { encodeUrl, hrefTo } from '../site/urls.ts';
import type { PageLevels, PageView } from '../site/view.ts';
import { formatHash } from './address.ts';
import { ChangePagesModal } from './change-pages-modal.tsx';
import { ConfigModal } from './config-modal.tsx';
import { DefaultsBox } from './defaults-box.tsx';
import { setHollowPage, startHollow } from './hollow-icons.ts';
import {
  currentDimension,
  dimensionNodes,
  dimensionPages,
  dimensionTarget,
  pagesOf,
  readLastPages,
  writeLastPage,
} from './dimensions.ts';
import { Icon, type IconName } from './icons.tsx';
import { LinkButton } from './copy-link.tsx';
import { onLevelMove, replaceAddress, setAddressPage, showLinkLevels } from './level-address.ts';
import { changeLevel, currentLevel, jumpToLevel } from './level-change.ts';
import {
  changedPages,
  DEFAULT_KEY,
  landingLevel,
  openingLevelFor,
  readDefaultLevel,
  readKeptLevels,
  writeDefaultLevel,
  writeKeptLevels,
  type ChangedPage,
} from './level-memory.ts';
import { colorOf, isFlat, sameMarks } from './levels.ts';
import { startLive, type SavedPages } from './live.ts';
import { markOutline, outlineLevels, outlineOf, rowClicked, showBoldRow } from './outline.ts';
import {
  OUTLINE_COLUMN,
  PHONE,
  readPanelOff,
  readPanelScroll,
  readShut,
  sectionsAround,
  writeOutlineOff,
  writePanelOff,
  writePanelScroll,
  writeShut,
} from './panel-state.ts';
import { keepPlace } from './place-hold.ts';
import { ReadTimeBox } from './read-time-box.tsx';
import { TextWidth, WidthButton } from './ruler.tsx';
import { SearchBox, searchFileChanged } from './search-box.tsx';
import { Bar, type OnDefault } from './slider.tsx';
import { ThemeBox } from './theme-box.tsx';
import { DARK_QUERY, lookOf, MODE_KEY, showStoredLook, showStoredTheme, storedLook, THEME_KEY } from './theme-memory.ts';
import { fitCharWidth } from './width-page.ts';

export interface ContentsData
  extends PageLevels,
    Pick<
      PageView,
      'readTimes' | 'textWidth' | 'diagrams' | 'dimensions' | 'anchors' | 'linkLevels' | 'linkTargets' | 'neighbors'
    > {
  url: string;
  rev: string;
  siteName: string;
  tree: TreeNode[];
  /** True only when the command serves the page. */
  live: boolean;
  configProblem: ConfigProblem | null;
  /** Only in the author browser. */
  author?: AuthorData;
}

/** What the author browser knows besides the page. */
export interface AuthorData {
  /** The addresses of the pages that changed since the author last opened them, in tree order. */
  unseen: string[];
}

/** A theme that another page stored, with the character width of its font. */
function showOutsideTheme(): void {
  keepPlace(() => {
    showStoredTheme();
    fitCharWidth();
  });
}

/**
 * A look that another page stored or that the computer changed, with the reader's place held, since the light and
 * dark copies of an image can differ in size.
 */
function showOutsideLook(): void {
  if (document.documentElement.getAttribute('data-mode') === lookOf(storedLook())) return;
  keepPlace(showStoredLook);
}

function showPanelState(off: boolean): void {
  if (off) document.documentElement.setAttribute('data-panel', 'off');
  else document.documentElement.removeAttribute('data-panel');
}

function showOutlineState(off: boolean): void {
  if (off) document.documentElement.setAttribute('data-outline', 'off');
  else document.documentElement.removeAttribute('data-outline');
}

/** Moves the open page with its place held. A page with no parts has no text to move. */
function moveOpenPage(page: ContentsData, to: string): void {
  if (to === currentLevel()) return;
  if (isFlat(page)) {
    jumpToLevel(to);
    return;
  }
  const stop = page.levels.findIndex((level) => level.id === to);
  changeLevel({ to, color: colorOf(stop), sameMarks: sameMarks(page, to) });
}

function IconButton({
  id,
  label,
  icon,
  opensDialog,
  shows,
  onClick,
}: {
  id: string;
  label: string;
  icon: IconName;
  opensDialog?: boolean;
  /** The levels at which the button shows, as `data-shows` writes them. With none, it shows at every level. */
  shows?: string;
  onClick: (from: HTMLElement) => void;
}) {
  return (
    <button
      id={id}
      className="ib"
      type="button"
      aria-label={label}
      title={label}
      aria-haspopup={opensDialog ? 'dialog' : undefined}
      data-shows={shows}
      onClick={(event) => onClick(event.currentTarget)}
    >
      <Icon name={icon} />
    </button>
  );
}

/** A click with a key held or with another button keeps what the browser does with a link. */
const isPlainClick = (event: LinkClick) =>
  event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

type OnRow = (event: LinkClick, id: string) => void;

/** The dot at the end of a row of a page that changed since the author last opened it. */
const UnseenDot = () => <span className="unseen" aria-hidden="true" />;

/** True when a page of the nodes, or the page of a folder in them, is in `unseen`. */
const holdsUnseen = (nodes: readonly TreeNode[], unseen: ReadonlySet<string>) =>
  unseen.size > 0 && pagesOf(nodes).some((page) => unseen.has(page.url));

/** The rows of the outline of the open page. A row below the highest rank of the outline sits one step further in. */
function OutlineRows({ rows, onRow }: { rows: OutlineRow[]; onRow: OnRow }) {
  const top = Math.min(...rows.map((row) => row.rank));
  return (
    <ul className="ol">
      {rows.map((row) => (
        <li key={row.id} className={row.rank > top ? 'r2' : undefined} data-shows={row.shows ?? undefined}>
          <a className="oln" href={`#${row.id}`} onClick={(event) => onRow(event, row.id)}>
            {row.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The name of a page row, which opens the page. The name of the open page goes to the top of the page. */
function RowLink({
  to,
  url,
  title,
  onPageRow,
}: {
  to: string;
  url: string;
  title: string;
  onPageRow: (event: LinkClick) => void;
}) {
  const current = to === url;
  return (
    <a
      className="leaf"
      href={hrefTo(url, to)}
      aria-current={current ? 'page' : undefined}
      onClick={current ? onPageRow : undefined}
    >
      {title}
    </a>
  );
}

function Nodes({
  nodes,
  url,
  shut,
  toggle,
  onPageRow,
  hidden,
  unseen,
}: {
  nodes: TreeNode[];
  url: string;
  shut: string[];
  toggle: (id: string) => void;
  onPageRow: (event: LinkClick) => void;
  hidden?: boolean;
  /** In the author browser: the pages whose rows show a dot, without the open page. */
  unseen: ReadonlySet<string>;
}) {
  return (
    <ul hidden={hidden}>
      {nodes.map((node) => {
        if (node.kind === 'page') {
          return (
            <li key={node.url} className="pg">
              <div className={node.url === url ? 'lr on' : 'lr'}>
                <span className="nochev" />
                <RowLink to={node.url} url={url} title={node.title} onPageRow={onPageRow} />
                {unseen.has(node.url) && <UnseenDot />}
              </div>
            </li>
          );
        }
        const isShut = shut.includes(node.id);
        const rows = (
          <Nodes
            nodes={node.children}
            url={url}
            shut={shut}
            toggle={toggle}
            onPageRow={onPageRow}
            hidden={isShut}
            unseen={unseen}
          />
        );
        const shutUnseen = isShut && holdsUnseen(node.children, unseen);
        // A folder with a page is one row: its name opens the page, and its arrow shows or hides the rows under it.
        if (node.url) {
          return (
            <li key={node.id} className="sec tp" data-section={node.id}>
              <div className={node.url === url ? 'lr on' : 'lr'}>
                <span className="nochev">
                  <button
                    type="button"
                    className={isShut ? 'fold shut' : 'fold'}
                    aria-label="Subtopics"
                    title="Subtopics"
                    aria-expanded={!isShut}
                    onClick={() => toggle(node.id)}
                  >
                    <span className="chev">
                      <Icon name="chev" />
                    </span>
                  </button>
                </span>
                <RowLink to={node.url} url={url} title={node.title} onPageRow={onPageRow} />
                {(unseen.has(node.url) || shutUnseen) && <UnseenDot />}
              </div>
              {rows}
            </li>
          );
        }
        return (
          <li key={node.id} className="sec" data-section={node.id}>
            <button
              type="button"
              className={isShut ? 'topic shut' : 'topic'}
              aria-expanded={!isShut}
              onClick={() => toggle(node.id)}
            >
              <span className="chev">
                <Icon name="chev" />
              </span>
              {node.title}
              {shutUnseen && <UnseenDot />}
            </button>
            {rows}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The headings of the open page: a column on the right of a wide window, and a layer from the bar on a narrow one. At
 * a level where none of its rows shows, the level rule hides it.
 */
function Outline({
  rows,
  shows,
  open,
  onRow,
  onClose,
  onHide,
}: {
  rows: OutlineRow[];
  shows: string | undefined;
  open: boolean;
  onRow: OnRow;
  onClose: () => void;
  onHide: () => void;
}) {
  return (
    <aside id="toc" aria-label="Outline" className={open ? 'open' : undefined} data-shows={shows}>
      <div className="t-head">
        <IconButton id="closeT" label="Close outline" icon="close" onClick={onClose} />
        <IconButton id="hideT" label="Hide outline" icon="panelRight" onClick={onHide} />
      </div>
      <div className="t-scroll" id="tocS">
        <OutlineRows rows={rows} onRow={onRow} />
      </div>
    </aside>
  );
}

/** The keys that move the focus in the list of dimensions, and their step. */
const DIMENSION_STEPS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

/** The button of the current dimension, and the list that opens a page of each dimension. */
function DimensionPicker({
  dimensions,
  current,
  tree,
  url,
  unseen,
}: {
  dimensions: Dimension[];
  current: Dimension;
  tree: TreeNode[];
  url: string;
  unseen: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  // The server and the hydration know no stored page, so their links match. Each open of the list reads them.
  const [stored, setStored] = useState<Record<string, string>>({});
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // The open page is the last page of its dimension. A 404 address stores nothing.
  useEffect(() => {
    if (dimensionPages(tree, current.folder).includes(url)) writeLastPage(current.folder, url);
  }, [url, current.folder]);

  useLayoutEffect(() => {
    if (open) box.current?.querySelector<HTMLElement>('#dimL a[aria-current]')?.focus();
  }, [open]);

  // A click outside the button and the list closes the list, and the focus stays where it is.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Node && box.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [open]);

  function close(): void {
    button.current?.focus();
    setOpen(false);
  }

  function toggle(): void {
    if (open) {
      setOpen(false);
      return;
    }
    setStored(readLastPages());
    setOpen(true);
  }

  // The phone menu stays open on Esc, so the key stops here.
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    const step = DIMENSION_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const links = [...event.currentTarget.querySelectorAll<HTMLElement>('#dimL a')];
    const at = links.indexOf(document.activeElement as HTMLElement);
    const next = at < 0 ? (step > 0 ? 0 : links.length - 1) : (at + step + links.length) % links.length;
    links[next]?.focus();
  }

  // Focus that leaves for another place on the page closes the list. Focus that leaves the window keeps it.
  function onBlur(event: ReactFocusEvent<HTMLDivElement>): void {
    const to = event.relatedTarget;
    if (to instanceof Node && !event.currentTarget.contains(to)) setOpen(false);
  }

  function onPick(event: LinkClick, isCurrent: boolean): void {
    if (!isPlainClick(event)) return;
    if (!isCurrent) {
      setOpen(false);
      return;
    }
    event.preventDefault();
    close();
  }

  return (
    <div id="dims" ref={box} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        type="button"
        id="dimB"
        className="dim-btn"
        ref={button}
        aria-expanded={open}
        aria-controls="dimL"
        onClick={toggle}
      >
        <span className="dn">{current.name}</span>
        <Icon name="updown" />
      </button>
      <ul id="dimL" className="dim-pop" aria-label="Dimensions" hidden={!open}>
        {dimensions.map((dimension) => {
          const isCurrent = dimension.folder === current.folder;
          const target = isCurrent ? url : (dimensionTarget(tree, dimension.folder, stored) ?? `/${dimension.folder}/`);
          return (
            <li key={dimension.folder}>
              <a
                className={isCurrent ? 'dim on' : 'dim'}
                href={hrefTo(url, target)}
                aria-current={isCurrent ? 'true' : undefined}
                onClick={(event) => onPick(event, isCurrent)}
              >
                <Icon name="check" />
                <span className="dn">{dimension.name}</span>
                {dimensionPages(tree, dimension.folder).some((page) => unseen.has(page)) && <UnseenDot />}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The contents panel, the button that brings it back, and the menu button on a phone. */
export function Contents({ initial }: { initial: ContentsData }) {
  const [data, setData] = useState(initial);
  const [shut, setShut] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOff, setPanelOff] = useState(false);
  const [timeFrom, setTimeFrom] = useState<HTMLElement | null>(null);
  const [defaultsFrom, setDefaultsFrom] = useState<HTMLElement | null>(null);
  const [themeFrom, setThemeFrom] = useState<HTMLElement | null>(null);
  const [widthFrom, setWidthFrom] = useState<HTMLElement | null>(null);
  const [rulerOn, setRulerOn] = useState(false);
  // The theme box stays in the page after its first open, so its preview loads once.
  const [themeBoxMade, setThemeBoxMade] = useState(false);
  const [readerDefault, setReaderDefault] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ rows: ChangedPage[]; apply: () => void; back: () => void } | null>(null);
  const [outsideMoves, setOutsideMoves] = useState(0);
  // In the author browser: the pages that changed since the author last opened them.
  const [unseen, setUnseen] = useState(initial.author?.unseen ?? []);
  // The layer of the outline on a narrow window. A wide window shows the column and has no layer.
  const [outlineOpen, setOutlineOpen] = useState(false);
  // The search box, with the element that had the focus when it opened. Each open makes a new box, so an open
  // during the close of the box before it still opens.
  const [searchFrom, setSearchFrom] = useState<{ from: Element | null; n: number } | null>(null);
  const searchOpens = useRef(0);
  const focusNext = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const latest = useRef(data);
  latest.current = data;

  // Before the first paint of the hydrated panel. The server always renders it open.
  useLayoutEffect(() => {
    setShut(readShut());
    const off = readPanelOff();
    showPanelState(off);
    setPanelOff(off);
    if (scroller.current) scroller.current.scrollTop = readPanelScroll();
    const save = () => writePanelScroll(scroller.current?.scrollTop ?? 0);
    addEventListener('pagehide', save);
    return () => removeEventListener('pagehide', save);
  }, []);

  // The sections around the current page open, so its mark shows. A save that keeps the
  // address leaves them as the reader set them.
  useLayoutEffect(() => {
    const around = sectionsAround(data.tree, data.url);
    setShut((list) => {
      const next = list.filter((id) => !around.includes(id));
      if (next.length !== list.length) writeShut(next);
      return next.length === list.length ? list : next;
    });
    document.getElementById('nd-shut')?.remove();
  }, [data.url]);

  // The current row stays in view. The phone menu opens with it at the top.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const boxRect = box.getBoundingClientRect();
    if (menuOpen && matchMedia(PHONE).matches) {
      const pageRow = box.querySelector('.lr.on');
      if (pageRow) box.scrollTop += pageRow.getBoundingClientRect().top - boxRect.top;
      return;
    }
    const row = box.querySelector('[aria-current="page"]');
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < boxRect.top) box.scrollTop -= boxRect.top - rowRect.top;
    else if (rowRect.bottom > boxRect.bottom) box.scrollTop += rowRect.bottom - boxRect.bottom;
  }, [data.url, menuOpen]);

  // React draws the rows, and the page script marks the bold one, also after a live update.
  useLayoutEffect(() => {
    markOutline();
  }, [data.tree, data.url]);

  // The layer opens with the bold row in view.
  useLayoutEffect(() => {
    if (outlineOpen) showBoldRow();
  }, [outlineOpen]);

  // A live update that takes away every heading of the open page takes away the layer.
  useEffect(() => {
    if (!outlineOf(data.tree, data.url).length) setOutlineOpen(false);
  }, [data.tree, data.url]);

  // React hydrates with the server's level, and the head script has already moved the text.
  useLayoutEffect(() => {
    setReaderDefault(readDefaultLevel());
    if (data.levels.length) document.getElementById('page')?.classList.toggle('samemarks', sameMarks(data, currentLevel()));
  }, []);

  useEffect(() => {
    if (!initial.live) return;
    // Each update can follow a save of the text, so the next open of the search box loads the search file again.
    return startLive(
      initial,
      (next) => {
        searchFileChanged();
        setData(next);
      },
      searchFileChanged,
      onSaved,
    );
  }, [initial]);

  // The author browser shows the dashed icons of the levels that the current level hides.
  useEffect(() => {
    if (initial.author) startHollow(latest.current);
  }, [initial]);

  useLayoutEffect(() => {
    if (initial.author) setHollowPage(data);
  }, [data]);

  // The address writes the level into the hash and marks the links of the text with the levels they open.
  useLayoutEffect(() => setAddressPage(data), [data]);

  // A level move from the address or from a hit moves the slider, as a move from outside it does.
  useEffect(() => onLevelMove(() => setOutsideMoves((count) => count + 1)), []);

  // Ctrl+K and Cmd+K open the search box from anywhere on the page, and never reach the browser.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      event.stopPropagation();
      const field = document.querySelector<HTMLInputElement>('#nd-search[open] #nd-search-field');
      if (field) {
        field.focus();
        field.select();
      } else openSearch(document.activeElement);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  // A page restored from the back/forward cache missed what other pages stored.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      showOutsideTheme();
      showOutsideLook();
      setReaderDefault(readDefaultLevel());
      const page = latest.current;
      if (page.levels.length) moveOpenPage(page, openingLevelFor(page, page.url));
      showLinkLevels();
      setOutsideMoves((count) => count + 1);
    };
    addEventListener('pageshow', onShow);
    return () => removeEventListener('pageshow', onShow);
  }, []);

  // A default set in another tab. The open page moves only on a page open or a restore. A theme and a look show at once.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DEFAULT_KEY || event.key === null) setReaderDefault(readDefaultLevel());
      if (event.key === THEME_KEY || event.key === null) showOutsideTheme();
      if (event.key === MODE_KEY || event.key === null) showOutsideLook();
    };
    addEventListener('storage', onStorage);
    return () => removeEventListener('storage', onStorage);
  }, []);

  // With the look setting 'system', a change of the computer's look shows at once.
  useEffect(() => {
    const dark = matchMedia(DARK_QUERY);
    dark.addEventListener('change', showOutsideLook);
    return () => dark.removeEventListener('change', showOutsideLook);
  }, []);

  // A live update can take away the levels.
  useEffect(() => {
    if (data.levels.length) return;
    setDefaultsFrom(null);
    setAsking(null);
  }, [data.levels.length]);

  // The text behind the open layer takes no focus, and a wide window has no layer.
  useEffect(() => {
    document.querySelector('main')?.toggleAttribute('inert', menuOpen);
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      // A box open over the panel takes the key, and focus goes back to its button inside the panel.
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) closeMenu();
    };
    const phone = matchMedia(PHONE);
    const onResize = () => {
      if (!phone.matches) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    phone.addEventListener('change', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      phone.removeEventListener('change', onResize);
    };
  }, [menuOpen]);

  // The button next to the title sits outside this tree, and a live update replaces it.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const button = event.target instanceof Element && event.target.closest<HTMLElement>('#tlB');
      if (button) setTimeFrom(button);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // The layer of the outline closes on Esc, and a window wide enough for the column has no layer.
  useEffect(() => {
    if (!outlineOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) closeOutline();
    };
    const column = matchMedia(OUTLINE_COLUMN);
    const onResize = () => {
      if (column.matches) setOutlineOpen(false);
    };
    document.addEventListener('keydown', onKey);
    column.addEventListener('change', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      column.removeEventListener('change', onResize);
    };
  }, [outlineOpen]);

  useEffect(() => {
    if (focusNext.current) document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  /** A save of one other page opens that page. A save of the open page shows on it, and a save of several stays. */
  function onSaved(saved: SavedPages): void {
    setUnseen(saved.unseen);
    const [page, ...others] = saved.pages;
    if (page && !others.length && page !== latest.current.url) location.assign(encodeUrl(page));
  }

  function openSearch(from: Element | null): void {
    searchOpens.current += 1;
    setSearchFrom({ from, n: searchOpens.current });
  }

  function openThemeBox(from: HTMLElement): void {
    setThemeBoxMade(true);
    setThemeFrom(from);
  }

  function closeMenu(): void {
    focusNext.current = 'menuB';
    setMenuOpen(false);
  }

  /** The menu closes before the jump of a click, so the text under it takes the jump. The focus stays. */
  function closeMenuForJump(): void {
    if (!menuOpen) return;
    document.querySelector('main')?.removeAttribute('inert');
    flushSync(() => setMenuOpen(false));
  }

  function openOutline(): void {
    focusNext.current = 'closeT';
    setOutlineOpen(true);
  }

  function closeOutline(): void {
    focusNext.current = 'tocB';
    setOutlineOpen(false);
  }

  /** The layer closes before the jump of a click, so the text under it takes the jump. The focus stays. */
  function onRow(event: LinkClick, id: string): void {
    if (!isPlainClick(event)) return;
    if (outlineOpen) flushSync(() => setOutlineOpen(false));
    rowClicked(id);
  }

  /** The choice holds on every page. The button that brings the column back takes the focus, and the reverse. */
  function changeOutline(off: boolean): void {
    writeOutlineOff(off);
    keepPlace(() => showOutlineState(off));
    document.getElementById(off ? 'showT' : 'hideT')?.focus();
  }

  /** The current page row goes to the top of the page with no reload. */
  function onPageRow(event: LinkClick): void {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    closeMenuForJump();
    scrollTo(0, 0);
    // A page with parts keeps its level in the hash.
    const level = latest.current.levels.length && !isFlat(latest.current) ? currentLevel() : null;
    const hash = formatHash(level, null);
    if (location.hash !== hash) replaceAddress(location.pathname + location.search + hash);
    rowClicked(null);
  }

  function openMenu(): void {
    focusNext.current = 'closeP';
    setMenuOpen(true);
  }

  function changePanel(off: boolean): void {
    writePanelOff(off);
    focusNext.current = off ? 'openP' : 'closeP';
    // Before the state, since the slider measures its names when the state changes.
    keepPlace(() => showPanelState(off));
    setPanelOff(off);
  }

  function toggle(id: string): void {
    setShut((list) => {
      const next = list.includes(id) ? list.filter((other) => other !== id) : [...list, id];
      writeShut(next);
      return next;
    });
  }

  function applyDefault(level: string): void {
    const page = latest.current;
    writeDefaultLevel(level);
    writeKeptLevels({});
    setReaderDefault(level);
    moveOpenPage(page, landingLevel(page, level));
    showLinkLevels();
  }

  const askDefault: OnDefault = (level, done, back) => {
    const apply = () => {
      applyDefault(level);
      done();
    };
    const rows = changedPages(readKeptLevels(), data.levels, data.tree, level);
    if (rows.length) setAsking({ rows, apply, back });
    else apply();
  };

  const dimension = currentDimension(data.dimensions, data.url);
  const outlineRows = outlineOf(data.tree, data.url);
  const hasOutline = outlineRows.length > 0;
  const outlineShows = outlineLevels(outlineRows, data.levels.map((level) => level.id));
  const listed = (id: string | null) => data.levels.some((level) => level.id === id);
  const shownDefault = listed(readerDefault) ? readerDefault! : listed(data.defaultLevel) ? data.defaultLevel : data.levels[0]?.id;
  const unseenRows = new Set(unseen.filter((page) => page !== data.url));

  return (
    <>
      <nav id="panel" aria-label="Contents" className={menuOpen ? 'menu' : undefined}>
        <div className="p-head">
          <b>{data.siteName}</b>
          <IconButton id="findP" label="Search" icon="search" opensDialog onClick={openSearch} />
          <IconButton
            id="closeP"
            label="Hide contents"
            icon="panel"
            onClick={() => (matchMedia(PHONE).matches ? closeMenu() : changePanel(true))}
          />
        </div>
        {data.dimensions.length >= 2 && (
          <DimensionPicker
            dimensions={data.dimensions}
            current={dimension!}
            tree={data.tree}
            url={data.url}
            unseen={unseenRows}
          />
        )}
        <div className="p-scroll" id="tree" ref={scroller}>
          <Nodes
            nodes={dimension ? dimensionNodes(data.tree, dimension.folder) : data.tree}
            url={data.url}
            shut={shut}
            toggle={toggle}
            onPageRow={onPageRow}
            unseen={unseenRows}
          />
        </div>
        <div className="p-foot">
          {data.levels.length > 0 && <IconButton id="dfl2" label="Defaults" icon="knobs" onClick={setDefaultsFrom} />}
          <IconButton id="thm2" label="Themes" icon="contrast" opensDialog onClick={openThemeBox} />
          <LinkButton id="lnk2" />
        </div>
      </nav>
      {hasOutline && (
        <Outline
          rows={outlineRows}
          shows={outlineShows}
          open={outlineOpen}
          onRow={onRow}
          onClose={closeOutline}
          onHide={() => changeOutline(true)}
        />
      )}
      {hasOutline && (
        <div id="rail-r" data-shows={outlineShows}>
          <IconButton id="showT" label="Show outline" icon="panelRight" onClick={() => changeOutline(false)} />
        </div>
      )}
      <div id="rail">
        <IconButton id="openP" label="Show contents" icon="panel" onClick={() => changePanel(false)} />
        <IconButton id="findR" label="Search" icon="search" opensDialog onClick={openSearch} />
      </div>
      <Bar
        page={data}
        inert={menuOpen}
        panelOff={panelOff}
        menu={
          <>
            <IconButton id="menuB" label="Contents" icon="menu" onClick={openMenu} />
            {hasOutline && <IconButton id="tocB" label="Outline" icon="outline" shows={outlineShows} onClick={openOutline} />}
          </>
        }
        onTime={setTimeFrom}
        onDefaults={setDefaultsFrom}
        onTheme={openThemeBox}
        width={
          <WidthButton
            pressed={rulerOn}
            onClick={(from) => {
              if (rulerOn) setRulerOn(false);
              else setWidthFrom((open) => (open ? null : from));
            }}
          />
        }
        readerDefault={readerDefault}
        outsideMoves={outsideMoves}
        onDefault={askDefault}
      />
      {timeFrom && (
        <ReadTimeBox
          rows={data.readTimes}
          levels={data.levels}
          flat={isFlat(data)}
          from={timeFrom}
          url={data.url}
          onClose={() => setTimeFrom(null)}
        />
      )}
      {defaultsFrom && shownDefault && (
        <DefaultsBox
          levels={data.levels}
          selected={shownDefault}
          from={defaultsFrom}
          url={data.url}
          behindModal={!!asking}
          onPick={(id) => askDefault(id, () => setOutsideMoves((count) => count + 1), () => {})}
          onClose={() => setDefaultsFrom(null)}
        />
      )}
      <TextWidth
        defaultChars={data.textWidth ?? DEFAULT_TEXT_WIDTH}
        url={data.url}
        menuFrom={widthFrom}
        rulerOn={rulerOn}
        onMenuClose={() => setWidthFrom(null)}
        onRuler={setRulerOn}
      />
      {themeBoxMade && <ThemeBox from={themeFrom} url={data.url} onClose={() => setThemeFrom(null)} />}
      {asking && (
        <ChangePagesModal
          rows={asking.rows}
          levels={data.levels}
          url={data.url}
          onCancel={() => {
            setAsking(null);
            asking.back();
          }}
          onChange={() => {
            setAsking(null);
            asking.apply();
          }}
        />
      )}
      {searchFrom && (
        <SearchBox
          key={searchFrom.n}
          page={data}
          from={searchFrom.from}
          onClose={() => setSearchFrom((now) => (now?.n === searchFrom.n ? null : now))}
          onHere={() => {
            closeMenuForJump();
            if (outlineOpen) flushSync(() => setOutlineOpen(false));
          }}
        />
      )}
      {data.configProblem && <ConfigModal key={data.configProblem} problem={data.configProblem} />}
    </>
  );
}
