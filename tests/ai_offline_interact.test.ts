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

function aiSpeechEvents(events: SimEvent[]): Extract<SimEvent, { type: 'aiSpeech' }>[] {
  return events.filter((event): event is Extract<SimEvent, { type: 'aiSpeech' }> => event.type === 'aiSpeech');
}

describe('offline AI NPC interaction', () => {
  it('emits localized lineId feedback for AI question buttons without changing gameplay state', () => {
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
    const events = aiSpeechEvents(sim.tick());

    expect(events).toContainEqual(expect.objectContaining({
      speakerId: npc!.id,
      speakerName: 'Brother Aldric',
      speech: {
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.topicPlace',
        values: expect.objectContaining({
          speakerName: 'Brother Aldric',
          playerName: 'Ari',
        }),
      },
      source: 'fallback',
      reaction: { kind: 'inspect' },
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
