// The pad on a modal guidance card, `ui_pop_tutorial` (ux_and_onboarding.md 17.2, 6.4,
// 18.5): the card pauses the world and is not a window, so the input layer gives it the pad
// the way the confirm popup has it: confirm (A, or B when swapped) and back answer "知道了"
// (Esc does on the keyboard), Y answers "此后不提示这类", X expands the held-back paragraphs.
// Only a fresh press counts: a button already down when the card opened (the press that led
// here) answers nothing. Pure: the snapshot and the confirm and back buttons come in.

import type { PadSnapshot } from './gamepad';
import { PAD_BUTTONS, type PadButton } from './pad_bindings';

/** The card's buttons as they are this frame. */
export interface CardButtons {
  confirm: boolean;
  back: boolean;
  mute: boolean;
  expand: boolean;
}

const NONE: CardButtons = { confirm: false, back: false, mute: false, expand: false };

/** The card's buttons in a snapshot (confirm and back follow the A and B swap). */
export function cardButtons(
  snap: PadSnapshot | null,
  confirm: PadButton,
  back: PadButton,
): CardButtons {
  if (!snap) return NONE;
  const down = (b: PadButton) => (snap.buttons[PAD_BUTTONS.indexOf(b)] ?? 0) > 0.5;
  return { confirm: down(confirm), back: down(back), mute: down('y'), expand: down('x') };
}

/** What a frame's fresh presses answer: "知道了", "此后不提示这类", expand, or nothing. */
export function cardPadAnswer(
  prev: CardButtons,
  now: CardButtons,
): 'ok' | 'mute' | 'expand' | null {
  if ((now.confirm && !prev.confirm) || (now.back && !prev.back)) return 'ok';
  if (now.mute && !prev.mute) return 'mute';
  if (now.expand && !prev.expand) return 'expand';
  return null;
}
