import { describe, expect, it } from 'vitest';
import { AiLifeLayer } from '../server/ai/life_layer';
import type { AiDecisionV1, AiJobContextV1, AiProvider } from '../server/ai/ai_types';
import { Sim } from '../src/sim/sim';
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

function makeSim(): { sim: Sim; pid: number; npcId: number } {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Ari');
  const npc = [...sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
  teleportNear(sim, pid, npc.id);
  return { sim, pid, npcId: npc.id };
}

describe('AI decision journal', () => {
  it('records rejected provider output without delivering events', async () => {
    const provider: AiProvider = {
      async decide(context: AiJobContextV1): Promise<AiDecisionV1> {
        return {
          schemaVersion: 1,
          jobId: context.jobId,
          entityRef: { kind: context.entity.kind, entityId: context.entity.entityId, templateId: context.entity.templateId },
          ttlMs: 5000,
          confidence: 1,
          speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.merchantMarketPulse' }],
          intents: [{ type: 'commentOnScene' }],
          audit: { shortReason: 'bad line for profile', usedPlayerInput: false, safetyNotes: [] },
        };
      },
    };
    const { sim, pid, npcId } = makeSim();
    const layer = new AiLifeLayer({ enabled: true, provider });
    const delivered: unknown[] = [];

    await layer.handleNpcInteraction({ sim, pid, npcId, locale: 'en', deliver: (events) => delivered.push(...events) });

    expect(delivered).toHaveLength(0);
    expect(layer.diagnostics()).toEqual([expect.objectContaining({
      status: 'rejected',
      templateId: 'brother_aldric',
      lineIds: ['hudChrome.aiSpeech.merchantMarketPulse'],
    })]);
  });

  it('records local item-discard reactions for replay diagnostics', () => {
    const { sim, pid } = makeSim();
    const layer = new AiLifeLayer({ enabled: true, journalSize: 4 });
    const wolf = [...sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf')!;
    teleportNear(sim, pid, wolf.id);

    layer.handleItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, deliver: () => {} });

    expect(layer.diagnostics()[0]).toMatchObject({
      status: 'local_reaction',
      trigger: 'item_discarded',
      reason: 'discarded:roasted_boar',
    });
  });
});
