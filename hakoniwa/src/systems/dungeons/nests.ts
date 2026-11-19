// Nest growth (catalog_bestiary.md 2.8): a nest lives once its record's condition holds and
// grows a stage every season it goes uncleared, where the sediment is at least level two:
// stage 2 the lord shows, stage 3 (a full nest, level three and up) starts to crystallize
// and raises its map a level, stage 4 is a shallow dungeon (the record's `becomes` opens).
// Killing the lord (from stage 2), or the head of a stage 1 nest, at the nest starts the
// season over. The window advances by whole seasons from where it started, so an
// hour-coarse skip grows a nest exactly as the ticks would have.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { conditionHolds } from '../quests/effects';
import { mapById } from '../world';
import { dungeonConfig, inRect, locationOf } from './layout';
import { localSediment } from './sediment';
import { clearNest, mirrorNest, nestOf } from './state';
import type { NestDef, NestState } from './types';

/** The sediment level at a nest's centre now, nests counted (0 when its place is unknown). */
export function nestSediment(ctx: SystemContext, def: NestDef): number {
  const map = mapById(ctx.content, def.mapId);
  const l = locationOf(map, def.location);
  if (!map || !l) return 0;
  return localSediment(ctx.world, ctx.content, map, l.x + l.w / 2, l.y + l.h / 2);
}

/** Bring a nest to life when its condition first holds. */
export function wakeNest(ctx: SystemContext, def: NestDef, st: NestState): void {
  if (st.live || (def.when && !conditionHolds(ctx, def.when))) return;
  st.live = true;
  st.since = ctx.tick;
  ctx.emit('dungeon.nest_stage', { nestId: def.id, stage: st.stage, from: 0 });
  mirrorNest(ctx, def.id, st);
}

/** Whether the nest may grow from its stage now (too thin a sediment holds it back). */
function mayGrow(ctx: SystemContext, def: NestDef, st: NestState): boolean {
  const cfg = dungeonConfig(ctx.content);
  if (!cfg) return false;
  const level = nestSediment(ctx, def);
  if (level < cfg.nest.minSediment) return false;
  if (st.stage + 1 === cfg.nest.fullStage && level < cfg.nest.fullSediment) return false;
  return true;
}

/** Grow the nest by every whole season it went uncleared. */
export function growNest(ctx: SystemContext, def: NestDef, st: NestState): void {
  const cfg = dungeonConfig(ctx.content);
  if (!cfg || !st.live || st.collapsed || st.purified || st.matured || st.pending) return;
  const season = cfg.nest.stageDays * TICKS_PER_GAME_DAY;
  while (!st.matured && ctx.tick - st.since >= season) {
    if (!mayGrow(ctx, def, st)) {
      // held back: the season is spent, the next one is counted from here
      st.since += season;
      continue;
    }
    const from = st.stage;
    st.stage++;
    st.since += season;
    st.cleared = false;
    ctx.emit('dungeon.nest_stage', { nestId: def.id, stage: st.stage, from });
    if (st.stage >= cfg.nest.maxStage) {
      st.matured = true;
      if (def.becomes) ctx.emit('dungeon.formed', { dungeonId: def.becomes, nestId: def.id });
    }
  }
  mirrorNest(ctx, def.id, st);
}

/**
 * A monster died: the nests it cleared. The head counts before the lord shows (stage 1),
 * the lord from then on; either only dying at the nest (its rectangle, a few tiles around),
 * so a common creature killed elsewhere on the map clears nothing.
 */
export function nestDeath(
  ctx: SystemContext,
  d: { id?: string; killerId?: string; ref?: string; mapId: string; x: number; y: number },
): void {
  const cfg = dungeonConfig(ctx.content);
  if (!cfg || !d.ref) return;
  for (const def of ctx.content.nests ?? []) {
    if (def.mapId !== d.mapId) continue;
    const st = nestOf(ctx, def.id);
    if (!st) continue;
    const byHead = d.ref === def.head && st.stage < cfg.nest.lordStage;
    const byLord = d.ref === def.lord && st.stage >= cfg.nest.lordStage;
    if (!byHead && !byLord) continue;
    const l = locationOf(mapById(ctx.content, def.mapId), def.location);
    if (l && inRect(l, d.x, d.y, cfg.nest.clearMargin))
      clearNest(ctx, def, st, { victimId: d.id, killerId: d.killerId });
  }
}
