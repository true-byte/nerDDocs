/** @jsxImportSource react */
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Level } from '../site/config.ts';
import { LevelIcon } from './icons.tsx';
import { colorOf } from './levels.ts';

export function DefaultsBox({
  levels,
  selected,
  from,
  url,
  behindModal,
  onPick,
  onClose,
}: {
  levels: Level[];
  selected: string;
  from: HTMLElement;
  /** The address of the page. A page move closes the box. */
  url: string;
  /** The modal shows alone. The box stays open and keeps its focus for when the modal closes. */
  behindModal: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    dialog.current?.showModal();
  }, []);

  // The cleanup form, since an effect body would also run on mount and close the box as it opens.
  useEffect(() => () => dialog.current?.close(), [url]);

  return (
    <dialog
      id="defaults-box"
      ref={dialog}
      className={behindModal ? 'behind' : undefined}
      aria-label="Defaults"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      onClose={() => {
        if (from.isConnected) from.focus({ preventScroll: true });
        onClose();
      }}
    >
      <div className="set">
        <span id="defaults-label">Default level</span>
        <div className="seg" role="group" aria-labelledby="defaults-label">
          {levels.map((level, stop) => (
            <button
              key={level.id}
              type="button"
              aria-pressed={level.id === selected}
              style={{ '--mc': colorOf(stop) } as CSSProperties}
              onClick={() => onPick(level.id)}
            >
              <LevelIcon level={level} />
              <span>{level.name}</span>
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}
