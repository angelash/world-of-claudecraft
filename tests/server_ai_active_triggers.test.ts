import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  loadMarketState: vi.fn(async () => ({ listings: [], collections: new Map() })),
  saveMarketState: vi.fn(async () => {}),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  revokeAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  walletForAccount: vi.fn(async () => null),
}));

import { AI_ACTIVE_TRIGGER_INTERVAL_MS, GameServer, type ClientSession } from '../server/game';
import {
  AiActiveTriggerService,
  type AiActivePollRuleV1,
} from '../server/ai/active_triggers';
import { dist2d } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

interface FakeClient {
  sent: unknown[];
  ws: { readyState: number; send: (payload: string) => void };
}

function fakeWs(): FakeClient {
  const sent: unknown[] = [];
  return {
    sent,
    ws: {
      readyState: 1,
      send: (payload: string) => sent.push(JSON.parse(payload)),
    },
  };
}

function activeRule(): AiActivePollRuleV1 {
  return {
    ruleId: 'server_active_scene_ambient',
    title: 'Server active scene ambient',
    enabled: true,
    category: 'sceneAmbient',
    periodSeconds: 60,
    jitterSeconds: 0,
    priority: 100,
    scope: 'playerVicinity',
    providerPolicy: 'localOnly',
    outputMode: 'lineIdOnly',
    cooldown: {
      perPlayerSeconds: 90,
      perEntitySeconds: 180,
      perRuleSeconds: 10,
    },
  };
}

function activeCreatureRule(): AiActivePollRuleV1 {
  return {
    ...activeRule(),
    ruleId: 'server_active_creature_routine',
    title: 'Server active creature routine',
    category: 'creatureRoutine',
    cooldown: {
      perPlayerSeconds: 90,
      perEntitySeconds: 180,
      perRuleSeconds: 10,
    },
  };
}

function activeLivingRule(): AiActivePollRuleV1 {
  return {
    ...activeRule(),
    ruleId: 'server_active_npc_living',
    title: 'Server active NPC living',
    category: 'livingRoutine',
  };
}

function activeSocialSequenceRule(): AiActivePollRuleV1 {
  return {
    ...activeRule(),
    ruleId: 'server_active_social_sequence',
    title: 'Server active social sequence',
    category: 'socialSequence',
  };
}

function joinServer(server: GameServer, fc: FakeClient): ClientSession {
  const session = server.join(fc.ws as any, 1, 1, 'Ari', 'warrior', null);
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return session;
}

function installActiveTriggers(server: GameServer): AiActiveTriggerService {
  const service = new AiActiveTriggerService({
    rules: [activeRule()],
    thinkingDurationMs: 1_400,
  });
  (server as any).aiActiveTriggers = service;
  return service;
}

function teleportNear(server: GameServer, pid: number, targetId: number): void {
  const player = server.sim.entities.get(pid);
  const target = server.sim.entities.get(targetId);
  if (!player || !target) throw new Error('missing teleport entity');
  player.pos.x = target.pos.x + 1;
  player.pos.z = target.pos.z;
  player.pos.y = groundHeight(player.pos.x, player.pos.z, server.sim.cfg.seed);
  player.prevPos = { ...player.pos };
  server.sim.grid.update(player);
  server.sim.playerGrid.update(player);
}

function moveServerEntity(server: GameServer, entityId: number, x: number, z: number): void {
  const entity = server.sim.entities.get(entityId);
  if (!entity) throw new Error('missing move entity');
  entity.pos.x = x;
  entity.pos.z = z;
  entity.pos.y = groundHeight(entity.pos.x, entity.pos.z, server.sim.cfg.seed);
  entity.prevPos = { ...entity.pos };
  server.sim.grid.update(entity);
  if (entity.kind === 'player') server.sim.playerGrid.update(entity);
}

function eventsOf(fc: FakeClient, type: string): any[] {
  return fc.sent
    .flatMap((msg: any) => (msg.t === 'events' ? msg.list : []))
    .filter((event: any) => event.type === type);
}

function mainlineSnapshot(server: GameServer, pid: number): unknown {
  const meta = server.sim.meta(pid);
  const player = server.sim.entities.get(pid);
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

describe('server AI active triggers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs from the persistent server scheduler and routes thinking before ambient speech', async () => {
    vi.useFakeTimers();
    const server = new GameServer();
    installActiveTriggers(server);
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric');
    if (!npc) throw new Error('missing Brother Aldric');
    teleportNear(server, session.pid, npc.id);
    const before = mainlineSnapshot(server, session.pid);
    fc.sent.length = 0;
    let runtimeBeforeStop: ReturnType<GameServer['aiActiveTriggerDiagnostics']>['runtime'] | null = null;

    try {
      server.start();
      await vi.advanceTimersByTimeAsync(AI_ACTIVE_TRIGGER_INTERVAL_MS);
      runtimeBeforeStop = server.aiActiveTriggerDiagnostics().runtime;
    } finally {
      server.stop();
    }

    expect(eventsOf(fc, 'aiThinking')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      speakerName: npc.name,
      durationMs: 1_400,
      pid: session.pid,
    }));
    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      speakerName: npc.name,
      speech: expect.objectContaining({ mode: 'lineId' }),
      source: 'local',
      pid: session.pid,
    }));
    expect(server.aiActiveTriggerMetrics()).toMatchObject({
      activePollDue: 1,
      activePollFired: 1,
      activeProviderCalls: 0,
    });
    expect(runtimeBeforeStop).toMatchObject({
      schedulerIntervalMs: AI_ACTIVE_TRIGGER_INTERVAL_MS,
      lastTickSessionCount: 1,
      lastTickProducedEvents: 2,
      lastTickState: 'poll',
      lastTickSkipReason: '',
      queuedEventCount: 0,
    });
    expect(mainlineSnapshot(server, session.pid)).toEqual(before);
  });

  it('does not route active AI speech when active polling is disabled', () => {
    const server = new GameServer();
    const service = new AiActiveTriggerService({
      pollsEnabled: false,
      rules: [activeRule()],
    });
    (server as any).aiActiveTriggers = service;
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric');
    if (!npc) throw new Error('missing Brother Aldric');
    teleportNear(server, session.pid, npc.id);
    fc.sent.length = 0;

    (server as any).runAiActiveTriggers(1_000);

    expect(eventsOf(fc, 'aiThinking')).toHaveLength(0);
    expect(eventsOf(fc, 'aiSpeech')).toHaveLength(0);
    expect(server.aiActiveTriggerMetrics()).toMatchObject({
      activePollSkipped: 1,
      activeLastSkipReason: 'polls_disabled',
    });
    expect(server.aiActiveTriggerDiagnostics().runtime).toMatchObject({
      schedulerIntervalMs: AI_ACTIVE_TRIGGER_INTERVAL_MS,
      lastTickSessionCount: 1,
      lastTickProducedEvents: 0,
      lastTickState: 'idle',
      lastTickSkipReason: 'polls_disabled',
    });
  });

  it('queues player item-discard events for the active scheduler without restoring the item', () => {
    const server = new GameServer();
    installActiveTriggers(server);
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric');
    if (!npc) throw new Error('missing Brother Aldric');
    teleportNear(server, session.pid, npc.id);
    server.sim.addItem('roasted_boar', 1, session.pid);
    fc.sent.length = 0;

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'roasted_boar', count: 1 }));
    const [queued] = server.aiActiveTriggerDiagnostics().eventQueue;
    expect(queued).toEqual(expect.objectContaining({
      kind: 'item_discarded',
      itemId: 'roasted_boar',
      playerEntityId: session.pid,
    }));

    (server as any).runAiActiveTriggers(queued.nextAttemptAtMs);

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldTraceNpcFood',
        values: expect.objectContaining({ itemId: 'roasted_boar' }),
      }),
      source: 'local',
      pid: session.pid,
    }));
    expect(npc.aiActiveMoveTarget).not.toBeNull();
    expect(server.sim.countItem('roasted_boar', session.pid)).toBe(0);
    expect(server.aiActiveTriggerDiagnostics().eventQueue).toContainEqual(expect.objectContaining({
      kind: 'world_director',
      itemId: 'roasted_boar',
      directorIntent: 'echoTrace',
    }));
    expect(server.aiActiveTriggerMetrics()).toMatchObject({
      activeEventQueued: 2,
      activeEventFired: 1,
      activeActionsAttempted: 1,
      activeActionsApplied: 1,
      activeNpcActionsApplied: 1,
    });
  });

  it('bridges world director states into active speech on the live scheduler path', () => {
    const server = new GameServer();
    const service = new AiActiveTriggerService({
      pollsEnabled: false,
      rules: [activeRule()],
      thinkingDurationMs: 800,
    });
    (server as any).aiActiveTriggers = service;
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric');
    if (!npc) throw new Error('missing Brother Aldric');
    teleportNear(server, session.pid, npc.id);
    const before = mainlineSnapshot(server, session.pid);
    fc.sent.length = 0;

    (server as any).aiLifeLayer.handleSimEvents({
      sim: server.sim,
      events: [{ type: 'questDone', questId: 'q_wolves', pid: session.pid }],
    });
    expect(server.aiLifeLayerDiagnostics().worldDirectorStates).toContainEqual(expect.objectContaining({
      lineId: 'hudChrome.aiSpeech.worldDirectorQuestComplete',
      proposal: expect.objectContaining({ intent: 'echoQuestRelief' }),
    }));

    (server as any).runAiActiveTriggers(1_000);

    expect(eventsOf(fc, 'aiThinking')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      durationMs: 800,
      pid: session.pid,
    }));
    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldDirectorQuestComplete',
        values: expect.objectContaining({ questId: 'q_wolves', directorMood: 'relieved' }),
      }),
      reaction: expect.objectContaining({
        planKind: 'echoQuestRelief',
      }),
      source: 'local',
      pid: session.pid,
    }));
    expect(server.aiActiveTriggerDiagnostics().eventQueue).toHaveLength(0);
    expect(server.aiActiveTriggerMetrics()).toMatchObject({
      activeEventQueued: 1,
      activeEventFired: 1,
      activePollDue: 0,
    });
    expect(mainlineSnapshot(server, session.pid)).toEqual(before);
  });

  it('keeps mainline quest, inventory, money, and XP stable across active world passes', () => {
    const server = new GameServer();
    const service = new AiActiveTriggerService({
      rules: [activeRule(), activeLivingRule(), activeCreatureRule()],
      thinkingDurationMs: 650,
    });
    (server as any).aiActiveTriggers = service;
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric');
    if (!npc) throw new Error('missing Brother Aldric');
    teleportNear(server, session.pid, npc.id);
    const before = mainlineSnapshot(server, session.pid);
    fc.sent.length = 0;

    (server as any).aiLifeLayer.handleSimEvents({
      sim: server.sim,
      events: [{ type: 'questDone', questId: 'q_wolves', pid: session.pid }],
    });
    for (let i = 0; i < 8; i++) {
      (server as any).runAiActiveTriggers(1_000 + i * AI_ACTIVE_TRIGGER_INTERVAL_MS);
      for (let tick = 0; tick < 20; tick++) server.sim.tick();
    }

    expect(eventsOf(fc, 'aiSpeech').length).toBeGreaterThan(0);
    expect(server.aiActiveTriggerMetrics().activeEventFired + server.aiActiveTriggerMetrics().activePollFired).toBeGreaterThan(0);
    expect(mainlineSnapshot(server, session.pid)).toEqual(before);
  });

  it('applies active creature actions through the live server scheduler path', () => {
    const server = new GameServer();
    const service = new AiActiveTriggerService({
      rules: [activeCreatureRule()],
      thinkingDurationMs: 900,
    });
    (server as any).aiActiveTriggers = service;
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const wolf = [...server.sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf');
    if (!wolf) throw new Error('missing forest wolf');
    moveServerEntity(server, wolf.id, 80, 86);
    teleportNear(server, session.pid, wolf.id);
    const before = mainlineSnapshot(server, session.pid);
    fc.sent.length = 0;

    (server as any).runAiActiveTriggers(1_000);

    expect(eventsOf(fc, 'aiThinking')).toContainEqual(expect.objectContaining({
      speakerId: wolf.id,
      durationMs: 900,
      pid: session.pid,
    }));
    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: wolf.id,
      reaction: expect.objectContaining({ kind: 'avoid' }),
      pid: session.pid,
    }));
    expect(wolf.aiState).toBe('flee');
    expect(wolf.aggroTargetId).toBe(session.pid);
    expect(wolf.inCombat).toBe(true);
    expect(mainlineSnapshot(server, session.pid)).toEqual(before);
  });

  it('applies active NPC micro movement through the live server scheduler path', () => {
    const server = new GameServer();
    const service = new AiActiveTriggerService({
      rules: [activeLivingRule()],
      thinkingDurationMs: 700,
    });
    (server as any).aiActiveTriggers = service;
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric');
    if (!npc) throw new Error('missing Brother Aldric');
    server.sim.time = 8 * 60;
    teleportNear(server, session.pid, npc.id);
    const home = { ...npc.spawnPos };
    const before = mainlineSnapshot(server, session.pid);
    fc.sent.length = 0;

    (server as any).runAiActiveTriggers(1_000);

    expect(eventsOf(fc, 'aiThinking')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      durationMs: 700,
      pid: session.pid,
    }));
    expect(npc.aiActiveMoveTarget).not.toBeNull();

    for (let i = 0; i < 40; i++) server.sim.tick();
    expect(dist2d(npc.pos, home)).toBeGreaterThan(0.3);
    expect(dist2d(npc.pos, home)).toBeLessThanOrEqual(3.05);
    for (let i = 0; i < 420; i++) server.sim.tick();
    expect(dist2d(npc.pos, home)).toBeLessThan(0.35);
    expect(npc.aiActiveMoveTarget).toBeNull();
    expect(mainlineSnapshot(server, session.pid)).toEqual(before);
  });

  it('routes semantic-object-focused NPC routines through the live scheduler path', () => {
    const server = new GameServer();
    const service = new AiActiveTriggerService({
      rules: [activeLivingRule()],
      thinkingDurationMs: 700,
    });
    (server as any).aiActiveTriggers = service;
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'apothecary_lin');
    if (!npc) throw new Error('missing Apothecary Lin');
    server.sim.time = 8 * 60;
    teleportNear(server, session.pid, npc.id);
    const before = mainlineSnapshot(server, session.pid);
    fc.sent.length = 0;

    (server as any).runAiActiveTriggers(1_000);

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.apothecaryLinAwake' }),
      reaction: expect.objectContaining({
        planKind: 'herbalism',
        targetItemId: 'eastbrook_apothecary_bench',
        sceneTags: expect.arrayContaining(['focus:eastbrook_apothecary_bench', 'herb', 'sniffHerbs']),
      }),
      pid: session.pid,
    }));
    expect(npc.aiActiveMoveTarget).not.toBeNull();
    expect(dist2d(npc.aiActiveMoveTarget!, { x: 11, y: npc.pos.y, z: -3 })).toBeLessThanOrEqual(2.1);
    expect(mainlineSnapshot(server, session.pid)).toEqual(before);
  });

  it('routes object-focused NPC social sequences through the live server scheduler path', async () => {
    vi.useFakeTimers();
    const server = new GameServer();
    const service = new AiActiveTriggerService({
      rules: [activeSocialSequenceRule()],
      thinkingDurationMs: 800,
    });
    (server as any).aiActiveTriggers = service;
    const fc = fakeWs();
    const session = joinServer(server, fc);
    server.sim.time = 8 * 60;
    const merchant = [...server.sim.entities.values()].find((entity) => entity.templateId === 'the_merchant');
    const marshal = [...server.sim.entities.values()].find((entity) => entity.templateId === 'marshal_redbrook');
    if (!merchant || !marshal) throw new Error('missing social sequence NPCs');
    moveServerEntity(server, merchant.id, 9, 17);
    moveServerEntity(server, marshal.id, 12, 17);
    moveServerEntity(server, session.pid, 9, 18);
    const before = mainlineSnapshot(server, session.pid);
    fc.sent.length = 0;

    try {
      (server as any).runAiActiveTriggers(1_000);

      expect(eventsOf(fc, 'aiThinking')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(3_700);

      expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
        speakerId: merchant.id,
        speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.merchantMarketPulse' }),
        reaction: expect.objectContaining({
          targetItemId: 'eastbrook_market_stall',
          sceneTags: expect.arrayContaining(['focus:eastbrook_market_stall', 'coin', 'watchCrowd']),
        }),
        pid: session.pid,
      }));
      expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
        speakerId: marshal.id,
        speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.marshalRedbrookAwake' }),
        reaction: expect.objectContaining({
          targetItemId: 'eastbrook_market_stall',
          sceneTags: expect.arrayContaining(['focus:eastbrook_market_stall', 'coin', 'watchCrowd']),
        }),
        pid: session.pid,
      }));
      expect(merchant.aiActiveMoveTarget).not.toBeNull();
      expect(marshal.aiActiveMoveTarget).not.toBeNull();
      expect(server.aiActiveTriggerMetrics()).toMatchObject({
        activeSequenceFired: 1,
        activeActionsAttempted: 2,
        activeActionsApplied: 2,
        activeNpcActionsApplied: 2,
      });
      expect(mainlineSnapshot(server, session.pid)).toEqual(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
