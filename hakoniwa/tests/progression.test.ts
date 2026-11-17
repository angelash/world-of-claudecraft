// Progression rules the combat system applies (progression_and_pacing.md 2.2, 3.3, 4.1,
// 4.3, 4.4; D-060, D-069): level bands, the catch-up line (band floor minus 2) and its
// factor 1.5 on quest and kill experience, the story-boss sync gated by the same line,
// kill experience that companions never dilute, and the pass-on pool xp_overflow. The
// pure rules first, then the same rules through the real engine chain. The boss sync on
// the first pull is in tests/combat.test.ts ("story bosses sync ...").

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import type { ContentPack } from '../src/content/pack';
import { pack as combatPack } from '../src/content/packs/combat';
import { pack as doorsPack } from '../src/content/packs/doors';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as partyPack } from '../src/content/packs/party';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import { upcomingWaveBosses } from '../src/game/autoplay/prepare';
import { createGame } from '../src/game/create';
import { system as combat, groupXpBonus, mobXpValue, xpForLevel } from '../src/systems/combat';
import {
  CATCH_UP_FACTOR,
  catchUpActive,
  catchUpLine,
  catchUpScales,
  killXpShare,
  LEVEL_BANDS,
  levelBand,
  playerXpFactor,
  syncLevel,
  XP_OVERFLOW_FLAG,
} from '../src/systems/combat/progression';
import { award } from '../src/systems/combat/rewards';
import { system as doors } from '../src/systems/doors';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import type { QuestProgress } from '../src/systems/quests/types';
import { system as world } from '../src/systems/world';

describe('level bands and the catch-up line (progression 2.2, 4.1)', () => {
  it('has the six act bands of progression 19', () => {
    expect(LEVEL_BANDS).toEqual({
      1: [1, 15],
      2: [15, 30],
      3: [30, 45],
      4: [45, 55],
      5: [55, 60],
      6: [60, 60],
    });
    expect(levelBand('act3')).toEqual([30, 45]);
    expect(levelBand('prologue')).toBeNull();
    expect(levelBand('epilogue')).toBeNull();
    expect(levelBand(undefined)).toBeNull();
  });

  it('draws the line at band_min - 2: never in act 1, 13, 28, 43, 53 and 58 after', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => catchUpLine(`act${n}`))).toEqual([-1, 13, 28, 43, 53, 58]);
    expect(catchUpLine('prologue')).toBeNull();
    for (let level = 1; level <= 60; level++) expect(catchUpActive(level, 'act1')).toBe(false);
    expect(catchUpActive(13, 'act2')).toBe(true);
    expect(catchUpActive(14, 'act2')).toBe(false);
    expect(catchUpActive(53, 'act5')).toBe(true);
    expect(catchUpActive(54, 'act5')).toBe(false);
    expect(catchUpActive(1, 'prologue')).toBe(false);
    expect(catchUpActive(1, 'epilogue')).toBe(false);
  });

  it('scales quest and kill experience by 1.5 below the line, nothing else', () => {
    expect(CATCH_UP_FACTOR).toBe(1.5);
    expect(catchUpScales('quest')).toBe(true);
    expect(catchUpScales('quest:q_a2_m01_city')).toBe(true);
    expect(catchUpScales('kill:dian_wolf')).toBe(true);
    expect(catchUpScales('first:guardian_raven')).toBe(false);
    expect(catchUpScales('explore:ash_waste')).toBe(false);
    expect(catchUpScales('test')).toBe(false);
    expect(catchUpScales({ key: 'sys.x' })).toBe(false);
    expect(playerXpFactor(28, 'act3', 'quest')).toBe(1.5);
    expect(playerXpFactor(28, 'act3', 'kill:waste_ghoul')).toBe(1.5);
    expect(playerXpFactor(29, 'act3', 'quest')).toBe(1);
    expect(playerXpFactor(28, 'act3', 'first:rat_king')).toBe(1);
    expect(playerXpFactor(5, 'act1', 'quest')).toBe(1);
  });
});

describe('kill experience shares (progression 3.3; companions_and_party.md 4.2)', () => {
  it('gives the player the classic solo value whatever the party', () => {
    for (const size of [1, 2, 3, 4, 5]) {
      expect(killXpShare(12, 10, 1, true, size, size - 1)).toBe(mobXpValue(12, 10));
      expect(killXpShare(20, 20, 4, true, size, size - 1)).toBe(mobXpValue(20, 20, 4));
    }
  });

  it('gives each companion its own solo value times the group bonus over the companions', () => {
    expect(killXpShare(12, 14, 1, false, 2, 1)).toBe(mobXpValue(12, 14));
    expect(killXpShare(12, 14, 1, false, 3, 2)).toBeCloseTo(
      (mobXpValue(12, 14) * groupXpBonus(3)) / 2,
    );
    expect(killXpShare(12, 14, 1, false, 5, 4)).toBeCloseTo(
      (mobXpValue(12, 14) * groupXpBonus(5)) / 4,
    );
  });
});

describe('story-boss sync (progression 4.3, 18.2)', () => {
  const sync = { offset: 0, min: 10 };
  it('fires only at or below the catch-up line', () => {
    expect(syncLevel(sync, 60, 53, 'act5')).toBe(53);
    expect(syncLevel(sync, 60, 54, 'act5')).toBeNull();
    expect(syncLevel(sync, 60, 59, 'act5')).toBeNull();
    expect(syncLevel(sync, 18, 13, 'act2')).toBe(13);
    expect(syncLevel(sync, 18, 14, 'act2')).toBeNull();
    expect(syncLevel(sync, 14, 1, 'act1')).toBeNull();
    expect(syncLevel(sync, 60, 20, undefined)).toBeNull();
  });

  it('takes the player level plus the offset, between the floor and the design level', () => {
    expect(syncLevel(sync, 60, 5, 'act5')).toBe(10);
    expect(syncLevel({ offset: 0 }, 60, 5, 'act5')).toBe(5);
    expect(syncLevel({ offset: -2, min: 1 }, 60, 30, 'act5')).toBe(28);
    expect(syncLevel({ offset: 3, min: 1 }, 18, 13, 'act2')).toBe(16);
    expect(syncLevel({ offset: 9, min: 1 }, 18, 13, 'act2')).toBe(18);
  });
});

// ---------------------------------------------------------------------------
// the real engine chain (kernel systems plus combat, party and doors, as combat.test.ts)

function merge(packs: ContentPack[]): ContentMap {
  const out: Record<string, unknown> = {};
  for (const p of packs) {
    for (const [k, v] of Object.entries(p.tables)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
    }
  }
  return out as unknown as ContentMap;
}

const SYSTEMS = [modifiers, world, inventory, combat, party, doors];

function makeGame(): Engine {
  const g = Engine.create(
    7,
    merge([worldPack, invPack, combatPack, partyPack, doorsPack]),
    SYSTEMS,
  );
  // an empty spot of the sigil hall, away from the corridor monsters
  g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 18.5, y: 9.5 });
  g.step(1);
  return g;
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

function xpEvents(g: Engine): Extract<AnyWorldEvent, { kind: 'combat.xp' }>[] {
  return g.world.recent.filter(
    (e): e is Extract<AnyWorldEvent, { kind: 'combat.xp' }> => e.kind === 'combat.xp',
  );
}

function setLevel(g: Engine, id: string, level: number): void {
  withCtx(g, (ctx) => {
    const u = ctx.world.slices.combat.units[id];
    if (u) {
      u.level = level;
      u.xp = 0;
    }
  });
}

/** Spawn a monster beside the player and credit its death to the player (rewards.award). */
function killBeside(g: Engine, monsterId: string, level: number): void {
  const before = new Set(Object.keys(g.world.slices.world.entities));
  const p = g.world.slices.world.entities.player;
  if (!p) throw new Error('no player');
  g.queue('combat.spawn', { monsterId, mapId: p.mapId, x: p.x + 1.5, y: p.y, level });
  g.step(1);
  const id = Object.keys(g.world.slices.world.entities).find((k) => !before.has(k));
  if (!id) throw new Error(`spawn failed: ${monsterId}`);
  g.world.recent.length = 0;
  withCtx(g, (ctx) => {
    const victim = ctx.world.slices.combat.units[id];
    const killer = ctx.world.slices.combat.units.player;
    if (!victim || !killer) throw new Error('no units');
    award(ctx, victim, killer, false);
  });
}

function withCompanion(): Engine {
  const g = makeGame();
  g.queue('flag.set', { key: 'companion.shiya.recruited', value: true });
  g.step(2);
  if (!g.world.slices.combat.units.companion_shiya) throw new Error('shiya did not join');
  return g;
}

describe('kill experience through the engine', () => {
  it('gives the player the solo value with a companion beside it, and the companion its own', () => {
    const g = withCompanion();
    setLevel(g, 'player', 10);
    setLevel(g, 'companion_shiya', 12);
    killBeside(g, 'dian_wolf', 8);
    const got = Object.fromEntries(xpEvents(g).map((e) => [e.data.entityId, e.data.amount]));
    expect(got.player).toBe(mobXpValue(8, 10));
    // the old split (a pool on the top level shared by level) would have paid the player 19
    expect(got.player).toBeGreaterThan(Math.round((mobXpValue(8, 12) * 10) / 22));
    expect(got.companion_shiya).toBe(Math.round(mobXpValue(8, 12) * groupXpBonus(2)));
    for (const e of xpEvents(g)) expect(e.data.reason).toBe('kill:dian_wolf');
  });

  it('multiplies the player kill by 1.5 below the line and leaves the companion alone', () => {
    const g = withCompanion();
    g.queue('flag.set', { key: 'act', value: 'act3' });
    g.step(1);
    setLevel(g, 'player', 10);
    setLevel(g, 'companion_shiya', 12);
    killBeside(g, 'dian_wolf', 8);
    const got = Object.fromEntries(xpEvents(g).map((e) => [e.data.entityId, e.data.amount]));
    expect(got.player).toBe(Math.round(mobXpValue(8, 10) * 1.5));
    expect(got.companion_shiya).toBe(mobXpValue(8, 12));
  });
});

describe('quest experience and the pass-on pool through the engine', () => {
  function awarded(act: string | null, level: number, amount: number, reason: string) {
    const g = makeGame();
    if (act) g.queue('flag.set', { key: 'act', value: act });
    g.step(1);
    setLevel(g, 'player', level);
    g.world.recent.length = 0;
    withCtx(g, (ctx) => ctx.emit('xp.awarded', { entityId: 'player', amount, reason }));
    g.step(1);
    return { g, amount: xpEvents(g).find((e) => e.data.entityId === 'player')?.data.amount };
  }

  it('scales quest experience by 1.5 below the line only', () => {
    expect(awarded('act3', 20, 1000, 'quest').amount).toBe(1500);
    expect(awarded('act3', 29, 1000, 'quest').amount).toBe(1000);
    expect(awarded('act3', 20, 1000, 'first:sasha').amount).toBe(1000);
    expect(awarded('act1', 1, 100, 'quest').amount).toBe(100);
    expect(awarded(null, 1, 100, 'quest').amount).toBe(100);
  });

  it('puts experience past level 60 into xp_overflow, 1 to 1', () => {
    const { g } = awarded('act6', 60, 5000, 'quest');
    expect(g.world.meta.flags[XP_OVERFLOW_FLAG]).toBe(5000);
    expect(g.world.slices.combat.units.player?.level).toBe(60);
    expect(g.world.slices.combat.units.player?.xp).toBe(0);
    withCtx(g, (ctx) =>
      ctx.emit('xp.awarded', { entityId: 'player', amount: 2000, reason: 'kill:x' }),
    );
    g.step(1);
    expect(g.world.meta.flags[XP_OVERFLOW_FLAG]).toBe(7000);
  });

  it('pools what an award leaves over on reaching 60, and nothing of a companion at 60', () => {
    const g = withCompanion();
    setLevel(g, 'player', 59);
    setLevel(g, 'companion_shiya', 60);
    withCtx(g, (ctx) =>
      ctx.emit('xp.awarded', { entityId: 'player', amount: xpForLevel(59) + 1000, reason: 'test' }),
    );
    g.step(1);
    expect(g.world.slices.combat.units.player?.level).toBe(60);
    expect(g.world.meta.flags[XP_OVERFLOW_FLAG]).toBe(1000);
    withCtx(g, (ctx) =>
      ctx.emit('xp.awarded', { entityId: 'companion_shiya', amount: 3000, reason: 'test' }),
    );
    g.step(1);
    expect(g.world.meta.flags[XP_OVERFLOW_FLAG]).toBe(1000);
  });

  it('writes the pool through the variable registry of a real game (no unregistered flag)', () => {
    const g = createGame({ seed: 1 });
    withCtx(g, (ctx) => {
      const u = ctx.world.slices.combat.units[ctx.world.slices.world.playerId];
      if (u) u.level = 60;
    });
    withCtx(g, (ctx) =>
      ctx.emit('xp.awarded', {
        entityId: ctx.world.slices.world.playerId,
        amount: 1200,
        reason: 'test',
      }),
    );
    g.step(1);
    expect(g.world.meta.flags[XP_OVERFLOW_FLAG]).toBe(1200);
  });
});

describe('the autoplayer readies itself for wave bosses ahead (src/game/autoplay/prepare.ts)', () => {
  const content = buildContent();
  const at = (quests: Record<string, { status: 'active' | 'done'; stage: number }>) => {
    const progress: Record<string, QuestProgress> = {};
    for (const [id, q] of Object.entries(quests))
      progress[id] = {
        id,
        status: q.status,
        stage: q.stage,
        counts: [],
        met: [],
        stageStartTick: 0,
        startedTick: 0,
        choices: {},
      } as unknown as QuestProgress;
    return upcomingWaveBosses(content, progress, Object.keys(quests));
  };

  it('sees the tide colossus from the trial that unlocks the tide, and from its early stages', () => {
    expect(at({ q_a1_m09_trial: { status: 'active', stage: 0 } })).toEqual(['dian_colossus']);
    expect(at({ q_a1_m12_tide: { status: 'active', stage: 0 } })).toEqual(['dian_colossus']);
    // once the colossus stage is entered, its wave is in the world: readyFor sees it there
    expect(at({ q_a1_m12_tide: { status: 'active', stage: 2 } })).toEqual([]);
    // a boss placed on a map (the raven) or a kill without a named target is no wave boss
    expect(at({ q_a1_m02_raven: { status: 'active', stage: 0 } })).toEqual([]);
    expect(at({ q_a1_m04_hunt: { status: 'active', stage: 0 } })).toEqual([]);
    expect(at({ q_a5_m11_final: { status: 'active', stage: 0 } })).toEqual(['faceless_king']);
  });
});
