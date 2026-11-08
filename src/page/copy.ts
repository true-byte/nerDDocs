/** How long the check shows after a copy, in ms. */
export const COPIED_MS = 1500;

/** The unseen line that tells a screen reader that the code is copied. */
const STATUS_ID = 'nd-status';
const COPIED = 'Copied';
const DONE = 'data-done';

/**
 * Copies `text` with `navigator.clipboard.writeText`, else by selecting `from` and calling `execCommand('copy')`. A page
 * served over plain HTTP to another computer has no `navigator.clipboard`.
 */
export async function copyText(text: string, from: Element): Promise<boolean> {
  if (typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // A refused copy falls back to the selection.
    }
  }
  const selection = getSelection();
  if (!selection) return false;
  selection.selectAllChildren(from);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    selection.removeAllRanges();
  }
}

const timers = new Map<Element, ReturnType<typeof setTimeout>>();

/** Writes the unseen status line. Each 'Copied' puts in a new text node, so a screen reader says it again on a copy within 1.5 s. */
function setStatus(text: string): void {
  const status = document.getElementById(STATUS_ID);
  if (status && (text !== '' || status.textContent !== '')) status.textContent = text;
}

/** The check shows for `COPIED_MS` after the last copy of the button. */
function showCopied(button: Element): void {
  button.setAttribute(DONE, '');
  setStatus(COPIED);
  clearTimeout(timers.get(button));
  timers.set(
    button,
    setTimeout(() => {
      timers.delete(button);
      button.removeAttribute(DONE);
      if (!document.querySelector(`.copy[${DONE}]`)) setStatus('');
    }, COPIED_MS),
  );
}

function onClick(event: MouseEvent): void {
  const button = event.target instanceof Element ? event.target.closest('#page .copy') : null;
  const code = button?.closest('.code')?.querySelector(':scope > pre > code');
  if (!button || !code) return;
  void copyText(code.textContent ?? '', code).then((copied) => {
    if (copied) showCopied(button);
  });
}

let watching = false;

/** Starts one click listener on the document for every `#page .copy`, also those that a live update adds. A second call does nothing. */
export function watchCopies(): void {
  if (watching) return;
  watching = true;
  document.addEventListener('click', onClick);
}
