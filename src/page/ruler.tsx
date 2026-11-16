/** @jsxImportSource react */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Icon } from './icons.tsx';
import { changeRunning } from './level-change.ts';
import { holdForRun, keepPlace, keepPlaceFromBefore, watchPlace } from './place-hold.ts';
import { barTop } from './read-time-box.tsx';
import { boxPlace } from './read-time.ts';
import { keyWidth, pickWidth, shownChars, WIDTH_KEY, type Width } from './text-width.ts';
import {
  fitCharWidth,
  layoutOf,
  nextCharWidth,
  onCharWidth,
  readWidth,
  showCharWidth,
  showWidth,
  writeWidth,
} from './width-page.ts';

const BUTTON_ID = 'widthB';
/** The short ticks of the ruler are 2.5 characters apart from the middle, so each one is 5 characters of width. */
const TICK_CHARS = 2.5;
/** The tall ticks are 12.5 characters apart, so each one is 25 characters of width. */
const TALL_TICK_CHARS = 12.5;
/** The keys that move the focus in the menu, and their step. */
const MENU_STEPS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

function focusButton(): void {
  document.getElementById(BUTTON_ID)?.focus({ preventScroll: true });
}

/** The bar button: it opens the menu while the ruler is hidden, and it closes the ruler while the ruler shows. */
export function WidthButton({ pressed, onClick }: { pressed: boolean; onClick: (from: HTMLElement) => void }) {
  return (
    <button
      id={BUTTON_ID}
      type="button"
      className="ib"
      title="Text width"
      aria-label="Text width"
      aria-pressed={pressed}
      aria-haspopup="menu"
      onClick={(event) => onClick(event.currentTarget)}
    >
      <Icon name="ruler" />
    </button>
  );
}

function WidthMenu({
  from,
  atDefault,
  onShowRuler,
  onRestoreDefault,
  onClose,
}: {
  from: HTMLElement;
  atDefault: boolean;
  onShowRuler: () => void;
  onRestoreDefault: () => void;
  /** Closes the menu, and with `focus` gives the focus back to the bar button. */
  onClose: (focus: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Above the button, as the box of read times.
  useLayoutEffect(() => {
    const menu = box.current;
    if (!menu) return;
    const view = { width: document.documentElement.clientWidth, height: innerHeight };
    const { left, top, bottom } = boxPlace(from.getBoundingClientRect(), menu.offsetWidth, view, barTop());
    menu.style.left = `${left}px`;
    if (top !== undefined) menu.style.top = `${top}px`;
    if (bottom !== undefined) menu.style.bottom = `${bottom}px`;
    menu.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, []);

  // A click outside the menu, Esc and a new window size close it. A click on the bar button toggles it there.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (box.current?.contains(target) || document.getElementById(BUTTON_ID)?.contains(target)) return;
      close.current(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close.current(true);
    };
    const onResize = () => close.current(false);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
      removeEventListener('resize', onResize);
    };
  }, []);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = MENU_STEPS[event.key];
    if (step) {
      event.preventDefault();
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      (event.key === 'Home' ? items[0] : items.at(-1))?.focus();
    } else if (event.key === 'Tab') {
      // Tab goes on from the bar button, as it does with the menu closed.
      onClose(true);
    }
  }

  return (
    <div id="width-menu" ref={box} role="menu" aria-label="Text width" onKeyDown={onKeyDown}>
      <button type="button" role="menuitem" onClick={onShowRuler}>
        <Icon name="ruler" />
        <span>Show ruler</span>
      </button>
      <button type="button" role="menuitem" disabled={atDefault} onClick={onRestoreDefault}>
        <Icon name="undo" />
        <span>Restore default</span>
      </button>
    </div>
  );
}

/**
 * The reader's text width, its menu and its ruler. The width shows on the page through the CSS variables of
 * `width-page.ts`, and every change keeps the place of the reader. The ruler is in the page only while it shows, and
 * it draws itself from the layout of the page, so it follows the window, the panel, the theme and the fonts.
 */
export function TextWidth({
  defaultChars,
  url,
  menuFrom,
  rulerOn,
  onMenuClose,
  onRuler,
}: {
  /** `textWidth` of nerddocs.json, else 75. */
  defaultChars: number;
  /** The address of the page. A page move closes the menu. */
  url: string;
  /** The bar button while the menu is open, or null. */
  menuFrom: HTMLElement | null;
  rulerOn: boolean;
  onMenuClose: () => void;
  onRuler: (on: boolean) => void;
}) {
  const [width, setShownWidth] = useState<Width>(null);
  const [opening, setOpening] = useState<Width>(null);
  // The values of the latest render, for the listeners of the window and of the drag.
  const now = useRef({ width: null as Width, opening: null as Width, defaultChars, rulerOn });
  now.current.defaultChars = defaultChars;
  now.current.rulerOn = rulerOn;
  const shownDefault = useRef(defaultChars);
  const ruler = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const leftHandle = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLDivElement>(null);
  const middle = useRef<HTMLDivElement>(null);
  const number = useRef<HTMLSpanElement>(null);
  const stopDrag = useRef<(() => void) | null>(null);

  function draw(): void {
    const box = ruler.current;
    if (!box || !now.current.rulerOn) return;
    const layout = layoutOf(now.current.defaultChars);
    if (!layout) return;
    const { span, rulerLeft, rulerRight, textLeft, textRight } = layout;
    const center = (textLeft + textRight) / 2 - rulerLeft;
    box.style.left = `${rulerLeft}px`;
    box.style.width = `${Math.max(0, rulerRight - rulerLeft)}px`;
    box.style.setProperty('--o', `${center}px`);
    box.style.setProperty('--s', `${TICK_CHARS * span.charPx}px`);
    box.style.setProperty('--S', `${TALL_TICK_CHARS * span.charPx}px`);
    band.current!.style.left = `${textLeft - rulerLeft}px`;
    band.current!.style.width = `${Math.max(0, textRight - textLeft)}px`;
    leftHandle.current!.style.left = `${textLeft - rulerLeft}px`;
    slider.current!.style.left = `${textRight - rulerLeft}px`;
    middle.current!.style.left = `${center}px`;
    const shown = shownChars(now.current.width, span);
    const least = Math.round(span.minPx / span.charPx);
    number.current!.textContent = String(shown);
    slider.current!.setAttribute('aria-valuenow', String(shown));
    slider.current!.setAttribute('aria-valuemin', String(least));
    slider.current!.setAttribute('aria-valuemax', String(Math.max(least, Math.round(span.fullPx / span.charPx))));
    slider.current!.setAttribute('aria-valuetext', `${shown} characters`);
  }

  /** Shows a new width with the place held, by `hold`: a run of changes such as a drag holds one place for all. */
  function setWidth(next: Width, hold: (change: () => void) => void = keepPlace): void {
    if (next === now.current.width) return;
    now.current.width = next;
    hold(() => showWidth(next, now.current.defaultChars));
    writeWidth(next);
    setShownWidth(next);
    draw();
  }

  // After hydration: the stored width, and the character width of the font as it renders. The head script showed
  // both already, from storage or from a measure of a system font, so the text moves only when the font measures
  // another width.
  useLayoutEffect(() => {
    watchPlace();
    const stored = readWidth();
    now.current.width = stored;
    setShownWidth(stored);
    keepPlace(() => {
      showWidth(stored, now.current.defaultChars);
      fitCharWidth();
    });
    // A font that loaded has moved the text already, so the place is the one from before it loaded. A level change
    // that still moves holds a place of its own, unless the character width changes.
    const onFonts = () => {
      const em = nextCharWidth();
      if (em === null && changeRunning()) return;
      keepPlaceFromBefore(() => {
        if (em !== null) showCharWidth(em);
      });
    };
    // A page restored from the back/forward cache missed what other pages stored, and another tab can store a width.
    const showStored = () => {
      const next = readWidth();
      now.current.width = next;
      setShownWidth(next);
      keepPlace(() => {
        showWidth(next, now.current.defaultChars);
        fitCharWidth();
      });
      draw();
    };
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) showStored();
    };
    const onStorage = (event: StorageEvent) => {
      if ((event.key === WIDTH_KEY || event.key === null) && readWidth() !== now.current.width) showStored();
    };
    document.fonts?.addEventListener('loadingdone', onFonts);
    void document.fonts?.ready.then(onFonts);
    addEventListener('pageshow', onShow);
    addEventListener('storage', onStorage);
    return () => {
      document.fonts?.removeEventListener('loadingdone', onFonts);
      removeEventListener('pageshow', onShow);
      removeEventListener('storage', onStorage);
    };
  }, []);

  // A save of nerddocs.json with another `textWidth`.
  useLayoutEffect(() => {
    if (shownDefault.current === defaultChars) return;
    shownDefault.current = defaultChars;
    keepPlace(() => showWidth(now.current.width, defaultChars));
    draw();
  }, [defaultChars]);

  // While the ruler shows, it follows each change of the layout.
  useLayoutEffect(() => {
    if (!rulerOn) return;
    draw();
    slider.current?.focus({ preventScroll: true });
    const observer = new ResizeObserver(draw);
    for (const el of [document.querySelector('main'), document.querySelector('.col')]) if (el) observer.observe(el);
    const stop = onCharWidth(draw);
    return () => {
      observer.disconnect();
      stop();
      stopDrag.current?.();
    };
  }, [rulerOn]);

  // The cleanup form, since an effect body would also run on mount.
  useEffect(() => () => onMenuClose(), [url]);

  function closeMenu(focus: boolean): void {
    if (focus) focusButton();
    onMenuClose();
  }

  function showRuler(): void {
    now.current.opening = now.current.width;
    setOpening(now.current.width);
    onMenuClose();
    onRuler(true);
  }

  /** Both edges move together, so a place on the ruler gives the width twice its distance from the middle. */
  function setFromX(x: number, hold: (change: () => void) => void): void {
    const box = ruler.current?.getBoundingClientRect();
    const layout = layoutOf(now.current.defaultChars);
    if (!box || !layout) return;
    setWidth(pickWidth(2 * Math.abs(x - (box.left + box.width / 2)), now.current.opening, layout.span), hold);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    const target = event.target instanceof Element ? event.target : null;
    if (event.button !== 0) return;
    // A press on the number sets nothing, and the slider keeps the focus. 'Restore' and 'Apply' take their clicks.
    if (target?.closest('.rmid')) {
      if (!target.closest('button')) event.preventDefault();
      return;
    }
    event.preventDefault();
    // A drag of a handle keeps the pointer where it took the handle. A press on the ruler moves the edge there.
    const hold = holdForRun();
    const handle = target?.closest('.rh');
    let grip = 0;
    if (handle) {
      const box = handle.getBoundingClientRect();
      grip = event.clientX - (box.left + box.width / 2);
    } else {
      setFromX(event.clientX, hold);
    }
    const onMove = (move: PointerEvent) => setFromX(move.clientX - grip, hold);
    const stop = () => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', stop);
      stopDrag.current = null;
    };
    const onUp = () => {
      stop();
      slider.current?.focus({ preventScroll: true });
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', stop);
    stopDrag.current = stop;
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const layout = layoutOf(now.current.defaultChars);
    const next = layout && keyWidth(event.key, now.current.width, now.current.opening, layout.span);
    if (next === undefined || !layout) return;
    event.preventDefault();
    setWidth(next);
  }

  const changed = width !== opening;
  return (
    <>
      {menuFrom && (
        <WidthMenu
          from={menuFrom}
          atDefault={width === null}
          onShowRuler={showRuler}
          onRestoreDefault={() => {
            closeMenu(true);
            setWidth(null);
          }}
          onClose={closeMenu}
        />
      )}
      {rulerOn && (
        <div id="ruler" ref={ruler} onPointerDown={onPointerDown}>
          <div className="rband" ref={band} />
          <div className="rtk" />
          <div className="rh" ref={leftHandle} />
          <div className="rh" ref={slider} role="slider" tabIndex={0} aria-label="Text width" onKeyDown={onKeyDown} />
          <div className="rmid" ref={middle}>
            <button
              type="button"
              className="rb"
              aria-label="Restore"
              title="Restore"
              hidden={!changed}
              onClick={() => {
                setWidth(now.current.opening);
                // 'Restore' hides itself, so the focus goes on to the slider and stays in the ruler.
                slider.current?.focus({ preventScroll: true });
              }}
            >
              <Icon name="undo" />
            </button>
            <span id="ruler-num" ref={number} />
            <button
              type="button"
              className="rb"
              aria-label="Apply"
              title="Apply"
              hidden={!changed}
              onClick={() => {
                onRuler(false);
                focusButton();
              }}
            >
              <Icon name="check" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
