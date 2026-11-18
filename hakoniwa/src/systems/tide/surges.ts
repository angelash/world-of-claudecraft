// Overflows and full nests into monster tides (catalog_bestiary.md 7.1, 7.3;
// catalog_dungeons_bosses.md 1.1 "溢出钟"): when a dungeon overflows toward its settlement
// (`dungeon.overflow` with `toMap`), or a nest grows into a full nest (`dungeon.nest_stage`
// at the dungeons config's full stage), the rule of data/tide/surges.json for that place
// starts its mtide_ waves through the flag channel combat.wave.<id>, once per region per
// cooldown (14 days). The losses of a system tide (production, sediment) are the city and
// economy's to settle; this module only turns the overflow into the tide and says so.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { conditionHolds } from '../quests/effects';
import { tideSlice } from './slice';
import type { SurgeTrigger, TideSurgeDef } from './types';

/** The surge rules of the content. */
export function surgeDefs(content: { tideSurges?: TideSurgeDef[] }): TideSurgeDef[] {
  return content.tideSurges ?? [];
}

/** The rules a trigger at a place fires (pure: the caller checks `when` and the cooldown). */
export function surgeRulesFor(
  defs: readonly TideSurgeDef[],
  on: SurgeTrigger,
  place: { toMap?: string; fromMap?: string },
): TideSurgeDef[] {
  return defs.filter((d) => {
    if (d.on !== on) return false;
    if (on === 'overflow') return !!place.toMap && d.toMap === place.toMap;
    return !!place.fromMap && (d.fromMaps ?? []).includes(place.fromMap);
  });
}

/** Whether a region's surge rule rests at `tick` (pure). */
export function resting(cooldown: Record<string, number>, region: string, tick: number): boolean {
  return tick < (cooldown[region] ?? Number.NEGATIVE_INFINITY);
}

function fire(ctx: SystemContext, rule: TideSurgeDef, source: string): void {
  const s = tideSlice(ctx.world);
  if (rule.when && !conditionHolds(ctx, rule.when)) return;
  if (resting(s.cooldown, rule.region, ctx.tick)) {
    ctx.emit('tide.surge', {
      rule: rule.id,
      source,
      toMap: rule.toMap,
      waves: [],
      blocked: [],
      rested: true,
    });
    return;
  }
  const started: string[] = [];
  const blocked: string[] = [];
  for (const wave of rule.waves) {
    const key = `combat.wave.${wave}`;
    // the signal starts a wave once: combat does not clear it yet (registry 8.9 says it should;
    // a request to combat), so a second tide of the same waves waits on that
    if (ctx.flag(key) === 'go') {
      blocked.push(wave);
      continue;
    }
    ctx.setFlag(key, 'go');
    started.push(wave);
  }
  // the region rests only after a tide that came
  if (started.length > 0)
    s.cooldown[rule.region] = ctx.tick + rule.cooldownDays * TICKS_PER_GAME_DAY;
  ctx.emit('tide.surge', {
    rule: rule.id,
    source,
    toMap: rule.toMap,
    waves: started,
    blocked,
    rested: false,
  });
}

/** A dungeon overflowed toward a settlement. */
export function onOverflow(ctx: SystemContext, dungeonId: string, toMap: string | undefined): void {
  for (const rule of surgeRulesFor(surgeDefs(ctx.content), 'overflow', { toMap }))
    fire(ctx, rule, dungeonId);
}

/** A nest grew a stage: at the full stage it spills over as a tide. */
export function onNestStage(ctx: SystemContext, nestId: string, stage: number): void {
  const full = ctx.content.dungeonConfig?.nest.fullStage;
  if (full === undefined || stage !== full) return;
  const nest = ctx.content.nests?.find((n) => n.id === nestId);
  if (!nest) return;
  for (const rule of surgeRulesFor(surgeDefs(ctx.content), 'nest_full', { fromMap: nest.mapId }))
    fire(ctx, rule, nestId);
}
