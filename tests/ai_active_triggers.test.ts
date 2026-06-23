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

function makeWorld(templateId = 'brother_aldric'): { sim: Sim; pid: number; npcId: number } {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Ari');
  const npc = [...sim.entities.values()].find((entity) => entity.templateId === templateId);
  if (!npc) throw new Error(`missing ${templateId}`);
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

function entityByTemplate(sim: Sim, templateId: string) {
  const entity = [...sim.entities.values()].find((candidate) => candidate.templateId === templateId);
  if (!entity) throw new Error(`missing ${templateId}`);
  return entity;
}

function moveEntity(sim: Sim, entityId: number, x: number, z: number): void {
  const entity = sim.entities.get(entityId);
  if (!entity) throw new Error(`missing entity ${entityId}`);
  entity.pos.x = x;
  entity.pos.z = z;
  entity.pos.y = groundHeight(entity.pos.x, entity.pos.z, sim.cfg.seed);
  entity.prevPos = { ...entity.pos };
  sim.grid.update(entity);
  if (entity.kind === 'player') sim.playerGrid.update(entity);
}

function addPlayersNear(sim: Sim, npcId: number, count: number): number[] {
  const npc = sim.entities.get(npcId);
  if (!npc) throw new Error('missing target npc');
  const pids: number[] = [];
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('warrior', `Ari${i}`);
    const player = sim.entities.get(pid);
    if (!player) throw new Error('missing added player');
    player.pos.x = npc.pos.x + 1 + i * 0.05;
    player.pos.z = npc.pos.z;
    player.pos.y = groundHeight(player.pos.x, player.pos.z, sim.cfg.seed);
    player.prevPos = { ...player.pos };
    sim.grid.update(player);
    sim.playerGrid.update(player);
    pids.push(pid);
  }
  return pids;
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

  it('prioritizes queued quest events over ambient polling', () => {
    const { sim, pid } = makeWorld();
    const service = new AiActiveTriggerService({ rules: [testRule()] });

    service.noteSimEvents({
      sim,
      events: [{ type: 'questDone', questId: 'q_wolves', pid }],
      nowMs: 1_000,
    });
    expect(service.diagnosticsSnapshot().eventQueue).toContainEqual(expect.objectContaining({
      kind: 'quest_done',
      questId: 'q_wolves',
      playerEntityId: pid,
    }));

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({
        mode: 'lineId',
        lineId: expect.stringMatching(/QuestRumorEcho$/),
        values: expect.objectContaining({ questId: 'q_wolves' }),
      }),
      source: 'local',
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeEventQueued: 1,
      activeEventFired: 1,
      activePollDue: 0,
    });
    expect(service.diagnosticsSnapshot().eventQueue).toHaveLength(0);
  });

  it('turns discarded food into a later localized nearby NPC reaction', () => {
    const { sim, pid } = makeWorld();
    const service = new AiActiveTriggerService({ rules: [testRule()] });

    service.noteItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, nowMs: 1_000 });
    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.worldTraceNpcFood',
        values: expect.objectContaining({ itemId: 'roasted_boar' }),
      }),
      reaction: expect.objectContaining({ kind: 'inspect', targetItemId: 'roasted_boar' }),
      source: 'local',
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeEventQueued: 1,
      activeEventFired: 1,
    });
  });

  it('expires queued events without falling through into ambient polling when polls are disabled', () => {
    const { sim, pid } = makeWorld();
    const service = new AiActiveTriggerService({
      pollsEnabled: false,
      eventTtlMs: 1_000,
      rules: [testRule()],
    });

    service.noteItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, nowMs: 1_000 });

    expect(service.tick({ sim, sessions: [{ pid }], nowMs: 2_100 })).toEqual([]);
    expect(service.runtimeMetrics()).toMatchObject({
      activeEventQueued: 1,
      activeEventExpired: 1,
      activeEventFired: 0,
      activeLastSkipReason: 'polls_disabled',
    });
    expect(service.diagnosticsSnapshot().eventQueue).toHaveLength(0);
  });

  it('scales polling density by online population', () => {
    const { sim, pid, npcId } = makeWorld();
    const extraPids = addPlayersNear(sim, npcId, 7);
    const pids = [pid, ...extraPids];
    const service = new AiActiveTriggerService({ rules: [testRule()] });

    service.tick({ sim, sessions: pids.map((id) => ({ pid: id })), nowMs: 1_000 });

    expect(service.diagnosticsSnapshot().populationPolicy).toMatchObject({
      band: 'busy',
      onlineCount: 8,
      maxPollSessionsPerTick: 6,
    });
    expect(service.runtimeMetrics()).toMatchObject({
      activeSchedulerOnlineCount: 8,
      activeSchedulerSessionsConsidered: 6,
      activeSchedulerSessionsSuppressed: 2,
      activePollDue: 6,
    });
  });

  it('protects crowded realms by skipping low priority poll rules', () => {
    const { sim, pid, npcId } = makeWorld();
    const extraPids = addPlayersNear(sim, npcId, 54);
    const pids = [pid, ...extraPids];
    const service = new AiActiveTriggerService({ rules: [testRule({ priority: 50 })] });

    expect(service.tick({ sim, sessions: pids.map((id) => ({ pid: id })), nowMs: 1_000 })).toEqual([]);

    expect(service.diagnosticsSnapshot().populationPolicy).toMatchObject({
      band: 'protected',
      onlineCount: 55,
      maxPollSessionsPerTick: 4,
      minRulePriority: 80,
      codexAdmission: 'localOnly',
    });
    expect(service.runtimeMetrics()).toMatchObject({
      activeSchedulerSessionsConsidered: 4,
      activeSchedulerSessionsSuppressed: 51,
      activePollDue: 0,
    });
  });

  it('denies codex-preferred active rules when the active budget window is exhausted', () => {
    const { sim, pid } = makeWorld();
    const service = new AiActiveTriggerService({
      codexMaxCalls5h: 1,
      codexMaxCallsWeek: 1,
      codexReserveRatio: 0,
      rules: [testRule({ providerPolicy: 'codexPreferred' })],
    });
    const nowMs = Date.now();
    service.noteCodexProviderCall(nowMs - 100);

    expect(service.tick({ sim, sessions: [{ pid }], nowMs })).toEqual([]);

    expect(service.diagnosticsSnapshot().codexBudget).toMatchObject({
      usedCalls5h: 1,
      remainingCalls5h: 0,
      usedCallsWeek: 1,
      remainingCallsWeek: 0,
    });
    expect(service.runtimeMetrics()).toMatchObject({
      activeCodexBudgetDenied: 1,
      activeProviderCalls: 1,
      activePollDue: 0,
    });
  });

  it('marks daytime NPC routine beats as working using localized speech', () => {
    const { sim, pid } = makeWorld();
    sim.time = 8 * 60;
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_living_day', category: 'livingRoutine' })],
    });

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.sceneDayEnergy' }),
      reaction: expect.objectContaining({ kind: 'inspect', planKind: 'working' }),
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeRoutineFired: 1,
      activeRoutineLastKind: 'working',
    });
  });

  it('marks clear nighttime NPC routine beats as watching the stars using localized speech', () => {
    const { sim, pid } = makeWorld();
    sim.time = 23 * 60;
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_living_stars', category: 'livingRoutine' })],
    });

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.sceneClearNightAwe' }),
      reaction: expect.objectContaining({ kind: 'inspect', planKind: 'watching' }),
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeRoutineFired: 1,
      activeRoutineLastKind: 'watching',
    });
  });

  it('marks hidden-sky nighttime NPC routine beats as sleeping or tired using localized speech', () => {
    const { sim, pid } = makeWorld('brother_aldric_fen');
    sim.time = 1 * 60;
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_living_night', category: 'livingRoutine' })],
    });

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.sceneNightFatigue' }),
      reaction: expect.objectContaining({ kind: 'avoid', planKind: 'sleeping' }),
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeRoutineFired: 1,
      activeRoutineLastKind: 'sleeping',
    });
  });

  it('lets nearby wild creatures show family life without touching mainline state', () => {
    const { sim, pid } = makeWorld();
    const wolf = entityByTemplate(sim, 'forest_wolf');
    moveEntity(sim, wolf.id, 8, 17);
    moveEntity(sim, pid, 9, 17);
    const before = mainlineSnapshot(sim, pid);
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_creature_forge', category: 'creatureRoutine' })],
    });

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiThinking',
      speakerId: wolf.id,
      pid,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: wolf.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.familySceneBeastUneasy' }),
      reaction: expect.objectContaining({
        kind: 'avoid',
        individualTier: expect.any(String),
        sceneTags: expect.arrayContaining(['forge', 'workNoise']),
      }),
      source: 'local',
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activePollFired: 1,
      activeRoutineFired: 1,
      activeRoutineLastKind: 'creature:beast:avoid',
    });
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
  });

  it('lets owned companions react to death-pressure scenes before wild creatures', () => {
    const { sim, pid } = makeWorld();
    const wolf = entityByTemplate(sim, 'forest_wolf');
    wolf.ownerId = pid;
    wolf.hostile = false;
    moveEntity(sim, wolf.id, 80, 86);
    moveEntity(sim, pid, 81, 86);
    const before = mainlineSnapshot(sim, pid);
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_companion_fear', category: 'creatureRoutine' })],
    });

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: wolf.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.companionSelfBeastScentUneasy' }),
      reaction: expect.objectContaining({
        kind: 'avoid',
        sceneTags: expect.arrayContaining(['ruinedChapel', 'undeadMemory']),
      }),
      source: 'local',
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeRoutineFired: 1,
      activeRoutineLastKind: 'companion:beast:avoid',
    });
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
  });

  it('builds a paced NPC social sequence with reciprocal attention targets', () => {
    const { sim, pid } = makeWorld();
    sim.time = 8 * 60;
    const merchant = entityByTemplate(sim, 'the_merchant');
    const marshal = entityByTemplate(sim, 'marshal_redbrook');
    moveEntity(sim, merchant.id, 9, 17);
    moveEntity(sim, marshal.id, 12, 17);
    moveEntity(sim, pid, 9, 18);
    const before = mainlineSnapshot(sim, pid);
    const service = new AiActiveTriggerService({
      thinkingDurationMs: 800,
      rules: [testRule({ ruleId: 'test_social_sequence', category: 'socialSequence' })],
    });

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });
    const thinking = events.filter((event): event is Extract<typeof event, { type: 'aiThinking' }> => event.type === 'aiThinking');
    const speech = events.filter((event): event is Extract<typeof event, { type: 'aiSpeech' }> => event.type === 'aiSpeech');
    const speakerIds = thinking.map((event) => event.speakerId);

    expect(events).toHaveLength(6);
    expect(thinking).toHaveLength(3);
    expect(speech).toHaveLength(3);
    expect(thinking.map((event) => event.durationMs)).toEqual([800, 2_000, 3_200]);
    expect(speakerIds).toEqual(expect.arrayContaining([merchant.id, marshal.id]));
    expect(speech[0]).toEqual(expect.objectContaining({
      speakerId: speakerIds[0],
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.sceneDayEnergy' }),
      reaction: expect.objectContaining({ targetEntityId: speakerIds[1], planKind: 'conversationStart' }),
      pid,
    }));
    expect(speech[1]).toEqual(expect.objectContaining({
      speakerId: speakerIds[1],
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.topicPlace' }),
      reaction: expect.objectContaining({ targetEntityId: speakerIds[2], planKind: 'conversationReply' }),
      pid,
    }));
    expect(speech[2]).toEqual(expect.objectContaining({
      speakerId: speakerIds[2],
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.topicRecentKnown' }),
      reaction: expect.objectContaining({ targetEntityId: speakerIds[0], planKind: 'conversationAside' }),
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activePollFired: 1,
      activeSequenceFired: 1,
      activeSequenceLastLength: 3,
      activeCandidatesSelected: 3,
    });
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
  });
});
