import { describe, expect, it, vi } from 'vitest';

import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../server/ambient_bots/ws_client';
import { HostedPlayRuntime, type HostedPlayRuntimeGame } from '../server/hosted_play/runtime';
import { NPCS } from '../src/sim/data';
import type { SimEvent } from '../src/sim/types';

function liveState(
  input: Partial<AmbientPlayerBotLiveState['self']> & {
    entities?: Array<Record<string, unknown>>;
    social?: AmbientPlayerBotLiveState['social'];
  } = {},
): AmbientPlayerBotLiveState {
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
      (hasExtendedShape ? (input.entities ?? []) : []).map(
        (entity) => [Number(entity.id), entity] as const,
      ),
    ),
    social: hasExtendedShape ? (input.social ?? null) : null,
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
  actions: Array<
    | { type: 'move'; moveInput: Record<string, unknown>; facing?: number }
    | { type: 'command'; command: Record<string, unknown> }
  >;
  clearCount: number;
  activityCount: number;
  observed: boolean;
} {
  const commands: Record<string, unknown>[] = [];
  const logs: string[] = [];
  const moveInputs: Array<{ moveInput: Record<string, unknown>; facing?: number }> = [];
  const actions: Array<
    | { type: 'move'; moveInput: Record<string, unknown>; facing?: number }
    | { type: 'command'; command: Record<string, unknown> }
  > = [];
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
    get actions() {
      return actions;
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
      actions.push({ type: 'move', moveInput, facing });
      return true;
    },
    applyHostedPlayCommand(_characterId, command) {
      commands.push(command);
      actions.push({ type: 'command', command });
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
    const game = fakeGame(
      liveState({
        id: 101,
        nm: 'Hero',
        x: 100,
        z: 100,
        entities: [{ id: 202, k: 'player', nm: 'Nearby', x: 108, z: 100, dead: 0 }],
      }),
    );
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
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 12,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 1500,
              z: -1200,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'warrior',
              level: 12,
              hp: 100,
              mhp: 100,
              res: 0,
              mres: 100,
              rtype: 'mana',
              x: 1518,
              z: -1200,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
      }),
    );
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
    expect(game.moveInputs[0]).toEqual(
      expect.objectContaining({
        moveInput: { f: 1 },
        facing: expect.any(Number),
      }),
    );
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

  it('faces a party support target before issuing a hosted cast command', () => {
    const game = fakeGame(
      liveState({
        id: 102,
        x: 0,
        z: 0,
        lv: 12,
        hp: 100,
        mhp: 100,
        res: 500,
        mres: 500,
        rtype: 'mana',
        target: null,
        auto: false,
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 12,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 2,
              z: 0,
              dead: 0,
              inCombat: 1,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage',
              level: 12,
              hp: 100,
              mhp: 100,
              res: 500,
              mres: 500,
              rtype: 'mana',
              x: 0,
              z: 0,
              dead: 0,
              inCombat: 1,
              group: 1,
            },
          ],
        },
        entities: [{ id: 501, k: 'mob', h: true, x: 10, z: 0, aggro: 101, auras: [] }],
      }),
      {
        playerClass: 'mage',
      },
    );
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
      { cmd: 'target', id: 501 },
      expect.objectContaining({ cmd: 'cast' }),
    ]);
    expect(game.actions[0]).toEqual({
      type: 'move',
      moveInput: {},
      facing: expect.closeTo(Math.PI / 2, 5),
    });
    expect(game.actions[1]).toEqual({ type: 'command', command: { cmd: 'target', id: 501 } });
    expect(game.actions[2]).toEqual({
      type: 'command',
      command: expect.objectContaining({ cmd: 'cast' }),
    });
  });

  it('counts stalled externally controlled follow travel as path stuck', () => {
    let nowMs = 5_000;
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 12,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 1500,
              z: -1200,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'warrior',
              level: 12,
              hp: 100,
              mhp: 100,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 1518,
              z: -1200,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
      }),
    );
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => nowMs,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 4,
    });
    (runtime as any).tick();
    nowMs += 5_000;
    (runtime as any).tick();
    nowMs += 5_000;
    (runtime as any).tick();

    const status = runtime.status(7);
    expect(status).toMatchObject({
      groupMode: 'follow_leader',
    });
    expect(status.debug.brainState.stuckResets).toBeGreaterThan(0);
  });

  it('lets a grouped hosted follower pick up a nearby quest while movement is paused', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 1,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'warrior',
              level: 1,
              hp: 100,
              mhp: 100,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 }],
      }),
    );
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

    expect(game.commands).toEqual([{ cmd: 'target', id: 7001 }, { cmd: 'interact' }]);
    expect(game.moveInputs).toEqual([{ moveInput: {}, facing: expect.any(Number) }]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'follow_leader',
      objectiveId: 'accept_wolves',
    });
  });

  it('lets a grouped hosted character finish vendor restocking while party preparation pauses movement', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 11,
              name: 'Hero',
              cls: 'mage',
              level: 5,
              hp: 90,
              mhp: 100,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: -7,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 12,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 5,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: -6,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 }],
      }),
      {
        playerClass: 'mage',
      },
    );
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

  it('blocks vendor restocking while a party member still has combat signal', () => {
    const game = fakeGame(
      liveState({
        id: 11,
        x: -7,
        z: 3,
        lv: 5,
        hp: 90,
        mhp: 100,
        res: 100,
        mres: 100,
        rtype: 'mana',
        target: 7100,
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
            {
              pid: 11,
              name: 'Hero',
              cls: 'mage',
              level: 5,
              hp: 90,
              mhp: 100,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: -7,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 12,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 5,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: -36,
              z: 3,
              dead: 0,
              inCombat: 1,
              group: 1,
            },
          ],
        },
        entities: [{ id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 }],
      }),
      {
        playerClass: 'mage',
      },
    );
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

    expect(game.commands).toEqual([{ cmd: 'target', id: null }]);
    expect(game.commands).not.toContainEqual({ cmd: 'target', id: 7100 });
    expect(game.commands).not.toContainEqual({
      cmd: 'buy',
      npc: 7100,
      item: 'minor_healing_potion',
    });
    expect(game.moveInputs).toHaveLength(1);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'restock_minor_healing_potion',
      debug: {
        brainDrivePaused: true,
        commands: [
          {
            summary: 'target',
            payloadJson: '{"cmd":"target","id":null}',
          },
        ],
      },
    });
  });

  it('moves the hosted leader back while regroup pauses nearby restocking', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 11,
              name: 'Hero',
              cls: 'mage',
              level: 5,
              hp: 100,
              mhp: 100,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: -7,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 12,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 5,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: -40,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 }],
      }),
      {
        playerClass: 'mage',
      },
    );
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
    expect(game.moveInputs).toEqual([{ moveInput: { f: 1 }, facing: -Math.PI / 2 }]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'hold_regroup',
      objectiveId: 'restock_minor_healing_potion',
      debug: {
        brainDrivePaused: true,
        brainState: {
          pathGoalKey: 'hosted-leader-regroup:12:-40:3',
        },
        commands: [],
      },
    });
  });

  it('lets a grouped hosted follower walk to a nearby quest giver before resuming follow', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 1,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 15,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'warrior',
              level: 1,
              hp: 100,
              mhp: 100,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 15,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 }],
      }),
    );
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
    expect(game.moveInputs[0]).toEqual(
      expect.objectContaining({
        moveInput: { f: 1 },
        facing: expect.any(Number),
      }),
    );
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'follow_leader',
      objectiveId: 'accept_wolves',
      debug: {
        brainDrivePaused: false,
      },
    });
  });

  it('lets a stable follower turn in a nearby quest while follow travel is active', () => {
    const game = fakeGame(
      liveState({
        id: 102,
        x: 11,
        z: -3,
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
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 4,
              hp: 204,
              mhp: 204,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 16,
              z: -3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage',
              level: 4,
              hp: 93,
              mhp: 93,
              res: 120,
              mres: 120,
              rtype: 'mana',
              x: 11,
              z: -3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 7001, k: 'npc', tid: 'apothecary_lin', x: 11, z: -3 }],
      }),
      {
        playerClass: 'mage',
      },
    );
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

    expect(game.commands).toEqual([{ cmd: 'target', id: 7001 }, { cmd: 'interact' }]);
    expect(game.moveInputs).toEqual([{ moveInput: {}, facing: expect.any(Number) }]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'follow_leader',
      objectiveId: 'turnin_spiders',
      debug: {
        brainDrivePaused: false,
      },
    });
  });

  it('prioritizes regrouping over a nearby turn-in when the follower is outside leader range', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 4,
              hp: 204,
              mhp: 204,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 0,
              z: 0,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage',
              level: 4,
              hp: 93,
              mhp: 93,
              res: 120,
              mres: 120,
              rtype: 'mana',
              x: 20,
              z: 0,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 20, z: 0 }],
      }),
      {
        playerClass: 'mage',
      },
    );
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
    expect(game.moveInputs[0]).toEqual(
      expect.objectContaining({
        moveInput: { f: 1 },
        facing: expect.any(Number),
      }),
    );
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'follow_leader',
      objectiveId: 'turnin_spiders',
      debug: {
        brainDrivePaused: true,
        commands: [],
      },
    });
  });

  it('keeps a Fenbridge leader reconnecting the train between brain decisions', () => {
    let nowMs = 5_000;
    const state = liveState({
      id: 101,
      nm: 'Aldenpplbms',
      x: 27.82,
      z: 305.21,
      lv: 9,
      hp: 414,
      mhp: 414,
      res: 0,
      mres: 0,
      rtype: 'rage',
      target: null,
      auto: false,
      qlog: [{ questId: 'q_widows', counts: [10, 6], state: 'ready' }],
      qdone: [
        'q_wolves',
        'q_boars',
        'q_spiders',
        'q_murlocs',
        'q_supplies',
        'q_mine',
        'q_greyjaw',
        'q_bandits',
        'q_ringleader',
        'q_bones',
        'q_whispers',
        'q_names_of_the_dead',
        'q_silence_the_call',
        'q_fenbridge_muster',
      ],
      auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
      party: {
        leader: 101,
        raid: false,
        members: [
          {
            pid: 101,
            name: 'Aldenpplbms',
            cls: 'warrior',
            level: 9,
            hp: 414,
            mhp: 414,
            res: 0,
            mres: 0,
            rtype: 'rage',
            x: 27.82,
            z: 305.21,
            dead: 0,
            inCombat: 0,
            group: 1,
          },
          {
            pid: 102,
            name: 'Mirapplbms',
            cls: 'priest',
            level: 9,
            hp: 196,
            mhp: 196,
            res: 713,
            mres: 713,
            rtype: 'mana',
            x: 10.18,
            z: 309.59,
            dead: 0,
            inCombat: 0,
            group: 1,
          },
          {
            pid: 103,
            name: 'Corinpplbms',
            cls: 'mage',
            level: 9,
            hp: 196,
            mhp: 196,
            res: 852,
            mres: 852,
            rtype: 'mana',
            x: 9.85,
            z: 309.94,
            dead: 0,
            inCombat: 0,
            group: 1,
          },
        ],
      },
      entities: [{ id: 9801, k: 'npc', tid: 'herbalist_yara', x: 10, z: 295 }],
    });
    const game = fakeGame(state, {
      playerClass: 'warrior',
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
      autoInviteNearbyTargetPartySize: 3,
    });
    (runtime as any).tick();
    nowMs += 50;
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(game.moveInputs).toHaveLength(2);
    expect(game.moveInputs[0]).toEqual(
      expect.objectContaining({
        moveInput: { f: 1 },
        facing: expect.any(Number),
      }),
    );
    expect(game.moveInputs[1]).toEqual(
      expect.objectContaining({
        moveInput: { f: 1 },
        facing: game.moveInputs[0]?.facing,
      }),
    );
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'hold_regroup',
      objectiveId: 'turnin_widows',
      debug: {
        brainDrivePaused: true,
        commands: [],
        brainState: {
          pathGoalKey: 'hosted-leader-regroup:102:10:310',
        },
      },
    });
  });

  it('lets a tight grouped follower keep finishing its own active quest before resuming follow', () => {
    const game = fakeGame(
      liveState({
        id: 102,
        x: 55,
        z: 12,
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
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 3,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 53,
              z: 12,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage',
              level: 3,
              hp: 78,
              mhp: 78,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: 55,
              z: 12,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 8101, k: 'mob', tid: 'wild_boar', x: 55, z: 16, h: true, lv: 3 }],
      }),
      {
        playerClass: 'mage',
      },
    );
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
    const game = fakeGame(
      liveState({
        id: 102,
        x: 55,
        z: 12,
        lv: 3,
        hp: 78,
        mhp: 78,
        res: 100,
        mres: 100,
        rtype: 'mana',
        qdone: ['q_wolves'],
        qlog: [{ questId: 'q_boars', counts: [4], state: 'active' }],
        auras: [
          { id: 'frost_armor', kind: 'buff_armor', rem: 1700, dur: 1800 },
          { id: 'arcane_intellect', kind: 'buff_int', rem: 1700, dur: 1800 },
        ],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 3,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 53,
              z: 12,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage',
              level: 3,
              hp: 78,
              mhp: 78,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: 55,
              z: 12,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          {
            id: 8102,
            k: 'mob',
            tid: 'wild_boar',
            x: 55,
            z: 12.5,
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
      }),
      {
        playerClass: 'mage',
      },
    );
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

  it('regroups instead of looting when live party positions show a broken train', () => {
    const game = fakeGame(
      liveState({
        id: 102,
        x: 55,
        z: 12,
        lv: 3,
        hp: 78,
        mhp: 78,
        res: 100,
        mres: 100,
        rtype: 'mana',
        qdone: ['q_wolves'],
        qlog: [{ questId: 'q_boars', counts: [4], state: 'active' }],
        auras: [
          { id: 'frost_armor', kind: 'buff_armor', rem: 1700, dur: 1800 },
          { id: 'arcane_intellect', kind: 'buff_int', rem: 1700, dur: 1800 },
        ],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 3,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 55,
              z: 12,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage',
              level: 3,
              hp: 78,
              mhp: 78,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: 55,
              z: 12,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          {
            id: 101,
            k: 'player',
            nm: 'Branoraaa',
            x: 90,
            z: 12,
            hp: 120,
            mhp: 120,
            res: 0,
            mres: 0,
            rtype: 'rage',
            dead: 0,
            cmb: 0,
          },
          {
            id: 8102,
            k: 'mob',
            tid: 'wild_boar',
            x: 55,
            z: 12.5,
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
      }),
      {
        playerClass: 'mage',
      },
    );
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
    expect(game.moveInputs[0]).toEqual(
      expect.objectContaining({
        moveInput: { f: 1 },
        facing: expect.any(Number),
      }),
    );
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'follow_leader',
      groupLeaderDistance: 35,
      objectiveId: 'loot',
      debug: {
        brainDrivePaused: true,
        commands: [],
      },
    });
  });

  it('keeps nearby corpse looting paused while party health recovers', () => {
    const game = fakeGame(
      liveState({
        id: 102,
        x: 55,
        z: 12,
        lv: 3,
        hp: 100,
        mhp: 100,
        res: 100,
        mres: 100,
        rtype: 'mana',
        qdone: ['q_wolves'],
        qlog: [{ questId: 'q_boars', counts: [4], state: 'active' }],
        auras: [
          { id: 'frost_armor', kind: 'buff_armor', rem: 1700, dur: 1800 },
          { id: 'arcane_intellect', kind: 'buff_int', rem: 1700, dur: 1800 },
        ],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 3,
              hp: 70,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 53,
              z: 12,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage',
              level: 3,
              hp: 100,
              mhp: 100,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: 55,
              z: 12,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          {
            id: 8102,
            k: 'mob',
            tid: 'wild_boar',
            x: 55,
            z: 12.5,
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
      }),
      {
        playerClass: 'mage',
      },
    );
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
      objectiveId: 'loot',
      debug: {
        brainDrivePaused: true,
        commands: [],
      },
    });
  });

  it('lets a grouped member pick up a nearby quest object during noncritical party recovery', () => {
    const game = fakeGame(
      liveState({
        id: 102,
        x: -116,
        z: 726,
        lv: 15,
        hp: 617,
        mhp: 617,
        res: 713,
        mres: 963,
        rtype: 'mana',
        target: null,
        auto: false,
        qdone: ['q_ogre_edges'],
        qlog: [{ questId: 'q_ogre_totems', counts: [0], state: 'active' }],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Aldenpplbms',
              cls: 'warrior',
              level: 15,
              hp: 80,
              mhp: 120,
              res: 0,
              mres: 100,
              rtype: 'rage',
              x: -112,
              z: 724,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Liorapplbms',
              cls: 'druid',
              level: 15,
              hp: 617,
              mhp: 617,
              res: 713,
              mres: 963,
              rtype: 'mana',
              x: -116,
              z: 726,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          {
            id: 101,
            k: 'player',
            nm: 'Aldenpplbms',
            x: -112,
            z: 724,
            hp: 80,
            mhp: 120,
            dead: 0,
            cmb: 0,
          },
          {
            id: 9100,
            k: 'object',
            tid: 'ogre_war_totem',
            obj: 'ogre_war_totem',
            x: -116,
            z: 726,
            loot: 1,
          },
        ],
      }),
      {
        playerClass: 'druid',
      },
    );
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

    expect(game.commands).toEqual([{ cmd: 'target', id: 9100 }, { cmd: 'interact' }]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'collect_ogre_totems',
      debug: {
        brainDrivePaused: false,
      },
    });
  });

  it('lets a grouped hosted member use recovery consumables while party recovery pauses assist movement', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 3,
              hp: 70,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 0,
              z: 0,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage',
              level: 3,
              hp: 60,
              mhp: 100,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: 0,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
      }),
      {
        playerClass: 'mage',
      },
    );
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
    const game = fakeGame(
      liveState({
        id: 102,
        x: 55,
        z: 12,
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
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 3,
              hp: 70,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 53,
              z: 12,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage',
              level: 3,
              hp: 100,
              mhp: 100,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: 55,
              z: 12,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 8101, k: 'mob', tid: 'wild_boar', x: 55, z: 16, h: true, lv: 3 }],
      }),
      {
        playerClass: 'mage',
      },
    );
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

  it('keeps healthy untouched members paused from quest intake while party health recovers', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 1,
              hp: 60,
              mhp: 90,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'warrior',
              level: 1,
              hp: 95,
              mhp: 95,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 }],
      }),
      {
        playerClass: 'warrior',
      },
    );
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

    expect(game.commands).not.toContainEqual({ cmd: 'target', id: 7001 });
    expect(game.commands).not.toContainEqual({ cmd: 'interact' });
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'accept_wolves',
      debug: {
        brainDrivePaused: true,
      },
    });
  });

  it('allows nearby quest intake during resource-only recovery when party health is stable', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Mira',
              cls: 'priest',
              level: 1,
              hp: 95,
              mhp: 95,
              res: 24,
              mres: 100,
              rtype: 'mana',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'warrior',
              level: 1,
              hp: 95,
              mhp: 95,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 }],
      }),
      {
        playerClass: 'warrior',
      },
    );
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

    expect(game.commands).toEqual([{ cmd: 'target', id: 7001 }, { cmd: 'interact' }]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'accept_wolves',
      debug: {
        brainDrivePaused: false,
      },
    });
  });

  it('keeps recovery quest intake paused when the party train is split', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Mira',
              cls: 'priest',
              level: 1,
              hp: 95,
              mhp: 95,
              res: 24,
              mres: 100,
              rtype: 'mana',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'warrior',
              level: 1,
              hp: 95,
              mhp: 95,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 103,
              name: 'Corin',
              cls: 'mage',
              level: 1,
              hp: 95,
              mhp: 95,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: 96,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 }],
      }),
      {
        playerClass: 'warrior',
      },
    );
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 3,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'accept_wolves',
      debug: {
        brainDrivePaused: true,
        commands: [],
      },
    });
  });

  it('keeps nearby quest intake paused during recovery while the party still has combat signal', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Mira',
              cls: 'priest',
              level: 1,
              hp: 95,
              mhp: 95,
              res: 35,
              mres: 100,
              rtype: 'mana',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'warrior',
              level: 1,
              hp: 95,
              mhp: 95,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
          { id: 8101, k: 'mob', tid: 'forest_wolf', x: 7, z: 6, h: true, lv: 1, aggro: 101 },
        ],
      }),
      {
        playerClass: 'warrior',
      },
    );
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

    expect(game.commands).not.toContainEqual({ cmd: 'target', id: 7001 });
    expect(game.commands).not.toContainEqual({ cmd: 'interact' });
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'accept_wolves',
      debug: {
        brainDrivePaused: true,
      },
    });
  });

  it('keeps low-health untouched members paused instead of overriding recovery for quest intake', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 1,
              hp: 60,
              mhp: 90,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'warrior',
              level: 1,
              hp: 50,
              mhp: 95,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 }],
      }),
      {
        playerClass: 'warrior',
      },
    );
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

  it('keeps a healthy member from turning in while party health recovers', () => {
    const game = fakeGame(
      liveState({
        id: 102,
        x: -14,
        z: -10,
        lv: 7,
        hp: 164,
        mhp: 164,
        rtype: 'mana',
        res: 120,
        mres: 120,
        qdone: [
          'q_wolves',
          'q_boars',
          'q_spiders',
          'q_murlocs',
          'q_supplies',
          'q_mine',
          'q_greyjaw',
          'q_bandits',
          'q_ringleader',
          'q_bones',
          'q_whispers',
          'q_names_of_the_dead',
        ],
        qlog: [{ questId: 'q_silence_the_call', counts: [12], state: 'ready' }],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 7,
              hp: 60,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: -12,
              z: -14,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage',
              level: 7,
              hp: 164,
              mhp: 164,
              res: 120,
              mres: 120,
              rtype: 'mana',
              x: -14,
              z: -10,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          { id: 7002, k: 'npc', tid: 'brother_aldric', x: -14, z: -10 },
          {
            id: 101,
            k: 'player',
            nm: 'Branoraaa',
            x: -12,
            z: -14,
            hp: 60,
            mhp: 120,
            dead: 0,
            cmb: 0,
          },
        ],
      }),
      {
        playerClass: 'mage',
      },
    );
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
      objectiveId: 'turnin_silence_the_call',
      debug: {
        brainDrivePaused: true,
        commands: [],
      },
    });
  });

  it('keeps a healthy member from accepting nearby quests while party health recovers', () => {
    const game = fakeGame(
      liveState({
        id: 102,
        x: -4,
        z: 308,
        lv: 8,
        hp: 195,
        mhp: 195,
        rtype: 'mana',
        res: 120,
        mres: 120,
        inv: [],
        qdone: [
          'q_wolves',
          'q_boars',
          'q_spiders',
          'q_murlocs',
          'q_supplies',
          'q_mine',
          'q_greyjaw',
          'q_bandits',
          'q_ringleader',
          'q_bones',
          'q_whispers',
          'q_names_of_the_dead',
          'q_silence_the_call',
          'q_fenbridge_muster',
        ],
        qlog: [
          { questId: 'q_prowlers', counts: [1], state: 'active' },
          { questId: 'q_prowler_pelts', counts: [0], state: 'active' },
          { questId: 'q_rite', counts: [0, 6], state: 'active' },
        ],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 8,
              hp: 60,
              mhp: 160,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: -6,
              z: 306,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage',
              level: 8,
              hp: 195,
              mhp: 195,
              res: 120,
              mres: 120,
              rtype: 'mana',
              x: -4,
              z: 308,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          { id: 9800, k: 'npc', tid: 'provisioner_hale', x: -4, z: 308 },
          {
            id: 101,
            k: 'player',
            nm: 'Branoraaa',
            x: -6,
            z: 306,
            hp: 60,
            mhp: 160,
            dead: 0,
            cmb: 0,
          },
        ],
      }),
      {
        playerClass: 'mage',
      },
    );
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
      objectiveId: 'accept_fen_supplies',
      debug: {
        brainDrivePaused: true,
        commands: [],
      },
    });
  });

  it('lets nearby restock brain work continue while a party member is recovering', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Hero',
              cls: 'warrior',
              level: 5,
              hp: 252,
              mhp: 252,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: -7,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Branorabb',
              cls: 'rogue',
              level: 5,
              hp: 70,
              mhp: 100,
              res: 100,
              mres: 100,
              rtype: 'energy',
              x: -5,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
          { id: 102, k: 'player', nm: 'Branorabb', x: -5, z: 3, hp: 70, mhp: 100, dead: 0, cmb: 0 },
        ],
      }),
      {
        playerClass: 'warrior',
      },
    );
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
      { cmd: 'target', id: 7100 },
      { cmd: 'buy', npc: 7100, item: 'baked_bread' },
    ]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'recover_party',
      objectiveId: 'restock_food_and_drink',
      debug: {
        brainDrivePaused: false,
      },
    });
  });

  it('lets combat brain commands through while a restocking party has a live threat', () => {
    const game = fakeGame(
      liveState({
        id: 101,
        nm: 'Hero',
        x: 2,
        z: 660,
        lv: 13,
        hp: 554,
        mhp: 616,
        res: 13,
        mres: 100,
        rtype: 'rage',
        target: null,
        auto: false,
        copper: 5000,
        inv: [],
        qdone: [
          'q_wolves',
          'q_boars',
          'q_spiders',
          'q_murlocs',
          'q_supplies',
          'q_mine',
          'q_greyjaw',
          'q_bandits',
          'q_ringleader',
          'q_bones',
          'q_whispers',
          'q_names_of_the_dead',
          'q_silence_the_call',
          'q_fenbridge_muster',
          'q_widows',
          'q_rite',
          'q_deepfen',
          'q_trolls',
          'q_relics',
          'q_olen',
          'q_mistcaller',
          'q_highwatch_summons',
          'q_stalkers',
          'q_stalker_pelts',
        ],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Hero',
              cls: 'warrior',
              level: 13,
              hp: 554,
              mhp: 616,
              res: 13,
              mres: 100,
              rtype: 'rage',
              x: 2,
              z: 660,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Mira',
              cls: 'priest',
              level: 13,
              hp: 360,
              mhp: 360,
              res: 360,
              mres: 967,
              rtype: 'mana',
              x: 2,
              z: 660,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 103,
              name: 'Corin',
              cls: 'mage',
              level: 13,
              hp: 314,
              mhp: 314,
              res: 334,
              mres: 1158,
              rtype: 'mana',
              x: 2,
              z: 660,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          { id: 102, k: 'player', nm: 'Mira', x: 2, z: 660, hp: 360, mhp: 360, dead: 0, cmb: 0 },
          { id: 103, k: 'player', nm: 'Corin', x: 2, z: 660, hp: 314, mhp: 314, dead: 0, cmb: 0 },
          { id: 223, k: 'mob', tid: 'deeprock_kobold', x: 3, z: 660, h: true, aggro: 101 },
        ],
      }),
      {
        playerClass: 'warrior',
      },
    );
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 3,
    });
    (runtime as any).tick();

    expect(game.commands).toContainEqual({ cmd: 'target', id: 223 });
    expect(game.commands).toContainEqual({ cmd: 'attack' });
    expect(runtime.status(7)).toMatchObject({
      objectiveId: 'combat',
      debug: {
        brainDrivePaused: false,
      },
    });
  });

  it('keeps combat brain paused at the Highwatch safe point while recovery is unsafe', () => {
    const game = fakeGame(
      liveState({
        id: 101,
        nm: 'Hero',
        x: -22.07,
        z: 666.05,
        lv: 18,
        hp: 508,
        mhp: 916,
        res: 46,
        mres: 100,
        rtype: 'rage',
        target: 246,
        auto: true,
        copper: 5000,
        inv: [],
        qdone: [
          'q_wolves',
          'q_boars',
          'q_spiders',
          'q_murlocs',
          'q_supplies',
          'q_mine',
          'q_greyjaw',
          'q_bandits',
          'q_ringleader',
          'q_bones',
          'q_whispers',
          'q_names_of_the_dead',
          'q_silence_the_call',
          'q_fenbridge_muster',
          'q_widows',
          'q_rite',
          'q_deepfen',
          'q_trolls',
          'q_relics',
          'q_olen',
          'q_mistcaller',
          'q_highwatch_summons',
          'q_stalkers',
          'q_stalker_pelts',
        ],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Hero',
              cls: 'warrior',
              level: 18,
              hp: 508,
              mhp: 916,
              res: 46,
              mres: 100,
              rtype: 'rage',
              x: -22.07,
              z: 666.05,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Mira',
              cls: 'priest',
              level: 18,
              hp: 436,
              mhp: 465,
              res: 24,
              mres: 1307,
              rtype: 'mana',
              x: -22.14,
              z: 666.31,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 103,
              name: 'Corin',
              cls: 'mage',
              level: 17,
              hp: 443,
              mhp: 472,
              res: 51,
              mres: 1509,
              rtype: 'mana',
              x: -22.19,
              z: 666.24,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          {
            id: 102,
            k: 'player',
            nm: 'Mira',
            x: -22.14,
            z: 666.31,
            hp: 436,
            mhp: 465,
            res: 24,
            mres: 1307,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
          {
            id: 103,
            k: 'player',
            nm: 'Corin',
            x: -22.19,
            z: 666.24,
            hp: 443,
            mhp: 472,
            res: 51,
            mres: 1509,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
          { id: 246, k: 'mob', tid: 'boneclad_revenant', x: -21.2, z: 665.6, h: true, aggro: 101 },
          ...Array.from({ length: 20 }, (_, index) => ({
            id: 700 + index,
            k: 'mob',
            tid: 'boneclad_revenant',
            x: -8 + index,
            z: 680,
            h: true,
            aggro: null,
          })),
        ],
      }),
      {
        playerClass: 'warrior',
      },
    );
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 3,
    });
    (runtime as any).tick();

    expect(game.commands).toContainEqual({ cmd: 'stopattack' });
    expect(game.commands).toContainEqual({ cmd: 'target', id: null });
    expect(game.commands).not.toContainEqual({ cmd: 'target', id: 246 });
    expect(game.commands).not.toContainEqual({ cmd: 'attack' });
    expect(game.commands).not.toContainEqual(expect.objectContaining({ cmd: 'cast' }));
    expect(runtime.status(7)).toMatchObject({
      objectiveId: 'combat',
      groupMode: 'assist_party',
      debug: {
        brainDrivePaused: true,
      },
    });
  });

  it('keeps recovery DPS from attacking a safe point threat while the healer is dry', () => {
    const game = fakeGame(
      liveState({
        id: 103,
        nm: 'Corin',
        x: -22.19,
        z: 666.24,
        lv: 17,
        hp: 443,
        mhp: 472,
        res: 51,
        mres: 1509,
        rtype: 'mana',
        target: null,
        auto: false,
        copper: 5000,
        inv: [],
        qdone: [
          'q_wolves',
          'q_boars',
          'q_spiders',
          'q_murlocs',
          'q_supplies',
          'q_mine',
          'q_greyjaw',
          'q_bandits',
          'q_ringleader',
          'q_bones',
          'q_whispers',
          'q_names_of_the_dead',
          'q_silence_the_call',
          'q_fenbridge_muster',
          'q_widows',
          'q_rite',
          'q_deepfen',
          'q_trolls',
          'q_relics',
          'q_olen',
          'q_mistcaller',
          'q_highwatch_summons',
          'q_stalkers',
          'q_stalker_pelts',
        ],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Hero',
              cls: 'warrior',
              level: 18,
              hp: 508,
              mhp: 916,
              res: 46,
              mres: 100,
              rtype: 'rage',
              x: -22.07,
              z: 666.05,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Mira',
              cls: 'priest',
              level: 18,
              hp: 436,
              mhp: 465,
              res: 24,
              mres: 1307,
              rtype: 'mana',
              x: -22.14,
              z: 666.31,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 103,
              name: 'Corin',
              cls: 'mage',
              level: 17,
              hp: 443,
              mhp: 472,
              res: 51,
              mres: 1509,
              rtype: 'mana',
              x: -22.19,
              z: 666.24,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          {
            id: 101,
            k: 'player',
            nm: 'Hero',
            x: -22.07,
            z: 666.05,
            hp: 508,
            mhp: 916,
            dead: 0,
            cmb: 0,
          },
          {
            id: 102,
            k: 'player',
            nm: 'Mira',
            x: -22.14,
            z: 666.31,
            hp: 436,
            mhp: 465,
            res: 24,
            mres: 1307,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
          { id: 246, k: 'mob', tid: 'boneclad_revenant', x: -21.2, z: 665.6, h: true, aggro: 101 },
          ...Array.from({ length: 20 }, (_, index) => ({
            id: 760 + index,
            k: 'mob',
            tid: 'boneclad_revenant',
            x: -8 + index,
            z: 680,
            h: true,
            aggro: null,
          })),
        ],
      }),
      {
        playerClass: 'mage',
      },
    );
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 3,
    });
    (runtime as any).tick();

    expect(game.commands).not.toContainEqual({ cmd: 'target', id: 246 });
    expect(game.commands).not.toContainEqual({ cmd: 'attack' });
    expect(game.commands).not.toContainEqual(expect.objectContaining({ cmd: 'cast' }));
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      debug: {
        brainDrivePaused: true,
      },
    });
  });

  it('keeps combat brain paused while a Highwatch safe retreat is still pending', () => {
    const game = fakeGame(
      liveState({
        id: 101,
        nm: 'Hero',
        x: 2,
        z: 660,
        lv: 14,
        hp: 554,
        mhp: 724,
        res: 13,
        mres: 100,
        rtype: 'rage',
        target: null,
        auto: false,
        copper: 5000,
        inv: [],
        qdone: [
          'q_wolves',
          'q_boars',
          'q_spiders',
          'q_murlocs',
          'q_supplies',
          'q_mine',
          'q_greyjaw',
          'q_bandits',
          'q_ringleader',
          'q_bones',
          'q_whispers',
          'q_names_of_the_dead',
          'q_silence_the_call',
          'q_fenbridge_muster',
          'q_widows',
          'q_rite',
          'q_deepfen',
          'q_trolls',
          'q_relics',
          'q_olen',
          'q_mistcaller',
          'q_highwatch_summons',
          'q_stalkers',
          'q_stalker_pelts',
        ],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Hero',
              cls: 'warrior',
              level: 14,
              hp: 554,
              mhp: 724,
              res: 13,
              mres: 100,
              rtype: 'rage',
              x: 2,
              z: 660,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Mira',
              cls: 'priest',
              level: 14,
              hp: 120,
              mhp: 381,
              res: 52,
              mres: 1023,
              rtype: 'mana',
              x: 2,
              z: 660,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 103,
              name: 'Corin',
              cls: 'mage',
              level: 14,
              hp: 314,
              mhp: 336,
              res: 334,
              mres: 1197,
              rtype: 'mana',
              x: 2,
              z: 660,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          { id: 102, k: 'player', nm: 'Mira', x: 2, z: 660, hp: 120, mhp: 381, dead: 0, cmb: 0 },
          { id: 103, k: 'player', nm: 'Corin', x: 2, z: 660, hp: 314, mhp: 336, dead: 0, cmb: 0 },
          { id: 223, k: 'mob', tid: 'deeprock_kobold', x: 3, z: 660, h: true, aggro: 101 },
          ...Array.from({ length: 12 }, (_, index) => ({
            id: 600 + index,
            k: 'mob',
            tid: 'deeprock_kobold',
            x: 6 + index,
            z: 658,
            h: true,
            aggro: null,
          })),
        ],
      }),
      {
        playerClass: 'warrior',
      },
    );
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 3,
    });
    (runtime as any).tick();

    expect(game.commands).not.toContainEqual({ cmd: 'target', id: 223 });
    expect(game.commands).not.toContainEqual({ cmd: 'attack' });
    expect(game.moveInputs).toHaveLength(1);
    expect(game.moveInputs[0]).toEqual(
      expect.objectContaining({
        moveInput: { f: 1 },
        facing: expect.any(Number),
      }),
    );
    expect(runtime.status(7)).toMatchObject({
      objectiveId: 'combat',
      groupMode: 'assist_party',
      debug: {
        brainDrivePaused: true,
        brainState: {
          pathGoalKey: 'hosted-party-safe-retreat:thornpeak_heights:-22:664',
        },
      },
    });
  });

  it('treats Highwatch safe-leash orbiting as stuck instead of refreshing travel progress', () => {
    let nowMs = 5_000;
    const state = liveState({
      id: 101,
      nm: 'Hero',
      x: -10.4,
      z: 655.6,
      lv: 19,
      hp: 455,
      mhp: 974,
      res: 65,
      mres: 100,
      rtype: 'rage',
      target: null,
      auto: false,
      copper: 5000,
      inv: [],
      qdone: [
        'q_wolves',
        'q_boars',
        'q_spiders',
        'q_murlocs',
        'q_supplies',
        'q_mine',
        'q_greyjaw',
        'q_bandits',
        'q_ringleader',
        'q_bones',
        'q_whispers',
        'q_names_of_the_dead',
        'q_silence_the_call',
        'q_fenbridge_muster',
        'q_widows',
        'q_rite',
        'q_deepfen',
        'q_trolls',
        'q_relics',
        'q_olen',
        'q_mistcaller',
        'q_highwatch_summons',
        'q_stalkers',
        'q_stalker_pelts',
      ],
      party: {
        leader: 101,
        raid: false,
        members: [
          {
            pid: 101,
            name: 'Hero',
            cls: 'warrior',
            level: 19,
            hp: 455,
            mhp: 974,
            res: 65,
            mres: 100,
            rtype: 'rage',
            x: -10.4,
            z: 655.6,
            dead: 0,
            inCombat: 0,
            group: 1,
          },
          {
            pid: 102,
            name: 'Mira',
            cls: 'priest',
            level: 19,
            hp: 481,
            mhp: 506,
            res: 26,
            mres: 1363,
            rtype: 'mana',
            x: -10,
            z: 655.2,
            dead: 0,
            inCombat: 0,
            group: 1,
          },
          {
            pid: 103,
            name: 'Corin',
            cls: 'mage',
            level: 19,
            hp: 491,
            mhp: 516,
            res: 1767,
            mres: 1767,
            rtype: 'mana',
            x: -10.2,
            z: 655.3,
            dead: 0,
            inCombat: 0,
            group: 1,
          },
        ],
      },
      entities: [
        {
          id: 102,
          k: 'player',
          nm: 'Mira',
          x: -10,
          z: 655.2,
          hp: 481,
          mhp: 506,
          res: 26,
          mres: 1363,
          rtype: 'mana',
          dead: 0,
          cmb: 0,
        },
        {
          id: 103,
          k: 'player',
          nm: 'Corin',
          x: -10.2,
          z: 655.3,
          hp: 491,
          mhp: 516,
          res: 1767,
          mres: 1767,
          rtype: 'mana',
          dead: 0,
          cmb: 0,
        },
        { id: 246, k: 'mob', tid: 'boneclad_revenant', x: -20, z: 663, h: true, aggro: 101 },
        ...Array.from({ length: 20 }, (_, index) => ({
          id: 900 + index,
          k: 'mob',
          tid: 'boneclad_revenant',
          x: -8 + index,
          z: 680,
          h: true,
          aggro: null,
        })),
      ],
    });
    const game = fakeGame(state, {
      playerClass: 'warrior',
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => nowMs,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 3,
    });

    const party = state.self?.party as { members: Array<{ pid: number; x: number; z: number }> };
    const positions = [
      { x: -10.4, z: 655.6 },
      { x: -11.8, z: 656.7 },
      { x: -10.2, z: 655.0 },
    ];
    for (const pos of positions) {
      state.self!.x = pos.x;
      state.self!.z = pos.z;
      const leader = party.members.find((member) => member.pid === 101);
      if (leader) {
        leader.x = pos.x;
        leader.z = pos.z;
      }
      (runtime as any).tick();
      nowMs += 5_000;
    }

    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'combat',
      debug: {
        brainDrivePaused: true,
        brainState: {
          stuckResets: 1,
        },
      },
    });
  });

  it('keeps nearby restock brain work paused while a party member is split away', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Hero',
              cls: 'warrior',
              level: 5,
              hp: 252,
              mhp: 252,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: -7,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Branorabb',
              cls: 'rogue',
              level: 5,
              hp: 70,
              mhp: 100,
              res: 100,
              mres: 100,
              rtype: 'energy',
              x: -5,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 103,
              name: 'Mira',
              cls: 'priest',
              level: 5,
              hp: 100,
              mhp: 100,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: 90,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
          { id: 102, k: 'player', nm: 'Branorabb', x: -5, z: 3, hp: 70, mhp: 100, dead: 0, cmb: 0 },
        ],
      }),
      {
        playerClass: 'warrior',
      },
    );
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 3,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      objectiveId: 'restock_food_and_drink',
      debug: {
        brainDrivePaused: true,
      },
    });
  });

  it('lets nearby restock travel continue while a party member is recovering', () => {
    const game = fakeGame(
      liveState({
        id: 101,
        nm: 'Hero',
        x: -25,
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
            {
              pid: 101,
              name: 'Hero',
              cls: 'warrior',
              level: 5,
              hp: 252,
              mhp: 252,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: -25,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Branorabb',
              cls: 'rogue',
              level: 5,
              hp: 70,
              mhp: 100,
              res: 100,
              mres: 100,
              rtype: 'energy',
              x: -23,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
          {
            id: 102,
            k: 'player',
            nm: 'Branorabb',
            x: -23,
            z: 3,
            hp: 70,
            mhp: 100,
            dead: 0,
            cmb: 0,
          },
        ],
      }),
      {
        playerClass: 'warrior',
      },
    );
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
    expect(game.moveInputs[0]).toEqual(
      expect.objectContaining({
        moveInput: { f: 1 },
        facing: expect.any(Number),
      }),
    );
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'recover_party',
      objectiveId: 'restock_food_and_drink',
      debug: {
        brainDrivePaused: false,
        travelGoal: {
          target: { x: -10, z: -2 },
        },
      },
    });
  });

  it('keeps distant restock brain work paused while a nearby party member is recovering', () => {
    const game = fakeGame(
      liveState({
        id: 101,
        nm: 'Hero',
        x: -40,
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
            {
              pid: 101,
              name: 'Hero',
              cls: 'warrior',
              level: 5,
              hp: 252,
              mhp: 252,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: -40,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Branorabb',
              cls: 'rogue',
              level: 5,
              hp: 70,
              mhp: 100,
              res: 100,
              mres: 100,
              rtype: 'energy',
              x: -38,
              z: 3,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
          {
            id: 102,
            k: 'player',
            nm: 'Branorabb',
            x: -38,
            z: 3,
            hp: 70,
            mhp: 100,
            dead: 0,
            cmb: 0,
          },
        ],
      }),
      {
        playerClass: 'warrior',
      },
    );
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

  it('lets the hosted leader travel for distant restock when recovery is only healer mana', () => {
    expect(
      Math.hypot(NPCS.provisioner_hale.pos.x - 40, NPCS.provisioner_hale.pos.z - 298),
    ).toBeGreaterThan(24);
    const game = fakeGame(
      liveState({
        id: 101,
        nm: 'Hero',
        x: 40,
        z: 298,
        lv: 10,
        hp: 502,
        mhp: 502,
        res: 0,
        mres: 0,
        rtype: 'rage',
        copper: 500,
        inv: [{ itemId: 'lesser_healing_potion', count: 2 }],
        qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_murlocs', 'q_supplies'],
        qlog: [{ questId: 'q_broodmother', counts: [0, 0], state: 'active' }],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Hero',
              cls: 'warrior',
              level: 10,
              hp: 502,
              mhp: 502,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 40,
              z: 298,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Mira',
              cls: 'priest',
              level: 10,
              hp: 237,
              mhp: 237,
              res: 24,
              mres: 100,
              rtype: 'mana',
              x: 38,
              z: 298,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 103,
              name: 'Corin',
              cls: 'mage',
              level: 10,
              hp: 258,
              mhp: 258,
              res: 100,
              mres: 100,
              rtype: 'mana',
              x: 39,
              z: 298,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [
          {
            id: 102,
            k: 'player',
            nm: 'Mira',
            x: 38,
            z: 298,
            hp: 237,
            mhp: 237,
            res: 24,
            mres: 100,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
          {
            id: 103,
            k: 'player',
            nm: 'Corin',
            x: 39,
            z: 298,
            hp: 258,
            mhp: 258,
            res: 100,
            mres: 100,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
        ],
      }),
      {
        playerClass: 'warrior',
      },
    );
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 3,
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(game.moveInputs).toHaveLength(1);
    expect(game.moveInputs[0]).toEqual(
      expect.objectContaining({
        moveInput: { f: 1 },
        facing: expect.any(Number),
      }),
    );
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'recover_party',
      objectiveId: 'restock_fenbridge_rye',
      debug: {
        brainDrivePaused: false,
        travelGoal: {
          target: NPCS.provisioner_hale.pos,
        },
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
    const game = fakeGame(
      liveState({
        id: 102,
        x: 0,
        z: 0,
        target: null,
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior',
              level: 12,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 8,
              z: 0,
              dead: 0,
              inCombat: 1,
              group: 1,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'warrior',
              level: 12,
              hp: 100,
              mhp: 100,
              res: 0,
              mres: 100,
              rtype: 'mana',
              x: 0,
              z: 0,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 501, k: 'mob', h: 80, x: 7, z: 0, aggro: 101 }],
      }),
    );
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
      { cmd: 'target', id: 501 },
      { cmd: 'cast', ability: 'taunt' },
    ]);
    expect(game.moveInputs).toEqual([{ moveInput: {}, facing: Math.PI / 2 }]);
    expect(runtime.status(7)).toMatchObject({
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 8,
    });
  });

  it('has the hosted leader send one party role split before the pull', () => {
    let nowMs = 5_000;
    const game = fakeGame(
      liveState({
        id: 101,
        x: 4,
        z: 6,
        rtype: 'rage',
        mres: 0,
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Hero',
              cls: 'warrior',
              level: 12,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Branorabb',
              cls: 'priest',
              level: 12,
              hp: 90,
              mhp: 90,
              res: 120,
              mres: 120,
              rtype: 'mana',
              x: 5,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 102, k: 'player', nm: 'Branorabb', x: 5, z: 6 }],
      }),
      {
        ambientBotNames: ['Branorabb'],
      },
    );
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

    expect(
      game.commands.some(
        (command) => command.cmd === 'chat' && String(command.text).startsWith('/p '),
      ),
    ).toBe(false);

    nowMs = 6_500;
    (runtime as any).tick();

    expect(
      game.commands.some(
        (command) =>
          command.cmd === 'chat' &&
          typeof command.text === 'string' &&
          command.text.startsWith('/p '),
      ),
    ).toBe(true);
  });

  it('surfaces hosted party roles and coordination intent in debug status', () => {
    const game = fakeGame(
      liveState({
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
            {
              pid: 101,
              name: 'Hero',
              cls: 'warrior',
              level: 12,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage',
              x: 4,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
            {
              pid: 102,
              name: 'Branorabb',
              cls: 'priest',
              level: 12,
              hp: 90,
              mhp: 90,
              res: 120,
              mres: 120,
              rtype: 'mana',
              x: 5,
              z: 6,
              dead: 0,
              inCombat: 0,
              group: 1,
            },
          ],
        },
        entities: [{ id: 102, k: 'player', nm: 'Branorabb', x: 5, z: 6 }],
      }),
      {
        ambientBotNames: ['Branorabb'],
      },
    );
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

    expect(runtime.status(7).debug.party).toEqual(
      expect.objectContaining({
        partyRole: 'tank',
        intentKind: 'route_plan',
        intentBehavior: 'advance',
        intentSummary: expect.stringContaining('Plan the route'),
        intentTargetName: 'Hero',
      }),
    );
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
      entities: [{ id: 201, k: 'npc', tid: 'marshal_redbrook', x: 20, z: 0, lv: 1 }],
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
    const game = fakeGame(
      liveState({
        social: {
          friends: [],
          blocks: [{ id: 201, name: 'Aleph' }],
          guild: null,
        },
      }),
      {
        recentEvents: [
          {
            type: 'chat',
            fromPid: 201,
            from: 'Aleph',
            text: 'hey there',
            channel: 'whisper',
            pid: 11,
          },
        ],
      },
    );
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
