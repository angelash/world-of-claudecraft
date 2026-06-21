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
import { individualProfileFor } from '../server/ai/singularity';
import type { Entity } from '../src/sim/types';
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
      speech: expect.objectContaining({ lineId: expect.stringMatching(/^hudChrome\.aiSpeech\.singularity[A-Z].*/) }),
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
        values: expect.objectContaining({ itemId: 'roasted_boar', playerName: 'Ari', interactionCount: 2 }),
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
});
