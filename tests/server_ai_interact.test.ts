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

  it('allows an explicit NPC question after the greeting but rate-limits question spam', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
    teleportNear(server, session.pid, npc.id);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en', topic: 'place' }));
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en', topic: 'place' }));
    await flushAi();

    const placeReplies = eventsOf(fc, 'aiSpeech').filter((event) => event.speech.lineId === 'hudChrome.aiSpeech.topicPlace');
    expect(placeReplies).toHaveLength(1);
  });

  it('falls back to greeting behavior for invalid AI question topics', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
    teleportNear(server, session.pid, npc.id);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en', topic: 'unsafe_topic' }));
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en', topic: 'place' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech').some((event) => event.speech.lineId === 'hudChrome.aiSpeech.topicPlace')).toBe(true);
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

  it('inspects a nearby ground object without picking it up or changing quest state', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const object = [...server.sim.entities.values()].find((entity) => entity.kind === 'object' && entity.objectItemId === 'gravecaller_sigil');
    expect(object).toBeTruthy();
    teleportNear(server, session.pid, object!.id);
    const beforeObjects = [...server.sim.entities.values()].filter((entity) => entity.kind === 'object' && entity.objectItemId === 'gravecaller_sigil').length;
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_object', object: object!.id, locale: 'en' }));
    await flushAi();

    const aiEvents = eventsOf(fc, 'aiSpeech');
    expect(aiEvents).toContainEqual(expect.objectContaining({
      speakerId: object!.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.objectInspectGrave' }),
      reaction: expect.objectContaining({
        kind: 'inspect',
        targetItemId: 'gravecaller_sigil',
        targetObjectId: object!.id,
      }),
      pid: session.pid,
    }));
    const afterObjects = [...server.sim.entities.values()].filter((entity) => entity.kind === 'object' && entity.objectItemId === 'gravecaller_sigil').length;
    expect(afterObjects).toBe(beforeObjects);
    expect(server.sim.countItem('gravecaller_sigil', session.pid)).toBe(0);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('inspects a dungeon door without entering the instance', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const door = [...server.sim.entities.values()].find((entity) => entity.kind === 'object' && entity.templateId === 'dungeon_door' && entity.dungeonId === 'hollow_crypt');
    expect(door).toBeTruthy();
    teleportNear(server, session.pid, door!.id);
    const player = server.sim.entities.get(session.pid)!;
    const beforePos = { ...player.pos };

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_object', object: door!.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: door!.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.objectInspectDoor' }),
      reaction: expect.objectContaining({ kind: 'inspect', targetObjectId: door!.id }),
      pid: session.pid,
    }));
    expect(server.sim.entities.get(session.pid)!.pos.x).toBe(beforePos.x);
    expect(server.sim.entities.get(session.pid)!.pos.z).toBe(beforePos.z);
    expect(server.sim.instanceSlotAt(server.sim.entities.get(session.pid)!.pos)).toBe(null);
  });

  it('rate-limits repeated object inspection', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const object = [...server.sim.entities.values()].find((entity) => entity.kind === 'object' && entity.objectItemId === 'gravecaller_sigil')!;
    teleportNear(server, session.pid, object.id);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_object', object: object.id, locale: 'en' }));
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_object', object: object.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech').filter((event) => event.speech.lineId === 'hudChrome.aiSpeech.objectInspectGrave')).toHaveLength(1);
  });

  it('turns inspected objects into nearby reactions and short-term NPC rumors', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const object = [...server.sim.entities.values()].find((entity) => entity.kind === 'object' && entity.objectItemId === 'gravecaller_sigil')!;
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
    npc.pos.x = object.pos.x + 2;
    npc.pos.z = object.pos.z;
    npc.pos.y = groundHeight(npc.pos.x, npc.pos.z, server.sim.cfg.seed);
    npc.prevPos = { ...npc.pos };
    server.sim.grid.update(npc);
    teleportNear(server, session.pid, object.id);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_object', object: object.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech').some((event) =>
      event.speakerId !== object.id
      && event.pid === session.pid
      && /^hudChrome\.aiSpeech\.(itemInterest|singularity)(Approach|Avoid|Inspect)$/.test(event.speech.lineId)
      && event.reaction?.targetItemId === 'gravecaller_sigil'
      && event.reaction?.targetObjectId === object.id,
    )).toBe(true);

    teleportNear(server, session.pid, npc.id);
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.memoryPriestRumorEcho' }),
      pid: session.pid,
    }));
  });

  it('lets a non-undead companion react fearfully while inspecting an undead scene object', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const object = [...server.sim.entities.values()].find((entity) => entity.kind === 'object' && entity.objectItemId === 'gravecaller_sigil')!;
    const companion = [...server.sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf')!;
    companion.ownerId = session.pid;
    companion.pos.x = object.pos.x + 1;
    companion.pos.z = object.pos.z + 1;
    companion.pos.y = groundHeight(companion.pos.x, companion.pos.z, server.sim.cfg.seed);
    companion.prevPos = { ...companion.pos };
    server.sim.grid.update(companion);
    teleportNear(server, session.pid, object.id);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_object', object: object.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: companion.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.companionSelfUndeadFear' }),
      reaction: expect.objectContaining({ kind: 'avoid' }),
      pid: session.pid,
    }));
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

  it('adds a scene-awareness line when an NPC is interacted with in a death-pressure area', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
    npc.pos.x = 80;
    npc.pos.z = 86;
    npc.pos.y = groundHeight(npc.pos.x, npc.pos.z, server.sim.cfg.seed);
    npc.prevPos = { ...npc.pos };
    server.sim.grid.update(npc);
    teleportNear(server, session.pid, npc.id);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech').some((event) => event.speech.lineId === 'hudChrome.aiSpeech.sceneUndeadPressure')).toBe(true);
  });

  it('remembers repeated NPC interactions after the AI cooldown passes', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
    teleportNear(server, session.pid, npc.id);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();
    for (let i = 0; i < 4 * 20 + 1; i++) server.sim.tick();
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech').some((event) => event.speech.lineId === 'hudChrome.aiSpeech.memoryPriestRecognizesPlayer')).toBe(true);
  });

  it('turns discarded item traces into short-term same-scene rumors', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'smith_haldren')!;
    teleportNear(server, session.pid, npc.id);
    server.sim.addItem('redbrook_blade', 1, session.pid);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'redbrook_blade', count: 1 }));
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech').some((event) => event.speech.lineId === 'hudChrome.aiSpeech.memorySmithRumorEcho')).toBe(true);
  });

  it('lets discarded item rumors expire before later NPC interactions', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'smith_haldren')!;
    teleportNear(server, session.pid, npc.id);
    server.sim.addItem('redbrook_blade', 1, session.pid);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'redbrook_blade', count: 1 }));
    for (let i = 0; i < 91 * 20; i++) server.sim.tick();
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech').some((event) => event.speech.lineId === 'hudChrome.aiSpeech.memorySmithRumorEcho')).toBe(false);
  });
});
