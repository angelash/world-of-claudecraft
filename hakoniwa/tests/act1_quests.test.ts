// The act 1 quest import (PK-M1-33; catalog_quests_acts1_3.md 5): the main line on the act
// clock, the objective writes of the quest model, the trial that may already be held, the
// tide that only the night opens, the node quests that feed the dispute runner, the six other
// disputes, the topics that lead into quests, the quest log's end times and the autoplayer's
// gated objectives. The playthroughs check the routes; these check each rule on its own.

import { describe, expect, it } from 'vitest';
import { endedNewestFirst } from '../src/client/windows/quest_log_model';
import { buildContent } from '../src/content';
import { Engine, ok } from '../src/core';
import type { CommandMap, ContentMap, FlagValue } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import type { World } from '../src/core/world';
import { loadCodeSources } from '../src/editor/quests/code_sources';
import { buildFlagIndex } from '../src/editor/quests/flag_index';
import { actWeekValues, buildQuestGraph } from '../src/editor/quests/quest_graph';
import { staticDataFiles } from '../src/editor/state/static_data';
import { Autoplayer } from '../src/game/autoplay';
import { type GateHost, gatedObjective, marketFor } from '../src/game/autoplay/quest_gates';
import { createGame } from '../src/game/create';
import { system as disputes, selectOutcomes } from '../src/systems/disputes';
import type { DisputeDef } from '../src/systems/disputes/types';
import { system as guild } from '../src/systems/guild';
import { addItem, addMoney, countItem } from '../src/systems/inventory';
import {
  evaluate,
  flagResolver,
  type Objective,
  type QuestDef,
  type QuestView,
  questLog,
} from '../src/systems/quests';
import { attachSkipHandlers } from '../src/systems/travel/skip_registry';
import { NARRATIVE_SYSTEMS, narrativeContent, otherTeamsStub } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    /** test probe: a conversation event the dialogue system would emit */
    'zz.topic': { npcRef: string; topicId: string; outcome: string };
    'zz.persuaded': { npcRef: string };
  }
}

const CONTENT = narrativeContent();

/** Stands in for the dialogue system's events (topics answered, persuasions). */
const talkProbe: GameSystem = {
  id: 'zz_talk',
  order: 995,
  commands: {
    'zz.topic'(ctx, d) {
      ctx.emit('dialogue.topic', { npcId: `npc_${d.npcRef}`, ...d });
      return ok();
    },
    'zz.persuaded'(ctx, d) {
      ctx.emit('dialogue.persuaded', { npcId: `npc_${d.npcRef}`, npcRef: d.npcRef, ok: true });
      return ok();
    },
  },
};

function game(): Engine {
  const systems = attachSkipHandlers([...NARRATIVE_SYSTEMS, disputes, guild]);
  return Engine.create(20261118, CONTENT, [...systems, otherTeamsStub, talkProbe], {
    aiMode: 'off',
  });
}

const flags = (g: Engine): Record<string, FlagValue> => g.world.meta.flags;
const quest = (g: Engine, id: string) => g.world.slices.quests.quests[id];

function set(g: Engine, values: Record<string, FlagValue>): void {
  for (const [key, value] of Object.entries(values)) g.queue('flag.set', { key, value });
  g.step(2);
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe: GameSystem = { id: 'zz_probe', order: 999, tick: (ctx) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

function talk(g: Engine, npc: string): void {
  g.queue('stub.talk', { npc });
  g.step(2);
}

function cmd<K extends keyof CommandMap>(g: Engine, kind: K, data: CommandMap[K], n = 2): void {
  g.queue(kind, data);
  g.step(n);
}

function teleport(g: Engine, mapId: string, location?: string): void {
  const map = g.content.maps.find((m) => m.id === mapId);
  const loc = map?.locations.find((l) => l.id === location);
  g.queue('world.teleport', {
    entityId: 'player',
    mapId,
    x: loc ? loc.x + loc.w / 2 : (map?.width ?? 4) / 2,
    y: loc ? loc.y + loc.h / 2 : (map?.height ?? 4) / 2,
  });
  g.step(12);
}

function kill(g: Engine, ref: string, mapId: string, n = 1): void {
  for (let i = 0; i < n; i++) g.queue('stub.kill', { ref, kind: 'monster', mapId });
  g.step(2);
}

const xpAwarded = (g: Engine) =>
  g.world.recent.flatMap((e) => (e.kind === 'xp.awarded' ? [e.data.amount] : []));

/** Act 1 with the guild registration done, at an act week. */
function act1(week: number, more: Record<string, FlagValue> = {}): Engine {
  const g = game();
  set(g, { act: 'act1', 'quest.q_a1_m03_register': 'done', ...more });
  set(g, { act_week: week });
  return g;
}

const def = (id: string) => CONTENT.quests.find((q) => q.id === id) as QuestDef;

// ---------------------------------------------------------------------------

describe('the quest model: an objective that writes when it is met', () => {
  it('writes a tide preparation the moment it is done, then settles the night at dusk', () => {
    const g = act1(9, { a1_tide_omen: true });
    expect(quest(g, 'q_a1_m12_tide')?.status).toBe('active');
    withCtx(g, (ctx) => addItem(ctx, 'player', 'wood', 40));
    talk(g, 'gaspar');
    expect(flags(g)['a1_tide_prep.east_fence']).toBe(true);
    expect(flags(g).a1_defense).toBe(15);
    expect(countItem(g.world, 'player', 'wood')).toBe(0);
    // a persuasion below its threshold meets nothing; at it, the prep is written
    g.queue('zz.persuaded', { npcRef: 'nera' });
    g.step(2);
    expect(flags(g)['a1_tide_prep.nera_stock']).toBeUndefined();
    set(g, { 'npc.nera.stance': 'partner' });
    g.queue('zz.persuaded', { npcRef: 'nera' });
    g.step(2);
    expect(flags(g)['a1_tide_prep.nera_stock']).toBe(true);
    // still the preparation stage: the night has not come
    expect(flags(g)['quest.q_a1_m12_tide.stage']).toBe('prep');
    set(g, { a1_tide_night: true });
    expect(flags(g)['quest.q_a1_m12_tide.stage']).toBe('dusk');
    // the first preparation and the eve: two settlement points (catalog A1-M11)
    expect(xpAwarded(g)).toEqual([1530, 1530]);
  });

  it('pays only the eve when nothing was prepared', () => {
    const g = act1(10, { a1_tide_night: true });
    expect(flags(g)['quest.q_a1_m12_tide.stage']).toBe('dusk');
    expect(xpAwarded(g)).toEqual([1530]);
  });
});

describe('the act 1 main line', () => {
  it('drops the seal writes the doors own (thousand_doors.md 6.4, C84)', () => {
    const content = buildContent();
    const a1 = content.acts.find((a) => a.id === 'act1');
    expect(a1?.onEnter?.some((e) => e.type === 'flag' && e.key === 'seal_looseness')).toBe(false);
    const writes = JSON.stringify(content.quests.filter((q) => q.act === 'act1'));
    expect(writes).not.toContain('"seal_looseness"');
    // the player-run crystal trade drives the unrest by 2 a week (act1_borderstone.md 7.3)
    expect(a1?.clock?.weekly).toContainEqual(
      expect.objectContaining({
        key: 'seal_unrest',
        amount: 2,
        when: 'a1_dian_trade == player_controls AND NOT a1_beast_tide_cleared',
      }),
    );
    // the tide resets the unrest to 30, and the player's own trade adds 10 (catalog A1-M12)
    const colossus = content.quests
      .find((q) => q.id === 'q_a1_m12_tide')
      ?.stages.find((s) => s.id === 'colossus');
    const unrest = colossus?.onComplete?.filter((e) => 'key' in e && e.key === 'seal_unrest');
    expect(unrest).toEqual([
      { type: 'flag', key: 'seal_unrest', value: 30, when: 'NOT a1_beast_tide_started' },
      {
        type: 'add',
        key: 'seal_unrest',
        amount: 10,
        max: 100,
        when: 'NOT a1_beast_tide_started AND a1_dian_trade == player_controls',
      },
    ]);
  });

  it('keeps the main line at the 22 settlement points of progression 18.1', () => {
    const main = CONTENT.quests.filter((q) => q.act === 'act1' && q.kind === 'main');
    expect(main.map((q) => q.id)).toEqual([
      'q_a1_m01_fall',
      'q_a1_m02_raven',
      'q_a1_m03_town',
      'q_a1_m03_register',
      'q_a1_m04_hunt',
      'q_a1_m05_grey_wolf',
      'q_a1_m06_mine',
      'q_a1_m07_spring',
      'q_a1_m09_trial',
      'q_a1_m10_talent_sight',
      'q_a1_m12_tide',
      'q_a1_m13_dream',
      'q_a1_m13_letter',
    ]);
    const points = main.flatMap((q) =>
      [q.onStart, q.rewards, ...q.stages.flatMap((s) => [s.onEnter, s.onComplete])]
        .flatMap((l) => l ?? [])
        .filter((e) => e.type === 'xp'),
    );
    expect(points).toHaveLength(22);
    expect(points.reduce((s, e) => s + (e.type === 'xp' ? e.amount : 0), 0)).toBe(22550);
  });

  it('A1-M07: the culvert fight, then sealing writes the culvert, the town sediment and the unrest', () => {
    const g = act1(6, { a1_town_dian: 50, seal_unrest: 40 });
    cmd(g, 'quests.accept', { questId: 'q_a1_m07_spring' });
    expect(quest(g, 'q_a1_m07_spring')?.status).toBe('active');
    teleport(g, 'borderstone', 'north_spring');
    teleport(g, 'seal_ruins_depths');
    // the ruins' gate hall is cleared from the inside on the way down (map brief A2)
    expect(flags(g).a1_ruins_gate_cleared).toBe(true);
    kill(g, 'dian_spirit', 'seal_ruins_depths');
    expect(flags(g).a1_spring_source_found).toBe(true);
    expect(countItem(g.world, 'player', 'north_spring_water')).toBe(1);
    cmd(g, 'quests.choose', { questId: 'q_a1_m07_spring', optionId: 'seal' });
    expect(flags(g)).toMatchObject({
      a1_culvert_sealed: true,
      a1_town_dian: 30,
      seal_unrest: 35,
      'quest.q_a1_m07_spring': 'done',
      'quest.q_a1_m07_spring.path': 'sealed',
    });
    // boarding up the spring instead
    const b = act1(6);
    cmd(b, 'quests.accept', { questId: 'q_a1_m07_spring' });
    teleport(b, 'borderstone', 'north_spring');
    teleport(b, 'seal_ruins_depths');
    kill(b, 'dian_spirit', 'seal_ruins_depths');
    cmd(b, 'quests.choose', { questId: 'q_a1_m07_spring', optionId: 'board_spring' });
    expect(flags(b).a1_north_spring_boarded).toBe(true);
    expect(flags(b).a1_culvert_sealed).toBeUndefined();
  });

  it('A1-M09: a trial already held plays its short aftermath without judging again', () => {
    const g = act1(7, { a1_witch_trial_started: true });
    expect(quest(g, 'q_a1_m09_trial')?.status).toBe('active');
    teleport(g, 'borderstone', 'plaza');
    cmd(g, 'quests.choose', { questId: 'q_a1_m09_trial', optionId: 'appeared' });
    // the unattended trial (the dispute runner's verdict) happened before the player came
    set(g, {
      'dispute.q_a1_d02_witch_trial.choice.cassian_verdict': 'convict',
      a1_oola_fate: 'convicted',
    });
    set(g, { act_week: 8 });
    expect(flags(g)['quest.q_a1_m09_trial']).toBe('active');
    expect([g.world.slices.scenes.current?.sceneId, ...g.world.slices.scenes.queue]).toContain(
      'cut_a1_trial',
    );
    expect(flags(g).a1_oola_fate).toBe('convicted');
    expect(flags(g).a1_oola_jailbroken).toBeUndefined();
  });

  it('A1-M09: a jailbreak before the trial waits for the empty-stage scene', () => {
    // The jailbreak is A1-D02.f at night (act1_borderstone.md 4.2), not a choice of the trial
    // scene. The quest now lets the short empty-stage version play to the end.
    const g = act1(7, { a1_witch_trial_started: true });
    teleport(g, 'borderstone', 'plaza');
    cmd(g, 'quests.choose', { questId: 'q_a1_m09_trial', optionId: 'appeared' });
    set(g, { a1_oola_jailbroken: true, a1_oola_fate: 'fled' });
    set(g, { act_week: 8 });
    g.step(12);
    expect(flags(g).a1_oola_fate).toBe('fled');
    expect(flags(g)['quest.q_a1_m09_trial']).toBe('active');
    // the short version is the scene's own branch for this case
    const route = CONTENT.scenes
      .find((s) => s.id === 'cut_a1_trial')
      ?.nodes.find((n) => n.id === 'route');
    expect(route?.branch?.[0]).toEqual({ when: 'a1_oola_jailbroken', to: 'empty' });
  });

  it('A1-M12 opens on the omens or the night, never on the trial', () => {
    expect(def('q_a1_m12_tide').trigger).toBe('a1_tide_omen OR a1_tide_night');
    const g = act1(9, { 'quest.q_a1_m09_trial': 'done' });
    expect(quest(g, 'q_a1_m12_tide')).toBeUndefined();
  });

  it('A1-M12 follows the tide stage while the tide system runs, not the kills', () => {
    const g = act1(10, { a1_tide_omen: true });
    set(g, { a1_tide_night: true, a1_beast_tide_started: true, a1_tide_stage: 1 });
    g.step(TICKS_PER_GAME_HOUR + 40);
    expect(flags(g)['quest.q_a1_m12_tide.stage']).toBe('wave1');
    // twelve kills on the town map would have closed both waves: the night is not there yet
    kill(g, 'dian_wolf', 'borderstone', 12);
    expect(flags(g)['quest.q_a1_m12_tide.stage']).toBe('wave1');
    set(g, { a1_tide_stage: 2 });
    expect(flags(g)['quest.q_a1_m12_tide.stage']).toBe('wave2');
    set(g, { a1_tide_stage: 3 });
    expect(flags(g)['quest.q_a1_m12_tide.stage']).toBe('colossus');
  });

  it('A1-D01.g can hand the crystal trade to the player, which the clock and the tide read', () => {
    const g = act1(6, { a1_moss_evidence: 1 });
    expect(quest(g, 'q_a1_d01g_confront_moss')?.status).toBe('active');
    talk(g, 'moss');
    cmd(g, 'quests.choose', { questId: 'q_a1_d01g_confront_moss', optionId: 'take_over' });
    expect(flags(g)).toMatchObject({
      a1_moss_fate: 'puppet',
      a1_dian_trade: 'player_controls',
      'quest.q_a1_d01g_confront_moss.path': 'blackmail',
    });
    const before = Number(flags(g).seal_unrest ?? 0);
    set(g, { act_week: 7 });
    g.step(8 * 24 * TICKS_PER_GAME_HOUR);
    // the act clock's +9 a week and the trade's +2
    expect(Number(flags(g).seal_unrest) - before).toBeGreaterThanOrEqual(11);
  });
});

describe('an optional hand-in in the stage a talk to the same person closes', () => {
  it('A1-M03 takes the raven feather in the talk that registers (the bounty path)', () => {
    const withFeather = game();
    set(withFeather, { act: 'act1', 'quest.q_a1_m03_town': 'done' });
    expect(quest(withFeather, 'q_a1_m03_register')?.status).toBe('active');
    withCtx(withFeather, (ctx) => addItem(ctx, 'player', 'raven_black_feather', 1));
    talk(withFeather, 'lina');
    expect(flags(withFeather)).toMatchObject({
      'quest.q_a1_m03_register': 'done',
      'quest.q_a1_m03_register.path': 'bounty',
      a1_guild_registered: true,
    });
    expect(countItem(withFeather.world, 'player', 'raven_black_feather')).toBe(0);
    // without the feather the talk registers alone
    const without = game();
    set(without, { act: 'act1', 'quest.q_a1_m03_town': 'done' });
    talk(without, 'lina');
    expect(flags(without)['quest.q_a1_m03_register']).toBe('done');
    expect(flags(without)['quest.q_a1_m03_register.path']).toBeUndefined();
  });
});

describe('the nodes and side quests that feed the disputes', () => {
  it('A1-D01.a writes three pieces of evidence and the blade mark', () => {
    const g = act1(3);
    cmd(g, 'quests.accept', { questId: 'q_a1_d01a_robbery_inquiry' });
    talk(g, 'owen');
    kill(g, 'oneeye_bandit', 'forest_edge');
    talk(g, 'marg');
    expect(flags(g)).toMatchObject({
      a1_moss_evidence: 3,
      a1_blade_mark_seen: true,
      'quest.q_a1_d01a_robbery_inquiry': 'done',
    });
    expect(countItem(g.world, 'player', 'marked_bandit_blade')).toBe(1);
    expect(countItem(g.world, 'player', 'magistrate_seal_fragment')).toBe(1);
    // the blade opens the smith's quest (A1-S02, from week 4)
    set(g, { act_week: 4 });
    talk(g, 'barga');
    cmd(g, 'quests.accept', { questId: 'q_a1_s02_blade_mark' });
    expect(quest(g, 'q_a1_s02_blade_mark')?.status).toBe('active');
  });

  it('A1-D01.g exposes Moss with three pieces, and A1-D04.e writes the bridge', () => {
    const g = act1(6, { a1_moss_evidence: 3 });
    expect(quest(g, 'q_a1_d01g_confront_moss')?.status).toBe('active');
    g.queue('zz.persuaded', { npcRef: 'moss' });
    g.step(2);
    expect(flags(g)).toMatchObject({
      a1_moss_exposed: true,
      a1_permit_revoked: true,
      'quest.q_a1_d01g_confront_moss.path': 'expose',
    });
    const n = act1(5, { 'trust.nick': 60 });
    cmd(n, 'quests.accept', { questId: 'q_a1_d04e_nick_bridge' });
    teleport(n, 'forest_edge', 'pact_oak');
    cmd(n, 'quests.choose', { questId: 'q_a1_d04e_nick_bridge', optionId: 'traps' });
    expect(flags(n)).toMatchObject({ a1_nick_bridge: true, a1_gorn_decision: 'stay' });
  });

  it('A1-D01.f turned: Seg goes after Moss on the tide night (the input the tide reads)', () => {
    const g = act1(6, { a1_lair_located: true, a1_viro_pact_known: true });
    cmd(g, 'quests.accept', { questId: 'q_a1_d01f_old_watch' });
    teleport(g, 'old_outpost', 'ruined_tower');
    cmd(g, 'quests.choose', { questId: 'q_a1_d01f_old_watch', optionId: 'turned' });
    expect(flags(g)).toMatchObject({
      a1_seg_turned: true,
      a1_moss_fate: 'dead',
      'quest.q_a1_d01f_old_watch.path': 'turned',
    });
  });

  it('A1-D02.e cures Toby with the remedy and the water cut off', () => {
    const g = act1(6);
    cmd(g, 'quests.accept', { questId: 'q_a1_d02e_save_toby' });
    withCtx(g, (ctx) => addItem(ctx, 'player', 'medicine', 1));
    talk(g, 'oola');
    expect(flags(g)['quest.q_a1_d02e_save_toby.stage']).toBe('cure');
    set(g, { a1_culvert_sealed: true });
    g.step(8 * TICKS_PER_GAME_HOUR + 40);
    expect(flags(g)).toMatchObject({ a1_toby_state: 'recovered', 'trust.bertha': 30 });
  });

  it('A1-S17 writes the cellar choice the dungeon system settles', () => {
    const g = act1(2);
    cmd(g, 'quests.accept', { questId: 'q_a1_s17_moon_cellar' });
    teleport(g, 'borderstone', 'moon_cellar_landing');
    kill(g, 'dian_rat', 'borderstone', 6);
    cmd(g, 'quests.choose', { questId: 'q_a1_s17_moon_cellar', optionId: 'purify' });
    cmd(g, 'quests.choose', { questId: 'q_a1_s17_moon_cellar', optionId: 'look' });
    expect(flags(g)).toMatchObject({
      'dg.dg_moon_cellar.choice': 'purify',
      a1_bell_tab_seen: true,
      'npc.martha.assessment': 1,
      'quest.q_a1_s17_moon_cellar': 'done',
    });
  });
});

describe('the six other disputes', () => {
  const content = buildContent();
  const dispute = (id: string) => content.disputes.find((d) => d.id === id) as DisputeDef;
  const ending = (id: string, f: Record<string, FlagValue>) => {
    const sel = selectOutcomes(dispute(id), (w) => evaluate(w, flagResolver(f)));
    return sel ? `${sel.ending}/${sel.by}` : null;
  };

  it('fall back to the world endings with no player', () => {
    expect(ending('q_a1_d03_salt_and_potions', {})).toBe('neutral/world');
    expect(ending('q_a1_d05_tavern_eyes', {})).toBe('watched/world');
    expect(ending('q_a1_d06_bron_old_wound', {})).toBe('reported/world');
    expect(ending('q_a1_d07_bakery_betrothal', {})).toBe('married/world');
    expect(ending('q_a1_d08_otto_mill', {})).toBe('vick/world');
    expect(ending('q_a1_d09_market_theft', {})).toBe('framed/world');
  });

  it('read what the side quests write for the player endings (catalog 5.3)', () => {
    const path = (q: string, p: string) => ({ [`quest.${q}.path`]: p, [`quest.${q}`]: 'done' });
    expect(ending('q_a1_d03_salt_and_potions', path('q_a1_s08_salt_price', 'negotiate'))).toBe(
      'partner/player',
    );
    expect(ending('q_a1_d03_salt_and_potions', path('q_a1_s08_salt_price', 'expose'))).toBe(
      'hostile/player',
    );
    expect(
      ending('q_a1_d03_salt_and_potions', {
        ...path('q_a1_s08_salt_price', 'take_cut'),
        'quest.q_a1_s09_coin': 'done',
        'quest.q_gl_merca_01': 'done',
      }),
    ).toBe('bought/player');
    expect(
      ending('q_a1_d05_tavern_eyes', { a1_martha_strike: true, 'npc.martha.assessment': 5 }),
    ).toBe('confided/player');
    expect(ending('q_a1_d06_bron_old_wound', { 'npc.bron.story_level': 3 })).toBe(
      'full_story/player',
    );
    expect(ending('q_a1_d07_bakery_betrothal', path('q_a1_s10_lisa_bundle', 'elope'))).toBe(
      'eloped/player',
    );
    expect(ending('q_a1_d07_bakery_betrothal', path('q_a1_s11_otto_will', 'read_public'))).toBe(
      'broken/player',
    );
    expect(ending('q_a1_d08_otto_mill', path('q_a1_s11_otto_will', 'tell_nera'))).toBe(
      'orphanage/player',
    );
    expect(
      ending('q_a1_d08_otto_mill', {
        'dispute.q_a1_d08_otto_mill.choice.vick_mortgage': 'mortgage',
      }),
    ).toBe('company/world');
    expect(
      ending('q_a1_d09_market_theft', {
        ...path('q_a1_s12_copper_bell', 'bait'),
        a1_jed_exposed: true,
      }),
    ).toBe('exposed/player');
  });

  it('give the salt dispute the second escalation the goddess beat DB-A1-08 waits for', () => {
    const salt = dispute('q_a1_d03_salt_and_potions');
    const beat = (content.divineBeats ?? []).find((b) => b.code === 'DB-A1-08');
    expect(beat?.open).toMatchObject({ dispute: salt.id, escalation: 2 });
    expect(salt.stages.some((s) => s.escalation >= 2)).toBe(true);
  });
});

describe('topics, the log and the board', () => {
  it('a quest topic answered by its giver leads into the quest (unlocks.quests)', () => {
    const g = act1(4);
    g.queue('zz.topic', { npcRef: 'owen', topicId: 'quest_owen_cart', outcome: 'refused' });
    g.step(2);
    expect(quest(g, 'q_a1_s01_owen_wagon')).toBeUndefined();
    // another speaker's answer is not the giver's offer
    g.queue('zz.topic', { npcRef: 'simon', topicId: 'quest_owen_cart', outcome: 'answer' });
    g.step(2);
    expect(quest(g, 'q_a1_s01_owen_wagon')).toBeUndefined();
    g.queue('zz.topic', { npcRef: 'owen', topicId: 'quest_owen_cart', outcome: 'answer' });
    g.step(2);
    expect(quest(g, 'q_a1_s01_owen_wagon')?.status).toBe('active');
    // the three topics that waited for their quests are back
    const topics = (CONTENT as { topics?: { id: string; requires?: string }[] }).topics ?? [];
    for (const [id, q] of [
      ['event_drunk_bandits', 'q_a1_s01_owen_wagon'],
      ['secret_toma_watch', 'q_a1_s15_bell_tower'],
      ['secret_noi_mark', 'q_a1_s19_door_in_you'],
    ])
      expect(topics.find((t) => t.id === id)?.requires, id).toBe(`quest.${q}`);
  });

  it('the log keeps when each quest closed and lists the ended ones newest first', () => {
    const g = act1(3);
    cmd(g, 'quests.accept', { questId: 'q_a1_s06_arm_wrestle' });
    cmd(g, 'quests.choose', { questId: 'q_a1_s06_arm_wrestle', optionId: 'win' });
    const done = questLog(g.world, g.content).done.find((v) => v.id === 'q_a1_s06_arm_wrestle');
    expect(done?.endTick).toBe(quest(g, 'q_a1_s06_arm_wrestle')?.doneTick);
    const v = (id: string, endTick?: number) => ({ id, endTick }) as QuestView;
    expect(endedNewestFirst([v('a', 5), v('b'), v('c', 9), v('d', 1)]).map((x) => x.id)).toEqual([
      'c',
      'a',
      'd',
      'b',
    ]);
  });

  it('the beast season writes the monster-season flag, and the smugglers need the old mine open', () => {
    const ev = (id: string) => (CONTENT.dynamicEvents ?? []).find((e) => e.id === id);
    expect(ev('ev_a1_beast_season')?.effects).toContainEqual(
      expect.objectContaining({ key: 'a1_beast_season', value: true }),
    );
    const smugglers = ev('ev_a1_greyroad_smugglers')?.when;
    expect(smugglers).toContain('NOT dg.dg_old_mine.collapsed');
    // the trade goes on before the bandit dispute settles it (it writes the variable at the end)
    expect(evaluate(smugglers, flagResolver({}))).toBe(true);
    expect(evaluate(smugglers, flagResolver({ a1_dian_trade: 'stopped' }))).toBe(false);
    expect(ev('ev_a1_tide_omens')?.when).toBe('seal_unrest >= 91 OR act_week >= 10');
  });

  it("Moira's coincidence lands one of four nudges, the most stalled dispute first", () => {
    const moira = (CONTENT.dynamicEvents ?? []).find((e) => e.id === 'ev_a1_moira_coincidence');
    const lines = (f: Record<string, FlagValue>) =>
      (moira?.effects ?? []).filter((e) => e.type === 'line' && evaluate(e.when, flagResolver(f)))
        .length;
    const states: Record<string, FlagValue>[] = [
      {},
      { a1_forest_pact_proof: true },
      { a1_forest_pact_proof: true, 'npc.bron.story_level': 2 },
      { a1_forest_pact_proof: true, 'npc.bron.story_level': 2, a1_viro_pact_known: true },
    ];
    for (const s of states) expect(lines(s), JSON.stringify(s)).toBe(1);
  });
});

describe('the autoplayer and gated objectives (quest_gates.ts)', () => {
  function host(world: World, content: ContentMap, holds: boolean) {
    const sent: string[] = [];
    const talks: string[] = [];
    const h: GateHost = {
      world,
      content,
      intent: { what: '' },
      holds: () => holds,
      talk: (npc, option) => {
        talks.push(`${npc}:${option}`);
        return 4;
      },
      send: (c) => {
        sent.push(c.kind);
      },
      nearestMerchant: () => 'nera',
      recentlyRejected: () => false,
    };
    return { h, sent, talks };
  }
  const persuade = { type: 'persuade', npc: 'nera', when: 'x', label: 'x' } as Objective;
  const herbs = { type: 'deliver', item: 'herb', count: 5, npc: 'oola', label: 'x' } as Objective;

  it('leaves a persuasion alone below its threshold and lets the talk try above it', () => {
    const g = act1(1);
    expect(gatedObjective(host(g.world, g.content, false).h, persuade, 'x')).toBeNull();
    expect(gatedObjective(host(g.world, g.content, true).h, persuade, 'x')).toBeUndefined();
  });

  it('buys what a delivery lacks where a market sells it, then talks as usual', () => {
    const g = act1(1);
    expect(marketFor(g.content, g.world, 'herb')?.mapId).toBe('borderstone');
    expect(marketFor(g.content, g.world, 'guild_letter')).toBeNull();
    withCtx(g, (ctx) => {
      addMoney(ctx, 'player', 200, 'test');
    });
    const a = host(g.world, g.content, true);
    expect(gatedObjective(a.h, herbs, 'x')).toBe(4);
    expect(a.talks).toEqual(['nera:economy:trade']);
    // nothing anywhere sells a letter: the objective is not actionable
    const letter = { ...herbs, item: 'guild_letter' } as Objective;
    expect(gatedObjective(a.h, letter, 'x')).toBeNull();
    withCtx(g, (ctx) => addItem(ctx, 'player', 'herb', 5));
    expect(gatedObjective(a.h, herbs, 'x')).toBeUndefined();
  });
});

describe('the autoplayer works the act 1 opening', () => {
  it('hunts a named kill that has no orWhen (A1-M01 corridor)', () => {
    // the bot's "the story settles this fight another way" guard once held for a missing
    // orWhen too (an empty condition holds), so a plain named kill was waited on forever
    const g = createGame({ seed: 7, aiMode: 'off' });
    const bot = new Autoplayer(g, { route: 'release' });
    bot.run({ maxTicks: 6000, until: (e) => (quest(e, 'q_a1_m01_fall')?.stage ?? 0) >= 2 });
    const q = quest(g, 'q_a1_m01_fall');
    expect(q?.status).toBe('active');
    expect(q?.stage ?? 0, bot.intent.what).toBeGreaterThanOrEqual(2);
  });
});

describe('V9 over the act 1 content', () => {
  it('decides every act 1 quest reachable (the act weeks the conditions tell apart)', async () => {
    const content = buildContent();
    // M07's trigger compares act_week with 3 and 6: those weeks and their neighbours
    const weeks = actWeekValues({ quests: content.quests, acts: content.acts });
    for (const w of [0, 2, 3, 4, 5, 6, 7]) expect(weeks).toContain(w);
    const index = buildFlagIndex(
      new Map(Object.entries(staticDataFiles())),
      await loadCodeSources(),
    );
    const initialFlags = { ...createGame({ aiMode: 'off', content }).world.meta.flags };
    const g = buildQuestGraph({ quests: content.quests, acts: content.acts, index, initialFlags });
    const act1 = content.quests.filter((q) => q.act === 'act1');
    expect(act1.length).toBeGreaterThan(40);
    for (const q of act1) expect(g.verdicts[q.id]?.state, q.id).toBe('reachable');
  }, 120_000);
});
