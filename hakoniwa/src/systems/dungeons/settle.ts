// The hourly settle of the dungeon runtime (and every hour-coarse skip step): nests wake and
// grow, collapses and rituals that reached their end take hold, overflow clocks that ran out
// overflow, nurtured dungeons grow by the season and stir by the unswept week, left items
// that lay their days are swallowed, the mirrors are brought up to date and the visit is
// checked against where the player stands. Every step compares deadlines with the clock,
// so settling twice in an hour changes nothing and a skip settles what the ticks would have.

import type { SystemContext } from '../../core/system';
import { adoptChoiceFlag, completeChoice, isChoice } from './dispose';
import { dungeonConfig } from './layout';
import { swallowDue } from './left_items';
import { growNest, wakeNest } from './nests';
import { track } from './run';
import {
  growNurtured,
  instanceOf,
  mirrorDungeon,
  mirrorNest,
  nestOf,
  overflow,
  type Target,
} from './state';

/** Nests whose condition came to hold come to life (cheap: run on a flag change). */
export function wakeNests(ctx: SystemContext): void {
  for (const def of ctx.content.nests ?? []) {
    const st = nestOf(ctx, def.id);
    if (st && !st.live) wakeNest(ctx, def, st);
  }
}

/**
 * A choice flag written before the runtime first settled the target (a save from before
 * this system, where a quest already chose): settle that choice instead of overwriting it.
 */
function adoptEarlierChoice(ctx: SystemContext, t: Target): void {
  if (t.state.choiceTick >= 0) return;
  const v = ctx.flag(`dg.${t.id}.choice`);
  if (isChoice(v) && v !== t.state.choice) adoptChoiceFlag(ctx, t, v);
}

/** Settle every nest and dungeon, the left items and the visit. */
export function settle(ctx: SystemContext): void {
  if (!dungeonConfig(ctx.content)) return;
  for (const def of ctx.content.nests ?? []) {
    const st = nestOf(ctx, def.id);
    if (!st) continue;
    wakeNest(ctx, def, st);
    const t: Target = { kind: 'nest', id: def.id, def, state: st };
    if (st.live) adoptEarlierChoice(ctx, t);
    if (st.pending && st.pending.until <= ctx.tick) completeChoice(ctx, t);
    growNest(ctx, def, st);
    mirrorNest(ctx, def.id, st);
  }
  for (const def of ctx.content.dungeons ?? []) {
    const st = instanceOf(ctx, def.id);
    if (!st) continue;
    const t: Target = { kind: 'dungeon', id: def.id, def, state: st };
    adoptEarlierChoice(ctx, t);
    if (st.pending && st.pending.until <= ctx.tick) completeChoice(ctx, t);
    if (st.overflowAt >= 0 && st.overflowAt <= ctx.tick) overflow(ctx, def, st);
    growNurtured(ctx, def, st);
    mirrorDungeon(ctx, def.id, st);
  }
  swallowDue(ctx);
  track(ctx, 'walk');
}

/** Whether a dungeon record has no instance yet (a fresh slice: settle it all once). */
export function unsettled(ctx: SystemContext): boolean {
  const s = ctx.world.slices.dungeons;
  return (ctx.content.dungeons ?? []).some((d) => !s?.instances[d.id]);
}
