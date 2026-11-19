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
// The tree draws no random numbers: the same situation gives the same act. The avoid layer
// lives in ./danger.ts; the stance and the opening move of a fight in ./tactics.ts; the
// party chatter in ./banter.ts (PK-M1-21).
// Personality tunes the layers it owns (7.4): the retreat line reads caution, a companion
// that holds people dear (protect 80 or over) peels what strikes the player before taking
// the player's own target, and a `spare` rule keeps a companion from firing at the kinds it
// will not kill (Shiya and a fleeing beast).

import type { SystemContext } from '../../core/system';
import { canAttack, castAs, liveUnit, pickAbility, setAutoAttack, unitOf } from '../combat';
import { abilityDef, monsterDef } from '../combat/defs';
import { deriveStats } from '../combat/stats';
import type { AiUse, Unit } from '../combat/types';
import { entitiesNear, getEntity, orderMove, teleportEntity } from '../world';
import type { Entity } from '../world/types';
import { partyConfig } from './config';
import { avoid as avoidDanger, dangerAt, heedsOf, safeSpotBy } from './danger';
import { stateOf } from './roster';
import { openingOf } from './tactics';
import type { CompanionAi, CompanionRole, Member, OpeningKind, PartyConfig, Tactic } from './types';
import { slotNear, tryGetUp } from './wounds';

/** What the brain reads of a companion card (a beast companion has a role only). */
export interface Profile {
  id: string;
  role: CompanionRole;
  ai?: CompanionAi;
  avoid?: string[];
}

const RANGED_ROLES = new Set<CompanionRole>(['ranged', 'caster', 'healer']);
/** A companion with this much `protect` peels what strikes the player first (7.4). */
export const PROTECT_FIRST = 80;
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

/** How far a companion looks for a shield one of its skills breaks. */
const SHIELD_SIGHT = 12;

/**
 * Any shield in sight that one of the companion's skills breaks (10.4): the key act of the
 * fight, whatever the companion's own target (a guard at the player's side, a holder of a
 * spot). Nearest first, ties by id. Returns whether it cast.
 */
function breakAnyShield(b: Brain): boolean {
  const { ctx, u, e } = b;
  const near = entitiesNear(ctx.world, e.mapId, e.x, e.y, SHIELD_SIGHT)
    .map((ne) => ({ ne, d: Math.hypot(ne.x - e.x, ne.y - e.y) }))
    .sort((a, c) => a.d - c.d || (a.ne.id < c.ne.id ? -1 : a.ne.id > c.ne.id ? 1 : 0));
  for (const { ne } of near) {
    const t = unitOf(ctx.world, ne.id);
    if (!t?.boss?.shields || !liveUnit(ctx.world, t.id) || !canAttack(ctx.world, u, t)) continue;
    if (breakShield(b, t)) return true;
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
  const d = Math.hypot(te.x - e.x, te.y - e.y);
  if (d <= reach) return;
  // where the approach ends: short of the target on the companion's side; never into a
  // hostile warning or a hazard zone (combat 10.3, 10.6), the companion waits outside
  const stop = Math.max(0.5, reach * 0.8);
  const ax = te.x + ((e.x - te.x) / d) * stop;
  const ay = te.y + ((e.y - te.y) / d) * stop;
  const heed = heedsOf(ctx, b.m);
  if (
    dangerAt(ctx.world, u, e.mapId, ax, ay, heed) &&
    !dangerAt(ctx.world, u, e.mapId, e.x, e.y, heed)
  )
    return;
  walk(b, te.x, te.y, stop);
}

/**
 * Whether a personal rule spares a target (7.4 `spare`): a monster of one of the rule's
 * families, or only while it flees when the rule says so.
 */
export function spares(prof: Profile, family: string | undefined, fleeing: boolean): boolean {
  for (const r of prof.ai?.rules ?? []) {
    if (r.kind !== 'spare' || !family || !r.families.includes(family)) continue;
    if (!r.fleeing || fleeing) return true;
  }
  return false;
}

function spared(b: Brain, t: Unit): boolean {
  if (!b.prof.ai?.rules?.some((r) => r.kind === 'spare')) return false;
  const family = monsterDef(b.ctx.content, t.monsterId)?.family;
  return spares(b.prof, family, t.ai?.state === 'flee');
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
// layer 4: avoid (./danger.ts)

function avoid(b: Brain): boolean {
  return avoidDanger({
    ctx: b.ctx,
    m: b.m,
    u: b.u,
    e: b.e,
    pe: b.pe,
    walk: (x, y, arrive) => {
      b.m.pathAt = 0;
      walk(b, x, y, arrive);
    },
  });
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

/**
 * The duty layer's target (7.1 输出): the player's target, then what strikes the healer,
 * then the nearest foe striking the party; a companion that holds people dear (protect
 * PROTECT_FIRST or over, 7.4) first peels what strikes the player. The follow stance only
 * answers what strikes the companion itself (7.2). A `spare` rule passes over its kinds.
 */
function chooseTarget(b: Brain, anchor: { x: number; y: number } | null): Unit | null {
  const { ctx, u, e, m } = b;
  const focus = focusTarget(b);
  if (focus) return focus;
  const ok = (t: Unit) => !spared(b, t);
  if (m.order === 'follow') {
    // a guard the built-in AI set to follow (11.1: the guarding stance) answers what
    // strikes the player too; a follow the player ordered answers only what strikes the
    // companion (7.2)
    if (m.stanceBy !== 'player' && (b.prof.ai?.protect ?? 0) >= PROTECT_FIRST) {
      const guard = attackersOf(ctx, u, e, new Set([b.pu.id]), 8).find(ok);
      if (guard) return guard;
    }
    return attackersOf(ctx, u, e, new Set([u.id]), 8).find(ok) ?? null;
  }
  const reach = RANGED_ROLES.has(b.prof.role) ? 6 : 2;
  const near = (t: Unit) => {
    if (!ok(t)) return false;
    if (!anchor) return true;
    const te = getEntity(ctx.world, t.id);
    return !!te && Math.hypot(te.x - anchor.x, te.y - anchor.y) <= reach + 1;
  };
  if ((b.prof.ai?.protect ?? 0) >= PROTECT_FIRST) {
    const peel = attackersOf(ctx, u, e, new Set([b.pu.id]), 12).find(near);
    if (peel) return peel;
  }
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
  const healers = new Set(
    b.party.filter((p) => p.id !== u.id && healerOf(b, p.id)).map((p) => p.id),
  );
  if (healers.size > 0) {
    const onHealer = attackersOf(ctx, u, e, healers, 12).find(near);
    if (onHealer) return onHealer;
  }
  const ids = new Set(b.party.map((p) => p.id));
  return attackersOf(ctx, u, e, ids, 12).find(near) ?? null;
}

/** Whether a party unit is a healer companion (its card's role). */
function healerOf(b: Brain, unitId: string): boolean {
  const ref = getEntity(b.ctx.world, unitId)?.ref;
  const card = ref ? (b.ctx.content.companions ?? []).find((c) => c.id === ref) : undefined;
  return card?.role === 'healer';
}

/**
 * The opening move of the fight (builtin_ai.md 11.1): assist opens with an opener on the
 * target or control on a second foe, stay with a buff, follow by stepping to the player's
 * side. One act; a move that finds nothing to do lapses. Returns whether it acted.
 */
function opening(b: Brain, kind: OpeningKind, target: Unit | null): boolean {
  const { ctx, u, m } = b;
  if (kind === 'close') {
    const s = slotNear(b.pe, b.n);
    if (Math.hypot(b.e.x - s.x, b.e.y - s.y) <= 2) {
      delete m.opening;
      return false;
    }
    walk(b, s.x, s.y, 0.6);
    return true;
  }
  if (kind === 'buff') {
    delete m.opening;
    const pick = pickAbility(ctx, u, null, {
      allies: b.party,
      skip: only(['buff', 'shield', 'hot']),
    });
    return castPick(b, pick);
  }
  delete m.opening;
  if (!target) return false;
  const burst = pickAbility(ctx, u, target, { allies: b.party, skip: only(['opener']) });
  if (castPick(b, burst)) return true;
  // control on a foe the player is not fighting (7.1 控: the loose one)
  const ids = new Set(b.party.map((p) => p.id));
  for (const foe of attackersOf(ctx, u, b.e, ids, 10)) {
    if (foe.id === target.id || foe.id === b.pu.target || spared(b, foe)) continue;
    const cc = pickAbility(ctx, u, foe, { allies: b.party, skip: only(['cc']) });
    if (cc && cc.targetId === foe.id && castPick(b, cc)) return true;
  }
  return false;
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
  // a shield only this companion's skill breaks comes before anything else (10.4)
  if (b.fighting && breakAnyShield(b)) return true;
  const anchor = anchorOf(b);
  const target = chooseTarget(b, anchor);
  // the opening move comes first, with or without a target of its own (11.1): a guard
  // steps to the player, a cautious one buffs, only the burst needs a foe
  const open = b.fighting ? openingOf(ctx, m) : null;
  if (open && (open !== 'burst' || target) && opening(b, open, target)) return true;
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
    // a held spot in danger (another's spread circle, a warning): safe ground near it instead
    const s = safeSlot(b, anchor, anchor);
    if (Math.hypot(b.e.x - s.x, b.e.y - s.y) > 1.5) walk(b, s.x, s.y, 0.5);
    return true;
  }
  let lead: Entity = b.pe;
  const t = b.m.tactic;
  if (t?.kind === 'protect' && t.targetId && (b.prof.ai?.protect ?? 0) >= 80) {
    const pe = getEntity(b.ctx.world, t.targetId);
    if (pe?.alive && pe.mapId === b.e.mapId) lead = pe;
  }
  const slot =
    b.ctx.world.slices.party.formation === 'ring'
      ? ringSlot(lead, b.n, spreadFactor(b))
      : slotNear(lead, b.n, spreadFactor(b));
  // a slot in a hostile warning or a hazard zone: hold safe ground near the lead rather than
  // walk through the danger to it (10.6); from far away, the nearest safe ground to the slot
  const s = safeSlot(b, slot, lead);
  if (Math.hypot(b.e.x - s.x, b.e.y - s.y) > 2.5) walk(b, s.x, s.y, 0.6);
  return true;
}

/** How near the lead a companion on safe ground holds when its slot is in danger. */
const HOLD_NEAR = 6;

function safeSlot(
  b: Brain,
  s: { x: number; y: number },
  lead: { x: number; y: number },
): { x: number; y: number } {
  const heed = heedsOf(b.ctx, b.m);
  const bad = (x: number, y: number) => dangerAt(b.ctx.world, b.u, b.e.mapId, x, y, heed);
  if (!bad(s.x, s.y)) return s;
  const here = { x: b.e.x, y: b.e.y };
  if (!bad(here.x, here.y) && Math.hypot(here.x - lead.x, here.y - lead.y) <= HOLD_NEAR)
    return here;
  return safeSpotBy(bad, s.x, s.y) ?? here;
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
