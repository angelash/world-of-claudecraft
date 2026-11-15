// Title screen: start a new journey or load a save slot. Thin DOM.

import { clear, el } from '../../shared_ui/dom';
import { fmt, T } from '../../shared_ui/text';
import { type ClientSaves, LOAD_SLOTS, type SlotId, slotLabel } from '../hud/save_slots';

export interface BootActions {
  newGame(seed?: number): void;
  load(slot: SlotId): void;
}

export class BootScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private status: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly saves: ClientSaves,
    private readonly actions: BootActions,
    private readonly devMode: boolean,
    private readonly devSeed?: number,
  ) {
    this.body = el('div', { className: 'hk-boot-body' });
    this.status = el('p', { className: 'hk-boot-status' });
    this.el = el('div', { className: 'hk-boot' }, [
      el('div', { className: 'hk-boot-card' }, [
        el('h1', { className: 'hk-boot-title', text: T.app.title }),
        el('p', { className: 'hk-boot-sub', text: T.app.subtitle }),
        this.body,
        this.status,
        devMode ? el('div', { className: 'hk-dev-badge', text: T.app.devBadge }) : null,
      ]),
    ]);
    parent.append(this.el);
    this.showMain();
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  private showMain(): void {
    clear(this.body);
    const seedInput = this.devMode
      ? el('input', {
          className: 'hk-input',
          attrs: { type: 'number', placeholder: T.app.devSeed, 'aria-label': T.app.devSeed },
        })
      : null;
    if (seedInput && this.devSeed !== undefined) seedInput.value = String(this.devSeed);
    const hasSaves = Object.keys(this.saves.list()).length > 0;
    this.body.append(
      el('button', {
        className: 'hk-btn hk-btn-wide hk-btn-primary',
        text: T.app.newGame,
        attrs: { type: 'button' },
        on: {
          click: () => {
            const raw = seedInput?.value.trim();
            const seed = raw && Number.isFinite(Number(raw)) ? Number(raw) | 0 : undefined;
            this.setStatus(T.app.loading);
            // Let the status paint before the synchronous world build.
            setTimeout(() => this.actions.newGame(seed), 16);
          },
        },
      }),
      el('button', {
        className: 'hk-btn hk-btn-wide',
        text: T.app.loadGame,
        attrs: hasSaves ? { type: 'button' } : { type: 'button', disabled: '' },
        on: { click: () => this.showLoad() },
      }),
      ...(seedInput ? [seedInput] : []),
    );
  }

  private showLoad(): void {
    clear(this.body);
    const list = this.saves.list();
    let any = false;
    for (const slot of LOAD_SLOTS) {
      const meta = list[slot];
      if (!meta) continue;
      any = true;
      this.body.append(
        el(
          'button',
          {
            className: 'hk-btn hk-btn-wide hk-boot-slot',
            attrs: { type: 'button' },
            on: {
              click: () => {
                this.setStatus(T.app.loading);
                setTimeout(() => this.actions.load(slot), 16);
              },
            },
          },
          [
            el('strong', { text: slotLabel(slot) }),
            el('span', { text: fmt(T.saves.meta, { date: meta.date, map: meta.mapName }) }),
          ],
        ),
      );
    }
    if (!any) this.body.append(el('p', { className: 'hk-muted', text: T.app.noSaves }));
    this.body.append(
      el('button', {
        className: 'hk-btn hk-btn-wide',
        text: T.app.back,
        attrs: { type: 'button' },
        on: { click: () => this.showMain() },
      }),
    );
  }

  dispose(): void {
    this.el.remove();
  }
}
