// Non-combat resolutions (combat_and_classes.md 10.7). A boss's `resolve` entries are checked
// once a second while it fights: a health line (`yield`), seconds survived (`survive`), arena
// objects used (`interact`), or a world-state expression in the registry's syntax (talk,
// item, escape, pacify, flag; the same evaluator the doors and quests use). The first that
// holds ends the fight the way yielding does (turns neutral, clears threat and timed auras,
// stops), writes `boss.<id>.resolved = <way>` (and `boss.<id>.yielded` for a yield), emits
// `combat.boss_resolved`, settles the outcome (`full` rewards as a kill, the default; `none`
// gives nothing; `table:` rewards as a kill until loot tables exist) and writes its flags.
// Purification resolves through the purify effect (affixes/purify.ts).

import type { SystemContext } from '../../../core/system';
import { evaluate, flagResolver } from '../../quests/conditions';
import type { ResolveDef, ResolveWay } from '../mech_types';
import { award } from '../rewards';
import { standDown } from '../stand_down';
import type { Unit } from '../types';
import { addsOf } from './adds';
import { openArena } from './arena';
import { fightOf, healthFrac, mechOf, pastSec } from './fight';

/** The flag a resolution writes (world_state_registry.md 8.6). */
export function resolvedFlag(bossId: string): string {
  return `boss.${bossId}.resolved`;
}

/** Mark a fight resolved: the flags, the event and the arena (the yield path calls this too). */
export function markResolved(ctx: SystemContext, u: Unit, way: ResolveWay): void {
  const mm = mechOf(ctx, u);
  if (!mm) return;
  if (u.boss) u.boss.resolved = way;
  ctx.setFlag(resolvedFlag(mm.mon.id), way);
  if (way === 'yield') ctx.setFlag(`boss.${mm.mon.id}.yielded`, true);
  ctx.emit('combat.boss_resolved', { entityId: u.id, bossId: mm.mon.id, way });
  openArena(ctx, u);
}

/** End a boss fight by a resolution. */
export function resolveBoss(
  ctx: SystemContext,
  u: Unit,
  def: Pick<ResolveDef, 'way' | 'outcome'>,
  source: Unit | null,
): void {
  if (u.ai?.state === 'yielded') return;
  const adds = addsOf(ctx, u);
  standDown(ctx, u);
  // the adds lay down with their master
  for (const add of adds) standDown(ctx, add);
  markResolved(ctx, u, def.way);
  if ((def.outcome?.reward ?? 'full') !== 'none') award(ctx, u, source, true);
  for (const [k, v] of Object.entries(def.outcome?.flags ?? {}).sort()) ctx.setFlag(k, v);
}

/** Whether a resolution's condition holds now. */
export function resolutionHolds(
  ctx: SystemContext,
  u: Unit,
  def: ResolveDef,
  maxHp: number,
): boolean {
  const w = def.when;
  if (typeof w === 'string') return evaluate(w, flagResolver(ctx.world.meta.flags));
  if ('belowPct' in w) return healthFrac(u, maxHp) <= w.belowPct;
  if ('atSec' in w) return pastSec(ctx, u, w.atSec);
  return (fightOf(ctx, u).used?.length ?? 0) >= w.interacted;
}

/** Once a second in a fight: the first resolution that holds ends it. */
export function tickResolve(ctx: SystemContext, u: Unit, maxHp: number): boolean {
  const defs = mechOf(ctx, u)?.m.resolve;
  if (!defs || defs.length === 0 || u.ai?.state !== 'chase') return false;
  for (const def of defs) {
    if (def.way === 'purify') continue;
    if (!resolutionHolds(ctx, u, def, maxHp)) continue;
    resolveBoss(ctx, u, def, null);
    return true;
  }
  return false;
}
