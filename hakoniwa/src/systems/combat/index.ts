// Combat system, phase 20 (architecture.md 4.6): units on entities, abilities and auras,
// the hit table, threat, crowd control (control.ts), presence (presence.ts), monster and
// guard brains, spawning and waves, death and the return through the door with its costs
// (death.ts, death_costs.ts), duels (duel.ts), the outsider's skill rack (rack.ts) and
// door-granted pools (pools.ts), the difficulty (difficulty.ts), experience and loot; the
// boss mechanics library (boss/), ground warnings (telegraph.ts), the monster mechanic field
// registry (affixes/), injury sources (injuries.ts) and the drop bags' dungeon port
// (bag_port.ts). Other systems read it through queries.ts and write through ports.ts; facts
// leave as events.

import { ok, reject } from '../../core';
import type { CommandSource } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { type KeyText, tr } from '../../core/text';
import { getEntity, haltEntity, playerEntity, tagValue } from '../world';
import { interruptCast, tickCast, useAbility } from './abilities';
import { renewBlight } from './affixes';
import { tickAuras } from './aura_tick';
import { tickAutoAttack, tickRegen } from './auto_attack';
import './bag_port';
import './use_gate_port';
import { interruptibleNow, runActions, startInteract, tickHazards, tickInteract } from './boss';
import { tickReturn } from './death';
import { tickBags, tickFightWear } from './death_costs';
import { classDef, monsterDef, REGEN_EVERY } from './defs';
import { difficultyWritten, syncDifficulty } from './difficulty';
import { settleDuels, startDuel } from './duel';
import { COMBAT_ID_FIELDS } from './id_fields';
import { stopConsumption, tickConsumption } from './item_consumption';
import { onItemProc, syncGearAuras } from './item_procs';
import { onItemUsed, useItemGate } from './items_use';
import { tickGuard, tickMonster } from './monster_ai';
import { switchPool } from './pools';
import { tickPresence } from './presence';
import { setRacked, syncRack, usesRack } from './rack';
import { applyAwardedXp } from './rewards';
import { restAfterSleep } from './skip';
import { onFlag, placeFixtures, populateAll, spawnMonster, tickSpawns } from './spawning';
import { deriveStats } from './stats';
import { sweepOwnerAuras } from './summons';
import { tickTelegraphs } from './telegraph';
import { forgetAttacker } from './threat';
import type { Unit } from './types';
import {
  canAttack,
  clampPools,
  createUnit,
  inCombat,
  liveUnit,
  setLevel,
  sortedUnitIds,
  unitOf,
} from './units';

export { movementTraits } from './affixes';
export { arenaSealed, berserkAt, interruptibleNow } from './boss';
export * from './difficulty';
export * from './formulas';
export * from './id_fields';
export { TEMPER_BACKLASH_CHANCE, temperBacklash } from './injuries';
export type * from './mech_types';
export * from './ports';
export * from './queries';
export { telegraphsOn } from './telegraph';
export type * from './types';

type Actor = { ok: true; u: Unit } | { ok: false; code: string; reason: KeyText };

/** Resolve the acting unit; player-sourced commands may only drive the player. */
function actor(ctx: SystemContext, entityId: string | undefined, source: CommandSource): Actor {
  const playerId = ctx.world.slices.world.playerId;
  const id = entityId ?? playerId;
  if (source.type === 'player' && id !== playerId) {
    return { ok: false, code: 'not_yours', reason: tr('sys.combat.reject.not_yours') };
  }
  const u = unitOf(ctx.world, id);
  if (!u) return { ok: false, code: 'no_unit', reason: tr('sys.combat.reject.no_unit') };
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

export const system: GameSystem & { idFields: typeof COMBAT_ID_FIELDS } = {
  id: 'combat',
  order: 20,
  idFields: COMBAT_ID_FIELDS,

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
    if (player) {
      const u = createUnit(ctx, player.id, { classId: 'outsider', level: 1, side: 'ally' });
      if (u) syncRack(ctx.content, u);
    }
    placeFixtures(ctx);
    populateAll(ctx);
    syncDifficulty(ctx);
  },

  tick(ctx) {
    const slice = ctx.world.slices.combat;
    if (slice.pendingReturn) tickReturn(ctx);
    if (slice.duels) settleDuels(ctx);
    if (slice.bags && ctx.tick % 5 === 0) tickBags(ctx);
    if (ctx.tick % 20 === 0) {
      tickSpawns(ctx);
      sweepOwnerAuras(ctx);
      housekeeping(ctx);
      tickHazards(ctx);
    }
    tickTelegraphs(ctx);
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
      if (u.drinking || u.eating) tickConsumption(ctx, u);
      if (u.interact)
        tickInteract(ctx, u, (boss, actions, path) => runActions(ctx, boss, actions, path));
      if (u.cast) {
        if (castBlocked(ctx, u)) interruptCast(ctx, u);
        else tickCast(ctx, u);
      }
      if (u.ai) {
        if (active.has(e.mapId) || u.ai.state !== 'idle' || u.march) tickMonster(ctx, u);
      } else if (e.kind === 'npc') {
        tickGuard(ctx, u);
      } else if ((e.move || e.intent) && deriveStats(ctx.world, ctx.content, u).speedMult === 0) {
        haltEntity(ctx, e.id);
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
      if (!liveUnit(ctx.world, d.targetId))
        return reject('bad_target', tr('sys.combat.reject.bad_target.unselectable'));
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
        return reject('bad_target', tr('sys.combat.reject.bad_target.enemy'));
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
      if (!e) return reject('no_entity', tr('sys.combat.reject.no_entity'));
      if (e.id === ctx.world.slices.world.playerId) {
        return reject('outsider', tr('sys.combat.reject.outsider'));
      }
      if (!classDef(ctx.content, d.classId))
        return reject('no_class', tr('sys.combat.reject.no_class'));
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
    'combat.rack'(ctx, d, source) {
      const a = actor(ctx, undefined, source);
      if (!a.ok) return reject(a.code, a.reason);
      const res = setRacked(ctx.world, ctx.content, a.u, d.abilityId, d.on);
      return res.ok ? ok() : reject(res.code, tr(`sys.combat.reject.rack.${res.code}`));
    },
    'combat.switch_pool'(ctx, d, source) {
      const a = actor(ctx, undefined, source);
      if (!a.ok) return reject(a.code, a.reason);
      const res = switchPool(ctx, a.u, d.resource);
      return res.ok ? ok() : reject(res.code, tr(`sys.combat.reject.pool.${res.code}`));
    },
    'combat.duel'(ctx, d, source) {
      const a = actor(ctx, undefined, source);
      if (!a.ok) return reject(a.code, a.reason);
      const opponent = unitOf(ctx.world, d.opponentId);
      if (!opponent) return reject('bad_target', tr('sys.combat.reject.bad_target.absent'));
      const res = startDuel(ctx, a.u, opponent);
      return res.ok ? ok() : reject(res.code, tr(`sys.combat.reject.duel.${res.code}`));
    },
    'combat.interact'(ctx, d, source) {
      const a = actor(ctx, undefined, source);
      if (!a.ok) return reject(a.code, a.reason);
      const code = startInteract(ctx, a.u, d.objectId);
      return code === null ? ok() : reject(code, tr(`sys.combat.reject.interact.${code}`));
    },
    'combat.use_item'(ctx, d, source) {
      const a = actor(ctx, undefined, source);
      if (!a.ok) return reject(a.code, a.reason);
      const gate = useItemGate(ctx, a.u, d.itemId, d.targetId);
      if (!gate.ok) return reject(gate.code, tr(`sys.combat.reject.item.${gate.code}`));
      ctx.dispatch(
        'inventory.use',
        { ownerId: a.u.id, itemId: d.itemId, targetId: d.targetId },
        { type: 'system', system: 'combat' },
      );
      return ok();
    },
    'combat.spawn'(ctx, d) {
      if (!monsterDef(ctx.content, d.monsterId))
        return reject('no_monster', tr('sys.combat.reject.no_monster'));
      const p = playerEntity(ctx.world);
      const mapId = d.mapId ?? p?.mapId;
      if (!mapId) return reject('no_map', tr('sys.combat.reject.no_map'));
      const count = Math.max(1, Math.min(20, d.count ?? 1));
      let made = 0;
      for (let i = 0; i < count; i++) {
        const x = d.x ?? (p?.x ?? 1) + 3;
        const y = d.y ?? p?.y ?? 1;
        if (spawnMonster(ctx, d.monsterId, mapId, x, y, { level: d.level })) made++;
      }
      return made > 0
        ? ok(tr('sys.combat.info.spawned', { n: made }))
        : reject('no_room', tr('sys.combat.reject.no_room'));
    },
  },

  on: {
    'combat.damage'(ctx, ev) {
      if (ev.data.amount <= 0 && ev.data.absorbed <= 0) return;
      const u = unitOf(ctx.world, ev.data.targetId);
      if (u && (u.drinking || u.eating)) stopConsumption(u);
    },
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
      if (ev.data.key === 'difficulty') {
        const p = unitOf(ctx.world, ctx.world.slices.world.playerId);
        difficultyWritten(ctx, ev.data.value, !!p && inCombat(ctx.world, p));
        return;
      }
      onFlag(ctx, ev.data.key, ev.data.value);
    },
    'xp.awarded'(ctx, ev) {
      const u = unitOf(ctx.world, ev.data.entityId);
      if (u) applyAwardedXp(ctx, u, ev.data.amount, ev.data.reason);
    },
    'item.used'(ctx, ev) {
      onItemUsed(ctx, ev.data);
    },
    'item.proc'(ctx, ev) {
      onItemProc(ctx, ev.data);
    },
    'item.equipped'(ctx, ev) {
      const u = unitOf(ctx.world, ev.data.ownerId);
      if (!u) return;
      clampPools(ctx.world, ctx.content, u);
      syncGearAuras(ctx, u);
    },
    'world.hour'(ctx) {
      // the crop blighters' production modifiers run an hour at a time (11 `cropBlight`)
      renewBlight(ctx);
    },
    'time.skipped'(ctx, ev) {
      if (ev.data.kind === 'sleep' && ev.data.outcome === 'done') {
        restAfterSleep(ctx, ev.data.entityId);
      }
    },
  },
};

/**
 * Once a second: the outsider's skill rack follows its level and knowledge (7; also a save
 * from before the rack), a fight that ended wears the party's gear (13.2), and the
 * companions' down counts clear once the whole party is out of the fight (15.2: the second
 * down of one fight counts across a revival).
 */
function housekeeping(ctx: SystemContext): void {
  const party: Unit[] = [];
  for (const id of sortedUnitIds(ctx.world)) {
    const u = ctx.world.slices.combat.units[id];
    if (!u) continue;
    if (usesRack(ctx.content, u)) syncRack(ctx.content, u);
    const e = getEntity(ctx.world, id);
    if (e && (e.kind === 'player' || e.kind === 'companion')) party.push(u);
  }
  tickFightWear(ctx, party);
  // set auras follow the worn sets (a piece broke, a set grew)
  for (const u of party) syncGearAuras(ctx, u);
  const fighting = party.some((u) => u.downed || u.combatUntil > ctx.tick);
  if (!fighting) for (const u of party) if (u.downs) delete u.downs;
}

/**
 * Whether a control breaks the cast in progress: stun, fear and incapacitation always; a
 * silence unless the cast is uninterruptible (8.1: the shield-bordered cast bar).
 */
function castBlocked(ctx: SystemContext, u: Unit): boolean {
  const d = deriveStats(ctx.world, ctx.content, u);
  if (d.cc.stun || d.cc.fear || d.cc.incapacitate) return true;
  return d.cc.silence && interruptibleNow(ctx.world, ctx.content, u);
}
