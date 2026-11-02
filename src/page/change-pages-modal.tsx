/** @jsxImportSource react */
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Level } from '../site/config.ts';
import { MoveIcons } from './icons.tsx';
import type { ChangedPage } from './level-memory.ts';

export function ChangePagesModal({
  rows,
  levels,
  url,
  onCancel,
  onChange,
}: {
  rows: ChangedPage[];
  levels: Level[];
  /** The address of the page. A page move cancels the change. */
  url: string;
  onCancel: () => void;
  onChange: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const chosen = useRef(false);

  useLayoutEffect(() => {
    dialog.current?.showModal();
    cancel.current?.focus();
  }, []);

  // The cleanup form, since an effect body would also run on mount and close the modal as it opens.
  useEffect(() => () => dialog.current?.close(), [url]);

  return (
    <dialog
      id="change-pages"
      ref={dialog}
      role="alertdialog"
      aria-labelledby="change-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      onClose={() => (chosen.current ? onChange() : onCancel())}
    >
      <div className="set">
        <h2 id="change-title">{`Change ${rows.length} ${rows.length === 1 ? 'page' : 'pages'}?`}</h2>
        <div className="lost" tabIndex={0}>
          {rows.map((row) => (
            <div key={row.url}>
              <span>{row.title}</span>
              <MoveIcons levels={levels} from={row.from} to={row.to} />
            </div>
          ))}
        </div>
        <div className="row">
          <button ref={cancel} type="button" className="no" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            className="yes"
            onClick={() => {
              chosen.current = true;
              dialog.current?.close();
            }}
          >
            Change
          </button>
        </div>
      </div>
    </dialog>
  );
}
