// A choice pays once, before any effects or progress. Check the entire bundle first:
// insufficient materials cannot consume a partial payment or buy a partial result.

import type { SystemContext } from '../../core/system';
import { countItem, holdingOf, removeItem, spendMoney } from '../inventory';
import type { Objective } from './types';

type ChoiceCost = NonNullable<Extract<Objective, { type: 'choice' }>['options'][number]['cost']>;

export function payChoiceCost(ctx: SystemContext, cost: ChoiceCost | undefined): boolean {
  if (!cost) return true;
  const owner = ctx.world.slices.world.playerId;
  const needed = new Map<string, number>();
  for (const row of cost.items ?? []) needed.set(row.item, (needed.get(row.item) ?? 0) + row.count);
  if (holdingOf(ctx.world, owner).money < (cost.money ?? 0)) return false;
  for (const [id, count] of needed) if (countItem(ctx.world, owner, id) < count) return false;
  if (cost.money) spendMoney(ctx, owner, cost.money, 'quest_choice');
  for (const [id, count] of needed) removeItem(ctx, owner, id, count, 'quest_choice');
  return true;
}
