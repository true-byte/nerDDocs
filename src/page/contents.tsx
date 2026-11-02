/** @jsxImportSource react */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ConfigProblem } from '../site/config.ts';
import type { TreeNode } from '../site/scan.ts';
import { hrefTo } from '../site/urls.ts';
import type { PageLevels, PageView } from '../site/view.ts';
import { ConfigModal } from './config-modal.tsx';
import { Icon } from './icons.tsx';
import { isFlat } from './levels.ts';
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
import { ReadTimeBox } from './read-time-box.tsx';
import { Bar } from './slider.tsx';

export interface ContentsData extends PageLevels, Pick<PageView, 'readTimes'> {
  url: string;
  rev: string;
  siteName: string;
  tree: TreeNode[];
  /** True only when the command serves the page. */
  live: boolean;
  configProblem: ConfigProblem | null;
}

function showPanelState(off: boolean): void {
  if (off) document.documentElement.setAttribute('data-panel', 'off');
  else document.documentElement.removeAttribute('data-panel');
}

function IconButton({
  id,
  label,
  icon,
  onClick,
}: {
  id: string;
  label: string;
  icon: 'panel' | 'menu';
  onClick: () => void;
}) {
  return (
    <button id={id} className="ib" type="button" aria-label={label} title={label} onClick={onClick}>
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
  const focusNext = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (initial.live) return startLive(initial, setData);
  }, [initial]);

  // The text behind the open layer takes no focus, and a wide window has no layer.
  useEffect(() => {
    document.querySelector('main')?.toggleAttribute('inert', menuOpen);
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
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
    showPanelState(off);
    setPanelOff(off);
  }

  function toggle(id: string): void {
    setShut((list) => {
      const next = list.includes(id) ? list.filter((other) => other !== id) : [...list, id];
      writeShut(next);
      return next;
    });
  }

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
      {data.configProblem && <ConfigModal key={data.configProblem} problem={data.configProblem} />}
    </>
  );
}
