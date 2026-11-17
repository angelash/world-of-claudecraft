// The NPC brain (builtin_ai.md 3 to 5; PK-M1-18): nine needs and the mood, the five-layer
// state machine with its root (./root.ts), the generic and functional-role action
// libraries (./library.ts, ./roles.ts, data/npc/brain/), goals and initiative, social
// interactions, memory templates, reactions and the cognition-driven lines, dispute
// decision points, and the quest-facing orders (follow, watch). The NPC system
// (../index.ts) drives it: hourly turns, staggered L1 and L2 beats, event hooks.

import type { SystemContext } from '../../../core/system';
import { entitiesNear } from '../../world';
import { BARK_CHANCE } from '../constants';
import { bumpNeed } from '../needs';
import { cardOf } from '../personas';
import { bark } from './barks';
import { chooseApproach, stepApproaches } from './initiative';
import { remember } from './memory_rules';
import { setLayerHooks } from './root';
import { entityOf } from './sense';
import { chooseVisit } from './social';
import { ensureBrain, noteRecent } from './state';
import { stepNpc } from './step';

export * from './absence';
export * from './barks';
export * from './disputes';
export * from './initiative';
export * from './inputs';
export * from './library';
export * from './memory_rules';
export * from './mood';
export * from './predicates';
export * from './quest_orders';
export * from './reactions';
export * from './roles';
export * from './root';
export { senseThreat, THREAT_RADIUS } from './sense';
export * from './social';
export * from './state';
export * from './step';

setLayerHooks({
  initiative: chooseApproach,
  social: chooseVisit,
  scheduleBark: (v) => {
    if (v.ctx.rng(`npc.brain.${v.st.id}`).chance(BARK_CHANCE)) bark(v.ctx, v.st);
  },
});

/** Approaches that ended give the person back to the schedule. */
export function upkeepApproaches(ctx: SystemContext): void {
  for (const id of stepApproaches(ctx)) {
    const st = ctx.world.slices.npc.npcs[id];
    const card = st ? cardOf(ctx.world.slices.npc, ctx.content, id) : undefined;
    if (st && card) stepNpc(ctx, st, card);
  }
}

/**
 * The player offended a person in a conversation (an insult or a threat, builtin_ai.md 3.3
 * face and 5.3 memory): the anger is aimed at the player, face falls (more before others).
 */
export function noteOffense(ctx: SystemContext, npcId: string, threat: boolean): void {
  const st = ctx.world.slices.npc.npcs[npcId];
  if (!st || st.resident) return;
  const b = ensureBrain(st);
  b.offender = 'player';
  noteRecent(st, 'insulted', ctx.tick);
  if (threat) {
    noteRecent(st, 'threat', ctx.tick);
    bumpNeed(st.needs, 'safety', -15);
  }
  const e = entityOf(ctx, st);
  const audience = e
    ? entitiesNear(ctx.world, e.mapId, e.x, e.y, 6, (x) => x.kind === 'npc' && x.id !== e.id).length
    : 0;
  bumpNeed(st.needs, 'face', audience > 0 ? -30 : -15);
  remember(ctx, npcId, threat ? 'harmed' : 'insulted', {}, { about: 'player' });
}
