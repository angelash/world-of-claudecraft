import { el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { lookFromEntity } from '../sprites/look';
import { portraitCanvas, type SpriteCache } from '../sprites/sprite_cache';
import type { GameView } from '../view/game_view';
import type { CharacterCardModel } from './character_card_model';
import { kv } from './kit';

export interface CharacterCardActions {
  talk(): void;
  appraise(): void;
  focus?(): void;
  codex?(): void;
}

export function paintCharacterCard(
  root: HTMLElement,
  m: CharacterCardModel,
  view: GameView,
  sprites: SpriteCache,
  actions: CharacterCardActions,
): void {
  const entity = view.entity(m.id);
  if (entity) root.append(portraitCanvas(sprites, lookFromEntity(entity), 64));
  root.append(el('strong', { text: m.name }));
  if (m.subtitle) root.append(el('p', { className: 'hk-muted', text: m.subtitle }));
  root.append(kv(t('ui.pop.charcard.place'), m.place));
  if (m.activity) root.append(kv(t('ui.pop.charcard.activity'), m.activity));
  if (m.attitude) root.append(kv(t('ui.pop.charcard.attitude'), m.attitude));
  if (m.potential) root.append(kv(t('ui.pop.charcard.potential'), m.potential));
  if (m.known.length) {
    root.append(el('h3', { text: t('ui.pop.charcard.known') }));
    for (const n of m.known)
      root.append(
        el('div', { className: 'hk-card' }, [
          el('p', { text: n.text }),
          el('p', {
            className: 'hk-muted',
            text:
              n.age > 0 ? t('ui.pop.charcard.known_age', { source: n.source, t: n.age }) : n.source,
          }),
        ]),
      );
  }
  const button = (label: string, on: () => void, enabled = true) =>
    el('button', {
      className: 'hk-btn hk-btn-small',
      text: label,
      attrs: { type: 'button', ...(enabled ? {} : { disabled: '' }) },
      on: { click: on },
    });
  root.append(
    el('footer', { className: 'hk-row' }, [
      !m.self ? button(t('ui.pop.charcard.talk'), actions.talk, m.canTalk) : null,
      !m.self ? button(t('ui.pop.charcard.appraise'), actions.appraise, m.canAppraise) : null,
      actions.focus && !m.self ? button(t('ui.pop.charcard.focus'), actions.focus) : null,
      actions.codex ? button(t('ui.pop.charcard.codex'), actions.codex) : null,
    ]),
  );
}
