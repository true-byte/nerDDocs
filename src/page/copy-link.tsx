/** @jsxImportSource react */
import type { PageView } from '../site/view.ts';
import { copyText, showCopied } from './copy.ts';
import { Icon, iconHtml, iconPaths } from './icons.tsx';
import { writePlaceNow } from './level-address.ts';
import { PHONE } from './panel-state.ts';
import { hasNoSlider, titleTimeHtml } from './read-time.ts';

const LABEL = 'Copy link';
const COPIED = 'Link copied';
/** The class of each 'Copy link' button: `lnkB` in the bar, `lnkT` next to the title and `lnk2` in the menu panel. */
const LINK_BUTTON = 'lnk';
/** The button of the menu panel, which opens the share sheet of a phone. */
const MENU_BUTTON = 'lnk2';

/** A 'Copy link' button of the bar or of the menu panel. */
export function LinkButton({ id }: { id: 'lnkB' | 'lnk2' }) {
  return (
    <button id={id} type="button" className={`ib ${LINK_BUTTON}`} title={LABEL} aria-label={LABEL}>
      <Icon name="link" />
    </button>
  );
}

/** The 'Copy link' button next to the title, as HTML. It shows while the panel is hidden. */
function titleLinkHtml(): string {
  return `<button type="button" id="lnkT" class="tlk ${LINK_BUTTON}" title="${LABEL}" aria-label="${LABEL}">${iconHtml('link')}</button>`;
}

/** What sits next to the title, as HTML: the read time button and the 'Copy link' button. */
export function titleSlotHtml(view: Pick<PageView, 'readTimes' | 'levels' | 'parts'>): string {
  return titleTimeHtml(view.readTimes, hasNoSlider(view)) + titleLinkHtml();
}

/** The icon of the button turns into a check while the check of the copy shows. */
function showLinkCopied(button: Element): void {
  const icon = button.querySelector('svg.i');
  if (icon) icon.innerHTML = iconPaths('check');
  showCopied(button, COPIED, () => {
    if (icon) icon.innerHTML = iconPaths('link');
  });
}

/** Copies `text`. The fallback of `copyText` selects the text of an element, so the text sits in one for the copy. */
function copyAddress(text: string): Promise<boolean> {
  const holder = document.createElement('span');
  holder.className = 'sr-only';
  holder.textContent = text;
  document.body.append(holder);
  return copyText(text, holder).finally(() => holder.remove());
}

/** Opens the share sheet of a phone with the address. A share that the reader cancels or the browser refuses does nothing. */
function share(url: string): void {
  try {
    void navigator.share({ url }).catch(() => {});
  } catch {
    // The browser refused the share.
  }
}

function onClick(event: MouseEvent): void {
  const button = event.target instanceof Element ? event.target.closest(`button.${LINK_BUTTON}`) : null;
  if (!button) return;
  writePlaceNow();
  if (button.id === MENU_BUTTON && matchMedia(PHONE).matches && typeof navigator.share === 'function') {
    share(location.href);
    return;
  }
  void copyAddress(location.href).then((copied) => {
    if (copied) showLinkCopied(button);
  });
}

let watching = false;

/** Starts one click listener on the document for each 'Copy link' button, also those that a live update adds. A second call does nothing. */
export function watchLinkCopies(): void {
  if (watching) return;
  watching = true;
  document.addEventListener('click', onClick);
}
