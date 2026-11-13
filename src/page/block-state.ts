import { CODE_BOX, PLACE_MARKS, takePlace } from './diagrams.ts';
import { withoutFrameState } from './frames.ts';
import { withoutLinkMarks } from './level-links.ts';
import { SCROLL_BOX } from './scroll-boxes.ts';

const BOX_MARKS = ['role', 'tabindex', 'aria-labelledby'];
const WRAPPER_MARKS = ['data-more', 'data-pin'];
/** The check of a copy icon. */
const COPY_MARK = 'data-done';
/**
 * What the page script adds to the box of a diagram: its state, its full-size marks, its description and its size. The
 * place marks of the build join them, since a save above the box moves its fence and leaves the diagram the same.
 */
const DIAGRAM_MARKS = [
  'data-state',
  'data-drawn',
  'data-full',
  'tabindex',
  'role',
  'aria-label',
  'aria-describedby',
  'style',
  ...PLACE_MARKS,
];

/** Each diagram box in a block, the block itself too, in page order. */
export const diagramsIn = (block: Element) => [...(block.matches('.dg') ? [block] : []), ...block.querySelectorAll('.dg')];

/** Removes each `noscript` inside a node. Its content shows only with no script. */
export function withoutNoScript(node: Node): void {
  if (node instanceof Element || node instanceof DocumentFragment) for (const fallback of node.querySelectorAll('noscript')) fallback.remove();
}

/**
 * Takes out of a copy what the reader changes and what the page script adds: open details, the focus mark that 'Go to
 * text' sets, the marks of sideways boxes, the check of a copy icon, the drawing, the problem box, the source box and
 * the marks of a diagram, and the height, the full-size view and the frame document of a wireframe. It also takes out
 * each `noscript`, as a block of a live update has none.
 */
export function stripReaderState(copy: Node): void {
  withoutNoScript(copy);
  if (!(copy instanceof Element)) return;
  for (const box of diagramsIn(copy)) {
    for (const name of DIAGRAM_MARKS) box.removeAttribute(name);
    box.classList.remove(CODE_BOX);
    for (const child of box.querySelectorAll(`:scope > div.${SCROLL_BOX}, :scope > .problem`)) child.remove();
    const pre = box.querySelector(':scope > pre');
    pre?.classList.remove(SCROLL_BOX);
    if (pre?.classList.length === 0) pre.removeAttribute('class');
    for (const name of BOX_MARKS) pre?.removeAttribute(name);
  }
  copy.removeAttribute('tabindex');
  copy.removeAttribute('open');
  for (const details of copy.querySelectorAll('details')) details.removeAttribute('open');
  for (const el of [copy, ...copy.querySelectorAll('[data-more], [data-pin]')]) {
    for (const name of WRAPPER_MARKS) el.removeAttribute(name);
  }
  const boxes = [...(copy.matches(`.${SCROLL_BOX}`) ? [copy] : []), ...copy.querySelectorAll(`.${SCROLL_BOX}`)];
  for (const box of boxes) for (const name of BOX_MARKS) box.removeAttribute(name);
  for (const el of [copy, ...copy.querySelectorAll(`[${COPY_MARK}]`)]) el.removeAttribute(COPY_MARK);
  withoutFrameState(copy);
  withoutLinkMarks(copy);
}

/** A copy without what the reader changes and what the page script adds, as `stripReaderState` says. */
export function withoutReaderState(node: Node): Node {
  const copy = node.cloneNode(true);
  stripReaderState(copy);
  return copy;
}

export function sameBlock(before: Node, after: Node): boolean {
  return before.isEqualNode(after) || withoutReaderState(before).isEqualNode(withoutReaderState(after));
}

/** A kept block takes the place marks of each diagram box of its new copy. */
export function takePlaces(kept: Node, copy: Node): void {
  if (!(kept instanceof Element) || !(copy instanceof Element)) return;
  const copies = diagramsIn(copy);
  diagramsIn(kept).forEach((box, at) => {
    const from = copies[at];
    if (box instanceof HTMLElement && from) takePlace(box, from);
  });
}
