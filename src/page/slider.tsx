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

type BarPage = PageLevels & Pick<PageView, 'readTimes'>;
type OnTime = (from: HTMLElement) => void;

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

function Stops({ page, off, onTime }: { page: BarPage; off: boolean; onTime: OnTime }) {
  const { levels } = page;
  const timeAt = (stop: number) => formatMinutes(page.readTimes[stop]?.page ?? 0);
  const count = levels.length;
  const hollow = hollowStops(page);
  // The slider can come back during a load, after a live update to a page with no parts.
  const [level, setLevel] = useState(() => (typeof document === 'undefined' ? openingLevel(page) : currentLevel()));
  const [said, setSaid] = useState('');
  const [drag, setDrag] = useState<{ left: number; stop: number } | null>(null);
  const [peek, setPeek] = useState<number | null>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const stopDrag = useRef<(() => void) | null>(null);

  // A live update can move the level or take away what a drag was on.
  useLayoutEffect(() => {
    stopDrag.current?.();
    const next = currentLevel();
    if (next === level) return;
    setLevel(next);
    setSaid(levels.find((candidate) => candidate.id === next)?.name ?? '');
  }, [page]);
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

  function moveTo(stop: number): void {
    const target = levels[stop];
    if (!target || hollow[stop]) return;
    changeLevel({ to: target.id, color: colorOf(stop), sameMarks: sameMarks(page, target.id) });
    setLevel(target.id);
    setSaid(target.name);
  }

  function focusThumb(): void {
    thumb.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event: ReactKeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const stop = stopForKey(event.key, at, hollow);
    if (stop === null) return;
    event.preventDefault();
    moveTo(stop);
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
}: {
  page: BarPage;
  inert: boolean;
  panelOff: boolean;
  menu: ReactNode;
  onTime: OnTime;
}) {
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
          <>
            <Stops page={page} off={off} onTime={onTime} />
            <i className="sep" />
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
          </>
        )}
      </div>
    </div>
  );
}
