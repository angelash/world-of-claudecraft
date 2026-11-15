// Combat system, phase 20 (architecture.md 4.6): units on entities, abilities and auras,
// the hit table, threat, monster and guard brains, spawning and waves, death and the
// return through the door, experience and loot. Other systems read it through
// queries.ts and write through ports.ts; facts leave as events (types.ts).

import { ok, reject } from '../../core';
import type { CommandSource } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { getEntity, playerEntity } from '../world';
import { interruptCast, tickCast, useAbility } from './abilities';
import { tickAuras } from './aura_tick';
import { tickAutoAttack, tickRegen } from './auto_attack';
import { classDef, monsterDef, REGEN_EVERY } from './defs';
import { halt, tagValue } from './entity_ops';
import { onItemUsed } from './items_use';
import { tickGuard, tickMonster } from './monster_ai';
import { tickPresence } from './presence';
import { gainXp } from './rewards';
import { onFlag, placeFixtures, populateAll, spawnMonster, tickSpawns } from './spawning';
import { deriveStats } from './stats';
import { forgetAttacker } from './threat';
import type { Unit } from './types';
import {
  canAttack,
  clampPools,
  createUnit,
  liveUnit,
  setLevel,
  sortedUnitIds,
  unitOf,
} from './units';

export * from './formulas';
export * from './ports';
export * from './queries';
export type * from './types';

type Actor = { ok: true; u: Unit } | { ok: false; code: string; reason: string };

/** Resolve the acting unit; player-sourced commands may only drive the player. */
function actor(ctx: SystemContext, entityId: string | undefined, source: CommandSource): Actor {
  const playerId = ctx.world.slices.world.playerId;
  const id = entityId ?? playerId;
  if (source.type === 'player' && id !== playerId) {
    return { ok: false, code: 'not_yours', reason: '只能指挥自己' };
  }
  const u = unitOf(ctx.world, id);
  if (!u) return { ok: false, code: 'no_unit', reason: '这个对象不能战斗' };
  return { ok: true, u };
}

/** Maps where the player or a companion stands: monsters elsewhere idle in place. */
function activeMaps(ctx: SystemContext): Set<string> {
  const out = new Set<string>();
  for (const e of Object.values(ctx.world.slices.world.entities)) {
    if (e.kind === 'player' || e.kind === 'companion') out.add(e.mapId);
  }
  return out;
}

/** Give combat NPCs placed by other systems (guard, combatant or class: tags) a unit. */
function unitForNpc(ctx: SystemContext, entityId: string): void {
  const e = getEntity(ctx.world, entityId);
  if (!e || unitOf(ctx.world, entityId)) return;
  const cls = tagValue(e, 'class');
  if (!cls && !e.tags.includes('guard') && !e.tags.includes('combatant')) return;
  if (e.tags.includes('unattackable')) return;
  const classId = cls && classDef(ctx.content, cls) ? cls : 'warrior';
  const level = Number(tagValue(e, 'lvl') ?? '10') || 10;
  createUnit(ctx, entityId, {
    classId,
    level,
    side: e.tags.includes('hostile') ? 'enemy' : 'ally',
  });
}

export const system: GameSystem = {
  id: 'combat',
  order: 20,

  init(ctx) {
    ctx.world.slices.combat = {
      units: {},
      spawns: {},
      waves: {},
      corpses: {},
      deaths: [],
      presence: {},
    };
    const player = playerEntity(ctx.world);
    if (player) createUnit(ctx, player.id, { classId: 'outsider', level: 1, side: 'ally' });
    placeFixtures(ctx);
    populateAll(ctx);
  },

  tick(ctx) {
    const slice = ctx.world.slices.combat;
    if (ctx.tick % 20 === 0) tickSpawns(ctx);
    const active = activeMaps(ctx);
    const regen = ctx.tick % REGEN_EVERY === 0;
    for (const id of sortedUnitIds(ctx.world)) {
      const u = slice.units[id];
      if (!u) continue;
      const e = getEntity(ctx.world, id);
      if (!e) {
        delete slice.units[id];
        continue;
      }
      if (!e.alive || u.downed) continue;
      // An idle monster away from the party with no aura, cast or swing does nothing this
      // tick but regenerate on regen ticks: skip the per-unit calls (same outcome, cheaper).
      if (
        u.ai &&
        !regen &&
        u.auras.length === 0 &&
        !u.cast &&
        !u.autoAttack &&
        u.ai.state === 'idle' &&
        !u.march &&
        !active.has(e.mapId)
      ) {
        continue;
      }
      tickAuras(ctx, u);
      if (!liveUnit(ctx.world, id)) continue;
      if (u.cast) {
        if (castBlocked(ctx, u)) interruptCast(ctx, u);
        else tickCast(ctx, u);
      }
      if (u.ai) {
        if (active.has(e.mapId) || u.ai.state !== 'idle' || u.march) tickMonster(ctx, u);
      } else if (e.kind === 'npc') {
        tickGuard(ctx, u);
      } else if ((e.move || e.intent) && deriveStats(ctx.world, ctx.content, u).speedMult === 0) {
        halt(e);
      }
      if (!liveUnit(ctx.world, id)) continue;
      tickAutoAttack(ctx, u);
      if (regen) tickRegen(ctx, u);
    }
    if (ctx.tick % 20 === 10) tickPresence(ctx);
  },

  commands: {
    'combat.target'(ctx, d, source) {
      const a = actor(ctx, d.entityId, source);
      if (!a.ok) return reject(a.code, a.reason);
      if (d.targetId === null) {
        a.u.target = null;
        a.u.autoAttack = false;
        return ok();
      }
      if (!liveUnit(ctx.world, d.targetId)) return reject('bad_target', '选不中那个目标');
      a.u.target = d.targetId;
      return ok();
    },
    'combat.attack'(ctx, d, source) {
      const a = actor(ctx, d.entityId, source);
      if (!a.ok) return reject(a.code, a.reason);
      if (d.targetId) a.u.target = d.targetId;
      const on = d.on ?? !a.u.autoAttack;
      if (!on) {
        a.u.autoAttack = false;
        return ok();
      }
      const t = unitOf(ctx.world, a.u.target);
      if (!t || !canAttack(ctx.world, a.u, t))
        return reject('bad_target', '需要一个可以攻击的目标');
      a.u.autoAttack = true;
      return ok();
    },
    'combat.cast'(ctx, d, source) {
      const a = actor(ctx, d.entityId, source);
      if (!a.ok) return reject(a.code, a.reason);
      const res = useAbility(ctx, a.u, d.abilityId, d.targetId);
      return res.ok ? ok() : reject(res.code, res.reason);
    },
    'combat.stop'(ctx, d, source) {
      const a = actor(ctx, d.entityId, source);
      if (!a.ok) return reject(a.code, a.reason);
      interruptCast(ctx, a.u);
      a.u.autoAttack = false;
      return ok();
    },
    'combat.set_class'(ctx, d) {
      const e = getEntity(ctx.world, d.entityId);
      if (!e) return reject('no_entity', '找不到这个对象');
      if (e.id === ctx.world.slices.world.playerId) {
        return reject('outsider', '编外者没有职能，力量只来自门');
      }
      if (!classDef(ctx.content, d.classId)) return reject('no_class', '没有这个职能');
      const u = unitOf(ctx.world, d.entityId);
      if (!u) {
        createUnit(ctx, d.entityId, {
          classId: d.classId,
          level: d.level ?? (Number(tagValue(e, 'lvl') ?? '1') || 1),
          side: e.tags.includes('hostile') ? 'enemy' : 'ally',
        });
        return ok();
      }
      u.classId = d.classId;
      clampPools(ctx.world, ctx.content, u);
      if (d.level !== undefined) setLevel(ctx, u, d.level);
      return ok();
    },
    'combat.spawn'(ctx, d) {
      if (!monsterDef(ctx.content, d.monsterId)) return reject('no_monster', '没有这种魔物');
      const p = playerEntity(ctx.world);
      const mapId = d.mapId ?? p?.mapId;
      if (!mapId) return reject('no_map', '不知道生成在哪里');
      const count = Math.max(1, Math.min(20, d.count ?? 1));
      let made = 0;
      for (let i = 0; i < count; i++) {
        const x = d.x ?? (p?.x ?? 1) + 3;
        const y = d.y ?? p?.y ?? 1;
        if (spawnMonster(ctx, d.monsterId, mapId, x, y, { level: d.level })) made++;
      }
      return made > 0 ? ok(`生成了 ${made} 只`) : reject('no_room', '那里生成不了');
    },
  },

  on: {
    'world.entity_spawned'(ctx, ev) {
      if (ev.data.kind === 'npc') unitForNpc(ctx, ev.data.id);
    },
    'world.entity_removed'(ctx, ev) {
      const slice = ctx.world.slices.combat;
      if (!slice.units[ev.data.id]) return;
      forgetAttacker(ctx.world, ev.data.id);
      delete slice.units[ev.data.id];
      delete slice.corpses[ev.data.id];
    },
    'world.map_changed'(ctx, ev) {
      const u = unitOf(ctx.world, ev.data.id);
      if (!u) return;
      forgetAttacker(ctx.world, u.id);
      u.threat = {};
      u.target = null;
      u.autoAttack = false;
      interruptCast(ctx, u);
    },
    'flag.changed'(ctx, ev) {
      onFlag(ctx, ev.data.key, ev.data.value);
    },
    'xp.awarded'(ctx, ev) {
      const u = unitOf(ctx.world, ev.data.entityId);
      if (u) gainXp(ctx, u, ev.data.amount, ev.data.reason);
    },
    'item.used'(ctx, ev) {
      onItemUsed(ctx, ev.data);
    },
    'item.equipped'(ctx, ev) {
      const u = unitOf(ctx.world, ev.data.ownerId);
      if (u) clampPools(ctx.world, ctx.content, u);
    },
  },
};

function castBlocked(ctx: SystemContext, u: Unit): boolean {
  const d = deriveStats(ctx.world, ctx.content, u);
  return d.cc.stun || d.cc.fear || d.cc.incapacitate || d.cc.silence;
}
