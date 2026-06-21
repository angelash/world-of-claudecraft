import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { GameServer, type ClientSession } from '../server/game';
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

function joinServer(server: GameServer, fc: FakeClient): ClientSession {
  const session = server.join(fc.ws as any, 1, 1, 'Ari', 'warrior', null);
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return session;
}

function teleportNear(server: GameServer, pid: number, targetId: number): void {
  const player = server.sim.entities.get(pid)!;
  const target = server.sim.entities.get(targetId)!;
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
    .filter((ev: any) => ev.type === type);
}

async function flushAi(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('server AI interact command', () => {
  const originalExperiment = process.env.AI_LIVING_WORLD_EXPERIMENT;

  beforeEach(() => {
    process.env.AI_LIVING_WORLD_EXPERIMENT = '1';
  });

  afterEach(() => {
    if (originalExperiment === undefined) delete process.env.AI_LIVING_WORLD_EXPERIMENT;
    else process.env.AI_LIVING_WORLD_EXPERIMENT = originalExperiment;
  });

  it('emits a personal aiSpeech event for a nearby NPC without changing quest state', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric');
    expect(npc).toBeTruthy();
    teleportNear(server, session.pid, npc!.id);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc!.id, locale: 'en' }));
    await flushAi();

    const aiEvents = eventsOf(fc, 'aiSpeech');
    expect(aiEvents).toHaveLength(1);
    expect(aiEvents[0]).toMatchObject({
      speakerId: npc!.id,
      speakerName: 'Brother Aldric',
      speech: { mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' },
      pid: session.pid,
    });
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('rate-limits repeated AI interactions so gossip spam does not call the life layer repeatedly', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
    teleportNear(server, session.pid, npc.id);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toHaveLength(1);
  });

  it('does nothing when the experiment flag is disabled', async () => {
    delete process.env.AI_LIVING_WORLD_EXPERIMENT;
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
    teleportNear(server, session.pid, npc.id);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toHaveLength(0);
  });

  it('turns a discarded item into a local scene-interest reaction without leaving loot behind', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const wolf = [...server.sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf');
    expect(wolf).toBeTruthy();
    teleportNear(server, session.pid, wolf!.id);
    server.sim.addItem('roasted_boar', 1, session.pid);
    const beforeObjects = [...server.sim.entities.values()].filter((entity) => entity.kind === 'object' && entity.objectItemId === 'roasted_boar').length;

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'roasted_boar', count: 1 }));
    await flushAi();

    const aiEvents = eventsOf(fc, 'aiSpeech');
    expect(aiEvents.some((event) => event.speakerId === wolf!.id && event.speech.lineId === 'hudChrome.aiSpeech.itemInterestApproach')).toBe(true);
    expect(aiEvents.find((event) => event.speakerId === wolf!.id)?.reaction).toMatchObject({
      kind: 'approach',
      targetItemId: 'roasted_boar',
    });
    const afterObjects = [...server.sim.entities.values()].filter((entity) => entity.kind === 'object' && entity.objectItemId === 'roasted_boar').length;
    expect(afterObjects).toBe(beforeObjects);
    expect(server.sim.countItem('roasted_boar', session.pid)).toBe(0);
  });
});
