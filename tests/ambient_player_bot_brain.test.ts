import { describe, expect, it } from 'vitest';
import { resolveMovement } from '../src/sim/colliders';
import { DT, INTERACT_RANGE, RUN_SPEED } from '../src/sim/types';
import {
  continueAmbientPlayerBotTravel,
  createAmbientPlayerBotBrainState,
  markAmbientPlayerBotBrainExternalProgress,
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

const mirefenThroughCultCamp = [
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
  'q_rite',
  'q_fenbridge_muster',
  'q_prowlers',
  'q_prowler_pelts',
  'q_fen_supplies',
  'q_deepfen',
  'q_idols',
  'q_deepfen_purge',
  'q_widows',
  'q_broodmother',
  'q_drowned',
  'q_drowned_censers',
  'q_no_rest',
  'q_trolls',
  'q_troll_fetishes',
  'q_grubjaw',
  'q_cult_camp',
] as const;

const mirefenThroughSummoners = [...mirefenThroughCultCamp, 'q_summoners'] as const;
const mirefenThroughDeacon = [...mirefenThroughSummoners, 'q_deacon'] as const;
const mirefenThroughBastionDoor = [...mirefenThroughDeacon, 'q_bastion_door'] as const;
const mirefenThroughMistcaller = [...mirefenThroughBastionDoor, 'q_olen', 'q_mistcaller'] as const;
const thornpeakThroughStarters = [
  ...mirefenThroughMistcaller,
  'q_highwatch_summons',
  'q_stalkers',
  'q_stalker_pelts',
  'q_kobold_tunnels',
  'q_glowing_wax',
] as const;
const thornpeakThroughWarfront = [
  ...thornpeakThroughStarters,
  'q_ogre_edges',
  'q_ogre_totems',
  'q_ogre_bounty',
  'q_elementals',
  'q_shard_cores',
  'q_kazzix',
] as const;
const thornpeakThroughLateOutdoors = [
  ...thornpeakThroughWarfront,
  'q_zealots',
  'q_cult_orders',
  'q_necromancers',
  'q_revenants',
  'q_revenant_vanguard',
] as const;
const thornpeakThroughSanctumGate = [
  ...thornpeakThroughLateOutdoors,
  'q_wyrm_sigils',
  'q_breaking_the_seal',
  'q_voice_below',
  'q_sanctum_gate',
] as const;
const thornpeakThroughWarCampGroups = [
  ...thornpeakThroughSanctumGate,
  'q_crushers',
  'q_drogmar',
] as const;
const thornpeakThroughKorgath = [...thornpeakThroughWarCampGroups, 'q_korgath'] as const;
const thornpeakThroughVelkhar = [...thornpeakThroughKorgath, 'q_velkhar'] as const;
const bastionSlot0Origin = { x: 1500, z: -1250 } as const;
const sanctumSlot0Origin = { x: 2100, z: -1250 } as const;

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

  it('does not skip a fence-corner waypoint before the bot has cleared it', () => {
    const state = createAmbientPlayerBotBrainState();
    const seed = 20_061;
    let pos = { x: -19.91, z: 4.95 };
    const baseSelf = {
      lv: 4,
      qdone: ['q_wolves'],
    };
    const initial = tickAmbientPlayerBotBrain({
      bot: bot({
        lastKnownLevel: 4,
      }),
      liveState: liveState({
        seed,
        self: {
          ...baseSelf,
          x: pos.x,
          z: pos.z,
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(initial.objectiveId).toBe('accept_boars');
    expect(initial.travelGoal).toMatchObject({
      target: { x: -7, z: 3 },
    });

    const goal = initial.travelGoal!;
    let reached = false;
    let zeroMoveTicks = 0;
    for (let i = 0; i < 90; i++) {
      const drive = continueAmbientPlayerBotTravel(
        liveState({
          seed,
          self: {
            ...baseSelf,
            x: pos.x,
            z: pos.z,
          },
        }),
        state,
        initial.objectiveId,
        initial.objectiveLabel,
        goal,
      );
      expect(drive).not.toBeNull();
      if (!drive!.moveInput.f) {
        reached = true;
        break;
      }
      expect(typeof drive!.facing).toBe('number');
      const next = {
        x: pos.x + Math.sin(drive!.facing!) * RUN_SPEED * DT,
        z: pos.z + Math.cos(drive!.facing!) * RUN_SPEED * DT,
      };
      const moved = resolveMovement(seed, pos.x, pos.z, next.x, next.z);
      if (Math.hypot(moved.x - pos.x, moved.z - pos.z) < 0.01) zeroMoveTicks++;
      pos = moved;
    }

    expect(zeroMoveTicks).toBe(0);
    expect(reached || Math.hypot(pos.x - goal.target.x, pos.z - goal.target.z) <= goal.arrivalRange).toBe(true);
  });

  it('picks up the boar route at level 3 instead of grinding wolves to 4', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 3,
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
    expect(result.moveInput).toEqual({});
  });

  it('picks up a nearby eligible quest before leaving for an active route', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 3,
          x: -7,
          z: 3,
          inv: [
            { itemId: 'baked_bread', count: 4 },
            { itemId: 'minor_healing_potion', count: 3 },
          ],
          qdone: ['q_wolves'],
          qlog: [{ questId: 'q_boars', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_supplies');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7100 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
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
          auras: [
            { id: 'frost_armor', kind: 'buff_armor', rem: 1_700, dur: 1_800 },
            { id: 'arcane_intellect', kind: 'buff_int', rem: 1_700, dur: 1_800 },
          ],
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

  it('prepares mage armor before pulling a quest wolf', () => {
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
          { id: 9003, k: 'mob', tid: 'forest_wolf', x: 0, z: 20, h: 1, lv: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('prepare_combat');
    expect(result.commands).toEqual([{ cmd: 'cast', ability: 'frost_armor' }]);
    expect(result.moveInput).toEqual({});
  });

  it('drinks before a pull when a prepared mage is low on mana', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot({
        class: 'mage',
        profileId: 'eastbrook_vale_mage_newcomer',
      }),
      liveState: liveState({
        self: {
          res: 20,
          mres: 100,
          rtype: 'mana',
          inv: [{ itemId: 'spring_water', count: 1 }],
          auras: [
            { id: 'frost_armor', kind: 'buff_armor', rem: 1_700, dur: 1_800 },
            { id: 'arcane_intellect', kind: 'buff_int', rem: 1_700, dur: 1_800 },
          ],
          qlog: [{ questId: 'q_wolves', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 9004, k: 'mob', tid: 'forest_wolf', x: 0, z: 20, h: 1, lv: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('recover');
    expect(result.commands).toEqual([{ cmd: 'use', item: 'spring_water' }]);
    expect(result.moveInput).toEqual({});
  });

  it('summons a warlock demon before pulling when no owned pet is present', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot({
        class: 'warlock',
        profileId: 'eastbrook_vale_warlock_newcomer',
      }),
      liveState: liveState({
        self: {
          res: 100,
          mres: 100,
          rtype: 'mana',
          qlog: [{ questId: 'q_wolves', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 9005, k: 'mob', tid: 'forest_wolf', x: 0, z: 20, h: 1, lv: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('prepare_combat');
    expect(result.commands).toEqual([{ cmd: 'cast', ability: 'summon_imp' }]);
    expect(result.moveInput).toEqual({});
  });

  it('does not recast a warlock summon when an owned pet is already active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot({
        class: 'warlock',
        profileId: 'eastbrook_vale_warlock_newcomer',
      }),
      liveState: liveState({
        self: {
          res: 100,
          mres: 100,
          rtype: 'mana',
          auras: [{ id: 'demon_skin', kind: 'buff_armor', rem: 1_700, dur: 1_800 }],
          qlog: [{ questId: 'q_wolves', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 9101, k: 'mob', tid: 'imp', x: 1, z: 1, own: 101, lv: 1 },
          { id: 9006, k: 'mob', tid: 'forest_wolf', x: 0, z: 20, h: 1, lv: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('combat');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9006 },
      expect.objectContaining({ cmd: 'cast' }),
    ]);
    expect(result.commands).not.toContainEqual({ cmd: 'cast', ability: 'summon_imp' });
  });

  it('fights immediately instead of preparing when the mob is already threatening the bot', () => {
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
          { id: 9007, k: 'mob', tid: 'forest_wolf', x: 0, z: 20, h: 1, lv: 1, aggro: 101 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('combat');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9007 },
      expect.objectContaining({ cmd: 'cast' }),
    ]);
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

  it('fights an active threat before looting a nearby corpse', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          qlog: [{ questId: 'q_wolves', counts: [3], state: 'active' }],
        },
        entities: [
          { id: 9002, k: 'mob', tid: 'forest_wolf', x: 0, z: 2, h: 1, lv: 1, dead: 1, loot: 1 },
          { id: 9003, k: 'mob', tid: 'forest_wolf', x: 0, z: 3, h: 1, lv: 1, aggro: 101 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('combat');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9003 },
      { cmd: 'attack' },
    ]);
    expect(result.commands).not.toContainEqual({ cmd: 'loot', id: 9002 });
  });

  it('skips nearby corpses tapped by another solo player', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          qlog: [{ questId: 'q_wolves', counts: [3], state: 'active' }],
        },
        entities: [
          {
            id: 9010,
            k: 'mob',
            tid: 'forest_wolf',
            x: 1,
            z: 0,
            h: 1,
            dead: 1,
            loot: 1,
            tap: 202,
            lootList: { copper: 8, items: [{ itemId: 'wolf_fang', count: 1 }] },
          },
          {
            id: 9011,
            k: 'mob',
            tid: 'forest_wolf',
            x: 1.5,
            z: 0,
            h: 1,
            dead: 1,
            loot: 1,
            tap: 101,
            lootList: { copper: 7, items: [{ itemId: 'wolf_fang', count: 1 }] },
          },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('loot');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9011 },
      { cmd: 'loot', id: 9011 },
    ]);
  });

  it('loots personal corpse drops even when another player tapped the mob', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          qlog: [{ questId: 'q_wolves', counts: [3], state: 'active' }],
        },
        entities: [
          {
            id: 9012,
            k: 'mob',
            tid: 'forest_wolf',
            x: 1,
            z: 0,
            h: 1,
            dead: 1,
            loot: 1,
            tap: 202,
            lootList: {
              copper: 0,
              items: [{ itemId: 'wolf_fang', count: 1, personalFor: [101] }],
            },
          },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('loot');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9012 },
      { cmd: 'loot', id: 9012 },
    ]);
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

  it('uses the vendor stop to sell junk before buying fresh food after the starter quest', () => {
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

    expect(result.objectiveId).toBe('restock_food_and_drink');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7100 },
      { cmd: 'sell_all_junk' },
    ]);
  });

  it('restsocks food from Trader Wilkes before leaving town for an active combat quest', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 2,
          x: -7,
          z: 3,
          copper: 150,
          qdone: ['q_wolves'],
          qlog: [{ questId: 'q_boars', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('restock_food_and_drink');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7100 },
      { cmd: 'buy', npc: 7100, item: 'baked_bread' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('waits to recover instead of pulling another mob while low health and unthreatened', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 2,
          hp: 70,
          mhp: 128,
          inv: [{ itemId: 'baked_bread', count: 1 }],
          qdone: ['q_wolves'],
          qlog: [{ questId: 'q_boars', counts: [2], state: 'active' }],
        },
        entities: [
          { id: 8101, k: 'mob', tid: 'wild_boar', x: 2, z: 0, h: true },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('recover');
    expect(result.objectiveLabel).toBe('Recovering between pulls');
    expect(result.commands).toEqual([{ cmd: 'use', item: 'baked_bread' }]);
    expect(result.moveInput).toEqual({});
  });

  it('uses a healing potion while threatened at dangerous health', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 3,
          hp: 60,
          mhp: 214,
          inv: [{ itemId: 'minor_healing_potion', count: 1 }],
          qdone: ['q_wolves'],
          qlog: [{ questId: 'q_boars', counts: [4], state: 'active' }],
        },
        entities: [
          { id: 8101, k: 'mob', tid: 'wild_boar', x: 2, z: 0, h: true, aggro: 101 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('recover');
    expect(result.commands).toEqual([{ cmd: 'use', item: 'minor_healing_potion' }]);
    expect(result.moveInput).toEqual({});
  });

  it('retreats from a single threat at emergency health before continuing a restock objective', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 4,
          x: -75,
          z: 58,
          hp: 31,
          mhp: 144,
          target: 9101,
          auto: true,
          copper: 100,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves', 'q_boars', 'q_spiders'],
          qlog: [{ questId: 'q_murlocs', counts: [3], state: 'active' }],
        },
        entities: [
          { id: 9101, k: 'mob', tid: 'mudfin_murloc', x: -74, z: 59, h: true, aggro: 101 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('recover');
    expect(result.objectiveLabel).toBe('Retreating from a dangerous pull');
    expect(result.travelGoal?.goalKey).toBe('retreat:trader_wilkes');
    expect(result.commands).toEqual([
      { cmd: 'stopattack' },
      { cmd: 'target', id: null },
    ]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('retreats from a multi-mob pull instead of standing in the murloc camp', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
          x: -75,
          z: 50,
          hp: 220,
          mhp: 290,
          target: 9101,
          auto: true,
          inv: [
            { itemId: 'baked_bread', count: 4 },
            { itemId: 'minor_healing_potion', count: 3 },
          ],
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw'],
          qlog: [{ questId: 'q_murlocs', counts: [7], state: 'active' }],
        },
        entities: [
          { id: 9101, k: 'mob', tid: 'mudfin_murloc', x: -73, z: 49, h: true, aggro: 101 },
          { id: 9102, k: 'mob', tid: 'mudfin_murloc', x: -77, z: 52, h: true, aggro: 101 },
          { id: 9103, k: 'mob', tid: 'mudfin_murloc', x: -80, z: 54, h: true, aggro: 101 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('recover');
    expect(result.objectiveLabel).toBe('Retreating from a dangerous pull');
    expect(result.travelGoal?.goalKey).toBe('retreat:trader_wilkes');
    expect(result.commands).toEqual([
      { cmd: 'stopattack' },
      { cmd: 'target', id: null },
    ]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('uses a potion while retreating from a low-health multi-mob pull', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
          x: -75,
          z: 50,
          hp: 150,
          mhp: 290,
          target: 9101,
          auto: true,
          inv: [
            { itemId: 'baked_bread', count: 4 },
            { itemId: 'minor_healing_potion', count: 1 },
          ],
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw'],
          qlog: [{ questId: 'q_murlocs', counts: [7], state: 'active' }],
        },
        entities: [
          { id: 9101, k: 'mob', tid: 'mudfin_murloc', x: -73, z: 49, h: true, aggro: 101 },
          { id: 9102, k: 'mob', tid: 'mudfin_murloc', x: -77, z: 52, h: true, aggro: 101 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('recover');
    expect(result.commands).toEqual([
      { cmd: 'use', item: 'minor_healing_potion' },
      { cmd: 'stopattack' },
      { cmd: 'target', id: null },
    ]);
    expect(result.travelGoal?.goalKey).toBe('retreat:trader_wilkes');
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('does not use the dangerous-pull retreat for early wolf grinding', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 2,
          x: -6,
          z: 35,
          hp: 122,
          mhp: 138,
          target: 8101,
          auto: true,
          inv: [
            { itemId: 'baked_bread', count: 4 },
            { itemId: 'minor_healing_potion', count: 3 },
          ],
          qdone: ['q_wolves'],
        },
        entities: [
          { id: 8101, k: 'mob', tid: 'forest_wolf', x: -5, z: 36, h: true, aggro: 101 },
          { id: 8102, k: 'mob', tid: 'forest_wolf', x: -7, z: 37, h: true, aggro: 101 },
          { id: 8103, k: 'mob', tid: 'forest_wolf', x: -9, z: 38, h: true, aggro: 101 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('combat');
    expect(result.objectiveLabel).toBe('Grinding Forest Wolf');
    expect(result.travelGoal).toBeUndefined();
  });

  it('restocks healing potions before resuming an outdoor combat quest', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 4,
          x: -7,
          z: 3,
          copper: 100,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves'],
          qlog: [{ questId: 'q_boars', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('restock_minor_healing_potion');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7100 },
      { cmd: 'buy', npc: 7100, item: 'minor_healing_potion' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('restocks spring water for mana classes before resuming an active quest route', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot({
        class: 'mage',
        profileId: 'eastbrook_vale_mage_newcomer',
      }),
      liveState: liveState({
        self: {
          lv: 4,
          x: -7,
          z: 3,
          copper: 200,
          res: 100,
          mres: 100,
          rtype: 'mana',
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw'],
          qlog: [{ questId: 'q_murlocs', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('restock_food_and_drink');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7100 },
      { cmd: 'buy', npc: 7100, item: 'spring_water' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('grinds instead of forcing an accepted murloc quest below the safe route level', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 4,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw'],
          qlog: [{ questId: 'q_murlocs', counts: [5], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('grind');
    expect(result.objectiveLabel).toBe('Grinding Webwood Lurker');
    expect(result.travelGoal?.goalKey).toBe('camp:webwood_spider:0');
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('uses nearby party strength to pursue an accepted quest one level below the solo safe level', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          id: 101,
          lv: 5,
          x: 100,
          z: 100,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw', 'q_supplies'],
          qlog: [{ questId: 'q_murlocs', counts: [5], state: 'active' }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 5, hp: 90, mhp: 90, res: 0, mres: 0, rtype: 'rage', x: 100, z: 100, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'priest', level: 5, hp: 75, mhp: 75, res: 90, mres: 90, rtype: 'mana', x: 102, z: 100, dead: 0, inCombat: 0, group: 1 },
              { pid: 103, name: 'Branoracc', cls: 'mage', level: 5, hp: 70, mhp: 70, res: 100, mres: 100, rtype: 'mana', x: 103, z: 100, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        },
        entities: [
          { id: 102, k: 'player', tid: 'priest', lv: 5, x: 102, z: 100, dead: 0 },
          { id: 103, k: 'player', tid: 'mage', lv: 5, x: 103, z: 100, dead: 0 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_murlocs');
    expect(result.objectiveLabel).toBe('Driving back the Mudfin');
    expect(result.travelGoal?.goalKey).toBe('camp:mudfin_murloc:0');
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('uses a nearby full party to pursue a safe route two levels below the solo gate', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          id: 101,
          lv: 4,
          x: 100,
          z: 100,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw'],
          qlog: [{ questId: 'q_murlocs', counts: [2], state: 'active' }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 4, hp: 100, mhp: 100, res: 0, mres: 0, rtype: 'rage', x: 100, z: 100, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'priest', level: 4, hp: 75, mhp: 75, res: 90, mres: 90, rtype: 'mana', x: 102, z: 100, dead: 0, inCombat: 0, group: 1 },
              { pid: 103, name: 'Branoracc', cls: 'mage', level: 4, hp: 70, mhp: 70, res: 100, mres: 100, rtype: 'mana', x: 103, z: 100, dead: 0, inCombat: 0, group: 1 },
              { pid: 104, name: 'Branoradd', cls: 'paladin', level: 4, hp: 95, mhp: 95, res: 90, mres: 90, rtype: 'mana', x: 104, z: 100, dead: 0, inCombat: 0, group: 1 },
              { pid: 105, name: 'Branoraee', cls: 'druid', level: 4, hp: 80, mhp: 80, res: 95, mres: 95, rtype: 'mana', x: 105, z: 100, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        },
        entities: [
          { id: 102, k: 'player', tid: 'priest', lv: 4, x: 102, z: 100, dead: 0 },
          { id: 103, k: 'player', tid: 'mage', lv: 4, x: 103, z: 100, dead: 0 },
          { id: 104, k: 'player', tid: 'paladin', lv: 4, x: 104, z: 100, dead: 0 },
          { id: 105, k: 'player', tid: 'druid', lv: 4, x: 105, z: 100, dead: 0 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_murlocs');
    expect(result.objectiveLabel).toBe('Driving back the Mudfin');
    expect(result.travelGoal?.goalKey).toBe('camp:mudfin_murloc:0');
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('does not use full-party strength to travel early for a distant Fenbridge pickup', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          id: 101,
          lv: 4,
          x: 0,
          z: 0,
          inv: [{ itemId: 'baked_bread', count: 4 }],
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
            'q_rite',
          ],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 4, hp: 100, mhp: 100, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'priest', level: 4, hp: 75, mhp: 75, res: 90, mres: 90, rtype: 'mana', x: 2, z: 0, dead: 0, inCombat: 0, group: 1 },
              { pid: 103, name: 'Branoracc', cls: 'mage', level: 4, hp: 70, mhp: 70, res: 100, mres: 100, rtype: 'mana', x: 3, z: 0, dead: 0, inCombat: 0, group: 1 },
              { pid: 104, name: 'Branoradd', cls: 'paladin', level: 4, hp: 95, mhp: 95, res: 90, mres: 90, rtype: 'mana', x: 4, z: 0, dead: 0, inCombat: 0, group: 1 },
              { pid: 105, name: 'Branoraee', cls: 'druid', level: 4, hp: 80, mhp: 80, res: 95, mres: 95, rtype: 'mana', x: 5, z: 0, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        },
        entities: [
          { id: 102, k: 'player', tid: 'priest', lv: 4, x: 2, z: 0, dead: 0 },
          { id: 103, k: 'player', tid: 'mage', lv: 4, x: 3, z: 0, dead: 0 },
          { id: 104, k: 'player', tid: 'paladin', lv: 4, x: 4, z: 0, dead: 0 },
          { id: 105, k: 'player', tid: 'druid', lv: 4, x: 5, z: 0, dead: 0 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('grind');
    expect(result.objectiveLabel).toBe('Grinding Webwood Lurker');
    expect(result.travelGoal?.goalKey).toBe('camp:webwood_spider:0');
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('does not use party strength to enter the dense supplies camp early', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          id: 101,
          lv: 5,
          x: 100,
          z: 100,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_murlocs', 'q_greyjaw'],
          qlog: [{ questId: 'q_supplies', counts: [1], state: 'active' }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 5, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 100, z: 100, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'priest', level: 5, hp: 75, mhp: 75, res: 90, mres: 90, rtype: 'mana', x: 102, z: 100, dead: 0, inCombat: 0, group: 1 },
              { pid: 103, name: 'Branoracc', cls: 'mage', level: 5, hp: 70, mhp: 70, res: 100, mres: 100, rtype: 'mana', x: 103, z: 100, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        },
        entities: [
          { id: 102, k: 'player', tid: 'priest', lv: 5, x: 102, z: 100, dead: 0 },
          { id: 103, k: 'player', tid: 'mage', lv: 5, x: 103, z: 100, dead: 0 },
          { id: 9401, k: 'object', obj: 'supply_crate', x: 102, z: 100, loot: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).not.toBe('collect_supplies');
    expect(result.objectiveLabel).not.toBe('Recovering Stolen Supplies');
  });

  it('does not rush a higher route when nearby party members are below the grouped safe level', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          id: 101,
          lv: 5,
          x: 100,
          z: 100,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_murlocs', 'q_supplies', 'q_greyjaw'],
          qlog: [{ questId: 'q_mine', counts: [0], state: 'active' }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 5, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 100, z: 100, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'priest', level: 4, hp: 75, mhp: 75, res: 90, mres: 90, rtype: 'mana', x: 102, z: 100, dead: 0, inCombat: 0, group: 1 },
              { pid: 103, name: 'Branoracc', cls: 'mage', level: 4, hp: 70, mhp: 70, res: 100, mres: 100, rtype: 'mana', x: 103, z: 100, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        },
        entities: [
          { id: 102, k: 'player', tid: 'priest', lv: 4, x: 102, z: 100, dead: 0 },
          { id: 103, k: 'player', tid: 'mage', lv: 4, x: 103, z: 100, dead: 0 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('grind');
    expect(result.objectiveLabel).toBe('Grinding Webwood Lurker');
    expect(result.travelGoal?.goalKey).toBe('camp:webwood_spider:0');
  });

  it('resumes the murloc quest once the bot reaches the safe route level', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves', 'q_boars', 'q_spiders'],
          qlog: [{ questId: 'q_murlocs', counts: [5], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_murlocs');
    expect(result.objectiveLabel).toBe('Driving back the Mudfin');
    expect(result.travelGoal?.goalKey).toBe('camp:mudfin_murloc:0');
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('keeps grinding spiders at level 5 instead of rushing an accepted murloc quest', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 5,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw'],
          qlog: [{ questId: 'q_murlocs', counts: [3], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('grind');
    expect(result.objectiveLabel).toBe('Grinding Webwood Lurker');
    expect(result.travelGoal?.goalKey).toBe('camp:webwood_spider:0');
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('keeps pursuing Greyjaw when later level-6 routes are active but still deferred', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 5,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_murlocs'],
          qlog: [
            { questId: 'q_supplies', counts: [0], state: 'active' },
            { questId: 'q_greyjaw', counts: [0], state: 'active' },
            { questId: 'q_bandits', counts: [0], state: 'active' },
            { questId: 'q_mine', counts: [0], state: 'active' },
          ],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_greyjaw');
    expect(result.objectiveLabel).toBe('Hunting Old Greyjaw');
    expect(result.travelGoal?.goalKey).toBe('camp:old_greyjaw:0');
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up the bandit quest at level 5 before deciding when to enter the camp', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 5,
          copper: 200,
          inv: [
            { itemId: 'baked_bread', count: 4 },
            { itemId: 'minor_healing_potion', count: 2 },
          ],
          equip: { mainhand: 'vale_carving_knife' },
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw'],
        },
        entities: [
          { id: 7300, k: 'npc', tid: 'marshal_redbrook', x: 0, z: 0 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_bandits');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7300 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('uses pathing while chasing a distant combat target after the Greyjaw turn-in', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 4,
          x: 7.35,
          z: 7.99,
          hp: 214,
          mhp: 214,
          copper: 0,
          inv: [
            { itemId: 'baked_bread', count: 4 },
            { itemId: 'minor_healing_potion', count: 3 },
          ],
          equip: { mainhand: 'vale_carving_knife' },
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw'],
        },
        entities: [
          { id: 39, k: 'mob', tid: 'webwood_spider', x: -45, z: 12, h: true },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('combat');
    expect(result.objectiveLabel).toBe('Grinding Webwood Lurker');
    expect(result.travelGoal?.goalKey).toBe('target:39:-45:12');
    expect(result.commands).toEqual([{ cmd: 'target', id: 39 }]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('buys an affordable weapon upgrade before accepting the murloc quest', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
          x: 7,
          z: 16.5,
          copper: 1_500,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          equip: { mainhand: 'worn_sword', chest: 'recruit_tunic' },
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw'],
        },
        entities: [
          { id: 7200, k: 'npc', tid: 'smith_haldren', x: 7, z: 16.5 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('buy_eastbrook_arming_sword');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7200 },
      { cmd: 'buy', npc: 7200, item: 'eastbrook_arming_sword' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('sells redundant gear at the smith when that funds a weapon upgrade', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
          x: 7,
          z: 16.5,
          copper: 1_290,
          inv: [
            { itemId: 'baked_bread', count: 4 },
            { itemId: 'milepost_boots', count: 2 },
          ],
          equip: { mainhand: 'worn_sword', chest: 'recruit_tunic', feet: 'milepost_boots' },
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw'],
        },
        entities: [
          { id: 7200, k: 'npc', tid: 'smith_haldren', x: 7, z: 16.5 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('buy_eastbrook_arming_sword');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7200 },
      { cmd: 'sell', item: 'milepost_boots', count: 1 },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('turns in a ready quest instead of detouring to buy a weapon', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
          x: 11,
          z: -3,
          copper: 1_500,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          equip: { mainhand: 'worn_sword', chest: 'recruit_tunic' },
          qdone: ['q_wolves', 'q_boars'],
          qlog: [{ questId: 'q_spiders', counts: [6, 4], state: 'ready' }],
        },
        entities: [
          { id: 7101, k: 'npc', tid: 'apothecary_lin', x: 11, z: -3 },
          { id: 7200, k: 'npc', tid: 'smith_haldren', x: 7, z: 16.5 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('turnin_spiders');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 7101 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('equips a backpack armor upgrade before pulling the next target', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 4,
          inv: [{ itemId: 'trail_leggings', count: 1 }],
          equip: { mainhand: 'worn_sword', chest: 'recruit_tunic' },
          qdone: ['q_wolves', 'q_boars', 'q_spiders'],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('equip_upgrade');
    expect(result.objectiveLabel).toBe('Equipping gear upgrade');
    expect(result.commands).toEqual([{ cmd: 'equip', item: 'trail_leggings' }]);
    expect(result.moveInput).toEqual({});
  });

  it('equips a backpack weapon upgrade before pulling the next target', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 5,
          inv: [{ itemId: 'redbrook_blade', count: 1 }],
          equip: { mainhand: 'worn_sword', chest: 'recruit_tunic' },
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw'],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('equip_upgrade');
    expect(result.commands).toEqual([{ cmd: 'equip', item: 'redbrook_blade' }]);
    expect(result.moveInput).toEqual({});
  });

  it('uses Provisioner Hale for north-zone food and drink restocking once the bot is questing in Mirefen', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot({
        class: 'mage',
        profileId: 'eastbrook_vale_mage_newcomer',
      }),
      liveState: liveState({
        self: {
          lv: 8,
          x: -4,
          z: 308,
          copper: 900,
          res: 100,
          mres: 100,
          rtype: 'mana',
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
          ],
          qlog: [{ questId: 'q_widows', counts: [0, 0], state: 'active' }],
        },
        entities: [
          { id: 9800, k: 'npc', tid: 'provisioner_hale', x: -4, z: 308 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('restock_food_and_drink');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9800 },
      { cmd: 'buy', npc: 9800, item: 'fenbridge_rye' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('takes the boar route once the bot reaches level 3', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 3,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves'],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_boars');
    expect(result.travelGoal?.goalKey).toBe('npc:trader_wilkes');
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up the boar-hide quest once the bot outlevels the starter wolf loop', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 4,
          x: -7,
          z: 3,
          copper: 200,
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

  it('turns in a ready quest instead of fighting a stale non-aggro target', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 4,
          x: 37,
          z: 7,
          hp: 176,
          mhp: 176,
          target: 8101,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves'],
          qlog: [{ questId: 'q_boars', counts: [5], state: 'ready' }],
        },
        entities: [
          { id: 8101, k: 'mob', tid: 'wild_boar', x: 38, z: 7, h: true },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('turnin_boars');
    expect(result.travelGoal?.goalKey).toBe('npc:trader_wilkes');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
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
          lv: 6,
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

  it('grinds instead of forcing an accepted supplies quest below the safe route level', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 4,
          inv: [{ itemId: 'baked_bread', count: 4 }],
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_murlocs', 'q_greyjaw'],
          qlog: [{ questId: 'q_supplies', counts: [1], state: 'active' }],
        },
        entities: [
          { id: 9401, k: 'object', obj: 'supply_crate', x: 2, z: 2, loot: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('grind');
    expect(result.objectiveLabel).toBe('Grinding Webwood Lurker');
    expect(result.travelGoal?.goalKey).toBe('camp:webwood_spider:0');
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('keeps walking to a supply crate until it is inside pickup range', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
          qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_murlocs'],
          qlog: [{ questId: 'q_supplies', counts: [1], state: 'active' }],
        },
        entities: [
          { id: 9401, k: 'object', obj: 'supply_crate', x: INTERACT_RANGE + 0.75, z: 0, loot: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('collect_supplies');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
    expect(result.travelGoal).toMatchObject({
      target: { x: INTERACT_RANGE + 0.75, z: 0 },
      arrivalRange: INTERACT_RANGE,
    });
  });

  it('targets and interacts with the gravecaller sigil when the Aldric clue quest is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
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

  it('picks up the Fenbridge muster handoff from Brother Aldric after q_rite is complete', () => {
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
            'q_rite',
          ],
        },
        entities: [
          { id: 9700, k: 'npc', tid: 'brother_aldric', x: 6, z: 6 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_fenbridge_muster');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9700 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('heads north along the causeway when the Fenbridge muster order is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
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
            'q_rite',
          ],
          qlog: [{ questId: 'q_fenbridge_muster', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('collect_fenbridge_muster');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
    expect(typeof result.facing).toBe('number');
  });

  it('turns in the Fenbridge muster quest at Warden Fenwick after the gatepost pickup', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
          x: 3,
          z: 304,
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
            'q_rite',
          ],
          qlog: [{ questId: 'q_fenbridge_muster', counts: [1], state: 'ready' }],
        },
        entities: [
          { id: 9701, k: 'npc', tid: 'warden_fenwick', x: 3, z: 304 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('turnin_fenbridge_muster');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9701 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('hunts mire prowlers after the Fenbridge handoff is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 6,
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
            'q_rite',
            'q_fenbridge_muster',
          ],
          qlog: [{ questId: 'q_prowlers', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_prowlers');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('targets and interacts with lost caravan goods when the Fenbridge supply quest is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 7,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
          ],
          qlog: [{ questId: 'q_fen_supplies', counts: [1], state: 'active' }],
        },
        entities: [
          { id: 9702, k: 'object', obj: 'lost_caravan_goods', x: 2, z: 2, loot: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('collect_fen_supplies');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9702 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('routes toward Deepfen snappers to recover Aldrics idols once the first cull is done', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 7,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
          ],
          qlog: [{ questId: 'q_idols', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_idols');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up the Deepfen purge follow-up from Warden Fenwick after the idols are turned in', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 7,
          x: 3,
          z: 304,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
          ],
        },
        entities: [
          { id: 9703, k: 'npc', tid: 'warden_fenwick', x: 3, z: 304 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_deepfen_purge');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9703 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('picks up the widow-thicket quest from Herbalist Yara after the Deepfen purge chain is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 8,
          x: 10,
          z: 295,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
          ],
        },
        entities: [
          { id: 9801, k: 'npc', tid: 'herbalist_yara', x: 10, z: 295 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_widows');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9801 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('keeps hunting Mirefen widows while the mixed kill-and-drop widow quest is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 8,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
          ],
          qlog: [{ questId: 'q_widows', counts: [7, 4], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_widows');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up the drowned-dead quest from Brother Aldric in Fenbridge after the widow chain', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 9,
          x: -8,
          z: 296,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
            'q_widows',
          ],
        },
        entities: [
          { id: 9802, k: 'npc', tid: 'brother_aldric_fen', x: -8, z: 296 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_drowned');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9802 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('targets and interacts with a rusted censer when the drowned chapel collect quest is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 9,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
            'q_widows',
            'q_drowned',
          ],
          qlog: [{ questId: 'q_drowned_censers', counts: [1], state: 'active' }],
        },
        entities: [
          { id: 9803, k: 'object', obj: 'rusted_censer', x: 3, z: 1, loot: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('collect_drowned_censers');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9803 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('picks up the no-rest follow-up from Brother Aldric after the chapel censers are secured', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 9,
          x: -8,
          z: 296,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
            'q_widows',
            'q_drowned',
            'q_drowned_censers',
          ],
        },
        entities: [
          { id: 9804, k: 'npc', tid: 'brother_aldric_fen', x: -8, z: 296 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_no_rest');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9804 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('picks up the Broodmother follow-up from Herbalist Yara after the widow thicket is cleared', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 10,
          x: 10,
          z: 295,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
            'q_widows',
          ],
        },
        entities: [
          { id: 9805, k: 'npc', tid: 'herbalist_yara', x: 10, z: 295 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_broodmother');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9805 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('switches from widow clearing to the Broodmother once the hatchling count is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 10,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
            'q_widows',
          ],
          qlog: [{ questId: 'q_broodmother', counts: [8, 0], state: 'active' }],
        },
        entities: [
          { id: 9806, k: 'mob', tid: 'mire_widow', x: 2, z: 2, h: 1, lv: 9 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_broodmother_matriarch');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up the troll-barrow quest from Warden Fenwick after the drowned chain', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 10,
          x: 3,
          z: 304,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
            'q_widows',
            'q_broodmother',
            'q_drowned',
            'q_drowned_censers',
            'q_no_rest',
          ],
        },
        entities: [
          { id: 9807, k: 'npc', tid: 'warden_fenwick', x: 3, z: 304 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_trolls');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9807 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('keeps hunting Mirefen trolls while the fetish quest is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 10,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
            'q_widows',
            'q_broodmother',
            'q_drowned',
            'q_drowned_censers',
            'q_no_rest',
            'q_trolls',
          ],
          qlog: [{ questId: 'q_troll_fetishes', counts: [3], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_troll_fetishes');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up Grubjaw from Provisioner Hale once the troll fetishes are done', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 11,
          x: -4,
          z: 308,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
            'q_widows',
            'q_broodmother',
            'q_drowned',
            'q_drowned_censers',
            'q_no_rest',
            'q_trolls',
            'q_troll_fetishes',
          ],
        },
        entities: [
          { id: 9808, k: 'npc', tid: 'provisioner_hale', x: -4, z: 308 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_grubjaw');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9808 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('picks up the cult-camp assault from Scout Maren after Grubjaw is finished', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 11,
          x: 6,
          z: 312,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
            'q_widows',
            'q_broodmother',
            'q_drowned',
            'q_drowned_censers',
            'q_no_rest',
            'q_trolls',
            'q_troll_fetishes',
            'q_grubjaw',
          ],
        },
        entities: [
          { id: 9809, k: 'npc', tid: 'scout_maren', x: 6, z: 312 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_cult_camp');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9809 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('heads for Gravecaller cultists once the reeds camp quest is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 11,
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
            'q_rite',
            'q_fenbridge_muster',
            'q_prowlers',
            'q_prowler_pelts',
            'q_fen_supplies',
            'q_deepfen',
            'q_idols',
            'q_deepfen_purge',
            'q_widows',
            'q_broodmother',
            'q_drowned',
            'q_drowned_censers',
            'q_no_rest',
            'q_trolls',
            'q_troll_fetishes',
            'q_grubjaw',
          ],
          qlog: [{ questId: 'q_cult_camp', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_cult_camp');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up the summoner quest from Brother Aldric in Fenbridge after the cult-camp assault is done', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 11,
          x: -8,
          z: 296,
          qdone: [...mirefenThroughCultCamp],
        },
        entities: [
          { id: 9810, k: 'npc', tid: 'brother_aldric_fen', x: -8, z: 296 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_summoners');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9810 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('keeps fighting Gravecaller summoners while the kill objective of q_summoners is still incomplete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 11,
          qdone: [...mirefenThroughCultCamp],
          qlog: [{ questId: 'q_summoners', counts: [3, 1], state: 'active' }],
        },
        entities: [
          { id: 9811, k: 'mob', tid: 'gravecaller_summoner', x: 2, z: 2, h: 1, lv: 11 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('combat');
    expect(result.objectiveLabel).toBe('Silencing Gravecaller Summoners');
    expect(result.commands[0]).toEqual({ cmd: 'target', id: 9811 });
  });

  it('keeps using nearby summoners for q_summoners ciphers after the kill count is done', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 11,
          qdone: [...mirefenThroughCultCamp],
          qlog: [{ questId: 'q_summoners', counts: [8, 0], state: 'active' }],
        },
        entities: [
          { id: 9812, k: 'mob', tid: 'gravecaller_summoner', x: 2, z: 2, h: 1, lv: 11 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('combat');
    expect(result.objectiveLabel).toBe('Recovering Gravecaller Ciphers');
    expect(result.commands[0]).toEqual({ cmd: 'target', id: 9812 });
  });

  it('falls back to Gravecaller menders for q_summoners ciphers when no summoner is in reach', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 11,
          qdone: [...mirefenThroughCultCamp],
          qlog: [{ questId: 'q_summoners', counts: [8, 0], state: 'active' }],
        },
        entities: [
          { id: 9813, k: 'mob', tid: 'gravecaller_mender', x: 2, z: 2, h: 1, lv: 11 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('combat');
    expect(result.objectiveLabel).toBe('Recovering Gravecaller Ciphers');
    expect(result.commands[0]).toEqual({ cmd: 'target', id: 9813 });
  });

  it('does not drift onto Gravecaller cultists during the q_summoners cipher stage', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 11,
          qdone: [...mirefenThroughCultCamp],
          qlog: [{ questId: 'q_summoners', counts: [8, 0], state: 'active' }],
        },
        entities: [
          { id: 9817, k: 'mob', tid: 'gravecaller_cultist', x: 2, z: 2, h: 1, lv: 11 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_summoner_ciphers');
    expect(result.objectiveLabel).toBe('Recovering Gravecaller Ciphers');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up Deacon Voss from Warden Fenwick after q_summoners is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          x: 3,
          z: 304,
          qdone: [...mirefenThroughSummoners],
        },
        entities: [
          { id: 9814, k: 'npc', tid: 'warden_fenwick', x: 3, z: 304 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_deacon');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9814 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('heads for Deacon Voss once the deacon quest is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          qdone: [...mirefenThroughSummoners],
          qlog: [{ questId: 'q_deacon', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_deacon');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up the Bastion ward-stone quest from Brother Aldric after Deacon Voss is dead', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          x: -8,
          z: 296,
          qdone: [...mirefenThroughDeacon],
        },
        entities: [
          { id: 9815, k: 'npc', tid: 'brother_aldric_fen', x: -8, z: 296 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_bastion_door');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9815 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('targets and interacts with a Bastion ward stone once q_bastion_door is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          qdone: [...mirefenThroughDeacon],
          qlog: [{ questId: 'q_bastion_door', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 9816, k: 'object', obj: 'bastion_ward_stone', x: 2, z: 2, loot: 1 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('collect_bastion_door');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9816 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('picks up Knight-Commander Olen from Scout Maren after q_bastion_door is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          x: 6,
          z: 312,
          qdone: [...mirefenThroughBastionDoor],
        },
        entities: [
          { id: 9818, k: 'npc', tid: 'scout_maren', x: 6, z: 312 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_olen');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9818 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('picks up q_mistcaller before entering Bastion once q_olen is already active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          x: -8,
          z: 296,
          qdone: [...mirefenThroughBastionDoor],
          qlog: [{ questId: 'q_olen', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 9819, k: 'npc', tid: 'brother_aldric_fen', x: -8, z: 296 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_mistcaller');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9819 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('heads for the Sunken Bastion door once the Bastion group quests are active outdoors', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          qdone: [...mirefenThroughBastionDoor],
          qlog: [
            { questId: 'q_olen', counts: [0], state: 'active' },
            { questId: 'q_mistcaller', counts: [0], state: 'active' },
          ],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('enter_olen');
    expect(result.objectiveDungeonId).toBe('sunken_bastion');
    expect(result.objectiveSuggestedPartySize).toBe(5);
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('routes toward Knight-Commander Olen once the party is inside Sunken Bastion', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          x: bastionSlot0Origin.x,
          z: bastionSlot0Origin.z + 4,
          dgn: 'sunken_bastion',
          qdone: [...mirefenThroughBastionDoor],
          qlog: [
            { questId: 'q_olen', counts: [0], state: 'active' },
            { questId: 'q_mistcaller', counts: [0], state: 'active' },
          ],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_olen');
    expect(result.objectiveDungeonId).toBe('sunken_bastion');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('keeps pushing to Vael once q_olen is ready but q_mistcaller is still active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          x: bastionSlot0Origin.x - 4,
          z: bastionSlot0Origin.z + 82,
          dgn: 'sunken_bastion',
          qdone: [...mirefenThroughBastionDoor],
          qlog: [
            { questId: 'q_olen', counts: [1], state: 'ready' },
            { questId: 'q_mistcaller', counts: [0], state: 'active' },
          ],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_mistcaller');
    expect(result.objectiveDungeonId).toBe('sunken_bastion');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('walks back to the dungeon exit and leaves once the Bastion boss quests are ready', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          x: bastionSlot0Origin.x,
          z: bastionSlot0Origin.z - 6,
          dgn: 'sunken_bastion',
          qdone: [...mirefenThroughBastionDoor],
          qlog: [
            { questId: 'q_olen', counts: [1], state: 'ready' },
            { questId: 'q_mistcaller', counts: [1], state: 'ready' },
          ],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('leave_olen');
    expect(result.objectiveDungeonId).toBe('sunken_bastion');
    expect(result.commands).toEqual([{ cmd: 'leave_dungeon' }]);
    expect(result.moveInput).toEqual({});
  });

  it('picks up the Highwatch summons from Brother Aldric after the Bastion chain is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          x: -8,
          z: 296,
          qdone: [...mirefenThroughMistcaller],
        },
        entities: [
          { id: 9820, k: 'npc', tid: 'brother_aldric_fen', x: -8, z: 296 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_highwatch_summons');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9820 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('heads north to the Highwatch gate when the summons handoff is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          qdone: [...mirefenThroughMistcaller],
          qlog: [{ questId: 'q_highwatch_summons', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('collect_highwatch_summons');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('turns in the Highwatch summons at Captain Thessaly after the posted summons is collected', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          x: 4,
          z: 664,
          qdone: [...mirefenThroughMistcaller],
          qlog: [{ questId: 'q_highwatch_summons', counts: [1], state: 'ready' }],
        },
        entities: [
          { id: 9821, k: 'npc', tid: 'captain_thessaly', x: 4, z: 664 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('turnin_highwatch_summons');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9821 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('picks up stalker pelts before leaving Highwatch once the ridge-stalker kill quest is already active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 12,
          x: -5,
          z: 668,
          qdone: [...mirefenThroughMistcaller, 'q_highwatch_summons'],
          qlog: [{ questId: 'q_stalkers', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 9822, k: 'npc', tid: 'quartermaster_bree', x: -5, z: 668 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_stalker_pelts');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9822 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('keeps hunting ridge stalkers while q_stalkers is ready but q_stalker_pelts is still active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 13,
          qdone: [...mirefenThroughMistcaller, 'q_highwatch_summons'],
          qlog: [
            { questId: 'q_stalkers', counts: [12], state: 'ready' },
            { questId: 'q_stalker_pelts', counts: [3], state: 'active' },
          ],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_stalker_pelts');
    expect(result.objectiveLabel).toBe('Collecting Ridge Stalker Pelts');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up glowing wax from Quartermaster Bree after q_kobold_tunnels is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 14,
          x: -5,
          z: 668,
          qdone: [...mirefenThroughMistcaller, 'q_highwatch_summons', 'q_stalkers', 'q_stalker_pelts', 'q_kobold_tunnels'],
        },
        entities: [
          { id: 9823, k: 'npc', tid: 'quartermaster_bree', x: -5, z: 668 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_glowing_wax');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9823 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('keeps hunting kobolds while q_glowing_wax is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 14,
          qdone: [...mirefenThroughMistcaller, 'q_highwatch_summons', 'q_stalkers', 'q_stalker_pelts', 'q_kobold_tunnels'],
          qlog: [{ questId: 'q_glowing_wax', counts: [2], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_glowing_wax');
    expect(result.objectiveLabel).toBe('Collecting Glowing Wax');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('restsocks from Quartermaster Bree when the bot is operating in Thornpeak with low supplies', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot({
        class: 'mage',
        profileId: 'eastbrook_vale_mage_newcomer',
      }),
      liveState: liveState({
        self: {
          lv: 13,
          x: -5,
          z: 668,
          copper: 2500,
          res: 100,
          mres: 100,
          rtype: 'mana',
          qdone: [...mirefenThroughMistcaller, 'q_highwatch_summons', 'q_stalkers', 'q_stalker_pelts'],
        },
        entities: [
          { id: 9824, k: 'npc', tid: 'quartermaster_bree', x: -5, z: 668 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('restock_food_and_drink');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9824 },
      { cmd: 'buy', npc: 9824, item: 'trail_hardtack' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('stays on a local Thornpeak grind route instead of walking back to low-level zones when the next quest is level-gated', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 13,
          x: 0,
          z: 660,
          qdone: [...mirefenThroughMistcaller, 'q_highwatch_summons', 'q_stalkers', 'q_stalker_pelts'],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('grind');
    expect(result.objectiveLabel).toBe('Grinding Ridge Stalker');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up ogre war totems from Scout Maren after q_ogre_edges is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 15,
          x: 7,
          z: 670,
          qdone: [...thornpeakThroughStarters, 'q_ogre_edges'],
        },
        entities: [
          { id: 9825, k: 'npc', tid: 'scout_maren_highwatch', x: 7, z: 670 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_ogre_totems');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9825 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('routes toward ogre war totems while q_ogre_totems is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 15,
          qdone: [...thornpeakThroughStarters, 'q_ogre_edges'],
          qlog: [{ questId: 'q_ogre_totems', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('collect_ogre_totems');
    expect(result.objectiveLabel).toBe('Recovering Ogre War Totems');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up Kazzix before leaving Highwatch once q_shard_cores is already active at level 17', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 17,
          x: 12,
          z: 655,
          qdone: [...thornpeakThroughStarters, 'q_ogre_edges', 'q_ogre_totems', 'q_ogre_bounty', 'q_elementals'],
          qlog: [{ questId: 'q_shard_cores', counts: [0], state: 'active' }],
        },
        entities: [
          { id: 9826, k: 'npc', tid: 'loremaster_caddis', x: 12, z: 655 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_kazzix');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9826 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('keeps hunting Kazzix while q_shard_cores is ready but q_kazzix is still active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 17,
          qdone: [...thornpeakThroughStarters, 'q_ogre_edges', 'q_ogre_totems', 'q_ogre_bounty', 'q_elementals'],
          qlog: [
            { questId: 'q_shard_cores', counts: [6], state: 'ready' },
            { questId: 'q_kazzix', counts: [0], state: 'active' },
          ],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_kazzix');
    expect(result.objectiveLabel).toBe('Hunting Shardlord Kazzix');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('stays on a local Thornpeak ogre grind route when q_elementals is still level-gated', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 15,
          x: 0,
          z: 660,
          qdone: [...thornpeakThroughStarters, 'q_ogre_edges', 'q_ogre_totems', 'q_ogre_bounty'],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('grind');
    expect(result.objectiveLabel).toBe('Grinding Thornpeak Ogre');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('stays on a local Stormcrag grind route when q_kazzix is still level-gated after shard cores', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 16,
          x: 0,
          z: 660,
          qdone: [...thornpeakThroughStarters, 'q_ogre_edges', 'q_ogre_totems', 'q_ogre_bounty', 'q_elementals', 'q_shard_cores'],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('grind');
    expect(result.objectiveLabel).toBe('Grinding Stormcrag Elemental');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up Wyrmcult orders from Brother Aldric after q_zealots is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 17,
          x: -10,
          z: 646,
          qdone: [...thornpeakThroughWarfront, 'q_zealots'],
        },
        entities: [
          { id: 9827, k: 'npc', tid: 'brother_aldric_highwatch', x: -10, z: 646 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_cult_orders');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9827 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('keeps hunting zealots while q_cult_orders is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 17,
          qdone: [...thornpeakThroughWarfront, 'q_zealots'],
          qlog: [{ questId: 'q_cult_orders', counts: [4, 1], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_cult_orders');
    expect(result.objectiveLabel).toBe('Recovering Wyrmcult Orders');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('keeps hunting necromancers while q_necromancers is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          qdone: [...thornpeakThroughWarfront, 'q_zealots', 'q_cult_orders'],
          qlog: [{ questId: 'q_necromancers', counts: [3, 1], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_necromancers');
    expect(result.objectiveLabel).toBe('Recovering Ritual Phylacteries');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up the revenant vanguard follow-up from Captain Thessaly after q_revenants is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: 4,
          z: 664,
          qdone: [...thornpeakThroughWarfront, 'q_zealots', 'q_cult_orders', 'q_necromancers', 'q_revenants'],
        },
        entities: [
          { id: 9828, k: 'npc', tid: 'captain_thessaly', x: 4, z: 664 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_revenant_vanguard');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9828 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('keeps hunting boneclad revenants while q_revenant_vanguard is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          qdone: [...thornpeakThroughWarfront, 'q_zealots', 'q_cult_orders', 'q_necromancers', 'q_revenants'],
          qlog: [{ questId: 'q_revenant_vanguard', counts: [6], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_revenant_vanguard');
    expect(result.objectiveLabel).toBe('Breaking the revenant vanguard');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up Gravewyrm sigils from Brother Aldric after the cult and revenant outdoor ladders are complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: -10,
          z: 646,
          qdone: [...thornpeakThroughLateOutdoors],
        },
        entities: [
          { id: 9829, k: 'npc', tid: 'brother_aldric_highwatch', x: -10, z: 646 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_wyrm_sigils');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9829 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('routes toward Gravewyrm sigils while q_wyrm_sigils is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          qdone: [...thornpeakThroughLateOutdoors],
          qlog: [{ questId: 'q_wyrm_sigils', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('collect_wyrm_sigils');
    expect(result.objectiveLabel).toBe('Recovering Gravewyrm Sigils');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('keeps hunting stormcrag elementals while q_breaking_the_seal is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          qdone: [...thornpeakThroughLateOutdoors, 'q_wyrm_sigils'],
          qlog: [{ questId: 'q_breaking_the_seal', counts: [2], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_breaking_the_seal');
    expect(result.objectiveLabel).toBe('Collecting Blessed Embers');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('switches q_voice_below from zealots to necromancers after the zealot count is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          qdone: [...thornpeakThroughLateOutdoors, 'q_wyrm_sigils', 'q_breaking_the_seal'],
          qlog: [{ questId: 'q_voice_below', counts: [10, 0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_voice_below_necromancers');
    expect(result.objectiveLabel).toBe('Silencing the kneeling necromancers');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('routes toward Sanctum Key Shards while q_sanctum_gate is active', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          qdone: [...thornpeakThroughLateOutdoors, 'q_wyrm_sigils', 'q_breaking_the_seal', 'q_voice_below'],
          qlog: [{ questId: 'q_sanctum_gate', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('collect_sanctum_gate');
    expect(result.objectiveLabel).toBe('Recovering Sanctum Key Shards');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up q_crushers from Captain Thessaly after the Sanctum gate prep chain is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: 4,
          z: 664,
          qdone: [...thornpeakThroughSanctumGate],
        },
        entities: [
          { id: 9827, k: 'npc', tid: 'captain_thessaly', x: 4, z: 664 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_crushers');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9827 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('routes toward ogre crushers as a 3-player outdoor group objective', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          qdone: [...thornpeakThroughSanctumGate],
          qlog: [{ questId: 'q_crushers', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_crushers');
    expect(result.objectiveLabel).toBe('Breaking the Thornpeak ogre war-camp crushers');
    expect(result.objectiveSuggestedPartySize).toBe(3);
    expect(result.objectiveDungeonId).toBeUndefined();
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('routes toward Warlord Drogmar as a 3-player outdoor boss objective', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          qdone: [...thornpeakThroughSanctumGate, 'q_crushers'],
          qlog: [{ questId: 'q_drogmar', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_drogmar');
    expect(result.objectiveLabel).toBe('Hunting Warlord Drogmar');
    expect(result.objectiveSuggestedPartySize).toBe(3);
    expect(result.objectiveDungeonId).toBeUndefined();
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('picks up q_korgath from Scout Maren after the grouped ogre war-camp chain is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: 7,
          z: 670,
          qdone: [...thornpeakThroughWarCampGroups],
        },
        entities: [
          { id: 9828, k: 'npc', tid: 'scout_maren_highwatch', x: 7, z: 670 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_korgath');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9828 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('heads for the Gravewyrm Sanctum door once q_korgath is active outdoors', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          qdone: [...thornpeakThroughWarCampGroups],
          qlog: [{ questId: 'q_korgath', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('enter_korgath');
    expect(result.objectiveDungeonId).toBe('gravewyrm_sanctum');
    expect(result.objectiveSuggestedPartySize).toBe(5);
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('routes toward Korgath once the party is inside Gravewyrm Sanctum', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: sanctumSlot0Origin.x,
          z: sanctumSlot0Origin.z + 4,
          dgn: 'gravewyrm_sanctum',
          qdone: [...thornpeakThroughWarCampGroups],
          qlog: [{ questId: 'q_korgath', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_korgath');
    expect(result.objectiveDungeonId).toBe('gravewyrm_sanctum');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('walks back to the Sanctum exit and leaves once q_korgath is ready', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: sanctumSlot0Origin.x,
          z: sanctumSlot0Origin.z - 6,
          dgn: 'gravewyrm_sanctum',
          qdone: [...thornpeakThroughWarCampGroups],
          qlog: [{ questId: 'q_korgath', counts: [1], state: 'ready' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('leave_korgath');
    expect(result.objectiveDungeonId).toBe('gravewyrm_sanctum');
    expect(result.commands).toEqual([{ cmd: 'leave_dungeon' }]);
    expect(result.moveInput).toEqual({});
  });

  it('picks up q_velkhar from Brother Aldric after Korgath is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: -10,
          z: 646,
          qdone: [...thornpeakThroughKorgath],
        },
        entities: [
          { id: 9831, k: 'npc', tid: 'brother_aldric_highwatch', x: -10, z: 646 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_velkhar');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9831 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('heads for the Gravewyrm Sanctum door once q_velkhar is active outdoors', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          qdone: [...thornpeakThroughKorgath],
          qlog: [{ questId: 'q_velkhar', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('enter_velkhar');
    expect(result.objectiveDungeonId).toBe('gravewyrm_sanctum');
    expect(result.objectiveSuggestedPartySize).toBe(5);
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('routes toward Velkhar once the party is inside Gravewyrm Sanctum', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: sanctumSlot0Origin.x,
          z: sanctumSlot0Origin.z + 4,
          dgn: 'gravewyrm_sanctum',
          qdone: [...thornpeakThroughKorgath],
          qlog: [{ questId: 'q_velkhar', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_velkhar');
    expect(result.objectiveDungeonId).toBe('gravewyrm_sanctum');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('walks back to the Sanctum exit and leaves once q_velkhar is ready', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: sanctumSlot0Origin.x,
          z: sanctumSlot0Origin.z - 6,
          dgn: 'gravewyrm_sanctum',
          qdone: [...thornpeakThroughKorgath],
          qlog: [{ questId: 'q_velkhar', counts: [1], state: 'ready' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('leave_velkhar');
    expect(result.objectiveDungeonId).toBe('gravewyrm_sanctum');
    expect(result.commands).toEqual([{ cmd: 'leave_dungeon' }]);
    expect(result.moveInput).toEqual({});
  });

  it('picks up q_gravewyrm from Brother Aldric after Velkhar is complete', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: -10,
          z: 646,
          qdone: [...thornpeakThroughVelkhar],
        },
        entities: [
          { id: 9832, k: 'npc', tid: 'brother_aldric_highwatch', x: -10, z: 646 },
        ],
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('accept_gravewyrm');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 9832 },
      { cmd: 'interact' },
    ]);
    expect(result.moveInput).toEqual({});
  });

  it('heads for the Gravewyrm Sanctum door once q_gravewyrm is active outdoors', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          qdone: [...thornpeakThroughVelkhar],
          qlog: [{ questId: 'q_gravewyrm', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('enter_gravewyrm');
    expect(result.objectiveDungeonId).toBe('gravewyrm_sanctum');
    expect(result.objectiveSuggestedPartySize).toBe(5);
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('routes toward Korzul once the party is inside Gravewyrm Sanctum', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: sanctumSlot0Origin.x,
          z: sanctumSlot0Origin.z + 4,
          dgn: 'gravewyrm_sanctum',
          qdone: [...thornpeakThroughVelkhar],
          qlog: [{ questId: 'q_gravewyrm', counts: [0], state: 'active' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('hunt_gravewyrm');
    expect(result.objectiveDungeonId).toBe('gravewyrm_sanctum');
    expect(result.commands).toEqual([]);
    expect(result.moveInput).toEqual({ f: 1 });
  });

  it('walks back to the Sanctum exit and leaves once q_gravewyrm is ready', () => {
    const state = createAmbientPlayerBotBrainState();
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: liveState({
        self: {
          lv: 18,
          x: sanctumSlot0Origin.x,
          z: sanctumSlot0Origin.z - 6,
          dgn: 'gravewyrm_sanctum',
          qdone: [...thornpeakThroughVelkhar],
          qlog: [{ questId: 'q_gravewyrm', counts: [1], state: 'ready' }],
        },
      }),
      nowMs: 1_000,
    }, state);

    expect(result.objectiveId).toBe('leave_gravewyrm');
    expect(result.objectiveDungeonId).toBe('gravewyrm_sanctum');
    expect(result.commands).toEqual([{ cmd: 'leave_dungeon' }]);
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

  it('does not count externally controlled party waiting as stuck pathing', () => {
    const state = createAmbientPlayerBotBrainState();
    const firstLiveState = liveState({
      self: {
        x: 2,
        z: -2,
        qlog: [{ questId: 'q_wolves', counts: [0], state: 'active' }],
      },
    });
    tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: firstLiveState,
      nowMs: 1_000,
    }, state);

    markAmbientPlayerBotBrainExternalProgress(state, firstLiveState, 5_900);
    const result = tickAmbientPlayerBotBrain({
      bot: bot(),
      liveState: firstLiveState,
      nowMs: 6_000,
    }, state);

    expect(state.stuckResets).toBe(0);
    expect(result.moveInput).toEqual({ f: 1 });
    expect(result.commands).toEqual([]);
  });
});
