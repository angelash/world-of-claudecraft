// The use gate of `inventory.use` (combat_and_classes.md 14.1; catalog_consumables_magitools.md
// 2.1): a use in play goes through the combat side's item gate (a cooldown group not allowed
// while fighting is refused, a group that is an action waits for the global cooldown, a dead
// or disabled user acts not at all). The inventory never reads the combat slice, so the gate
// is a narrow port: the system that owns it registers one check, and `inventory.use` asks it
// for every use except the ones that already passed it (combat's own `combat.use_item`,
// which runs the gate itself and then dispatches the use from the combat system). Without a
// registered gate every use passes, as before.

import type { CommandSource } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import type { TextRef } from '../../core/text';

export type UseGateResult = { ok: true } | { ok: false; code: string; reason: TextRef };

/** Whether `ownerId` may use `itemId` now as the gate's owner sees it. */
export type UseGate = (
  ctx: SystemContext,
  ownerId: string,
  itemId: string,
  targetId?: string,
) => UseGateResult;

/** The system whose own use command already ran the gate before dispatching the use. */
export const GATED_SYSTEM = 'combat';

let gate: UseGate | null = null;

/** Register (or clear, with null) the use gate. One gate; the last wins. */
export function registerUseGate(g: UseGate | null): void {
  gate = g;
}

/** The registered gate, if any. */
export function useGate(): UseGate | null {
  return gate;
}

/** The gate's verdict on one use: a pass for a use that already went through it. */
export function checkUseGate(
  ctx: SystemContext,
  ownerId: string,
  itemId: string,
  source: CommandSource,
  targetId?: string,
): UseGateResult {
  if (!gate || (source.type === 'system' && source.system === GATED_SYSTEM)) return { ok: true };
  return gate(ctx, ownerId, itemId, targetId);
}
