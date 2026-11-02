/** @jsxImportSource react */
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Level } from '../site/config.ts';
import type { ReadRow } from '../site/read-time.ts';
import { LevelIcon } from './icons.tsx';
import { currentLevel } from './level-change.ts';
import { colorOf } from './levels.ts';
import { boxPlace, formatMinutes } from './read-time.ts';

const NO_TIME = '–';

const timeText = (minutes: number) => formatMinutes(minutes) || NO_TIME;

/** A panel that CSS removes has no top to measure. */
function barTop(): number {
  const bar = document.getElementById('bar');
  return bar?.getClientRects().length ? bar.getBoundingClientRect().top : innerHeight;
}

function openAt(box: HTMLDialogElement, from: HTMLElement): void {
  box.showModal();
  const view = { width: document.documentElement.clientWidth, height: innerHeight };
  const { left, top, bottom } = boxPlace(from.getBoundingClientRect(), box.offsetWidth, view, barTop());
  box.style.left = `${left}px`;
  if (top !== undefined) box.style.top = `${top}px`;
  if (bottom !== undefined) box.style.bottom = `${bottom}px`;
  // A short window has less room than the cap, and a fixed box that runs off the window cannot scroll into it.
  box.style.maxHeight = `min(76vh, ${view.height - (top ?? bottom!) - 8}px)`;
}

export function ReadTimeBox({
  rows,
  levels,
  flat,
  from,
  url,
  onClose,
}: {
  rows: ReadRow[];
  levels: Level[];
  /** True on a page with no parts. */
  flat: boolean;
  from: HTMLElement;
  /** The address of the page. A page move closes the box. */
  url: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const current = levels.length && flat ? null : currentLevel();

  useLayoutEffect(() => {
    if (dialog.current) openAt(dialog.current, from);
  }, []);

  useEffect(() => {
    const close = () => dialog.current?.close();
    addEventListener('resize', close);
    return () => removeEventListener('resize', close);
  }, []);

  // The cleanup form, since an effect body would also run on mount and close the box as it opens.
  useEffect(() => () => dialog.current?.close(), [url]);

  return (
    <dialog
      id="time-box"
      ref={dialog}
      aria-label="Read time"
      className={levels.length ? undefined : 'one'}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      onClose={() => {
        if (from.isConnected) from.focus({ preventScroll: true });
        onClose();
      }}
    >
      <div className="in">
        <table>
          <thead>
            <tr>
              <th aria-label="Level" />
              <th>This page</th>
              <th>All pages</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, at) => {
              const level = levels[at];
              return (
                <tr
                  key={row.level}
                  className={row.level === current ? 'on' : undefined}
                  style={level ? ({ '--c': colorOf(at) } as CSSProperties) : undefined}
                >
                  <td>
                    {level && (
                      <span className="lv">
                        <LevelIcon level={level} />
                        <span>{level.name}</span>
                      </span>
                    )}
                  </td>
                  <td>{timeText(row.page)}</td>
                  <td>{timeText(row.all)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
