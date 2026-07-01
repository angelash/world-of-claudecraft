import { describe, expect, it, vi } from 'vitest';

import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../server/ambient_bots/ws_client';
import { HostedPlayRuntime, type HostedPlayRuntimeGame } from '../server/hosted_play/runtime';
import type { SimEvent } from '../src/sim/types';

function liveState(input: (
  Partial<AmbientPlayerBotLiveState['self']> & {
    entities?: Array<Record<string, unknown>>;
    social?: AmbientPlayerBotLiveState['social'];
  }
) = {}): AmbientPlayerBotLiveState {
  const hasExtendedShape = 'entities' in input || 'social' in input;
  const selfOverrides = hasExtendedShape
    ? Object.fromEntries(
        Object.entries(input).filter(([key]) => key !== 'entities' && key !== 'social'),
      )
    : input;
  return {
    pid: 11,
    seed: 20061,
    self: {
      id: 11,
      x: 0,
      y: 0,
      z: 0,
      lv: 5,
      hp: 90,
      mhp: 100,
      res: 0,
      mres: 100,
      rtype: 'mana',
      target: null,
      auto: false,
      gcd: 0,
      cast: null,
      eat: null,
      drk: null,
      inv: [],
      qlog: [],
      qdone: [],
      cds: {},
      tal: null,
      ...selfOverrides,
    },
    entities: new Map(
      (hasExtendedShape ? input.entities ?? [] : []).map((entity) => [Number(entity.id), entity] as const),
    ),
    social: hasExtendedShape ? input.social ?? null : null,
  };
}

function fakeGame(
  state: AmbientPlayerBotLiveState | null,
  options: {
    recentEvents?: SimEvent[];
    ambientBotNames?: string[];
    ambientDirectory?: readonly AmbientPlayerBotRecord[];
    playerClass?: AmbientPlayerBotRecord['class'];
  } = {},
): HostedPlayRuntimeGame & {
  commands: Record<string, unknown>[];
  logs: string[];
  moveInputs: Array<{ moveInput: Record<string, unknown>; facing?: number }>;
  clearCount: number;
  activityCount: number;
  observed: boolean;
} {
  const commands: Record<string, unknown>[] = [];
  const logs: string[] = [];
  const moveInputs: Array<{ moveInput: Record<string, unknown>; facing?: number }> = [];
  let clearCount = 0;
  let activityCount = 0;
  let observed = false;
  let recentEvents = [...(options.recentEvents ?? [])];
  return {
    get commands() {
      return commands;
    },
    get logs() {
      return logs;
    },
    get moveInputs() {
      return moveInputs;
    },
    get clearCount() {
      return clearCount;
    },
    get activityCount() {
      return activityCount;
    },
    get observed() {
      return observed;
    },
    hostedPlaySessionInfo(characterId) {
      return state
        ? {
            characterId,
            characterName: 'Hero',
            playerClass: options.playerClass ?? 'warrior',
          }
        : null;
    },
    buildHostedPlayLiveState() {
      return state;
    },
    applyHostedPlayMoveInput(_characterId, moveInput, facing) {
      moveInputs.push({ moveInput, facing });
      return true;
    },
    applyHostedPlayCommand(_characterId, command) {
      commands.push(command);
      return true;
    },
    clearHostedPlayControl() {
      clearCount++;
    },
    noteHostedPlayActivity() {
      activityCount++;
    },
    setHostedPlayObserved(_characterId, nextObserved) {
      observed = nextObserved;
      if (!nextObserved) recentEvents = [];
    },
    drainHostedPlayRecentEvents() {
      if (!observed || recentEvents.length === 0) return [];
      const drained = [...recentEvents];
      recentEvents = [];
      return drained;
    },
    sendHostedPlayActionLog(_characterId, text) {
      logs.push(text);
    },
    ambientPlayerBotDirectory() {
      return [...(options.ambientDirectory ?? [])];
    },
    ambientPlayerBotNames() {
      return [...(options.ambientBotNames ?? [])];
    },
  };
}

describe('HostedPlayRuntime', () => {
  it('rejects enabling hosted play for an offline character', () => {
    const runtime = new HostedPlayRuntime({
      game: fakeGame(null),
    });
    expect(() => runtime.enable(7)).toThrow('character is not currently online');
  });

  it('reuses the ambient brain to issue live commands for the hosted character', () => {
    const game = fakeGame(liveState({ hp: 0 }));
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 10_000,
    });

    runtime.enable(7);
    (runtime as any).tick();

    expect(game.commands).toContainEqual({ cmd: 'release' });
    expect(runtime.status(7)).toMatchObject({
      online: true,
      enabled: true,
      active: true,
      objectiveId: 'release',
      objectiveLabel: 'Releasing spirit',
    });
    expect(game.activityCount).toBe(1);
  });

  it('defaults hosted play to cooperative full-party auto invite', () => {
    const game = fakeGame(liveState({
      id: 101,
      nm: 'Hero',
      x: 100,
      z: 100,
      entities: [
        { id: 202, k: 'player', nm: 'Nearby', x: 108, z: 100, dead: 0 },
      ],
    }));
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7);
    (runtime as any).tick();

    expect(game.commands).toContainEqual({ cmd: 'pinvite', id: 202 });
    expect(runtime.status(7)).toMatchObject({
      partyMode: 'follow_leader',
      autoInviteNearbyPlayers: true,
      autoInviteNearbyTargetPartySize: 5,
      groupMode: 'invite_nearby',
    });
  });

  it('tracks persisted preferences and drives a trailing hosted follower toward the party leader', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 1518,
      z: -1200,
      res: 0,
      mres: 0,
      rtype: 'rage',
      auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Hero', cls: 'warrior', level: 12, hp: 100, mhp: 100, res: 0, mres: 100, rtype: 'mana', x: 1518, z: -1200, dead: 0, inCombat: 0, group: 1 },
        ],
      },
    }));
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: true,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: true,
      autoInviteNearbyTargetPartySize: 4,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(game.moveInputs).toHaveLength(1);
    expect(game.moveInputs[0]).toEqual(expect.objectContaining({
      moveInput: { f: 1 },
      facing: expect.any(Number),
    }));
    expect(runtime.status(7)).toMatchObject({
      resumeOnLogin: true,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: true,
      autoInviteNearbyTargetPartySize: 4,
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 18,
    });
  });

  it('lets a grouped hosted follower pick up a nearby quest while movement is paused', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 4,
      z: 6,
      lv: 1,
      rtype: 'rage',
      mres: 0,
      auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 1, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 4, z: 6, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Hero', cls: 'warrior', level: 1, hp: 100, mhp: 100, res: 0, mres: 0, rtype: 'rage', x: 4, z: 6, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
      ],
    }));
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([
      { cmd: 'target', id: 7001 },
      { cmd: 'interact' },
    ]);
    expect(game.moveInputs).toEqual([
      { moveInput: {}, facing: expect.any(Number) },
    ]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'follow_leader',
      objectiveId: 'accept_wolves',
    });
  });

  it('lets a grouped hosted character finish vendor restocking while party preparation pauses movement', () => {
    const game = fakeGame(liveState({
      id: 11,
      x: -7,
      z: 3,
      lv: 5,
      hp: 90,
      mhp: 100,
      res: 100,
      mres: 100,
      rtype: 'mana',
      copper: 300,
      inv: [
        { itemId: 'baked_bread', count: 4 },
        { itemId: 'spring_water', count: 4 },
      ],
      qdone: ['q_wolves'],
      qlog: [{ questId: 'q_boars', counts: [0], state: 'active' }],
      auras: [],
      party: {
        leader: 11,
        raid: false,
        members: [
          { pid: 11, name: 'Hero', cls: 'mage', level: 5, hp: 90, mhp: 100, res: 100, mres: 100, rtype: 'mana', x: -7, z: 3, dead: 0, inCombat: 0, group: 1 },
          { pid: 12, name: 'Branoraaa', cls: 'warrior', level: 5, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: -6, z: 3, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
      ],
    }), {
      playerClass: 'mage',
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toContainEqual({ cmd: 'cast', ability: 'frost_armor' });
    expect(game.commands).toContainEqual({ cmd: 'target', id: 7100 });
    expect(game.commands).toContainEqual({ cmd: 'buy', npc: 7100, item: 'minor_healing_potion' });
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'prepare_party',
      objectiveId: 'restock_minor_healing_potion',
      debug: {
        brainDrivePaused: false,
      },
    });
  });

  it('keeps the hosted leader waiting while regroup pauses nearby restocking', () => {
    const game = fakeGame(liveState({
      id: 11,
      x: -7,
      z: 3,
      lv: 5,
      hp: 100,
      mhp: 100,
      res: 100,
      mres: 100,
      rtype: 'mana',
      copper: 300,
      inv: [
        { itemId: 'baked_bread', count: 4 },
        { itemId: 'spring_water', count: 4 },
      ],
      qdone: ['q_wolves'],
      qlog: [{ questId: 'q_boars', counts: [0], state: 'active' }],
      auras: [
        { id: 'frost_armor', kind: 'buff_armor', rem: 1_700, dur: 1_800 },
        { id: 'arcane_intellect', kind: 'buff_int', rem: 1_700, dur: 1_800 },
      ],
      party: {
        leader: 11,
        raid: false,
        members: [
          { pid: 11, name: 'Hero', cls: 'mage', level: 5, hp: 100, mhp: 100, res: 100, mres: 100, rtype: 'mana', x: -7, z: 3, dead: 0, inCombat: 0, group: 1 },
          { pid: 12, name: 'Branoraaa', cls: 'warrior', level: 5, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: -40, z: 3, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
      ],
    }), {
      playerClass: 'mage',
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(game.moveInputs).toEqual([]);
    expect(game.clearCount).toBeGreaterThanOrEqual(1);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'hold_regroup',
      objectiveId: 'restock_minor_healing_potion',
      debug: {
        brainDrivePaused: true,
        commands: [],
      },
    });
  });

  it('lets a grouped hosted follower walk to a nearby quest giver before resuming follow', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 4,
      z: 15,
      lv: 1,
      rtype: 'rage',
      mres: 0,
      auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 1, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 4, z: 15, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Hero', cls: 'warrior', level: 1, hp: 100, mhp: 100, res: 0, mres: 0, rtype: 'rage', x: 4, z: 15, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
      ],
    }));
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(game.moveInputs).toHaveLength(1);
    expect(game.moveInputs[0]).toEqual(expect.objectContaining({
      moveInput: { f: 1 },
      facing: expect.any(Number),
    }));
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'follow_leader',
      objectiveId: 'accept_wolves',
      debug: {
        brainDrivePaused: false,
      },
    });
  });

  it('prioritizes regrouping over a nearby turn-in when the follower is outside leader range', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 20,
      z: 0,
      lv: 4,
      hp: 93,
      mhp: 93,
      res: 120,
      mres: 120,
      rtype: 'mana',
      qdone: ['q_wolves', 'q_boars'],
      qlog: [{ questId: 'q_spiders', counts: [6, 4], state: 'ready' }],
      auras: [
        { id: 'frost_armor', kind: 'buff_armor', rem: 1700, dur: 1800 },
        { id: 'arcane_intellect', kind: 'buff_int', rem: 1700, dur: 1800 },
      ],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 4, hp: 204, mhp: 204, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Hero', cls: 'mage', level: 4, hp: 93, mhp: 93, res: 120, mres: 120, rtype: 'mana', x: 20, z: 0, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 20, z: 0 },
      ],
    }), {
      playerClass: 'mage',
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(game.moveInputs).toHaveLength(1);
    expect(game.moveInputs[0]).toEqual(expect.objectContaining({
      moveInput: { f: 1 },
      facing: expect.any(Number),
    }));
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'follow_leader',
      objectiveId: 'turnin_spiders',
      debug: {
        brainDrivePaused: true,
        commands: [],
      },
    });
  });

  it('lets a tight grouped follower keep finishing its own active quest before resuming follow', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 0,
      z: 6,
      lv: 3,
      hp: 78,
      mhp: 78,
      res: 100,
      mres: 100,
      rtype: 'mana',
      qdone: ['q_wolves'],
      qlog: [{ questId: 'q_boars', counts: [3], state: 'active' }],
      auras: [
        { id: 'frost_armor', kind: 'buff_armor', rem: 1700, dur: 1800 },
        { id: 'arcane_intellect', kind: 'buff_int', rem: 1700, dur: 1800 },
      ],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 3, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Hero', cls: 'mage', level: 3, hp: 78, mhp: 78, res: 100, mres: 100, rtype: 'mana', x: 0, z: 6, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 8101, k: 'mob', tid: 'wild_boar', x: 0, z: 10, h: true, lv: 3 },
      ],
    }), {
      playerClass: 'mage',
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([
      { cmd: 'target', id: 8101 },
      expect.objectContaining({ cmd: 'cast' }),
      { cmd: 'attack' },
    ]);
    expect(game.commands).not.toContainEqual({ cmd: 'chat', text: '/follow Branoraaa' });
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'follow_leader',
      objectiveId: 'combat',
      debug: {
        brainDrivePaused: false,
      },
    });
  });

  it('lets a tight grouped follower loot personal quest drops before resuming follow', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 0,
      z: 6,
      lv: 3,
      hp: 78,
      mhp: 78,
      res: 100,
      mres: 100,
      rtype: 'mana',
      qdone: ['q_wolves'],
      qlog: [{ questId: 'q_boars', counts: [4], state: 'active' }],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 3, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Hero', cls: 'mage', level: 3, hp: 78, mhp: 78, res: 100, mres: 100, rtype: 'mana', x: 0, z: 6, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        {
          id: 8102,
          k: 'mob',
          tid: 'wild_boar',
          x: 0,
          z: 6.5,
          h: true,
          lv: 3,
          dead: true,
          loot: true,
          tap: 101,
          lootInfo: {
            copper: 0,
            items: [{ itemId: 'boar_hide', count: 1, personalFor: [102] }],
          },
        },
      ],
    }), {
      playerClass: 'mage',
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([
      { cmd: 'target', id: 8102 },
      { cmd: 'loot', id: 8102 },
    ]);
    expect(game.commands).not.toContainEqual({ cmd: 'chat', text: '/follow Branoraaa' });
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'follow_leader',
      objectiveId: 'loot',
      debug: {
        brainDrivePaused: false,
      },
    });
  });

  it('lets a grouped hosted member use recovery consumables while party recovery pauses assist movement', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 0,
      z: 6,
      lv: 3,
      hp: 60,
      mhp: 100,
      res: 100,
      mres: 100,
      rtype: 'mana',
      inv: [{ itemId: 'baked_bread', count: 1 }],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 3, hp: 70, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Hero', cls: 'mage', level: 3, hp: 60, mhp: 100, res: 100, mres: 100, rtype: 'mana', x: 0, z: 6, dead: 0, inCombat: 0, group: 1 },
        ],
      },
    }), {
      playerClass: 'mage',
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toContainEqual({ cmd: 'use', item: 'baked_bread' });
    expect(game.commands).not.toContainEqual(expect.objectContaining({ cmd: 'attack' }));
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'recover',
      debug: {
        brainDrivePaused: true,
      },
    });
  });

  it('keeps ordinary local combat commands paused while another party member needs recovery', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 0,
      z: 6,
      lv: 3,
      hp: 100,
      mhp: 100,
      res: 100,
      mres: 100,
      rtype: 'mana',
      qdone: ['q_wolves'],
      qlog: [{ questId: 'q_boars', counts: [3], state: 'active' }],
      auras: [
        { id: 'frost_armor', kind: 'buff_armor', rem: 1700, dur: 1800 },
        { id: 'arcane_intellect', kind: 'buff_int', rem: 1700, dur: 1800 },
      ],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 3, hp: 70, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Hero', cls: 'mage', level: 3, hp: 100, mhp: 100, res: 100, mres: 100, rtype: 'mana', x: 0, z: 6, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 8101, k: 'mob', tid: 'wild_boar', x: 0, z: 10, h: true, lv: 3 },
      ],
    }), {
      playerClass: 'mage',
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'combat',
      debug: {
        brainDrivePaused: true,
        commands: [],
      },
    });
  });

  it('lets a healthy untouched member accept starter quests while party recovery is paused', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 4,
      z: 6,
      lv: 1,
      hp: 95,
      mhp: 95,
      rtype: 'rage',
      mres: 0,
      qlog: [],
      qdone: [],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 1, hp: 60, mhp: 90, res: 0, mres: 0, rtype: 'rage', x: 4, z: 6, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Hero', cls: 'warrior', level: 1, hp: 95, mhp: 95, res: 0, mres: 0, rtype: 'rage', x: 4, z: 6, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
      ],
    }), {
      playerClass: 'warrior',
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([
      { cmd: 'target', id: 7001 },
      { cmd: 'interact' },
    ]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'accept_wolves',
      debug: {
        brainDrivePaused: false,
      },
    });
  });

  it('keeps low-health untouched members paused instead of overriding recovery for quest intake', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 4,
      z: 6,
      lv: 1,
      hp: 50,
      mhp: 95,
      rtype: 'rage',
      mres: 0,
      qlog: [],
      qdone: [],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 1, hp: 60, mhp: 90, res: 0, mres: 0, rtype: 'rage', x: 4, z: 6, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Hero', cls: 'warrior', level: 1, hp: 50, mhp: 95, res: 0, mres: 0, rtype: 'rage', x: 4, z: 6, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
      ],
    }), {
      playerClass: 'warrior',
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'recover',
      debug: {
        brainDrivePaused: true,
        commands: [],
      },
    });
  });

  it('keeps restock brain work paused while a nearby party member is recovering', () => {
    const game = fakeGame(liveState({
      id: 101,
      nm: 'Hero',
      x: -7,
      z: 3,
      lv: 5,
      hp: 252,
      mhp: 252,
      res: 0,
      mres: 0,
      rtype: 'rage',
      copper: 100,
      inv: [],
      qdone: ['q_wolves', 'q_supplies'],
      qlog: [{ questId: 'q_boars', counts: [0], state: 'active' }],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Hero', cls: 'warrior', level: 5, hp: 252, mhp: 252, res: 0, mres: 0, rtype: 'rage', x: -7, z: 3, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Branorabb', cls: 'rogue', level: 5, hp: 70, mhp: 100, res: 100, mres: 100, rtype: 'energy', x: -5, z: 3, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
        { id: 102, k: 'player', nm: 'Branorabb', x: -5, z: 3, hp: 70, mhp: 100, dead: 0, cmb: 0 },
      ],
    }), {
      playerClass: 'warrior',
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'recover_party',
      objectiveId: 'restock_food_and_drink',
      debug: {
        brainDrivePaused: true,
      },
    });
  });

  it('accepts party invites through the hosted runtime while follow-leader mode is enabled', () => {
    const game = fakeGame(liveState(), {
      recentEvents: [{ type: 'partyInvite', fromPid: 201, fromName: 'Aleph' }],
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([{ cmd: 'paccept' }]);
    expect(game.moveInputs).toHaveLength(0);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'accept_invite',
      groupLeaderName: 'Aleph',
    });
  });

  it('assists another party member through the hosted runtime before driving movement', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 0,
      z: 0,
      target: null,
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 8, z: 0, dead: 0, inCombat: 1, group: 1 },
          { pid: 102, name: 'Hero', cls: 'warrior', level: 12, hp: 100, mhp: 100, res: 0, mres: 100, rtype: 'mana', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 501, k: 'mob', h: 80, x: 7, z: 0, aggro: 101 },
      ],
    }));
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([{ cmd: 'target', id: 501 }]);
    expect(game.moveInputs).toHaveLength(1);
    expect(game.moveInputs[0]).toEqual(expect.objectContaining({
      moveInput: { f: 1 },
      facing: expect.any(Number),
    }));
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 8,
    });
  });

  it('has the hosted leader send one party role split before the pull', () => {
    let nowMs = 5_000;
    const game = fakeGame(liveState({
      id: 101,
      x: 4,
      z: 6,
      rtype: 'rage',
      mres: 0,
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Hero', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 4, z: 6, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Branorabb', cls: 'priest', level: 12, hp: 90, mhp: 90, res: 120, mres: 120, rtype: 'mana', x: 5, z: 6, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 102, k: 'player', nm: 'Branorabb', x: 5, z: 6 },
      ],
    }), {
      ambientBotNames: ['Branorabb'],
    });
    const runtime = new HostedPlayRuntime({
      game,
      brainIntervalMs: 250,
      nowMs: () => nowMs,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.commands.some((command) => command.cmd === 'chat' && String(command.text).startsWith('/p '))).toBe(false);

    nowMs = 6_500;
    (runtime as any).tick();

    expect(game.commands.some((command) =>
      command.cmd === 'chat'
      && typeof command.text === 'string'
      && command.text.startsWith('/p '),
    )).toBe(true);
  });

  it('surfaces hosted party roles and coordination intent in debug status', () => {
    const game = fakeGame(liveState({
      id: 101,
      x: 4,
      z: 6,
      rtype: 'rage',
      mres: 0,
      auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Hero', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 4, z: 6, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Branorabb', cls: 'priest', level: 12, hp: 90, mhp: 90, res: 120, mres: 120, rtype: 'mana', x: 5, z: 6, dead: 0, inCombat: 0, group: 1 },
        ],
      },
      entities: [
        { id: 102, k: 'player', nm: 'Branorabb', x: 5, z: 6 },
      ],
    }), {
      ambientBotNames: ['Branorabb'],
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(runtime.status(7).debug.party).toEqual(expect.objectContaining({
      partyRole: 'tank',
      intentKind: 'route_plan',
      intentBehavior: 'advance',
      intentSummary: expect.stringContaining('Plan the route'),
      intentTargetName: 'Hero',
    }));
  });

  it('emits hosted-play action logs when enabled and throttles repeated lines', () => {
    let nowMs = 10_000;
    const game = fakeGame(liveState({ hp: 0 }));
    const runtime = new HostedPlayRuntime({
      game,
      brainIntervalMs: 250,
      nowMs: () => nowMs,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'solo',
      actionLogEnabled: true,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();
    nowMs += 250;
    (runtime as any).tick();

    expect(game.logs).toEqual(['Hosted play: releasing spirit.']);
  });

  it('skips hosted-play action logs when the setting is off', () => {
    const game = fakeGame(liveState({ hp: 0 }));
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 10_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'solo',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
    });
    (runtime as any).tick();

    expect(game.logs).toEqual([]);
  });

  it('keeps driving travel between full brain decisions', () => {
    let nowMs = 20_000;
    const state = liveState({
      x: 0,
      z: 0,
      rtype: 'rage',
      mres: 0,
      entities: [
        { id: 201, k: 'npc', tid: 'marshal_redbrook', x: 20, z: 0, lv: 1 },
      ],
    });
    const game = fakeGame(state);
    const runtime = new HostedPlayRuntime({
      game,
      brainIntervalMs: 250,
      nowMs: () => nowMs,
    });

    runtime.enable(7);
    (runtime as any).tick();
    nowMs += 50;
    state.self!.x = 3;
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(game.moveInputs).toHaveLength(2);
    expect(game.moveInputs.every((input) => input.moveInput.f === 1)).toBe(true);
    expect(game.moveInputs.every((input) => typeof input.facing === 'number')).toBe(true);
    const status = runtime.status(7);
    expect(status.debug).toMatchObject({
      objectiveId: status.objectiveId,
      objectiveLabel: status.objectiveLabel,
      lastBrainAgeMs: 50,
      moveInput: { f: 1 },
      brainState: {
        pathLength: expect.any(Number),
        stuckResets: expect.any(Number),
      },
    });
    expect(status.debug.travelGoal).toMatchObject({
      target: { x: 20, z: 0 },
    });
  });

  it('pauses hosted play after runtime errors and clears held input', () => {
    const game = fakeGame(liveState());
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 20_000,
    });
    runtime.enable(7);
    game.buildHostedPlayLiveState = () => {
      throw new Error('hosted brain failed');
    };

    (runtime as any).tick();

    expect(runtime.status(7)).toMatchObject({
      paused: true,
      mode: 'paused',
      pauseReason: 'runtime_error',
    });
    expect(game.clearCount).toBeGreaterThan(0);
  });

  it('disables hosted play cleanly', () => {
    const game = fakeGame(liveState());
    const runtime = new HostedPlayRuntime({
      game,
    });

    runtime.enable(7);
    expect(runtime.disable(7)).toMatchObject({
      online: true,
      enabled: false,
      mode: 'disabled',
    });
    expect(game.clearCount).toBeGreaterThan(0);
  });

  it('tracks blocked whisper senders without issuing a reply', () => {
    const game = fakeGame(liveState({
      social: {
        friends: [],
        blocks: [{ id: 201, name: 'Aleph' }],
        guild: null,
      },
    }), {
      recentEvents: [{
        type: 'chat',
        fromPid: 201,
        from: 'Aleph',
        text: 'hey there',
        channel: 'whisper',
        pid: 11,
      }],
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7);
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(runtime.status(7)).toMatchObject({
      socialPendingReplies: 0,
      socialBlocks: 1,
      lastWhisperFrom: 'Aleph',
    });
  });
});
