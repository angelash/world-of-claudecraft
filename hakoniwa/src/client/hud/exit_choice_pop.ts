// The destination chooser of a gate with several ways out (exit_choice_model.ts): a modal
// list over the world in the confirm popup's look. Mouse: click a way. Keyboard: number keys
// pick, arrow keys move, Enter or Space takes the highlighted way, Esc leaves it. Pad: the
// d-pad moves, A takes, B leaves. While it shows it holds the world and takes every key and
// the pad, like the confirm popup (6.4). Thin painter over the pure model.

import './confirm_pop.css';
import './exit_choice_pop.css';
import { el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { readGamepad } from '../input/gamepad_poller';
import { type ExitOption, moveCursor, optionByNumber } from './exit_choice_model';

let open: { close(id: string | null): void } | null = null;

/** The chooser is showing (the input layer and the world leave the keys and the clock to it). */
export function exitChoiceOpen(): boolean {
  return open !== null;
}

export function cancelExitChoice(): void {
  open?.close(null);
}

/** Ask where to go; resolves the exit id, or null when the player stays. */
export function askExitChoice(options: readonly ExitOption[]): Promise<string | null> {
  open?.close(null);
  return new Promise<string | null>((resolve) => {
    let cursor = moveCursor(options, -1, 1);
    const buttons = options.map((o, i) =>
      el('button', {
        className: `hk-btn${o.open ? '' : ' disabled'}`,
        text: o.open
          ? t('ui.pop.exit_choice.option', { n: i + 1, label: o.label })
          : t('ui.pop.exit_choice.locked', { n: i + 1, label: o.label }),
        attrs: { type: 'button', ...(o.open ? {} : { disabled: '' }) },
      }),
    );
    const cancel = el('button', {
      className: 'hk-btn hk-confirm-cancel',
      text: t('ui.pop.exit_choice.stay'),
      attrs: { type: 'button' },
    });
    const list = el('div', { className: 'hk-exit-choice-list' }, buttons);
    const card = el(
      'div',
      { className: 'hk-confirm-card', attrs: { role: 'dialog', 'aria-modal': 'true' } },
      [
        el('div', { className: 'hk-confirm-title', text: t('ui.pop.exit_choice.title') }),
        el('div', { className: 'hk-confirm-body', text: t('ui.pop.exit_choice.body') }),
        list,
        el('div', { className: 'hk-confirm-buttons' }, [cancel]),
      ],
    );
    const root = el('div', { className: 'hk-confirm' }, [card]);
    const focus = () => buttons[cursor]?.focus();
    const take = (o: ExitOption | null | undefined) => {
      if (o?.open) close(o.id);
    };
    const onKey = (ev: KeyboardEvent) => {
      // a release always goes through, so a key held when the chooser opened is let go
      if (ev.type !== 'keydown') return;
      ev.stopPropagation();
      if (ev.repeat) {
        ev.preventDefault();
        return;
      }
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(ev.code);
      if (digit) {
        ev.preventDefault();
        take(optionByNumber(options, Number(digit[1])));
      } else if (ev.code === 'Escape') {
        ev.preventDefault();
        close(null);
      } else if (ev.code === 'ArrowDown' || ev.code === 'ArrowUp') {
        ev.preventDefault();
        cursor = moveCursor(options, cursor, ev.code === 'ArrowDown' ? 1 : -1);
        focus();
      } else if (ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'NumpadEnter') {
        ev.preventDefault();
        if (document.activeElement === cancel) close(null);
        else take(options[cursor]);
      }
    };
    // The pad: buttons already down when the chooser opened count only once let go.
    const padNow = () => {
      const pad = readGamepad();
      const down = (i: number) => (pad?.buttons[i] ?? 0) > 0.5;
      return { a: down(0), b: down(1), up: down(12), down: down(13) };
    };
    let pad = padNow();
    let raf = 0;
    const padLoop = () => {
      const now = padNow();
      if (now.b && !pad.b) {
        close(null);
        return;
      }
      if (now.a && !pad.a) take(options[cursor]);
      if ((now.down && !pad.down) || (now.up && !pad.up)) {
        cursor = moveCursor(options, cursor, now.down && !pad.down ? 1 : -1);
        focus();
      }
      pad = now;
      if (open === handle) raf = requestAnimationFrame(padLoop);
    };
    const close = (id: string | null) => {
      if (open !== handle) return;
      open = null;
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve(id);
    };
    const handle = { close };
    buttons.forEach((b, i) => {
      b.addEventListener('click', () => take(options[i]));
    });
    cancel.addEventListener('click', () => close(null));
    root.addEventListener('pointerdown', (ev) => {
      if (ev.target === root) close(null);
    });
    document.addEventListener('keydown', onKey, true);
    open = handle;
    document.body.append(root);
    raf = requestAnimationFrame(padLoop);
    focus();
  });
}
