// Story acts (quests_and_events.md 7): the `act` flag (a string: prologue, act1..act6,
// epilogue; conditions compare it with numbers by index, world_state_registry.md 3), the
// act.changed event, and the act entry (teleport, intro scene, entry effects). Quests own
// the act.

import type { SystemContext } from '../../core/system';
import { currentActId } from './act_order';
import { applyEffects, teleportPlayer } from './effects';
import type { ActDef } from './types';

export function actDef(content: { acts: ActDef[] }, id: string): ActDef | undefined {
  return content.acts.find((a) => a.id === id);
}

export { currentActId, openingAct, openingActId } from './act_order';

/** Change the act. Re-entering the current act is a no-op. */
export function setAct(ctx: SystemContext, to: string): void {
  const from = currentActId(ctx);
  if (from === to && ctx.flag('act') !== undefined) return;
  const def = actDef(ctx.content, to);
  ctx.setFlag('act', to);
  ctx.world.slices.quests.lastBeatTick = ctx.tick;
  ctx.world.slices.quests.dirty = true;
  ctx.emit('act.changed', { from, to });
  if (!def) return;
  if (def.entry) teleportPlayer(ctx, def.entry.mapId, def.entry.location);
  applyEffects(ctx, def.onEnter);
  if (def.introScene) ctx.setFlag('scene.pending', def.introScene);
}
