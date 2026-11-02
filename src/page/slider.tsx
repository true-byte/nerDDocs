/** @jsxImportSource react */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { PageLevels, PageView } from '../site/view.ts';
import { Icon, LevelIcon } from './icons.tsx';
import { changeLevel, currentLevel, focusHeldText } from './level-change.ts';
import { LevelChip, type ChipState } from './level-chip.tsx';
import { keepLevel, landingLevel } from './level-memory.ts';
import {
  colorOf,
  compactGuess,
  hollowStops,
  isFlat,
  nearestLive,
  openingLevel,
  sameMarks,
  stopAt,
  stopCenter,
  stopForKey,
  thumbAt,
} from './levels.ts';
import { PHONE, readSliderOff, writeSliderOff } from './panel-state.ts';
import { formatMinutes } from './read-time.ts';

const DRAG_START_PX = 3;
const DRAG_REST_MS = 150;

type BarPage = PageLevels & Pick<PageView, 'readTimes' | 'url'>;
type OnTime = (from: HTMLElement) => void;
/** Sets the reader's default, through the modal when needed. `done` runs once it is set, and `back` after a cancel. */
export type OnDefault = (level: string, done: () => void, back: () => void) => void;

/** What the slider takes from the rest of the page. */
interface LevelMemoryProps {
  readerDefault: string | null;
  /** Counts the level moves from outside the slider. Each one takes the chip away. */
  outsideMoves: number;
  onDefault: OnDefault;
}

const levelColor = (index: number) => ({ '--c': colorOf(index) }) as CSSProperties;

/** True when a name does not fit its stop in the bold weight of the current stop. */
function namesOverflow(bar: HTMLElement): boolean {
  const stops = bar.querySelector('.stops');
  if (!stops) return false;
  const compact = bar.classList.contains('compact');
  bar.classList.remove('compact');
  stops.classList.add('fitcheck');
  const over = [...stops.children].some((stop) => {
    const name = stop.querySelector('.nm>span');
    return stop.scrollWidth > stop.clientWidth + 1 || (!!name && name.scrollWidth > name.clientWidth + 1);
  });
  stops.classList.remove('fitcheck');
  bar.classList.toggle('compact', compact);
  return over;
}

function Stops({
  page,
  off,
  onTime,
  readerDefault,
  outsideMoves,
  onDefault,
}: { page: BarPage; off: boolean; onTime: OnTime } & LevelMemoryProps) {
  const { levels } = page;
  const timeAt = (stop: number) => formatMinutes(page.readTimes[stop]?.page ?? 0);
  const count = levels.length;
  const hollow = hollowStops(page);
  // The server's level, so the first render matches the server's HTML. The effect below moves to the current level.
  const [level, setLevel] = useState(() => openingLevel(page));
  const [said, setSaid] = useState('');
  const [drag, setDrag] = useState<{ left: number; stop: number } | null>(null);
  const [peek, setPeek] = useState<number | null>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const stopDrag = useRef<(() => void) | null>(null);
  const [chip, setChip] = useState<ChipState | null>(null);
  const chipNow = useRef<ChipState | null>(null);
  const mounted = useRef(false);

  function writeChip(next: ChipState | null): void {
    chipNow.current = next;
    setChip(next);
  }

  // Hydration, a live update or a default can move the level, and a live update can take away what a drag was on.
  useLayoutEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    stopDrag.current?.();
    const next = currentLevel();
    if (next === level) return;
    setLevel(next);
    writeChip(null);
    if (!first) setSaid(levels.find((candidate) => candidate.id === next)?.name ?? '');
  }, [page, outsideMoves]);
  // The server's slider now shows the current level, with no move for the thumb to animate.
  useLayoutEffect(() => {
    if (level === currentLevel()) document.getElementById('nd-first')?.remove();
  }, [level]);
  useLayoutEffect(() => writeChip(null), [page.url, outsideMoves, JSON.stringify(levels)]);
  useLayoutEffect(() => {
    if (off) writeChip(null);
  }, [off]);
  // The stop under the mouse can go away with no pointer event.
  useLayoutEffect(() => setPeek(null), [JSON.stringify(levels)]);
  useEffect(() => () => stopDrag.current?.(), []);

  const at = Math.max(
    0,
    levels.findIndex((candidate) => candidate.id === level),
  );
  // A live update can leave these past the end of the list until its effect above runs.
  const lit = drag && drag.stop < count ? drag.stop : at;
  const named = peek !== null && peek < count ? peek : lit;
  const current = levels[at]!;
  const namedTime = timeAt(named);

  function moveTo(stop: number, keyboard = false): void {
    const target = levels[stop];
    const from = currentLevel();
    if (!target || hollow[stop] || target.id === from) return;
    changeLevel({ to: target.id, color: colorOf(stop), sameMarks: sameMarks(page, target.id) });
    setLevel(target.id);
    keepLevel(page, page.url, target.id);

    const now = chipNow.current;
    const shown = now && !now.done ? now : null;
    const first = shown?.from ?? from;
    const leaves = target.id === first || target.id === landingLevel(page, readerDefault ?? undefined);
    writeChip(leaves ? null : { from: first, moves: (now?.moves ?? 0) + 1, keyboard, waiting: false, done: false });
    setSaid(leaves || shown ? target.name : `${target.name}. All pages`);
  }

  function focusThumb(): void {
    thumb.current?.focus({ preventScroll: true });
  }

  function allPages(): void {
    if (chipNow.current) writeChip({ ...chipNow.current, waiting: true });
    onDefault(
      currentLevel(),
      () => {
        if (chipNow.current) writeChip({ ...chipNow.current, waiting: false, done: true });
        focusThumb();
      },
      () => {
        const now = chipNow.current;
        if (now) writeChip({ ...now, waiting: false, moves: now.moves + 1 });
        focusThumb();
      },
    );
  }

  function onKeyDown(event: ReactKeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const stop = stopForKey(event.key, at, hollow);
    if (stop === null) return;
    event.preventDefault();
    moveTo(stop, true);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const { left, width } = event.currentTarget.getBoundingClientRect();
    const startX = event.clientX;
    let dragging = false;
    let target = at;
    let rest: ReturnType<typeof setTimeout> | undefined;

    const stopListening = () => {
      clearTimeout(rest);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onCancel);
      stopDrag.current = null;
    };
    const onMove = (move: PointerEvent) => {
      if (!dragging && Math.abs(move.clientX - startX) <= DRAG_START_PX) return;
      dragging = true;
      target = nearestLive(stopAt(move.clientX, left, width, count), hollow);
      setDrag({ left: thumbAt(move.clientX, left, width, count), stop: target });
      clearTimeout(rest);
      rest = setTimeout(() => moveTo(target), DRAG_REST_MS);
    };
    const onUp = () => {
      stopListening();
      if (!dragging) target = nearestLive(stopAt(startX, left, width, count), hollow);
      setDrag(null);
      moveTo(target);
      focusThumb();
    };
    const onCancel = () => {
      stopListening();
      setDrag(null);
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onCancel);
    stopDrag.current = onCancel;
  }

  return (
    <div id="stopsWrap" inert={off}>
      <div className={named !== lit ? 'b1 peek' : 'b1'} style={levelColor(named)}>
        <LevelIcon level={levels[named]!} />
        <span>{levels[named]!.name}</span>
        {namedTime && (
          <button
            id="timeRow"
            type="button"
            className="min tmb"
            title="Read time"
            aria-haspopup="dialog"
            onClick={(event) => onTime(event.currentTarget)}
          >
            <Icon name="clock" />
            {namedTime}
          </button>
        )}
      </div>
      <div className="track" style={levelColor(lit)} onPointerDown={onPointerDown}>
        {levels.map((candidate, stop) => (
          <i key={candidate.id} className="tick" style={{ left: `${stopCenter(stop, count)}%` }} />
        ))}
        <div
          id="thumb"
          ref={thumb}
          className={drag ? 'drag' : undefined}
          role="slider"
          tabIndex={0}
          aria-label="Level"
          aria-valuemin={1}
          aria-valuemax={count}
          aria-valuenow={at + 1}
          aria-valuetext={current.name}
          style={{ left: `${drag?.left ?? stopCenter(at, count)}%` }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="stops">
        {levels.map((candidate, stop) => (
          <button
            key={candidate.id}
            type="button"
            tabIndex={-1}
            className={`stop${stop === lit ? ' on' : ''}${hollow[stop] ? ' hollow' : ''}`}
            style={levelColor(stop)}
            aria-disabled={hollow[stop] || undefined}
            onClick={() => {
              if (hollow[stop]) return;
              moveTo(stop);
              focusThumb();
            }}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') setPeek(stop);
            }}
            onPointerLeave={() => setPeek(null)}
          >
            <span className="nm">
              <LevelIcon level={candidate} />
              <span>{candidate.name}</span>
            </span>
            <span className="min">{timeAt(stop)}</span>
          </button>
        ))}
      </div>
      {chip && (
        <LevelChip chip={chip} to={current.id} levels={levels} onAllPages={allPages} onLeave={() => writeChip(null)} />
      )}
      <a
        className="to-text"
        href="#page"
        onClick={(event) => {
          event.preventDefault();
          focusHeldText();
        }}
      >
        Go to text
      </a>
      <div className="sr-only" aria-live="polite">
        {said}
      </div>
    </div>
  );
}

/** One element at both widths: the bottom bar on a phone, the floating panel on a wide window. */
export function Bar({
  page,
  inert,
  panelOff,
  menu,
  onTime,
  onDefaults,
  readerDefault,
  outsideMoves,
  onDefault,
}: {
  page: BarPage;
  inert: boolean;
  panelOff: boolean;
  menu: ReactNode;
  onTime: OnTime;
  onDefaults: (from: HTMLElement) => void;
} & LevelMemoryProps) {
  const hasLevels = page.levels.length > 0;
  const noParts = hasLevels && isFlat(page);
  const [off, setOff] = useState(false);
  const [compact, setCompact] = useState(() => compactGuess(page.levels));
  const bar = useRef<HTMLDivElement>(null);

  // The head script set the attribute before the first paint. The server always renders it shown.
  useLayoutEffect(() => setOff(readSliderOff()), []);

  useLayoutEffect(() => {
    if (!hasLevels) return;
    const measure = () => {
      if (bar.current && !matchMedia(PHONE).matches) setCompact(namesOverflow(bar.current));
    };
    measure();
    addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, [hasLevels, noParts, page.levels, panelOff]);

  function toggle(): void {
    const next = !off;
    writeSliderOff(next);
    if (next) document.documentElement.setAttribute('data-slider', 'off');
    else document.documentElement.removeAttribute('data-slider');
    setOff(next);
  }

  const label = off ? 'Show panel' : 'Hide panel';
  const classes = [hasLevels ? 'levels' : '', noParts ? 'no-parts' : '', hasLevels && !noParts && compact ? 'compact' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div id="bar" ref={bar} className={classes || undefined} inert={inert}>
      {hasLevels && (
        <button id="tab" type="button" aria-label={label} title={label} onClick={toggle}>
          <Icon name="chev" />
        </button>
      )}
      <div className="b2">
        {menu}
        {noParts && <div id="no-levels">No levels on this page</div>}
        {hasLevels && !noParts && (
          <Stops
            page={page}
            off={off}
            onTime={onTime}
            readerDefault={readerDefault}
            outsideMoves={outsideMoves}
            onDefault={onDefault}
          />
        )}
        {hasLevels && <i className="sep" />}
        {hasLevels && !noParts && (
          <button
            id="timeB"
            type="button"
            className="ib"
            title="Read time"
            aria-label="Read time"
            aria-haspopup="dialog"
            onClick={(event) => onTime(event.currentTarget)}
          >
            <Icon name="clock" />
          </button>
        )}
        {hasLevels && (
          <button
            id="dflB"
            type="button"
            className="ib"
            title="Defaults"
            aria-label="Defaults"
            aria-haspopup="dialog"
            onClick={(event) => onDefaults(event.currentTarget)}
          >
            <Icon name="knobs" />
          </button>
        )}
      </div>
    </div>
  );
}
