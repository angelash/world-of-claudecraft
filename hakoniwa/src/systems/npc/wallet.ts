// A person's purse and devotion as the NPC system reads them: spendable money (inventory
// balance plus today's unsettled wages and costs) and devotion. Kept apart from the
// actions module so the brain can read them without an import cycle.

import type { SystemContext } from '../../core/system';
import { holdingOf } from '../inventory';
import type { CardView } from './personas';
import type { NpcState } from './types';

/** Spendable money: inventory balance plus today's unsettled wages and costs. */
export function spendable(ctx: SystemContext, st: NpcState): number {
  let spent = 0;
  for (const v of Object.values(st.spent)) spent += v;
  return holdingOf(ctx.world, st.entityId).money + st.earned - spent;
}

export function devotionOf(card: CardView): number {
  return card.persona?.devotion ?? 0.3;
}
