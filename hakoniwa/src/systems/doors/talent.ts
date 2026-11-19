// The talent door's gaze (识才之门注视; act1_borderstone.md 5.3; world_state_registry.md
// `npc.<人>.potential_seen`, written by the talent door): the potential line itself is the
// appraisal's (src/systems/cognition/appraise.ts reads `feature.appraise_talent`); when the
// player's appraisal reads a person's potential, doors writes the milestone flag that
// training, appointments and the talent tutorial step read. Once per person.

import type { SystemContext } from '../../core/system';
import { getEntity } from '../world';

export function potentialSeen(
  ctx: SystemContext,
  d: { observerId: string; targetId: string; potential?: string },
): void {
  if (!d.potential || d.observerId !== ctx.world.slices.world.playerId) return;
  const ref = getEntity(ctx.world, d.targetId)?.ref;
  if (!ref) return;
  const key = `npc.${ref}.potential_seen`;
  if (!ctx.flag(key)) ctx.setFlag(key, true);
}
