import type { MoveInputFrame } from '../../src/sim/move_input';
/** Only deliberate movement/turning is activity; steering scalars on an idle
 * heartbeat must not keep a session alive or pause hosted automation. */
export function moveFrameHasActivity(frame: MoveInputFrame, previousFacing: number): boolean {
  const m = frame.moveInput;
  return (
    m.forward ||
    m.back ||
    m.turnLeft ||
    m.turnRight ||
    m.strafeLeft ||
    m.strafeRight ||
    m.jump ||
    m.dive ||
    m.surface ||
    (frame.facing !== null && Math.abs(frame.facing - previousFacing) > 0.001)
  );
}
