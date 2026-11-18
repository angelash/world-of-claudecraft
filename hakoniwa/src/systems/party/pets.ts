// Beasts at the player's side (thousand_doors.md 3.7, 15.1, 15.2; catalog_creatures_mounts
// .md 3): the hunting door's half-pact tames a wild beast of a tameable species no stronger
// than the door rank; one is out at a time and it takes no companion place; its level is
// min(door rank, species cap, player level + 2). The pact door (feature `servant`) binds a
// yielded eroded being or aberration as a retainer: a servant place each (Yeyu holds one),
// door fatigue +20, and a party place when it walks with the party. When the player goes
// through the door on death, a beast that keeps bags stays by what was left behind until it
// is taken back or crumbles away (catalog 3.6 item 7).

import type { SystemContext } from '../../core/system';
import type { World } from '../../core/world';
import { dropBags, setLevel, unitOf } from '../combat';
import { monsterDef } from '../combat/defs';
import { setFatigue, settleFatigue } from '../doors/costs';
import { getEntity, playerEntity, removeEntity } from '../world';
import { companionDef, holds, partyConfig } from './config';
import { enterParty, fieldMembers, sendOut, sortedMembers, stateOf } from './roster';
import type { Member, PetDef } from './types';

/** How near (tiles) the player must stand to tame or bind. */
export const REACH = 5;

export type PetResult = { ok: true; id: string } | { ok: false; code: string };

const gone = (m: Member) => {
  const s = stateOf(m);
  return s === 'spring' || s === 'dead';
};

function doorRank(ctx: SystemContext): number {
  const v = ctx.flag('door_rank');
  return typeof v === 'number' && v > 0 ? v : 1;
}

function playerLevel(world: World): number {
  return unitOf(world, world.slices.world.playerId)?.level ?? 1;
}

/** The level of a half-pact beast (15.2). */
export function petLevel(ctx: SystemContext, def: PetDef): number {
  const cfg = partyConfig(ctx.content);
  return Math.max(
    1,
    Math.min(doorRank(ctx), def.cap, playerLevel(ctx.world) + cfg.pets.overPlayer),
  );
}

function within(ctx: SystemContext, id: string): boolean {
  const e = getEntity(ctx.world, id);
  const p = playerEntity(ctx.world);
  return !!e && !!p && e.mapId === p.mapId && Math.hypot(e.x - p.x, e.y - p.y) <= REACH;
}

function newMember(ctx: SystemContext, id: string, pet: NonNullable<Member['pet']>, level: number) {
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
    pet,
    level,
  };
  ctx.world.slices.party.members[id] = m;
  return m;
}

/** Tame the wild beast `targetId` through the hunting door's half-pact. */
export function tame(ctx: SystemContext, targetId: string): PetResult {
  const cfg = partyConfig(ctx.content);
  if (cfg.pets.requires && !holds(ctx, cfg.pets.requires)) return { ok: false, code: 'locked' };
  const slice = ctx.world.slices.party;
  if (sortedMembers(ctx.world).some((m) => m.pet?.kind === 'half' && !gone(m)))
    return { ok: false, code: 'one_pet' };
  const u = unitOf(ctx.world, targetId);
  const mon = monsterDef(ctx.content, u?.monsterId ?? null);
  if (!u || !mon || !u.ai || u.hp <= 0) return { ok: false, code: 'untamable' };
  const def = (ctx.content.pets ?? []).find((p) => p.monsterId === mon.id);
  if (!def || (mon.rank && mon.rank !== 'normal')) return { ok: false, code: 'untamable' };
  if (u.level > doorRank(ctx)) return { ok: false, code: 'too_strong' };
  if (!within(ctx, targetId)) return { ok: false, code: 'far' };
  if (slice.members[def.id]) return { ok: false, code: 'one_pet' };
  removeEntity(ctx, targetId);
  const m = newMember(
    ctx,
    def.id,
    { species: def.id, kind: 'half', monsterId: mon.id },
    petLevel(ctx, def),
  );
  enterParty(ctx, m);
  ctx.emit('party.joined', { companionId: m.id, entityId: m.entityId });
  return { ok: true, id: m.id };
}

/** Yielded beings near the player the pact door could bind now (the "reach out" prompt). */
export function pactCandidates(ctx: SystemContext): string[] {
  const p = playerEntity(ctx.world);
  if (!p) return [];
  const out: string[] = [];
  for (const id of Object.keys(ctx.world.slices.combat.units).sort()) {
    const u = ctx.world.slices.combat.units[id];
    if (u?.ai?.state !== 'yielded' || !bindable(ctx, u.monsterId)) continue;
    if (within(ctx, id)) out.push(id);
  }
  return out;
}

/** An eroded being, or an aberration that can be purified back (3.7). */
function bindable(ctx: SystemContext, monsterId: string | null): boolean {
  const mon = monsterDef(ctx.content, monsterId);
  return !!mon && (!!mon.tags?.includes('eroded') || !!mon.mechanics?.purifyTo);
}

/** Servant places in use: servant companions and retainers not lost (3.7). */
export function servantPlacesUsed(ctx: SystemContext): number {
  return sortedMembers(ctx.world).filter(
    (m) =>
      !gone(m) &&
      (m.pet?.kind === 'retainer' || (!m.pet && !!companionDef(ctx.content, m.id)?.servant)),
  ).length;
}

/** Reach out to a yielded being and bind it as a retainer (the pact door, feature servant). */
export function pact(ctx: SystemContext, targetId: string): PetResult {
  const cfg = partyConfig(ctx.content);
  if (cfg.retainers.requires && !holds(ctx, cfg.retainers.requires))
    return { ok: false, code: 'locked' };
  const u = unitOf(ctx.world, targetId);
  if (u?.ai?.state !== 'yielded' || !bindable(ctx, u.monsterId))
    return { ok: false, code: 'not_bindable' };
  if (!within(ctx, targetId)) return { ok: false, code: 'far' };
  if (servantPlacesUsed(ctx) >= cfg.retainers.slots) return { ok: false, code: 'no_place' };
  const monsterId = u.monsterId as string;
  const base = `pet_retainer_${monsterId}`;
  let id = base;
  for (let i = 2; ctx.world.slices.party.members[id]; i++) id = `${base}_${i}`;
  const level = u.level;
  removeEntity(ctx, targetId);
  // a door skill: each pact costs door fatigue (through the doors system's ports)
  settleFatigue(ctx);
  const fatigue = Number(ctx.flag('door_fatigue') ?? 0) || 0;
  setFatigue(ctx, fatigue + cfg.retainers.fatigue);
  const m = newMember(ctx, id, { species: base, kind: 'retainer', monsterId }, level);
  enterParty(ctx, m);
  ctx.emit('party.joined', { companionId: id, entityId: m.entityId });
  return { ok: true, id };
}

/** Let a beast companion or a retainer go (the half-pact or the pact ends). */
export function release(ctx: SystemContext, id: string): boolean {
  const m = ctx.world.slices.party.members[id];
  if (!m?.pet) return false;
  sendOut(ctx, m);
  delete ctx.world.slices.party.members[id];
  ctx.emit('party.left', { companionId: id });
  return true;
}

/** Keep each half-pact beast at its level (the player levelled, the door rank moved). */
export function syncPets(ctx: SystemContext): void {
  for (const m of fieldMembers(ctx.world)) {
    if (m.pet?.kind !== 'half') continue;
    const def = (ctx.content.pets ?? []).find((p) => p.id === m.pet?.species);
    const u = unitOf(ctx.world, m.entityId);
    if (!def || !u) continue;
    const want = petLevel(ctx, def);
    if (u.level !== want) setLevel(ctx, u, want);
  }
}

/** A drop bag appeared or went: a bag-keeping beast stays with it (catalog 3.6 item 7). */
export function onBag(ctx: SystemContext, bagId: string, op: string): void {
  if (op === 'dropped') {
    const bag = dropBags(ctx.world).find((b) => b.id === bagId);
    if (!bag) return;
    for (const m of fieldMembers(ctx.world)) {
      if (m.pet?.kind !== 'half' || m.pet.guarding) continue;
      const def = (ctx.content.pets ?? []).find((p) => p.id === m.pet?.species);
      const e = getEntity(ctx.world, m.entityId);
      if (!def?.guardsBag || !e?.alive || e.mapId !== bag.mapId) continue;
      m.pet.guarding = bagId;
      m.waitAt = { mapId: bag.mapId, x: bag.x, y: bag.y };
    }
    return;
  }
  for (const m of sortedMembers(ctx.world)) {
    if (m.pet?.guarding !== bagId) continue;
    delete m.pet.guarding;
    delete m.waitAt;
  }
}

/** The entity keeping a drop bag, if any (a bag kept this way is not picked up). */
export function bagKeeper(world: World, bagId: string): string | null {
  for (const m of Object.values(world.slices.party?.members ?? {})) {
    if (m.pet?.guarding === bagId && m.entityId) return m.entityId;
  }
  return null;
}
