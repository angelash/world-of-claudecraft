import { expect } from 'vitest';
import { individualProfileFor } from '../../server/ai/singularity';
import { EASTBROOK_LAYOUT } from '../../src/sim/eastbrook_layout';
import type { Sim } from '../../src/sim/sim';
import { groundHeight } from '../../src/sim/world';

export function teleportNear(sim: Sim, pid: number, targetId: number): void {
  const player = sim.entities.get(pid)!;
  const target = sim.entities.get(targetId)!;
  player.pos.x = target.pos.x + 1;
  player.pos.z = target.pos.z;
  player.pos.y = groundHeight(player.pos.x, player.pos.z, sim.cfg.seed);
  player.prevPos = { ...player.pos };
  sim.grid.update(player);
  sim.playerGrid.update(player);
}

// Shared from the persistence fixture: one ordinary local reactor at the forge,
// with neighboring actors moved away so singularity selection cannot alter the
// zero-provider contract when the shipped world adds or reorders entities.
export function ordinaryDiscardFixture(sim: Sim, pid: number): { sim: Sim; pid: number } {
  const wolf = [...sim.entities.values()].find(
    (entity) =>
      entity.templateId === 'forest_wolf' &&
      individualProfileFor(entity, sim.cfg.seed).tier === 'none',
  );
  if (!wolf) throw new Error('missing ordinary forest wolf');
  const forge = EASTBROOK_LAYOUT.buildings
    .find((building) => building.id === 'eastbrook_smithy')!
    .annexes.find((annex) => annex.id === 'eastbrook_smithy:forge_shelter')!.center;
  wolf.pos = { ...forge, y: groundHeight(forge.x, forge.z, sim.cfg.seed) };
  wolf.prevPos = { ...wolf.pos };
  sim.grid.update(wolf);
  teleportNear(sim, pid, wolf.id);
  const player = sim.entities.get(pid)!;
  for (const entity of sim.entities.values()) {
    if (entity.id === wolf.id || (entity.kind !== 'mob' && entity.kind !== 'npc')) continue;
    if (Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) > 26) continue;
    entity.pos.x += 80;
    entity.pos.z += 80;
    entity.pos.y = groundHeight(entity.pos.x, entity.pos.z, sim.cfg.seed);
    entity.prevPos = { ...entity.pos };
    sim.grid.update(entity);
  }
  expect(individualProfileFor(wolf, sim.cfg.seed).tier).toBe('none');
  expect(
    [...sim.entities.values()]
      .filter(
        (entity) =>
          (entity.kind === 'mob' || entity.kind === 'npc') &&
          Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) <= 26,
      )
      .map((entity) => entity.id),
  ).toEqual([wolf.id]);
  return { sim, pid };
}
