// Bonds (羁绊), 0 to 100 per companion. Shared kills, gifts and story flags deepen them;
// crossing a threshold sets flag bond.<id>.<threshold> = true (door keys read these),
// and the integer bond is mirrored in flag bond.<id>.

import type { SystemContext } from '../../core/system';
import type { ItemDef } from '../inventory';
import type { CompanionDef, Member } from './types';

export const BOND_THRESHOLDS = [20, 40, 60, 80, 100];

export function addBond(ctx: SystemContext, m: Member, delta: number, reason: string): void {
  if (delta === 0) return;
  const before = m.bond;
  m.bond = Math.max(0, Math.min(100, m.bond + delta));
  if (m.bond === before) return;
  const whole = Math.floor(m.bond);
  if (whole !== Math.floor(before)) ctx.setFlag(`bond.${m.id}`, whole);
  for (const t of BOND_THRESHOLDS) {
    if (m.bond >= t && !m.reached.includes(t)) {
      m.reached.push(t);
      ctx.setFlag(`bond.${m.id}.${t}`, true);
    }
  }
  ctx.emit('party.bond', { companionId: m.id, bond: Math.floor(m.bond), delta, reason });
}

/** Bond from a gift: 2 plus twice the quality, doubled for liked kinds or items. */
export function giftValue(def: CompanionDef, item: ItemDef): number {
  const base = 2 + 2 * item.quality;
  const liked = !!def.likes?.items?.includes(item.id) || !!def.likes?.kinds?.includes(item.kind);
  return liked ? base * 2 : base;
}

/** Bond from a shared kill by rank. */
export function killValue(rank: string): number {
  if (rank === 'boss') return 5;
  if (rank === 'elite' || rank === 'rare') return 2;
  return 0.25;
}

/** Apply story flags that deepen a companion's bond (each once). */
export function applyBondFlags(ctx: SystemContext, def: CompanionDef, m: Member): void {
  for (const b of def.bondFlags ?? []) {
    if (m.told.includes(b.flag)) continue;
    const v = ctx.flag(b.flag);
    if (b.equals !== undefined ? v !== b.equals : !v) continue;
    m.told.push(b.flag);
    addBond(ctx, m, b.amount, `flag:${b.flag}`);
  }
}
