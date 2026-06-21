import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/sim/types';
import { sceneFrameFor } from '../server/ai/scene_frame';
import { sceneInspectionEvent, sceneInspectionLineId } from '../server/ai/scene_inspection';
import type { AiWorldTrace } from '../server/ai/world_traces';
import { Sim } from '../src/sim/sim';

function playerAt(x: number, z: number): { sim: Sim; player: Entity } {
  const sim = new Sim({ seed: 20061, playerClass: 'warrior' });
  const player = sim.player;
  player.pos.x = x;
  player.pos.z = z;
  player.prevPos = { ...player.pos };
  sim.grid.update(player);
  sim.playerGrid.update(player);
  return { sim, player };
}

describe('AI scene inspection', () => {
  it('maps major scene anchors to distinct inspection lineIds', () => {
    expect(sceneInspectionLineId(sceneFrameFor(playerAt(8, 17).sim, { x: 8, y: 0, z: 17 }))).toBe('hudChrome.aiSpeech.sceneInspectForge');
    expect(sceneInspectionLineId(sceneFrameFor(playerAt(80, 86).sim, { x: 80, y: 0, z: 86 }))).toBe('hudChrome.aiSpeech.sceneInspectChapel');
    expect(sceneInspectionLineId(sceneFrameFor(playerAt(-64, 60).sim, { x: -64, y: 0, z: 60 }))).toBe('hudChrome.aiSpeech.sceneInspectLake');
    expect(sceneInspectionLineId(sceneFrameFor(playerAt(0, 660).sim, { x: 0, y: 0, z: 660 }))).toBe('hudChrome.aiSpeech.sceneInspectWatchpost');
    expect(sceneInspectionLineId(sceneFrameFor(playerAt(-152, 610).sim, { x: -152, y: 0, z: 610 }))).toBe('hudChrome.aiSpeech.sceneInspectCrypt');
  });

  it('emits a personal inspect event without mutating the scene', () => {
    const { sim, player } = playerAt(8, 17);
    const scene = sceneFrameFor(sim, player.pos);
    const beforeEntities = sim.entities.size;
    const event = sceneInspectionEvent(scene, player);

    expect(event).toMatchObject({
      type: 'aiSpeech',
      speakerId: player.id,
      speech: { mode: 'lineId', lineId: 'hudChrome.aiSpeech.sceneInspectForge' },
      reaction: { kind: 'inspect' },
      pid: player.id,
    });
    expect(sim.entities.size).toBe(beforeEntities);
  });

  it('prioritizes active world traces over static scene anchors', () => {
    const { sim, player } = playerAt(8, 17);
    const scene = sceneFrameFor(sim, player.pos);
    const trace: AiWorldTrace = {
      traceId: 'trace-1',
      sceneId: 'eastbrook_forge',
      kind: 'food',
      itemId: 'roasted_boar',
      itemDisplayName: 'Roasted Boar Meat',
      sourcePlayerEntityId: player.id,
      lineId: 'hudChrome.aiSpeech.sceneTraceFood',
      reasonLineIds: ['hudChrome.aiSpeech.itemInterestApproach'],
      strength: 0.62,
      createdAt: 1,
      expiresAt: 91,
    };

    expect(sceneInspectionLineId(scene, trace)).toBe('hudChrome.aiSpeech.sceneTraceFood');
    expect(sceneInspectionEvent(scene, player, trace)).toMatchObject({
      type: 'aiSpeech',
      speakerId: player.id,
      speech: {
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.sceneTraceFood',
        values: expect.objectContaining({ itemId: 'roasted_boar', traceKind: 'food', traceStrength: 62 }),
      },
      reaction: { kind: 'inspect', targetItemId: 'roasted_boar', score: 0.62 },
      pid: player.id,
    });
  });
});
