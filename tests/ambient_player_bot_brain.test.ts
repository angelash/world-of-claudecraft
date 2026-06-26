import { describe, expect, it } from 'vitest';
import {
  createAmbientPlayerBotBrainState,
  tickAmbientPlayerBotBrain,
} from '../server/ambient_bots/brain';
import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../server/ambient_bots/ws_client';

function bot(overrides: Partial<AmbientPlayerBotRecord> = {}): AmbientPlayerBotRecord {
  return {
    botId: 'bot-1',
    accountId: 11,
    accountUsername: 'bot_user',
    accountPassword: 'BotPassword123',
    characterId: 101,
    characterName: 'Branoraaa',
    profileId: 'eastbrook_vale_warrior_newcomer',
    class: 'warrior',
    authToken: 'token-1',
    authTokenExpiresAtMs: 200_000,
    lifecycleStatus: 'online',
    provisionState: 'ready',
    levelBand: { min: 1, max: 7 },
    preferredZoneIds: ['eastbrook_vale'],
    lastKnownZoneId: 'eastbrook_vale',
    lastKnownLevel: 1,
    lastKnownX: 0,
    lastKnownZ: 0,
    assignedClusterId: 'eastbrook_vale:1',
    assignedPlayerCharacterId: 1,
    cooldownUntilMs: null,
    reservationUntilMs: null,
    lastRunnerError: '',
    lastRunnerAtMs: null,
    plannerState: {},
    runnerState: {},
    socialState: {},
    ...overrides,
  };
}

function liveState(input: {
  self?: Record<string, unknown>;
  entities?: Array<Record<string, unknown>>;
  seed?: number;
} = {}): AmbientPlayerBotLiveState {
  const self = {
    id: 101,
    x: 0,
    y: 0,
    z: 0,
    lv: 1,
    hp: 40,
    mhp: 40,
    res: 0,
    mres: 0,
    rtype: 'rage',
    gcd: 0,
    inv: [],
    qlog: [],
    qdone: [],
    cds: {},
    ...input.self,
  };
  const entities = new Map<number, Record<string, unknown>>();
  for (const entity of input.entities ?? []) {
    const id = Number(entity.id ?? NaN);
    if (Number.isFinite(id)) entities.set(id, entity);
  }
  entities.set(Number(self.id), { id: self.id, k: 'player', tid: 'warrior', x: self.x, z: self.z, lv: self.lv });
  return {
    pid: 77,
    seed: input.seed ?? 20_061,
    self,
    entities,
  };
}

describe('ambient player bot brain', () => {
  it('targets the starter marshal and interacts to pick up the wolves quest', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: { x: 4, z: 6 },
        entities: [
          { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_wolves');
    expect(result.moveInput).toEqual({});
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7001 },
      { cmd: 'interact' },
    ]);
  });

  it('walks toward the wolf camps when the starter quest is active but no wolf is nearby', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          qlog: [{ questId: 'q_wolves', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_wolves');
    expect(result.moveInput).toEqual({ f: 1 });
    expect(result.commands).toEqual([]);
    expect(typeof result.facing).toBe('number');
  });

  it('casts a ranged damage spell when a mage sees a wolf in quest range', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot({
        class: 'mage',
        profileId: 'eastbrook_vale_mage_newcomer',
      }),
      liveState: liveState({
        self: {
          res: 100,
          mres: 100,
          rtype: 'mana',
          qlog: [{ questId: 'q_wolves', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 9001, k: 'mob', tid: 'forest_wolf', x: 0, z: 20, h: 1, lv: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('combat');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9001 },
      expect.objectContaining({ cmd: 'cast' }),
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('loots a nearby corpse before resuming the quest route', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          qlog: [{ questId: 'q_wolves', counts: [3], state: 'active' }],
        },
        entities: [
          { id: 9002, k: 'mob', tid: 'forest_wolf', x: 0, z: 3, h: 1, lv: 1, dead: 1, loot: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('loot');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9002 },
      { cmd: 'loot', id: 9002 },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('returns to Marshal Redbrook and interacts when the wolves quest is ready to turn in', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          x: 4,
          z: 6,
          qlog: [{ questId: 'q_wolves', counts: [8], state: 'ready' }],
        },
        entities: [
          { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('turnin_wolves');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7001 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('routes to the vendor after the starter quest when carrying junk', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          x: -7,
          z: 3,
          inv: [{ itemId: 'wolf_fang', count: 3 }],
          qdone: ['q_wolves'],
        },
        entities: [
          { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('sell_junk');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7100 },
      { cmd: 'sell_all_junk' },
    ]);
  });

  it('picks up the boar-hide quest once the bot outlevels the starter wolf loop', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 2,
          x: -7,
          z: 3,
          qdone: ['q_wolves'],
        },
        entities: [
          { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_boars');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7100 },
      { cmd: 'interact' },
    ]);
  });

  it('turns in the spider quest at Apothecary Lin once the silk run is ready', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 3,
          x: 11,
          z: -3,
          qdone: ['q_wolves', 'q_boars'],
          qlog: [{ questId: 'q_spiders', counts: [6, 4], state: 'ready' }],
        },
        entities: [
          { id: 7200, k: 'npc', tid: 'apothecary_lin', x: 11, z: -3 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('turnin_spiders');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7200 },
      { cmd: 'interact' },
    ]);
  });

  it('targets and interacts with a nearby supply crate when the supplies quest is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 4,
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_murlocs'],
          qlog: [{ questId: 'q_supplies', counts: [1], state: 'active' }],
        },
        entities: [
          { id: 9401, k: 'object', obj: 'supply_crate', x: 2, z: 2, loot: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('collect_supplies');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9401 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('targets and interacts with the gravecaller sigil when the Aldric clue quest is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 5,
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_murlocs', 'q_supplies', 'q_mine', 'q_greyjaw', 'q_bandits', 'q_ringleader', 'q_bones'],
          qlog: [{ questId: 'q_whispers', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 9501, k: 'object', obj: 'gravecaller_sigil', x: 3, z: 1, loot: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('collect_whispers');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9501 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('picks up q_rite from Brother Aldric after the earlier chapel chain is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
          x: 6,
          z: 6,
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
          ],
        },
        entities: [
          { id: 9600, k: 'npc', tid: 'brother_aldric', x: 6, z: 6 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_rite');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9600 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('routes toward tunnel rats while the blessed tallow objective for q_rite is still incomplete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
          qlog: [{ questId: 'q_rite', counts: [0, 0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_rite_blessed_wax');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('leaves tunnel rats alone and switches to restless bones once blessed tallow is complete for q_rite', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
          qlog: [{ questId: 'q_rite', counts: [4, 0], state: 'active' }],
        },
        entities: [
          { id: 9601, k: 'mob', tid: 'tunnel_rat', x: 2, z: 2, h: 1, lv: 4 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_rite_ghostly_essence');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('stays on the Old Greyjaw route instead of chasing unrelated wolves', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 4,
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_murlocs', 'q_mine'],
          qlog: [{ questId: 'q_greyjaw', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 9301, k: 'mob', tid: 'forest_wolf', x: 2, z: 2, h: 1, lv: 2 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_greyjaw');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('resets movement when the bot has been stuck on the same path too long', () => {
    const state = createAmbientPlayerBotBrainState();
    tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          qlog: [{ questId: 'q_wolves', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          qlog: [{ questId: 'q_wolves', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 6_000,
    }, state);

    expect(state.stuckResets).toBe(1);
    expect(result.moveInput).toEqual({});
    expect(result.commands).toEqual([
      { cmd: 'stopattack' },
      { cmd: 'target', id: null },
    ]);
  });
});
