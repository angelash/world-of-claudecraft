// Implements `ui_mode_creator`, the spirit mirror (ux_and_onboarding.md 3.4.3): the standee
// preview on the left (turnable through four views), the page tabs (body, face, hair, outfit)
// and their option rows of cells on the right, "随机", "还原" and "照好了" at the bottom. Keyboard
// and pad both run through the `creator` input context (contexts.ts, pad_bindings.ts): its
// actions reach the mirror as CreatorAction through creator_wiring.ts, so every control is
// reachable without a pointer and Tab stays the focus key of the panel's own buttons (18.5).
// Writes are elided. Thin painter over creator_model.ts.

import './creator.css';
import { el, setClass, setText } from '../../../shared_ui/dom';
import type { CreatorAction, CreatorView } from './creator_model';

export interface CreatorHandlers {
  act(a: CreatorAction): void;
  done(): void;
}

export class CreatorPanel {
  readonly el: HTMLElement;
  private readonly title = el('div', { className: 'hk-creator-title' });
  private readonly preview = el('div', { className: 'hk-creator-preview', attrs: { role: 'img' } });
  private readonly note = el('div', { className: 'hk-creator-note' });
  private readonly tabs = el('div', { className: 'hk-creator-tabs', attrs: { role: 'tablist' } });
  private readonly rows = el('div', { className: 'hk-creator-rows' });
  private readonly turnLeft: HTMLButtonElement;
  private readonly turnRight: HTMLButtonElement;
  private readonly randomBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly doneBtn: HTMLButtonElement;
  private sig = '';
  private previewSig = '';
  constructor(private readonly h: CreatorHandlers) {
    const btn = (className: string, on: () => void) =>
      el('button', {
        className: `hk-btn ${className}`,
        attrs: { type: 'button' },
        on: { click: on },
      });
    this.turnLeft = btn('hk-btn-small', () => this.h.act({ type: 'turn', delta: -1 }));
    this.turnRight = btn('hk-btn-small', () => this.h.act({ type: 'turn', delta: 1 }));
    this.randomBtn = btn('', () => this.h.act({ type: 'random', rand: Math.random }));
    this.resetBtn = btn('', () => this.h.act({ type: 'reset' }));
    this.doneBtn = btn('hk-btn-primary', () => this.h.done());
    this.el = el(
      'div',
      { className: 'hk-creator', attrs: { role: 'dialog', 'aria-modal': 'true' } },
      [
        el('div', { className: 'hk-creator-mirror' }, [
          this.preview,
          el('div', { className: 'hk-creator-turn' }, [this.turnLeft, this.turnRight]),
          this.note,
        ]),
        el('div', { className: 'hk-creator-side' }, [
          this.title,
          this.tabs,
          this.rows,
          el('div', { className: 'hk-creator-foot' }, [
            this.randomBtn,
            this.resetBtn,
            this.doneBtn,
          ]),
        ]),
      ],
    );
    this.el.hidden = true;
  }

  dispose(): void {
    // the keys come through the `creator` input context (creator_wiring.ts): nothing to undo
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /**
   * Press the panel control the keyboard focus is on (Enter on a focused tab, cell or bottom
   * button presses it, 18.5); false when the focus is elsewhere.
   */
  activateFocused(): boolean {
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    if (this.el.hidden || !(a instanceof HTMLButtonElement) || !this.el.contains(a)) return false;
    a.click();
    return true;
  }

  /**
   * Paint the mirror (null closes it). `standee` is the preview canvas of the current look and
   * facing, with `previewKey` naming it so an unchanged preview is not redrawn.
   */
  render(
    v: CreatorView | null,
    standee: (() => HTMLCanvasElement | null) | null,
    previewKey = '',
  ): void {
    if (!v) {
      if (!this.el.hidden) this.el.hidden = true;
      this.sig = '';
      this.previewSig = '';
      return;
    }
    this.el.hidden = false;
    setText(this.title, v.title);
    setText(this.note, v.note);
    this.note.hidden = !v.note;
    setText(this.turnLeft, v.turnLeft);
    setText(this.turnRight, v.turnRight);
    setText(this.randomBtn, v.random);
    setText(this.resetBtn, v.reset);
    setText(this.doneBtn, v.done);
    if (previewKey !== this.previewSig && standee) {
      this.previewSig = previewKey;
      const canvas = standee();
      this.preview.replaceChildren(...(canvas ? [canvas] : []));
      this.preview.setAttribute('aria-label', v.preview);
    }
    if (v.key === this.sig) return;
    this.sig = v.key;
    this.tabs.replaceChildren(
      ...v.pages.map((p, i) =>
        el('button', {
          className: `hk-btn hk-btn-small hk-creator-tab${p.active ? ' active' : ''}`,
          text: p.label,
          attrs: { type: 'button', role: 'tab', 'aria-selected': p.active ? 'true' : 'false' },
          on: { click: () => this.h.act({ type: 'goto_page', page: i }) },
        }),
      ),
    );
    this.rows.replaceChildren(
      ...v.rows.map((r) =>
        el('div', { className: `hk-creator-row${r.focused ? ' focused' : ''}` }, [
          el('div', { className: 'hk-creator-row-label', text: r.label }),
          el(
            'div',
            { className: 'hk-creator-cells' },
            r.cells.map((c) => {
              const cell = el(
                'button',
                {
                  className: `hk-creator-cell${c.selected ? ' selected' : ''}${c.swatch ? ' swatch' : ''}`,
                  attrs: {
                    type: 'button',
                    'aria-pressed': c.selected ? 'true' : 'false',
                    'aria-label': c.label,
                  },
                  on: { click: () => this.h.act({ type: 'pick', row: r.id, index: c.index }) },
                },
                c.swatch
                  ? c.swatch.map((color) => {
                      const s = el('span', { className: 'hk-creator-chip' });
                      s.style.background = color;
                      return s;
                    })
                  : [c.label],
              );
              setClass(cell, 'two', (c.swatch?.length ?? 0) > 1);
              return cell;
            }),
          ),
        ]),
      ),
    );
  }
}
