// Monster spawning: map spawn points (kind monster, honouring requiresFlags), timed
// respawns in game minutes, registered monster modifiers (count by map id, strength by
// `<mapId>:power`), scripted waves (flag combat.wave.<id> = 'go'), summons, corpses,
// purification (pacifiedBy) and scripted removal (removeOnFlag), and the fixed
// presences combat places itself (the gatekeeper Ash).

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_MINUTE } from '../../core/time';
import { applyModifiers } from '../modifiers';
import {
  getEntity,
  haltEntity,
  mapById,
  nearestWalkable,
  removeEntity,
  spawnEntity,
} from '../world';
import type { MapDef, SpawnDef } from '../world/types';
import { applyAura } from './auras';
import { DEFAULT_SPEED, fixtures, monsterDef, waveDef } from './defs';
import { forgetAttacker } from './threat';
import type { MonsterBrain, Side, Unit } from './types';
import { createUnit, refreshTags, unitOf } from './units';

export interface SpawnOpts {
  level?: number;
  side?: Side;
  summonerId?: string;
  spawnKey?: string;
  waveId?: string;
}

function newBrain(x: number, y: number, tick: number): MonsterBrain {
  return {
    state: 'idle',
    homeX: x,
    homeY: y,
    pullX: x,
    pullY: y,
    wanderAt: tick + 20,
    pathAt: 0,
    goalX: x,
    goalY: y,
    fleeUntil: 0,
    fled: false,
    evadeUntil: 0,
    summoned: [],
    phase: 0,
    enraged: false,
    rampAt: 0,
    abilityAt: 0,
    despawnAt: 0,
  };
}

export function spawnMonster(
  ctx: SystemContext,
  monsterId: string,
  mapId: string,
  x: number,
  y: number,
  opts: SpawnOpts = {},
): Unit | undefined {
  const def = monsterDef(ctx.content, monsterId);
  if (!def || !mapById(ctx.content, mapId)) return undefined;
  const level = opts.level ?? ctx.rng('combat.spawn').int(def.minLevel, def.maxLevel);
  const pacified = !!def.mechanics?.pacifiedBy && !!ctx.flag(def.mechanics.pacifiedBy);
  const side: Side = opts.side ?? (pacified ? 'neutral' : 'enemy');
  const tags = ['monster', `family:${def.family}`, `faction:${def.faction}`];
  if (def.rank && def.rank !== 'normal') tags.push(def.rank);
  if (def.rank === 'rare') tags.push('elite');
  if (def.race) tags.push(`race:${def.race}`);
  if (opts.summonerId) tags.push('summon');
  if (side === 'ally') tags.push('friendly');
  const e = spawnEntity(ctx, {
    kind: 'monster',
    name: def.name,
    mapId,
    x,
    y,
    faction: def.faction,
    appearance: def.appearance,
    speed: def.speed ?? DEFAULT_SPEED,
    radius: 0.35 * (def.appearance.scale ?? 1),
    tags,
    ref: def.id,
    spawnId: opts.spawnKey,
  });
  const power = applyModifiers(ctx.world, 'monster', `${mapId}:power`, 1);
  const u = createUnit(ctx, e.id, {
    monsterId: def.id,
    classId: def.classId ?? null,
    level,
    side,
    power: Math.max(0.1, power),
    presence: def.mechanics?.presence,
  });
  if (!u) return undefined;
  u.ai = newBrain(e.x, e.y, ctx.tick);
  if (opts.summonerId) u.summonerId = opts.summonerId;
  if (opts.spawnKey) u.spawnKey = opts.spawnKey;
  if (opts.waveId) u.waveId = opts.waveId;
  for (const aura of def.mechanics?.passives ?? []) applyAura(ctx, u, aura, u, { permanent: true });
  return u;
}

export function spawnKeyOf(mapId: string, spawnId: string): string {
  return `${mapId}/${spawnId}`;
}

function flagsMet(ctx: SystemContext, flags: string[] | undefined): boolean {
  return !flags || flags.every((f) => !!ctx.flag(f));
}

function spawnPointFor(
  ctx: SystemContext,
  key: string,
): { map: MapDef; spawn: SpawnDef } | undefined {
  const slash = key.indexOf('/');
  const map = mapById(ctx.content, key.slice(0, slash));
  const spawn = map?.spawns.find((s) => s.id === key.slice(slash + 1));
  return map && spawn ? { map, spawn } : undefined;
}

function placeOne(ctx: SystemContext, map: MapDef, spawn: SpawnDef, key: string): Unit | undefined {
  const rng = ctx.rng('combat.spawn');
  const r = (spawn.radius ?? 1) * 0.7;
  const a = rng.next() * Math.PI * 2;
  const d = rng.next() * r;
  const p = nearestWalkable(map, spawn.x + Math.cos(a) * d, spawn.y + Math.sin(a) * d) ?? {
    x: spawn.x,
    y: spawn.y,
  };
  return spawnMonster(ctx, spawn.ref, map.id, p.x, p.y, { spawnKey: key });
}

/** Bring a spawn point up to its (modified) count. */
function populate(ctx: SystemContext, map: MapDef, spawn: SpawnDef): void {
  if (spawn.kind !== 'monster' || !flagsMet(ctx, spawn.requiresFlags)) return;
  const key = spawnKeyOf(map.id, spawn.id);
  const spawns = ctx.world.slices.combat.spawns;
  const state = spawns[key] ?? { alive: [], respawn: [] };
  spawns[key] = state;
  const want = Math.max(
    0,
    Math.round(applyModifiers(ctx.world, 'monster', map.id, spawn.count ?? 1)),
  );
  while (state.alive.length + state.respawn.length < want) {
    const u = placeOne(ctx, map, spawn, key);
    if (!u) break;
    state.alive.push(u.id);
  }
}

/** Populate every flag-satisfied monster spawn point that has never been populated. */
export function populateAll(ctx: SystemContext): void {
  const spawns = ctx.world.slices.combat.spawns;
  for (const map of ctx.content.maps) {
    for (const spawn of map.spawns) {
      if (spawn.kind !== 'monster') continue;
      if (spawns[spawnKeyOf(map.id, spawn.id)]) continue;
      populate(ctx, map, spawn);
    }
  }
}

/** Place the fixed presences (the gatekeeper Ash) once. */
export function placeFixtures(ctx: SystemContext): void {
  for (const f of fixtures(ctx.content)) {
    const map = mapById(ctx.content, f.mapId);
    const loc = map?.locations.find((l) => l.id === f.location);
    if (!map || !loc) continue;
    const e = spawnEntity(ctx, {
      kind: f.kind,
      name: f.name,
      mapId: f.mapId,
      x: loc.x + loc.w / 2,
      y: loc.y + loc.h / 2,
      faction: 'none',
      appearance: f.appearance,
      speed: 0,
      tags: [...f.tags, 'unattackable'],
      ref: f.ref,
      id: `fixture_${f.id}`,
    });
    createUnit(ctx, e.id, {
      level: f.level,
      side: 'neutral',
      attackable: false,
      presence: f.presence,
      tierFloor: f.tier,
    });
  }
}

/** Spawn a scripted wave; returns how many monsters appeared. */
export function startWave(ctx: SystemContext, waveId: string): number {
  const def = waveDef(ctx.content, waveId);
  const map = def ? mapById(ctx.content, def.mapId) : undefined;
  if (!def || !map) return 0;
  const centre = (id: string | undefined) => {
    const l = id ? map.locations.find((x) => x.id === id) : undefined;
    return l ? { x: l.x + l.w / 2, y: l.y + l.h / 2 } : { x: map.width / 2, y: map.height / 2 };
  };
  const at = centre(def.at);
  const target = def.target ? centre(def.target) : undefined;
  const rng = ctx.rng('combat.spawn');
  const members: string[] = [];
  for (const g of def.groups) {
    for (let i = 0; i < g.count; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = rng.next() * (def.radius ?? 3);
      const p = nearestWalkable(map, at.x + Math.cos(a) * d, at.y + Math.sin(a) * d) ?? at;
      const u = spawnMonster(ctx, g.monster, map.id, p.x, p.y, { level: g.level, waveId });
      if (!u) continue;
      if (target) u.march = { ...target };
      members.push(u.id);
    }
  }
  ctx.world.slices.combat.waves[waveId] = { state: 'active', members, tick: ctx.tick };
  ctx.setFlag(`combat.wave.${waveId}.state`, 'active');
  ctx.emit('combat.wave_spawned', { waveId, mapId: map.id, count: members.length });
  return members.length;
}

/** Remove a monster entity and its unit now. */
export function despawn(ctx: SystemContext, id: string): void {
  const slice = ctx.world.slices.combat;
  const u = slice.units[id];
  if (u?.spawnKey) {
    const st = slice.spawns[u.spawnKey];
    if (st) st.alive = st.alive.filter((x) => x !== id);
  }
  forgetAttacker(ctx.world, id);
  delete slice.units[id];
  delete slice.corpses[id];
  removeEntity(ctx, id);
}

/** Corpses, respawns, yielded departures, and wave completion. Runs once a second. */
export function tickSpawns(ctx: SystemContext): void {
  const slice = ctx.world.slices.combat;
  for (const id of Object.keys(slice.corpses).sort()) {
    if ((slice.corpses[id] ?? 0) > ctx.tick) continue;
    const u = slice.units[id];
    const key = u?.spawnKey;
    despawn(ctx, id);
    const point = key ? spawnPointFor(ctx, key) : undefined;
    const st = key ? slice.spawns[key] : undefined;
    if (point && st && point.spawn.respawnMinutes !== undefined) {
      st.respawn.push(ctx.tick + Math.max(1, point.spawn.respawnMinutes * TICKS_PER_GAME_MINUTE));
    }
  }
  for (const key of Object.keys(slice.spawns).sort()) {
    const st = slice.spawns[key];
    if (!st || st.respawn.length === 0) continue;
    const due = st.respawn.filter((t) => t <= ctx.tick);
    if (due.length === 0) continue;
    st.respawn = st.respawn.filter((t) => t > ctx.tick);
    const point = spawnPointFor(ctx, key);
    if (!point || !flagsMet(ctx, point.spawn.requiresFlags)) continue;
    for (let i = 0; i < due.length; i++) {
      const u = placeOne(ctx, point.map, point.spawn, key);
      if (u) st.alive.push(u.id);
    }
  }
  for (const id of Object.keys(slice.units).sort()) {
    const u = slice.units[id];
    if (u?.ai?.state === 'yielded' && u.ai.despawnAt > 0 && u.ai.despawnAt <= ctx.tick)
      despawn(ctx, id);
  }
  for (const waveId of Object.keys(slice.waves).sort()) {
    const w = slice.waves[waveId];
    if (w?.state !== 'active') continue;
    const left = w.members.filter((id) => {
      const e = getEntity(ctx.world, id);
      const u = slice.units[id];
      return !!e && e.alive && !!u && u.ai?.state !== 'yielded';
    });
    if (left.length > 0) continue;
    w.state = 'cleared';
    const def = waveDef(ctx.content, waveId);
    ctx.setFlag(`combat.wave.${waveId}.state`, 'cleared');
    ctx.emit('combat.wave_cleared', { waveId, mapId: def?.mapId ?? '' });
  }
}

/** React to a flag change: waves, gated spawn points, purification, scripted removal. */
export function onFlag(ctx: SystemContext, key: string, value: unknown): void {
  const wave = /^combat\.wave\.([^.]+)$/.exec(key);
  if (wave && value === 'go') {
    startWave(ctx, wave[1] as string);
    return;
  }
  for (const map of ctx.content.maps) {
    for (const spawn of map.spawns) {
      if (spawn.kind !== 'monster' || !spawn.requiresFlags?.includes(key)) continue;
      const st = ctx.world.slices.combat.spawns[spawnKeyOf(map.id, spawn.id)];
      if (!st || (st.alive.length === 0 && st.respawn.length === 0)) populate(ctx, map, spawn);
    }
  }
  if (!value) return;
  for (const w of ctx.content.waves ?? []) {
    const st = ctx.world.slices.combat.waves[w.id];
    if (w.endOnFlag !== key || st?.state !== 'active') continue;
    // tickSpawns reports the wave cleared once its members are gone
    for (const id of [...st.members].sort()) {
      if (ctx.world.slices.combat.units[id]) despawn(ctx, id);
    }
  }
  for (const def of ctx.content.monsters ?? []) {
    const m = def.mechanics;
    if (m?.removeOnFlag === key) {
      for (const id of Object.keys(ctx.world.slices.combat.units).sort()) {
        if (unitOf(ctx.world, id)?.monsterId === def.id) despawn(ctx, id);
      }
    }
    if (m?.pacifiedBy === key) {
      for (const u of Object.values(ctx.world.slices.combat.units)) {
        if (u.monsterId !== def.id || u.side !== 'enemy') continue;
        u.side = 'neutral';
        u.threat = {};
        u.target = null;
        u.autoAttack = false;
        u.cast = null;
        if (u.ai) u.ai.state = 'idle';
        forgetAttacker(ctx.world, u.id);
        haltEntity(ctx, u.id);
        refreshTags(ctx, u);
      }
    }
  }
}
