/** @jsxImportSource react */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { hrefTo } from '../site/urls.ts';
import { THEMES } from '../themes/index.ts';
import type { Theme } from '../themes/types.ts';
import { Icon, type IconName } from './icons.tsx';
import { PHONE } from './panel-state.ts';
import { keepPlace } from './place-hold.ts';
import { DARK_QUERY, lookOf, pickLook, pickTheme, shownTheme, storedLook, type LookSetting } from './theme-memory.ts';
import { PREVIEW_HEIGHT, PREVIEW_URL, PREVIEW_WIDTH } from './theme-preview.ts';
import { fitCharWidth } from './width-page.ts';

/** The themes whose name holds the typed text, in any case, in the order of `THEMES`. */
export function themesMatching(text: string): Theme[] {
  const wanted = text.toLowerCase();
  return THEMES.filter((theme) => theme.name.toLowerCase().includes(wanted));
}

const rowId = (id: string) => `theme-opt-${id}`;

/** The buttons of the look switch, in order. */
const LOOKS: { look: LookSetting; name: string; icon: IconName }[] = [
  { look: 'light', name: 'Light', icon: 'sun' },
  { look: 'dark', name: 'Dark', icon: 'moon' },
  { look: 'system', name: 'System', icon: 'monitor' },
];

/**
 * The box of themes: a search and a list on the left, and on the right the look switch over the preview page of the
 * selected theme. Each chip of the list paints in its own theme, through the tokens of `.sw [data-theme]`. The page
 * behind the box changes only on Apply. The box stays in the page after its first open, so its frame loads once. A
 * change of the selected theme or of the look changes only the hash of the frame.
 */
export function ThemeBox({
  from,
  url,
  onClose,
}: {
  /** The button that opened the box, or null while the box is closed. */
  from: HTMLElement | null;
  /** The address of the page. A page move closes the box. */
  url: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const loaded = useRef(false);
  const opener = useRef(from);
  const [current, setCurrent] = useState(shownTheme);
  const [selected, setSelected] = useState(shownTheme);
  const [look, setLook] = useState(storedLook);
  const [text, setText] = useState('');
  // The computer's look, kept in the state so the chips draw again when it changes.
  const [, setComputer] = useState(() => lookOf('system'));
  const shown = themesMatching(text);
  const preview = hrefTo(url, PREVIEW_URL);
  const mode = lookOf(look);
  // The latest choice, for the listener of the computer's look.
  const choice = useRef({ selected, look });
  choice.current = { selected, look };

  /** Shows a theme in a look in the frame and in the chips. */
  function show(id: string, setting: LookSetting): void {
    // `replace` keeps the reader's Back button for the page: a new `src` alone would add a step for each change.
    const hash = `${id}/${lookOf(setting)}`;
    if (loaded.current) frame.current?.contentWindow?.location.replace(`${new URL(preview, location.href).href}#${hash}`);
    setSelected(id);
    setLook(setting);
  }

  /** The box closes first, so the page under it shows the text that the place hold looks for. */
  function apply(): void {
    dialog.current?.close();
    keepPlace(() => {
      pickTheme(selected);
      pickLook(look);
      fitCharWidth();
    });
  }

  // Each open starts at the theme and the look setting that the page has. A close empties the search, so each open
  // lists every theme.
  useLayoutEffect(() => {
    if (!from) return;
    opener.current = from;
    const theme = shownTheme();
    setCurrent(theme);
    show(theme, storedLook());
    dialog.current?.showModal();
    search.current?.focus();
    document.getElementById(rowId(theme))?.scrollIntoView({ block: 'nearest' });
  }, [from]);

  // With 'System' in the switch, the preview and the chips follow the computer's look while the box is open.
  useEffect(() => {
    if (!from) return;
    const query = matchMedia(DARK_QUERY);
    const onChange = () => {
      setComputer(lookOf('system'));
      const { selected: id, look: setting } = choice.current;
      if (setting === 'system') show(id, setting);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [from]);

  // The cleanup form, since an effect body would also run on mount and close the box as it opens.
  useEffect(() => () => dialog.current?.close(), [url]);

  // The frame keeps the size of a wide window, and the scale `--s` makes it fill the width of its part. On a phone
  // the part is as tall as the scaled frame, up to half the screen, so the list keeps room on a phone on its side.
  // The box is watched, not the part, since the height of the part follows the scale.
  useLayoutEffect(() => {
    const part = view.current;
    if (!part || !dialog.current) return;
    const observer = new ResizeObserver(() => {
      const width = part.clientWidth;
      if (!width) return;
      const fit = width / PREVIEW_WIDTH;
      const scale = matchMedia(PHONE).matches ? Math.min(fit, innerHeight / 2 / PREVIEW_HEIGHT) : fit;
      part.style.setProperty('--s', String(scale));
    });
    observer.observe(dialog.current);
    return () => observer.disconnect();
  }, []);

  function onSearch(next: string): void {
    setText(next);
    const matches = themesMatching(next);
    if (matches.length && !matches.some((theme) => theme.id === selected)) show(matches[0]!.id, look);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const at = shown.findIndex((theme) => theme.id === selected);
      const next = shown[Math.max(0, Math.min(shown.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (!next) return;
      show(next.id, look);
      document.getElementById(rowId(next.id))?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      apply();
    }
  }

  // The arrow keys move the check of the look switch, as in any group of radio buttons.
  function onLookKey(event: KeyboardEvent<HTMLDivElement>): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const at = LOOKS.findIndex((each) => each.look === look);
    const next = LOOKS[(at + step + LOOKS.length) % LOOKS.length]!;
    show(selected, next.look);
    event.currentTarget.querySelector<HTMLElement>(`[data-look="${next.look}"]`)?.focus();
  }

  const selectedShown = shown.some((theme) => theme.id === selected);

  return (
    <dialog
      id="theme-box"
      ref={dialog}
      aria-label="Themes"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      onClose={() => {
        setText('');
        if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
        onClose();
      }}
    >
      <div className="set">
        <div className="pick">
          <label className="find">
            <Icon name="search" />
            <input
              ref={search}
              type="search"
              id="theme-search"
              aria-label="Search themes"
              placeholder="Search"
              autoComplete="off"
              spellCheck={false}
              aria-controls="theme-list"
              aria-activedescendant={selectedShown ? rowId(selected) : undefined}
              value={text}
              onChange={(event) => onSearch(event.target.value)}
              onKeyDown={onKey}
            />
          </label>
          <ul id="theme-list" className="sw" role="listbox" aria-label="Themes">
            {shown.map((theme) => (
              <li
                key={theme.id}
                id={rowId(theme.id)}
                role="option"
                aria-selected={theme.id === selected}
                data-id={theme.id}
                className={theme.id === selected ? 'on' : undefined}
                // The search keeps the focus, so the arrow keys and Enter still work after a click.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => show(theme.id, look)}
              >
                <span className="chip" data-theme={theme.id} data-mode={mode} aria-hidden="true">
                  <span className="aa">Aa</span>
                  <span className="dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
                <span className="nm">{theme.name}</span>
                {theme.id === current && <Icon name="check" />}
              </li>
            ))}
          </ul>
        </div>
        <div className="mode">
          <div id="theme-mode" role="radiogroup" aria-label="Look" onKeyDown={onLookKey}>
            {LOOKS.map((each) => (
              <button
                key={each.look}
                type="button"
                role="radio"
                aria-checked={each.look === look}
                tabIndex={each.look === look ? 0 : -1}
                data-look={each.look}
                onClick={() => show(selected, each.look)}
              >
                <Icon name={each.icon} />
                {each.name}
              </button>
            ))}
          </div>
        </div>
        <div className="view" ref={view}>
          <iframe
            id="theme-preview"
            ref={frame}
            title="Theme preview"
            tabIndex={-1}
            src={`${preview}#${selected}/${mode}`}
            onLoad={() => (loaded.current = true)}
          />
        </div>
        <div className="foot">
          <button type="button" id="theme-cancel" className="no" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="button" id="theme-apply" className="yes" onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </dialog>
  );
}
