// Title screen: start a new journey (the new game page, ui_scr_newgame) or load a save slot
// through the shared save list (ui_scr_load, ux_and_onboarding.md 3.5). Thin DOM.

import { clear, el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { SaveList } from '../hud/save_list';
import { saveListModel } from '../hud/save_list_model';
import type { ClientSaves, SlotId } from '../hud/save_slots';
import { type FirstRunOptions, FirstRunScreen } from '../screens/first_run';
import { latestTitleSlot } from '../screens/title_model';
import { TitleScene, type TitleSceneOptions } from '../screens/title_scene';
import '../screens/title.css';

export interface BootActions {
  newGame(seed?: number): void;
  load(slot: SlotId): void;
}

export interface BootOptions {
  firstRun?: FirstRunOptions;
  scene?: TitleSceneOptions;
}

export class BootScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private status: HTMLElement;
  private firstRun: FirstRunScreen | null = null;
  private scene: TitleScene | null = null;

  constructor(
    parent: HTMLElement,
    private readonly saves: ClientSaves,
    private readonly actions: BootActions,
    private readonly devMode: boolean,
    private readonly devSeed?: number,
    options: BootOptions = {},
  ) {
    this.body = el('div', { className: 'hk-boot-body' });
    this.status = el('p', { className: 'hk-boot-status' });
    this.el = el('div', { className: 'hk-boot' }, [
      el('div', { className: 'hk-boot-card' }, [
        el('h1', { className: 'hk-boot-title', text: t('ui.common.game_title') }),
        el('p', { className: 'hk-boot-sub', text: t('ui.scr.title.subtitle') }),
        this.body,
        this.status,
        devMode
          ? el('div', { className: 'hk-dev-badge', text: t('ui.scr.title.dev_badge') })
          : null,
      ]),
    ]);
    parent.append(this.el);
    this.showMain();
    if (options.scene) this.scene = new TitleScene(this.el, saves, options.scene);
    if (options.firstRun && !options.firstRun.done) {
      this.body.inert = true;
      this.firstRun = new FirstRunScreen(this.el, options.firstRun, () => {
        this.firstRun = null;
        this.body.inert = false;
        this.body.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
      });
    }
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  private showMain(): void {
    clear(this.body);
    const seedInput = this.devMode
      ? el('input', {
          className: 'hk-input',
          attrs: {
            type: 'number',
            placeholder: t('ui.scr.title.dev_seed'),
            'aria-label': t('ui.scr.title.dev_seed'),
          },
        })
      : null;
    if (seedInput && this.devSeed !== undefined) seedInput.value = String(this.devSeed);
    const hasSaves =
      Object.keys(this.saves.list()).length > 0 || Object.keys(this.saves.problems()).length > 0;
    const latest = latestTitleSlot(this.saves.list(), this.saves.problems());
    if (latest?.meta)
      this.body.append(
        el('p', {
          className: 'hk-boot-summary',
          text: t('ui.scr.title.resume.summary', {
            place: latest.meta.mapName,
            date: latest.meta.date,
          }),
        }),
      );
    if (latest?.problem)
      this.body.append(
        el('p', { className: 'hk-muted', text: t('ui.scr.title.resume.latest_broken') }),
      );
    if (latest)
      this.body.append(
        el('button', {
          className: 'hk-btn hk-btn-wide hk-btn-primary',
          text: t('ui.scr.title.resume.continue'),
          attrs: { type: 'button' },
          on: {
            click: () => {
              this.setStatus(t('ui.scr.boot.loading'));
              this.actions.load(latest.slot);
            },
          },
        }),
      );
    this.body.append(
      el('button', {
        className: 'hk-btn hk-btn-wide hk-btn-primary',
        text: t('ui.scr.title.new_game'),
        attrs: { type: 'button' },
        on: {
          click: () => {
            const raw = seedInput?.value.trim();
            const seed = raw && Number.isFinite(Number(raw)) ? Number(raw) | 0 : undefined;
            // The new game page (ui_scr_newgame) comes first; it starts the build.
            this.actions.newGame(seed);
          },
        },
      }),
      el('button', {
        className: 'hk-btn hk-btn-wide',
        text: t('ui.scr.title.load_game'),
        attrs: hasSaves ? { type: 'button' } : { type: 'button', disabled: '' },
        on: { click: () => this.showLoad() },
      }),
      ...(seedInput ? [seedInput] : []),
    );
  }

  private showLoad(): void {
    clear(this.body);
    this.el.classList.add('loading-list');
    const list: SaveList = new SaveList({
      load: (slot) => {
        this.setStatus(t('ui.scr.boot.loading'));
        setTimeout(() => this.actions.load(slot), 16);
      },
      remove: (slot) => {
        const redraw = () => {
          list.invalidate();
          paint();
        };
        this.saves.remove(slot).then(redraw, (err) => {
          console.warn('[saves] delete failed', err);
          redraw();
        });
      },
    });
    const paint = () =>
      list.update(
        saveListModel({
          mode: 'title',
          list: this.saves.list(),
          problems: this.saves.problems(),
          block: null,
          run: null,
          manualLimit: this.saves.manualLimit,
        }),
      );
    paint();
    this.body.append(list.el);
    this.body.append(
      el('button', {
        className: 'hk-btn hk-btn-wide',
        text: t('ui.scr.title.back'),
        attrs: { type: 'button' },
        on: {
          click: () => {
            this.el.classList.remove('loading-list');
            this.showMain();
          },
        },
      }),
    );
  }

  dispose(): void {
    this.firstRun?.dispose();
    this.scene?.dispose();
    this.el.remove();
  }
}
