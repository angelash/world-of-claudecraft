// Implements `ui_scr_newgame` (ux_and_onboarding.md 3.4): difficulty cards, the ironman
// switch, the guidance level, the model card and the storage warnings; "start" asks through
// `ui_pop_confirm` when legend or ironman is chosen, "back" returns to the title. Thin DOM over
// ./newgame_model.ts; the title (main.ts) owns what starting does.

import './newgame.css';
import { clear, el } from '../../shared_ui/dom';
import { askConfirm } from '../hud/confirm_pop';
import {
  DEFAULT_CHOICES,
  type NewGameChoices,
  type NewGameEnv,
  newGameModel,
} from './newgame_model';

export interface NewGameHandlers {
  start(choices: NewGameChoices): void;
  back(): void;
}

/** Below this much free browser storage the page warns that saving may fail (3.4.2). */
export const LOW_STORAGE_BYTES = 50 * 1024 * 1024;

export class NewGameScreen {
  readonly el: HTMLElement;
  private choices: NewGameChoices;
  private env: NewGameEnv;
  private busy = false;

  constructor(
    parent: HTMLElement,
    env: NewGameEnv,
    private readonly h: NewGameHandlers,
    initial: Partial<NewGameChoices> = {},
  ) {
    this.choices = { ...DEFAULT_CHOICES, ...initial };
    this.env = env;
    this.el = el('div', { className: 'hk-newgame', attrs: { role: 'dialog' } });
    parent.append(this.el);
    this.render();
    void this.checkStorage();
  }

  dispose(): void {
    this.el.remove();
  }

  /** The browser's storage estimate (the web demo warns when it runs short, 3.4.2). */
  private async checkStorage(): Promise<void> {
    const storage = (navigator as Navigator & { storage?: StorageManager }).storage;
    if (!storage?.estimate) return;
    try {
      const e = await storage.estimate();
      if (e.quota === undefined || e.usage === undefined) return;
      const low = e.quota - e.usage < LOW_STORAGE_BYTES;
      if (low !== this.env.storage.low) {
        this.env = { ...this.env, storage: { ...this.env.storage, low } };
        this.render();
      }
    } catch {
      // No estimate: no warning.
    }
  }

  private set(patch: Partial<NewGameChoices>): void {
    this.choices = { ...this.choices, ...patch };
    this.render();
  }

  private render(): void {
    const m = newGameModel(this.choices, this.env);
    const focused = (document.activeElement as HTMLElement | null)?.dataset.focusKey;
    clear(this.el);
    const card = (c: (typeof m.cards)[number]) =>
      el(
        'button',
        {
          className: `hk-newgame-diff${c.selected ? ' selected' : ''}`,
          attrs: { type: 'button', 'aria-pressed': String(c.selected) },
          dataset: { focusKey: `diff.${c.id}` },
          on: { click: () => this.set({ difficulty: c.id }) },
        },
        [
          el('strong', { text: c.name }),
          el(
            'ul',
            {},
            c.lines.map((line) => el('li', { text: line })),
          ),
        ],
      );
    const ironman = el('input', {
      attrs: { type: 'checkbox', id: 'hk-newgame-ironman' },
      dataset: { focusKey: 'ironman' },
    });
    ironman.checked = m.ironman.on;
    ironman.addEventListener('change', () => this.set({ ironman: ironman.checked }));
    const guidance = el(
      'div',
      { className: 'hk-newgame-guidance', attrs: { role: 'radiogroup' } },
      m.guidance.options.map((o) =>
        el('button', {
          className: `hk-btn hk-btn-small${o.selected ? ' hk-btn-primary' : ''}`,
          text: o.label,
          attrs: { type: 'button', role: 'radio', 'aria-checked': String(o.selected) },
          dataset: { focusKey: `guidance.${o.id}` },
          on: { click: () => this.set({ guidance: o.id }) },
        }),
      ),
    );
    this.el.append(
      el('div', { className: 'hk-newgame-card' }, [
        el('h2', { className: 'hk-newgame-title', text: m.title }),
        el('div', { className: 'hk-newgame-diffs' }, m.cards.map(card)),
        el('div', { className: 'hk-newgame-row' }, [
          el('label', { className: 'hk-newgame-switch', attrs: { for: 'hk-newgame-ironman' } }, [
            ironman,
            el('span', { text: m.ironman.label }),
          ]),
          el('div', { className: 'hk-muted', text: m.ironman.note }),
        ]),
        el('div', { className: 'hk-newgame-row' }, [
          el('div', { className: 'hk-newgame-label', text: m.guidance.label }),
          guidance,
        ]),
        el('div', { className: 'hk-newgame-model' }, [
          el('div', { className: 'hk-newgame-label', text: m.model.title }),
          el('div', { text: m.model.text }),
          el('div', { className: 'hk-muted', text: m.model.note }),
        ]),
        ...m.warnings.map((w) => el('div', { className: 'hk-newgame-warning', text: w })),
        el('div', { className: 'hk-newgame-actions' }, [
          el('button', {
            className: 'hk-btn',
            text: m.back,
            attrs: { type: 'button' },
            dataset: { focusKey: 'back' },
            on: { click: () => this.h.back() },
          }),
          el('button', {
            className: 'hk-btn hk-btn-primary',
            text: m.start,
            attrs: { type: 'button' },
            dataset: { focusKey: 'start' },
            on: { click: () => void this.start() },
          }),
        ]),
      ]),
    );
    const again = focused
      ? this.el.querySelector<HTMLElement>(`[data-focus-key="${focused}"]`)
      : null;
    (again ?? this.el.querySelector<HTMLElement>('.hk-newgame-diff.selected'))?.focus();
  }

  private async start(): Promise<void> {
    if (this.busy) return;
    const m = newGameModel(this.choices, this.env);
    if (m.confirm && !(await askConfirm(m.confirm))) return;
    this.busy = true;
    this.h.start({ ...this.choices });
  }
}
