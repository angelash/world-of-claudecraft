// Story acts (quests_and_events.md 7): the `act` flag (a string: prologue, act1..act6,
// epilogue) with its numeric mirror `act_index`, the act.changed event, and the act
// entry (teleport, intro scene, entry effects). Quests own the act.

import type { SystemContext } from '../../core/system';
import { actIndex } from './conditions';
import { applyEffects, teleportPlayer } from './effects';
import type { ActDef } from './types';

export function actDef(content: { acts: ActDef[] }, id: string): ActDef | undefined {
  return content.acts.find((a) => a.id === id);
}

export function currentActId(ctx: { flag(key: string): unknown }): string {
  return String(ctx.flag('act') ?? 'prologue');
}

/** Change the act. Re-entering the current act is a no-op. */
export function setAct(ctx: SystemContext, to: string): void {
  const from = currentActId(ctx);
  if (from === to && ctx.flag('act') !== undefined) return;
  const def = actDef(ctx.content, to);
  ctx.setFlag('act', to);
  const idx = def?.index ?? actIndex(to);
  if (!Number.isNaN(idx)) ctx.setFlag('act_index', idx);
  ctx.world.slices.quests.lastBeatTick = ctx.tick;
  ctx.world.slices.quests.dirty = true;
  ctx.emit('act.changed', { from, to });
  if (!def) return;
  if (def.entry) teleportPlayer(ctx, def.entry.mapId, def.entry.location);
  applyEffects(ctx, def.onEnter);
  if (def.introScene) ctx.setFlag('scene.pending', def.introScene);
}
