// Whether a cast can be interrupted right now (combat_and_classes.md 10.4, 18): never an
// `uninterruptible` one, never one of a boss behind a shield; a cast its boss's data gives an
// interrupt window to only inside the window (`from` and `to` as shares of the cast, and
// while its `whileFlag` holds). Outside the window the cast bar shows the shield border.
// Pure over the world (the views read it too).

import type { ContentMap } from '../../../core/contracts';
import type { World } from '../../../core/world';
import { abilityDef, monsterDef } from '../defs';
import type { Unit } from '../types';

/** The share of a cast that has run (0 to 1). */
export function castProgress(world: World, u: Unit): number {
  const c = u.cast;
  if (!c) return 0;
  return Math.max(0, Math.min(1, (world.meta.tick - c.start) / Math.max(1, c.end - c.start)));
}

/** Whether the unit's cast in progress can be interrupted now. */
export function interruptibleNow(world: World, content: ContentMap, u: Unit): boolean {
  const c = u.cast;
  if (!c) return false;
  if (abilityDef(content, c.abilityId)?.uninterruptible) return false;
  if (Object.values(u.boss?.shields ?? {}).some((s) => s.up)) return false;
  const win = monsterDef(content, u.monsterId)?.mechanics?.interruptWindows?.find(
    (w) => w.ability === c.abilityId,
  );
  if (!win) return true;
  const p = castProgress(world, u);
  if (p < (win.from ?? 0) || p > (win.to ?? 1)) return false;
  return !win.whileFlag || !!world.meta.flags[win.whileFlag];
}
