// DOM input scopes shared by the session and the title. Native dialogs own keyboard
// defaults; the pad navigates the same visible, non-inert controls as the keyboard.

import { type FocusMove, type FocusRect, moveFocus } from './focus_nav';
import { PadReader, type PadSnapshot } from './gamepad';
import type { PadButton } from './pad_bindings';

export const INPUT_CONTROLS =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function inputAvailable(element: HTMLElement): boolean {
  return (
    !element.closest('[hidden], [inert], [aria-hidden="true"], dialog:not([open])') &&
    element.getClientRects().length > 0
  );
}

export function inputControls(scope: Element): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(INPUT_CONTROLS)].filter(inputAvailable);
}

/** Explicit aria-modal also identifies native dialogs in DOM-only test hosts. */
export function nativeModalScope(root: ParentNode = document): HTMLDialogElement | null {
  const dialogs = [...root.querySelectorAll<HTMLDialogElement>('dialog[open]')];
  return (
    dialogs.reverse().find((dialog) => {
      if (dialog.closest('[hidden], [inert]')) return false;
      return dialog.matches(':modal') || dialog.getAttribute('aria-modal') === 'true';
    }) ?? null
  );
}

/** The pre-game modal may be an ARIA dialog such as the first-run guide. */
export function menuModalScope(root: HTMLElement): HTMLElement | null {
  const native = nativeModalScope(root.ownerDocument);
  if (native) return native;
  return (
    [...root.querySelectorAll<HTMLElement>('[aria-modal="true"]')].reverse().find(inputAvailable) ??
    null
  );
}

export function moveDomFocus(
  scope: Element,
  move: FocusMove,
  focus: (element: HTMLElement) => void,
): boolean {
  const list = inputControls(scope);
  const rects: FocusRect[] = list.map((element, i) => {
    const rect = element.getBoundingClientRect();
    return { id: String(i), x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  });
  const current = list.indexOf(document.activeElement as HTMLElement);
  const next = moveFocus(rects, current >= 0 ? String(current) : null, move);
  const target = next === null ? undefined : list[Number(next)];
  if (!target) return false;
  focus(target);
  return true;
}

/** A pad cancel follows native dialog cancellation, including a prevented cancel. */
export function cancelNativeModal(dialog: HTMLDialogElement): void {
  if (typeof dialog.requestClose === 'function') dialog.requestClose();
  else if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
}

/** Consumes held buttons when a new scope takes over, so opening A cannot activate it. */
export class DomPadNavigation {
  private readonly reader = new PadReader();
  private scope: Element | null = null;

  constructor(private readonly focus: (element: HTMLElement) => void) {}

  frame(
    scope: Element | null,
    snapshot: PadSnapshot | null,
    now: number,
    confirm: PadButton,
    back: PadButton,
    cancel: () => void,
  ): void {
    const frame = this.reader.read(snapshot, now);
    if (scope !== this.scope) {
      this.scope = scope;
      return;
    }
    if (!scope) return;
    for (const event of frame.events) {
      if (event.type === 'gesture' && event.stick === 'left')
        moveDomFocus(scope, event.dir, this.focus);
      if (event.type !== 'down' && event.type !== 'repeat') continue;
      if (['up', 'down', 'left', 'right'].includes(event.button))
        moveDomFocus(scope, event.button as FocusMove, this.focus);
      if (event.type !== 'down') continue;
      if (event.button === confirm) {
        const active = document.activeElement as HTMLElement | null;
        if (active && inputControls(scope).includes(active)) active.click();
        else moveDomFocus(scope, 'next', this.focus);
      } else if (event.button === back) cancel();
    }
  }
}
