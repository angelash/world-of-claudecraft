import { describe, expect, it } from 'vitest';
import { moveFrameHasActivity } from '../server/hosted_play/input_activity';
import { parseMoveInputFrame } from '../src/sim/move_input';

describe('hosted input activity', () => {
  it('ignores idle heartbeat steering values and unchanged facing', () => {
    expect(
      moveFrameHasActivity(parseMoveInputFrame({ mi: { ss: 1, gp: 0.5 }, facing: 0 }), 0),
    ).toBe(false);
  });
  it('recognizes deliberate movement and changed facing', () => {
    expect(moveFrameHasActivity(parseMoveInputFrame({ mi: { f: 1 } }), 0)).toBe(true);
    expect(moveFrameHasActivity(parseMoveInputFrame({ mi: {}, facing: 0.5 }), 0)).toBe(true);
  });
});
