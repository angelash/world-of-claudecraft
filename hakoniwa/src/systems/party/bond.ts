// Bonds (羁绊), 0 to 100 per companion (companions_and_party.md 8). Shared kills, gifts,
// camp talks and the like are daily sources: they stop at the next bond gate (8.3) until
// the personal line passes it (59 before segment 2, 79 before 3, 89 before 4), kills add
// at most a few points a game day and gifts count three a week (8.4). Story flags, red
// lines and personal-line segments are not gated. Crossing a threshold is recorded on the
// member (door keys of type bond read the record through bondReached); the bond is party
// state, never a world-state variable (registry 1.2), and stays apart from `trust.<id>`.

import type { SystemContext } from '../../core/system';
import { calendarAt } from '../../core/time';
import type { World } from '../../core/world';
import type { ItemDef } from '../inventory';
import { lineStage, partyConfig } from './config';
import type { CompanionDef, Member, PartyConfig } from './types';

export const BOND_THRESHOLDS = [20, 40, 60, 80, 100];

export type BondSource = 'daily' | 'story';

/** The ceiling of daily bond for a companion whose personal line stands at `stage` (8.3). */
export function bondCeiling(cfg: PartyConfig, stage: number): number {
  let max = 100;
  for (const g of cfg.bondGates) if (stage < g.stage) max = Math.min(max, g.max);
  return max;
}

/**
 * Change a bond. A daily gain stops at the gate (and never lowers a bond the story lifted
 * past it); a story change is not gated. Returns the change applied.
 */
export function addBond(
  ctx: SystemContext,
  m: Member,
  delta: number,
  reason: string,
  source: BondSource = 'daily',
): number {
  if (delta === 0) return 0;
  const before = m.bond;
  let next = Math.max(0, Math.min(100, m.bond + delta));
  if (source === 'daily' && delta > 0) {
    const ceiling = bondCeiling(partyConfig(ctx.content), lineStage(ctx.world, m.id));
    next = Math.max(before, Math.min(next, ceiling));
  }
  // kept in hundredths: shared kills add 0.05 at a time
  m.bond = Math.round(next * 100) / 100;
  if (m.bond === before) return 0;
  for (const t of BOND_THRESHOLDS) {
    if (m.bond >= t && !m.reached.includes(t)) m.reached.push(t);
  }
  const applied = Math.round((m.bond - before) * 100) / 100;
  ctx.emit('party.bond', { companionId: m.id, bond: Math.floor(m.bond), delta: applied, reason });
  return applied;
}

/** Has the companion's bond ever reached `min` (a door key of type bond)? */
export function bondReached(world: World, companionId: string, min: number): boolean {
  const m = world.slices.party?.members[companionId];
  return !!m && (m.bond >= min || m.reached.some((t) => t >= min));
}

/** Bond from a gift (8.4): base plus quality, doubled for liked kinds or items. */
export function giftValue(cfg: PartyConfig, def: CompanionDef, item: ItemDef): number {
  const base = cfg.gift.base + cfg.gift.perQuality * item.quality;
  const liked = !!def.likes?.items?.includes(item.id) || !!def.likes?.kinds?.includes(item.kind);
  return liked ? base * cfg.gift.liked : base;
}

/** Whether another gift counts this game week (8.4: three a week per companion). */
export function giftCounts(ctx: SystemContext, m: Member): boolean {
  const week = Math.floor(calendarAt(ctx.tick).dayIndex / 7);
  if (!m.gifts || m.gifts.week !== week) m.gifts = { week, count: 0 };
  if (m.gifts.count >= partyConfig(ctx.content).gift.perWeek) return false;
  m.gifts.count++;
  return true;
}

/** Bond from a shared kill by rank (8.4). */
export function killValue(cfg: PartyConfig, rank: string): number {
  if (rank === 'boss') return cfg.bondKill.boss;
  if (rank === 'elite' || rank === 'rare') return cfg.bondKill.elite;
  return cfg.bondKill.normal;
}

/** Shared-kill bond within today's allowance (8.4: all kills together, a few points a day). */
export function addKillBond(ctx: SystemContext, m: Member, rank: string): void {
  const cfg = partyConfig(ctx.content);
  const day = calendarAt(ctx.tick).dayIndex;
  if (!m.killBond || m.killBond.day !== day) m.killBond = { day, amount: 0 };
  const left = cfg.bondKill.perDay - m.killBond.amount;
  const want = Math.min(killValue(cfg, rank), left);
  if (want <= 0) return;
  m.killBond.amount += addBond(ctx, m, want, 'shared_kill');
}

/** Apply story flags that deepen a companion's bond (each once; story source). */
export function applyBondFlags(ctx: SystemContext, def: CompanionDef, m: Member): void {
  for (const b of def.bondFlags ?? []) {
    if (m.told.includes(b.flag)) continue;
    const v = ctx.flag(b.flag);
    if (b.equals !== undefined ? v !== b.equals : !v) continue;
    m.told.push(b.flag);
    addBond(ctx, m, b.amount, `flag:${b.flag}`, 'story');
  }
}
