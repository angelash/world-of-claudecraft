// Combat tactics of the autoplayer. It reads only what the player's HUD shows (unit
// frames, the ability bar with usability, nearby hostiles, who is attacking whom) and
// answers with the player's own combat commands: target, auto-attack and casts. One
// ability per decision, chosen by the ability's declared use (heal when hurt, buffs
// once, damage otherwise), the same vocabulary the companion AI reads.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { abilityBar, isHostile, unitView } from '../../systems/combat';
import { checkAbility } from '../../systems/combat/abilities';
import type { AbilityDef, Unit } from '../../systems/combat/types';
import { canAttack } from '../../systems/combat/units';
import { stateOf } from '../../systems/party/roster';
import { getEntity, playerEntity } from '../../systems/world';
import type { Entity } from '../../systems/world/types';

export interface CombatCommand {
  kind: 'combat.target' | 'combat.attack' | 'combat.cast';
  data: Record<string, unknown>;
}

/** Edge-to-edge distance between two entities on the same map (combat's own gap rule). */
export function gapBetween(a: Entity, b: Entity): number {
  if (a.mapId !== b.mapId) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius);
}

function unitsOf(world: World): Record<string, Unit> {
  return world.slices.combat.units;
}

function alive(world: World, id: string): boolean {
  const e = getEntity(world, id);
  const u = unitsOf(world)[id];
  return !!e && e.alive && !e.hidden && !!u && !u.downed && u.hp > 0;
}

/** Ids of the player's side: the player and every party member entity. */
export function friendlyIds(world: World): Set<string> {
  const out = new Set<string>([world.slices.world.playerId]);
  const members = world.slices.party?.members ?? {};
  for (const m of Object.values(members)) {
    if (stateOf(m) === 'party' && m.entityId) out.add(m.entityId);
  }
  return out;
}

/**
 * Hostile units on the player's map that are fighting the player's side (targeting
 * the player or a companion, or holding threat on them), nearest first.
 */
export function attackers(world: World, radius = 18): string[] {
  const p = playerEntity(world);
  if (!p) return [];
  const friends = friendlyIds(world);
  const out: { id: string; d: number }[] = [];
  for (const u of Object.values(unitsOf(world))) {
    if (u.side !== 'enemy' || !alive(world, u.id)) continue;
    if (u.ai?.state === 'evade' || u.ai?.state === 'yielded') continue;
    const e = getEntity(world, u.id);
    if (!e || e.mapId !== p.mapId) continue;
    const engaged =
      (u.target !== null && friends.has(u.target)) ||
      Object.keys(u.threat).some((id) => friends.has(id));
    if (!engaged) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d <= radius) out.push({ id: u.id, d });
  }
  return out.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id)).map((x) => x.id);
}

/** Hostile, attackable units near a point (for pull planning). */
export function hostilesAround(
  world: World,
  mapId: string,
  x: number,
  y: number,
  r: number,
): number {
  let n = 0;
  for (const u of Object.values(unitsOf(world))) {
    if (u.side !== 'enemy' || !u.attackable || !alive(world, u.id)) continue;
    const e = getEntity(world, u.id);
    if (!e || e.mapId !== mapId) continue;
    if (Math.hypot(e.x - x, e.y - y) <= r) n++;
  }
  return n;
}

/**
 * Attackable hostile entities matching a filter on the player's map, best pull first:
 * near ones, and ones standing alone (social monsters bring their neighbours).
 */
export function huntable(
  world: World,
  match: (e: Entity, u: Unit) => boolean,
  maxLevelGap = Number.POSITIVE_INFINITY,
): string[] {
  const p = playerEntity(world);
  const me = unitsOf(world)[world.slices.world.playerId];
  if (!p || !me) return [];
  const out: { id: string; score: number }[] = [];
  for (const u of Object.values(unitsOf(world))) {
    if (!u.attackable || !alive(world, u.id)) continue;
    const e = getEntity(world, u.id);
    if (!e || e.mapId !== p.mapId) continue;
    if (!isHostile(world, me.id, u.id) || !canAttack(world, me, u)) continue;
    if (u.level - me.level > maxLevelGap) continue;
    if (u.ai?.state === 'yielded') continue;
    if (!match(e, u)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const crowd = Math.max(0, hostilesAround(world, e.mapId, e.x, e.y, 5) - 1);
    out.push({ id: u.id, score: d + crowd * 8 + Math.max(0, u.level - me.level) * 3 });
  }
  return out.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id)).map((x) => x.id);
}

/** Level of a live unit (0 when unknown). */
export function unitLevel(world: World, id: string): number {
  return unitsOf(world)[id]?.level ?? 0;
}

/** Does the player carry this aura (door fatigue after a death, for example)? */
export function playerHasAura(world: World, aura: string): boolean {
  return hasAura(unitsOf(world)[world.slices.world.playerId], aura);
}

/** Mana as a fraction (1 when the player has no mana pool). */
export function playerMana(world: World, content: ContentMap): number {
  const v = unitView(world, content, world.slices.world.playerId);
  const mana = v?.resources.find((r) => r.kind === 'mana');
  return mana && mana.max > 0 ? mana.cur / mana.max : 1;
}

/** The companion on the player's map with the least health left, if any is hurt. */
export function companionInNeed(
  world: World,
  content: ContentMap,
): { id: string; frac: number } | null {
  const p = playerEntity(world);
  let best: { id: string; frac: number } | null = null;
  for (const m of Object.values(world.slices.party?.members ?? {})) {
    if (stateOf(m) !== 'party') continue;
    if (!m.entityId || !alive(world, m.entityId)) continue;
    const e = getEntity(world, m.entityId);
    if (!e || !p || e.mapId !== p.mapId) continue;
    const v = unitView(world, content, m.entityId);
    if (!v || v.maxHp <= 0) continue;
    const frac = v.hp / v.maxHp;
    if (frac < 1 && (!best || frac < best.frac - 1e-9)) best = { id: m.entityId, frac };
  }
  return best;
}

/** The player's health as a fraction (1 when unknown). */
export function playerHealth(world: World, content: ContentMap): number {
  const v = unitView(world, content, world.slices.world.playerId);
  return v && v.maxHp > 0 ? v.hp / v.maxHp : 1;
}

function auraOf(def: AbilityDef): string | undefined {
  for (const f of def.effects) if (f.type === 'aura') return f.aura;
  return undefined;
}

function hasAura(u: Unit | undefined, aura: string | undefined): boolean {
  return !!u && !!aura && u.auras.some((a) => a.id === aura);
}

const NEVER = new Set(['never', 'cc', 'taunt', 'interrupt', 'summon']);

/**
 * One ability for this moment against the target, or null. Heals when the player is
 * hurt, keeps buffs up, then spends on damage; abilities out of reach are skipped (the
 * caller closes in).
 */
export function chooseAbility(
  world: World,
  content: ContentMap,
  targetId: string | null,
): { abilityId: string; targetId?: string } | null {
  const pid = world.slices.world.playerId;
  const me = unitsOf(world)[pid];
  const pe = playerEntity(world);
  if (!me || !pe || me.cast) return null;
  const hp = playerHealth(world, content);
  const target = targetId ? unitsOf(world)[targetId] : undefined;
  const te = targetId ? getEntity(world, targetId) : undefined;
  const dist = te ? gapBetween(pe, te) : Number.POSITIVE_INFINITY;
  const enemiesClose = attackers(world, 4).length;
  const slots = abilityBar(world, content).filter((s) => s.usable);
  const defs = slots
    .map((s) => content.abilities.find((a) => a.id === s.id))
    .filter((d): d is AbilityDef => !!d && !NEVER.has(d.ai ?? 'filler'))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id));
  const reach = (d: AbilityDef) =>
    (d.range ?? 0) <= 1.5 ? Math.max(d.range ?? 0, 1) : (d.range ?? 0);
  // 1. survival
  for (const d of defs) {
    const use = d.ai ?? 'filler';
    const self = d.target === 'self' || d.target === 'party' || d.target === 'ally';
    if (!self) continue;
    if ((use === 'emergency' || use === 'heal' || use === 'shield') && hp < 0.45) {
      return { abilityId: d.id, targetId: d.target === 'ally' ? pid : undefined };
    }
    if (use === 'hot' && hp < 0.7 && !hasAura(me, auraOf(d))) {
      return { abilityId: d.id, targetId: d.target === 'ally' ? pid : undefined };
    }
    if (use === 'defensive' && hp < 0.5 && enemiesClose > 0) return { abilityId: d.id };
  }
  // 1a. the target's cast bar shows an interruptible cast (a boss healing itself): stop it
  const tCast = targetId ? unitView(world, content, targetId)?.cast : undefined;
  if (tCast?.interruptible && targetId) {
    const kicks = slots
      .map((s) => content.abilities.find((a) => a.id === s.id))
      .filter((d): d is AbilityDef => !!d && (d.ai ?? 'filler') === 'interrupt')
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id));
    for (const d of kicks) {
      if (d.target !== 'enemy' || dist > reach(d)) continue;
      return { abilityId: d.id, targetId };
    }
  }
  // 1b. a companion in trouble: the player's ally heals keep the party standing
  const ward = companionInNeed(world, content);
  if (ward) {
    for (const d of defs) {
      const use = d.ai ?? 'filler';
      if (d.target !== 'ally') continue;
      const te2 = getEntity(world, ward.id);
      if (!te2 || gapBetween(pe, te2) > (d.range ?? 0)) continue;
      // the bar reads usability against the player; the ward may refuse it (a shield's lockout)
      if (!checkAbility(world, content, me, d.id, ward.id).ok) continue;
      if ((use === 'heal' || use === 'emergency' || use === 'shield') && ward.frac < 0.45) {
        if (use === 'shield' && hasAura(unitsOf(world)[ward.id], auraOf(d))) continue;
        return { abilityId: d.id, targetId: ward.id };
      }
      if (use === 'hot' && ward.frac < 0.7 && !hasAura(unitsOf(world)[ward.id], auraOf(d))) {
        return { abilityId: d.id, targetId: ward.id };
      }
    }
  }
  // 2. buffs that are missing
  for (const d of defs) {
    if ((d.ai ?? 'filler') !== 'buff') continue;
    if (d.target !== 'self' && d.target !== 'party') continue;
    const aura = auraOf(d);
    if (aura && !hasAura(me, aura) && (d.castTime ?? 0) === 0) return { abilityId: d.id };
  }
  // 3. damage on the target
  if (!target || !te || !targetId) return null;
  const tView = unitView(world, content, targetId);
  const tFrac = tView && tView.maxHp > 0 ? tView.hp / tView.maxHp : 1;
  for (const d of defs) {
    const use = d.ai ?? 'filler';
    if (d.target !== 'enemy' && d.target !== 'area') continue;
    if (d.target === 'enemy' && dist > reach(d)) continue;
    if (d.target === 'area' && (enemiesClose < 2 || dist > Math.max(2, d.radius ?? 2))) continue;
    if ((use === 'dot' || use === 'debuff') && hasAura(target, auraOf(d))) continue;
    if (use === 'execute' && tFrac > 0.25) continue;
    if (use === 'finisher' && me.combo < 3 && tFrac > 0.2) continue;
    if (use === 'aoe' && enemiesClose < 2) continue;
    return { abilityId: d.id, targetId: d.target === 'enemy' ? targetId : undefined };
  }
  return null;
}

/**
 * The player's own heal for this moment, or null: the highest-priority usable heal, shield
 * or heal-over-time on the ability bar that targets the player (an over-time or a shield
 * only when its aura is not already up). Read off the bar, as the player would.
 */
export function selfHeal(
  world: World,
  content: ContentMap,
  opts: { shield?: boolean; defensive?: boolean } = {},
): { abilityId: string; targetId?: string } | null {
  const pid = world.slices.world.playerId;
  const me = unitsOf(world)[pid];
  if (!me || me.cast) return null;
  const defs = abilityBar(world, content)
    .filter((s) => s.usable)
    .map((s) => content.abilities.find((a) => a.id === s.id))
    .filter((d): d is AbilityDef => !!d)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id));
  for (const d of defs) {
    const use = d.ai ?? 'filler';
    if (d.target !== 'self' && d.target !== 'party' && d.target !== 'ally') continue;
    if (
      use !== 'heal' &&
      use !== 'emergency' &&
      use !== 'hot' &&
      use !== 'shield' &&
      !(opts.defensive && use === 'defensive')
    )
      continue;
    if (use === 'shield' && opts.shield === false) continue;
    if ((use === 'hot' || use === 'shield') && hasAura(me, auraOf(d))) continue;
    return { abilityId: d.id, targetId: d.target === 'ally' ? pid : undefined };
  }
  return null;
}

/** Commands to fight one target this decision: target it, swing, and maybe one ability. */
export function fightCommands(
  world: World,
  content: ContentMap,
  targetId: string,
): CombatCommand[] {
  const me = unitsOf(world)[world.slices.world.playerId];
  if (!me) return [];
  const target = unitsOf(world)[targetId];
  if (!target || !canAttack(world, me, target)) return [];
  const out: CombatCommand[] = [];
  if (me.target !== targetId) out.push({ kind: 'combat.target', data: { targetId } });
  if (!me.autoAttack || me.target !== targetId) {
    out.push({ kind: 'combat.attack', data: { on: true, targetId } });
  }
  const pick = chooseAbility(world, content, targetId);
  if (pick) out.push({ kind: 'combat.cast', data: { ...pick } });
  return out;
}

/** How heavy a fight against this target and its neighbours is (1 = one even foe). */
export function pullCost(world: World, targetId: string): number {
  const me = unitsOf(world)[world.slices.world.playerId];
  const te = getEntity(world, targetId);
  if (!me || !te) return 0;
  let cost = 0;
  for (const u of Object.values(unitsOf(world))) {
    if (u.side !== 'enemy' || !u.attackable || !alive(world, u.id)) continue;
    if (u.ai?.state === 'yielded') continue;
    const e = getEntity(world, u.id);
    if (!e || e.mapId !== te.mapId) continue;
    if (u.id !== targetId && Math.hypot(e.x - te.x, e.y - te.y) > 5) continue;
    cost += 1.3 ** Math.max(-4, Math.min(6, u.level - me.level));
  }
  return cost;
}

/**
 * Whether the companions walking with the player are all back on their feet and fit for a
 * named fight: none down (a downed companion gets back up once the party has been calm a
 * while, party 7.6) and each at least at `minHealth` of its health. Companions away from the
 * player's map (resting, waiting at a gate) do not count. True with no companions.
 */
export function companionsReady(world: World, content: ContentMap, minHealth = 0.8): boolean {
  const p = playerEntity(world);
  if (!p) return true;
  for (const m of Object.values(world.slices.party?.members ?? {})) {
    // only those walking with the party count (a roster may also hold standby or resting ones)
    if (stateOf(m) !== 'party') continue;
    // one in the party with no body in the world is not standing with it
    const u = m.entityId ? unitsOf(world)[m.entityId] : undefined;
    const e = m.entityId ? getEntity(world, m.entityId) : undefined;
    if (!u || !e) return false;
    if (e.mapId !== p.mapId) continue;
    if (u.downed || !e.alive || e.hidden) return false;
    // just back on its feet (party 7.6) or otherwise weakened for a while: not fit yet
    if (weakened(content, u)) return false;
    const v = unitView(world, content, m.entityId);
    if (v && v.maxHp > 0 && v.hp / v.maxHp < minHealth) return false;
  }
  return true;
}

/** A timed state debuff on the unit that lowers what it deals (a getting-up weakness). */
function weakened(content: ContentMap, u: Unit): boolean {
  return u.auras.some((a) => {
    if (a.expires === 0) return false;
    const def = content.auras.find((d) => d.id === a.id);
    return def?.kind === 'debuff' && def.category === 'state' && (def.mods?.damageDealt ?? 0) < 0;
  });
}

/** What the party can take on at once, in pullCost units. */
export function partyStrength(world: World): number {
  let n = 1.7;
  const player = playerEntity(world);
  for (const m of Object.values(world.slices.party?.members ?? {})) {
    if (stateOf(m) !== 'party' || !alive(world, m.entityId)) continue;
    if (getEntity(world, m.entityId)?.mapId === player?.mapId) n += 0.9;
  }
  return n;
}

/** The current fight's weight: every hostile engaged with the party, by health left. */
export function engagedCost(world: World, content: ContentMap): number {
  const me = unitsOf(world)[world.slices.world.playerId];
  if (!me) return 0;
  let cost = 0;
  for (const id of attackers(world)) {
    const u = unitsOf(world)[id];
    const v = unitView(world, content, id);
    if (!u || !v || v.maxHp <= 0) continue;
    cost += (v.hp / v.maxHp) * 1.3 ** Math.max(-4, Math.min(6, u.level - me.level));
  }
  return cost;
}
