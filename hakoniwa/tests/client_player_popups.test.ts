import { describe, expect, it } from 'vitest';
import { createAppraiseAdapter, createUnitFrameAdapter } from '../src/client/adapters/combat';
import {
  appraisalPopupData,
  characterCardData,
  DEATH_REVIEW_TICKS,
  deathDamageRows,
  visibleCardSubject,
} from '../src/client/adapters/player_cards';
import { createConversationAdapter, createInteractAdapter } from '../src/client/adapters/social';
import { createGameView } from '../src/client/view/game_view';
import { appraisalCardModel } from '../src/client/windows/appraisal_model';
import { deathReviewData } from '../src/client/windows/death_review_model';
import type { AnyWorldEvent } from '../src/core/contracts';
import { TICKS_PER_GAME_MINUTE } from '../src/core/time';
import { createGame } from '../src/game/create';
import { t } from '../src/shared_ui/i18n';
import type { AppraisalResult } from '../src/systems/cognition';
import { npcEntityId } from '../src/systems/npc';

const adapters = {
  appraise: createAppraiseAdapter(),
  unitFrames: createUnitFrameAdapter(),
  conversation: createConversationAdapter(),
  interact: createInteractAdapter(),
};

function beside(persona = 'shiya') {
  const game = createGame({ flagPolicy: 'off' });
  const view = createGameView(game);
  const player = game.world.slices.world.entities[view.playerId()];
  const target = game.world.slices.world.entities[npcEntityId(persona)];
  if (!player || !target) throw new Error('missing popup fixture');
  Object.assign(target, {
    mapId: player.mapId,
    x: player.x + 1,
    y: player.y,
    hidden: false,
    alive: true,
  });
  return { game, view, player, target };
}

type DamageEvent = Extract<AnyWorldEvent, { kind: 'combat.damage' }>;
function damage(tick: number, data: Partial<DamageEvent['data']> = {}): DamageEvent {
  return {
    kind: 'combat.damage',
    tick,
    seq: tick,
    data: {
      sourceId: 'attacker',
      targetId: 'player',
      amount: 7,
      absorbed: 0,
      school: 'physical',
      outcome: 'hit',
      ...data,
    },
  };
}

function deathFixture() {
  const fixture = beside();
  const { game, view, player } = fixture;
  const tick = 400;
  const toMap = view.maps().find((m) => m.id !== player.mapId)?.id;
  if (!toMap) throw new Error('missing revival map');
  const revivalTicks = 90 * TICKS_PER_GAME_MINUTE;
  game.world.meta.tick = tick;
  game.world.slices.combat.pendingReturn = {
    at: tick + revivalTicks,
    playerId: view.playerId(),
    fromMap: player.mapId,
    x: player.x,
    y: player.y,
    toMap,
    toX: 1,
    toY: 1,
    innerCourt: false,
    overload: 1,
    moneyLost: 15,
    revivalTicks,
    fatigueTicks: 2400,
    fatigueMinutes: 120,
    fatigueFloor: 60,
    witnessed: 2,
    packId: 'test-bag',
  };
  game.world.slices.combat.bags = {
    'test-bag': {
      id: 'test-bag',
      ownerId: view.playerId(),
      mapId: player.mapId,
      x: player.x,
      y: player.y,
      money: 15,
      expires: 100000,
      items: [{ itemId: 'bread', plain: 2, parts: [], instances: [] }],
    },
  };
  const returned: Extract<AnyWorldEvent, { kind: 'combat.player_returned' }> = {
    kind: 'combat.player_returned',
    tick: tick + revivalTicks,
    seq: 999,
    data: {
      fromMap: player.mapId,
      x: player.x,
      y: player.y,
      toMap,
      toX: 1,
      toY: 1,
      innerCourt: false,
      moneyLost: 15,
      fatigueMinutes: 120,
      witnessed: 2,
      packId: 'test-bag',
      revivalTicks,
    },
  };
  return { ...fixture, tick, revivalTicks, returned };
}

describe('the appraisal card discloses only an actual reading', () => {
  const reading: AppraisalResult = {
    tick: 1,
    observerId: 'clerk',
    targetId: 'player',
    device: 'crystal',
    display: 'Lv99',
    kind: 'exact',
    level: 99,
    tier: 6,
    tierName: 'secret tier',
    potential: 'secret potential',
    note: '',
  };

  it('always treats the player as pageless, including old inconsistent records', () => {
    const m = appraisalCardModel({
      result: reading,
      name: 'traveller',
      self: true,
      talent: false,
      pressure: '',
    });
    expect(m.reading).toBe('无记载');
    expect(m.tier).toBe('');
    expect(m.potential).toBe('');
  });

  it('does not leak a potential without its door or a numeric tier beyond the reading', () => {
    const m = appraisalCardModel({
      result: { ...reading, kind: 'capped', display: '34+' },
      name: 'traveller',
      self: false,
      talent: false,
      pressure: '',
    });
    expect(m.reading).toBe('34+');
    expect(m.tier).toBe('');
    expect(m.potential).toBe('');
    expect(m.vague).toBe(true);
  });

  it('shows the actual tier and potential only when both the reading and talent allow it', () => {
    const m = appraisalCardModel({
      result: reading,
      name: 'traveller',
      self: false,
      talent: true,
      pressure: 'felt pressure',
    });
    expect(m.tier).toBe('secret tier');
    expect(m.potential).toBe('secret potential');
    expect(m.pressure).toBe('felt pressure');
    expect(m.vague).toBe(false);
  });
});

describe('player-visible character information', () => {
  it('rejects hidden subjects and subjects on another map without changing the world', () => {
    const { game, view, target } = beside();
    const before = JSON.stringify(game.world);
    expect(characterCardData(view, adapters, target.id)?.name).toBe(target.name);
    expect(JSON.stringify(game.world)).toBe(before);
    target.hidden = true;
    expect(visibleCardSubject(view, target.id)).toBeNull();
    expect(characterCardData(view, adapters, target.id)).toBeNull();
    target.hidden = false;
    target.mapId = 'a-different-map';
    expect(characterCardData(view, adapters, target.id)).toBeNull();
  });

  it('reads potential from an actual player appraisal, never directly from the persona', () => {
    const { game, view, target } = beside();
    expect(characterCardData(view, adapters, target.id)?.potential).toBe('');
    for (const command of adapters.appraise.appraise(view, target.id))
      game.queue(command.kind, command.data as never);
    game.step(1);
    let ev = game.world.recent.filter((e) => e.kind === 'cognition.appraised').at(-1);
    if (ev?.kind !== 'cognition.appraised') throw new Error('appraisal command did not settle');
    expect(appraisalPopupData(view, adapters, ev.data)?.potential).toBe('');
    game.world.meta.flags['feature.appraise_talent'] = true;
    expect(characterCardData(view, adapters, target.id)?.potential).toBe('');
    for (const command of adapters.appraise.appraise(view, target.id))
      game.queue(command.kind, command.data as never);
    game.step(1);
    ev = game.world.recent.filter((e) => e.kind === 'cognition.appraised').at(-1);
    if (ev?.kind !== 'cognition.appraised') throw new Error('talent appraisal did not settle');
    expect(appraisalPopupData(view, adapters, ev.data)?.potential).toBe('猎王');
    expect(characterCardData(view, adapters, target.id)?.potential).toBe('猎王');
    game.world.meta.flags['feature.appraise_talent'] = false;
    expect(characterCardData(view, adapters, target.id)?.potential).toBe('');
    expect(
      appraisalPopupData(view, adapters, { ...ev.data, observerId: 'someone-else' }),
    ).toBeNull();
  });

  it('shows only discovered codex notes and sensed attitude, excluding private thoughts', () => {
    const { game, view, target } = beside('bron');
    game.world.slices.records.codex.people.bron = { first: 0, last: 0, count: 1 };
    game.world.slices.records.notes.cdx_bron_sleeve = 0;
    const npc = game.world.slices.npc.npcs.bron;
    if (!npc) throw new Error('missing bron');
    npc.note = 'unspoken private plan';
    const model = characterCardData(view, adapters, target.id);
    expect(model?.known).toHaveLength(1);
    expect(model?.known[0]?.text).toContain('袖管');
    expect(model?.known[0]?.source).toBe(t('ui.win.codex.source.seen'));
    expect(model?.attitude).not.toBe('');
    expect(model).not.toHaveProperty('relation');
    expect(JSON.stringify(model)).not.toContain('unspoken private plan');
    expect(JSON.stringify(model)).not.toContain('二十年前');
  });

  it('never offers self-appraisal or reveals a stale self potential', () => {
    const { game, view, player } = beside();
    game.world.meta.flags['feature.appraise_talent'] = true;
    game.world.slices.cognition.appraisals.push({
      tick: 0,
      observerId: player.id,
      targetId: player.id,
      device: 'skill',
      kind: 'exact',
      display: 'Lv99',
      note: '',
      potential: 'should stay hidden',
    });
    const model = characterCardData(view, adapters, player.id);
    expect(model?.self).toBe(true);
    expect(model?.potential).toBe('');
    expect(model?.canAppraise).toBe(false);
    expect(model?.canTalk).toBe(false);
  });

  it('disables actual actions as the subject moves out of range or dies', () => {
    const { view, player, target } = beside();
    expect(characterCardData(view, adapters, target.id)?.canAppraise).toBe(true);
    target.x = player.x + 9;
    expect(characterCardData(view, adapters, target.id)?.canAppraise).toBe(false);
    expect(characterCardData(view, adapters, target.id)?.canTalk).toBe(false);
    target.x = player.x + 1;
    target.alive = false;
    expect(characterCardData(view, adapters, target.id)?.canAppraise).toBe(false);
    expect(characterCardData(view, adapters, target.id)?.canTalk).toBe(false);
  });
});

describe('a death review belongs to one real death', () => {
  it('keeps all positive incoming hits in the final ten seconds, including both endpoints', () => {
    const tick = 400;
    const rows = deathDamageRows(
      [
        damage(tick - DEATH_REVIEW_TICKS - 1),
        damage(tick - DEATH_REVIEW_TICKS),
        damage(tick),
        damage(tick + 1),
        damage(tick, { targetId: 'companion' }),
        damage(tick, { amount: 0, absorbed: 50 }),
        ...Array.from({ length: 40 }, (_, i) => damage(tick - 50 + i)),
      ],
      'player',
      tick,
    );
    expect(rows).toHaveLength(42);
    expect(rows[0]?.agoTicks).toBe(DEATH_REVIEW_TICKS);
    expect(rows[1]?.agoTicks).toBe(0);
  });

  it('preserves settled costs and damage names after the world removes sources and the bag', () => {
    const { game, view, target, tick, revivalTicks, returned } = deathFixture();
    const before = JSON.stringify(game.world);
    const review = deathReviewData(view, [damage(tick, { sourceId: target.id })], tick);
    expect(JSON.stringify(game.world)).toBe(before);
    expect(review?.returned).toBe(false);
    expect(review?.remaining).toBe(revivalTicks);
    expect(review?.elapsed).toBe(90 * TICKS_PER_GAME_MINUTE);
    expect(review?.damage[0]?.source).toBe(target.name);
    expect(review?.items).toEqual([{ name: view.itemDef('bread')?.name, count: 2 }]);
    expect(review?.witnesses).toBe(2);
    if (!review) throw new Error('missing review');
    delete game.world.slices.world.entities[target.id];
    delete game.world.slices.combat.bags;
    delete game.world.slices.combat.pendingReturn;
    game.world.meta.tick = returned.tick;
    const resumed = deathReviewData(view, [returned], tick, review);
    expect(resumed?.returned).toBe(true);
    expect(resumed?.damage).toEqual(review.damage);
    expect(resumed?.items).toEqual(review.items);
    expect(resumed?.lostMoney).toBe(15);
    expect(resumed?.remaining).toBe(0);
  });

  it('does not treat an old return or a snapshot from another death as this return', () => {
    const { game, view, tick, returned } = deathFixture();
    const review = deathReviewData(view, [], tick);
    if (!review) throw new Error('missing review');
    delete game.world.slices.combat.pendingReturn;
    expect(deathReviewData(view, [{ ...returned, tick: tick - 1 }], tick)).toBeNull();
    expect(deathReviewData(view, [], tick + 1, review)).toBeNull();
    expect(deathReviewData(view, [], tick, review)?.returned).toBe(false);
  });

  it('hides the identity of a concealed damage source and rounds countdowns up to minutes', () => {
    const { game, view, target, tick, revivalTicks } = deathFixture();
    target.hidden = true;
    game.world.meta.tick = tick + TICKS_PER_GAME_MINUTE + 1;
    const review = deathReviewData(view, [damage(tick, { sourceId: target.id })], tick);
    expect(review?.damage[0]?.source).toBe(t('ui.pop.death.unknown_source'));
    expect(review?.remaining).toBe(revivalTicks - TICKS_PER_GAME_MINUTE);
  });
});
