// The roster (companions_and_party.md 2.5, 3.1, 3.2): who is in the party, standing by,
// waiting at a dungeon gate, resting, away on a story departure, cold after three red
// lines, at the spring or gone. Only members in the party (and those waiting) stand in the
// world; the others are kept as records with their level, experience and ailments body (taken
// out of the ailments slice through its takeBody port and put back with putBody), so the
// combat and ailments slices never hold a body that is somewhere else. Places: three in act
// 1, four from act 2; a beast companion and a temporary companion take none (2.3).

import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import type { World } from '../../core/world';
import { putBody, takeBody } from '../ailments';
import { addUnit, gainXp, grantAbility, unitOf } from '../combat';
import { monsterDef } from '../combat/defs';
import { playerEntity, removeEntity, spawnEntity } from '../world';
import { companionDef, holds, partyConfig, slotsFor } from './config';
import type { CompanionDef, Member, MemberState } from './types';

/** The state of a member (a save from before the roster has none: in the party). */
export function stateOf(m: Member): MemberState {
  return m.state ?? 'party';
}

/** Every roster member, by id. */
export function sortedMembers(world: World): Member[] {
  const slice = world.slices.party;
  if (!slice) return [];
  return Object.keys(slice.members)
    .sort()
    .map((k) => slice.members[k] as Member);
}

/** Members standing in the world with the party (in it or waiting at a gate). */
export function fieldMembers(world: World): Member[] {
  return sortedMembers(world).filter((m) => {
    const s = stateOf(m);
    return (s === 'party' || s === 'waiting') && m.entityId !== '';
  });
}

/** Whether a member takes one of the companion places (3.1, 2.3). */
export function takesSlot(m: Member): boolean {
  const s = stateOf(m);
  if (s !== 'party' && s !== 'waiting') return false;
  if (m.temp) return false;
  return m.pet?.kind !== 'half';
}

export function slotsUsed(world: World): number {
  return sortedMembers(world).filter(takesSlot).length;
}

export function slotsNow(ctx: Pick<SystemContext, 'world' | 'content' | 'flag'>): number {
  return slotsFor(partyConfig(ctx.content), ctx.flag('act'));
}

export function hasFreeSlot(ctx: SystemContext): boolean {
  return slotsUsed(ctx.world) < slotsNow(ctx);
}

/** Whether the companion would come now (2.5): story recruits always; invites by condition. */
export function recruitable(ctx: SystemContext, id: string): boolean {
  const def = companionDef(ctx.content, id);
  if (!def) return false;
  const when = def.recruit?.when;
  return !when || holds(ctx, when);
}

/** Move a member to another roster state, with the state mirror (registry 8.6). */
export function setState(ctx: SystemContext, m: Member, to: MemberState): void {
  const from = stateOf(m);
  if (from === to) return;
  m.state = to;
  ctx.emit('party.state', { companionId: m.id, from, to });
  if (m.temp || m.pet) return;
  const mirror =
    to === 'resting'
      ? 'resting'
      : to === 'away'
        ? 'left'
        : to === 'spring' || to === 'dead'
          ? 'dead'
          : 'active';
  if (ctx.flag(`companion.${m.id}.state`) !== mirror)
    ctx.setFlag(`companion.${m.id}.state`, mirror);
}

export interface Body {
  name: string;
  appearance: CompanionDef['appearance'];
  classId?: string;
  monsterId?: string;
  tags: string[];
  signature?: string;
}

export function bodyOfDef(def: CompanionDef): Body {
  return {
    name: def.name,
    appearance: def.appearance,
    classId: def.classId,
    tags: ['companion', 'friendly', `class:${def.classId}`, 'faction:player'],
    signature: def.signature,
  };
}

/**
 * Put a member into the world beside the player, at its kept level, experience and body.
 * When it left the world earlier in this same tick, combat still holds its old unit until
 * the tick's events are out: it comes back on the next tick instead (pendingIn).
 */
export function bringIn(ctx: SystemContext, m: Member, body: Body, n = 1): boolean {
  const p = playerEntity(ctx.world);
  if (!p) return false;
  const id = m.temp ? m.entityId : `companion_${m.id}`;
  if (ctx.world.slices.world.entities[id]) {
    m.entityId = id;
    delete m.pendingIn;
    return true;
  }
  // out earlier this tick: combat drops that body's unit at the tick's end, so wait a tick
  if (m.outTick === ctx.tick) {
    m.entityId = '';
    m.pendingIn = true;
    return true;
  }
  const e = spawnEntity(ctx, {
    id,
    kind: 'companion',
    name: body.name,
    mapId: p.mapId,
    x: p.x - 1 - (n % 2),
    y: p.y + 1 + Math.floor(n / 2),
    faction: 'player',
    appearance: body.appearance,
    speed: p.speed,
    tags: [...body.tags],
    ref: m.id,
  });
  m.entityId = e.id;
  delete m.pendingIn;
  delete m.outTick;
  const u = addUnit(ctx, e.id, {
    classId: body.classId ?? null,
    monsterId: body.monsterId ?? null,
    level: m.level ?? 1,
    side: 'ally',
  });
  if (!u) return true;
  if (m.xp && m.xp > 0) gainXp(ctx, u, m.xp, 'roster');
  if (body.signature) grantAbility(ctx, e.id, body.signature);
  if (m.body) putBody(ctx.world, e.id, m.body);
  delete m.level;
  delete m.xp;
  delete m.body;
  return true;
}

/** Take a member out of the world, keeping its level, experience and body on the record. */
export function sendOut(ctx: SystemContext, m: Member): void {
  delete m.pendingIn;
  if (!m.entityId) return;
  const u = unitOf(ctx.world, m.entityId);
  if (u) {
    m.level = u.level;
    m.xp = u.xp;
  }
  if (!m.temp) {
    const body = takeBody(ctx.world, m.entityId);
    if (body) m.body = body;
    removeEntity(ctx, m.entityId);
    m.outTick = ctx.tick;
  }
  m.entityId = '';
}

export function rejectText(code: string) {
  return tr(`sys.party.reject.${code}` as 'sys.party.reject.no_companion');
}

/**
 * A recruited companion enters the roster (2.5): into the party while a place is free,
 * else standing by. An invite-mode companion whose conditions do not hold refuses: the
 * flag is put back and nothing joins.
 */
export function join(ctx: SystemContext, id: string): Member | undefined {
  const slice = ctx.world.slices.party;
  const have = slice.members[id];
  if (have) return have;
  const def = companionDef(ctx.content, id);
  if (!def) return undefined;
  if (def.recruit?.mode !== 'story' && !recruitable(ctx, id)) {
    ctx.emit('party.refused', { companionId: id, reason: rejectText('unwilling') });
    if (ctx.flag(`companion.${id}.recruited`)) ctx.setFlag(`companion.${id}.recruited`, false);
    return undefined;
  }
  const m: Member = {
    id,
    entityId: '',
    order: 'assist',
    state: 'standby',
    bond: 0,
    reached: [],
    told: [],
    joinedTick: ctx.tick,
    downedTick: 0,
    pathAt: 0,
    level: def.level,
  };
  slice.members[id] = m;
  // into the party while a place is free, else standing by (3.2); either way on the roster
  if (hasFreeSlot(ctx) && bringIn(ctx, m, bodyOfDef(def), slotsUsed(ctx.world) + 1))
    m.state = 'party';
  if (ctx.flag(`companion.${id}.state`) !== 'active')
    ctx.setFlag(`companion.${id}.state`, 'active');
  ctx.emit('party.joined', { companionId: id, entityId: m.entityId });
  return m;
}

export function leave(ctx: SystemContext, id: string): void {
  const slice = ctx.world.slices.party;
  const m = slice.members[id];
  if (!m) return;
  sendOut(ctx, m);
  delete slice.members[id];
  ctx.emit('party.left', { companionId: id });
}

/** The body a member stands in: its companion card, or the beast it was tamed or bound from. */
export function bodyFor(ctx: SystemContext, m: Member): Body | undefined {
  if (m.pet) {
    const mon = monsterDef(ctx.content, m.pet.monsterId);
    if (!mon) return undefined;
    const pet = (ctx.content.pets ?? []).find((p) => p.id === m.pet?.species);
    return {
      name: pet?.name ?? mon.name,
      appearance: mon.appearance,
      monsterId: mon.id,
      tags: ['companion', 'friendly', 'pet', 'faction:player'],
    };
  }
  const def = companionDef(ctx.content, m.id);
  return def ? bodyOfDef(def) : undefined;
}

/**
 * Into the party from standing by (a place must be free unless it takes none). A companion
 * gone cold after three red lines stays cold until the reconciliation (8.5).
 */
export function enterParty(ctx: SystemContext, m: Member): boolean {
  if (m.cold) {
    setState(ctx, m, 'cold');
    return false;
  }
  const body = bodyFor(ctx, m);
  if (!body) return false;
  if (m.pet?.kind !== 'half' && !hasFreeSlot(ctx)) return false;
  if (!bringIn(ctx, m, body, slotsUsed(ctx.world) + 1)) return false;
  setState(ctx, m, 'party');
  return true;
}

/** Out of the party to stand by (the inn, or the inner court once it is open). */
export function standBy(ctx: SystemContext, m: Member, to: MemberState = 'standby'): void {
  sendOut(ctx, m);
  delete m.tactic;
  delete m.waitAt;
  delete m.stayAt;
  delete m.hpSeen;
  delete m.hitTick;
  delete m.danger;
  if (m.pet?.guarding) delete m.pet.guarding;
  setState(ctx, m, to);
}
