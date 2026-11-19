// Primary item effects must have an executor before a use spends a portion or a timer.
// Extra domain owners register their preflight here before subscribing to item.used.

import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import type { ItemDef } from './types';
import type { UseGateResult } from './use_gate';

export interface ItemUseRequest {
  ownerId: string;
  itemId: string;
  targetId?: string;
}

/** Domain-specific eligibility, checked before any inventory or cooldown mutation. */
export type UseEffectGate = (
  ctx: SystemContext,
  request: ItemUseRequest,
  def: ItemDef,
) => UseGateResult;

// The primary effects already executed by combat, ailments, crafting or the inventory.
// Recognising an event alone is insufficient: a new effect needs its own executor.
const IMPLEMENTED = new Set([
  'heal',
  'mana',
  'aura',
  'cleanse',
  'return',
  'taint',
  'sed_cure',
  'sober',
  'repair',
  'coat',
  'drink',
]);

const domainGates = new Map<string, UseEffectGate>();

/** The owner of an additional effect registers its eligibility check (null removes it). */
export function registerUseEffectGate(effect: string, gate: UseEffectGate | null): void {
  if (gate) domainGates.set(effect, gate);
  else domainGates.delete(effect);
}

/** A pure preflight; callers must run it even when their combat gate already passed. */
export function checkUseEffect(
  ctx: SystemContext,
  request: ItemUseRequest,
  def: ItemDef,
): UseGateResult {
  const effect = def.use?.effect;
  if (effect) {
    const gate = domainGates.get(effect);
    if (gate) return gate(ctx, request, def);
    if (IMPLEMENTED.has(effect)) return { ok: true };
  }
  return { ok: false, code: 'not_usable', reason: tr('sys.inventory.reject.not_usable') };
}
