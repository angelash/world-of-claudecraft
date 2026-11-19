// Session-owned, non-pausing player cards. Only incoming player damage in a rolling
// ten-second window is kept; a death freezes that record before the sources disappear.

import type { AnyWorldEvent } from '../../core/contracts';
import { t } from '../../shared_ui/i18n';
import {
  appraisalPopupData,
  characterCardData,
  DEATH_REVIEW_TICKS,
  visibleCardSubject,
} from '../adapters/player_cards';
import type { SpriteCache } from '../sprites/sprite_cache';
import type { ClientAdapters } from '../view/adapters';
import type { ClientCommand, GameView } from '../view/game_view';
import { paintAppraisal } from './appraisal_pop';
import { paintCharacterCard } from './character_card';
import { paintDeathReview } from './death_review';
import { type DeathReviewModel, deathReviewData } from './death_review_model';
import { PlayerPopupShell } from './player_popup_shell';

export interface PlayerPopupsHost {
  root: HTMLElement;
  view: GameView;
  adapters: ClientAdapters;
  sprites: SpriteCache;
  queue(commands: readonly ClientCommand[]): void;
  focus?(entityId: string): void;
  openCodex?(): void;
  characterOpened?(): void;
}

export class PlayerPopups {
  private character: PlayerPopupShell;
  private appraisal: PlayerPopupShell;
  private death: PlayerPopupShell;
  private characterId: string | null = null;
  private appraisalResult: Extract<AnyWorldEvent, { kind: 'cognition.appraised' }>['data'] | null =
    null;
  private deathModel: DeathReviewModel | null = null;
  private history: AnyWorldEvent[] = [];
  private deathTick: number | null = null;
  private signatures = new Map<string, string>();

  constructor(private readonly host: PlayerPopupsHost) {
    this.character = new PlayerPopupShell(host.root, 'charcard', () => this.closeCharacter());
    this.appraisal = new PlayerPopupShell(host.root, 'appraisal', () => this.closeAppraisal());
    this.death = new PlayerPopupShell(host.root, 'death_review', () => this.closeDeath());
  }

  openCharacter(entityId: string): void {
    const entity = visibleCardSubject(this.host.view, entityId);
    if (!entity) return;
    if (entity.kind === 'monster') {
      this.host.openCodex?.();
      return;
    }
    this.characterId = entityId;
    this.signatures.delete('character');
    this.update();
    if (!this.character.el.hidden) this.host.characterOpened?.();
  }

  event(ev: AnyWorldEvent): void {
    if (
      ev.kind === 'combat.damage' &&
      ev.data.targetId === this.host.view.playerId() &&
      ev.data.amount > 0
    ) {
      this.history = this.history.filter(
        (old) => old.kind === 'combat.damage' && old.tick >= ev.tick - DEATH_REVIEW_TICKS,
      );
      this.history.push(ev);
      return;
    }
    if (ev.kind === 'combat.player_returned') {
      this.history = [...this.history.filter((old) => old.kind === 'combat.damage'), ev];
      this.update();
      return;
    }
    if (ev.kind === 'cognition.appraised') {
      if (appraisalPopupData(this.host.view, this.host.adapters, ev.data)) {
        this.appraisalResult = ev.data;
        this.signatures.delete('appraisal');
        this.update();
      }
    }
    if (ev.kind === 'entity.died' && ev.data.id === this.host.view.playerId()) {
      this.deathTick = ev.tick;
      this.deathModel = null;
      this.signatures.delete('death');
      this.update();
    }
  }

  private closeCharacter(): void {
    this.characterId = null;
    this.character.hide();
  }
  private closeAppraisal(): void {
    this.appraisalResult = null;
    this.appraisal.hide();
  }
  private closeDeath(): void {
    this.deathTick = null;
    this.deathModel = null;
    this.death.hide();
  }

  get anyOpen(): boolean {
    return !this.character.el.hidden || !this.appraisal.el.hidden || !this.death.el.hidden;
  }

  closeTop(): boolean {
    if (!this.death.el.hidden) {
      this.closeDeath();
      return true;
    }
    if (!this.appraisal.el.hidden) {
      this.closeAppraisal();
      return true;
    }
    if (!this.character.el.hidden) {
      this.closeCharacter();
      return true;
    }
    return false;
  }

  private changed(id: string, model: unknown): boolean {
    const signature = JSON.stringify(model);
    if (this.signatures.get(id) === signature) return false;
    this.signatures.set(id, signature);
    return true;
  }

  update(): void {
    const { view, adapters, queue } = this.host;
    if (this.characterId) {
      const model = characterCardData(view, adapters, this.characterId);
      if (!model) {
        this.characterId = null;
        this.character.hide();
      } else if (this.changed('character', model)) {
        this.character.show(t('ui.pop.charcard.title'));
        paintCharacterCard(this.character.body, model, view, this.host.sprites, {
          talk: () => queue(adapters.interact?.interact(view, model.id) ?? []),
          appraise: () => queue(adapters.appraise?.appraise(view, model.id) ?? []),
          focus: this.host.focus ? () => this.host.focus?.(model.id) : undefined,
          codex: this.host.openCodex,
        });
      }
    }
    if (this.appraisalResult) {
      const model = appraisalPopupData(view, adapters, this.appraisalResult);
      if (!model) {
        this.appraisalResult = null;
        this.appraisal.hide();
      } else if (this.changed('appraisal', model)) {
        this.appraisal.show(t('ui.pop.appraisal.title'));
        paintAppraisal(this.appraisal.body, model);
      }
    }
    if (this.deathTick !== null) {
      this.deathModel = deathReviewData(
        view,
        this.history,
        this.deathTick,
        this.deathModel ?? undefined,
      );
      if (this.deathModel && this.changed('death', this.deathModel)) {
        this.death.show(t('ui.pop.death.title'));
        paintDeathReview(this.death.body, this.deathModel, () => this.closeDeath());
      }
    }
  }

  dispose(): void {
    this.character.dispose();
    this.appraisal.dispose();
    this.death.dispose();
  }
}
