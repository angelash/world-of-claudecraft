// Drunkenness (catalog_consumables_magitools.md 2.1 `cd_drink`, 3.10; combat_and_classes.md
// 9.4): every drink with `use.drunk` adds that many layers to whoever drinks it, up to the
// data's maximum; each game hour takes `decayPerHour` off (the world sends every hour of a
// time skip too, so a skip sobers as the hours would); a sober pill (`use.effect: sober`)
// clears every layer and keeps new ones off for `soberMinutes` game minutes. The layers
// show in combat as the stacks of the state aura the data names (spirit down, presence
// resistance up, staggering from five layers: combat's aura data reads them); without an
// aura the layers are kept and nothing more.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_MINUTE } from '../../core/time';
import type { World } from '../../core/world';
import { addPassive, removePassives, unitOf } from '../combat';
import { craftingConfig } from './skills';
import { craftingSlice, readCrafting } from './slice';
import type { CraftingConfig } from './types';

/** The effect id of a sober pill (the crafting system's own `use.effect`). */
export const SOBER_EFFECT = 'sober';
/** The aura origin of the drunk stacks on a combat unit. */
export const DRUNK_ORIGIN = 'crafting.drunk';

/** An entity's drunk layers now. */
export function drunkLayers(world: Pick<World, 'slices'>, entityId: string): number {
  return readCrafting(world)?.drunk[entityId]?.layers ?? 0;
}

/** Put the combat aura's stacks in line with the layers (none: the aura comes off). */
function mirror(ctx: SystemContext, cfg: CraftingConfig, entityId: string, layers: number): void {
  const aura = cfg.drunk.aura;
  if (!aura || !ctx.world.slices.combat || !unitOf(ctx.world, entityId)) return;
  removePassives(ctx, entityId, DRUNK_ORIGIN);
  for (let i = 0; i < layers; i++) addPassive(ctx, entityId, aura, DRUNK_ORIGIN);
}

function setLayers(ctx: SystemContext, cfg: CraftingConfig, entityId: string, layers: number) {
  const slice = craftingSlice(ctx.world);
  const cur = slice.drunk[entityId] ?? { layers: 0, soberUntil: 0 };
  const next = Math.max(0, Math.min(cfg.drunk.max, layers));
  if (next === cur.layers) return;
  cur.layers = next;
  if (next === 0 && cur.soberUntil <= ctx.tick) delete slice.drunk[entityId];
  else slice.drunk[entityId] = cur;
  mirror(ctx, cfg, entityId, next);
  ctx.emit('crafting.drunk', { entityId, layers: next });
}

/** `item.used`: a drink adds its layers, a sober pill clears them and keeps them off. */
export function drinkUsed(
  ctx: SystemContext,
  d: { ownerId: string; targetId?: string; itemId: string; effect: string; early?: boolean },
): void {
  const cfg = craftingConfig(ctx.content);
  if (!cfg || d.early) return;
  const who = d.targetId ?? d.ownerId;
  if (d.effect === SOBER_EFFECT) {
    const slice = craftingSlice(ctx.world);
    const until = ctx.tick + Math.round(cfg.drunk.soberMinutes * TICKS_PER_GAME_MINUTE);
    slice.drunk[who] = { layers: slice.drunk[who]?.layers ?? 0, soberUntil: until };
    setLayers(ctx, cfg, who, 0);
    return;
  }
  const n = ctx.content.items.find((i) => i.id === d.itemId)?.use?.drunk ?? 0;
  if (n <= 0) return;
  const cur = readCrafting(ctx.world)?.drunk[who];
  if (cur && cur.soberUntil > ctx.tick) return;
  setLayers(ctx, cfg, who, (cur?.layers ?? 0) + n);
}

/** `world.hour`: every drunk entity sobers by a step; spent sober timers go. */
export function soberHour(ctx: SystemContext): void {
  const cfg = craftingConfig(ctx.content);
  const slice = readCrafting(ctx.world);
  if (!cfg || !slice) return;
  for (const id of Object.keys(slice.drunk).sort()) {
    const d = slice.drunk[id];
    if (!d) continue;
    if (d.layers > 0) setLayers(ctx, cfg, id, d.layers - cfg.drunk.decayPerHour);
    const left = slice.drunk[id];
    if (left && left.layers === 0 && left.soberUntil <= ctx.tick) delete slice.drunk[id];
  }
}
