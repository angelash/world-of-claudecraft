// The companion brain (companions_and_party.md 7; D-068): a behaviour tree of six layers,
// tried top down until one acts:
//   1 survive   below the retreat line (25% to 40% by caution; not a tank) fall back to the
//               healer or the player and use a defensive skill;
//   2 scripted  a spot the story pins the companion to overrides everything;
//   3 orders    the tactical order in force (7.3) and the personal rules (7.4): obedience
//               100 runs the rules only without an order, below 70 above the order;
//   4 avoid     step out of a ground warning after the reaction delay of the difficulty
//               (7.5); on hard a boss's big move is only dodged on a spread or move order;
//   5 duty      tank, heal, damage by role under the stance (7.2: follow answers only what
//               hits it, assist fights fully, passive holds fire, stay fights from its spot);
//   6 follow    back to its place in the formation (3.3).
// The tree draws no random numbers: the same situation gives the same act. Combat
// tuning by personality and the party chatter belong to the built-in AI package (PK-M1-21).

import type { SystemContext } from '../../core/system';
import {
  canAttack,
  castAs,
  difficultyMods,
  liveUnit,
  pickAbility,
  setAutoAttack,
  telegraphsOn,
  unitOf,
} from '../combat';
import { abilityDef, monsterDef } from '../combat/defs';
import { deriveStats } from '../combat/stats';
import type { AiUse, Unit } from '../combat/types';
import { entitiesNear, getEntity, orderMove, teleportEntity } from '../world';
import type { Entity } from '../world/types';
import { partyConfig } from './config';
import { stateOf } from './roster';
import type { CompanionAi, CompanionRole, Member, PartyConfig, Tactic } from './types';
import { slotNear, tryGetUp } from './wounds';

/** What the brain reads of a companion card (a beast companion has a role only). */
export interface Profile {
  id: string;
  role: CompanionRole;
  ai?: CompanionAi;
  avoid?: string[];
}

const RANGED_ROLES = new Set<CompanionRole>(['ranged', 'caster', 'healer']);
/** Ability uses a companion never picks on its own (crowd control waits for its rules). */
const SKIP: AiUse[] = ['cc'];
const SUPPORT_USES: AiUse[] = ['defensive', 'emergency', 'heal', 'hot', 'shield'];
const ALL_USES: AiUse[] = [
  'filler',
  'opener',
  'dot',
  'debuff',
  'aoe',
  'execute',
  'finisher',
  'heal',
  'hot',
  'shield',
  'emergency',
  'buff',
  'defensive',
  'taunt',
  'interrupt',
  'cc',
  'summon',
  'mana',
];
const only = (uses: AiUse[]): AiUse[] => ALL_USES.filter((x) => !uses.includes(x));

interface Brain {
  ctx: SystemContext;
  cfg: PartyConfig;
  prof: Profile;
  m: Member;
  u: Unit;
  e: Entity;
  pu: Unit;
  pe: Entity;
  n: number;
  party: Unit[];
  fighting: boolean;
}

function hpFrac(b: Pick<Brain, 'ctx'>, u: Unit): number {
  const max = deriveStats(b.ctx.world, b.ctx.content, u).maxHp;
  return max > 0 ? u.hp / max : 1;
}

function walk(b: Brain, x: number, y: number, arrive: number): void {
  if (b.ctx.tick < b.m.pathAt) return;
  b.m.pathAt = b.ctx.tick + 10;
  orderMove(b.ctx, b.u.id, x, y, arrive);
}

function partyUnits(ctx: SystemContext, members: Member[]): Unit[] {
  const out: Unit[] = [];
  const p = liveUnit(ctx.world, ctx.world.slices.world.playerId);
  if (p) out.push(p[0]);
  for (const m of members) {
    const pair = liveUnit(ctx.world, m.entityId);
    if (pair) out.push(pair[0]);
  }
  return out;
}

/** Enemies near `e` whose current target is one of `ids`, nearest first. */
function attackersOf(
  ctx: SystemContext,
  u: Unit,
  e: Entity,
  ids: Set<string>,
  radius: number,
): Unit[] {
  const out: Unit[] = [];
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, radius)) {
    const foe = unitOf(ctx.world, near.id);
    if (!foe?.target || !ids.has(foe.target) || !canAttack(ctx.world, u, foe)) continue;
    // a duelist is its duel partner's alone (combat duel.ts)
    if (foe.duel && foe.duel !== u.duel) continue;
    if (!liveUnit(ctx.world, foe.id)) continue;
    out.push(foe);
  }
  return out;
}

/** Whether an ability is one of the long-cooldown "big" ones (7.3). */
function isBig(b: Brain, abilityId: string): boolean {
  return (abilityDef(b.ctx.content, abilityId)?.cooldown ?? 0) >= b.cfg.bigCooldown;
}

/** Cast a pick unless the card avoids it or a hold-big order keeps it back. */
function castPick(b: Brain, pick: { abilityId: string; targetId?: string } | null): boolean {
  if (!pick || b.prof.avoid?.includes(pick.abilityId)) return false;
  if (b.m.tactic?.kind === 'hold_big' && isBig(b, pick.abilityId)) return false;
  const r = castAs(b.ctx, b.u.id, pick.abilityId, pick.targetId);
  return r.ok;
}

/**
 * A boss shield that a named skill breaks (combat 10.4 `breakBy: ability`; the colossus's
 * ash shell and Yeyu's ravens): a companion that knows the skill uses it while the shield
 * is up. Returns whether it cast.
 */
function breakShield(b: Brain, target: Unit): boolean {
  const up = target.boss?.shields;
  if (!up) return false;
  const shields = monsterDef(b.ctx.content, target.monsterId)?.mechanics?.shields ?? [];
  for (const s of shields) {
    if (s.breakBy !== 'ability' || !s.breakRef || !up[s.id]?.up) continue;
    if (!b.u.abilities.includes(s.breakRef)) continue;
    if (castAs(b.ctx, b.u.id, s.breakRef, target.id).ok) return true;
  }
  return false;
}

/** Fight a target: swing at it, use a skill on it, close in unless anchored. */
function engageTarget(b: Brain, target: Unit, anchor: { x: number; y: number } | null): void {
  const { ctx, u, e } = b;
  if (!u.autoAttack || u.target !== target.id) setAutoAttack(ctx, u.id, true, target.id);
  const skip = [...SKIP];
  if (b.m.tactic?.kind === 'interrupt') skip.push('interrupt');
  if (!breakShield(b, target)) castPick(b, pickAbility(ctx, u, target, { allies: b.party, skip }));
  if (u.cast || anchor) return;
  const te = getEntity(ctx.world, target.id);
  if (!te) return;
  const reach = RANGED_ROLES.has(b.prof.role) ? 6 : e.radius + te.radius + 0.8;
  if (Math.hypot(te.x - e.x, te.y - e.y) > reach) walk(b, te.x, te.y, Math.max(0.5, reach * 0.8));
}

// ---------------------------------------------------------------------------
// layer 1: survive

export function retreatLine(cfg: PartyConfig, prof: Profile): number {
  const rule = prof.ai?.rules?.find((r) => r.kind === 'retreat');
  if (rule && rule.kind === 'retreat') return rule.below;
  const caution = prof.ai?.caution ?? 50;
  return cfg.retreat.base + (caution / 100) * cfg.retreat.span;
}

function survive(b: Brain): boolean {
  if (b.prof.role === 'tank' || !b.fighting) return false;
  if (hpFrac(b, b.u) >= retreatLine(b.cfg, b.prof)) return false;
  const pick = pickAbility(b.ctx, b.u, null, { allies: [b.u], skip: only(SUPPORT_USES) });
  if (pick && castPick(b, { abilityId: pick.abilityId, targetId: pick.targetId ?? b.u.id }))
    return true;
  // fall back to a healer in the field, else to the player
  let to: Entity = b.pe;
  for (const ally of b.party) {
    if (ally.id === b.u.id) continue;
    const ae = getEntity(b.ctx.world, ally.id);
    const ref = ae?.ref;
    const card = ref ? (b.ctx.content.companions ?? []).find((c) => c.id === ref) : undefined;
    if (ae && card?.role === 'healer') {
      to = ae;
      break;
    }
  }
  if (Math.hypot(to.x - b.e.x, to.y - b.e.y) <= 3) return false;
  if (b.u.autoAttack) setAutoAttack(b.ctx, b.u.id, false);
  walk(b, to.x, to.y, 1.5);
  return true;
}

// ---------------------------------------------------------------------------
// layer 2: scripted

function scripted(b: Brain): boolean {
  const s = b.m.scripted;
  if (!s) return false;
  if (b.e.mapId !== s.mapId) teleportEntity(b.ctx, b.u.id, s.mapId, s.x, s.y);
  else if (Math.hypot(b.e.x - s.x, b.e.y - s.y) > 0.8) walk(b, s.x, s.y, 0.4);
  return true;
}

// ---------------------------------------------------------------------------
// layer 3: orders and personal rules

/** The personal rules (7.4). Returns whether one acted. */
function rules(b: Brain): boolean {
  const { ctx, u, e } = b;
  for (const r of b.prof.ai?.rules ?? []) {
    if (r.kind === 'guard') {
      if (hpFrac(b, b.pu) >= r.below) continue;
      for (const foe of attackersOf(ctx, u, e, new Set([b.pu.id]), 12)) {
        const res = castAs(ctx, u.id, r.ability, foe.id);
        if (!res.ok) continue;
        ctx.emit('party.rule', { companionId: b.m.id, rule: 'guard', targetId: foe.id });
        return true;
      }
    } else if (r.kind === 'shield') {
      const ids = new Set<string>();
      for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, 12))
        if (near.tags.some((t) => r.tags.includes(t))) ids.add(near.id);
      if (ids.size === 0) continue;
      if (b.prof.role === 'healer') {
        const hurt = [...ids]
          .map((id) => unitOf(ctx.world, id))
          .filter((x): x is Unit => !!x && !!liveUnit(ctx.world, x.id) && hpFrac(b, x) < 0.7)
          .sort((a, c) => hpFrac(b, a) - hpFrac(b, c) || a.id.localeCompare(c.id))[0];
        if (!hurt) continue;
        const pick = pickAbility(ctx, u, null, { allies: [hurt], skip: only(['heal', 'hot']) });
        if (!pick || !castPick(b, pick)) continue;
        ctx.emit('party.rule', { companionId: b.m.id, rule: 'shield', targetId: hurt.id });
        return true;
      }
      const foe = attackersOf(ctx, u, e, ids, 12)[0];
      if (!foe) continue;
      engageTarget(b, foe, null);
      ctx.emit('party.rule', { companionId: b.m.id, rule: 'shield', targetId: foe.id });
      return true;
    }
  }
  return false;
}

/** The tactical order in force (7.3). Returns whether it acted. */
function tactic(b: Brain, t: Tactic): boolean {
  const { ctx, u, e, m } = b;
  switch (t.kind) {
    case 'interrupt': {
      const target = unitOf(ctx.world, t.targetId);
      if (!target || !liveUnit(ctx.world, target.id)) {
        delete m.tactic;
        return false;
      }
      if (!target.cast) return false;
      const pick = pickAbility(ctx, u, target, { allies: b.party, skip: only(['interrupt']) });
      return castPick(b, pick);
    }
    case 'use_big': {
      delete m.tactic;
      const target = unitOf(ctx.world, b.pu.target ?? u.target);
      const known = [...new Set([...(u.abilities ?? []), ...knownBig(b)])];
      const bigs = known
        .filter((id) => isBig(b, id) && !b.prof.avoid?.includes(id))
        .sort(
          (a, c) =>
            (abilityDef(ctx.content, c)?.cooldown ?? 0) -
              (abilityDef(ctx.content, a)?.cooldown ?? 0) || a.localeCompare(c),
        );
      for (const id of bigs) {
        const def = abilityDef(ctx.content, id);
        const at = def?.target === 'enemy' || def?.target === 'enemy_area' ? target?.id : undefined;
        if (castAs(ctx, u.id, id, at).ok) return true;
      }
      return false;
    }
    case 'goto': {
      if (t.mapId !== undefined && t.mapId !== e.mapId) return false;
      const x = t.x ?? e.x;
      const y = t.y ?? e.y;
      if (Math.hypot(e.x - x, e.y - y) <= 0.8) return false;
      if (u.autoAttack) setAutoAttack(ctx, u.id, false);
      walk(b, x, y, 0.4);
      return true;
    }
    case 'regroup': {
      if (u.autoAttack) setAutoAttack(ctx, u.id, false);
      const s = slotNear(b.pe, b.n);
      if (Math.hypot(e.x - s.x, e.y - s.y) <= 2.5) {
        delete m.tactic;
        return false;
      }
      walk(b, s.x, s.y, 0.6);
      return true;
    }
    default:
      return false;
  }
}

/** The class abilities a unit knows (for the big-ability order). */
function knownBig(b: Brain): string[] {
  const cls = (b.ctx.content.classes ?? []).find((c) => c.id === b.u.classId);
  return (cls?.abilities ?? []).filter((a) => a.level <= b.u.level).map((a) => a.id);
}

function orders(b: Brain): boolean {
  const obedience = b.prof.ai?.obedience ?? 100;
  const t = b.m.tactic;
  if (obedience < 70 && rules(b)) return true;
  if (t && tactic(b, t)) return true;
  if (obedience >= 70 && (!t || obedience < 100) && rules(b)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// layer 4: avoid

/** The tile pairs of a warning hold the companion's tile. */
function inside(cells: readonly number[], x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  for (let i = 0; i + 1 < cells.length; i += 2)
    if (cells[i] === tx && cells[i + 1] === ty) return true;
  return false;
}

function avoid(b: Brain): boolean {
  const { ctx, e, m } = b;
  const warnings = telegraphsOn(ctx.world, e.mapId);
  if (warnings.length === 0) {
    if (m.danger) delete m.danger;
    return false;
  }
  const mods = difficultyMods(ctx.world);
  const ordered = m.tactic?.kind === 'spread' || m.tactic?.kind === 'goto';
  const delay = Math.round(mods.companionReactSec * 20);
  const live = new Set(warnings.map((w) => w.id));
  for (const id of Object.keys(m.danger ?? {})) if (!live.has(id)) delete m.danger?.[id];
  for (const w of warnings) {
    if (w.mark) {
      if (w.mark.targetId === b.u.id && reactToMark(b, w, ordered, delay)) return true;
      continue;
    }
    if (!inside(w.cells, e.x, e.y)) continue;
    // a boss's big move on the hard difficulty waits for the player's order (7.5)
    if (w.tier === 'lethal' && mods.companionAvoidNeedsOrder && !ordered) continue;
    const seen = firstSeen(m, w.id, ctx.tick);
    if (ctx.tick - seen < delay) continue;
    const out = safeSpot(w.cells, e.x, e.y);
    if (!out) continue;
    m.pathAt = 0;
    walk(b, out.x, out.y, 0.3);
    return true;
  }
  return false;
}

/** The tick the member first stood in a warning (the reaction delay counts from it). */
function firstSeen(m: Member, id: string, tick: number): number {
  if (!m.danger) m.danger = {};
  const seen = m.danger[id];
  if (seen !== undefined) return seen;
  m.danger[id] = tick;
  return tick;
}

/**
 * A boss marked this companion (10.5): after the reaction delay a spread or chase mark
 * takes it out of the others' reach, a stack mark brings it to the player. A mark whose
 * data says `needsOrder` waits for a spread or move order.
 */
function reactToMark(
  b: Brain,
  w: ReturnType<typeof telegraphsOn>[number],
  ordered: boolean,
  delay: number,
): boolean {
  const mark = w.mark;
  if (!mark) return false;
  const caster = unitOf(b.ctx.world, w.casterId);
  const def = monsterDef(b.ctx.content, caster?.monsterId ?? null)?.mechanics?.marks?.find(
    (x) => x.ability === w.abilityId,
  );
  if (def?.needsOrder && !ordered) return false;
  const seen = firstSeen(b.m, w.id, b.ctx.tick);
  if (b.ctx.tick - seen < delay) return false;
  const { e, pe } = b;
  const dx = e.x - pe.x;
  const dy = e.y - pe.y;
  const d = Math.hypot(dx, dy);
  if (mark.kind === 'stack') {
    if (d <= 1.2) return false;
    walk(b, pe.x, pe.y, 0.8);
    return true;
  }
  const want = mark.radius + 1;
  if (d >= want) return false;
  const ux = d > 0.01 ? dx / d : 1;
  const uy = d > 0.01 ? dy / d : 0;
  b.m.pathAt = 0;
  walk(b, pe.x + ux * want, pe.y + uy * want, 0.5);
  return true;
}

/** The nearest tile centre outside the warning, searching rings out to four tiles. */
function safeSpot(cells: readonly number[], x: number, y: number) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  for (let r = 1; r <= 4; r++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = tx + dx + 0.5;
        const cy = ty + dy + 0.5;
        if (inside(cells, cx, cy)) continue;
        const d = Math.hypot(cx - x, cy - y);
        if (!best || d < best.d) best = { x: cx, y: cy, d };
      }
    }
    if (best) return best;
  }
  return null;
}

// ---------------------------------------------------------------------------
// layer 5: duty

function anchorOf(b: Brain): { x: number; y: number } | null {
  if (b.m.tactic?.kind === 'goto' && b.m.tactic.x !== undefined && b.m.tactic.y !== undefined)
    return { x: b.m.tactic.x, y: b.m.tactic.y };
  if (b.m.order !== 'stay') return null;
  // the stay spot holds on its own map; elsewhere (the party moved on) the companion stays put
  const s = b.m.stayAt;
  return s && s.mapId === b.e.mapId ? { x: s.x, y: s.y } : { x: b.e.x, y: b.e.y };
}

/** The player's target under a focus order (7.3), when the companion can attack it. */
function focusTarget(b: Brain): Unit | null {
  if (b.m.tactic?.kind !== 'focus') return null;
  const t = unitOf(b.ctx.world, b.pu.target);
  if (!t || !liveUnit(b.ctx.world, t.id) || !canAttack(b.ctx.world, b.u, t)) return null;
  return t.duel && t.duel !== b.u.duel ? null : t;
}

function chooseTarget(b: Brain, anchor: { x: number; y: number } | null): Unit | null {
  const { ctx, u, e, m } = b;
  const focus = focusTarget(b);
  if (focus) return focus;
  if (m.order === 'follow') return attackersOf(ctx, u, e, new Set([u.id]), 8)[0] ?? null;
  const reach = RANGED_ROLES.has(b.prof.role) ? 6 : 2;
  const near = (t: Unit) => {
    if (!anchor) return true;
    const te = getEntity(ctx.world, t.id);
    return !!te && Math.hypot(te.x - anchor.x, te.y - anchor.y) <= reach + 1;
  };
  const pt = unitOf(ctx.world, b.pu.target);
  const engaged = b.pu.autoAttack || !!b.pu.cast || b.pu.combatUntil > ctx.tick;
  const free = !pt?.duel || pt.duel === u.duel;
  if (
    pt &&
    free &&
    engaged &&
    canAttack(ctx.world, u, pt) &&
    liveUnit(ctx.world, pt.id) &&
    near(pt)
  )
    return pt;
  const ids = new Set(b.party.map((p) => p.id));
  return attackersOf(ctx, u, e, ids, 12).find(near) ?? null;
}

function duty(b: Brain): boolean {
  const { ctx, u, e, m } = b;
  // an explicit focus order overrides the passive stance's held fire
  if (m.order === 'passive' && !focusTarget(b)) {
    if (u.autoAttack) setAutoAttack(ctx, u.id, false);
    return false;
  }
  const skip = [...SKIP];
  if (b.prof.role === 'healer' || !b.fighting || m.tactic?.kind === 'heal_only') {
    const support = pickAbility(ctx, u, null, { allies: b.party, skip });
    if (castPick(b, support) && u.cast) return true;
  }
  if (m.tactic?.kind === 'heal_only' && b.prof.role === 'healer') {
    if (u.autoAttack) setAutoAttack(ctx, u.id, false);
    return false;
  }
  if (b.prof.role === 'tank') {
    const protectId = m.tactic?.kind === 'protect' ? m.tactic.targetId : undefined;
    const others = protectId
      ? new Set([protectId])
      : new Set(b.party.filter((p) => p !== u).map((p) => p.id));
    for (const foe of attackersOf(ctx, u, e, others, 8)) {
      const taunt = pickAbility(ctx, u, foe, { allies: b.party, skip });
      if (taunt && taunt.targetId === foe.id && castPick(b, taunt)) break;
    }
  }
  const anchor = anchorOf(b);
  const target = chooseTarget(b, anchor);
  if (!target) {
    if (u.autoAttack) setAutoAttack(ctx, u.id, false);
    return false;
  }
  engageTarget(b, target, anchor);
  return true;
}

// ---------------------------------------------------------------------------
// layer 6: follow

function spreadFactor(b: Brain): number {
  const t = b.m.tactic;
  if (t?.kind === 'spread') return t.on === false ? 0.7 : 1.8;
  return b.ctx.world.slices.party.formation === 'spread' ? 1.5 : 1;
}

function follow(b: Brain): boolean {
  const anchor = anchorOf(b);
  if (anchor) {
    if (Math.hypot(b.e.x - anchor.x, b.e.y - anchor.y) > 1.5) walk(b, anchor.x, anchor.y, 0.5);
    return true;
  }
  let lead: Entity = b.pe;
  const t = b.m.tactic;
  if (t?.kind === 'protect' && t.targetId && (b.prof.ai?.protect ?? 0) >= 80) {
    const pe = getEntity(b.ctx.world, t.targetId);
    if (pe?.alive && pe.mapId === b.e.mapId) lead = pe;
  }
  const s =
    b.ctx.world.slices.party.formation === 'ring'
      ? ringSlot(lead, b.n, spreadFactor(b))
      : slotNear(lead, b.n, spreadFactor(b));
  if (Math.hypot(b.e.x - s.x, b.e.y - s.y) > 2.5) walk(b, s.x, s.y, 0.6);
  return true;
}

function ringSlot(pe: Entity, n: number, spread: number) {
  const angle = pe.facing + (n * Math.PI * 2) / 5;
  const r = 1.8 * spread;
  return { x: pe.x + Math.cos(angle) * r, y: pe.y + Math.sin(angle) * r };
}

// ---------------------------------------------------------------------------
// the tree

const LAYERS: ((b: Brain) => boolean)[] = [survive, scripted, orders, avoid, duty, follow];

/** Hold a spot (waiting at a gate, a pet guarding a bag): answer only what hits it. */
function holdSpot(
  ctx: SystemContext,
  m: Member,
  u: Unit,
  e: Entity,
  spot: { x: number; y: number },
) {
  if (u.cast) return;
  const foe = attackersOf(ctx, u, e, new Set([u.id]), 6)[0];
  if (foe) {
    if (!u.autoAttack || u.target !== foe.id) setAutoAttack(ctx, u.id, true, foe.id);
    return;
  }
  if (u.autoAttack) setAutoAttack(ctx, u.id, false);
  if (Math.hypot(e.x - spot.x, e.y - spot.y) > 1.5 && ctx.tick >= m.pathAt) {
    m.pathAt = ctx.tick + 10;
    orderMove(ctx, u.id, spot.x, spot.y, 0.5);
  }
}

/**
 * A temporary companion (an NPC walking with the player for a quest): its own legs follow
 * the NPC system's follow order; here it only heals and joins the player's fight.
 */
function tickTemp(ctx: SystemContext, prof: Profile, u: Unit, members: Member[]) {
  if (u.cast) return;
  const party = partyUnits(ctx, members);
  const pick = pickAbility(ctx, u, null, { allies: party, skip: [...SKIP] });
  if (
    pick &&
    !prof.avoid?.includes(pick.abilityId) &&
    castAs(ctx, u.id, pick.abilityId, pick.targetId).ok
  )
    return;
  const p = liveUnit(ctx.world, ctx.world.slices.world.playerId);
  const target = p ? unitOf(ctx.world, p[0].target) : undefined;
  if (!target || !liveUnit(ctx.world, target.id) || !canAttack(ctx.world, u, target)) return;
  if (!u.autoAttack || u.target !== target.id) setAutoAttack(ctx, u.id, true, target.id);
  const hit = pickAbility(ctx, u, target, { allies: party, skip: [...SKIP] });
  if (hit && !prof.avoid?.includes(hit.abilityId)) castAs(ctx, u.id, hit.abilityId, hit.targetId);
}

export function tickMember(
  ctx: SystemContext,
  prof: Profile,
  m: Member,
  n: number,
  members: Member[],
): void {
  const playerId = ctx.world.slices.world.playerId;
  const u = unitOf(ctx.world, m.entityId);
  const e = getEntity(ctx.world, m.entityId);
  if (!u || !e) return;
  if (!liveUnit(ctx.world, m.entityId)) {
    if (!m.temp) tryGetUp(ctx, m, u, n);
    return;
  }
  if (m.temp) {
    tickTemp(ctx, prof, u, members);
    return;
  }
  if (stateOf(m) === 'waiting' && m.waitAt) {
    holdSpot(ctx, m, u, e, m.waitAt);
    return;
  }
  if (m.pet?.guarding && m.waitAt) {
    holdSpot(ctx, m, u, e, m.waitAt);
    return;
  }
  const player = liveUnit(ctx.world, playerId);
  if (!player) return;
  const [pu, pe] = player;
  if (e.mapId !== pe.mapId && !m.scripted) {
    const s = slotNear(pe, n);
    teleportEntity(ctx, u.id, pe.mapId, s.x, s.y);
    return;
  }
  const party = partyUnits(ctx, members);
  const b: Brain = {
    ctx,
    cfg: partyConfig(ctx.content),
    prof,
    m,
    u,
    e,
    pu,
    pe,
    n,
    party,
    fighting: party.some((p) => p.combatUntil > ctx.tick),
  };
  if (u.cast) {
    avoid(b);
    return;
  }
  for (const layer of LAYERS) if (layer(b)) return;
}
