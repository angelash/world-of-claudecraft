import { describe, expect, it, vi } from 'vitest';
import {
  AiActiveTriggerService,
  type AiActivePollRuleV1,
} from '../server/ai/active_triggers';
import type { AiJobContextV1, AiProvider } from '../server/ai/ai_types';
import { Sim } from '../src/sim/sim';
import { dist2d, type SimEvent } from '../src/sim/types';
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

function entitiesByTemplate(sim: Sim, templateId: string) {
  const entities = [...sim.entities.values()].filter((candidate) => candidate.templateId === templateId);
  if (entities.length === 0) throw new Error(`missing ${templateId}`);
  return entities;
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

  it('applies runtime config updates and keeps rules editable after disabling them', () => {
    const { sim, pid } = makeWorld();
    const service = new AiActiveTriggerService({ rules: [testRule()] });

    const disabled = service.updateConfig({
      pollsEnabled: false,
      realActionsEnabled: false,
      rules: [{
        ruleId: 'test_scene_ambient',
        enabled: false,
        periodSeconds: 12,
        jitterSeconds: 3,
        priority: 12,
        providerPolicy: 'codexPreferred',
        outputMode: 'mixedLivingWorld',
        cooldown: { perPlayerSeconds: 4, perEntitySeconds: 5, perRuleSeconds: 6 },
      }],
    });

    expect(disabled.pollsEnabled).toBe(false);
    expect(disabled.realActionsEnabled).toBe(false);
    expect(disabled.rules).toEqual([
      expect.objectContaining({
        ruleId: 'test_scene_ambient',
        enabled: false,
        periodSeconds: 12,
        jitterSeconds: 3,
        priority: 12,
        providerPolicy: 'codexPreferred',
        outputMode: 'mixedLivingWorld',
        cooldown: { perPlayerSeconds: 4, perEntitySeconds: 5, perRuleSeconds: 6 },
      }),
    ]);
    expect(service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 })).toEqual([]);

    const enabled = service.updateConfig({
      pollsEnabled: true,
      rules: [{ ruleId: 'test_scene_ambient', enabled: true, periodSeconds: 1, priority: 100 }],
    });

    expect(enabled.rules[0]).toMatchObject({ ruleId: 'test_scene_ambient', enabled: true, periodSeconds: 1, priority: 100 });
    expect(service.tick({ sim, sessions: [{ pid }], nowMs: 2_000 })).toEqual([
      expect.objectContaining({ type: 'aiThinking' }),
      expect.objectContaining({ type: 'aiSpeech' }),
    ]);
    expect(() => service.updateConfig({ rules: [{ ruleId: 'missing_rule' }] })).toThrow('unknown active trigger rule');
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
    const player = sim.entities.get(pid);
    if (!player) throw new Error('missing player');
    const droppedAt = { x: player.pos.x, z: player.pos.z };
    const requests: unknown[] = [];

    service.noteItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, nowMs: 1_000 });
    expect(service.diagnosticsSnapshot().eventQueue).toContainEqual(expect.objectContaining({
      kind: 'item_discarded',
      anchorPos: droppedAt,
    }));
    const events = service.tick({
      sim,
      sessions: [{ pid }],
      nowMs: 1_000,
      applyNpcAction: (request) => {
        requests.push(request);
        return sim.aiActiveNpcAction(request);
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.worldTraceNpcFood',
        values: expect.objectContaining({ itemId: 'roasted_boar' }),
      }),
      reaction: expect.objectContaining({
        kind: 'inspect',
        targetItemId: 'roasted_boar',
        targetPos: droppedAt,
        actionDurationMs: 1900,
        actionOffset: 0.18,
      }),
      source: 'local',
      pid,
    }));
    const speech = events.find((event): event is Extract<typeof event, { type: 'aiSpeech' }> => event.type === 'aiSpeech');
    expect(requests).toEqual([
      expect.objectContaining({ kind: 'shortMove', npcId: speech?.speakerId, playerId: pid, relation: 'towardPlayer' }),
    ]);
    expect(service.runtimeMetrics()).toMatchObject({
      activeEventQueued: 1,
      activeEventFired: 1,
      activeActionsAttempted: 1,
      activeActionsApplied: 1,
      activeNpcActionsApplied: 1,
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

  it('marks meal-time NPC routine beats as eating without changing mainline state', () => {
    const { sim, pid } = makeWorld();
    sim.time = 12 * 60;
    const before = mainlineSnapshot(sim, pid);
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_living_meal', category: 'livingRoutine' })],
    });

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.sceneDayEnergy' }),
      reaction: expect.objectContaining({ kind: 'inspect', planKind: 'eating' }),
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeRoutineFired: 1,
      activeRoutineLastKind: 'eating',
    });
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
  });

  it('moves a key NPC briefly for a living routine and returns them home', () => {
    const { sim, pid, npcId } = makeWorld();
    sim.time = 8 * 60;
    const npc = sim.entities.get(npcId);
    if (!npc) throw new Error('missing npc');
    const home = { ...npc.pos };
    const before = mainlineSnapshot(sim, pid);
    const requests: unknown[] = [];
    const results: unknown[] = [];
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_npc_micro_move', category: 'livingRoutine' })],
    });

    const events = service.tick({
      sim,
      sessions: [{ pid }],
      nowMs: 1_000,
      applyNpcAction: (request) => {
        requests.push(request);
        const result = sim.aiActiveNpcAction(request);
        results.push(result);
        return result;
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: npcId,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.sceneDayEnergy' }),
      pid,
    }));
    expect(requests).toEqual([
      expect.objectContaining({ kind: 'shortMove', npcId, playerId: pid, maxDistanceFromHome: 3 }),
    ]);
    expect(results).toEqual([
      expect.objectContaining({ ok: true, kind: 'shortMove', affectedEntityIds: [npcId] }),
    ]);
    expect(service.runtimeMetrics()).toMatchObject({
      activeActionsAttempted: 1,
      activeActionsApplied: 1,
      activeActionsRejected: 0,
      activeNpcActionsApplied: 1,
      activeLastActionKind: 'npc:shortMove',
      activeLastActionResult: 'applied',
      activeLastActionReason: '',
    });
    expect(npc.aiActiveMoveTarget).not.toBeNull();

    for (let i = 0; i < 40; i++) sim.tick();
    expect(dist2d(npc.pos, home)).toBeGreaterThan(0.3);
    expect(dist2d(npc.pos, home)).toBeLessThanOrEqual(3.05);

    for (let i = 0; i < 220; i++) sim.tick();
    expect(dist2d(npc.pos, home)).toBeLessThan(0.35);
    expect(npc.aiActiveMoveTarget).toBeNull();
    expect(npc.aiActiveReturningHome).toBe(false);
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
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

  it('can apply a real server-authoritative creature flee action through the action bridge', () => {
    const { sim, pid } = makeWorld();
    const wolf = entityByTemplate(sim, 'forest_wolf');
    moveEntity(sim, wolf.id, 80, 86);
    moveEntity(sim, pid, 81, 86);
    const before = mainlineSnapshot(sim, pid);
    const requests: unknown[] = [];
    const results: unknown[] = [];
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_creature_action', category: 'creatureRoutine' })],
    });

    const events = service.tick({
      sim,
      sessions: [{ pid }],
      nowMs: 1_000,
      applyAction: (request) => {
        requests.push(request);
        const result = sim.aiActiveMobAction(request);
        results.push(result);
        return result;
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: wolf.id,
      reaction: expect.objectContaining({ kind: 'avoid' }),
      pid,
    }));
    expect(requests).toEqual([
      expect.objectContaining({ intent: 'flee', mobId: wolf.id, playerId: pid }),
    ]);
    expect(results).toEqual([
      expect.objectContaining({ ok: true, intent: 'flee', affectedEntityIds: expect.arrayContaining([wolf.id]) }),
    ]);
    expect(wolf.aiState).toBe('flee');
    expect(wolf.aggroTargetId).toBe(pid);
    expect(wolf.inCombat).toBe(true);
    expect(wolf.fleeTimer).toBeGreaterThan(0);
    expect(service.runtimeMetrics()).toMatchObject({
      activeActionsAttempted: 1,
      activeActionsApplied: 1,
      activeActionsRejected: 0,
      activeMobActionsApplied: 1,
      activeLastActionKind: 'mob:flee',
      activeLastActionResult: 'applied',
      activeLastActionReason: '',
    });
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
  });

  it('records rejected real creature actions for admin diagnostics', () => {
    const { sim, pid } = makeWorld();
    const wolf = entityByTemplate(sim, 'forest_wolf');
    moveEntity(sim, wolf.id, 80, 86);
    moveEntity(sim, pid, 81, 86);
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_creature_action_rejected', category: 'creatureRoutine' })],
    });

    const events = service.tick({
      sim,
      sessions: [{ pid }],
      nowMs: 1_000,
      applyAction: (request) => ({
        ok: false,
        intent: request.intent,
        reason: 'state_blocked',
        affectedEntityIds: [],
      }),
    });

    expect(events).toContainEqual(expect.objectContaining({ type: 'aiSpeech', speakerId: wolf.id }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeActionsAttempted: 1,
      activeActionsApplied: 0,
      activeActionsRejected: 1,
      activeMobActionsApplied: 0,
      activeLastActionKind: 'mob:flee',
      activeLastActionResult: 'rejected',
      activeLastActionReason: 'state_blocked',
    });
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

  it('applies short NPC actions when social sequences become live behavior', () => {
    const { sim, pid } = makeWorld();
    sim.time = 8 * 60;
    const merchant = entityByTemplate(sim, 'the_merchant');
    const marshal = entityByTemplate(sim, 'marshal_redbrook');
    moveEntity(sim, merchant.id, 9, 17);
    moveEntity(sim, marshal.id, 12, 17);
    moveEntity(sim, pid, 9, 18);
    const requests: unknown[] = [];
    const service = new AiActiveTriggerService({
      thinkingDurationMs: 800,
      rules: [testRule({ ruleId: 'test_social_sequence_actions', category: 'socialSequence' })],
    });

    const events = service.tick({
      sim,
      sessions: [{ pid }],
      nowMs: 1_000,
      applyNpcAction: (request) => {
        requests.push(request);
        return sim.aiActiveNpcAction(request);
      },
    });

    const speakerIds = events
      .filter((event): event is Extract<typeof event, { type: 'aiThinking' }> => event.type === 'aiThinking')
      .map((event) => event.speakerId);
    expect(requests).toEqual([
      expect.objectContaining({ kind: 'shortMove', npcId: speakerIds[0], playerId: pid, relation: 'sideStep' }),
      expect.objectContaining({ kind: 'shortMove', npcId: speakerIds[1], playerId: pid, relation: 'towardPlayer' }),
    ]);
    expect(service.runtimeMetrics()).toMatchObject({
      activeSequenceFired: 1,
      activeActionsAttempted: 2,
      activeActionsApplied: 2,
      activeNpcActionsApplied: 2,
      activeLastActionKind: 'npc:shortMove',
      activeLastActionResult: 'applied',
    });
  });

  it('builds paced wild creature sequences when no NPC pair is nearby', () => {
    const { sim, pid } = makeWorld();
    for (const npc of [...sim.entities.values()].filter((entity) => entity.kind === 'npc')) {
      moveEntity(sim, npc.id, 320, 320);
    }
    const wolves = entitiesByTemplate(sim, 'forest_wolf').slice(0, 2);
    if (wolves.length < 2) throw new Error('missing wolf pair');
    moveEntity(sim, wolves[0].id, 8, 17);
    moveEntity(sim, wolves[1].id, 10, 17);
    moveEntity(sim, pid, 9, 18);
    const before = mainlineSnapshot(sim, pid);
    const service = new AiActiveTriggerService({
      thinkingDurationMs: 800,
      rules: [testRule({ ruleId: 'test_creature_sequence', category: 'socialSequence' })],
    });

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });
    const thinking = events.filter((event): event is Extract<typeof event, { type: 'aiThinking' }> => event.type === 'aiThinking');
    const speech = events.filter((event): event is Extract<typeof event, { type: 'aiSpeech' }> => event.type === 'aiSpeech');

    expect(events).toHaveLength(4);
    expect(thinking).toHaveLength(2);
    expect(speech).toHaveLength(2);
    expect(thinking.map((event) => event.speakerId)).toEqual(wolves.map((wolf) => wolf.id));
    expect(speech[0]).toEqual(expect.objectContaining({
      speakerId: wolves[0].id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.familySceneBeastUneasy' }),
      reaction: expect.objectContaining({
        kind: 'avoid',
        targetEntityId: wolves[1].id,
        planKind: 'packScentStart',
        sceneTags: expect.arrayContaining(['sequence:packScentStart', 'family:beast']),
      }),
      pid,
    }));
    expect(speech[1]).toEqual(expect.objectContaining({
      speakerId: wolves[1].id,
      reaction: expect.objectContaining({
        targetEntityId: wolves[0].id,
        planKind: 'creatureSequenceReply',
      }),
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activePollFired: 1,
      activeSequenceFired: 1,
      activeSequenceLastLength: 2,
      activeCandidatesSelected: 2,
    });
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
  });

  it('applies real mob actions from wild creature sequences through the action bridge', () => {
    const { sim, pid } = makeWorld();
    for (const npc of [...sim.entities.values()].filter((entity) => entity.kind === 'npc')) {
      moveEntity(sim, npc.id, 320, 320);
    }
    const murlocs = entitiesByTemplate(sim, 'mudfin_murloc').slice(0, 2);
    if (murlocs.length < 2) throw new Error('missing murloc pair');
    moveEntity(sim, murlocs[0].id, -75, 57);
    moveEntity(sim, murlocs[1].id, -73, 57);
    moveEntity(sim, pid, -74, 58);
    const before = mainlineSnapshot(sim, pid);
    const requests: unknown[] = [];
    const results: unknown[] = [];
    const service = new AiActiveTriggerService({
      thinkingDurationMs: 800,
      rules: [testRule({ ruleId: 'test_creature_sequence_actions', category: 'socialSequence' })],
    });

    const events = service.tick({
      sim,
      sessions: [{ pid }],
      nowMs: 1_000,
      applyAction: (request) => {
        requests.push(request);
        const result = sim.aiActiveMobAction(request);
        results.push(result);
        return result;
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: murlocs[0].id,
      reaction: expect.objectContaining({ planKind: 'murlocAlarmStart' }),
      pid,
    }));
    expect(requests).toContainEqual(expect.objectContaining({ mobId: murlocs[0].id, playerId: pid, social: true }));
    expect(results).toContainEqual(expect.objectContaining({
      ok: true,
      affectedEntityIds: expect.arrayContaining([murlocs[0].id]),
    }));
    expect(murlocs.some((murloc) => murloc.inCombat && murloc.aggroTargetId === pid)).toBe(true);
    const metrics = service.runtimeMetrics();
    expect(metrics.activeActionsAttempted).toBeGreaterThanOrEqual(1);
    expect(metrics.activeActionsApplied).toBeGreaterThanOrEqual(1);
    expect(metrics.activeMobActionsApplied).toBeGreaterThanOrEqual(1);
    expect(metrics.activeLastActionKind.startsWith('mob:')).toBe(true);
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
  });

  it('delivers social sequence beats over time when a live deliver callback is available', async () => {
    vi.useFakeTimers();
    const { sim, pid } = makeWorld();
    sim.time = 8 * 60;
    const merchant = entityByTemplate(sim, 'the_merchant');
    const marshal = entityByTemplate(sim, 'marshal_redbrook');
    moveEntity(sim, merchant.id, 9, 17);
    moveEntity(sim, marshal.id, 12, 17);
    moveEntity(sim, pid, 9, 18);
    const delivered: SimEvent[][] = [];
    const service = new AiActiveTriggerService({
      thinkingDurationMs: 800,
      rules: [testRule({ ruleId: 'test_social_sequence_live', category: 'socialSequence' })],
    });

    try {
      const immediate = service.tick({
        sim,
        sessions: [{ pid }],
        nowMs: 1_000,
        deliver: (_pid, events) => delivered.push(events),
      });

      expect(immediate).toEqual([
        expect.objectContaining({ type: 'aiThinking', durationMs: 800, pid }),
      ]);
      expect(delivered).toEqual([]);

      await vi.advanceTimersByTimeAsync(799);
      expect(delivered).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(delivered).toEqual([
        [expect.objectContaining({ type: 'aiSpeech', pid })],
      ]);
      await vi.advanceTimersByTimeAsync(900);
      expect(delivered).toHaveLength(2);
      expect(delivered[1]).toEqual([
        expect.objectContaining({ type: 'aiThinking', durationMs: 2_000, pid }),
      ]);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(delivered).toHaveLength(3);
      expect(delivered[2]).toEqual([
        expect.objectContaining({ type: 'aiSpeech', pid }),
      ]);
    } finally {
      service.stop();
      vi.useRealTimers();
    }
  });

  it('exposes and cancels running paced sequences before delayed beats deliver', async () => {
    vi.useFakeTimers();
    const { sim, pid } = makeWorld();
    sim.time = 8 * 60;
    const merchant = entityByTemplate(sim, 'the_merchant');
    const marshal = entityByTemplate(sim, 'marshal_redbrook');
    moveEntity(sim, merchant.id, 9, 17);
    moveEntity(sim, marshal.id, 12, 17);
    moveEntity(sim, pid, 9, 18);
    const delivered: SimEvent[][] = [];
    const service = new AiActiveTriggerService({
      thinkingDurationMs: 800,
      rules: [testRule({ ruleId: 'test_social_sequence_cancel_admin', category: 'socialSequence' })],
    });

    try {
      const immediate = service.tick({
        sim,
        sessions: [{ pid }],
        nowMs: 1_000,
        deliver: (_pid, events) => delivered.push(events),
      });

      expect(immediate).toEqual([
        expect.objectContaining({ type: 'aiThinking', durationMs: 800, pid }),
      ]);
      expect(service.diagnosticsSnapshot().activeSequences).toEqual([
        expect.objectContaining({
          kind: 'npc',
          ruleId: 'test_social_sequence_cancel_admin',
          playerEntityId: pid,
          speakerEntityIds: expect.arrayContaining([merchant.id, marshal.id]),
          remainingBeats: 5,
          nextBeatAtMs: 1_800,
        }),
      ]);

      expect(service.cancelActiveSequences()).toEqual({ canceledSequences: 1, canceledBeats: 5 });
      expect(service.diagnosticsSnapshot().activeSequences).toEqual([]);
      await vi.advanceTimersByTimeAsync(6_000);
      expect(delivered).toEqual([]);
    } finally {
      service.stop();
      vi.useRealTimers();
    }
  });

  it('cancels paced social sequence beats when the player enters combat', async () => {
    vi.useFakeTimers();
    const { sim, pid } = makeWorld();
    sim.time = 8 * 60;
    const merchant = entityByTemplate(sim, 'the_merchant');
    const marshal = entityByTemplate(sim, 'marshal_redbrook');
    const player = sim.entities.get(pid);
    if (!player) throw new Error('missing player');
    moveEntity(sim, merchant.id, 9, 17);
    moveEntity(sim, marshal.id, 12, 17);
    moveEntity(sim, pid, 9, 18);
    const delivered: SimEvent[][] = [];
    const service = new AiActiveTriggerService({
      thinkingDurationMs: 800,
      rules: [testRule({ ruleId: 'test_social_sequence_cancel', category: 'socialSequence' })],
    });

    try {
      const immediate = service.tick({
        sim,
        sessions: [{ pid }],
        nowMs: 1_000,
        deliver: (_pid, events) => delivered.push(events),
      });
      expect(immediate).toEqual([
        expect.objectContaining({ type: 'aiThinking', durationMs: 800, pid }),
      ]);

      player.inCombat = true;
      await vi.advanceTimersByTimeAsync(6_000);

      expect(delivered).toEqual([]);
    } finally {
      service.stop();
      vi.useRealTimers();
    }
  });

  it('delivers validated provider dynamic text after the active thinking beat', async () => {
    const { sim, pid, npcId } = makeWorld();
    let seenContext: AiJobContextV1 | null = null;
    const provider: AiProvider = {
      async decide(context) {
        seenContext = context;
        return {
          decision: {
            schemaVersion: 1,
            jobId: context.jobId,
            entityRef: {
              kind: context.entity.kind,
              entityId: context.entity.entityId,
              templateId: context.entity.templateId,
            },
            ttlMs: 1_000,
            confidence: 0.9,
            speech: [{ mode: 'dynamicText', language: 'zh_CN', text: '不过，雨声贴着屋檐。' }],
            intents: [{ type: 'commentOnScene' }],
            audit: {
              shortReason: 'scene mood',
              usedPlayerInput: false,
              safetyNotes: ['presentationOnly'],
            },
          },
          providerTimings: { provider: 'test-provider', totalMs: 12, steps: [] },
        };
      },
    };
    const delivered: ReturnType<AiActiveTriggerService['tick']>[] = [];
    const service = new AiActiveTriggerService({
      provider,
      rules: [testRule({
        ruleId: 'test_provider_dynamic',
        providerPolicy: 'codexPreferred',
        outputMode: 'mixedLivingWorld',
      })],
    });

    const immediate = service.tick({
      sim,
      sessions: [{ pid, locale: 'zh_CN' }],
      nowMs: 1_000,
      deliver: (_pid, events) => delivered.push(events),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(immediate).toEqual([
      expect.objectContaining({ type: 'aiThinking', speakerId: npcId, pid }),
    ]);
    expect(seenContext).toMatchObject({
      locale: 'zh_CN',
      outputMode: 'mixed_living_world',
    });
    expect(delivered).toEqual([
      [
        expect.objectContaining({
          type: 'aiSpeech',
          speakerId: npcId,
          speech: expect.objectContaining({
            mode: 'dynamicText',
            language: 'zh_CN',
            text: '雨声贴着屋檐。',
          }),
          source: 'codex',
          pid,
        }),
      ],
    ]);
    expect(service.runtimeMetrics()).toMatchObject({
      activeProviderCalls: 1,
      activeProviderJobs: 1,
      activeProviderSuccesses: 1,
      activeProviderPending: 0,
    });
  });
});
