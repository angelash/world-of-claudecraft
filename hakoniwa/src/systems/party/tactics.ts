// The built-in AI's tactics per fight (builtin_ai.md 11.1; companions_and_party.md 7.2, 7.4).
// When the party enters a fight, every companion the player gave no stance gets one from
// the stance score: the personality affinity (the 7.4 weight / 100: assist reads
// aggression, stay caution, follow protect; passive is never picked) times 3; +2 toward
// assist when the whole party is full of health and mana, +2 toward stay when potions or
// mana run low or after two hard fights in a row; +3 toward follow when the player enters
// under half health; +1 toward assist when every known foe is grey to the player, +1 toward
// stay with a boss or an elite among them; +1 for the stance held. The pick is applied at
// once (a leading decision, builtin_ai.md 1.2) and filed as the companion.tactics request
// whose fallback is the same pick, so a model may replace it for the rest of the fight. The
// stance brings its opening move: assist opens with control or a burst, stay with a buff,
// follow by stepping to the player's side. Draws no random numbers. Also the fight's
// bookkeeping: downs, hard fights in a row, and the player's rescue of a companion near
// death (companions_and_party.md 8.4: +1 bond once a fight).

import { systemSource } from '../../core';
import type { AiContextV1 } from '../../core/ai_port';
import { traceOfPick } from '../../core/brain/trace';
import { pickBest, type ScoredAction, type ScoredTerm } from '../../core/brain/utility';
import type { AnyCommand } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { canAttack, grayLevel, liveUnit, unitOf } from '../combat';
import { monsterDef } from '../combat/defs';
import { deriveStats } from '../combat/stats';
import type { Unit } from '../combat/types';
import { holdingOf, itemDef } from '../inventory';
import { entitiesNear, getEntity, playerEntity } from '../world';
import { addBond } from './bond';
import { companionDef, tacticsConfig } from './config';
import { fieldMembers, stateOf } from './roster';
import type {
  CompanionAi,
  FightState,
  Member,
  OpeningKind,
  PartyOrder,
  TacticsConfig,
} from './types';
import { partyFighting } from './wounds';

/** The decision kind of the traces and the request (builtin_ai.md 1.4, 2.6). */
export const TACTICS_KIND = 'companion.tactics';
/** The stances the built-in AI may pick, with the 7.4 weight each reads (11.1). */
const AFFINITY: readonly [PartyOrder, keyof CompanionAi][] = [
  ['assist', 'aggression'],
  ['stay', 'caution'],
  ['follow', 'protect'],
];
/** A rescue (8.4) heals a companion under this share of its health. */
export const RESCUE_BELOW = 0.2;

/** What the stance score reads of the party and its foes at the start of a fight. */
export interface TacticsInputs {
  /** every member at the full share of health, and of mana where it has mana */
  full: boolean;
  /** potions or mana run low */
  low: boolean;
  /** hard fights in a row up to this one */
  hardStreak: number;
  /** the player's share of health */
  playerHp: number;
  /** the known foes: all grey to the player, a boss or an elite among them, or neither */
  foes: 'weak' | 'strong' | 'even';
}

/** The fight bookkeeping of the slice (created on first use: older saves have none). */
export function fightState(ctx: SystemContext): FightState {
  const slice = ctx.world.slices.party;
  slice.fight ??= { on: false, count: 0, start: 0, downs: 0, hardStreak: 0 };
  return slice.fight;
}

/** The opening move a stance brings (11.1). */
export function openingFor(order: PartyOrder): OpeningKind {
  return order === 'assist' ? 'burst' : order === 'stay' ? 'buff' : 'close';
}

/** The scored stances of one companion (pure; named terms for the trace). */
export function scoreStances(
  cfg: TacticsConfig,
  ai: CompanionAi | undefined,
  current: PartyOrder,
  inputs: TacticsInputs,
): ScoredAction[] {
  const out: ScoredAction[] = [];
  for (const [order, weight] of AFFINITY) {
    const affinity = ((ai?.[weight] as number | undefined) ?? 50) / 100;
    const terms: ScoredTerm[] = [{ name: 'persona', value: round(affinity * cfg.weight) }];
    if (order === 'assist' && inputs.full) terms.push({ name: 'full', value: cfg.state });
    if (order === 'stay' && (inputs.low || inputs.hardStreak >= cfg.hardStreak))
      terms.push({ name: 'low', value: cfg.state });
    if (order === 'follow' && inputs.playerHp < cfg.protectBelow)
      terms.push({ name: 'protect', value: cfg.protect });
    if (order === 'assist' && inputs.foes === 'weak') terms.push({ name: 'foes', value: cfg.foes });
    if (order === 'stay' && inputs.foes === 'strong') terms.push({ name: 'foes', value: cfg.foes });
    if (order === current) terms.push({ name: 'inertia', value: cfg.inertia });
    const score = round(terms.reduce((s, t) => s + t.value, 0));
    out.push({ id: order, score, blocked: false, terms });
  }
  return out;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function hpShare(ctx: SystemContext, u: Unit): number {
  const max = deriveStats(ctx.world, ctx.content, u).maxHp;
  return max > 0 ? u.hp / max : 1;
}

function manaShare(ctx: SystemContext, u: Unit): number | null {
  const max = deriveStats(ctx.world, ctx.content, u).maxRes.mana ?? 0;
  return max > 0 ? (u.res.mana ?? 0) / max : null;
}

/** The player's healing items (a use whose effect is `heal`: potions and bandages). */
function healingItems(ctx: SystemContext, ownerId: string): number {
  let n = 0;
  for (const [id, count] of Object.entries(holdingOf(ctx.world, ownerId).items)) {
    if (count > 0 && itemDef(ctx.content, id)?.use?.effect === 'heal') n += count;
  }
  return n;
}

/** The party's units standing with the player (the player first). */
function partyUnits(ctx: SystemContext): Unit[] {
  const out: Unit[] = [];
  const pid = ctx.world.slices.world.playerId;
  const p = liveUnit(ctx.world, pid);
  if (p) out.push(p[0]);
  for (const m of fieldMembers(ctx.world)) {
    if (m.pet) continue;
    const pair = liveUnit(ctx.world, m.entityId);
    if (pair && pair[1].mapId === p?.[1].mapId) out.push(pair[0]);
  }
  return out;
}

/** The known foes: hostile units within sight of the player (11.1). */
function readFoes(ctx: SystemContext, cfg: TacticsConfig, me: Unit): TacticsInputs['foes'] {
  const pe = playerEntity(ctx.world);
  if (!pe) return 'even';
  const grey = grayLevel(me.level);
  let any = false;
  let allGrey = true;
  for (const e of entitiesNear(ctx.world, pe.mapId, pe.x, pe.y, cfg.sight)) {
    const u = unitOf(ctx.world, e.id);
    if (u?.side !== 'enemy' || !liveUnit(ctx.world, u.id) || !canAttack(ctx.world, me, u)) continue;
    const rank = monsterDef(ctx.content, u.monsterId)?.rank;
    if (u.boss || (rank && rank !== 'normal')) return 'strong';
    any = true;
    if (u.level > grey) allGrey = false;
  }
  return any && allGrey ? 'weak' : 'even';
}

/** What the stance score reads now (pure over the world; no draws). */
export function tacticsInputs(ctx: SystemContext): TacticsInputs {
  const cfg = tacticsConfig(ctx.content);
  const units = partyUnits(ctx);
  const me = units[0];
  let full = units.length > 0;
  const mana: number[] = [];
  for (const u of units) {
    if (hpShare(ctx, u) < cfg.fullHp) full = false;
    const m = manaShare(ctx, u);
    if (m === null) continue;
    mana.push(m);
    if (m < cfg.fullMana) full = false;
  }
  const meanMana = mana.length > 0 ? mana.reduce((a, b) => a + b, 0) / mana.length : 1;
  const pid = ctx.world.slices.world.playerId;
  const low = healingItems(ctx, pid) < cfg.lowPotions || meanMana < cfg.lowMana;
  return {
    full,
    low,
    hardStreak: fightState(ctx).hardStreak,
    playerHp: me && me.id === pid ? hpShare(ctx, me) : 1,
    foes: me ? readFoes(ctx, cfg, me) : 'even',
  };
}

/**
 * Set a member's stance (the player's party.order and the AI's stance share it). `party.order`
 * is the player's order going through; the AI's picks are told by `party.tactics` instead.
 */
export function applyStance(ctx: SystemContext, m: Member, order: PartyOrder, quiet = false): void {
  const changed = m.order !== order;
  m.order = order;
  const e = getEntity(ctx.world, m.entityId);
  if (order === 'stay' && e) m.stayAt = { mapId: e.mapId, x: e.x, y: e.y };
  else delete m.stayAt;
  if (changed && !quiet) ctx.emit('party.order', { companionId: m.id, order });
}

/** Members whose stance the built-in AI picks: with the party, carded, no player stance. */
function autoMembers(ctx: SystemContext): Member[] {
  return fieldMembers(ctx.world).filter(
    (m) =>
      !m.temp &&
      !m.pet &&
      stateOf(m) === 'party' &&
      m.stanceBy !== 'player' &&
      !!companionDef(ctx.content, m.id),
  );
}

/** The built-in pick for one member: the stance and its opening, with the trace. */
export function builtinStance(ctx: SystemContext, m: Member, inputs: TacticsInputs): PartyOrder {
  const cfg = tacticsConfig(ctx.content);
  const def = companionDef(ctx.content, m.id);
  // the inertia term reads the stance of the last fight (the member is back on its own since)
  const pick = pickBest(scoreStances(cfg, def?.ai, m.stanceLast ?? m.order, inputs));
  ctx.brainTrace(traceOfPick(m.id, TACTICS_KIND, ctx.tick, pick));
  return (pick.chosen?.id as PartyOrder | undefined) ?? m.order;
}

/** Give a member a stance for the fight and its opening move. */
function takeStance(
  ctx: SystemContext,
  m: Member,
  order: PartyOrder,
  fight: number,
  by: 'builtin' | 'ai',
): void {
  // the stance holds for this fight; the member goes back to its own after it
  if (m.stanceBase === undefined) m.stanceBase = m.order;
  m.stanceLast = order;
  applyStance(ctx, m, order, true);
  const opening = openingFor(order);
  m.opening = { kind: opening, until: ctx.tick + tacticsConfig(ctx.content).openingSec * 20 };
  ctx.emit('party.tactics', { companionId: m.id, order, opening, fight, by });
}

/** The fight begins: the built-in AI picks, and the model may answer (11.1). */
function fightBegins(ctx: SystemContext, st: FightState): void {
  const cfg = tacticsConfig(ctx.content);
  if (!cfg.auto) return;
  const members = autoMembers(ctx);
  if (members.length === 0) return;
  const inputs = tacticsInputs(ctx);
  for (const m of members) {
    const order = builtinStance(ctx, m, inputs);
    takeStance(ctx, m, order, st.count, 'builtin');
    const data = { companionId: m.id, order, revision: st.count };
    const fallback: AnyCommand[] = [{ kind: 'party.stance', data, source: systemSource('party') }];
    const context: AiContextV1 = {
      v: 1,
      persona: companionDef(ctx.content, m.id)?.name ?? m.id,
      situation: tr('sys.party.prompt.tactics_situation', {
        hp: Math.round(inputs.playerHp * 100),
        hard: inputs.hardStreak,
      }),
      commands: {
        'party.stance': tr('sys.party.prompt.tactics_command', {
          companion: m.id,
          revision: st.count,
        }),
      },
      extra: { stances: ['assist', 'stay', 'follow'], suggested: order, inputs },
    };
    ctx.ai.request({
      agentId: m.id,
      role: TACTICS_KIND,
      purpose: 'fight_stance',
      revision: st.count,
      context,
      allowed: ['party.stance'],
      fallback,
      deadlineTicks: 20,
      priority: 2,
    });
  }
}

/** The fight ended: was it hard (someone went down, or the party ended under half)? */
function fightEnds(ctx: SystemContext, st: FightState): void {
  const cfg = tacticsConfig(ctx.content);
  const units = partyUnits(ctx);
  const mean = units.length > 0 ? units.reduce((s, u) => s + hpShare(ctx, u), 0) / units.length : 1;
  const hard = st.downs > 0 || mean < cfg.hardHp;
  st.hardStreak = hard ? st.hardStreak + 1 : 0;
  delete st.rescued;
  for (const m of fieldMembers(ctx.world)) {
    delete m.opening;
    const base = m.stanceBase;
    delete m.stanceBase;
    // the AI's stance was for the fight: back to the member's own (a player's order stands)
    if (base !== undefined && m.stanceBy !== 'player' && m.order !== base)
      applyStance(ctx, m, base, true);
  }
}

/** Once a party tick: notice the party entering and leaving a fight. */
export function tickFight(ctx: SystemContext): void {
  const st = fightState(ctx);
  const fighting = partyFighting(ctx);
  if (fighting === st.on) return;
  st.on = fighting;
  if (fighting) {
    st.count += 1;
    st.start = ctx.tick;
    st.downs = 0;
    fightBegins(ctx, st);
  } else {
    fightEnds(ctx, st);
  }
}

/** A party member went down in the fight (a hard fight). */
export function noteDown(ctx: SystemContext): void {
  const st = fightState(ctx);
  if (st.on) st.downs += 1;
}

/**
 * The player healed a companion near death (8.4 危急解围: +1 bond, daily, once a fight).
 * `before` is the companion's health share before the heal (the party's last snapshot).
 */
export function noteRescue(ctx: SystemContext, m: Member, before: number): void {
  const st = fightState(ctx);
  if (!st.on || before >= RESCUE_BELOW || m.temp || m.pet) return;
  if (st.rescued?.includes(m.id)) return;
  st.rescued = [...(st.rescued ?? []), m.id];
  addBond(ctx, m, 1, 'rescue');
}

/**
 * The stance a model or the built-in fallback names for fight `revision`: taken while the
 * fight is the current one and the player has not chosen a stance. Returns a refusal code.
 */
export function stanceCommand(
  ctx: SystemContext,
  m: Member,
  order: PartyOrder,
  revision: number,
  by: 'builtin' | 'ai',
): string | null {
  if (m.stanceBy === 'player') return 'player_stance';
  // passive is the player's alone: never a fight's pick, in any fight
  if (order === 'passive') return 'bad_order';
  const st = fightState(ctx);
  // a pick for a fight that is over (or not this one) is stale (builtin_ai.md 1.2)
  if (!st.on || revision !== st.count) return 'stale';
  if (m.order === order) return null;
  takeStance(ctx, m, order, st.count, by);
  return null;
}

/** The opening move in force for a member (and drop a lapsed one). */
export function openingOf(ctx: SystemContext, m: Member): OpeningKind | null {
  const o = m.opening;
  if (!o) return null;
  if (ctx.tick >= o.until) {
    delete m.opening;
    return null;
  }
  return o.kind;
}

/** The healing items the stance score counts (exported for the tests and the view). */
export function healingItemCount(ctx: SystemContext): number {
  return healingItems(ctx, ctx.world.slices.world.playerId);
}

/**
 * Whether a heal event's target is a member, and its share of health before the heal: the
 * health now less the healing that landed (events reach the party after its own tick has
 * already snapped the healed health).
 */
export function rescueTarget(
  ctx: SystemContext,
  targetId: string,
  amount: number,
): { m: Member; before: number } | null {
  for (const m of fieldMembers(ctx.world)) {
    if (m.entityId !== targetId) continue;
    const u = unitOf(ctx.world, m.entityId);
    if (!u) return null;
    const max = deriveStats(ctx.world, ctx.content, u).maxHp;
    return { m, before: max > 0 ? Math.max(0, u.hp - amount) / max : 1 };
  }
  return null;
}
