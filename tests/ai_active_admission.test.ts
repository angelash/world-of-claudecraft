import { describe, expect, it } from 'vitest';
import { BUILTIN_WORLD } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { DT, dist2d, type Entity, type NpcRoute, type WorldContent } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

const A = { x: -58, z: -30 };
const B = { x: -52, z: -30 };

function move(sim: Sim, entity: Entity, point: { x: number; z: number }): void {
  entity.pos = { ...point, y: groundHeight(point.x, point.z, sim.cfg.seed) };
  entity.prevPos = { ...entity.pos };
  sim.grid.update(entity);
  if (entity.kind === 'player') sim.playerGrid.update(entity);
}

function npcWorld(route?: NpcRoute): { sim: Sim; npc: Entity } {
  const world: WorldContent = {
    ...BUILTIN_WORLD,
    camps: [],
    groundObjects: [],
    npcs: {
      walker: {
        id: 'walker',
        name: 'Test Walker',
        title: 'Test Walker',
        pos: A,
        facing: 0,
        color: 0xffffff,
        questIds: [],
        greeting: 'Walking.',
        route,
      },
    },
  };
  const sim = new Sim({ seed: 42, playerClass: 'warrior', world, idleMobTickRadius: 100 });
  const npc = [...sim.entities.values()].find((entity) => entity.templateId === 'walker');
  if (!npc) throw new Error('missing test NPC');
  move(sim, sim.player, { x: A.x + 1, z: A.z });
  return { sim, npc };
}

describe('AI actions and upstream movement admission', () => {
  it.each(['startCombat', 'callForHelp', 'flee'] as const)(
    'refuses %s against a player protected from aggro without seeding combat',
    (intent) => {
      const sim = new Sim({ seed: 42, playerClass: 'warrior' });
      const mob = [...sim.entities.values()].find(
        (entity) => entity.kind === 'mob' && entity.templateId === 'forest_wolf',
      );
      if (!mob) throw new Error('missing forest wolf');
      move(sim, mob, A);
      move(sim, sim.player, { x: A.x + 1, z: A.z });
      sim.player.devNoAggro = true;
      const before = {
        aiState: mob.aiState,
        target: mob.aggroTargetId,
        inCombat: mob.inCombat,
        threat: [...mob.threat],
      };

      expect(
        sim.aiActiveMobAction({ intent, mobId: mob.id, playerId: sim.player.id }),
      ).toMatchObject({
        ok: false,
        reason: 'state_blocked',
        affectedEntityIds: [],
      });
      expect({
        aiState: mob.aiState,
        target: mob.aggroTargetId,
        inCombat: mob.inCombat,
        threat: [...mob.threat],
      }).toEqual(before);
    },
  );

  it.each(['shortMove', 'returnHome'] as const)('refuses %s during an authored patrol', (kind) => {
    const { sim, npc } = npcWorld({ points: [A, B], mode: 'loop', speed: 3 });
    move(sim, npc, { x: A.x + 2, z: A.z });
    expect(sim.aiActiveNpcAction({ kind, npcId: npc.id, playerId: sim.player.id })).toMatchObject({
      ok: false,
      reason: 'state_blocked',
      affectedEntityIds: [],
    });
    expect(npc.aiActiveMoveTarget).toBeNull();
  });

  it('yields an active AI move to a script without a double step or a delayed return', () => {
    const { sim, npc } = npcWorld();
    expect(
      sim.aiActiveNpcAction({
        kind: 'shortMove',
        npcId: npc.id,
        playerId: sim.player.id,
        relation: 'towardPlayer',
        distance: 2,
        durationSeconds: 0.3,
      }).ok,
    ).toBe(true);
    expect(npc.aiActiveReturnAt).toBeGreaterThan(0);
    npc.wanderTarget = { ...B, y: groundHeight(B.x, B.z, sim.cfg.seed) };
    const before = { ...npc.pos };

    sim.tick();

    expect(dist2d(before, npc.pos)).toBeGreaterThan(0);
    expect(dist2d(before, npc.pos)).toBeLessThanOrEqual(npc.moveSpeed * DT + 1e-6);
    expect(npc.aiActiveMoveTarget).toBeNull();
    expect(npc.aiActiveReturnAt).toBe(0);
    expect(npc.aiActiveReturningHome).toBe(false);
    for (let tick = 0; tick < 100; tick++) sim.tick();
    expect(dist2d(npc.pos, { ...B, y: 0 })).toBeLessThan(0.5);
  });
});
