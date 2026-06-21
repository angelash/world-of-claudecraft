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
import { pool } from '../server/db';
import { AiLifeLayer } from '../server/ai/life_layer';
import type { AiDecisionV1, AiProvider } from '../server/ai/ai_types';
import { individualProfileFor } from '../server/ai/singularity';
import type { Entity } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

interface FakeClient {
  sent: unknown[];
  ws: { readyState: number; send: (payload: string) => void };
}

interface PoolQueryMock {
  mock: { calls: Array<[unknown, ...unknown[]]> };
  mockClear(): void;
  mockImplementation(fn: (sql: unknown, values?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>): void;
  mockResolvedValue(value: { rows: Array<Record<string, unknown>>; rowCount?: number | null }): void;
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

function dbQueryMock(): PoolQueryMock {
  return pool.query as unknown as PoolQueryMock;
}

function routeSimEventsThroughAi(server: GameServer, events: any[]): any[] {
  const aiEvents = (server as any).aiLifeLayer.handleSimEvents({ sim: server.sim, events });
  (server as any).routeEvents(aiEvents.length > 0 ? [...events, ...aiEvents] : events);
  return aiEvents;
}

function seedThatMakesSingularity(entity: Entity): number {
  for (let seed = 1; seed < 10000; seed++) {
    if (individualProfileFor(entity, seed).tier === 'singularity') return seed;
  }
  throw new Error(`No singularity seed found for ${entity.templateId}`);
}

async function flushAi(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
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

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: npc!.id,
      speakerName: 'Brother Aldric',
      speech: expect.objectContaining({ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('delivers a safe NPC fallback when the AI provider fails', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
    const provider: AiProvider = {
      async decide(): Promise<AiDecisionV1> {
        throw new Error('codex worker timed out');
      },
    };
    (server as any).aiLifeLayer = new AiLifeLayer({ enabled: true, provider });
    teleportNear(server, session.pid, npc.id);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      speakerName: 'Brother Aldric',
      speech: expect.objectContaining({ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }),
      source: 'fallback',
      pid: session.pid,
    }));
    expect((server as any).aiLifeLayer.diagnostics()).toEqual([
      expect.objectContaining({ status: 'provider_error', reason: 'codex worker timed out' }),
      expect.objectContaining({ status: 'accepted', lineIds: ['hudChrome.aiSpeech.brotherAldricAwake'] }),
    ]);
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

    expect(eventsOf(fc, 'aiSpeech')
      .filter((event) => event.speech.lineId === 'hudChrome.aiSpeech.brotherAldricAwake')).toHaveLength(1);
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

  it('inspects the current scene without requiring a nearby object', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const player = server.sim.entities.get(session.pid)!;
    player.pos.x = 8;
    player.pos.z = 17;
    player.pos.y = groundHeight(player.pos.x, player.pos.z, server.sim.cfg.seed);
    player.prevPos = { ...player.pos };
    server.sim.grid.update(player);
    server.sim.playerGrid.update(player);
    const beforeObjects = [...server.sim.entities.values()].filter((entity) => entity.kind === 'object').length;
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_scene', locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: session.pid,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.sceneInspectForge' }),
      reaction: expect.objectContaining({ kind: 'inspect' }),
      pid: session.pid,
    }));
    const afterObjects = [...server.sim.entities.values()].filter((entity) => entity.kind === 'object').length;
    expect(afterObjects).toBe(beforeObjects);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
  });

  it('lets nearby creature families react to the inspected scene without changing quests', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const player = server.sim.entities.get(session.pid)!;
    player.pos.x = 8;
    player.pos.z = 17;
    player.pos.y = groundHeight(player.pos.x, player.pos.z, server.sim.cfg.seed);
    player.prevPos = { ...player.pos };
    server.sim.grid.update(player);
    server.sim.playerGrid.update(player);
    const wolf = [...server.sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf')!;
    wolf.pos.x = player.pos.x + 2;
    wolf.pos.z = player.pos.z;
    wolf.pos.y = groundHeight(wolf.pos.x, wolf.pos.z, server.sim.cfg.seed);
    wolf.prevPos = { ...wolf.pos };
    server.sim.grid.update(wolf);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_scene', locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: wolf.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.familySceneBeastUneasy',
        values: expect.objectContaining({ family: 'beast', reaction: 'avoid' }),
      }),
      reaction: expect.objectContaining({
        kind: 'avoid',
        sceneTags: expect.arrayContaining(['forge', 'workNoise']),
      }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('lets singularity creatures remember repeated scene sightings without changing quests', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const player = server.sim.entities.get(session.pid)!;
    const wolf = [...server.sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf')!;
    server.sim.cfg.seed = seedThatMakesSingularity(wolf);
    player.pos.x = 8;
    player.pos.z = 17;
    player.pos.y = groundHeight(player.pos.x, player.pos.z, server.sim.cfg.seed);
    player.prevPos = { ...player.pos };
    server.sim.grid.update(player);
    server.sim.playerGrid.update(player);
    wolf.pos.x = player.pos.x + 2;
    wolf.pos.z = player.pos.z;
    wolf.pos.y = groundHeight(wolf.pos.x, wolf.pos.z, server.sim.cfg.seed);
    wolf.prevPos = { ...wolf.pos };
    server.sim.grid.update(wolf);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_scene', locale: 'en' }));
    await flushAi();
    fc.sent.length = 0;
    session.aiObjectInspectReadyAt = 0;
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_scene', locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: wolf.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.singularityRemembersScene',
        values: expect.objectContaining({
          speakerTemplateId: 'forest_wolf',
          individualAlias: expect.any(String),
          sceneId: 'eastbrook_forge',
          playerName: 'Ari',
          interactionCount: 2,
        }),
      }),
      reaction: expect.objectContaining({
        kind: 'inspect',
        sceneTags: expect.arrayContaining(['forge', 'workNoise']),
        individualTier: 'singularity',
      }),
      pid: session.pid,
    }));
    expect((server as any).aiLifeLayer.creatureMemoryDiagnostics()).toContainEqual(expect.objectContaining({
      entityId: wolf.id,
      playerEntityId: session.pid,
      interactionCount: 2,
    }));
    expect((server as any).aiLifeLayer.diagnostics()).toContainEqual(expect.objectContaining({
      trigger: 'scene_inspected',
      intents: expect.arrayContaining(['reactToFamilyScene', 'rememberSingularityScene', 'writeWorldDirectorState']),
      memoryWrites: expect.arrayContaining([
        expect.objectContaining({
          kind: 'creatureMemory',
          sceneId: 'eastbrook_forge',
          reason: expect.stringContaining('singularityScene:eastbrook_forge'),
        }),
        expect.objectContaining({
          kind: 'worldDirectorState',
          sceneId: 'eastbrook_forge',
          subjectKind: 'scene',
          reason: expect.stringContaining('creatureSceneMemory:eastbrook_forge'),
        }),
      ]),
    }));
    expect((server as any).aiLifeLayer.worldDirectorDiagnostics()).toContainEqual(expect.objectContaining({
      sceneId: 'eastbrook_forge',
      subjectKind: 'scene',
      lineId: 'hudChrome.aiSpeech.worldDirectorSceneUncanny',
    }));

    fc.sent.length = 0;
    session.aiObjectInspectReadyAt = 0;
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_scene', locale: 'en' }));
    await flushAi();

    const sceneDirectorEvent = eventsOf(fc, 'aiSpeech').find((event) => event.speech.lineId === 'hudChrome.aiSpeech.worldDirectorSceneUncanny');
    expect(sceneDirectorEvent).toMatchObject({
      speakerId: session.pid,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldDirectorSceneUncanny',
        values: expect.objectContaining({ sceneId: 'eastbrook_forge', directorMood: 'uncanny' }),
      }),
      pid: session.pid,
    });
    expect(sceneDirectorEvent?.reaction).not.toHaveProperty('targetItemId');
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
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
      && /^hudChrome\.aiSpeech\.(itemInterest(Approach|Avoid|Inspect)|singularity[A-Z].*)$/.test(event.speech.lineId)
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

  it('lets a beast companion react by scent while inspecting an undead scene object', async () => {
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
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.companionSelfBeastScentUneasy' }),
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

  it('turns a discarded item into an inspectable short-term scene trace', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const wolf = [...server.sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf');
    expect(wolf).toBeTruthy();
    teleportNear(server, session.pid, wolf!.id);
    server.sim.addItem('roasted_boar', 1, session.pid);
    const beforeObjects = [...server.sim.entities.values()].filter((entity) => entity.kind === 'object').length;
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'roasted_boar', count: 1 }));
    await flushAi();
    fc.sent.length = 0;

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_scene', locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: session.pid,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.sceneTraceFood',
        values: expect.objectContaining({ itemId: 'roasted_boar', traceKind: 'food' }),
      }),
      reaction: expect.objectContaining({
        kind: 'inspect',
        targetItemId: 'roasted_boar',
      }),
      pid: session.pid,
    }));
    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: wolf!.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.itemInterestApproach',
        values: expect.objectContaining({ itemId: 'roasted_boar', traceKind: 'food' }),
      }),
      reaction: expect.objectContaining({
        kind: 'approach',
        targetItemId: 'roasted_boar',
      }),
      pid: session.pid,
    }));
    const afterObjects = [...server.sim.entities.values()].filter((entity) => entity.kind === 'object').length;
    expect(afterObjects).toBe(beforeObjects);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('lets world director mood remain briefly after a source trace expires', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const wolf = [...server.sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf')!;
    teleportNear(server, session.pid, wolf.id);
    server.sim.addItem('roasted_boar', 1, session.pid);
    const beforeObjects = [...server.sim.entities.values()].filter((entity) => entity.kind === 'object').length;
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'roasted_boar', count: 1 }));
    for (let i = 0; i < 91 * 20; i++) server.sim.tick();
    await flushAi();
    fc.sent.length = 0;

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_scene', locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: session.pid,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldDirectorHungry',
        values: expect.objectContaining({ itemId: 'roasted_boar', directorMood: 'hungry' }),
      }),
      reaction: expect.objectContaining({
        kind: 'inspect',
        targetItemId: 'roasted_boar',
      }),
      pid: session.pid,
    }));
    expect(eventsOf(fc, 'aiSpeech').some((event) => event.speech.lineId === 'hudChrome.aiSpeech.sceneTraceFood')).toBe(false);
    const afterObjects = [...server.sim.entities.values()].filter((entity) => entity.kind === 'object').length;
    expect(afterObjects).toBe(beforeObjects);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
  });

  it('lets NPC gossip respond to active world traces in the same scene', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'smith_haldren')!;
    teleportNear(server, session.pid, npc.id);
    server.sim.addItem('redbrook_blade', 1, session.pid);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'redbrook_blade', count: 1 }));
    await flushAi();
    fc.sent.length = 0;

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldTraceNpcValuable',
        values: expect.objectContaining({ itemId: 'redbrook_blade', traceKind: 'valuable' }),
      }),
      reaction: expect.objectContaining({ kind: 'inspect', targetItemId: 'redbrook_blade' }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('lets NPC place questions read active world director state', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'smith_haldren')!;
    teleportNear(server, session.pid, npc.id);
    server.sim.addItem('redbrook_blade', 1, session.pid);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'redbrook_blade', count: 1 }));
    await flushAi();
    fc.sent.length = 0;

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en', topic: 'place' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldDirectorCovetous',
        values: expect.objectContaining({ itemId: 'redbrook_blade', directorMood: 'covetous' }),
      }),
      reaction: expect.objectContaining({ kind: 'inspect', targetItemId: 'redbrook_blade' }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
    fc.sent.length = 0;
    session.aiQuestionReadyAt = 0;

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en', topic: 'recent' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldDirectorCovetous',
        values: expect.objectContaining({ itemId: 'redbrook_blade', directorMood: 'covetous' }),
      }),
      reaction: expect.objectContaining({ kind: 'inspect', targetItemId: 'redbrook_blade' }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('lets trace-driven world director state echo across nearby scenes in the same zone', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const forgeNpc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'smith_haldren')!;
    const lakeNpc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
    teleportNear(server, session.pid, forgeNpc.id);
    server.sim.addItem('redbrook_blade', 1, session.pid);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'redbrook_blade', count: 1 }));
    await flushAi();
    const [directorState] = (server as any).aiLifeLayer.worldDirectorDiagnostics();
    expect(directorState).toMatchObject({
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      itemId: 'redbrook_blade',
      mood: 'covetous',
    });
    fc.sent.length = 0;

    lakeNpc.pos.x = -64;
    lakeNpc.pos.z = 60;
    lakeNpc.pos.y = groundHeight(lakeNpc.pos.x, lakeNpc.pos.z, server.sim.cfg.seed);
    lakeNpc.prevPos = { ...lakeNpc.pos };
    server.sim.grid.update(lakeNpc);
    teleportNear(server, session.pid, lakeNpc.id);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: lakeNpc.id, locale: 'en', topic: 'place' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: lakeNpc.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldDirectorCovetous',
        values: expect.objectContaining({ itemId: 'redbrook_blade', directorMood: 'covetous' }),
      }),
      reaction: expect.objectContaining({ kind: 'inspect', targetItemId: 'redbrook_blade' }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('lets singularity item reactions become NPC rumors through real server commands', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const wolf = [...server.sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf')!;
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'smith_haldren')!;
    server.sim.cfg.seed = seedThatMakesSingularity(wolf);
    npc.pos.x = wolf.pos.x + 2;
    npc.pos.z = wolf.pos.z;
    npc.pos.y = groundHeight(npc.pos.x, npc.pos.z, server.sim.cfg.seed);
    npc.prevPos = { ...npc.pos };
    server.sim.grid.update(npc);
    teleportNear(server, session.pid, wolf.id);
    server.sim.addItem('roasted_boar', 1, session.pid);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'roasted_boar', count: 1 }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: wolf.id,
      speech: expect.objectContaining({
        lineId: expect.stringMatching(/^hudChrome\.aiSpeech\.singularity[A-Z].*/),
        values: expect.objectContaining({
          speakerTemplateId: 'forest_wolf',
          individualAlias: expect.any(String),
        }),
      }),
      reaction: expect.objectContaining({ individualTier: 'singularity', targetItemId: 'roasted_boar' }),
      pid: session.pid,
    }));

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.memorySingularityRumorEcho' }),
      pid: session.pid,
    }));
  });

  it('lets singularity creatures remember repeated player item patterns', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const wolf = [...server.sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf')!;
    server.sim.cfg.seed = seedThatMakesSingularity(wolf);
    teleportNear(server, session.pid, wolf.id);
    server.sim.addItem('roasted_boar', 2, session.pid);
    const beforeObjects = [...server.sim.entities.values()].filter((entity) => entity.kind === 'object' && entity.objectItemId === 'roasted_boar').length;

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'roasted_boar', count: 1 }));
    await flushAi();
    fc.sent.length = 0;
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'roasted_boar', count: 1 }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: wolf.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.singularityRemembersPlayer',
        values: expect.objectContaining({
          speakerTemplateId: 'forest_wolf',
          individualAlias: expect.any(String),
          itemId: 'roasted_boar',
          playerName: 'Ari',
          interactionCount: 2,
        }),
      }),
      reaction: expect.objectContaining({
        kind: 'inspect',
        targetItemId: 'roasted_boar',
        individualTier: 'singularity',
      }),
      pid: session.pid,
    }));
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

  it('lets discarded item rumors travel to another NPC in the same zone without changing quests', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const smith = [...server.sim.entities.values()].find((entity) => entity.templateId === 'smith_haldren')!;
    const priest = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
    teleportNear(server, session.pid, smith.id);
    server.sim.addItem('redbrook_blade', 1, session.pid);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'redbrook_blade', count: 1 }));
    const [rumor] = (server as any).aiLifeLayer.memoryDiagnostics().rumors;
    expect(rumor).toMatchObject({
      sceneId: 'eastbrook_forge',
      originSceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      itemId: 'redbrook_blade',
      scope: 'scene',
    });

    teleportNear(server, session.pid, priest.id);
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: priest.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: priest.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.memoryPriestRumorEcho' }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('turns real quest completion into same-zone NPC rumors without deciding quest state', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const marshal = [...server.sim.entities.values()].find((entity) => entity.templateId === 'marshal_redbrook')!;
    const priest = [...server.sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
    teleportNear(server, session.pid, marshal.id);
    const meta = server.sim.meta(session.pid)!;
    meta.questLog.set('q_wolves', { questId: 'q_wolves', counts: [8], state: 'ready' });
    server.sim.events = [];
    fc.sent.length = 0;

    server.sim.turnInQuest('q_wolves', session.pid);
    const questEvents = server.sim.tick();
    routeSimEventsThroughAi(server, questEvents);

    expect(questEvents).toContainEqual(expect.objectContaining({
      type: 'questDone',
      questId: 'q_wolves',
      pid: session.pid,
    }));
    expect(meta.questsDone.has('q_wolves')).toBe(true);
    expect(meta.questLog.has('q_wolves')).toBe(false);
    const [rumor] = (server as any).aiLifeLayer.memoryDiagnostics().rumors;
    expect(rumor).toMatchObject({
      subjectKind: 'quest',
      questId: 'q_wolves',
      zoneId: 'eastbrook_vale',
      sourcePlayerEntityId: session.pid,
    });
    const afterQuestLog = JSON.stringify([...meta.questLog]);
    const afterDone = JSON.stringify([...meta.questsDone]);
    fc.sent.length = 0;

    teleportNear(server, session.pid, priest.id);
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: priest.id, locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: priest.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.memoryPriestQuestRumorEcho',
        values: expect.objectContaining({ questId: 'q_wolves' }),
      }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...meta.questLog])).toBe(afterQuestLog);
    expect(JSON.stringify([...meta.questsDone])).toBe(afterDone);
    fc.sent.length = 0;

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_scene', locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: session.pid,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldDirectorQuestComplete',
        values: expect.objectContaining({ questId: 'q_wolves', directorMood: 'relieved' }),
      }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...meta.questLog])).toBe(afterQuestLog);
    expect(JSON.stringify([...meta.questsDone])).toBe(afterDone);
  });

  it('lets discarded item rumors expire before later NPC interactions', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const npc = [...server.sim.entities.values()].find((entity) => entity.templateId === 'smith_haldren')!;
    teleportNear(server, session.pid, npc.id);
    server.sim.addItem('redbrook_blade', 1, session.pid);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'discard', item: 'redbrook_blade', count: 1 }));
    for (let i = 0; i < 91 * 20; i++) server.sim.tick();
    fc.sent.length = 0;

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_interact_npc', npc: npc.id, locale: 'en', topic: 'rumor' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech').some((event) => event.speech.lineId === 'hudChrome.aiSpeech.memorySmithRumorEcho')).toBe(false);
    expect(eventsOf(fc, 'aiSpeech').some((event) => event.speech.lineId === 'hudChrome.aiSpeech.topicRumorQuiet')).toBe(false);
    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: npc.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldDirectorCovetous',
        values: expect.objectContaining({ itemId: 'redbrook_blade', directorMood: 'covetous' }),
      }),
      reaction: expect.objectContaining({ kind: 'inspect', targetItemId: 'redbrook_blade' }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('records a real boss defeat as encounter memory without changing quest state', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const player = server.sim.entities.get(session.pid)!;
    const boss = [...server.sim.entities.values()].find((entity) => entity.kind === 'mob' && entity.templateId === 'gorrak')!;
    teleportNear(server, session.pid, boss.id);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);
    server.sim.events = [];
    fc.sent.length = 0;

    (server.sim as any).dealDamage(player, boss, boss.hp + 1000, false, 'physical', 'Test Strike', 'hit');
    const events = server.sim.tick();
    const aiEvents = routeSimEventsThroughAi(server, events);

    expect(events).toContainEqual(expect.objectContaining({ type: 'death', entityId: boss.id, killerId: player.id }));
    expect(aiEvents).toContainEqual(expect.objectContaining({
      speakerId: boss.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.bossMemoryDefeated',
        values: expect.objectContaining({ bossTemplateId: 'gorrak', encounterOutcome: 'defeated' }),
      }),
      pid: session.pid,
    }));
    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: boss.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.bossMemoryDefeated' }),
      pid: session.pid,
    }));
    fc.sent.length = 0;

    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'ai_inspect_scene', locale: 'en' }));
    await flushAi();

    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: session.pid,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.bossMemoryDefeated',
        values: expect.objectContaining({ bossTemplateId: 'gorrak', encounterOutcome: 'defeated' }),
      }),
      pid: session.pid,
    }));
    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: session.pid,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldDirectorBossDefeated',
        values: expect.objectContaining({ bossTemplateId: 'gorrak', directorMood: 'triumphant' }),
      }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('emits boss phase theater from real damage events without changing quest state', () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const player = server.sim.entities.get(session.pid)!;
    const boss = [...server.sim.entities.values()].find((entity) => entity.kind === 'mob' && entity.templateId === 'gorrak')!;
    teleportNear(server, session.pid, boss.id);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);
    server.sim.events = [];
    fc.sent.length = 0;

    (server.sim as any).dealDamage(player, boss, Math.max(1, boss.hp - Math.ceil(boss.maxHp * 0.45)), false, 'physical', 'Test Strike', 'hit');
    const bloodiedEvents = server.sim.tick();
    const bloodiedAiEvents = routeSimEventsThroughAi(server, bloodiedEvents);

    expect(bloodiedEvents).toContainEqual(expect.objectContaining({ type: 'damage', sourceId: player.id, targetId: boss.id, kind: 'hit' }));
    expect(bloodiedAiEvents).toContainEqual(expect.objectContaining({
      speakerId: boss.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.bossPhaseBloodied',
        values: expect.objectContaining({ bossTemplateId: 'gorrak', encounterPhase: 'bloodied' }),
      }),
      pid: session.pid,
    }));
    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: boss.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.bossPhaseBloodied' }),
      pid: session.pid,
    }));
    fc.sent.length = 0;

    (server.sim as any).dealDamage(player, boss, 1, false, 'physical', 'Test Strike', 'hit');
    const duplicateEvents = server.sim.tick();
    routeSimEventsThroughAi(server, duplicateEvents);
    expect(eventsOf(fc, 'aiSpeech').some((event) => event.speech.lineId === 'hudChrome.aiSpeech.bossPhaseBloodied')).toBe(false);

    (server.sim as any).dealDamage(player, boss, Math.max(1, boss.hp - Math.ceil(boss.maxHp * 0.18)), false, 'physical', 'Test Strike', 'hit');
    const desperateEvents = server.sim.tick();
    const desperateAiEvents = routeSimEventsThroughAi(server, desperateEvents);

    expect(desperateAiEvents).toContainEqual(expect.objectContaining({
      speakerId: boss.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.bossPhaseDesperate',
        values: expect.objectContaining({ bossTemplateId: 'gorrak', encounterPhase: 'desperate' }),
      }),
      reaction: expect.objectContaining({ kind: 'avoid' }),
      pid: session.pid,
    }));
    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: boss.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.bossPhaseDesperate' }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('records a personal wipe memory when a real boss death event kills the player', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const player = server.sim.entities.get(session.pid)!;
    const boss = [...server.sim.entities.values()].find((entity) => entity.kind === 'mob' && entity.templateId === 'gorrak')!;
    teleportNear(server, session.pid, boss.id);
    const beforeQuestLog = JSON.stringify([...server.sim.meta(session.pid)!.questLog]);
    const beforeDone = JSON.stringify([...server.sim.meta(session.pid)!.questsDone]);
    server.sim.events = [];
    fc.sent.length = 0;

    (server.sim as any).dealDamage(boss, player, player.hp + 1000, false, 'physical', 'Test Strike', 'hit');
    const events = server.sim.tick();
    const aiEvents = routeSimEventsThroughAi(server, events);

    expect(events).toContainEqual(expect.objectContaining({ type: 'death', entityId: player.id, killerId: boss.id }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'playerDeath', pid: player.id }));
    expect(aiEvents).toContainEqual(expect.objectContaining({
      speakerId: boss.id,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.bossMemoryWipe',
        values: expect.objectContaining({ bossTemplateId: 'gorrak', encounterOutcome: 'wipe' }),
      }),
      reaction: expect.objectContaining({ kind: 'avoid' }),
      pid: session.pid,
    }));
    expect(eventsOf(fc, 'aiSpeech')).toContainEqual(expect.objectContaining({
      speakerId: boss.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.bossMemoryWipe' }),
      pid: session.pid,
    }));
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...server.sim.meta(session.pid)!.questsDone])).toBe(beforeDone);
  });

  it('waits for pending AI memory writes during shutdown saves', async () => {
    const query = dbQueryMock();
    query.mockClear();
    let resolveInsertStarted!: () => void;
    let releaseInsert!: () => void;
    const insertStarted = new Promise<void>((resolve) => {
      resolveInsertStarted = resolve;
    });
    const insertRelease = new Promise<void>((resolve) => {
      releaseInsert = resolve;
    });
    let holdFirstMemoryInsert = true;
    query.mockImplementation(async (sql: unknown) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO ai_memory_records') && holdFirstMemoryInsert) {
        holdFirstMemoryInsert = false;
        resolveInsertStarted();
        await insertRelease;
      }
      return { rows: [] };
    });

    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc);
    const wolf = [...server.sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf')!;
    teleportNear(server, session.pid, wolf.id);

    (server as any).aiLifeLayer.handleItemDiscarded({
      sim: server.sim,
      pid: session.pid,
      itemId: 'roasted_boar',
      count: 1,
      deliver: () => {},
    });
    await insertStarted;

    let saveDone = false;
    const save = server.saveAll('shutdown').then(() => {
      saveDone = true;
    });
    await flushAi();

    expect(saveDone).toBe(false);
    releaseInsert();
    await save;

    expect(saveDone).toBe(true);
    expect(query.mock.calls.some(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO ai_memory_records'))).toBe(true);
    query.mockResolvedValue({ rows: [] });
  });
});
