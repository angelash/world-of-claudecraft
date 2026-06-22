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

    try {
      server.start();
      await vi.advanceTimersByTimeAsync(AI_ACTIVE_TRIGGER_INTERVAL_MS);
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
  });
});
