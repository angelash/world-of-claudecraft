import { describe, expect, it } from 'vitest';
import { createDungeonEntryFacingFence } from '../server/dungeon_entry_facing';
import {
  applyMovementWithHostedControl,
  resetHostedMovementControl,
} from '../server/hosted_play/movement_control';
import {
  consumeMovementFramesV2,
  createMovementInputSessionState,
} from '../server/movement_input_timeline_v2';
import { Sim } from '../src/sim/sim';

function fixture(version: 1 | 2) {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
  const session = {
    ...createMovementInputSessionState(version),
    pid: sim.player.id,
    lastInputAt: 0,
    dungeonEntryFacing: createDungeonEntryFacingFence(0),
    hostedPlayObserved: false,
  };
  return { sim, session, meta: sim.meta(session.pid)! };
}

describe('hosted movement ownership', () => {
  it.each([1, 2] as const)('clears the previous owner control for wire v%s', (version) => {
    const { sim, session, meta } = fixture(version);
    meta.moveInput.forward = true;
    resetHostedMovementControl(session, meta);
    expect(meta.moveInput.forward).toBe(false);
    expect(session.movementTimeline).toBeNull();
    session.hostedPlayObserved = true;
    applyMovementWithHostedControl(
      session,
      meta,
      sim.player,
      { ct: 0, mi: { b: 1 } },
      0,
      sim.ctx,
      'client',
    );
    expect(meta.moveInput.back).toBe(false);
  });

  it('waits for a valid tick before anchoring the returned client timeline', () => {
    const { sim, session, meta } = fixture(2);
    resetHostedMovementControl(session, meta);
    const apply = (ct: unknown) =>
      applyMovementWithHostedControl(
        session,
        meta,
        sim.player,
        { ct, mi: { f: 1 } },
        sim.time,
        sim.ctx,
        'client',
      );
    apply('5000');
    expect(session.movementTimeline).toBeNull();
    expect(meta.moveInput.forward).toBe(false);
    apply(5000);
    consumeMovementFramesV2(sim, [session]);
    expect(meta.moveInput.forward).toBe(true);
    expect(session.lastConsumedCt).toBe(5000);
  });
});
