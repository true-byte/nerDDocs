import { SCROLL_BOX } from './scroll-boxes.ts';

/** The id of the one dialog of the full-size view. */
export const FULL_VIEW_ID = 'full-view';

/** What opens full size: a block image that the build marked, and a diagram box once its diagram is drawn. */
const OPENS = '#page [data-full]';
/** The box of a Mermaid diagram. Its drawing moves into the view and back, so the ids of its arrows stay unique. */
const DIAGRAM = '.dg';

let watching = false;
/** The element that opened the view, which takes the focus back when it closes. */
let opener: HTMLElement | null = null;

/** The dialog, made on the first open. A click anywhere on it closes it, and Esc closes it by its `cancel`. */
function viewDialog(): HTMLDialogElement {
  const found = document.getElementById(FULL_VIEW_ID);
  if (found instanceof HTMLDialogElement) return found;
  const dialog = document.createElement('dialog');
  dialog.id = FULL_VIEW_ID;
  dialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    giveBack(dialog);
    dialog.replaceChildren();
    const from = opener;
    opener = null;
    if (from?.isConnected && document.getElementById('page')?.contains(from)) from.focus({ preventScroll: true });
  });
  document.body.append(dialog);
  return dialog;
}

/** The drawing of a diagram goes back into its box, unless the box drew again while the view was open. */
function giveBack(dialog: HTMLDialogElement): void {
  const from = opener;
  if (!(from instanceof HTMLElement) || !from.matches(DIAGRAM)) return;
  const svg = dialog.querySelector(':scope > svg');
  const sbox = from.querySelector(`:scope > .${SCROLL_BOX}`);
  if (svg && sbox && from.isConnected && document.getElementById('page')?.contains(from) && !sbox.querySelector('svg')) {
    sbox.append(svg);
  }
  from.style.removeProperty('height');
  if (!from.getAttribute('style')) from.removeAttribute('style');
}

/** The element that the view shows for an opener: a copy of an image, or the drawing of a diagram itself. */
function shownFor(from: Element): Element | null {
  if (from instanceof HTMLImageElement) {
    const shown = document.createElement('img');
    shown.src = from.currentSrc || from.src;
    shown.alt = from.alt;
    return shown;
  }
  if (!(from instanceof HTMLElement) || !from.matches(DIAGRAM) || from.getAttribute('data-state') !== 'drawn') return null;
  return from.querySelector(`:scope > .${SCROLL_BOX} > svg`);
}

/** Shows the copy that the page shows, or the drawing of a diagram, at full size on the background. */
function openView(from: Element): void {
  // The moving copy of a level change holds a drawing that it gives back when the change ends.
  if (from.closest('.ghost')) return;
  const dialog = viewDialog();
  if (dialog.open) return;
  const shown = shownFor(from);
  if (!shown) return;
  const label = from instanceof HTMLImageElement ? from.alt : (from.getAttribute('aria-label') ?? '');
  // The box keeps its size while its drawing is in the view.
  if (from instanceof HTMLElement && from.matches(DIAGRAM)) from.style.height = `${from.getBoundingClientRect().height}px`;
  dialog.setAttribute('aria-label', label);
  dialog.replaceChildren(shown);
  opener = from as HTMLElement;
  dialog.showModal();
}

/** Starts the full-size view of each `#page [data-full]`, also one that a live update adds. A second call does nothing. */
export function watchFullView(): void {
  if (watching) return;
  watching = true;
  document.addEventListener('click', (event) => {
    const from = event.target instanceof Element ? event.target.closest(OPENS) : null;
    if (from) openView(from);
  });
  // Space opens the view as Enter does, and the page does not scroll.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!(event.target instanceof Element) || !event.target.matches(OPENS)) return;
    event.preventDefault();
    if (!event.repeat) openView(event.target);
  });
}
