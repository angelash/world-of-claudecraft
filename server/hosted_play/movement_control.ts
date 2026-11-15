import { parseMoveInputFrame } from '../../src/sim/move_input';
import type { PlayerMeta } from '../../src/sim/sim';
import type { SimContext } from '../../src/sim/sim_context';
import { type Entity, emptyMoveInput } from '../../src/sim/types';
import {
  applyMovementInputFrame,
  type MovementInputSessionState,
  MovementInputTimeline,
} from '../movement_input_timeline_v2';

interface HostedMovementSession extends MovementInputSessionState {
  hostedPlayObserved: boolean;
}

/** Discard the previous owner's pending controls at either ownership boundary.
 * A null v2 timeline also keeps the tick consumer from clearing server input. */
export function resetHostedMovementControl(
  session: HostedMovementSession,
  meta: PlayerMeta | null | undefined,
): void {
  if (session.movementWireVersion === 2) session.movementTimeline = null;
  if (meta) Object.assign(meta.moveInput, emptyMoveInput());
}

export function applyMovementWithHostedControl(
  session: HostedMovementSession,
  meta: PlayerMeta,
  entity: Entity,
  raw: unknown,
  simTime: number,
  ctx: SimContext,
  source: 'client' | 'hosted',
) {
  if (source === 'client' && session.hostedPlayObserved) return parseMoveInputFrame(raw);
  if (source === 'client' && session.movementWireVersion === 2 && !session.movementTimeline) {
    const frame = parseMoveInputFrame(raw);
    // The client's tick clock continues during hosted play. Anchor once at the
    // first valid returned frame; subsequent packets retain all normal bounds.
    if (frame.ct !== null) session.movementTimeline = new MovementInputTimeline(frame.ct);
  }
  return applyMovementInputFrame(session, meta, entity, raw, simTime, ctx, source === 'hosted');
}
