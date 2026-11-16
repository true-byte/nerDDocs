/** @jsxImportSource react */
import { useEffect, useRef } from 'react';
import type { ConfigProblem } from '../site/config.ts';
import { readConfigDismissed, writeConfigDismissed } from './panel-state.ts';

const TITLES: Record<ConfigProblem, string> = {
  missing: 'No nerddocs.json',
  broken: 'Broken nerddocs.json',
};

/** Opens once for each problem. The parent mounts one per problem, so a fix closes it and another problem opens anew. */
export function ConfigModal({ problem }: { problem: ConfigProblem }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const ok = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (readConfigDismissed(problem)) return;
    dialog.current?.showModal();
    ok.current?.focus();
  }, [problem]);

  return (
    <dialog
      id="config-modal"
      ref={dialog}
      role="alertdialog"
      aria-labelledby="config-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="set">
        <h2 id="config-title">{TITLES[problem]}</h2>
        <span>No levels will show.</span>
        <div className="row">
          <label>
            <input type="checkbox" onChange={(event) => writeConfigDismissed(problem, event.target.checked)} />
            Don't show again
          </label>
          <button id="config-ok" ref={ok} type="button" onClick={() => dialog.current?.close()}>
            OK
          </button>
        </div>
      </div>
    </dialog>
  );
}
