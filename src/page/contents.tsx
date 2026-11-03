/** @jsxImportSource react */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_TEXT_WIDTH, type ConfigProblem } from '../site/config.ts';
import type { TreeNode } from '../site/scan.ts';
import { hrefTo } from '../site/urls.ts';
import type { PageLevels, PageView } from '../site/view.ts';
import { ChangePagesModal } from './change-pages-modal.tsx';
import { ConfigModal } from './config-modal.tsx';
import { DefaultsBox } from './defaults-box.tsx';
import { Icon, type IconName } from './icons.tsx';
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
import { startLive } from './live.ts';
import {
  PHONE,
  readPanelOff,
  readPanelScroll,
  readShut,
  sectionsAround,
  writePanelOff,
  writePanelScroll,
  writeShut,
} from './panel-state.ts';
import { keepPlace } from './place-hold.ts';
import { ReadTimeBox } from './read-time-box.tsx';
import { TextWidth, WidthButton } from './ruler.tsx';
import { Bar, type OnDefault } from './slider.tsx';
import { ThemeBox } from './theme-box.tsx';
import { DARK_QUERY, MODE_KEY, showStoredLook, showStoredTheme, THEME_KEY } from './theme-memory.ts';
import { fitCharWidth } from './width-page.ts';

export interface ContentsData extends PageLevels, Pick<PageView, 'readTimes' | 'textWidth'> {
  url: string;
  rev: string;
  siteName: string;
  tree: TreeNode[];
  /** True only when the command serves the page. */
  live: boolean;
  configProblem: ConfigProblem | null;
}

/** A theme that another page stored, with the character width of its font. */
function showOutsideTheme(): void {
  keepPlace(() => {
    showStoredTheme();
    fitCharWidth();
  });
}

function showPanelState(off: boolean): void {
  if (off) document.documentElement.setAttribute('data-panel', 'off');
  else document.documentElement.removeAttribute('data-panel');
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
  onClick,
}: {
  id: string;
  label: string;
  icon: IconName;
  opensDialog?: boolean;
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
      onClick={(event) => onClick(event.currentTarget)}
    >
      <Icon name={icon} />
    </button>
  );
}

function Nodes({
  nodes,
  url,
  shut,
  toggle,
  hidden,
}: {
  nodes: TreeNode[];
  url: string;
  shut: string[];
  toggle: (id: string) => void;
  hidden?: boolean;
}) {
  return (
    <ul hidden={hidden}>
      {nodes.map((node) => {
        if (node.kind === 'page') {
          const current = node.url === url;
          return (
            <li key={node.url} className="pg">
              <div className={current ? 'lr on' : 'lr'}>
                <span className="nochev" />
                <a
                  className="leaf"
                  href={hrefTo(url, node.url)}
                  aria-current={current ? 'page' : undefined}
                >
                  {node.title}
                </a>
              </div>
            </li>
          );
        }
        const isShut = shut.includes(node.id);
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
            </button>
            <Nodes nodes={node.children} url={url} shut={shut} toggle={toggle} hidden={isShut} />
          </li>
        );
      })}
    </ul>
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

  // The current row stays in view.
  useLayoutEffect(() => {
    const box = scroller.current;
    const row = box?.querySelector('[aria-current="page"]');
    if (!box || !row) return;
    const rowRect = row.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    if (rowRect.top < boxRect.top) box.scrollTop -= boxRect.top - rowRect.top;
    else if (rowRect.bottom > boxRect.bottom) box.scrollTop += rowRect.bottom - boxRect.bottom;
  }, [data.url, menuOpen]);

  // React hydrates with the server's level, and the head script has already moved the text.
  useLayoutEffect(() => {
    setReaderDefault(readDefaultLevel());
    if (data.levels.length) document.getElementById('page')?.classList.toggle('samemarks', sameMarks(data, currentLevel()));
  }, []);

  useEffect(() => {
    if (initial.live) return startLive(initial, setData);
  }, [initial]);

  // A page restored from the back/forward cache missed what other pages stored.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      showOutsideTheme();
      showStoredLook();
      setReaderDefault(readDefaultLevel());
      const page = latest.current;
      if (page.levels.length) moveOpenPage(page, openingLevelFor(page, page.url));
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
      if (event.key === MODE_KEY || event.key === null) showStoredLook();
    };
    addEventListener('storage', onStorage);
    return () => removeEventListener('storage', onStorage);
  }, []);

  // With the look setting 'system', a change of the computer's look shows at once.
  useEffect(() => {
    const dark = matchMedia(DARK_QUERY);
    dark.addEventListener('change', showStoredLook);
    return () => dark.removeEventListener('change', showStoredLook);
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

  useEffect(() => {
    if (focusNext.current) document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  function openThemeBox(from: HTMLElement): void {
    setThemeBoxMade(true);
    setThemeFrom(from);
  }

  function closeMenu(): void {
    focusNext.current = 'menuB';
    setMenuOpen(false);
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

  const listed = (id: string | null) => data.levels.some((level) => level.id === id);
  const shownDefault = listed(readerDefault) ? readerDefault! : listed(data.defaultLevel) ? data.defaultLevel : data.levels[0]?.id;

  return (
    <>
      <nav id="panel" aria-label="Contents" className={menuOpen ? 'menu' : undefined}>
        <div className="p-head">
          <b>{data.siteName}</b>
          <IconButton
            id="closeP"
            label="Hide contents"
            icon="panel"
            onClick={() => (matchMedia(PHONE).matches ? closeMenu() : changePanel(true))}
          />
        </div>
        <div className="p-scroll" id="tree" ref={scroller}>
          <Nodes nodes={data.tree} url={data.url} shut={shut} toggle={toggle} />
        </div>
        <div className="p-foot">
          {data.levels.length > 0 && <IconButton id="dfl2" label="Defaults" icon="knobs" onClick={setDefaultsFrom} />}
          <IconButton id="thm2" label="Themes" icon="contrast" opensDialog onClick={openThemeBox} />
        </div>
      </nav>
      <div id="rail">
        <IconButton id="openP" label="Show contents" icon="panel" onClick={() => changePanel(false)} />
      </div>
      <Bar
        page={data}
        inert={menuOpen}
        panelOff={panelOff}
        menu={<IconButton id="menuB" label="Contents" icon="menu" onClick={openMenu} />}
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
      {data.configProblem && <ConfigModal key={data.configProblem} problem={data.configProblem} />}
    </>
  );
}
