// The quest model (PK-M1-58; quests_and_events.md 3, 5; catalog_quests_acts1_3.md 1 and 2):
// one test per new objective kind (deliver, escort, investigate, persuade, stealth, duel,
// follow, rescue, gather, craft, trade, accompany) and per outcome (failed with its branch,
// expired, by_other), quest.<id>.path and .stage, the key event effect, dispute chains with
// their weekly default development and nodes, the quest kinds, and the existing quest data
// passing unchanged. Gather and craft have no emitting system yet (PK-M1-49): their tests
// drive the declared event contract with synthetic events, as do duels and detection.

import { describe, expect, it } from 'vitest';
import { buildContent, validateContent } from '../src/content';
import { pack as questsPack } from '../src/content/packs/quests';
import { Engine, ok } from '../src/core';
import type {
  AnyWorldEvent,
  ContentMap,
  EventKind,
  EventMap,
  FlagValue,
} from '../src/core/contracts';
import { defaultRegistry } from '../src/core/registry';
import type { GameSystem } from '../src/core/system';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { modelObjectivePlan } from '../src/game/autoplay/objective_plan';
import { createGame } from '../src/game/create';
import { addItem, countItem } from '../src/systems/inventory';
import {
  actWeekStartTick,
  KEY_KINDS,
  OBJECTIVE_TYPES,
  type Objective,
  QUEST_KINDS,
  type QuestDef,
  type QuestStage,
  questLog,
} from '../src/systems/quests';
import { attachSkipHandlers } from '../src/systems/travel/skip_registry';
import type { Entity } from '../src/systems/world/types';
import { NARRATIVE_SYSTEMS, narrativeContent, otherTeamsStub } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz.emit': { kind: string; data: unknown };
    'zz.give': { item: string; count: number };
  }
}

// ---------------------------------------------------------------------------
// harness

const BASE = narrativeContent();
const TOWN = 'borderstone';
const PLAZA = { x: 44, y: 35, w: 12, h: 9 };
const ITEM = (BASE.items[0] as { id: string }).id;
const DOOR = ((BASE as { doors?: { id: string }[] }).doors ?? [])[0]?.id ?? 'awaken';

/** npc.goto errands the quests system sent (the lean world has no NPC system). */
const gotos: { npcId: string; locationId: string; hours: number }[] = [];

/** Emits any event and gives items on command (synthetic evidence for the tests). */
const probe: GameSystem = {
  id: 'zz_probe',
  order: 5,
  commands: {
    'npc.goto'(_ctx, d) {
      gotos.push({ npcId: d.npcId, locationId: d.locationId, hours: d.hours });
      return ok();
    },
    'zz.emit'(ctx, d) {
      ctx.emit(d.kind as EventKind, d.data as EventMap[EventKind]);
      return ok();
    },
    'zz.give'(ctx, d) {
      addItem(ctx, ctx.world.slices.world.playerId, d.item, d.count, 'test');
      return ok();
    },
  },
};

/** Hour strides while on (the long tier of a time skip). */
const stride = { on: false };
const strider: GameSystem = {
  id: 'zz_stride',
  order: 1,
  clock(world) {
    if (!stride.on) return null;
    const t = world.meta.tick;
    return { stride: TICKS_PER_GAME_HOUR - (t % TICKS_PER_GAME_HOUR), hold: null };
  },
};

const stage = (
  id: string,
  objectives: Objective[],
  extra: Partial<QuestStage> = {},
): QuestStage => ({
  id,
  desc: id,
  objectives,
  ...extra,
});

/** A giverless act 1 quest that starts once the flag zz_on.<id> is set. */
const quest = (id: string, stages: QuestStage[], extra: Partial<QuestDef> = {}): QuestDef => ({
  id,
  act: 'act1',
  kind: 'side',
  title: id,
  desc: id,
  trigger: `zz_on_${id}`,
  stages,
  ...extra,
});

interface G {
  g: Engine;
  events: AnyWorldEvent[];
}

function game(quests: QuestDef[], content: ContentMap = BASE): G {
  stride.on = false;
  const systems = attachSkipHandlers([...NARRATIVE_SYSTEMS, otherTeamsStub, probe, strider]);
  const g = Engine.create(11, { ...content, quests: [...content.quests, ...quests] }, systems, {
    aiMode: 'off',
  });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => events.push(...evs));
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.step(1);
  return { g, events };
}

const flags = (g: Engine): Record<string, FlagValue> => g.world.meta.flags;
const status = (g: Engine, id: string) => g.world.slices.quests.quests[id]?.status;

function start(t: G, id: string): void {
  t.g.queue('flag.set', { key: `zz_on_${id}`, value: true });
  t.g.step(2);
  expect(status(t.g, id), `${id} started`).toBe('active');
}

function set(t: G, key: string, value: FlagValue): void {
  t.g.queue('flag.set', { key, value });
  t.g.step(11);
}

function emit<K extends EventKind>(t: G, kind: K, data: EventMap[K]): void {
  t.g.queue('zz.emit', { kind, data });
  t.g.step(1);
}

function talk(t: G, npc: string): void {
  t.g.queue('stub.talk', { npc });
  t.g.step(2);
}

/** Put the player at (x, y) on a map (a teleport, so a map change is an event). */
function placePlayer(t: G, mapId: string, x: number, y: number): void {
  t.g.queue('world.teleport', { entityId: t.g.world.slices.world.playerId, mapId, x, y });
  t.g.step(11);
}

/** Put (or move) a person's entity by content id, as the NPC or party system would. */
function person(t: G, ref: string, mapId: string, x: number, y: number): void {
  const id = `zz_${ref}`;
  const e = t.g.world.slices.world.entities[id];
  if (e) Object.assign(e, { mapId, x, y });
  else
    t.g.world.slices.world.entities[id] = {
      id,
      kind: 'npc',
      name: ref,
      mapId,
      x,
      y,
      facing: 0,
      speed: 3,
      radius: 0.35,
      faction: 'town',
      appearance: { base: 'human', colors: [] } as unknown as Entity['appearance'],
      tags: ['npc'],
      alive: true,
      ref,
      move: null,
      intent: null,
    };
  t.g.step(11);
}

function died(t: G, ref: string, killerId?: string): void {
  emit(t, 'entity.died', { id: `zz_${ref}`, ref, kind: 'npc', killerId, mapId: TOWN, x: 1, y: 1 });
  t.g.step(2);
}

const has = (t: G, kind: string) => t.events.some((e) => e.kind === kind);

// ---------------------------------------------------------------------------

describe('objective kinds', () => {
  it('deliver: hands the items over when talking to the person while holding them', () => {
    const t = game([
      quest('zz_deliver', [
        stage('give', [{ type: 'deliver', item: ITEM, count: 2, npc: 'oola', label: 'x' }]),
      ]),
    ]);
    start(t, 'zz_deliver');
    t.g.queue('zz.give', { item: ITEM, count: 1 });
    talk(t, 'oola');
    expect(status(t.g, 'zz_deliver')).toBe('active');
    t.g.queue('zz.give', { item: ITEM, count: 1 });
    talk(t, 'cassian');
    expect(status(t.g, 'zz_deliver')).toBe('active');
    talk(t, 'oola');
    expect(status(t.g, 'zz_deliver')).toBe('done');
    expect(countItem(t.g.world, t.g.world.slices.world.playerId, ITEM)).toBe(0);
  });

  it('escort: done when the person stands alive at the destination', () => {
    const t = game([
      quest('zz_escort', [
        stage('walk', [
          { type: 'escort', npc: 'zz_owen', mapId: TOWN, location: 'plaza', label: 'x' },
        ]),
      ]),
    ]);
    person(t, 'zz_owen', TOWN, 23, 58);
    start(t, 'zz_escort');
    expect(status(t.g, 'zz_escort')).toBe('active');
    person(t, 'zz_owen', 'forest_edge', PLAZA.x + 2, PLAZA.y + 2);
    expect(status(t.g, 'zz_escort')).toBe('active');
    person(t, 'zz_owen', TOWN, PLAZA.x + 2, PLAZA.y + 2);
    expect(status(t.g, 'zz_escort')).toBe('done');
  });

  it('investigate: counts clues as world facts, keeps them once found, needs `need` of them', () => {
    const t = game([
      quest('zz_inv', [
        stage('clues', [
          {
            type: 'investigate',
            need: 2,
            clues: [
              { id: 'seal', when: 'zz_seal_seen' },
              { id: 'ash', when: 'zz_ash >= 2' },
              { id: 'mark', when: 'zz_mark' },
            ],
            label: 'x',
          },
        ]),
      ]),
    ]);
    start(t, 'zz_inv');
    set(t, 'zz_seal_seen', true);
    set(t, 'zz_seal_seen', false);
    const view = () => questLog(t.g.world, t.g.content).active.find((v) => v.id === 'zz_inv');
    expect(view()?.objectives[0]).toMatchObject({ progress: 1, need: 2, done: false });
    set(t, 'zz_ash', 1);
    expect(status(t.g, 'zz_inv')).toBe('active');
    set(t, 'zz_ash', 2);
    expect(status(t.g, 'zz_inv')).toBe('done');
    const clues = t.events.flatMap((e) => (e.kind === 'quest.clue' ? [e.data.clue] : []));
    expect(clues).toEqual(['seal', 'ash']);
  });

  it('persuade: a persuasion in talk succeeds only while the threshold holds (PK-M1-19)', () => {
    const t = game([
      quest('zz_persuade', [
        stage('talk', [
          { type: 'persuade', npc: 'nera', when: 'trust.nera >= 55 AND zz_proof', label: 'x' },
        ]),
      ]),
    ]);
    start(t, 'zz_persuade');
    set(t, 'trust.nera', 60);
    emit(t, 'dialogue.persuaded', { npcId: 'npc_nera', npcRef: 'nera', ok: true });
    expect(status(t.g, 'zz_persuade')).toBe('active');
    set(t, 'zz_proof', true);
    // opening a talk is not a persuasion any more: the objective waits for the attempt
    talk(t, 'nera');
    expect(status(t.g, 'zz_persuade')).toBe('active');
    // a failed attempt meets nothing, and persuading someone else does not count
    emit(t, 'dialogue.persuaded', { npcId: 'npc_nera', npcRef: 'nera', ok: false });
    emit(t, 'dialogue.persuaded', { npcId: 'npc_oola', npcRef: 'oola', ok: true });
    expect(status(t.g, 'zz_persuade')).toBe('active');
    emit(t, 'dialogue.persuaded', { npcId: 'npc_nera', npcRef: 'nera', ok: true });
    expect(status(t.g, 'zz_persuade')).toBe('done');
  });

  it('stealth: a detection spoils the approach until the player leaves the map', () => {
    const t = game([
      quest('zz_sneak', [
        stage('in', [{ type: 'stealth', mapId: TOWN, location: 'orphanage', label: 'x' }]),
      ]),
    ]);
    placePlayer(t, TOWN, 23.5, 58.5);
    start(t, 'zz_sneak');
    emit(t, 'stealth.detected', { entityId: t.g.world.slices.world.playerId, mapId: TOWN });
    placePlayer(t, TOWN, 37, 28);
    expect(status(t.g, 'zz_sneak')).toBe('active');
    placePlayer(t, 'forest_edge', 5, 5);
    placePlayer(t, TOWN, 37, 28);
    expect(status(t.g, 'zz_sneak')).toBe('done');
  });

  it('stealth: someone else being seen does not spoil the player approach', () => {
    const t = game([
      quest('zz_sneak3', [
        stage('in', [{ type: 'stealth', mapId: TOWN, location: 'orphanage', label: 'x' }]),
      ]),
    ]);
    placePlayer(t, TOWN, 23.5, 58.5);
    start(t, 'zz_sneak3');
    emit(t, 'stealth.detected', { entityId: 'someone_else', mapId: TOWN });
    placePlayer(t, TOWN, 37, 28);
    expect(status(t.g, 'zz_sneak3')).toBe('done');
  });

  it('stealth with retry false: being seen fails the quest forward', () => {
    const t = game([
      quest(
        'zz_sneak2',
        [
          stage('in', [
            { type: 'stealth', mapId: TOWN, location: 'orphanage', retry: false, label: 'x' },
          ]),
        ],
        { failure: { effects: [{ type: 'flag', key: 'zz_caught', value: true }] } },
      ),
    ]);
    start(t, 'zz_sneak2');
    emit(t, 'stealth.detected', { entityId: t.g.world.slices.world.playerId, mapId: TOWN });
    expect(status(t.g, 'zz_sneak2')).toBe('failed');
    expect(flags(t.g)['quest.zz_sneak2']).toBe('failed');
    expect(flags(t.g).zz_caught).toBe(true);
  });

  it('duel: a won duel against the person; a lost one does not count; killing them fails', () => {
    const t = game([
      quest('zz_duel', [stage('fight', [{ type: 'duel', npc: 'dris', label: 'x' }])]),
      quest('zz_lose', [
        stage('fight', [{ type: 'duel', npc: 'boro', outcome: 'lose', label: 'x' }]),
      ]),
      quest('zz_kill', [stage('fight', [{ type: 'duel', npc: 'seg', label: 'x' }])]),
    ]);
    for (const id of ['zz_duel', 'zz_lose', 'zz_kill']) start(t, id);
    emit(t, 'duel.ended', { duelId: 'd1', opponentRef: 'dris', winner: 'opponent' });
    expect(status(t.g, 'zz_duel')).toBe('active');
    emit(t, 'duel.ended', { duelId: 'd2', opponentRef: 'dris', winner: 'player' });
    expect(status(t.g, 'zz_duel')).toBe('done');
    emit(t, 'duel.ended', { duelId: 'd3', opponentRef: 'boro', winner: 'opponent' });
    expect(status(t.g, 'zz_lose')).toBe('done');
    died(t, 'seg', 'some_bandit');
    expect(status(t.g, 'zz_kill')).toBe('active');
    died(t, 'seg', t.g.world.slices.world.playerId);
    expect(status(t.g, 'zz_kill')).toBe('failed');
  });

  it('follow: sends the guide on its way, then needs the player close when they arrive', () => {
    const t = game([
      quest('zz_follow', [
        stage('go', [
          { type: 'follow', npc: 'gorn', mapId: TOWN, location: 'plaza', range: 6, label: 'x' },
        ]),
      ]),
    ]);
    person(t, 'gorn', TOWN, 30, 48);
    placePlayer(t, TOWN, 60.5, 58.5);
    start(t, 'zz_follow');
    // the stage sent the guide on the NPC system's errand (npc.goto)
    t.g.step(2);
    expect(gotos.at(-1)).toEqual({ npcId: 'gorn', locationId: 'plaza', hours: 6 });
    // the player joins the guide on the way, and walks in with them
    placePlayer(t, TOWN, 32.5, 48.5);
    expect(t.g.world.slices.quests.quests.zz_follow?.counts[0]).toBe(1);
    person(t, 'gorn', TOWN, 42, 40);
    placePlayer(t, TOWN, 44.5, 41.5);
    expect(status(t.g, 'zz_follow')).toBe('active');
    person(t, 'gorn', TOWN, PLAZA.x + 2, PLAZA.y + 2);
    expect(status(t.g, 'zz_follow')).toBe('done');
  });

  it('follow: a guide who arrives without the player was not followed (it fails)', () => {
    const t = game([
      quest('zz_follow3', [
        stage('go', [{ type: 'follow', npc: 'gorn', mapId: TOWN, location: 'plaza', label: 'x' }]),
      ]),
    ]);
    person(t, 'gorn', TOWN, 30, 48);
    placePlayer(t, TOWN, 65.5, 23.5);
    start(t, 'zz_follow3');
    person(t, 'gorn', TOWN, PLAZA.x + 2, PLAZA.y + 2);
    // turning up at the place after the guide is not following
    placePlayer(t, TOWN, PLAZA.x + 4, PLAZA.y + 2);
    expect(status(t.g, 'zz_follow3')).toBe('failed');
  });

  it('an optional objective that fails drops out without blocking its stage', () => {
    const t = game([
      quest('zz_optional', [
        stage('s', [
          { type: 'flag', when: 'zz_done', label: 'x' },
          {
            type: 'follow',
            npc: 'gorn',
            mapId: TOWN,
            location: 'plaza',
            retry: false,
            optional: true,
            label: 'x',
          },
        ]),
      ]),
    ]);
    person(t, 'gorn', TOWN, 30, 48);
    placePlayer(t, TOWN, 32.5, 48.5);
    start(t, 'zz_optional');
    placePlayer(t, TOWN, 65.5, 23.5);
    expect(status(t.g, 'zz_optional')).toBe('active');
    expect(t.g.world.slices.quests.quests.zz_optional?.counts[1]).toBe(-1);
    set(t, 'zz_done', true);
    expect(status(t.g, 'zz_optional')).toBe('done');
  });

  it('a person already gone for good fails what hangs on them; a downed companion does not', () => {
    const t = game([
      quest('zz_gone', [stage('s', [{ type: 'escort', npc: 'owen', mapId: TOWN, label: 'x' }])]),
      quest('zz_lost_companion', [
        stage('s', [{ type: 'accompany', npc: 'shiya', minutes: 600, label: 'x' }]),
      ]),
    ]);
    set(t, 'npc.owen.dead', true);
    set(t, 'zz_on_zz_gone', true);
    expect(status(t.g, 'zz_gone')).toBe('failed');
    start(t, 'zz_lost_companion');
    // a companion going down in a fight (entity.died of kind companion) fails nothing
    emit(t, 'entity.died', { id: 'c1', ref: 'shiya', kind: 'companion', mapId: TOWN, x: 1, y: 1 });
    t.g.step(11);
    expect(status(t.g, 'zz_lost_companion')).toBe('active');
    set(t, 'companion.shiya.state', 'dead');
    expect(status(t.g, 'zz_lost_companion')).toBe('failed');
  });

  it('a stage that completes wins over a failure found in the same poll', () => {
    const t = game([
      quest('zz_race', [
        stage(
          's',
          [
            { type: 'flag', when: 'zz_saved', label: 'x' },
            { type: 'escort', npc: 'owen', mapId: TOWN, label: 'x' },
          ],
          { complete: 'any' },
        ),
      ]),
    ]);
    start(t, 'zz_race');
    t.g.queue('flag.set', { key: 'zz_saved', value: true });
    t.g.queue('flag.set', { key: 'npc.owen.dead', value: true });
    t.g.step(11);
    expect(status(t.g, 'zz_race')).toBe('done');
  });

  it('follow with retry false: losing the guide fails it into the failure branch', () => {
    const t = game([
      quest('zz_follow2', [
        stage(
          'go',
          [
            {
              type: 'follow',
              npc: 'gorn',
              mapId: TOWN,
              location: 'plaza',
              retry: false,
              label: 'x',
            },
          ],
          { onFail: [{ type: 'flag', key: 'zz_lost', value: true }], failTo: 'search' },
        ),
        stage('search', [{ type: 'flag', when: 'zz_found', label: 'x' }]),
      ]),
    ]);
    person(t, 'gorn', TOWN, 30, 48);
    placePlayer(t, TOWN, 32.5, 48.5);
    start(t, 'zz_follow2');
    placePlayer(t, TOWN, 65.5, 23.5);
    expect(flags(t.g).zz_lost).toBe(true);
    expect(status(t.g, 'zz_follow2')).toBe('active');
    expect(flags(t.g)['quest.zz_follow2.stage']).toBe('search');
    set(t, 'zz_found', true);
    expect(status(t.g, 'zz_follow2')).toBe('done');
  });

  it('rescue: freed by talking (or a condition), then brought to the destination alive', () => {
    const t = game([
      quest('zz_rescue', [
        stage('out', [{ type: 'rescue', npc: 'oola', mapId: TOWN, location: 'plaza', label: 'x' }]),
      ]),
      quest('zz_rescue2', [
        stage('out', [{ type: 'rescue', npc: 'noi', when: 'zz_cell_open', label: 'x' }]),
      ]),
      quest('zz_rescue3', [stage('out', [{ type: 'rescue', npc: 'tess', label: 'x' }])]),
    ]);
    person(t, 'oola', TOWN, PLAZA.x + 1, PLAZA.y + 1);
    for (const id of ['zz_rescue', 'zz_rescue2', 'zz_rescue3']) start(t, id);
    expect(status(t.g, 'zz_rescue')).toBe('active');
    talk(t, 'oola');
    expect(status(t.g, 'zz_rescue')).toBe('done');
    set(t, 'zz_cell_open', true);
    expect(status(t.g, 'zz_rescue2')).toBe('done');
    died(t, 'tess');
    expect(status(t.g, 'zz_rescue3')).toBe('failed');
  });

  it('gather: counts gather.done of the player (the contract PK-M1-49 will emit)', () => {
    const t = game([
      quest('zz_gather', [
        stage('herbs', [{ type: 'gather', item: 'mat_silverleaf', count: 5, label: 'x' }]),
      ]),
    ]);
    start(t, 'zz_gather');
    const pid = t.g.world.slices.world.playerId;
    emit(t, 'gather.done', { entityId: pid, itemId: 'mat_silverleaf', count: 3 });
    emit(t, 'gather.done', { entityId: 'npc_gorn', itemId: 'mat_silverleaf', count: 9 });
    emit(t, 'gather.done', { entityId: pid, itemId: 'mat_other', count: 9 });
    const view = questLog(t.g.world, t.g.content).active.find((v) => v.id === 'zz_gather');
    expect(view?.objectives[0]).toMatchObject({ progress: 3, need: 5 });
    emit(t, 'gather.done', { entityId: pid, itemId: 'mat_silverleaf', count: 2, nodeId: 'n1' });
    expect(status(t.g, 'zz_gather')).toBe('done');
  });

  it('craft: counts craft.done of the right recipe and quality', () => {
    const t = game([
      quest('zz_craft', [
        stage('brew', [
          { type: 'craft', recipe: 'rcp_ash_remedy', count: 2, quality: 2, label: 'x' },
        ]),
      ]),
    ]);
    start(t, 'zz_craft');
    const pid = t.g.world.slices.world.playerId;
    const brew = (recipeId: string, quality: number) =>
      emit(t, 'craft.done', { entityId: pid, recipeId, itemId: 'x', count: 1, quality });
    brew('rcp_ash_remedy', 1);
    brew('rcp_other', 3);
    brew('rcp_ash_remedy', 2);
    expect(status(t.g, 'zz_craft')).toBe('active');
    brew('rcp_ash_remedy', 3);
    expect(status(t.g, 'zz_craft')).toBe('done');
  });

  it('trade: counts the player trades of the item, side and unit price asked', () => {
    const t = game([
      quest('zz_trade', [
        stage('salt', [
          { type: 'trade', item: 'salt', side: 'buy', price: 12, count: 4, label: 'x' },
        ]),
      ]),
    ]);
    start(t, 'zz_trade');
    const pid = t.g.world.slices.world.playerId;
    const deal = (ownerId: string, side: 'buy' | 'sell', qty: number, total: number) =>
      emit(t, 'economy.traded', { marketId: 'm', ownerId, itemId: 'salt', qty, side, total });
    deal(pid, 'buy', 2, 40); // 20 a unit: dearer than the cap
    deal(pid, 'sell', 4, 40);
    deal('npc_nera', 'buy', 4, 40);
    deal(pid, 'buy', 3, 30);
    expect(status(t.g, 'zz_trade')).toBe('active');
    deal(pid, 'buy', 1, 12);
    expect(status(t.g, 'zz_trade')).toBe('done');
  });

  it('accompany: adds up the time spent close to the person, tick by tick and in skips', () => {
    const t = game([
      quest('zz_company', [
        stage('stay', [{ type: 'accompany', npc: 'shiya', minutes: 180, range: 5, label: 'x' }]),
      ]),
    ]);
    person(t, 'shiya', TOWN, 40, 38);
    placePlayer(t, TOWN, 41.5, 38.5);
    start(t, 'zz_company');
    t.g.step(60 * 20); // one game hour tick by tick
    const minutes = () =>
      questLog(t.g.world, t.g.content).active.find((v) => v.id === 'zz_company')?.objectives[0]
        ?.progress ?? -1;
    expect(minutes()).toBeGreaterThanOrEqual(59);
    expect(minutes()).toBeLessThanOrEqual(61);
    placePlayer(t, TOWN, 65.5, 58.5);
    const apart = minutes();
    t.g.step(TICKS_PER_GAME_HOUR);
    expect(minutes()).toBe(apart);
    placePlayer(t, TOWN, 41.5, 38.5);
    stride.on = true;
    t.g.step(3 * TICKS_PER_GAME_HOUR);
    stride.on = false;
    t.g.step(11);
    expect(status(t.g, 'zz_company')).toBe('done');
  });
});

describe('outcomes', () => {
  it('failed: a required objective failing applies onFail, then the failure effects', () => {
    const t = game([
      quest(
        'zz_escort_fail',
        [
          stage('walk', [{ type: 'escort', npc: 'owen', mapId: TOWN, label: 'x' }], {
            onFail: [{ type: 'flag', key: 'zz_owen_gone', value: true }],
          }),
        ],
        { failure: { effects: [{ type: 'flag', key: 'a1_owen_left', value: 'left' }] } },
      ),
    ]);
    start(t, 'zz_escort_fail');
    died(t, 'owen', 'bandit_1');
    expect(status(t.g, 'zz_escort_fail')).toBe('failed');
    expect([flags(t.g).zz_owen_gone, flags(t.g).a1_owen_left]).toEqual([true, 'left']);
    expect(has(t, 'quest.failed')).toBe(true);
    const log = questLog(t.g.world, t.g.content);
    expect(log.ended.map((v) => v.id)).toContain('zz_escort_fail');
    // a failed quest never restarts
    set(t, 'zz_on_zz_escort_fail', false);
    set(t, 'zz_on_zz_escort_fail', true);
    expect(status(t.g, 'zz_escort_fail')).toBe('failed');
  });

  it('failed: the failure condition fails a started quest forward', () => {
    const t = game([
      quest('zz_cond_fail', [stage('s', [{ type: 'flag', when: 'zz_never', label: 'x' }])], {
        failure: { when: 'npc.toby.dead' },
      }),
    ]);
    start(t, 'zz_cond_fail');
    set(t, 'npc.toby.dead', true);
    expect(status(t.g, 'zz_cond_fail')).toBe('failed');
  });

  it('expired: past its act week the default settlement applies, started or not', () => {
    const owen = (id: string) =>
      quest(id, [stage('s', [{ type: 'flag', when: 'zz_never', label: 'x' }])], {
        expiry: { week: 2, effects: [{ type: 'add', key: `zz_left_${id}`, amount: 1 }] },
      });
    const t = game([owen('zz_exp_started'), owen('zz_exp_unstarted')]);
    start(t, 'zz_exp_started');
    stride.on = true;
    t.g.step(actWeekStartTick(0, 3, 1) - t.g.tick - TICKS_PER_GAME_HOUR);
    expect(status(t.g, 'zz_exp_started')).toBe('active');
    t.g.step(2 * TICKS_PER_GAME_HOUR);
    stride.on = false;
    t.g.step(2);
    expect(status(t.g, 'zz_exp_started')).toBe('expired');
    expect(status(t.g, 'zz_exp_unstarted')).toBe('expired');
    expect(flags(t.g)['quest.zz_exp_unstarted']).toBe('expired');
    expect([flags(t.g).zz_left_zz_exp_started, flags(t.g).zz_left_zz_exp_unstarted]).toEqual([
      1, 1,
    ]);
    const exp = t.events.filter((e) => e.kind === 'quest.expired').map((e) => e.data);
    expect(exp.map((d) => [d.questId, d.started])).toEqual([
      ['zz_exp_started', true],
      ['zz_exp_unstarted', false],
    ]);
    // an unstarted, expired quest is no longer offered or started, and stays out of the log
    set(t, 'zz_on_zz_exp_unstarted', true);
    expect(status(t.g, 'zz_exp_unstarted')).toBe('expired');
    expect(t.g.world.slices.quests.order).not.toContain('zz_exp_unstarted');
  });

  it('expired: by condition, and when the world has moved past the quest act', () => {
    const t = game([
      quest('zz_exp_when', [stage('s', [{ type: 'flag', when: 'zz_never', label: 'x' }])], {
        expiry: { when: 'zz_too_late' },
      }),
      quest('zz_exp_act', [stage('s', [{ type: 'flag', when: 'zz_never', label: 'x' }])], {
        expiry: { week: 9 },
      }),
    ]);
    start(t, 'zz_exp_when');
    set(t, 'zz_too_late', true);
    expect(status(t.g, 'zz_exp_when')).toBe('expired');
    expect(status(t.g, 'zz_exp_act')).toBeUndefined();
    set(t, 'act', 'act2');
    expect(status(t.g, 'zz_exp_act')).toBe('expired');
  });

  it('by_other: someone gets there first; the favour replaces the reward', () => {
    const t = game([
      quest('zz_other', [stage('s', [{ type: 'flag', when: 'zz_never', label: 'x' }])], {
        byOther: {
          when: 'a1_owen_left == stayed',
          effects: [{ type: 'add', key: 'trust.owen', amount: 5 }],
        },
        rewards: [{ type: 'flag', key: 'zz_reward', value: true }],
      }),
      quest('zz_other_unstarted', [stage('s', [{ type: 'flag', when: 'zz_never', label: 'x' }])], {
        byOther: { when: 'zz_done_by_moss' },
      }),
    ]);
    start(t, 'zz_other');
    set(t, 'a1_owen_left', 'stayed');
    set(t, 'zz_done_by_moss', true);
    expect(status(t.g, 'zz_other')).toBe('by_other');
    expect(flags(t.g)['quest.zz_other']).toBe('by_other');
    expect(flags(t.g).zz_reward).toBeUndefined();
    expect(Number(flags(t.g)['trust.owen'])).toBe(5);
    expect(status(t.g, 'zz_other_unstarted')).toBe('by_other');
    const ev = t.events.filter((e) => e.kind === 'quest.by_other').map((e) => e.data.started);
    expect(ev).toEqual([true, false]);
    expect(questLog(t.g.world, t.g.content).ended.map((v) => v.status)).toEqual(['by_other']);
  });
});

describe('outcomes and the acts', () => {
  it('leaves quests of an act the world has not reached alone', () => {
    const t = game([
      quest('zz_later', [stage('s', [{ type: 'flag', when: 'zz_never', label: 'x' }])], {
        act: 'act3',
        byOther: { when: 'zz_someone' },
      }),
    ]);
    set(t, 'zz_someone', true);
    expect(status(t.g, 'zz_later')).toBeUndefined();
    set(t, 'act', 'act3');
    expect(status(t.g, 'zz_later')).toBe('by_other');
  });
});

describe('paths, stages and keys', () => {
  it('a talk objective with a path writes it when met', () => {
    const t = game([
      quest('zz_talk_path', [
        stage('ask', [{ type: 'talk', npc: 'oola', path: 'asked', label: 'x' }]),
      ]),
    ]);
    start(t, 'zz_talk_path');
    talk(t, 'oola');
    expect(status(t.g, 'zz_talk_path')).toBe('done');
    expect(flags(t.g)['quest.zz_talk_path.path']).toBe('asked');
  });

  it('writes quest.<id>.path from the objective or choice option taken, and quest.<id>.stage', () => {
    const t = game([
      quest('zz_path', [
        stage('ash', [
          {
            type: 'choice',
            options: [
              { id: 'bow', label: 'b', path: 'bowed' },
              { id: 'speak', label: 's', path: 'spoke' },
            ],
            label: 'x',
          },
        ]),
        stage(
          'out',
          [
            { type: 'flag', when: 'zz_side', path: 'side_road', label: 'x' },
            { type: 'flag', when: 'zz_main', path: 'direct', label: 'x' },
          ],
          { complete: 'any' },
        ),
      ]),
    ]);
    start(t, 'zz_path');
    expect(flags(t.g)['quest.zz_path.stage']).toBe('ash');
    t.g.queue('quests.choose', { questId: 'zz_path', optionId: 'speak' });
    t.g.step(2);
    expect(flags(t.g)['quest.zz_path.path']).toBe('spoke');
    expect(flags(t.g)['quest.zz_path.stage']).toBe('out');
    set(t, 'zz_side', true);
    expect(status(t.g, 'zz_path')).toBe('done');
    expect(flags(t.g)['quest.zz_path.path']).toBe('side_road');
    expect(questLog(t.g.world, t.g.content).done.find((v) => v.id === 'zz_path')?.path).toBe(
      'side_road',
    );
  });

  it('a key event effect writes door_key.<door>.<key> with its kind and emits quest.key', () => {
    const t = game([
      quest('zz_key', [stage('s', [{ type: 'flag', when: 'zz_go', label: 'x' }])], {
        rewards: [{ type: 'key', doorId: DOOR, keyKind: 'place', keyId: 'pact_oak' }],
      }),
    ]);
    start(t, 'zz_key');
    set(t, 'zz_go', true);
    expect(flags(t.g)[`door_key.${DOOR}.pact_oak`]).toBe('place');
    const ev = t.events.find((e) => e.kind === 'quest.key');
    expect(ev?.data).toEqual({ doorId: DOOR, keyKind: 'place', keyId: 'pact_oak' });
    expect(KEY_KINDS).toEqual(['deed', 'item', 'bond', 'choice', 'place', 'rank', 'know', 'time']);
  });

  it('the registry knows the flags the model writes (the guard accepts them)', () => {
    const reg = defaultRegistry();
    for (const name of [
      `door_key.${DOOR}.pact_oak`,
      'quest.q_a1_m01_fall.path',
      'quest.q_a1_m01_fall.stage',
    ])
      expect(reg.resolve(name), name).not.toBeNull();
    // the real game writes the stage flag of the first act 1 quest through the guard
    const g = createGame({ seed: 4, aiMode: 'off' });
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.step(3);
    expect(g.world.meta.flags['quest.q_a1_m01_fall']).toBe('active');
    expect(typeof g.world.meta.flags['quest.q_a1_m01_fall.stage']).toBe('string');
  });
});

describe('dispute chains and nodes', () => {
  const chain = quest(
    'zz_d01',
    [stage('run', [{ type: 'flag', when: 'zz_settled', label: 'x' }])],
    {
      kind: 'dispute',
      defaults: [
        { id: 'robbed', week: 3, effects: [{ type: 'flag', key: 'zz_owen_robbed', value: true }] },
        {
          id: 'owen_leaves',
          week: 6,
          unless: 'zz_escorted',
          effects: [{ type: 'flag', key: 'zz_owen_left', value: 'left' }],
        },
        { id: 'tax', week: 7, effects: [{ type: 'add', key: 'zz_tax', amount: 1 }] },
      ],
    },
  );
  const node = quest('zz_d01a', [stage('s', [{ type: 'flag', when: 'zz_never', label: 'x' }])], {
    kind: 'node',
    chain: 'zz_d01',
    node: 'a',
    weekWindow: { from: 3 },
    expiry: { week: 5, effects: [{ type: 'flag', key: 'zz_node_default', value: true }] },
  });

  function toWeek(t: G, week: number): void {
    stride.on = true;
    while (t.g.tick < actWeekStartTick(0, week, 1) + TICKS_PER_GAME_HOUR) t.g.step(1);
    stride.on = false;
    t.g.step(2);
  }

  it('advances the default development one step per week, never-started chains included', () => {
    const t = game([chain, node]);
    toWeek(t, 2);
    expect(flags(t.g).zz_owen_robbed).toBeUndefined();
    toWeek(t, 3);
    expect(flags(t.g).zz_owen_robbed).toBe(true);
    // the player escorted Owen in time: that step does not happen
    set(t, 'zz_escorted', true);
    toWeek(t, 6);
    expect(flags(t.g).zz_owen_left).toBeUndefined();
    toWeek(t, 7);
    expect(flags(t.g).zz_tax).toBe(1);
    toWeek(t, 8);
    expect(flags(t.g).zz_tax).toBe(1);
    const steps = t.events.flatMap((e) =>
      e.kind === 'quest.default' && e.data.questId === 'zz_d01'
        ? [[e.data.step, e.data.week, e.data.applied]]
        : [],
    );
    expect(steps).toEqual([
      ['robbed', 3, true],
      ['owen_leaves', 6, false],
      ['tax', 7, true],
    ]);
    expect(t.g.world.slices.quests.defaultsDone?.zz_d01).toEqual(['robbed', 'owen_leaves', 'tax']);
  });

  it('stops the defaults once the chain is settled; a node settles by its own expiry', () => {
    const t = game([chain, node]);
    start(t, 'zz_d01');
    set(t, 'zz_settled', true);
    expect(status(t.g, 'zz_d01')).toBe('done');
    toWeek(t, 4);
    expect(flags(t.g).zz_owen_robbed).toBeUndefined();
    toWeek(t, 6);
    expect(status(t.g, 'zz_d01a')).toBe('expired');
    expect(flags(t.g).zz_node_default).toBe(true);
  });

  it('validates kinds, chains, nodes and default steps', () => {
    const content = buildContent();
    const bad = (q: Partial<QuestDef>) =>
      questsPack.validate?.({
        ...content,
        quests: [...content.quests, { ...node, ...q } as QuestDef],
      }) ?? [];
    expect(bad({})).toEqual(
      expect.arrayContaining([expect.stringContaining('unknown chain zz_d01')]),
    );
    expect(bad({ kind: 'nonsense' as QuestDef['kind'] })).toEqual(
      expect.arrayContaining([expect.stringContaining('unknown kind nonsense')]),
    );
    expect(bad({ chain: undefined })).toEqual(
      expect.arrayContaining([expect.stringContaining('a node names its chain')]),
    );
    expect(bad({ kind: 'side', chain: undefined, defaults: chain.defaults })).toEqual(
      expect.arrayContaining([expect.stringContaining('only a dispute chain has default steps')]),
    );
  });
});

describe('the existing quest data', () => {
  it('passes the model checks unchanged, and keeps its kinds and objective types', () => {
    const content = buildContent();
    expect(questsPack.validate?.(content) ?? []).toEqual([]);
    expect(validateContent(content).filter((p) => p.startsWith('quest'))).toEqual([]);
    for (const q of content.quests) {
      expect(QUEST_KINDS, q.id).toContain(q.kind);
      for (const st of q.stages)
        for (const o of st.objectives) expect(OBJECTIVE_TYPES).toContain(o.type);
    }
  });

  it('catches the model mistakes: unknown objective, bad references, a key with no door', () => {
    const content = buildContent();
    const check = (q: QuestDef) =>
      questsPack.validate?.({ ...content, quests: [...content.quests, q] }) ?? [];
    const probs = check(
      quest(
        'zz_bad',
        [
          stage(
            's',
            [
              { type: 'teleport_me', label: 'x' } as unknown as Objective,
              { type: 'deliver', item: 'no_such_item', npc: 'oola', label: 'x' },
              { type: 'escort', npc: 'owen', mapId: TOWN, location: 'nowhere', label: 'x' },
              { type: 'investigate', clues: [], label: 'x' },
              { type: 'accompany', npc: 'shiya', minutes: 0, label: 'x' },
            ],
            { failTo: 'missing' },
          ),
        ],
        {
          rewards: [{ type: 'key', doorId: 'no_door', keyKind: 'place', keyId: 'a b' }],
          expiry: {},
        },
      ),
    );
    for (const want of [
      'unknown objective type teleport_me',
      'unknown item no_such_item',
      'unknown location nowhere',
      'investigate needs clues',
      'accompany needs minutes',
      'unknown failTo missing',
      'unknown door no_door',
      'key id must be one name segment',
      'expiry needs week or when',
    ])
      expect(probs, want).toEqual(expect.arrayContaining([expect.stringContaining(want)]));
  });

  it('leaves the current act 1 data on its old timing (no window, expiry or by_other yet)', () => {
    const content = buildContent();
    // the dispute chains (PK-M1-46) close through the runner's settlement (byOther)
    const act1 = content.quests.filter((q) => q.act === 'act1' && q.kind !== 'dispute');
    expect(act1.length).toBeGreaterThan(0);
    expect(act1.filter((q) => q.weekWindow || q.expiry || q.byOther).map((q) => q.id)).toEqual([]);
  });
});

describe('the autoplayer and the new objective kinds', () => {
  it('talks for deliver, persuade and rescue, walks for stealth, waits on the rest', () => {
    const plan = (o: Partial<Objective>) => modelObjectivePlan({ label: 'x', ...o } as Objective);
    expect(plan({ type: 'deliver', item: ITEM, npc: 'oola' })).toEqual({
      kind: 'talk',
      npc: 'oola',
    });
    // the talk alone persuades nobody: the persuade option is the attempt (PK-M1-19)
    expect(plan({ type: 'persuade', npc: 'nera', when: 'true' })).toEqual({
      kind: 'talk',
      npc: 'nera',
      option: 'persuade',
    });
    expect(plan({ type: 'rescue', npc: 'noi' })).toEqual({ kind: 'talk', npc: 'noi' });
    expect(plan({ type: 'stealth', mapId: TOWN, location: 'orphanage' })).toEqual({
      kind: 'reach',
      mapId: TOWN,
      location: 'orphanage',
    });
    for (const type of [
      'escort',
      'follow',
      'accompany',
      'investigate',
      'gather',
      'craft',
      'trade',
      'duel',
    ])
      expect(plan({ type } as Partial<Objective>), type).toEqual({ kind: 'wait' });
    expect(plan({ type: 'kill', count: 1 })).toBeNull();
  });
});
