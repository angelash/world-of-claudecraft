import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

function teleportNear(sim: Sim, pid: number, targetId: number): void {
  const player = sim.entities.get(pid)!;
  const target = sim.entities.get(targetId)!;
  player.pos.x = target.pos.x + 1;
  player.pos.z = target.pos.z;
  player.pos.y = groundHeight(player.pos.x, player.pos.z, sim.cfg.seed);
  player.prevPos = { ...player.pos };
  sim.grid.update(player);
  sim.playerGrid.update(player);
}

function errorEvents(events: SimEvent[]): Extract<SimEvent, { type: 'error' }>[] {
  return events.filter((event): event is Extract<SimEvent, { type: 'error' }> => event.type === 'error');
}

function aiThinkingEvents(events: SimEvent[]): Extract<SimEvent, { type: 'aiThinking' }>[] {
  return events.filter((event): event is Extract<SimEvent, { type: 'aiThinking' }> => event.type === 'aiThinking');
}

describe('offline AI NPC interaction', () => {
  it('reports that offline mode has no Codex CLI provider without changing gameplay state', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Ari');
    const npc = [...sim.entities.values()].find((entity): entity is Entity =>
      entity.kind === 'npc' && entity.templateId === 'brother_aldric');
    expect(npc).toBeTruthy();
    teleportNear(sim, pid, npc!.id);
    sim.tick();
    const before = {
      inventory: JSON.stringify(sim.inventory),
      questLog: JSON.stringify([...sim.questLog]),
      questsDone: JSON.stringify([...sim.questsDone]),
      copper: sim.copper,
      xp: sim.xp,
    };

    sim.aiInteractNpc(npc!.id, 'zh_CN', 'place');
    const tickEvents = sim.tick();
    const thinkingEvents = aiThinkingEvents(tickEvents);
    const events = errorEvents(tickEvents);

    expect(thinkingEvents).toContainEqual(expect.objectContaining({
      speakerId: npc!.id,
      speakerName: 'Brother Aldric',
      durationMs: expect.any(Number),
      pid,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'error',
      text: 'AI response failed: Offline simulation has no Codex CLI provider. Use the online server for living AI interactions.',
      pid,
    }));
    expect({
      inventory: JSON.stringify(sim.inventory),
      questLog: JSON.stringify([...sim.questLog]),
      questsDone: JSON.stringify([...sim.questsDone]),
      copper: sim.copper,
      xp: sim.xp,
    }).toEqual(before);
  });
});
