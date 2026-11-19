// The M1 player cards disclose a live visible subject and facts the player already knows.
// Private memories, plans, raw relationships, concealed power and unrevealed potential never
// cross this adapter. Death bookkeeping is read-only; revival remains owned by combat.

import { contentKey } from '../../core/content_key';
import type { AnyWorldEvent } from '../../core/contracts';
import { TICK_HZ, TICKS_PER_GAME_HOUR } from '../../core/time';
import { t, tOr } from '../../shared_ui/i18n';
import { appraisalLog, pressureSense } from '../../systems/cognition';
import { canTalkTo, TALK_RANGE } from '../../systems/dialogue';
import { npcIdOfEntity, npcView } from '../../systems/npc';
import { codexPage } from '../../systems/records';
import type { Entity } from '../../systems/world/types';
import type { ClientAdapters } from '../view/adapters';
import type { GameView } from '../view/game_view';
import { flagOn } from '../view/game_view';
import { type AppraisalCardModel, appraisalCardModel } from '../windows/appraisal_model';
import type { CharacterCardModel } from '../windows/character_card_model';
import { mortalName } from '../windows/records/mortal_name';

export function visibleCardSubject(view: GameView, id: string) {
  const player = view.player();
  const target = view.entity(id);
  return target && !target.hidden && player?.mapId === target.mapId ? target : null;
}

export function cardSubjectName(view: GameView, entity: Readonly<Entity>): string {
  const table =
    entity.kind === 'monster'
      ? 'monsters'
      : view.content.npcs?.some((n) => n.id === entity.ref)
        ? 'npcs'
        : 'companions';
  const name = entity.ref ? tOr(contentKey(table, entity.ref, 'name'), entity.name) : entity.name;
  const known = flagOn(view.flag('term.dian_known'));
  return entity.kind === 'monster' && entity.ref && !known
    ? tOr(contentKey('monsters', entity.ref, 'nameMortal'), mortalName(name, false))
    : mortalName(name, known);
}

function potentialText(
  view: GameView,
  entity: Readonly<Entity>,
  potential: string | undefined,
): string {
  if (!potential) return '';
  const npc = view.content.npcs?.find((n) => n.id === entity.ref);
  // An older reading remains what was actually learned, even if content later changes.
  return entity.ref && npc?.potential === potential
    ? tOr(contentKey('npcs', entity.ref, 'potential'), potential)
    : potential;
}

export function characterCardData(
  view: GameView,
  adapters: ClientAdapters,
  id: string,
): CharacterCardModel | null {
  const entity = visibleCardSubject(view, id);
  if (!entity || entity.kind === 'monster' || entity.kind === 'object' || entity.kind === 'unit')
    return null;
  const persona = npcIdOfEntity(view.world, id);
  const npc = persona ? npcView(view.world, view.content, persona) : undefined;
  const frame = adapters.unitFrames?.unitFrame(view, id, view.playerId());
  const note = codexPage(view.world, view.content, 'people').find(
    (row) => row.id === (entity.ref ?? entity.id),
  );
  const appraisal = appraisalLog(view.world)
    .filter((r) => r.observerId === view.playerId() && r.targetId === id)
    .at(-1);
  const player = view.player();
  const map = view.map(entity.mapId);
  const self = id === view.playerId();
  return {
    id,
    name: cardSubjectName(view, entity),
    subtitle: frame?.subtitle ?? '',
    place: map ? tOr(contentKey('maps', map.id, 'name'), map.name) : '',
    activity: npc ? t(npc.activityName) : '',
    attitude: npc ? t(npc.relationBand) : '',
    known: (note?.notes ?? []).slice(-8).map((n) => ({
      text: t(n.text),
      source: tOr(`ui.win.codex.source.${n.source}`, t('ui.win.codex.source.seen')),
      age: Math.floor(Math.max(0, view.tick - n.tick) / TICKS_PER_GAME_HOUR) * TICKS_PER_GAME_HOUR,
    })),
    potential:
      !self && flagOn(view.flag('feature.appraise_talent'))
        ? potentialText(view, entity, appraisal?.potential)
        : '',
    canTalk:
      !self &&
      !!player?.alive &&
      entity.alive &&
      Math.hypot(entity.x - player.x, entity.y - player.y) <= TALK_RANGE &&
      !!adapters.conversation &&
      !!adapters.interact &&
      canTalkTo(view.world, id),
    canAppraise:
      !self &&
      entity.alive &&
      !!adapters.appraise &&
      !!player?.alive &&
      Math.hypot(entity.x - player.x, entity.y - player.y) <= 8,
    self,
  };
}

export function appraisalPopupData(
  view: GameView,
  _adapters: ClientAdapters,
  result: Extract<AnyWorldEvent, { kind: 'cognition.appraised' }>['data'],
): AppraisalCardModel | null {
  const self = result.targetId === view.playerId();
  if (result.observerId !== view.playerId() && !self) return null;
  const entity = visibleCardSubject(view, result.targetId);
  if (!entity) return null;
  const pressure = pressureSense(view.world, view.content, view.playerId(), result.targetId);
  const model = appraisalCardModel({
    result,
    name: cardSubjectName(view, entity),
    self,
    talent: flagOn(view.flag('feature.appraise_talent')),
    pressure: pressure && pressure.band !== 'none' ? t(pressure.text) : '',
  });
  return {
    ...model,
    reading: mortalName(model.reading, flagOn(view.flag('term.dian_known'))),
    potential: potentialText(view, entity, model.potential),
  };
}

export const DEATH_REVIEW_TICKS = 10 * TICK_HZ;

export function deathDamageRows(
  events: readonly AnyWorldEvent[],
  playerId: string,
  deathTick: number,
) {
  return events
    .filter(
      (ev): ev is Extract<AnyWorldEvent, { kind: 'combat.damage' }> =>
        ev.kind === 'combat.damage' &&
        ev.data.targetId === playerId &&
        ev.tick >= deathTick - DEATH_REVIEW_TICKS &&
        ev.tick <= deathTick &&
        ev.data.amount > 0,
    )
    .map((ev) => ({
      sourceId: ev.data.sourceId,
      abilityId: ev.data.abilityId ?? null,
      amount: ev.data.amount,
      agoTicks: deathTick - ev.tick,
    }));
}
