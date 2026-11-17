// The features of the act 1 doors and their readers (thousand_doors.md 8; section 23 group
// F, the act 1 rows): with the feature off the reader's entry is not there, with it on the
// behaviour shows. door_corridor gates the corridor window and view, tide_sight the level
// range on the target frame, appraise_talent the potential line of an appraisal,
// inner_court the court's door (and the return point, pinned in tests/combat.test.ts).
// servant (the pact door's retainers) waits for its reader in the party batch.

import { describe, expect, it } from 'vitest';
import { isWindowAvailable, windowDef } from '../src/client/windows/window_registry';
import type { Engine } from '../src/core';
import { createGame } from '../src/game/create';
import { appraise } from '../src/systems/cognition/appraise';
import { targetInfo } from '../src/systems/combat';
import { corridorOpen } from '../src/systems/doors';
import { npcEntityId } from '../src/systems/npc/personas';
import { lastResult } from './doors_harness';

function game(): Engine {
  const g = createGame({ seed: 5, aiMode: 'off' });
  g.step(2);
  return g;
}

function setFlag(g: Engine, key: string, value: boolean): void {
  g.queue('flag.set', { key, value });
  g.step(1);
}

describe('F: the act 1 door features and their readers (8)', () => {
  it('door_corridor: no corridor window or view before the first door, both after', () => {
    const g = game();
    const flags = g.world.meta.flags;
    expect(corridorOpen(g.world)).toBe(false);
    expect(isWindowAvailable(windowDef('doors'), flags, false)).toBe(false);
    setFlag(g, 'feature.door_corridor', true);
    expect(corridorOpen(g.world)).toBe(true);
    expect(isWindowAvailable(windowDef('doors'), g.world.meta.flags, false)).toBe(true);
    // the door that sets it
    const awaken = g.content.doors.find((d) => d.code === 'door_awaken');
    expect(awaken?.effects).toContainEqual({ type: 'feature', feature: 'door_corridor' });
  });

  it('tide_sight: the target frame reads "?" without the door and a level range with it', () => {
    const g = game();
    const pid = g.world.slices.world.playerId;
    const target = Object.values(g.world.slices.combat.units).find(
      (u) => u.id !== pid && g.world.slices.world.entities[u.id]?.kind === 'monster',
    );
    const me = g.world.slices.combat.units[pid];
    if (!target || !me) throw new Error('no monster to read');
    target.level = me.level + 1;
    me.target = target.id;
    expect(targetInfo(g.world, g.content)?.levelText).toBe('?');
    setFlag(g, 'feature.tide_sight', true);
    me.target = target.id;
    expect(targetInfo(g.world, g.content)?.levelText).toMatchObject({
      key: 'sys.combat.level_range',
    });
  });

  it('appraise_talent: an appraisal reads the hidden potential only with the door', () => {
    const g = game();
    const pid = g.world.slices.world.playerId;
    const ron = npcEntityId('ron');
    expect(g.world.slices.world.entities[ron]).toBeDefined();
    expect(appraise(g.world, g.content, pid, ron, 'skill')?.potential).toBeUndefined();
    setFlag(g, 'feature.appraise_talent', true);
    expect(appraise(g.world, g.content, pid, ron, 'skill')?.potential).toBeTruthy();
  });

  it('inner_court: the court door refuses without the door and lets the player in with it', () => {
    const g = game();
    g.queue('city.enter_court', {});
    g.step(1);
    expect(lastResult(g, 'city.enter_court')?.code).toBe('locked');
    setFlag(g, 'feature.inner_court', true);
    g.queue('city.enter_court', {});
    g.step(1);
    expect(lastResult(g, 'city.enter_court')?.ok).toBe(true);
  });
});
