// Feeding is a real inventory effect: eligibility precedes the spent portion, and only
// the party owner changes satiety. Species food data is from catalog_creatures_mounts 9.2.

import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { unitOf } from '../combat';
import type { ItemDef } from '../inventory/types';
import type { ItemUseRequest } from '../inventory/use_effects';
import { registerUseEffectGate } from '../inventory/use_effects';
import type { UseGateResult } from '../inventory/use_gate';
import { getEntity, playerEntity } from '../world';
import { REACH } from './pets';
import { stateOf } from './roster';
import type { Member } from './types';

function target(ctx: SystemContext, request: ItemUseRequest): Member | undefined {
  if (request.ownerId !== ctx.world.slices.world.playerId || !request.targetId) return;
  const m = Object.values(ctx.world.slices.party?.members ?? {}).find(
    (member) => member.entityId === request.targetId && member.pet?.kind === 'half',
  );
  if (!m || !['party', 'waiting'].includes(stateOf(m))) return;
  const e = getEntity(ctx.world, m.entityId);
  const player = playerEntity(ctx.world);
  const unit = unitOf(ctx.world, m.entityId);
  if (!e?.alive || !player?.alive || !unit || unit.hp <= 0 || unit.downed || e.hidden) return;
  if (e.mapId !== player.mapId || Math.hypot(e.x - player.x, e.y - player.y) > REACH) return;
  return m;
}

function preference(ctx: SystemContext, m: Member, itemId: string): number {
  const food = ctx.content.pets?.find((p) => p.id === m.pet?.species)?.food;
  return food?.liked.includes(itemId) ? 1.5 : food?.accepted.includes(itemId) ? 1 : 0;
}

function canFeed(ctx: SystemContext, request: ItemUseRequest, def: ItemDef): UseGateResult {
  const m = target(ctx, request);
  if (!m?.pet || !preference(ctx, m, def.id) || !(def.use?.amount && def.use.amount > 0)) {
    return { ok: false, code: 'not_usable', reason: tr('sys.inventory.reject.not_usable') };
  }
  // Feeding early cannot bank an unbounded supply of days or complete repeated feed goals.
  if ((m.pet.fedUntil ?? 0) > ctx.tick) {
    return { ok: false, code: 'not_usable', reason: tr('sys.inventory.reject.not_usable') };
  }
  return { ok: true };
}

export function installFeedingGate(): void {
  registerUseEffectGate('feed', canFeed);
}

export function onFedItem(
  ctx: SystemContext,
  event: {
    ownerId: string;
    itemId: string;
    targetId?: string;
    effect: string;
    amount?: number;
    early?: boolean;
  },
): void {
  if (event.effect !== 'feed' || event.early) return;
  const m = target(ctx, event);
  if (!m?.pet) return;
  const days = preference(ctx, m, event.itemId);
  if (!days) return;
  const until = ctx.tick + Math.floor(days * TICKS_PER_GAME_DAY);
  m.pet.fedUntil = until;
  ctx.emit('party.fed', { companionId: m.id, entityId: m.entityId, itemId: event.itemId, until });
}
