// Dispute chains and nodes in the quest model (PK-M1-58; act1_borderstone.md 4;
// quests_and_events.md 3.6): a chain is a quest of kind `dispute` whose `defaults` list the
// default development week by week, and a node is a quest of kind `node` naming its chain
// (`chain`, `node`). At every act-week start the act clock calls runDefaults: each step
// whose week has come applies its effects unless the player has stepped in (`unless`), once,
// whether or not the player ever took the chain up, and never after the chain is settled
// (the player finished it, or it closed). A node's own default settlement is its `expiry`
// (outcomes.ts). Decision points, the NPCs' choices and the settlement of outcomes are the
// dispute runner's (PK-M1-46).

import type { SystemContext } from '../../core/system';
import { currentActId } from './act_order';
import { applyEffects, conditionHolds } from './effects';

declare module '../../core/contracts' {
  interface EventMap {
    /** a dispute chain's default development stepped (applied: false when the player stepped in) */
    'quest.default': { questId: string; step: string; week: number; applied: boolean };
  }
}

/** Apply the default steps due by the current act week (idempotent; the act clock calls it). */
export function runDefaults(ctx: SystemContext): void {
  const act = currentActId(ctx);
  const week = Number(ctx.flag('act_week') ?? 0);
  const slice = ctx.world.slices.quests;
  for (const def of ctx.content.quests) {
    if (!def.defaults?.length || def.act !== act) continue;
    const q = slice.quests[def.id];
    if (q && q.status !== 'active') continue;
    const done = slice.defaultsDone?.[def.id] ?? [];
    let moved = false;
    for (const step of def.defaults) {
      if (step.week > week || done.includes(step.id)) continue;
      done.push(step.id);
      moved = true;
      const applied = !(step.unless && conditionHolds(ctx, step.unless));
      if (applied) applyEffects(ctx, step.effects);
      ctx.emit('quest.default', { questId: def.id, step: step.id, week, applied });
    }
    if (moved) {
      slice.defaultsDone ??= {};
      slice.defaultsDone[def.id] = done;
      slice.dirty = true;
    }
  }
}
