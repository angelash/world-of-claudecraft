// Arena objects (combat_and_classes.md 10.6) and breakable parts (catalog_dungeons_bosses.md
// 1.6). A boss's data names its objects by a location of its map (`at`) or, until the arena
// map gives one, by an offset from its home. They are placed when the boss spawns and put
// back when it resets:
// - breakable: an object with health on the boss's side, so the player can strike it; when
//   it falls its effect fires (a stagger and a cast break on the boss within its radius, or
//   actions), and shields waiting on it break;
// - interact: a one-second use (`combat.interact`), broken by a hit or a step away;
// - switch: an interact object whose use flips its state;
// - cover: a rectangle where `fromAbove` warnings do not land;
// - hazard: a rectangle that pulses an aura or damage on the boss's foes standing there,
//   once every `every` seconds while the boss fights.
// Parts are breakable objects that show from a phase on and stay at the boss's side.
// Entity fields change only through the world system's ports.

import type { SystemContext } from '../../../core/system';
import { TICK_HZ } from '../../../core/time';
import {
  entitiesOnMap,
  getEntity,
  mapById,
  nearestWalkable,
  removeEntity,
  setLife,
  spawnEntity,
  teleportEntity,
  walkMap,
} from '../../world';
import type { Appearance } from '../../world/types';
import { applyAura } from '../auras';
import { resolveHit } from '../damage';
import { scaled, secs } from '../defs';
import { combatMod } from '../difficulty';
import type { BossAction, TerrainState, TerrainUse } from '../mech_types';
import { deriveStats } from '../stats';
import { MIN_FIRST_PULSE } from '../telegraph';
import type { Unit } from '../types';
import { createUnit, isHostilePair, liveUnit, unitOf } from '../units';
import { fightOf, mechOf } from './fight';
import { staggerBoss, terrainBreaksShield } from './shields';

/** The default look of an arena object (a heap of stone); data may give its own. */
const OBJECT_LOOK: Appearance = {
  base: 'object',
  colors: ['#5a5650', '#3a3632', '#8a847a', '#2a2622'],
};
/** A breakable object strikes this far round itself when it falls. */
const FALL_RADIUS = 2.5;
/** A unit must stand this close to use an object. */
export const INTERACT_REACH = 2;
/** The use of an object takes one second (10.6). */
export const INTERACT_SEC = 1;
/** Hazards pulse once a second unless their data says otherwise. */
const HAZARD_EVERY = 1;

function records(ctx: SystemContext): Record<string, TerrainState> {
  const slice = ctx.world.slices.combat;
  if (!slice.terrain) slice.terrain = {};
  return slice.terrain;
}

/** The arena objects of a boss unit, in id order. */
export function terrainOf(ctx: SystemContext, bossId: string): TerrainState[] {
  return Object.values(ctx.world.slices.combat.terrain ?? {})
    .filter((t) => t.bossId === bossId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function initialState(role: TerrainUse['role']): string {
  return role === 'breakable'
    ? 'intact'
    : role === 'switch'
      ? 'off'
      : role === 'interact'
        ? 'ready'
        : 'on';
}

/** Where a use stands on the boss's map: its location's centre or rectangle, or its offset. */
function placeOf(
  ctx: SystemContext,
  boss: Unit,
  use: { at?: string; offset?: [number, number]; size?: number },
): { x: number; y: number; rect: [number, number, number, number] } | undefined {
  const e = getEntity(ctx.world, boss.id);
  if (!e) return undefined;
  if (use.at) {
    const loc = mapById(ctx.content, e.mapId)?.locations.find((l) => l.id === use.at);
    if (!loc) return undefined;
    return {
      x: loc.x + loc.w / 2,
      y: loc.y + loc.h / 2,
      rect: [loc.x, loc.y, loc.x + loc.w, loc.y + loc.h],
    };
  }
  const hx = boss.ai?.homeX ?? e.x;
  const hy = boss.ai?.homeY ?? e.y;
  const [dx, dy] = use.offset ?? [0, 0];
  const map = walkMap(ctx, e.mapId);
  const p = map ? nearestWalkable(map, hx + dx, hy + dy) : null;
  const x = p?.x ?? hx + dx;
  const y = p?.y ?? hy + dy;
  const s = use.size ?? 0.5;
  return { x, y, rect: [Math.floor(x - s), Math.floor(y - s), Math.ceil(x + s), Math.ceil(y + s)] };
}

/** Give a breakable object a unit with its share of the boss's health. */
function breakableUnit(
  ctx: SystemContext,
  boss: Unit,
  entityId: string,
  recId: string,
  share: number,
): void {
  // neutral: no rest, hunt or presence reads it as a foe; only the boss's foes strike it
  const u = createUnit(ctx, entityId, { level: boss.level, side: 'neutral', presence: 0 });
  if (!u) return;
  u.terrain = recId;
  const want = Math.max(1, Math.round(deriveStats(ctx.world, ctx.content, boss).maxHp * share));
  const base = deriveStats(ctx.world, ctx.content, u).maxHp;
  u.hpScale = want / Math.max(1, base);
  u.hp = deriveStats(ctx.world, ctx.content, u).maxHp;
}

/** Place one object or area; returns its record. */
function place(
  ctx: SystemContext,
  boss: Unit,
  use: TerrainUse & { part?: boolean },
): TerrainState | undefined {
  const mm = mechOf(ctx, boss);
  const e = getEntity(ctx.world, boss.id);
  const at = placeOf(ctx, boss, use);
  if (!mm || !e || !at) return undefined;
  const solid = use.role === 'breakable' || use.role === 'interact' || use.role === 'switch';
  let id: string;
  if (solid) {
    const ent = spawnEntity(ctx, {
      kind: 'object',
      name: use.name ?? '',
      mapId: e.mapId,
      x: at.x,
      y: at.y,
      faction: 'none',
      appearance: use.appearance ?? OBJECT_LOOK,
      speed: 0,
      tags: ['terrain', use.role, ...(use.part ? ['boss_part'] : [])],
      ref: `${mm.mon.id}.${use.object}`,
    });
    id = ent.id;
  } else id = ctx.newId('ter');
  const rec: TerrainState = {
    id,
    bossId: boss.id,
    monsterId: mm.mon.id,
    object: use.object,
    role: use.role,
    mapId: e.mapId,
    x: at.x,
    y: at.y,
    state: initialState(use.role),
  };
  if (!solid) rec.rect = at.rect;
  if (use.part) rec.part = true;
  records(ctx)[id] = rec;
  if (use.role === 'breakable') breakableUnit(ctx, boss, id, id, use.hp ?? 0.05);
  ctx.emit('combat.terrain', {
    objectId: id,
    object: use.object,
    bossId: mm.mon.id,
    role: use.role,
    op: 'placed',
    state: rec.state,
    ...(rec.rect ? { cells: rectCells(rec) } : {}),
  });
  return rec;
}

/** Place a boss's arena objects (when it spawns). */
export function placeTerrain(ctx: SystemContext, boss: Unit): void {
  for (const use of mechOf(ctx, boss)?.m.terrain ?? []) place(ctx, boss, use);
}

/** The use of an object of the boss's data. */
export function useOf(
  ctx: SystemContext,
  rec: TerrainState,
): (TerrainUse & { part?: boolean }) | undefined {
  const m = mechOf(ctx, { monsterId: rec.monsterId })?.m;
  if (rec.part) {
    const p = m?.breakableParts?.find((x) => x.id === rec.object);
    return p
      ? { object: p.id, role: 'breakable', hp: p.hp, effect: p.onBreak, part: true }
      : undefined;
  }
  return m?.terrain?.find((t) => t.object === rec.object);
}

/** Put every object of the boss back (a reset, 10.6); parts are taken away. */
export function restoreTerrain(ctx: SystemContext, boss: Unit): void {
  for (const rec of terrainOf(ctx, boss.id)) {
    if (rec.part) {
      dropRecord(ctx, rec);
      continue;
    }
    const initial = initialState(rec.role);
    delete rec.next;
    const u = unitOf(ctx.world, rec.id);
    // a cracked stone is whole again too
    if (u && rec.state === initial) u.hp = deriveStats(ctx.world, ctx.content, u).maxHp;
    if (rec.state === initial) continue;
    rec.state = initial;
    if (u) {
      setLife(ctx, rec.id, true);
      u.hp = deriveStats(ctx.world, ctx.content, u).maxHp;
      u.threat = {};
    }
    ctx.emit('combat.terrain', {
      objectId: rec.id,
      object: rec.object,
      bossId: rec.monsterId,
      role: rec.role,
      op: 'restored',
      state: rec.state,
    });
  }
}

function dropRecord(ctx: SystemContext, rec: TerrainState): void {
  const all = ctx.world.slices.combat.terrain;
  if (all) delete all[rec.id];
  if (all && Object.keys(all).length === 0) delete ctx.world.slices.combat.terrain;
  if (getEntity(ctx.world, rec.id)) {
    delete ctx.world.slices.combat.units[rec.id];
    removeEntity(ctx, rec.id);
  }
}

/** The boss is gone for good: its objects go with it. */
export function clearTerrain(ctx: SystemContext, bossId: string): void {
  for (const rec of terrainOf(ctx, bossId)) dropRecord(ctx, rec);
}

/** Run an object's effect against its boss. */
function fire(
  ctx: SystemContext,
  rec: TerrainState,
  use: TerrainUse | undefined,
  by: Unit | null,
  run: (boss: Unit, actions: BossAction[], path: string) => void,
): void {
  const boss = unitOf(ctx.world, rec.bossId);
  if (!boss || !use) return;
  const eff = use.effect;
  if (Array.isArray(eff)) {
    const m = mechOf(ctx, boss)?.m;
    const idx = rec.part
      ? (m?.breakableParts ?? []).findIndex((p) => p.id === rec.object)
      : (m?.terrain ?? []).findIndex((t) => t.object === rec.object);
    run(
      boss,
      eff,
      rec.part ? `mechanics.breakable_parts.${idx}.on_break` : `mechanics.terrain.${idx}.effect`,
    );
  } else if (eff) {
    const be = getEntity(ctx.world, boss.id);
    const near =
      !!be &&
      Math.hypot(be.x - rec.x, be.y - rec.y) <= (use.radius ?? FALL_RADIUS) &&
      !!liveUnit(ctx.world, boss.id);
    if (near) staggerBoss(ctx, boss, eff.stagger, by ?? undefined);
  }
  terrainBreaksShield(ctx, boss, rec.object);
}

/** A breakable object (or part) fell: it stays down until the boss resets. */
export function terrainBroken(
  ctx: SystemContext,
  u: Unit,
  by: Unit | null,
  run: (boss: Unit, actions: BossAction[], path: string) => void,
): void {
  const rec = u.terrain ? ctx.world.slices.combat.terrain?.[u.terrain] : undefined;
  u.hp = 0;
  setLife(ctx, u.id, false);
  if (!rec || rec.state === 'broken') return;
  rec.state = 'broken';
  ctx.emit('combat.terrain', {
    objectId: rec.id,
    object: rec.object,
    bossId: rec.monsterId,
    role: rec.role,
    op: 'broken',
    state: rec.state,
  });
  fire(ctx, rec, useOf(ctx, rec), by, run);
}

/** Start using an object (the `combat.interact` command). */
export function startInteract(ctx: SystemContext, u: Unit, objectId: string): string | null {
  const rec = ctx.world.slices.combat.terrain?.[objectId];
  if (!rec || (rec.role !== 'interact' && rec.role !== 'switch')) return 'not_usable';
  if (rec.role === 'interact' && rec.state !== 'ready') return 'used';
  const e = getEntity(ctx.world, u.id);
  if (!e || e.mapId !== rec.mapId || Math.hypot(e.x - rec.x, e.y - rec.y) > INTERACT_REACH)
    return 'out_of_range';
  if (u.cast) return 'busy';
  u.interact = { objectId, until: ctx.tick + secs(INTERACT_SEC), x: e.x, y: e.y };
  return null;
}

/** A hit or a step breaks a use in progress (10.6: like the return charm's channel). */
export function breakInteract(u: Unit): void {
  if (u.interact) delete u.interact;
}

/** Advance a use: a step away breaks it; at its end the object is used (or flipped). */
export function tickInteract(
  ctx: SystemContext,
  u: Unit,
  run: (boss: Unit, actions: BossAction[], path: string) => void,
): void {
  const it = u.interact;
  if (!it) return;
  const e = getEntity(ctx.world, u.id);
  if (!e || Math.hypot(e.x - it.x, e.y - it.y) > 0.3) {
    delete u.interact;
    return;
  }
  if (ctx.tick < it.until) return;
  delete u.interact;
  const rec = ctx.world.slices.combat.terrain?.[it.objectId];
  if (!rec) return;
  rec.state = rec.role === 'switch' ? (rec.state === 'on' ? 'off' : 'on') : 'used';
  // a use counts toward an interaction resolution only inside the boss's fight
  const fight = unitOf(ctx.world, rec.bossId)?.boss;
  if (fight) fight.used = [...(fight.used ?? []), rec.object];
  ctx.emit('combat.terrain', {
    objectId: rec.id,
    object: rec.object,
    bossId: rec.monsterId,
    role: rec.role,
    op: rec.role === 'switch' ? 'switched' : 'used',
    state: rec.state,
  });
  fire(ctx, rec, useOf(ctx, rec), u, run);
}

/** Set an object's state (a `terrain` action). */
export function setTerrainState(
  ctx: SystemContext,
  boss: Unit,
  object: string,
  state: string,
): void {
  for (const rec of terrainOf(ctx, boss.id)) {
    if (rec.object !== object || rec.state === state) continue;
    rec.state = state;
    ctx.emit('combat.terrain', {
      objectId: rec.id,
      object: rec.object,
      bossId: rec.monsterId,
      role: rec.role,
      op: 'switched',
      state,
    });
  }
}

/** The tiles of a record's rectangle, x and y in pairs. */
export function rectCells(rec: TerrainState): number[] {
  const r = rec.rect;
  if (!r) return [];
  const out: number[] = [];
  for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) out.push(x, y);
  return out;
}

/** Show a hazard's area as a pulse-zone warning for the overlay and the cue (18). */
function warnHazard(ctx: SystemContext, boss: Unit, rec: TerrainState, first: number): void {
  ctx.emit('combat.telegraph', {
    id: rec.id,
    casterId: boss.id,
    mapId: rec.mapId,
    kind: 'pulse',
    tier: 'normal',
    cells: rectCells(rec),
    lead: (first - ctx.tick) / TICK_HZ,
    start: ctx.tick,
    settle: first,
    school: 'shadow',
    side: boss.side,
  });
}

/** Whether a point lies in a record's rectangle. */
function inRect(rec: TerrainState, x: number, y: number): boolean {
  const r = rec.rect;
  return !!r && x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
}

/** Hazards of fighting bosses pulse on the boss's foes standing in them (10.6). */
export function tickHazards(ctx: SystemContext): void {
  const all = ctx.world.slices.combat.terrain;
  if (!all) return;
  for (const id of Object.keys(all).sort()) {
    const rec = all[id];
    if (rec?.role !== 'hazard' || rec.state !== 'on') continue;
    const boss = unitOf(ctx.world, rec.bossId);
    if (boss?.ai?.state !== 'chase' || !liveUnit(ctx.world, boss.id)) continue;
    const use = useOf(ctx, rec);
    if (!use) continue;
    if (rec.next === undefined) {
      // the first pulse of a fight comes after the pulse-zone lead; the area shows at once
      rec.next = ctx.tick + secs(MIN_FIRST_PULSE * combatMod(ctx.world, 'telegraph_lead'));
      warnHazard(ctx, boss, rec, rec.next);
      continue;
    }
    if (ctx.tick < rec.next) continue;
    rec.next = ctx.tick + secs(use.every ?? HAZARD_EVERY);
    for (const e of entitiesOnMap(ctx.world, rec.mapId)) {
      const u = unitOf(ctx.world, e.id);
      if (!u || u.terrain || !liveUnit(ctx.world, u.id) || !isHostilePair(boss, u)) continue;
      if (!inRect(rec, e.x, e.y)) continue;
      if (use.damage)
        resolveHit(ctx, {
          source: boss,
          target: u,
          amount: scaled(use.damage, boss.level, 0),
          school: 'shadow',
          kind: 'spell',
          abilityId: `terrain:${use.object}`,
          noRoll: true,
        });
      if (use.aura && liveUnit(ctx.world, u.id)) applyAura(ctx, u, use.aura, boss);
    }
  }
}

/** Parts that show from the boss's current phase, and parts kept at its side (once a tick). */
export function tickParts(ctx: SystemContext, boss: Unit, phase: number): void {
  const m = mechOf(ctx, boss)?.m;
  const parts = m?.breakableParts;
  if (!parts || parts.length === 0) return;
  const fight = fightOf(ctx, boss);
  const be = getEntity(ctx.world, boss.id);
  if (!be) return;
  for (const p of parts) {
    const placed = fight.parts?.[p.id];
    if (!placed) {
      if ((p.phase ?? 0) > phase) continue;
      const rec = place(ctx, boss, { object: p.id, role: 'breakable', hp: p.hp, part: true });
      if (rec) fight.parts = { ...(fight.parts ?? {}), [p.id]: rec.id };
      continue;
    }
    const pe = getEntity(ctx.world, placed);
    if (pe?.alive && Math.hypot(pe.x - be.x, pe.y - be.y) > 0.5)
      teleportEntity(ctx, placed, be.mapId, be.x, be.y);
  }
}
