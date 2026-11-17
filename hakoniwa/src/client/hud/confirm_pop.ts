// Implements `ui_pop_confirm` (ux_and_onboarding.md 6.4): the modal confirm popup over
// everything (title screen, new game page, windows, the world). One popup at a time; a second
// request while one is open cancels the first. While it is open it takes every key and the
// pad: Esc or B cancels, Enter, Space or A confirms (or holds the irreversible button); the
// session's input layer gives it the pad while it shows. Thin painter over the pure model in
// ./confirm_model.ts.

import './confirm_pop.css';
import { el, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { readGamepad } from '../input/gamepad_poller';
import { CONFIRM_HOLD_MS, ConfirmPress, type ConfirmRequest, confirmModel } from './confirm_model';

export type { ConfirmRequest } from './confirm_model';

let holdToToggle = false;
let swapConfirmBack = false;
let open: { close(answer: boolean): void } | null = null;

/**
 * The settings the popup reads: holds turned into two presses (18.5) and the pad's confirm
 * and back buttons swapped (16.6 rule 5).
 */
export function setConfirmPrefs(p: { holdToToggle: boolean; swapConfirmBack?: boolean }): void {
  holdToToggle = p.holdToToggle;
  swapConfirmBack = !!p.swapConfirmBack;
}

/** The pad's confirm and back buttons now (standard mapping: A is 0, B is 1). */
function padButtons(): { a: boolean; b: boolean } {
  const pad = readGamepad();
  const down = (i: number) => (pad?.buttons[i] ?? 0) > 0.5;
  return swapConfirmBack ? { a: down(1), b: down(0) } : { a: down(0), b: down(1) };
}

/** A confirm popup is showing (input layers leave the keyboard to it). */
export function confirmOpen(): boolean {
  return open !== null;
}

/** Cancel the open popup, if any (a screen change). */
export function cancelConfirm(): void {
  open?.close(false);
}

/** Ask; resolves true on confirm, false on cancel. */
export function askConfirm(req: ConfirmRequest): Promise<boolean> {
  open?.close(false);
  const m = confirmModel(req, { holdToToggle });
  const press = new ConfirmPress(m);
  return new Promise<boolean>((resolve) => {
    const fill = el('span', { className: 'hk-confirm-fill' });
    const ok = el(
      'button',
      {
        className: `hk-btn hk-btn-primary hk-confirm-ok${m.danger ? ' danger' : ''}`,
        attrs: { type: 'button' },
      },
      [fill, el('span', { className: 'hk-confirm-ok-text', text: m.confirm })],
    );
    const cancel = el('button', {
      className: 'hk-btn hk-confirm-cancel',
      text: m.cancel,
      attrs: { type: 'button' },
    });
    const how = el('div', { className: 'hk-confirm-how', text: m.how });
    how.hidden = !m.how;
    const card = el(
      'div',
      { className: 'hk-confirm-card', attrs: { role: 'alertdialog', 'aria-modal': 'true' } },
      [
        el('div', { className: 'hk-confirm-title', text: m.title }),
        el('div', { className: 'hk-confirm-body', text: m.body }),
        el('div', { className: 'hk-confirm-buttons' }, [cancel, ok]),
        how,
      ],
    );
    const root = el('div', { className: 'hk-confirm' }, [card]);
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      fill.style.width = `${Math.round(press.progress(now) * 100)}%`;
      if (press.held(now)) {
        close(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (press.down(performance.now())) {
        close(true);
        return;
      }
      if (m.twoStep) {
        ok.classList.add('armed');
        setText(how, t('ui.pop.confirm.armed'));
      }
      if (m.holdMs > 0) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
      }
    };
    const stop = () => {
      press.up();
      cancelAnimationFrame(raf);
      fill.style.width = '0%';
    };
    const onKey = (ev: KeyboardEvent) => {
      ev.stopPropagation();
      if (ev.code === 'Escape') {
        ev.preventDefault();
        if (ev.type === 'keydown') close(false);
        return;
      }
      if (ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'NumpadEnter') {
        ev.preventDefault();
        if (document.activeElement === cancel) {
          if (ev.type === 'keydown') close(false);
          return;
        }
        if (ev.type === 'keydown' && !ev.repeat) start();
        else if (ev.type === 'keyup') stop();
      }
    };
    // The pad (6.4): B cancels, A confirms or holds; buttons already down when the popup opened
    // (the press that asked) count only once let go.
    let pad = padButtons();
    let padRaf = 0;
    const padLoop = () => {
      const now = padButtons();
      if (now.b && !pad.b) {
        close(false);
        return;
      }
      if (now.a && !pad.a) start();
      else if (!now.a && pad.a) stop();
      pad = now;
      if (open === handle) padRaf = requestAnimationFrame(padLoop);
    };
    const close = (answer: boolean) => {
      if (open !== handle) return;
      open = null;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(padRaf);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('keyup', onKey, true);
      root.remove();
      resolve(answer);
    };
    const handle = { close };
    ok.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      start();
    });
    ok.addEventListener('pointerup', stop);
    ok.addEventListener('pointerleave', stop);
    cancel.addEventListener('click', () => close(false));
    root.addEventListener('pointerdown', (ev) => {
      if (ev.target === root) close(false);
    });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKey, true);
    open = handle;
    document.body.append(root);
    padRaf = requestAnimationFrame(padLoop);
    // Irreversible actions start on cancel, so a stray Enter never confirms them.
    (m.danger ? cancel : ok).focus();
  });
}

/** The hold time, for tests and the tutorial text. */
export const CONFIRM_HOLD = CONFIRM_HOLD_MS;
