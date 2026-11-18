// Reinforcements (combat_and_classes.md 10.5): a wave comes at a health line (`atPct`, the
// first-round `summon` list is the same thing) or every N seconds (`every`), at a spawn
// point: `ring` (1.5 tiles round the boss), `edges` (the arena's rim: four points 8 tiles
// out, cut to the map) or a location of the map. Each wave is announced first: the 1.2-second
// spawn light (`combat.adds` warned), then the adds appear, side with the boss, owe it their
// summoner link (no leash, no experience, 8.5) and take half of each threat on its table
// (2.5). Adds marked `despawnWithBoss` go when it falls; a reset sends every add away.

import type { SystemContext } from '../../../core/system';
import { getEntity, mapById, nearestWalkable, walkMap } from '../../world';
import { monsterDef, secs } from '../defs';
import { combatMod } from '../difficulty';
import type { AddWave, SpawnAt } from '../mech_types';
import { despawn, spawnMonster } from '../spawning';
import { addThreat, engage } from '../threat';
import type { Unit } from '../types';
import { liveUnit, unitOf } from '../units';
import { bossSay, fightOf, healthFrac, mechOf } from './fight';

/** The spawn light before adds appear (10.5: the plain warning lead). */
export const ADD_LEAD_SEC = 1.2;
/** How far out `edges` puts its four points. */
const EDGE_REACH = 8;

/** The add waves of a boss: the first-round `summon` list first, then `adds`. */
export function addWaves(ctx: SystemContext, u: Unit): AddWave[] {
  const m = mechOf(ctx, u)?.m;
  if (!m) return [];
  return [...(m.summon ?? []), ...(m.adds ?? [])];
}

/** Spawn points of `count` adds round a boss. */
function pointsFor(ctx: SystemContext, u: Unit, at: SpawnAt | undefined, count: number): number[] {
  const e = getEntity(ctx.world, u.id);
  if (!e) return [];
  const map = walkMap(ctx, e.mapId) ?? mapById(ctx.content, e.mapId);
  const out: number[] = [];
  const centre = { x: e.x, y: e.y };
  let reach = 1.5;
  if (at && typeof at === 'object') {
    const loc = mapById(ctx.content, e.mapId)?.locations.find((l) => l.id === at.location);
    if (loc) {
      centre.x = loc.x + loc.w / 2;
      centre.y = loc.y + loc.h / 2;
      reach = 0.6;
    }
  } else if (at === 'edges') reach = EDGE_REACH;
  for (let k = 0; k < count; k++) {
    const a = (k / Math.max(1, count)) * Math.PI * 2;
    let x = centre.x + Math.cos(a) * reach;
    let y = centre.y + Math.sin(a) * reach;
    if (map) {
      const p = nearestWalkable(map, x, y);
      if (p) {
        x = p.x;
        y = p.y;
      }
    }
    out.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  }
  return out;
}

/** Announce a wave: the spawn light, the adds after it (10.5). */
export function announceAdds(
  ctx: SystemContext,
  u: Unit,
  wave: { monster: string; count: number; at?: SpawnAt; despawnWithBoss?: boolean },
  index: number,
): void {
  const mm = mechOf(ctx, u);
  if (!mm || !monsterDef(ctx.content, wave.monster)) return;
  const points = pointsFor(ctx, u, wave.at, wave.count);
  if (points.length === 0) return;
  const fight = fightOf(ctx, u);
  fight.pending = [
    ...(fight.pending ?? []),
    {
      at: ctx.tick + secs(ADD_LEAD_SEC * combatMod(ctx.world, 'telegraph_lead')),
      wave: index,
      monster: wave.monster,
      points,
      ...(wave.despawnWithBoss ? { despawn: true } : {}),
    },
  ];
  ctx.emit('combat.adds', {
    entityId: u.id,
    bossId: mm.mon.id,
    monster: wave.monster,
    op: 'warned',
    points,
  });
}

/** Bring announced adds in: each joins the boss's side and half its threat. */
function arrive(ctx: SystemContext, u: Unit): void {
  const fight = u.boss;
  const mm = mechOf(ctx, u);
  const e = getEntity(ctx.world, u.id);
  if (!fight?.pending || !mm || !e) return;
  const due = fight.pending.filter((p) => p.at <= ctx.tick);
  if (due.length === 0) return;
  fight.pending = fight.pending.filter((p) => p.at > ctx.tick);
  if (fight.pending.length === 0) delete fight.pending;
  for (const p of due) {
    const made: number[] = [];
    for (let i = 0; i + 1 < p.points.length; i += 2) {
      const add = spawnMonster(
        ctx,
        p.monster,
        e.mapId,
        p.points[i] as number,
        p.points[i + 1] as number,
        {
          side: u.side,
          summonerId: u.id,
        },
      );
      if (!add) continue;
      if (p.despawn) add.despawnWithBoss = true;
      made.push(p.points[i] as number, p.points[i + 1] as number);
      // half of every threat on the boss's table (2.5)
      for (const [id, v] of Object.entries(u.threat).sort()) {
        const foe = unitOf(ctx.world, id);
        if (!foe) continue;
        addThreat(ctx, add, id, v * 0.5);
        engage(ctx, add, foe);
      }
    }
    fight.spawned = (fight.spawned ?? 0) + made.length / 2;
    ctx.emit('combat.adds', {
      entityId: u.id,
      bossId: mm.mon.id,
      monster: p.monster,
      op: 'spawned',
      points: made,
    });
  }
}

/**
 * Once a tick in a fight: waves whose health line or clock came are announced (the
 * health-line ones once each), announced adds arrive.
 */
export function tickAdds(ctx: SystemContext, u: Unit, maxHp: number): void {
  const mm = mechOf(ctx, u);
  const brain = u.ai;
  if (!mm || !brain) return;
  const fight = fightOf(ctx, u);
  const frac = healthFrac(u, maxHp);
  const summonCount = mm.m.summon?.length ?? 0;
  addWaves(ctx, u).forEach((w, i) => {
    const path =
      i < summonCount ? `mechanics.summon.${i}.say` : `mechanics.adds.${i - summonCount}.say`;
    if (w.atPct !== undefined) {
      // the first-round bookkeeping (brain.summoned) keeps the line waves fired
      if (brain.summoned.includes(i) || frac > w.atPct) return;
      brain.summoned.push(i);
      fight.addsDone = [...(fight.addsDone ?? []), i];
      bossSay(ctx, u, mm.mon, path, w.say);
      announceAdds(ctx, u, w, i);
      return;
    }
    if (w.every === undefined || w.every <= 0) return;
    const key = String(i);
    const next = fight.addsNext?.[key];
    if (next === undefined) {
      fight.addsNext = { ...(fight.addsNext ?? {}), [key]: fight.start + secs(w.every) };
      return;
    }
    if (ctx.tick < next) return;
    fight.addsNext = { ...(fight.addsNext ?? {}), [key]: next + secs(w.every) };
    bossSay(ctx, u, mm.mon, path, w.say);
    announceAdds(ctx, u, w, i);
  });
  arrive(ctx, u);
}

/** The boss's adds still standing. */
export function addsOf(ctx: SystemContext, u: Unit): Unit[] {
  return Object.keys(ctx.world.slices.combat.units)
    .sort()
    .map((id) => ctx.world.slices.combat.units[id] as Unit)
    .filter((o) => o.summonerId === u.id && !o.terrain)
    .filter((o) => !!liveUnit(ctx.world, o.id));
}

/** The boss fell: adds marked `despawnWithBoss` go with it; the rest fight on (10.5). */
export function addsOnBossDown(ctx: SystemContext, u: Unit): void {
  for (const add of addsOf(ctx, u)) if (add.despawnWithBoss) despawn(ctx, add.id);
}
