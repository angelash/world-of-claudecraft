// Balance lab, combat: one fighter (the player at a level, or a class at a level) against
// one monster, on a small arena map, with the real kernel and the world, inventory,
// modifiers and combat systems. A tiny arena system drives the fighter: target the
// monster, auto-attack, close in, and cast what the shared combat AI (pickAbility)
// would. Batches over seeds report time to kill, damage per second and win rate.
// Pure: no DOM.

import type { ContentMap } from '../../core/contracts';
import { Engine } from '../../core/engine';
import type { GameSystem, SystemContext } from '../../core/system';
import { TICK_HZ } from '../../core/time';
import {
  addUnit,
  castAs,
  system as combatSystem,
  liveUnit,
  pickAbility,
  setAutoAttack,
  setLevel,
  unitOf,
} from '../../systems/combat';
import { system as inventorySystem } from '../../systems/inventory';
import { system as modifiersSystem } from '../../systems/modifiers';
import {
  getEntity,
  type MapDef,
  orderMove,
  spawnEntity,
  system as worldSystem,
} from '../../systems/world';
import { mean, percentile, rate } from '../util/stats';

export const ARENA_ID = 'lab_arena';
const LOBBY_ID = 'lab_lobby';

function room(id: string, w: number, h: number): MapDef {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    rows.push(y === 0 || y === h - 1 ? '#'.repeat(w) : `#${'.'.repeat(w - 2)}#`);
  }
  return {
    id,
    name: id,
    region: 'lab',
    width: w,
    height: h,
    rows,
    legend: { '#': 'wall', '.': 'floor' },
    locations: [],
    spawns: [],
    exits: [],
  };
}

export interface DuelSpec {
  /** 'player' for the outsider, otherwise a class id */
  fighter: string;
  level: number;
  monsterId: string;
  /** default: the monster's own level roll */
  monsterLevel?: number;
  useAbilities: boolean;
  maxSeconds: number;
}

export interface DuelResult {
  seed: number;
  outcome: 'win' | 'loss' | 'timeout' | 'error';
  /** seconds from the first hit to the end */
  seconds: number;
  fighterDamage: number;
  monsterDamage: number;
  /** fighter hp left as a fraction of max at the end */
  fighterHpFrac: number;
  error?: string;
}

/** Content for a duel: every table as built, but only the arena and a lobby as maps. */
export function arenaContent(content: ContentMap, fighterIsPlayer: boolean): ContentMap {
  return {
    ...content,
    maps: [room(ARENA_ID, 16, 9), room(LOBBY_ID, 5, 5)],
    worldStarts: [
      fighterIsPlayer
        ? { mapId: ARENA_ID, x: 6.5, y: 4.5, priority: 999 }
        : { mapId: LOBBY_ID, x: 2.5, y: 2.5, priority: 999 },
    ],
  } as ContentMap;
}

interface ArenaState {
  fighterId: string;
  monsterId: string;
  firstHitTick: number;
  fighterDamage: number;
  monsterDamage: number;
}

function arenaSystem(spec: DuelSpec, st: ArenaState): GameSystem {
  return {
    id: 'zz_lab_arena',
    order: 999,
    init(ctx) {
      const playerId = ctx.world.slices.world.playerId;
      if (spec.fighter === 'player') {
        st.fighterId = playerId;
        const u = unitOf(ctx.world, playerId);
        if (u) setLevel(ctx, u, spec.level);
      } else {
        const e = spawnEntity(ctx, {
          kind: 'companion',
          name: spec.fighter,
          mapId: ARENA_ID,
          x: 6.5,
          y: 4.5,
          faction: 'player',
          appearance: { base: 'human', colors: ['#888888', '#666666', '#cccccc', '#333333'] },
          tags: ['companion', `class:${spec.fighter}`],
        });
        addUnit(ctx, e.id, { classId: spec.fighter, level: spec.level, side: 'ally' });
        st.fighterId = e.id;
      }
      ctx.dispatch(
        'combat.spawn',
        { monsterId: spec.monsterId, mapId: ARENA_ID, x: 7.5, y: 4.5, level: spec.monsterLevel },
        { type: 'system', system: 'lab_arena' },
      );
    },
    tick(ctx) {
      if (!st.monsterId) st.monsterId = findMonster(ctx, spec.monsterId) ?? '';
      const f = unitOf(ctx.world, st.fighterId);
      const m = unitOf(ctx.world, st.monsterId);
      if (!f || !m || !liveUnit(ctx.world, f.id) || !liveUnit(ctx.world, m.id)) return;
      if (f.target !== m.id || !f.autoAttack) setAutoAttack(ctx, f.id, true, m.id);
      const fe = getEntity(ctx.world, f.id);
      const me = getEntity(ctx.world, m.id);
      if (fe && me && Math.hypot(fe.x - me.x, fe.y - me.y) > 1.6 && ctx.tick % 10 === 0) {
        orderMove(ctx, f.id, me.x, me.y, 1);
      }
      if (spec.useAbilities && !f.cast) {
        const pick = pickAbility(ctx, f, m);
        if (pick) castAs(ctx, f.id, pick.abilityId, pick.targetId);
      }
    },
    on: {
      'combat.damage'(ctx, ev) {
        const d = ev.data;
        if (d.sourceId === st.fighterId && d.targetId === st.monsterId)
          st.fighterDamage += d.amount;
        else if (d.sourceId === st.monsterId && d.targetId === st.fighterId)
          st.monsterDamage += d.amount;
        else return;
        if (st.firstHitTick < 0) st.firstHitTick = ctx.tick;
      },
    },
  };
}

function findMonster(ctx: SystemContext, monsterId: string): string | undefined {
  const units = ctx.world.slices.combat.units;
  return Object.keys(units)
    .sort()
    .find((id) => units[id]?.monsterId === monsterId);
}

/** One duel with one seed. */
export function runDuel(content: ContentMap, spec: DuelSpec, seed: number): DuelResult {
  const st: ArenaState = {
    fighterId: '',
    monsterId: '',
    firstHitTick: -1,
    fighterDamage: 0,
    monsterDamage: 0,
  };
  const base = { seed, seconds: 0, fighterDamage: 0, monsterDamage: 0, fighterHpFrac: 0 };
  let engine: Engine;
  try {
    engine = Engine.create(
      seed,
      arenaContent(content, spec.fighter === 'player'),
      [modifiersSystem, worldSystem, inventorySystem, combatSystem, arenaSystem(spec, st)],
      { aiMode: 'off' },
    );
  } catch (e) {
    return { ...base, outcome: 'error', error: e instanceof Error ? e.message : String(e) };
  }
  const startHp = unitOf(engine.world, st.fighterId)?.hp ?? 0;
  const limit = Math.max(1, Math.round(spec.maxSeconds * TICK_HZ));
  let outcome: DuelResult['outcome'] = 'timeout';
  try {
    for (let t = 0; t < limit + 40; t++) {
      engine.step(1);
      if (!st.monsterId) {
        if (t > 40) {
          return { ...base, outcome: 'error', error: `monster ${spec.monsterId} did not spawn` };
        }
        continue;
      }
      if (!liveUnit(engine.world, st.monsterId)) {
        outcome = 'win';
        break;
      }
      if (!liveUnit(engine.world, st.fighterId)) {
        outcome = 'loss';
        break;
      }
      if (st.firstHitTick >= 0 && engine.tick - st.firstHitTick >= limit) break;
    }
  } catch (e) {
    return { ...base, outcome: 'error', error: e instanceof Error ? e.message : String(e) };
  }
  const from = st.firstHitTick >= 0 ? st.firstHitTick : engine.tick;
  const endHp = unitOf(engine.world, st.fighterId)?.hp ?? 0;
  return {
    seed,
    outcome,
    seconds: (engine.tick - from) / TICK_HZ,
    fighterDamage: st.fighterDamage,
    monsterDamage: st.monsterDamage,
    fighterHpFrac: startHp > 0 ? Math.max(0, endHp) / startHp : 0,
  };
}

export interface DuelSummary {
  runs: number;
  wins: number;
  winRate: number;
  lossRate: number;
  timeoutRate: number;
  errors: number;
  /** time to kill over wins */
  ttkMean: number;
  ttkP50: number;
  ttkP90: number;
  /** fighter damage per second (all decided runs) */
  dpsMean: number;
  /** monster damage per second against the fighter */
  monsterDpsMean: number;
  hpLeftMean: number;
}

export function summarizeDuels(results: readonly DuelResult[]): DuelSummary {
  const ok = results.filter((r) => r.outcome !== 'error');
  const wins = ok.filter((r) => r.outcome === 'win');
  const ttk = wins.map((r) => r.seconds);
  const timed = ok.filter((r) => r.seconds > 0);
  return {
    runs: results.length,
    wins: wins.length,
    winRate: rate(wins.length, ok.length),
    lossRate: rate(ok.filter((r) => r.outcome === 'loss').length, ok.length),
    timeoutRate: rate(ok.filter((r) => r.outcome === 'timeout').length, ok.length),
    errors: results.length - ok.length,
    ttkMean: mean(ttk),
    ttkP50: percentile(ttk, 0.5),
    ttkP90: percentile(ttk, 0.9),
    dpsMean: mean(timed.map((r) => r.fighterDamage / r.seconds)),
    monsterDpsMean: mean(timed.map((r) => r.monsterDamage / r.seconds)),
    hpLeftMean: mean(wins.map((r) => r.fighterHpFrac)),
  };
}
