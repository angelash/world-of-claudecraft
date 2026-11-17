// Livelihood skills (catalog_gathering_crafting.md 1.2, 2.8; progression_and_pacing.md 6.3):
// every entity's skill per livelihood, 0 to 150 in six layers of 25. The layer an entity
// works under comes from the data: a base layer and conditions over the world (the act now;
// the livelihood doors of the thousand doors later), the highest that holds. Gains are held
// to the layer's cap; a skill already above a lower cap is kept, never cut. The skill rises
// in fractions (the main project's four-state curve); `crafting.skill` tells the client when
// the whole number moves.

import type { SystemContext } from '../../core/system';
import type { World } from '../../core/world';
import { calendarTerms } from '../quests/calendar_terms';
import { evaluate, flagResolver } from '../quests/conditions';
import { capOfLayer, gainedSkill } from './rules';
import { craftingSlice, readCrafting } from './slice';
import type { CraftingConfig, Profession } from './types';

export function craftingConfig(content: { craftingConfig?: CraftingConfig }) {
  return content.craftingConfig;
}

type WorldLike = Pick<World, 'meta' | 'slices'>;

/** Whether a condition holds over the world's flags and calendar (absent: always). */
export function holdsIn(world: WorldLike, expr: string | undefined): boolean {
  if (!expr) return true;
  return evaluate(expr, flagResolver(world.meta.flags, calendarTerms(world.meta.tick)));
}

/** An entity's skill in a livelihood (0 when it never practised). */
export function skillOf(world: WorldLike, entityId: string, p: Profession): number {
  return readCrafting(world)?.skills[entityId]?.[p] ?? 0;
}

/** The layer a livelihood works under now: the base layer, or the highest rule that holds. */
export function layerOf(world: WorldLike, cfg: CraftingConfig, p: Profession): number {
  let layer = cfg.baseLayer;
  for (const r of cfg.layers) {
    if (r.layer <= layer) continue;
    if (r.professions && !r.professions.includes(p)) continue;
    if (holdsIn(world, r.when)) layer = r.layer;
  }
  return layer;
}

/** The cap a livelihood's skill grows to now. */
export function skillCap(world: WorldLike, cfg: CraftingConfig, p: Profession): number {
  return capOfLayer(layerOf(world, cfg, p));
}

/**
 * Add one action's gain to an entity's skill, held to the cap; emits `crafting.skill` when
 * the whole number moves. Returns the gain applied.
 */
export function addSkill(
  ctx: SystemContext,
  cfg: CraftingConfig,
  entityId: string,
  p: Profession,
  gain: number,
): number {
  const before = skillOf(ctx.world, entityId, p);
  const after = gainedSkill(before, gain, skillCap(ctx.world, cfg, p));
  if (after === before) return 0;
  setSkill(ctx, entityId, p, after);
  return after - before;
}

/** Set an entity's skill (a master's teaching, a story grant, a test); emits on a move. */
export function setSkill(ctx: SystemContext, entityId: string, p: Profession, value: number): void {
  const slice = craftingSlice(ctx.world);
  const before = slice.skills[entityId]?.[p] ?? 0;
  const v = Math.max(0, Math.min(150, value));
  slice.skills[entityId] ??= {};
  (slice.skills[entityId] as Partial<Record<Profession, number>>)[p] = v;
  if (Math.floor(v) !== Math.floor(before)) {
    ctx.emit('crafting.skill', { entityId, profession: p, skill: Math.floor(v) });
  }
}
