/** @jsxImportSource react */
import { useLayoutEffect, useRef, useState } from 'react';
import type { Level } from '../site/config.ts';
import { Icon, MoveIcons } from './icons.tsx';

const LEAVE_MS = 8000;
const DONE_MS = 1200;

export interface ChipState {
  /** The level before the first move. */
  from: string;
  /** Counts the moves, so that each one starts the timer anew. */
  moves: number;
  /** After a keyboard move, the chip stays until focus leaves the slider and the chip. */
  keyboard: boolean;
  /** True while the modal is open. */
  waiting: boolean;
  /** True while the button shows its check. */
  done: boolean;
}

export function LevelChip({
  chip,
  to,
  levels,
  onAllPages,
  onLeave,
}: {
  chip: ChipState;
  to: string;
  levels: Level[];
  onAllPages: () => void;
  onLeave: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const held = hover || focus || chip.waiting || chip.keyboard;

  // In the same commit as `data-held`, so that the attribute tells when the timer has stopped or started.
  useLayoutEffect(() => {
    if (held && !chip.done) return;
    const timer = setTimeout(onLeave, chip.done ? DONE_MS : LEAVE_MS);
    return () => clearTimeout(timer);
  }, [held, chip.done, chip.moves]);

  // A layout effect, so that the listener is gone before the modal of the same commit takes the focus.
  useLayoutEffect(() => {
    if (!chip.keyboard || chip.waiting || chip.done) return;
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      // A click on a stop focuses the stop before the click moves the level.
      const stays = next instanceof Element && next.closest('#chip, #thumb, .stops');
      // A window that loses focus keeps its focused element.
      if (!stays && document.hasFocus()) onLeave();
    };
    document.addEventListener('focusout', onFocusOut);
    return () => document.removeEventListener('focusout', onFocusOut);
  }, [chip.keyboard, chip.waiting, chip.done]);

  return (
    <div
      id="chip"
      ref={box}
      data-held={held || undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node && box.current?.contains(event.relatedTarget))) setFocus(false);
      }}
    >
      <MoveIcons levels={levels} from={chip.from} to={to} />
      <button id="allB" type="button" aria-label="All pages" disabled={chip.done} onClick={onAllPages}>
        {chip.done ? <Icon name="check" /> : 'All pages'}
      </button>
    </div>
  );
}
