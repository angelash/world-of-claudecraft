import { describe, expect, it } from 'vitest';
import {
  AiActiveTriggerService,
  type AiActivePollRuleV1,
} from '../server/ai/active_triggers';
import { Sim } from '../src/sim/sim';
import { groundHeight } from '../src/sim/world';

function testRule(overrides: Partial<AiActivePollRuleV1> = {}): AiActivePollRuleV1 {
  return {
    ruleId: 'test_scene_ambient',
    title: 'Test scene ambient',
    enabled: true,
    category: 'sceneAmbient',
    periodSeconds: 1,
    jitterSeconds: 0,
    priority: 100,
    scope: 'playerVicinity',
    providerPolicy: 'localOnly',
    outputMode: 'lineIdOnly',
    cooldown: {
      perPlayerSeconds: 90,
      perEntitySeconds: 180,
      perRuleSeconds: 1,
    },
    ...overrides,
  };
}

function makeWorld(): { sim: Sim; pid: number; npcId: number } {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Ari');
  const npc = [...sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric');
  if (!npc) throw new Error('missing Brother Aldric');
  const player = sim.entities.get(pid);
  if (!player) throw new Error('missing player');
  player.pos.x = npc.pos.x + 1;
  player.pos.z = npc.pos.z;
  player.pos.y = groundHeight(player.pos.x, player.pos.z, sim.cfg.seed);
  player.prevPos = { ...player.pos };
  sim.grid.update(player);
  sim.playerGrid.update(player);
  return { sim, pid, npcId: npc.id };
}

function mainlineSnapshot(sim: Sim, pid: number): unknown {
  const meta = sim.meta(pid);
  const player = sim.entities.get(pid);
  if (!meta || !player) throw new Error('missing player state');
  return {
    level: player.level,
    xp: meta.xp,
    lifetimeXp: meta.lifetimeXp,
    copper: meta.copper,
    inventory: meta.inventory.map((slot) => ({ itemId: slot.itemId, count: slot.count })),
    questLog: [...meta.questLog.entries()].map(([questId, progress]) => ({
      questId,
      state: progress.state,
      counts: [...progress.counts],
    })),
    questsDone: [...meta.questsDone],
  };
}

describe('AI active trigger service', () => {
  it('skips polling when nobody is online', () => {
    const { sim } = makeWorld();
    const service = new AiActiveTriggerService({ rules: [testRule()] });

    expect(service.tick({ sim, sessions: [], nowMs: 1_000 })).toEqual([]);
    expect(service.runtimeMetrics()).toMatchObject({
      activePollSkipped: 1,
      activeLastSkipReason: 'no_online_players',
    });
  });

  it('fires a personal thinking cue and localized speech for a nearby NPC', () => {
    const { sim, pid, npcId } = makeWorld();
    const service = new AiActiveTriggerService({ rules: [testRule()], thinkingDurationMs: 1_500 });
    const before = mainlineSnapshot(sim, pid);

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiThinking',
      speakerId: npcId,
      durationMs: 1_500,
      pid,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: npcId,
      speech: expect.objectContaining({ mode: 'lineId' }),
      source: 'local',
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activePollDue: 1,
      activePollFired: 1,
      activeCandidatesSelected: 1,
      activeLocalReactions: 1,
    });
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
  });

  it('suppresses repeat ambient speech while the player is on cooldown', () => {
    const { sim, pid } = makeWorld();
    const service = new AiActiveTriggerService({ rules: [testRule()] });

    expect(service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 })).not.toEqual([]);
    expect(service.tick({ sim, sessions: [{ pid }], nowMs: 2_100 })).toEqual([]);
    expect(service.runtimeMetrics()).toMatchObject({
      activePollDue: 2,
      activePollFired: 1,
      activePollSkipped: 1,
      activeNoiseSuppressions: 1,
      activeLastSkipReason: 'player_recent_ai_speech',
    });
  });

  it('honors the poll enable switch without scanning candidates', () => {
    const { sim, pid } = makeWorld();
    const service = new AiActiveTriggerService({
      pollsEnabled: false,
      rules: [testRule()],
    });

    expect(service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 })).toEqual([]);
    expect(service.runtimeMetrics()).toMatchObject({
      activePollSkipped: 1,
      activeCandidatesScanned: 0,
      activeLastSkipReason: 'polls_disabled',
    });
  });
});
