// Ground warnings (combat_and_classes.md 10.3, 18): an ability with a `telegraph` does not
// strike at once. Its area is computed and locked when the warning appears (one record per
// area, at most three live areas per caster, pulse zones not counted), `combat.telegraph`
// carries the cells, the lead and the tier, and after the lead the ability's effects land
// on every enemy of the caster standing on a cell: no miss, dodge, parry, block or crit roll
// (stepping out is the answer), armour and resistance as usual, once per unit per
// settlement. A cast-bound warning settles with its cast and dies with it. Leads: at least
// 2.0 s lethal, 1.5 s heavy, 1.2 s otherwise, times the difficulty's `telegraph_lead`
// (story 1.5); the warned cast lasts the whole lead, so haste never shortens it.
// `fromAbove` spares units on a cover tile (10.6); `firstHalf` halves a boss's first
// settlement of that ability, once per boss for good (a reset does not re-arm it). Pulse
// zones stay and pulse every `every` seconds from `firstDelay`. Marks (10.5) are warnings
// that follow their target: spread strikes everyone in the radius in full, stack splits
// the hit among them. Registry affixes and death throes lay warnings of their own here too
// (an arena hazard shows its area with the same event, boss/terrain.ts).

import type { SystemContext } from '../../core/system';
import { TICK_HZ } from '../../core/time';
import { entitiesOnMap, getEntity, mapById, teleportEntity } from '../world';
import { effectsOn } from './abilities';
import { applyAura } from './auras';
import { resolveHit } from './damage';
import { abilityDef, secs } from './defs';
import { combatMod } from './difficulty';
import type { MarkDef, TelegraphDef, TelegraphShape, TelegraphState } from './mech_types';
import { cellSet, mergeCells, type ShapeAnchor, shapeCells, tileKey } from './telegraph_shapes';
import type { AbilityDef, DrCategory, School, Unit } from './types';
import { isHostilePair, liveUnit, unitOf } from './units';

/** At most this many warning areas of one caster at a time, pulse zones aside (10.3). */
export const TELEGRAPH_CAP = 3;
/** The least lead of each tier, in seconds (10.3). */
export const MIN_LEAD: Readonly<Record<TelegraphDef['tier'], number>> = {
  lethal: 2,
  heavy: 1.5,
  normal: 1.2,
};
/** The least delay of a pulse zone's first pulse (10.3). */
export const MIN_FIRST_PULSE = 1.2;
/** Members of a caster's foes an `each_member` circle can reach (tiles). */
const MEMBER_REACH = 30;

function states(ctx: SystemContext): Record<string, TelegraphState> {
  const slice = ctx.world.slices.combat;
  if (!slice.telegraphs) slice.telegraphs = {};
  return slice.telegraphs;
}

/** Live warning areas of a caster, pulse zones aside. */
export function liveAreas(ctx: SystemContext, casterId: string): number {
  let n = 0;
  for (const t of Object.values(ctx.world.slices.combat.telegraphs ?? {}))
    if (t.casterId === casterId && !t.pulse) n++;
  return n;
}

/** The lead of a warned ability in ticks: the longer of its cast and its lead, by difficulty. */
export function leadTicks(ctx: SystemContext, def: AbilityDef): number {
  const tg = def.telegraph;
  if (!tg) return 0;
  const sec = Math.max(def.castTime ?? 0, tg.lead);
  return Math.max(1, secs(sec * combatMod(ctx.world, 'telegraph_lead')));
}

/** The caster's foes on its map within reach, by id (the members of `each_member`). */
function foesOf(ctx: SystemContext, caster: Unit, mapId: string, x: number, y: number): Unit[] {
  const out: Unit[] = [];
  for (const e of entitiesOnMap(ctx.world, mapId)) {
    const u = unitOf(ctx.world, e.id);
    if (!u || !liveUnit(ctx.world, u.id) || !isHostilePair(caster, u) || !u.attackable) continue;
    if (u.terrain) continue;
    if (Math.hypot(e.x - x, e.y - y) > MEMBER_REACH) continue;
    out.push(u);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The anchors of one warning: one per area. */
function anchors(
  ctx: SystemContext,
  caster: Unit,
  shape: TelegraphShape,
  target: Unit | null,
  at?: { x: number; y: number },
): ShapeAnchor[] {
  const ce = getEntity(ctx.world, caster.id);
  if (!ce) return [];
  const te = target ? getEntity(ctx.world, target.id) : undefined;
  const aim = at ?? (te ? { x: te.x, y: te.y } : { x: ce.x, y: ce.y });
  const facing = Math.atan2(aim.y - ce.y, aim.x - ce.x);
  if (shape.kind === 'cone' || shape.kind === 'line') return [{ x: ce.x, y: ce.y, facing }];
  const where = shape.at;
  if (where === 'each_member') {
    return foesOf(ctx, caster, ce.mapId, ce.x, ce.y)
      .slice(0, TELEGRAPH_CAP)
      .map((u) => {
        const e = getEntity(ctx.world, u.id);
        return { x: e?.x ?? ce.x, y: e?.y ?? ce.y, facing };
      });
  }
  const centre = where === 'self' ? { x: ce.x, y: ce.y } : aim;
  const count =
    shape.kind === 'circle' ? Math.max(1, Math.min(TELEGRAPH_CAP, shape.count ?? 1)) : 1;
  if (count === 1) return [{ ...centre, facing }];
  // several circles of one cast: the first on the point, the rest round it (no dice)
  const out: ShapeAnchor[] = [{ ...centre, facing }];
  const r = (shape.kind === 'circle' ? shape.radius : 1) * 2;
  for (let k = 1; k < count; k++) {
    const ang = facing + (2 * Math.PI * k) / (count - 1);
    out.push({ x: centre.x + Math.cos(ang) * r, y: centre.y + Math.sin(ang) * r, facing });
  }
  return out;
}

export interface WarnSpec {
  /** the ability it settles */
  ability?: AbilityDef;
  /** or the source of an affix, hazard or death throe and what it lays */
  source?: string;
  damage?: number;
  aura?: string;
  school?: School;
  shape: TelegraphShape;
  tier: TelegraphDef['tier'];
  /** ticks from now to the (first) settlement */
  leadTicks: number;
  fromAbove?: boolean;
  half?: boolean;
  cast?: boolean;
  follow?: string;
  mark?: { kind: MarkDef['kind']; targetId: string; radius: number };
  /** where the area stands, when not on the caster or its target */
  at?: { x: number; y: number };
  mapId?: string;
  /** the aura's length, strength and ladder (registry affixes) */
  auraSec?: number;
  auraScale?: number;
  auraDr?: DrCategory;
  /** a charge lands its caster here once the line settles */
  dash?: [number, number];
  /** a mark the companions dodge only on the player's order (10.5) */
  needsOrder?: boolean;
}

/**
 * Lay a warning: returns the new warning ids, or null when the caster already has its three
 * areas (a pulse zone never waits).
 */
export function warn(
  ctx: SystemContext,
  caster: Unit,
  target: Unit | null,
  spec: WarnSpec,
): string[] | null {
  const ce = getEntity(ctx.world, caster.id);
  const mapId = spec.mapId ?? ce?.mapId;
  const map = mapId ? mapById(ctx.content, mapId) : undefined;
  if (!ce || !map || !mapId) return null;
  const list = anchors(ctx, caster, spec.shape, target, spec.at);
  if (list.length === 0) return null;
  const pulse = spec.shape.kind === 'pulse';
  if (!pulse && liveAreas(ctx, caster.id) + list.length > TELEGRAPH_CAP) return null;
  const ids: string[] = [];
  for (const a of list) {
    const cells = shapeCells(spec.shape, a, map);
    const id = ctx.newId('tg');
    const st: TelegraphState = {
      id,
      casterId: caster.id,
      mapId,
      kind: spec.shape.kind,
      tier: spec.tier,
      cells,
      start: ctx.tick,
      settle: ctx.tick + spec.leadTicks,
    };
    if (spec.ability) st.abilityId = spec.ability.id;
    if (spec.source) st.source = spec.source;
    if (spec.damage !== undefined) st.damage = spec.damage;
    if (spec.aura) st.aura = spec.aura;
    if (spec.auraSec !== undefined) st.auraSec = spec.auraSec;
    if (spec.auraScale !== undefined) st.auraScale = spec.auraScale;
    if (spec.auraDr) st.auraDr = spec.auraDr;
    if (spec.dash) st.dash = spec.dash;
    if (spec.school) st.school = spec.school;
    if (spec.fromAbove) st.fromAbove = true;
    if (spec.half) st.half = true;
    if (spec.cast) st.cast = true;
    if (spec.follow) {
      st.follow = spec.follow;
      st.radius = spec.mark?.radius ?? (spec.shape.kind === 'circle' ? spec.shape.radius : 0);
    }
    if (spec.mark) st.mark = spec.mark;
    if (spec.shape.kind === 'pulse') {
      const until = ctx.tick + secs(spec.shape.duration);
      st.pulse = { every: Math.max(1, secs(spec.shape.every)), next: st.settle, until };
    }
    states(ctx)[id] = st;
    ids.push(id);
    ctx.emit('combat.telegraph', {
      id,
      casterId: caster.id,
      ...(st.abilityId ? { abilityId: st.abilityId } : {}),
      mapId,
      kind: st.kind,
      tier: st.tier,
      cells,
      lead: spec.leadTicks / TICK_HZ,
      school: spec.school ?? spec.ability?.school ?? 'physical',
      side: caster.side,
      start: st.start,
      settle: st.settle,
      ...(st.fromAbove ? { fromAbove: true } : {}),
      ...(spec.mark ? { markedId: spec.mark.targetId, markKind: spec.mark.kind } : {}),
      ...(spec.needsOrder ? { needsOrder: true } : {}),
    });
  }
  return ids;
}

/**
 * Lay the warning of a telegraphed ability (the cast bar runs alongside). The first time a
 * boss settles a `firstHalf` ability it hits for half (10.3).
 */
export function warnAbility(
  ctx: SystemContext,
  caster: Unit,
  def: AbilityDef,
  target: Unit | null,
): string[] | null {
  const tg = def.telegraph;
  if (!tg) return null;
  const pulse = tg.shape.kind === 'pulse';
  const lead = pulse
    ? Math.max(
        1,
        secs(
          Math.max(MIN_FIRST_PULSE, tg.shape.kind === 'pulse' ? tg.shape.firstDelay : 0) *
            combatMod(ctx.world, 'telegraph_lead'),
        ),
      )
    : leadTicks(ctx, def);
  const half = !!tg.firstHalf && !(caster.firstHalf ?? []).includes(def.id);
  return warn(ctx, caster, target, {
    ability: def,
    shape: tg.shape,
    tier: tg.tier,
    leadTicks: lead,
    fromAbove: tg.fromAbove,
    half,
    cast: !pulse,
    follow: tg.follow && tg.tier !== 'lethal' && target ? target.id : undefined,
  });
}

/** End a warning and report it. */
function end(
  ctx: SystemContext,
  t: TelegraphState,
  op: 'settled' | 'cancelled' | 'expired',
  hit?: string[],
): void {
  const all = ctx.world.slices.combat.telegraphs;
  if (!all?.[t.id]) return;
  delete all[t.id];
  if (Object.keys(all).length === 0) delete ctx.world.slices.combat.telegraphs;
  ctx.emit('combat.telegraph_ended', {
    id: t.id,
    casterId: t.casterId,
    op,
    ...(hit ? { hit } : {}),
  });
}

/** Cancel a caster's cast-bound warnings (its cast broke, it died, it reset). */
export function cancelWarnings(ctx: SystemContext, casterId: string, castOnly = true): void {
  const all = ctx.world.slices.combat.telegraphs;
  if (!all) return;
  for (const id of Object.keys(all).sort()) {
    const t = all[id];
    if (t && t.casterId === casterId && (!castOnly || t.cast)) end(ctx, t, 'cancelled');
  }
}

/** Cover tiles of a map: the cover rectangles of the arena objects placed there (10.6). */
export function coverTiles(ctx: SystemContext, mapId: string): Set<string> {
  const out = new Set<string>();
  for (const t of Object.values(ctx.world.slices.combat.terrain ?? {})) {
    if (t.role !== 'cover' || t.mapId !== mapId || !t.rect) continue;
    const [x0, y0, x1, y1] = t.rect;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.add(`${x},${y}`);
  }
  return out;
}

/** The cells of a warning now: a following one re-centres on its unit. */
function cellsNow(ctx: SystemContext, t: TelegraphState): Set<string> {
  if (!t.follow) return cellSet(t.cells);
  const fe = getEntity(ctx.world, t.follow);
  const map = mapById(ctx.content, t.mapId);
  const radius = t.radius ?? t.mark?.radius;
  if (!fe || !map || fe.mapId !== t.mapId || radius === undefined) return cellSet(t.cells);
  return cellSet(
    shapeCells({ kind: 'circle', radius, at: 'target' }, { x: fe.x, y: fe.y, facing: 0 }, map),
  );
}

/** The caster's foes standing on the warning now, by id; cover spares `fromAbove` hits. */
function struck(ctx: SystemContext, caster: Unit, t: TelegraphState): Unit[] {
  const cells = cellsNow(ctx, t);
  const cover = t.fromAbove ? coverTiles(ctx, t.mapId) : undefined;
  const out: Unit[] = [];
  for (const e of entitiesOnMap(ctx.world, t.mapId)) {
    const u = unitOf(ctx.world, e.id);
    if (!u || u === caster || !liveUnit(ctx.world, u.id) || !isHostilePair(caster, u)) continue;
    if (!u.attackable || u.terrain) continue;
    const k = tileKey(e.x, e.y);
    if (!cells.has(k) || cover?.has(k)) continue;
    out.push(u);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Land one settlement (or one pulse) of a warning. Returns the units struck. */
function land(ctx: SystemContext, caster: Unit, t: TelegraphState): string[] {
  let targets = struck(ctx, caster, t);
  let share = 1;
  if (t.mark) {
    const fe = getEntity(ctx.world, t.mark.targetId);
    const marked = unitOf(ctx.world, t.mark.targetId);
    if (fe && marked && liveUnit(ctx.world, marked.id)) {
      // the mark settles round its carrier: spread hurts all near in full, stack shares
      const near = targets.filter((u) => {
        const e = getEntity(ctx.world, u.id);
        return !!e && Math.hypot(e.x - fe.x, e.y - fe.y) <= (t.mark?.radius ?? 0);
      });
      targets = near.includes(marked) ? near : [marked, ...near];
      if (t.mark.kind === 'stack') share = 1 / Math.max(1, targets.length);
    }
  }
  const mult = share * (t.half ? 0.5 : 1);
  const def = t.abilityId ? abilityDef(ctx.content, t.abilityId) : undefined;
  for (const u of targets) {
    if (!liveUnit(ctx.world, u.id)) continue;
    if (def) effectsOn(ctx, caster, def, u, { noRoll: true, mult });
    else {
      if (t.damage && t.damage > 0)
        resolveHit(ctx, {
          source: caster,
          target: u,
          amount: t.damage * mult,
          school: (t.school as School | undefined) ?? 'physical',
          kind: 'spell',
          abilityId: t.source,
          noRoll: true,
        });
      if (t.aura && liveUnit(ctx.world, u.id))
        applyAura(ctx, u, t.aura, caster, {
          ...(t.auraSec !== undefined ? { durationTicks: secs(t.auraSec) } : {}),
          ...(t.auraScale !== undefined ? { scale: t.auraScale } : {}),
          ...(t.auraDr ? { abilityDr: t.auraDr as DrCategory } : {}),
        });
    }
  }
  if (t.half && def && !(caster.firstHalf ?? []).includes(def.id))
    caster.firstHalf = [...(caster.firstHalf ?? []), def.id];
  // a pulse zone halves its first pulse only
  if (t.pulse) delete t.half;
  if (t.dash && liveUnit(ctx.world, caster.id))
    teleportEntity(ctx, caster.id, t.mapId, t.dash[0], t.dash[1]);
  return targets.map((u) => u.id);
}

/** Settle a caster's cast-bound warnings of an ability (the warned cast finished). */
export function settleCast(ctx: SystemContext, caster: Unit, abilityId: string): string[] {
  const all = ctx.world.slices.combat.telegraphs;
  if (!all) return [];
  const hit: string[] = [];
  for (const id of Object.keys(all).sort()) {
    const t = all[id];
    if (!t || t.casterId !== caster.id || !t.cast || t.abilityId !== abilityId) continue;
    const h = land(ctx, caster, t);
    hit.push(...h);
    end(ctx, t, 'settled', h);
  }
  return hit;
}

/**
 * Once a tick: warnings not bound to a cast settle at their tick, pulse zones pulse until
 * they run out, cast-bound warnings whose cast is gone are cancelled.
 */
export function tickTelegraphs(ctx: SystemContext): void {
  const all = ctx.world.slices.combat.telegraphs;
  if (!all) return;
  for (const id of Object.keys(all).sort()) {
    const t = all[id];
    if (!t) continue;
    const caster = unitOf(ctx.world, t.casterId);
    if (!caster) {
      end(ctx, t, 'cancelled');
      continue;
    }
    if (t.cast) {
      const c = caster.cast;
      if (!c?.warned || c.abilityId !== t.abilityId) end(ctx, t, 'cancelled');
      continue;
    }
    if (t.pulse) {
      if (ctx.tick >= t.pulse.until) {
        end(ctx, t, 'expired');
        continue;
      }
      if (ctx.tick >= t.pulse.next) {
        t.pulse.next += t.pulse.every;
        land(ctx, caster, t);
      }
      continue;
    }
    if (ctx.tick < t.settle) continue;
    end(ctx, t, 'settled', land(ctx, caster, t));
  }
}

/** The warnings on a map, for the overlay (18 `ui_ovl_telegraph`). */
export function telegraphsOn(
  world: SystemContext['world'],
  mapId: string,
): readonly TelegraphState[] {
  return Object.values(world.slices.combat.telegraphs ?? {})
    .filter((t) => t.mapId === mapId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Merge helper re-exported for the views (several areas of one cast drawn as one decal). */
export { mergeCells };
