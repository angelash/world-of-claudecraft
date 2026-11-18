// Companion experience (companions_and_party.md 4.2; progression_and_pacing.md 3.3). Quest,
// first-clear and exploration experience reaches every companion in the party in full and
// in parallel: nothing is taken from the player. Kill experience is combat's (the classic
// group split among the companions, the player keeps the solo value); this module adds the
// catch-up on top of it: a companion three or more levels under the player earns double,
// eight or more triple. The party's own grants never lift a companion above the player's
// level plus two (combat's kill share is not capped yet: a request to combat). Members
// standing by or resting earn half of what the player earns, kept on their record until
// they come back.

import type { SystemContext } from '../../core/system';
import type { TextParam } from '../../core/text';
import type { World } from '../../core/world';
import { gainXp, MAX_LEVEL, unitOf, xpForLevel } from '../combat';
import { partyConfig } from './config';
import { sortedMembers, stateOf } from './roster';
import type { Member, PartyConfig } from './types';

/** Reasons whose experience the companions in the party share in full (4.2). */
export function sharedReason(reason: TextParam): boolean {
  if (typeof reason !== 'string') return false;
  return (
    reason === 'quest' ||
    reason.startsWith('quest:') ||
    reason.startsWith('first:') ||
    reason.startsWith('explore:')
  );
}

/** Kill experience (combat's group split), which catch-up multiplies (4.2). */
export function killReason(reason: TextParam): boolean {
  return typeof reason === 'string' && reason.startsWith('kill:');
}

/** The catch-up factor of a companion at `level` beside a player at `playerLevel` (4.2). */
export function catchUpFactor(cfg: PartyConfig, level: number, playerLevel: number): number {
  const gap = playerLevel - level;
  for (const step of [...cfg.catchUp].sort((a, b) => b.below - a.below))
    if (gap >= step.below) return step.factor;
  return 1;
}

/** The highest level experience can bring a companion to (4.2): player level plus two. */
export function levelCap(cfg: PartyConfig, playerLevel: number): number {
  return Math.min(MAX_LEVEL, playerLevel + cfg.levelCapOverPlayer);
}

function playerLevel(world: World): number {
  return unitOf(world, world.slices.world.playerId)?.level ?? 1;
}

/** Experience a companion may still take before the cap (0 at or above it). */
export function roomBelowCap(level: number, xp: number, cap: number): number {
  let room = 0;
  for (let l = level; l < cap; l++) room += xpForLevel(l);
  return Math.max(0, room - xp);
}

/** Give a member in the world experience, never past the cap. */
function grant(ctx: SystemContext, m: Member, amount: number, reason: TextParam): void {
  const u = unitOf(ctx.world, m.entityId);
  if (!u || amount <= 0) return;
  const cap = levelCap(partyConfig(ctx.content), playerLevel(ctx.world));
  const give = Math.min(Math.round(amount), roomBelowCap(u.level, u.xp, cap));
  if (give > 0) gainXp(ctx, u, give, reason);
}

/** Bank experience on the record of a member out of the world, levelling it there. */
export function bankXp(cfg: PartyConfig, m: Member, amount: number, playerLvl: number): void {
  if (amount <= 0) return;
  const cap = levelCap(cfg, playerLvl);
  let level = m.level ?? 1;
  let xp = (m.xp ?? 0) + Math.round(amount);
  while (level < cap && xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
  }
  if (level >= cap) xp = Math.min(xp, xpForLevel(level) - 1);
  m.level = level;
  m.xp = Math.max(0, xp);
}

/** The player earned experience: the party shares quest experience, the rest earn half. */
export function onPlayerXp(ctx: SystemContext, amount: number, reason: TextParam): void {
  if (amount <= 0 || reason === 'roster') return;
  const cfg = partyConfig(ctx.content);
  const pl = playerLevel(ctx.world);
  for (const m of sortedMembers(ctx.world)) {
    if (m.temp || m.pet) continue;
    const s = stateOf(m);
    if (s === 'party' || s === 'waiting') {
      if (!sharedReason(reason)) continue;
      const u = unitOf(ctx.world, m.entityId);
      if (!u) continue;
      grant(ctx, m, amount * catchUpFactor(cfg, u.level, pl), reason);
    } else if (s === 'standby' || s === 'resting') {
      bankXp(cfg, m, amount * cfg.awayShare, pl);
    }
  }
}

/**
 * A companion took kill experience from combat: the catch-up adds the rest of the factor
 * (combat gives the plain group share; a top-up of (factor - 1) times it follows).
 */
export function onCompanionKillXp(
  ctx: SystemContext,
  m: Member,
  amount: number,
  level: number,
): void {
  if (amount <= 0 || m.temp || m.pet) return;
  const factor = catchUpFactor(partyConfig(ctx.content), level, playerLevel(ctx.world));
  if (factor > 1) grant(ctx, m, amount * (factor - 1), 'catchup');
}
