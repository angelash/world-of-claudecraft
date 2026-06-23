import { describe, expect, it, vi } from 'vitest';
import {
  AiActiveTriggerService,
  DEFAULT_ACTIVE_POLL_RULES,
  type AiActivePollRuleV1,
} from '../server/ai/active_triggers';
import { AiWorldDirectorStore } from '../server/ai/world_director';
import type { AiJobContextV1, AiProvider } from '../server/ai/ai_types';
import { individualProfileFor, type IndividualTrait } from '../server/ai/singularity';
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

function isolateNpcCandidate(sim: Sim, npcId: number): void {
  const target = sim.entities.get(npcId);
  if (!target) throw new Error('missing target npc');
  for (const entity of [...sim.entities.values()]) {
    if (entity.kind !== 'npc' || entity.id === npcId) continue;
    moveEntity(sim, entity.id, target.pos.x + 80 + entity.id, target.pos.z + 80 + entity.id);
  }
}

function isolateMobCandidate(sim: Sim, mobId: number): void {
  const target = sim.entities.get(mobId);
  if (!target) throw new Error('missing target mob');
  for (const entity of [...sim.entities.values()]) {
    if (entity.kind !== 'mob' || entity.id === mobId) continue;
    moveEntity(sim, entity.id, target.pos.x + 90 + entity.id, target.pos.z + 90 + entity.id);
  }
}

function singularityMobByTrait(sim: Sim, trait: IndividualTrait) {
  const entity = [...sim.entities.values()].find((candidate) => {
    if (candidate.kind !== 'mob') return false;
    const profile = individualProfileFor(candidate, sim.cfg.seed);
    return profile.tier === 'singularity' && profile.traits.includes(trait);
  });
  if (!entity) throw new Error(`missing singularity mob with ${trait}`);
  return entity;
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
    expect(service.diagnosticsSnapshot().runtime).toMatchObject({
      schedulerIntervalMs: 30_000,
      lastTickStartedAtMs: 1_000,
      lastTickSessionCount: 0,
      lastTickProducedEvents: 0,
      lastTickState: 'idle',
      lastTickSkipReason: 'no_online_players',
      queuedEventCount: 0,
      nextDueAtMs: 0,
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
    expect(service.diagnosticsSnapshot().runtime).toMatchObject({
      lastTickStartedAtMs: 1_000,
      lastTickSessionCount: 1,
      lastTickProducedEvents: 2,
      lastTickState: 'poll',
      lastTickSkipReason: '',
      queuedEventCount: 0,
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

  it('routes queued item events through dynamic provider speech on the live deliver path', async () => {
    const { sim, pid } = makeWorld();
    const player = sim.entities.get(pid);
    if (!player) throw new Error('missing player');
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
            speech: [{ mode: 'dynamicText', language: 'en', text: 'You dropped supper where ants can find it.' }],
            intents: [{ type: 'commentOnScene' }],
            audit: {
              shortReason: 'discarded food event',
              usedPlayerInput: false,
              safetyNotes: ['presentationOnly'],
            },
          },
        };
      },
    };
    const delivered: SimEvent[][] = [];
    const service = new AiActiveTriggerService({
      provider,
      rules: [testRule()],
      thinkingDurationMs: 700,
    });

    service.noteItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, nowMs: 1_000 });
    const immediate = service.tick({
      sim,
      sessions: [{ pid, locale: 'en' }],
      nowMs: 1_000,
      deliver: (_pid, events) => delivered.push(events),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(immediate).toEqual([
      expect.objectContaining({ type: 'aiThinking', durationMs: 700, pid }),
    ]);
    expect(seenContext).toMatchObject({
      trigger: 'active_event',
      outputMode: 'mixed_living_world',
      recentObservations: expect.arrayContaining([
        'event:item_discarded',
        'item:roasted_boar',
        'eventKind:item_discarded',
        'eventItem:roasted_boar',
        'fallbackLineId:hudChrome.aiSpeech.worldTraceNpcFood',
        'fallbackReaction:inspect',
        'fallbackTargetItem:roasted_boar',
      ]),
    });
    expect(delivered.flat()).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({
        mode: 'dynamicText',
        language: 'en',
        text: 'You dropped supper where ants can find it.',
      }),
      source: 'codex',
      pid,
    }));
    expect(service.diagnosticsSnapshot().eventQueue).toHaveLength(0);
    expect(service.runtimeMetrics()).toMatchObject({
      activeEventQueued: 1,
      activeEventFired: 1,
      activeProviderCalls: 1,
      activeProviderJobs: 1,
      activeProviderSuccesses: 1,
    });
  });

  it('turns world director proposals into proactive localized NPC echoes', () => {
    const { sim, pid } = makeWorld();
    const service = new AiActiveTriggerService({ rules: [testRule()] });
    const store = new AiWorldDirectorStore({ stateTtlSeconds: 60 });
    const state = store.noteQuestCompletion({
      sceneId: 'eastbrook_chapel',
      zoneId: 'eastbrook_vale',
      questId: 'q_wolves',
      sourcePlayerEntityId: pid,
      nowSeconds: sim.time,
    });
    const requests: unknown[] = [];

    service.noteWorldDirectorStates({ sim, states: [state], nowMs: 1_000 });
    expect(service.diagnosticsSnapshot().eventQueue).toContainEqual(expect.objectContaining({
      kind: 'world_director',
      questId: 'q_wolves',
      directorStateId: state.stateId,
      directorMood: 'relieved',
      directorIntent: 'echoQuestRelief',
      directorLineId: 'hudChrome.aiSpeech.worldDirectorQuestComplete',
      sceneId: 'eastbrook_chapel',
      zoneId: 'eastbrook_vale',
      observations: expect.arrayContaining(['event:world_director', 'proposal:echoQuestRelief']),
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
        lineId: 'hudChrome.aiSpeech.worldDirectorQuestComplete',
        values: expect.objectContaining({ questId: 'q_wolves', directorMood: 'relieved' }),
      }),
      reaction: expect.objectContaining({
        kind: 'inspect',
        planId: state.proposal.proposalId,
        planKind: 'echoQuestRelief',
        planIntensity: state.proposal.intensity,
        sceneTags: expect.arrayContaining(['proposal:echoQuestRelief', `directorState:${state.stateId}`]),
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

  it('passes world director proposals into dynamic active event provider context', async () => {
    const { sim, pid } = makeWorld();
    const store = new AiWorldDirectorStore({ stateTtlSeconds: 60 });
    const state = store.noteQuestCompletion({
      sceneId: 'eastbrook_chapel',
      zoneId: 'eastbrook_vale',
      questId: 'q_wolves',
      sourcePlayerEntityId: pid,
      nowSeconds: sim.time,
    });
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
            speech: [{ mode: 'dynamicText', language: 'en', text: 'The chapel road exhales after the wolf trouble.' }],
            intents: [{ type: 'commentOnScene' }],
            audit: {
              shortReason: 'director quest relief',
              usedPlayerInput: false,
              safetyNotes: ['presentationOnly'],
            },
          },
        };
      },
    };
    const delivered: SimEvent[][] = [];
    const service = new AiActiveTriggerService({
      provider,
      rules: [testRule()],
      thinkingDurationMs: 700,
    });

    service.noteWorldDirectorStates({ sim, states: [state], nowMs: 1_000 });
    const immediate = service.tick({
      sim,
      sessions: [{ pid, locale: 'en' }],
      nowMs: 1_000,
      deliver: (_pid, events) => delivered.push(events),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(immediate).toEqual([
      expect.objectContaining({ type: 'aiThinking', durationMs: 700, pid }),
    ]);
    expect(seenContext).toMatchObject({
      trigger: 'active_event',
      outputMode: 'mixed_living_world',
      directorProposals: [expect.objectContaining({
        proposalId: state.proposal.proposalId,
        intent: 'echoQuestRelief',
        suggestedLineId: 'hudChrome.aiSpeech.worldDirectorQuestComplete',
        reasonTags: expect.arrayContaining(['proposal:questEcho']),
      })],
      recentObservations: expect.arrayContaining([
        'event:world_director',
        'directorMood:relieved',
        'directorIntent:echoQuestRelief',
        'fallbackLineId:hudChrome.aiSpeech.worldDirectorQuestComplete',
        'fallbackPlanKind:echoQuestRelief',
      ]),
    });
    expect(delivered.flat()).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({
        mode: 'dynamicText',
        language: 'en',
      }),
      source: 'codex',
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeProviderCalls: 1,
      activeProviderJobs: 1,
      activeProviderSuccesses: 1,
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

  it('defaults NPC living routines to dynamic provider text with local fallback metadata', async () => {
    const rule = DEFAULT_ACTIVE_POLL_RULES.find((candidate) => candidate.ruleId === 'npc_living_routine');
    if (!rule) throw new Error('missing NPC living routine rule');
    expect(rule).toMatchObject({
      providerPolicy: 'codexAllowed',
      outputMode: 'dynamicTextFirst',
    });

    const { sim, pid, npcId } = makeWorld();
    sim.time = 12 * 60;
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
            speech: [{ mode: 'dynamicText', language: 'zh_CN', text: '不过，午饭点到了。' }],
            intents: [{ type: 'commentOnScene' }],
            audit: {
              shortReason: 'living routine',
              usedPlayerInput: false,
              safetyNotes: ['presentationOnly'],
            },
          },
        };
      },
    };
    const delivered: SimEvent[][] = [];
    const service = new AiActiveTriggerService({
      provider,
      rules: [rule],
      thinkingDurationMs: 700,
    });

    const immediate = service.tick({
      sim,
      sessions: [{ pid, locale: 'zh_CN' }],
      nowMs: 1_000,
      deliver: (_pid, events) => delivered.push(events),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(immediate).toEqual([
      expect.objectContaining({ type: 'aiThinking', speakerId: npcId, durationMs: 700, pid }),
    ]);
    expect(seenContext).toMatchObject({
      outputMode: 'dynamic_text_experiment',
      locale: 'zh_CN',
      recentObservations: expect.arrayContaining([
        'rule:npc_living_routine',
        'category:livingRoutine',
        'routine:eating',
        'routineLineId:hudChrome.aiSpeech.sceneDayEnergy',
      ]),
    });
    expect(delivered).toEqual([[
      expect.objectContaining({
        type: 'aiSpeech',
        speakerId: npcId,
        speech: expect.objectContaining({
          mode: 'dynamicText',
          language: 'zh_CN',
          text: '午饭点到了。',
        }),
        source: 'codex',
        pid,
      }),
    ]]);
    expect(service.runtimeMetrics()).toMatchObject({
      activeProviderCalls: 1,
      activeProviderJobs: 1,
      activeProviderSuccesses: 1,
      activeRoutineFired: 1,
      activeRoutineLastKind: 'eating',
    });
  });

  it('falls back to local NPC living routines when codex-allowed budget is exhausted', () => {
    const { sim, pid } = makeWorld();
    sim.time = 8 * 60;
    const provider = {
      decide: vi.fn(async () => {
        throw new Error('provider should not be called after budget denial');
      }),
    } satisfies AiProvider;
    const service = new AiActiveTriggerService({
      provider,
      codexMaxCalls5h: 1,
      codexMaxCallsWeek: 1,
      codexReserveRatio: 0,
      rules: [testRule({
        ruleId: 'test_living_budget_fallback',
        category: 'livingRoutine',
        providerPolicy: 'codexAllowed',
        outputMode: 'dynamicTextFirst',
      })],
    });
    const nowMs = Date.now();
    service.noteCodexProviderCall(nowMs - 100);

    const events = service.tick({
      sim,
      sessions: [{ pid, locale: 'zh_CN' }],
      nowMs,
      deliver: () => {
        throw new Error('local fallback should be returned synchronously');
      },
    });

    expect(provider.decide).not.toHaveBeenCalled();
    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }),
      source: 'local',
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeCodexBudgetDenied: 1,
      activeProviderCalls: 1,
      activeProviderJobs: 0,
      activePollDue: 1,
      activePollFired: 1,
    });
  });

  it('defers active provider calls shortly after player activity while keeping local life visible', () => {
    const { sim, pid } = makeWorld();
    sim.time = 8 * 60;
    const provider = {
      decide: vi.fn(async () => {
        throw new Error('active provider should yield to recent player activity');
      }),
    } satisfies AiProvider;
    const service = new AiActiveTriggerService({
      provider,
      rules: [testRule({
        ruleId: 'test_recent_activity_provider_defer',
        category: 'livingRoutine',
        providerPolicy: 'codexAllowed',
        outputMode: 'dynamicTextFirst',
      })],
    });

    const events = service.tick({
      sim,
      sessions: [{ pid, locale: 'zh_CN', lastActivityAt: 900 }],
      nowMs: 1_000,
      deliver: () => {
        throw new Error('recent activity should use synchronous local fallback');
      },
    });

    expect(provider.decide).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({ type: 'aiThinking', pid }),
      expect.objectContaining({
        type: 'aiSpeech',
        speech: expect.objectContaining({ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }),
        source: 'local',
        pid,
      }),
    ]);
    expect(service.runtimeMetrics()).toMatchObject({
      activeProviderCalls: 0,
      activeProviderJobs: 0,
      activePollFired: 1,
      activeRoutineFired: 1,
    });
  });

  it('marks daytime priest routine beats as praying with profile speech', () => {
    const { sim, pid } = makeWorld();
    sim.time = 8 * 60;
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_living_day', category: 'livingRoutine' })],
    });

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.brotherAldricAwake',
        values: expect.objectContaining({ playerName: 'Ari', speakerName: 'Brother Aldric' }),
      }),
      reaction: expect.objectContaining({ kind: 'inspect', planKind: 'praying' }),
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeRoutineFired: 1,
      activeRoutineLastKind: 'praying',
    });
  });

  it('varies named NPC daytime routines by living-world profile', () => {
    const cases: Array<[string, string, string]> = [
      ['the_merchant', 'trading', 'hudChrome.aiSpeech.merchantMarketPulse'],
      ['marshal_redbrook', 'patrolling', 'hudChrome.aiSpeech.marshalRedbrookAwake'],
      ['smith_haldren', 'forging', 'hudChrome.aiSpeech.genericNpcAwake'],
      ['fisherman_brandt', 'watchingWater', 'hudChrome.aiSpeech.fishermanBrandtAwake'],
      ['apothecary_lin', 'herbalism', 'hudChrome.aiSpeech.apothecaryLinAwake'],
      ['scout_maren', 'scouting', 'hudChrome.aiSpeech.genericNpcAwake'],
      ['loremaster_caddis', 'studying', 'hudChrome.aiSpeech.genericNpcAwake'],
    ];

    for (const [templateId, planKind, lineId] of cases) {
      const { sim, pid, npcId } = makeWorld(templateId);
      isolateNpcCandidate(sim, npcId);
      sim.time = 8 * 60;
      const service = new AiActiveTriggerService({
        rules: [testRule({ ruleId: `test_living_${templateId}`, category: 'livingRoutine' })],
      });

      const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

      expect(events, templateId).toContainEqual(expect.objectContaining({
        type: 'aiSpeech',
        speakerId: npcId,
        speech: expect.objectContaining({
          lineId,
          values: expect.objectContaining({ playerName: 'Ari' }),
        }),
        reaction: expect.objectContaining({ kind: 'inspect', planKind }),
        pid,
      }));
      expect(service.runtimeMetrics().activeRoutineLastKind, templateId).toBe(planKind);
    }
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
    const home = { ...npc.spawnPos };
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
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }),
      reaction: expect.objectContaining({ planKind: 'praying' }),
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

    for (let i = 0; i < 420; i++) sim.tick();
    expect(dist2d(npc.pos, home)).toBeLessThan(0.35);
    expect(npc.aiActiveMoveTarget).toBeNull();
    expect(npc.aiActiveReturningHome).toBe(false);
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
  });

  it('focuses herbalist routines on nearby semantic objects and steers motion toward them', () => {
    const { sim, pid, npcId } = makeWorld('apothecary_lin');
    isolateNpcCandidate(sim, npcId);
    sim.time = 8 * 60;
    const requests: unknown[] = [];
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_living_apothecary_focus', category: 'livingRoutine' })],
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

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: npcId,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.apothecaryLinAwake' }),
      reaction: expect.objectContaining({
        kind: 'inspect',
        planKind: 'herbalism',
        targetItemId: 'eastbrook_apothecary_bench',
        sceneTags: expect.arrayContaining(['focus:eastbrook_apothecary_bench', 'herb', 'sniffHerbs']),
      }),
      pid,
    }));
    expect(requests).toEqual([
      expect.objectContaining({
        kind: 'shortMove',
        npcId,
        playerId: pid,
        targetPos: expect.objectContaining({ x: 11, z: -3 }),
      }),
    ]);
    expect(service.runtimeMetrics()).toMatchObject({
      activeRoutineFired: 1,
      activeRoutineLastKind: 'herbalism',
      activeNpcActionsApplied: 1,
    });
  });

  it('focuses priest routines on shrine semantics when the shrine is nearby', () => {
    const { sim, pid, npcId } = makeWorld();
    isolateNpcCandidate(sim, npcId);
    sim.time = 8 * 60;
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_living_priest_focus', category: 'livingRoutine' })],
    });

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: npcId,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }),
      reaction: expect.objectContaining({
        kind: 'inspect',
        planKind: 'praying',
        targetItemId: 'eastbrook_wayside_shrine',
        sceneTags: expect.arrayContaining(['focus:eastbrook_wayside_shrine', 'prayerMemory', 'offerPrayer']),
      }),
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeRoutineFired: 1,
      activeRoutineLastKind: 'praying',
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
      reaction: expect.objectContaining({ kind: 'inspect', planKind: 'praying' }),
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeRoutineFired: 1,
      activeRoutineLastKind: 'praying',
    });
  });

  it('marks hidden-sky nighttime NPC routine beats as sleeping or tired using localized speech', () => {
    const { sim, pid, npcId } = makeWorld('the_merchant');
    isolateNpcCandidate(sim, npcId);
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
        planKind: 'keepDistanceFromFire',
        individualTier: expect.any(String),
        sceneTags: expect.arrayContaining(['family:beast', 'routine:keepDistanceFromFire', 'forge', 'workNoise']),
      }),
      source: 'local',
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activePollFired: 1,
      activeRoutineFired: 1,
      activeRoutineLastKind: 'creature:beast:keepDistanceFromFire:avoid',
    });
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
  });

  it('defaults creature routines to dynamic provider text with family semantics', async () => {
    const rule = DEFAULT_ACTIVE_POLL_RULES.find((candidate) => candidate.ruleId === 'creature_living_routine');
    if (!rule) throw new Error('missing creature living routine rule');
    expect(rule).toMatchObject({
      providerPolicy: 'codexAllowed',
      outputMode: 'dynamicTextFirst',
    });

    const { sim, pid } = makeWorld();
    const wolf = entityByTemplate(sim, 'forest_wolf');
    const individual = individualProfileFor(wolf, sim.cfg.seed);
    moveEntity(sim, wolf.id, 8, 17);
    moveEntity(sim, pid, 9, 17);
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
            speech: [{ mode: 'dynamicText', language: 'en', text: 'Sniffs once. Fire. Not safe.' }],
            intents: [{ type: 'commentOnScene' }],
            audit: {
              shortReason: 'creature routine',
              usedPlayerInput: false,
              safetyNotes: ['presentationOnly'],
            },
          },
        };
      },
    };
    const delivered: SimEvent[][] = [];
    const service = new AiActiveTriggerService({
      provider,
      rules: [rule],
      thinkingDurationMs: 650,
    });

    const immediate = service.tick({
      sim,
      sessions: [{ pid, locale: 'en' }],
      nowMs: 1_000,
      deliver: (_pid, events) => delivered.push(events),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(immediate).toEqual([
      expect.objectContaining({ type: 'aiThinking', speakerId: wolf.id, durationMs: 650, pid }),
    ]);
    expect(seenContext).toMatchObject({
      entity: expect.objectContaining({ kind: 'mob', templateId: 'forest_wolf' }),
      profile: expect.objectContaining({ profileId: 'mob.generic.living_world' }),
      familySemantics: expect.objectContaining({ family: 'beast', familyName: 'Beast' }),
      outputMode: 'dynamic_text_experiment',
      recentObservations: expect.arrayContaining([
        'rule:creature_living_routine',
        'category:creatureRoutine',
        'family:beast',
        `individualTier:${individual.tier}`,
        ...individual.traits.map((trait) => `individualTrait:${trait}`),
        'creatureRoutine:creature:beast:keepDistanceFromFire:avoid',
        'reaction:avoid',
        'planKind:keepDistanceFromFire',
      ]),
    });
    expect(delivered).toEqual([[
      expect.objectContaining({
        type: 'aiSpeech',
        speakerId: wolf.id,
        speech: expect.objectContaining({
          mode: 'dynamicText',
          language: 'en',
          text: 'Sniffs once.',
        }),
        source: 'codex',
        pid,
      }),
    ]]);
    expect(service.runtimeMetrics()).toMatchObject({
      activeProviderCalls: 1,
      activeProviderJobs: 1,
      activeProviderSuccesses: 1,
      activeRoutineFired: 1,
      activeRoutineLastKind: 'creature:beast:keepDistanceFromFire:avoid',
    });
  });

  it('lets singularity creatures surface active personal goals ahead of ordinary routines', () => {
    const { sim, pid } = makeWorld();
    sim.time = 23 * 60;
    const singularity = singularityMobByTrait(sim, 'stargazer');
    isolateMobCandidate(sim, singularity.id);
    moveEntity(sim, pid, singularity.pos.x + 1, singularity.pos.z);
    const before = mainlineSnapshot(sim, pid);
    const service = new AiActiveTriggerService({
      rules: [testRule({ ruleId: 'test_singularity_living', category: 'creatureRoutine' })],
    });

    const events = service.tick({ sim, sessions: [{ pid }], nowMs: 1_000 });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiThinking',
      speakerId: singularity.id,
      pid,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: singularity.id,
      speech: expect.objectContaining({
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.singularityRemembersScene',
        values: expect.objectContaining({
          playerName: 'Ari',
          speakerTemplateId: singularity.templateId,
          individualAlias: 'stargazer',
        }),
      }),
      reaction: expect.objectContaining({
        planKind: 'watchSky',
        individualTier: 'singularity',
        individualTraits: expect.arrayContaining(['stargazer']),
        sceneTags: expect.arrayContaining(['singularity:watchSky', 'trait:stargazer']),
      }),
      source: 'local',
      pid,
    }));
    expect(service.runtimeMetrics()).toMatchObject({
      activeRoutineFired: 1,
      activeRoutineLastKind: expect.stringContaining('singularity:watchSky'),
    });
    expect(mainlineSnapshot(sim, pid)).toEqual(before);
  });

  it('can apply a real server-authoritative creature flee action through the action bridge', () => {
    const { sim, pid } = makeWorld();
    const wolf = entityByTemplate(sim, 'forest_wolf');
    moveEntity(sim, wolf.id, 80, 86);
    isolateMobCandidate(sim, wolf.id);
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
    isolateMobCandidate(sim, wolf.id);
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
    expect(speech).toContainEqual(expect.objectContaining({
      speakerId: merchant.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.merchantMarketPulse',
        values: expect.objectContaining({ playerName: 'Ari', partnerName: expect.any(String) }),
      }),
      reaction: expect.objectContaining({
        targetItemId: 'eastbrook_market_stall',
        planKind: expect.stringMatching(/^conversation(Start|Reply)$/),
        sceneTags: expect.arrayContaining(['focus:eastbrook_market_stall', 'coin', 'watchCrowd']),
      }),
      pid,
    }));
    expect(speech).toContainEqual(expect.objectContaining({
      speakerId: marshal.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.marshalRedbrookAwake',
        values: expect.objectContaining({ playerName: 'Ari', partnerName: expect.any(String) }),
      }),
      reaction: expect.objectContaining({
        targetItemId: 'eastbrook_market_stall',
        planKind: expect.stringMatching(/^conversation(Start|Reply)$/),
        sceneTags: expect.arrayContaining(['focus:eastbrook_market_stall', 'coin', 'watchCrowd']),
      }),
      pid,
    }));
    expect(speech).toContainEqual(expect.objectContaining({
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

  it('defaults NPC social sequences to a dynamic provider opening beat', async () => {
    vi.useFakeTimers();
    const rule = DEFAULT_ACTIVE_POLL_RULES.find((candidate) => candidate.ruleId === 'npc_social_sequence');
    if (!rule) throw new Error('missing NPC social sequence rule');
    expect(rule).toMatchObject({
      providerPolicy: 'codexAllowed',
      outputMode: 'dynamicTextFirst',
    });

    const { sim, pid } = makeWorld();
    sim.time = 8 * 60;
    const merchant = entityByTemplate(sim, 'the_merchant');
    const marshal = entityByTemplate(sim, 'marshal_redbrook');
    moveEntity(sim, merchant.id, 9, 17);
    moveEntity(sim, marshal.id, 12, 17);
    moveEntity(sim, pid, 9, 18);
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
            speech: [{ mode: 'dynamicText', language: 'en', text: 'Coin sounds sharp tonight.' }],
            intents: [{ type: 'commentOnScene' }],
            audit: {
              shortReason: 'social opener',
              usedPlayerInput: false,
              safetyNotes: ['presentationOnly'],
            },
          },
        };
      },
    };
    const delivered: SimEvent[][] = [];
    const service = new AiActiveTriggerService({
      provider,
      thinkingDurationMs: 800,
      rules: [rule],
    });

    try {
      const immediate = service.tick({
        sim,
        sessions: [{ pid, locale: 'en' }],
        nowMs: 1_000,
        deliver: (_pid, events) => delivered.push(events),
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(immediate).toEqual([
        expect.objectContaining({ type: 'aiThinking', pid }),
      ]);
      expect(seenContext).toMatchObject({
        trigger: 'active_poll',
        outputMode: 'dynamic_text_experiment',
        recentObservations: expect.arrayContaining([
          'rule:npc_social_sequence',
          'category:socialSequence',
          'sequence:social',
          'focusObject:eastbrook_market_stall',
        ]),
      });
      expect(delivered.flat()).toContainEqual(expect.objectContaining({
        type: 'aiSpeech',
        speech: expect.objectContaining({
          mode: 'dynamicText',
          language: 'en',
          text: 'Coin sounds sharp tonight.',
        }),
        source: 'codex',
        pid,
      }));
      expect(delivered.flat()).toContainEqual(expect.objectContaining({
        type: 'aiThinking',
        pid,
      }));
      expect(service.runtimeMetrics()).toMatchObject({
        activeProviderCalls: 1,
        activeProviderJobs: 1,
        activeProviderSuccesses: 1,
        activeSequenceFired: 1,
        activeSequenceLastLength: 3,
      });
    } finally {
      service.stop();
      vi.useRealTimers();
    }
  });

  it('paces multiple provider social sequence lines across nearby participants', async () => {
    vi.useFakeTimers();
    const rule = DEFAULT_ACTIVE_POLL_RULES.find((candidate) => candidate.ruleId === 'npc_social_sequence');
    if (!rule) throw new Error('missing NPC social sequence rule');
    const { sim, pid } = makeWorld();
    sim.time = 8 * 60;
    const merchant = entityByTemplate(sim, 'the_merchant');
    const marshal = entityByTemplate(sim, 'marshal_redbrook');
    moveEntity(sim, merchant.id, 9, 17);
    moveEntity(sim, marshal.id, 12, 17);
    moveEntity(sim, pid, 9, 18);
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
            speech: [
              { mode: 'dynamicText', language: 'en', text: 'The market awning smells of wet rope.' },
              { mode: 'dynamicText', language: 'en', text: 'Keep the coins under the dry plank.' },
              { mode: 'dynamicText', language: 'en', text: 'The west road sounds busy already.' },
            ],
            intents: [{ type: 'commentOnScene' }],
            audit: {
              shortReason: 'social exchange',
              usedPlayerInput: false,
              safetyNotes: ['presentationOnly'],
            },
          },
        };
      },
    };
    const delivered: SimEvent[][] = [];
    const service = new AiActiveTriggerService({
      provider,
      thinkingDurationMs: 800,
      rules: [rule],
    });

    try {
      const immediate = service.tick({
        sim,
        sessions: [{ pid, locale: 'en' }],
        nowMs: 1_000,
        deliver: (_pid, events) => delivered.push(events),
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(immediate).toEqual([
        expect.objectContaining({ type: 'aiThinking', durationMs: 800, pid }),
      ]);
      const capturedContext = seenContext as AiJobContextV1 | null;
      if (!capturedContext) throw new Error('provider did not receive social sequence context');
      expect(capturedContext).toMatchObject({
        recentObservations: expect.arrayContaining(['sequence:social', expect.stringMatching(/^partnerName:/)]),
      });
      expect(delivered).toEqual([
        [
          expect.objectContaining({
            type: 'aiSpeech',
            speakerId: capturedContext.entity.entityId,
            speech: { mode: 'dynamicText', language: 'en', text: 'The market awning smells of wet rope.' },
            source: 'codex',
            reaction: expect.objectContaining({
              targetItemId: 'eastbrook_market_stall',
              planKind: 'conversationStart',
            }),
            pid,
          }),
        ],
      ]);
      expect(service.diagnosticsSnapshot().activeSequences).toEqual([
        expect.objectContaining({
          kind: 'npc',
          remainingBeats: 4,
          focusObjectId: 'eastbrook_market_stall',
        }),
      ]);

      await vi.advanceTimersByTimeAsync(800);
      expect(delivered[1]).toEqual([
        expect.objectContaining({ type: 'aiThinking', durationMs: 2_000, pid }),
      ]);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(delivered[2]).toEqual([
        expect.objectContaining({
          type: 'aiSpeech',
          speakerId: expect.any(Number),
          speech: { mode: 'dynamicText', language: 'en', text: 'Keep the coins under the dry plank.' },
          source: 'codex',
          reaction: expect.objectContaining({ planKind: 'conversationReply' }),
          pid,
        }),
      ]);
      const secondSpeech = delivered[2][0];
      if (secondSpeech.type !== 'aiSpeech') throw new Error('expected second provider speech');
      expect(secondSpeech.speakerId).not.toBe(capturedContext.entity.entityId);
    } finally {
      service.stop();
      vi.useRealTimers();
    }
  });

  it('uses the dynamic provider for wild creature social sequence openers', async () => {
    vi.useFakeTimers();
    const rule = DEFAULT_ACTIVE_POLL_RULES.find((candidate) => candidate.ruleId === 'npc_social_sequence');
    if (!rule) throw new Error('missing NPC social sequence rule');
    const { sim, pid } = makeWorld();
    for (const npc of [...sim.entities.values()].filter((entity) => entity.kind === 'npc')) {
      moveEntity(sim, npc.id, 320, 320);
    }
    const wolves = entitiesByTemplate(sim, 'forest_wolf').slice(0, 2);
    if (wolves.length < 2) throw new Error('missing wolf pair');
    moveEntity(sim, wolves[0].id, 8, 17);
    moveEntity(sim, wolves[1].id, 10, 17);
    moveEntity(sim, pid, 9, 18);
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
            speech: [{ mode: 'dynamicText', language: 'en', text: 'The pack hates this forge smoke.' }],
            intents: [{ type: 'commentOnScene' }],
            audit: {
              shortReason: 'creature social opener',
              usedPlayerInput: false,
              safetyNotes: ['presentationOnly'],
            },
          },
        };
      },
    };
    const delivered: SimEvent[][] = [];
    const service = new AiActiveTriggerService({
      provider,
      thinkingDurationMs: 800,
      rules: [rule],
    });

    try {
      const immediate = service.tick({
        sim,
        sessions: [{ pid, locale: 'en' }],
        nowMs: 1_000,
        deliver: (_pid, events) => delivered.push(events),
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(immediate).toEqual([
        expect.objectContaining({ type: 'aiThinking', speakerId: wolves[0].id, pid }),
      ]);
      expect(seenContext).toMatchObject({
        entity: expect.objectContaining({ kind: 'mob', templateId: 'forest_wolf' }),
        familySemantics: expect.objectContaining({ family: 'beast' }),
        recentObservations: expect.arrayContaining([
          'rule:npc_social_sequence',
          'category:socialSequence',
          'creature:forest_wolf',
          'family:beast',
          'sequence:social',
          'sequenceKind:creature',
          'sequenceFamily:beast',
          'partner:forest_wolf',
        ]),
      });
      expect(delivered.flat()).toContainEqual(expect.objectContaining({
        type: 'aiSpeech',
        speakerId: wolves[0].id,
        speech: expect.objectContaining({
          mode: 'dynamicText',
          language: 'en',
          text: 'The pack hates this forge smoke.',
        }),
        source: 'codex',
        pid,
      }));
      expect(delivered.flat()).toContainEqual(expect.objectContaining({
        type: 'aiThinking',
        speakerId: wolves[1].id,
        pid,
      }));
      expect(service.runtimeMetrics()).toMatchObject({
        activeProviderCalls: 1,
        activeProviderJobs: 1,
        activeProviderSuccesses: 1,
        activeSequenceFired: 1,
        activeSequenceLastLength: 2,
      });
    } finally {
      service.stop();
      vi.useRealTimers();
    }
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
      expect.objectContaining({
        kind: 'shortMove',
        npcId: speakerIds[0],
        playerId: pid,
        relation: 'sideStep',
        targetPos: expect.objectContaining({ x: 15, z: 14 }),
      }),
      expect.objectContaining({
        kind: 'shortMove',
        npcId: speakerIds[1],
        playerId: pid,
        relation: 'towardPlayer',
        targetPos: expect.objectContaining({ x: 15, z: 14 }),
      }),
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
          speakerNames: expect.arrayContaining([merchant.name, marshal.name]),
          focusObjectId: 'eastbrook_market_stall',
          focusObjectTemplateId: 'scene_anchor:eastbrook_market_stall',
          focusDisplayName: 'Market Stall',
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

  it('records provider rejection reasons when active dynamic speech falls back locally', async () => {
    const { sim, pid, npcId } = makeWorld();
    const provider: AiProvider = {
      async decide(context) {
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
            speech: [{ mode: 'dynamicText', language: 'en', text: 'Smell that, patient?' }],
            intents: [{ type: 'commentOnScene' }],
            audit: {
              shortReason: 'thin sensory question',
              usedPlayerInput: false,
              safetyNotes: ['presentationOnly'],
            },
          },
        };
      },
    };
    const delivered: ReturnType<AiActiveTriggerService['tick']>[] = [];
    const service = new AiActiveTriggerService({
      provider,
      rules: [testRule({
        ruleId: 'test_provider_rejection_reason',
        providerPolicy: 'codexPreferred',
        outputMode: 'mixedLivingWorld',
      })],
    });

    const immediate = service.tick({
      sim,
      sessions: [{ pid, locale: 'en' }],
      nowMs: 1_000,
      deliver: (_pid, events) => delivered.push(events),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(immediate).toEqual([
      expect.objectContaining({ type: 'aiThinking', speakerId: npcId, pid }),
    ]);
    expect(delivered).toEqual([[
      expect.objectContaining({
        type: 'aiSpeech',
        speakerId: npcId,
        speech: expect.objectContaining({ mode: 'lineId' }),
        source: 'local',
        pid,
      }),
    ]]);
    expect(service.runtimeMetrics()).toMatchObject({
      activeProviderCalls: 2,
      activeProviderJobs: 2,
      activeProviderSuccesses: 0,
      activeProviderRejected: 2,
      activeProviderFallbacks: 1,
      activeLastProviderResult: 'rejected',
      activeLastProviderReason: 'dynamic speech too thin',
      activeProviderPending: 0,
    });
  });

  it('retries rejected active provider speech with repair context before falling back', async () => {
    const { sim, pid, npcId } = makeWorld();
    const seenContexts: AiJobContextV1[] = [];
    const provider: AiProvider = {
      async decide(context) {
        seenContexts.push(context);
        if (seenContexts.length === 1) {
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
              speech: [{ mode: 'dynamicText', language: 'en', text: 'Smell that, patient?' }],
              intents: [{ type: 'commentOnScene' }],
              audit: {
                shortReason: 'thin sensory question',
                usedPlayerInput: false,
                safetyNotes: ['presentationOnly'],
              },
            },
          };
        }
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
            speech: [{ mode: 'dynamicText', language: 'en', text: 'The chapel bell shakes dust from the rafters.' }],
            intents: [{ type: 'commentOnScene' }],
            audit: {
              shortReason: 'repair with concrete scene hook',
              usedPlayerInput: false,
              safetyNotes: ['presentationOnly'],
            },
          },
        };
      },
    };
    const delivered: ReturnType<AiActiveTriggerService['tick']>[] = [];
    const service = new AiActiveTriggerService({
      provider,
      rules: [testRule({
        ruleId: 'test_provider_repair_success',
        providerPolicy: 'codexPreferred',
        outputMode: 'mixedLivingWorld',
      })],
    });

    const immediate = service.tick({
      sim,
      sessions: [{ pid, locale: 'en' }],
      nowMs: 1_000,
      deliver: (_pid, events) => delivered.push(events),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(immediate).toEqual([
      expect.objectContaining({ type: 'aiThinking', speakerId: npcId, pid }),
    ]);
    expect(seenContexts).toHaveLength(2);
    const firstContext = seenContexts[0];
    if (!firstContext) throw new Error('missing first provider context');
    const repairContext = seenContexts[1];
    if (!repairContext) throw new Error('missing repair provider context');
    expect(repairContext.jobId).toBe(`${firstContext.jobId}-repair`);
    expect(repairContext.recentObservations.slice(0, 3)).toEqual([
      'providerRejected:dynamic speech too thin',
      'providerRepair:writeOneConcreteGroundedLine',
      'providerRepair:avoidVagueSensoryQuestions',
    ]);
    expect(delivered).toEqual([[
      expect.objectContaining({
        type: 'aiSpeech',
        speakerId: npcId,
        speech: expect.objectContaining({
          mode: 'dynamicText',
          language: 'en',
          text: 'Shakes dust from the rafters.',
        }),
        source: 'codex',
        pid,
      }),
    ]]);
    expect(service.runtimeMetrics()).toMatchObject({
      activeProviderCalls: 2,
      activeProviderJobs: 2,
      activeProviderSuccesses: 1,
      activeProviderRejected: 1,
      activeProviderFallbacks: 0,
      activeLastProviderResult: 'success',
      activeLastProviderReason: '',
      activeProviderPending: 0,
    });
  });
});
