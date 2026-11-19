// Layer 4 of the companion's tree, avoid (companions_and_party.md 7.1, 7.5; combat_and_classes
// .md 10.3, 10.5, 10.6): what the companion steps away from, after the reaction delay of the
// difficulty (0.3, 0.6, 1.0 seconds), counted from the first tick it stood in the danger:
// - a ground warning it stands in (a boss's lethal move on the hard difficulty waits for a
//   spread or move order);
// - a mark on itself: a spread or chase mark takes it out of the others' reach, a stack mark
//   brings it to the player;
// - a mark on another member or the player: it keeps out of a spread or chase circle and
//   steps into a stack circle;
// - an arena hazard zone (a terrain record of role hazard while its boss fights): it steps
//   off and does not walk in to reach its target (dangerAt).
// A mark whose data says `needsOrder` waits for the player's spread or move order (10.5).
// Every step lands on walkable ground out of every live danger at once (a warning, a hazard,
// another's spread or chase circle), falling back to the nearest spot out of the one it
// answers. A warning counts while its caster is a foe, or gone (the strike still lands).
// Draws no random numbers.

import type { SystemContext } from '../../core/system';
import { difficultyMods, liveUnit, telegraphsOn, unitOf } from '../combat';
import { monsterDef } from '../combat/defs';
import type { TelegraphState, TerrainState } from '../combat/mech_types';
import type { Unit } from '../combat/types';
import { isHostilePair } from '../combat/units';
import { entitiesNear, getEntity, isWalkable, walkMap } from '../world';
import type { Entity } from '../world/types';
import type { Member } from './types';

/** What the avoid layer needs of the brain. */
export interface AvoidEnv {
  ctx: SystemContext;
  m: Member;
  u: Unit;
  e: Entity;
  /** the player's entity */
  pe: Entity;
  /** walk now (the path throttle reset), arriving within `arrive` tiles */
  walk(x: number, y: number, arrive: number): void;
}

/** Whether the tile pairs of a warning hold the tile of (x, y). */
export function inCells(cells: readonly number[], x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  for (let i = 0; i + 1 < cells.length; i += 2)
    if (cells[i] === tx && cells[i + 1] === ty) return true;
  return false;
}

/** Whether a point lies in a hazard's rectangle (half-open, as combat settles it). */
function inRect(rect: readonly number[] | undefined, x: number, y: number): boolean {
  return (
    !!rect && x >= (rect[0] ?? 0) && x < (rect[2] ?? 0) && y >= (rect[1] ?? 0) && y < (rect[3] ?? 0)
  );
}

/** The live hazard zones of a map: role hazard, switched on, its boss fighting (10.6). */
export function hazardsOn(world: SystemContext['world'], mapId: string): TerrainState[] {
  const all = world.slices.combat.terrain;
  if (!all) return [];
  const out: TerrainState[] = [];
  for (const id of Object.keys(all).sort()) {
    const rec = all[id];
    if (rec?.role !== 'hazard' || rec.state !== 'on' || rec.mapId !== mapId) continue;
    const boss = unitOf(world, rec.bossId);
    if (boss?.ai?.state !== 'chase' || !liveUnit(world, boss.id)) continue;
    out.push(rec);
  }
  return out;
}

/** Whether a warning is a foe's: its caster is hostile to `self`, or gone (it still lands). */
function hostileCaster(world: SystemContext['world'], casterId: string, self: Unit): boolean {
  const caster = unitOf(world, casterId);
  return !caster || isHostilePair(caster, self);
}

/**
 * Whether a point is ground the companion should not walk into: a hostile warning area, a
 * spread or chase circle around someone else (10.5), or a live hazard zone. Used when closing
 * in on a target, holding a spot and choosing where to step.
 */
export function dangerAt(
  world: SystemContext['world'],
  self: Unit,
  mapId: string,
  x: number,
  y: number,
  heed: (w: TelegraphState) => boolean = () => true,
): boolean {
  for (const w of telegraphsOn(world, mapId)) {
    if (!hostileCaster(world, w.casterId, self)) continue;
    if (w.mark) {
      if (w.mark.kind === 'stack' || w.mark.targetId === self.id || !heed(w)) continue;
      const marked = getEntity(world, w.mark.targetId);
      if (!marked?.alive || marked.mapId !== mapId) continue;
      if (Math.hypot(x - marked.x, y - marked.y) < w.mark.radius + 0.5) return true;
      continue;
    }
    if (inCells(w.cells, x, y)) return true;
  }
  return hazardsOn(world, mapId).some((h) => inRect(h.rect, x, y));
}

/** The tick the member first stood in a danger (the reaction delay counts from it). */
function firstSeen(m: Member, id: string, tick: number): number {
  if (!m.danger) m.danger = {};
  const seen = m.danger[id];
  if (seen !== undefined) return seen;
  m.danger[id] = tick;
  return tick;
}

/** The nearest tile centre out of a danger, searching rings out to `maxR` tiles. */
export function safeSpotBy(
  inside: (x: number, y: number) => boolean,
  x: number,
  y: number,
  maxR = 4,
) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  for (let r = 1; r <= maxR; r++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = tx + dx + 0.5;
        const cy = ty + dy + 0.5;
        if (inside(cx, cy)) continue;
        const d = Math.hypot(cx - x, cy - y);
        if (!best || d < best.d) best = { x: cx, y: cy, d };
      }
    }
    if (best) return best;
  }
  return null;
}

/** Whether a mark's data says the companions wait for the player's order (10.5). */
function markNeedsOrder(ctx: SystemContext, w: TelegraphState): boolean {
  const caster = unitOf(ctx.world, w.casterId);
  const def = monsterDef(ctx.content, caster?.monsterId ?? null)?.mechanics?.marks?.find(
    (x) => x.ability === w.abilityId,
  );
  return !!def?.needsOrder;
}

function needsOrder(env: AvoidEnv, w: TelegraphState): boolean {
  return markNeedsOrder(env.ctx, w);
}

/** The player gave the order a `needsOrder` mark waits for (spread, or go to a spot). */
export function orderedToMove(m: Member): boolean {
  return m.tactic?.kind === 'spread' || m.tactic?.kind === 'goto';
}

/**
 * Which marks a member heeds as danger where it walks and holds: all but a `needsOrder` mark
 * before the player's order (10.5: it stays put until told).
 */
export function heedsOf(ctx: SystemContext, m: Member): (w: TelegraphState) => boolean {
  return (w) => orderedToMove(m) || !markNeedsOrder(ctx, w);
}

/**
 * A boss marked this companion (10.5): after the reaction delay a spread or chase mark
 * takes it out of the others' reach, a stack mark brings it to the player.
 */
function ownMark(env: AvoidEnv, w: TelegraphState, ordered: boolean, delay: number): boolean {
  const mark = w.mark;
  if (!mark) return false;
  if (needsOrder(env, w) && !ordered) return false;
  const seen = firstSeen(env.m, w.id, env.ctx.tick);
  if (env.ctx.tick - seen < delay) return false;
  const { e, pe } = env;
  if (mark.kind === 'stack') {
    if (Math.hypot(e.x - pe.x, e.y - pe.y) <= 1.2) return false;
    env.walk(pe.x, pe.y, 0.8);
    return true;
  }
  // spread or chase: out of the reach of every ally around it at once (10.5), on safe ground
  const want = mark.radius + 1;
  const around = alliesNear(env, want * 3);
  if (!around.some((a) => Math.hypot(a.x - e.x, a.y - e.y) < want)) return false;
  const clear = safeSpotBy(
    (x, y) => unsafeAt(env, x, y) || around.some((a) => Math.hypot(a.x - x, a.y - y) < want),
    e.x,
    e.y,
    Math.ceil(want * 2) + 1,
  );
  if (clear) {
    env.walk(clear.x, clear.y, 0.3);
    return true;
  }
  // no such ground in sight: straight away from the nearest
  const near = alliesNear(env, want).sort(
    (a, b) =>
      Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y) || (a.id < b.id ? -1 : 1),
  );
  const from = near[0];
  if (!from) return false;
  const dx = e.x - from.x;
  const dy = e.y - from.y;
  const d = Math.hypot(dx, dy);
  const ux = d > 0.01 ? dx / d : 1;
  const uy = d > 0.01 ? dy / d : 0;
  env.walk(from.x + ux * want, from.y + uy * want, 0.5);
  return true;
}

/** The player and the other party members standing within `reach` of the companion. */
function alliesNear(env: AvoidEnv, reach: number): Entity[] {
  const out: Entity[] = [];
  for (const near of entitiesNear(env.ctx.world, env.e.mapId, env.e.x, env.e.y, reach)) {
    if (near.id === env.e.id) continue;
    const other = unitOf(env.ctx.world, near.id);
    if (!other || isHostilePair(other, env.u) || !liveUnit(env.ctx.world, near.id)) continue;
    if (near.id !== env.pe.id && near.kind !== 'companion') continue;
    out.push(near);
  }
  return out;
}

/** A warning of a foe of this companion (a friendly ground effect is no danger, 10.3). */
function hostileWarning(env: AvoidEnv, w: TelegraphState): boolean {
  return hostileCaster(env.ctx.world, w.casterId, env.u);
}

/**
 * A boss marked someone else (10.5): keep out of a spread or chase circle, step into a
 * stack circle (the hit is shared among those inside). Returns whether it moved.
 */
function otherMark(env: AvoidEnv, w: TelegraphState, ordered: boolean, delay: number): boolean {
  const mark = w.mark;
  if (!mark) return false;
  const marked = getEntity(env.ctx.world, mark.targetId);
  if (!marked?.alive || marked.mapId !== env.e.mapId) return false;
  const dx = env.e.x - marked.x;
  const dy = env.e.y - marked.y;
  const d = Math.hypot(dx, dy);
  const stack = mark.kind === 'stack';
  // already where the mark wants it: nothing to answer
  if (stack ? d <= Math.max(0.8, mark.radius - 0.5) : d >= mark.radius + 0.5) return false;
  if (needsOrder(env, w) && !ordered) return false;
  const seen = firstSeen(env.m, w.id, env.ctx.tick);
  if (env.ctx.tick - seen < delay) return false;
  if (stack) {
    env.walk(marked.x, marked.y, Math.max(0.6, mark.radius - 1));
    return true;
  }
  const want = mark.radius + 1;
  const out = safeSpotBy(
    (x, y) => unsafeAt(env, x, y) || Math.hypot(x - marked.x, y - marked.y) < want,
    env.e.x,
    env.e.y,
    Math.ceil(want) + 2,
  );
  if (out) {
    env.walk(out.x, out.y, 0.3);
    return true;
  }
  const ux = d > 0.01 ? dx / d : 1;
  const uy = d > 0.01 ? dy / d : 0;
  env.walk(marked.x + ux * want, marked.y + uy * want, 0.5);
  return true;
}

/** Ground not to step on: off the walkable map, or in any live danger (dangerAt). */
function unsafeAt(env: AvoidEnv, x: number, y: number): boolean {
  const map = walkMap(env.ctx, env.e.mapId);
  return (
    (!!map && !isWalkable(map, x, y)) ||
    dangerAt(env.ctx.world, env.u, env.e.mapId, x, y, heedsOf(env.ctx, env.m))
  );
}

/** Layer 4 of the tree: returns whether the companion moved away from (or into) danger. */
export function avoid(env: AvoidEnv): boolean {
  const { ctx, e, m } = env;
  const warnings = telegraphsOn(ctx.world, e.mapId);
  const hazards = hazardsOn(ctx.world, e.mapId);
  if (warnings.length === 0 && hazards.length === 0) {
    if (m.danger) delete m.danger;
    return false;
  }
  const mods = difficultyMods(ctx.world);
  const ordered = orderedToMove(m);
  const delay = Math.round(mods.companionReactSec * 20);
  const live = new Set([...warnings.map((w) => w.id), ...hazards.map((h) => h.id)]);
  for (const id of Object.keys(m.danger ?? {})) if (!live.has(id)) delete m.danger?.[id];
  // the nearest ground out of every live danger at once, so the step never lands in another
  const unsafe = (x: number, y: number) => unsafeAt(env, x, y);
  for (const w of warnings) {
    if (!hostileWarning(env, w)) continue;
    if (w.mark) {
      if (w.mark.targetId === env.u.id) {
        if (ownMark(env, w, ordered, delay)) return true;
      } else if (otherMark(env, w, ordered, delay)) return true;
      continue;
    }
    if (!inCells(w.cells, e.x, e.y)) continue;
    // a boss's big move on the hard difficulty waits for the player's order (7.5)
    if (w.tier === 'lethal' && mods.companionAvoidNeedsOrder && !ordered) continue;
    const seen = firstSeen(m, w.id, ctx.tick);
    if (ctx.tick - seen < delay) continue;
    const out =
      safeSpotBy((x, y) => inCells(w.cells, x, y) || unsafe(x, y), e.x, e.y) ??
      safeSpotBy((x, y) => inCells(w.cells, x, y), e.x, e.y);
    if (!out) continue;
    env.walk(out.x, out.y, 0.3);
    return true;
  }
  for (const h of hazards) {
    if (!inRect(h.rect, e.x, e.y)) continue;
    const seen = firstSeen(m, h.id, ctx.tick);
    if (ctx.tick - seen < delay) continue;
    const out =
      safeSpotBy((x, y) => inRect(h.rect, x, y) || unsafe(x, y), e.x, e.y) ??
      safeSpotBy((x, y) => inRect(h.rect, x, y), e.x, e.y);
    if (!out) continue;
    env.walk(out.x, out.y, 0.3);
    return true;
  }
  return false;
}
