import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine } from '../src/core';
import type { EventMap, FlagValue } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { system as guild } from '../src/systems/guild';
import { boardDef, commissionDef, post, take } from '../src/systems/guild/board';
import { addItem, countItem, holdingOf } from '../src/systems/inventory';
import { registerModifier } from '../src/systems/modifiers';
import { system as npc } from '../src/systems/npc';
import { enterStage, startQuest } from '../src/systems/quests';
import { payChoiceCost } from '../src/systems/quests/choice_cost';
import type { QuestDef } from '../src/systems/quests/types';
import { NARRATIVE_SYSTEMS, otherTeamsStub } from './narrative_harness';
import { ALIVE_CONTENT, ALIVE_SYSTEMS } from './npc_alive_harness';

const CONTENT = buildContent();
const SIDE_IDS = [
  'q_a1_s24_red_sock',
  'q_a1_s25_furrow_queen',
  'q_a1_s26_toll_taker',
  'q_a1_s27_old_louse',
  'q_a1_s28_three_toes',
  'q_a1_s29_first_beast',
  'q_a1_s30_donkey_road',
  'q_a1_s34_craft_herbalism',
  'q_a1_s35_craft_alchemy',
  'q_a1_s36_craft_cooking',
  'q_a1_s37_craft_leather',
];
const COMMISSION_IDS = [
  'cmm_a1_field_hares',
  'cmm_a1_south_road_escort',
  'cmm_a1_grave_wisps',
  'cmm_a1_mine_pests',
  'cmm_a1_bone_vulture',
  'cmm_a1_jackal_road',
  'cmm_a1_bounty_named',
];

function runAt(id: string, stage: string, flags: Record<string, FlagValue> = {}): Engine {
  const def = CONTENT.quests.find((q) => q.id === id) as QuestDef;
  expect(def, id).toBeDefined();
  const act = CONTENT.acts.find((a) => a.id === 'act1');
  if (!act) throw new Error('missing act1');
  const content = {
    ...CONTENT,
    quests: [def],
    acts: [{ ...act, clock: undefined, introScene: undefined }],
    dynamicEvents: [],
  };
  const probe: GameSystem = {
    id: 'closure_probe',
    order: 999,
    tick(ctx) {
      if (ctx.flag('closure.initialized')) return;
      ctx.setFlag('closure.initialized', true);
      for (const [key, value] of Object.entries(flags)) ctx.setFlag(key, value);
      startQuest(ctx, id);
      const q = ctx.world.slices.quests.quests[id];
      if (!q) throw new Error('quest did not start');
      enterStage(
        ctx,
        def,
        q,
        def.stages.findIndex((s) => s.id === stage),
      );
    },
  };
  const g = Engine.create(20261119, content, [...NARRATIVE_SYSTEMS, guild, otherTeamsStub, probe], {
    aiMode: 'off',
  });
  g.step(3);
  return g;
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  let ran = false;
  const probe: GameSystem = {
    id: 'closure_action',
    order: 998,
    tick(ctx) {
      if (ran) return;
      ran = true;
      fn(ctx);
    },
  };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(2);
}

describe('act 1 content closure', () => {
  it('keeps NPC dialogue and stage hooks usable without a quest pack or slice', () => {
    const g = Engine.create(20261119, ALIVE_CONTENT, ALIVE_SYSTEMS, { aiMode: 'off' });
    expect(g.content.quests).toBeUndefined();
    expect(g.world.slices.quests).toBeUndefined();
    expect(() =>
      withCtx(g, (ctx) => {
        ctx.emit('player.talked', { npcId: 'npc_bron', npcRef: 'bron' });
        ctx.emit('quest.stage', { questId: 'unknown', stage: 0, desc: 'x' });
      }),
    ).not.toThrow();
    expect(g.world.slices.quests).toBeUndefined();
  });

  it('ships every remaining side quest with a real objective', () => {
    for (const id of SIDE_IDS) {
      const def = CONTENT.quests.find((q) => q.id === id);
      expect(def, id).toBeDefined();
      expect(
        def?.stages.some((s) => s.objectives.length > 0),
        id,
      ).toBe(true);
    }
  });

  it('ships the seven remaining commissions whose world objectives have executors', () => {
    for (const id of COMMISSION_IDS)
      expect(
        CONTENT.commissions.find((t) => t.id === id),
        id,
      ).toBeDefined();
  });

  it.each([
    { a1_oola_fate: 'convicted', 'dispute.q_a1_d02_witch_trial.choice.cassian_verdict': 'convict' },
    { a1_oola_fate: 'fled', a1_oola_jailbroken: true },
    { a1_oola_fate: 'cleared', a1_oola_bribed: true },
  ])('waits for the existing trial scene even when a fate is already known: %o', (flags) => {
    const known: Record<string, FlagValue> = {};
    for (const [key, value] of Object.entries(flags)) if (value !== undefined) known[key] = value;
    const g = runAt('q_a1_m09_trial', 'verdict', known);
    expect(g.world.slices.quests.quests.q_a1_m09_trial?.status).toBe('active');
    const scenes = g.world.slices.scenes;
    expect([scenes.current?.sceneId, ...scenes.queue]).toContain('cut_a1_trial');
  });

  it('lets the memory scene own the first revelation of the hidden term', () => {
    for (const [id, stage] of [
      ['q_a1_m07_spring', 'culvert'],
      ['q_a1_m12_tide', 'prep'],
    ]) {
      const g = runAt(id as string, stage as string, { act_week: 8 });
      expect(g.world.meta.flags['term.dian_known'], id).not.toBe(true);
    }
  });

  it('waits for the core scene and does not offer a second reward-bearing core choice', () => {
    const g = runAt('q_a1_m12_tide', 'core', { a1_tide_stage: 4 });
    const q = g.world.slices.quests.quests.q_a1_m12_tide;
    expect(q?.status).toBe('active');
    withCtx(g, (ctx) => ctx.setFlag('a1_core_choice', 'grasp'));
    g.queue('quests.choose', { questId: 'q_a1_m12_tide', optionId: 'grasp' });
    g.step(2);
    const choice = g.world.recent.find(
      (e) => e.kind === 'command.result' && e.data.kind === 'quests.choose',
    );
    expect(choice?.kind === 'command.result' ? choice.data.ok : undefined).toBe(false);
    expect(countItem(g.world, 'player', 'dian_core')).toBe(0);
  });

  it('only counts a real applied feeding event toward the first beast meal', () => {
    const g = runAt('q_a1_s29_first_beast', 'feed');
    withCtx(g, (ctx) => {
      ctx.emit('item.used', {
        ownerId: 'player',
        itemId: 'cs_feed_hare_meat',
        targetId: 'wrong_beast',
        effect: 'feed',
      });
    });
    expect(g.world.slices.quests.quests.q_a1_s29_first_beast?.status).toBe('active');
    withCtx(g, (ctx) => {
      ctx.emit('party.fed', {
        companionId: 'pet_ashgrey_wolf',
        entityId: 'beast',
        itemId: 'cs_feed_hare_meat',
        until: 1000,
      });
    });
    expect(g.world.slices.quests.quests.q_a1_s29_first_beast?.status).toBe('done');
  });

  it.each([
    [{}, { masterwork: true }, 'masterwork'],
    [{ p_past_life_door: 'hearth' }, {}, 'hearth'],
    [{}, { signedInputs: true }, 'signed'],
  ])('counts cooking skill only from the actual qualifying craft: %o %o', (f, proof, path) => {
    const flags: Record<string, FlagValue> = {};
    for (const [key, value] of Object.entries(f)) flags[key] = value as FlagValue;
    const g = runAt('q_a1_s36_craft_cooking', 'cook', flags);
    const data: EventMap['craft.done'] = {
      entityId: 'player',
      recipeId: 'rcp_moon_tavern_trio_stew',
      itemId: 'cs_moon_stew',
      count: 1,
      quality: 1,
      ...proof,
    };
    withCtx(g, (ctx) => ctx.emit('craft.done', data));
    expect(g.world.slices.quests.quests.q_a1_s36_craft_cooking?.path).toBe(path);
    expect(g.world.meta.flags['quest.q_a1_s36_craft_cooking.stage']).toBe('taste');
  });

  it('does not accept a failed or ordinary recipe as the cooking breakthrough', () => {
    const g = runAt('q_a1_s36_craft_cooking', 'cook');
    withCtx(g, (ctx) =>
      ctx.emit('craft.done', {
        entityId: 'player',
        recipeId: 'rcp_moon_tavern_trio_stew',
        itemId: 'cs_moon_stew',
        count: 1,
        quality: 1,
        masterwork: false,
        signedInputs: false,
      }),
    );
    expect(g.world.meta.flags['quest.q_a1_s36_craft_cooking.stage']).toBe('cook');
  });

  it('pays an entire choice bundle before effects and never consumes a partial payment', () => {
    const g = runAt('q_a1_s37_craft_leather', 'mitts');
    let paid = false;
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'hide', 3);
      paid = payChoiceCost(ctx, {
        items: [
          { item: 'hide', count: 3 },
          { item: 'wolf_pelt', count: 2 },
        ],
      });
    });
    expect(paid).toBe(false);
    expect(countItem(g.world, 'player', 'hide')).toBe(3);
    withCtx(g, (ctx) => addItem(ctx, 'player', 'wolf_pelt', 2));
    g.queue('quests.choose', { questId: 'q_a1_s37_craft_leather', optionId: 'mitts' });
    g.step(3);
    expect(countItem(g.world, 'player', 'hide')).toBe(0);
    expect(countItem(g.world, 'player', 'wolf_pelt')).toBe(0);
    expect(countItem(g.world, 'player', 'eq_boro_bearpaw_mitts')).toBe(1);
    g.queue('quests.choose', { questId: 'q_a1_s37_craft_leather', optionId: 'mitts' });
    g.step(2);
    expect(countItem(g.world, 'player', 'eq_boro_bearpaw_mitts')).toBe(1);
  });

  it('returns exactly the five soaked skins once, across a saved intermediate wait', () => {
    const g = runAt('q_a1_s37_craft_leather', 'soak');
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'wolf_pelt', 5);
      addItem(ctx, 'player', 'cs_greybane_wash', 5);
      ctx.emit('player.talked', { npcId: 'npc_boro', npcRef: 'boro' });
    });
    expect(g.world.meta.flags['quest.q_a1_s37_craft_leather.stage']).toBe('overnight');
    expect(countItem(g.world, 'player', 'wolf_pelt')).toBe(0);
    expect(countItem(g.world, 'player', 'cs_greybane_wash')).toBe(0);
    const saved = JSON.parse(JSON.stringify(g.world));
    const loaded = Engine.resume(saved, g.content, g.systems);
    loaded.step(8 * TICKS_PER_GAME_HOUR + 12);
    expect(loaded.world.meta.flags['quest.q_a1_s37_craft_leather.stage']).toBe('tan');
    expect(countItem(loaded.world, 'player', 'wolf_pelt')).toBe(5);
    expect(
      holdingOf(loaded.world, 'player').stacks?.some((s) => s.itemId === 'wolf_pelt' && s.purified),
    ).toBe(true);
    loaded.step(20);
    const resumed = Engine.resume(
      JSON.parse(JSON.stringify(loaded.world)),
      loaded.content,
      loaded.systems,
    );
    resumed.step(20);
    expect(countItem(resumed.world, 'player', 'wolf_pelt')).toBe(5);
  });

  it('offers the scavenger quest to a real generated scavenger and counts that talk', () => {
    const content = {
      ...CONTENT,
      acts: CONTENT.acts.map((act) => ({ ...act, clock: undefined, introScene: undefined })),
      dynamicEvents: [],
    };
    const g = Engine.create(20261119, content, [...NARRATIVE_SYSTEMS, npc, otherTeamsStub], {
      aiMode: 'off',
    });
    withCtx(g, (ctx) => {
      ctx.setFlag('act', 'act1');
    });
    withCtx(g, (ctx) => {
      ctx.setFlag('act_week', 8);
    });
    const scavenger = Object.values(g.world.slices.npc.residents).find(
      (r) => r.id.startsWith('res_tpl_scavenger_') && r.map === 'brokenspan_post',
    );
    expect(scavenger).toBeDefined();
    g.queue('stub.talk', { npc: scavenger?.id ?? '' });
    g.step(2);
    const offered = g.world.recent.some(
      (e) =>
        e.kind === 'dialogue.options_offered' &&
        e.data.options.some((o) => o.id === 'accept:q_a1_s27_old_louse'),
    );
    expect(offered).toBe(true);
    g.queue('quests.accept', { questId: 'q_a1_s27_old_louse' });
    g.step(2);
    g.queue('stub.talk', { npc: scavenger?.id ?? '' });
    g.step(2);
    expect(g.world.meta.flags['quest.q_a1_s27_old_louse.stage']).toBe('gully');
  });

  it('only posts an escort of an actual generated peddler and saves the chosen identity', () => {
    const g = Engine.create(20261119, CONTENT, [...NARRATIVE_SYSTEMS, npc, guild], {
      aiMode: 'off',
    });
    let recipient: string | undefined;
    withCtx(g, (ctx) => {
      const b = boardDef(ctx, 'board_borderstone_guild');
      const t = commissionDef(ctx.content, 'cmm_a1_south_road_escort');
      if (!b || !t) throw new Error('missing escort content');
      recipient = post(ctx, b, t)?.recipient;
    });
    expect(recipient).toMatch(/^res_tpl_peddler_\d+$/);
    expect(g.world.slices.npc.residents[recipient ?? '']).toBeDefined();
    const snapshot = JSON.parse(JSON.stringify(g.world));
    const loaded = Engine.resume(snapshot, g.content, g.systems);
    const p = Object.values(loaded.world.slices.guild.postings).find(
      (x) => x.template === 'cmm_a1_south_road_escort',
    );
    expect(p?.recipient).toBe(recipient);
  });

  it.each(['arrive', 'die'] as const)(
    'runs an instantiated escort through the real NPC: %s',
    (outcome) => {
      const content = {
        ...CONTENT,
        quests: [],
        acts: CONTENT.acts.map((act) => ({ ...act, clock: undefined, introScene: undefined })),
        dynamicEvents: [],
      };
      const g = Engine.create(20261119, content, [...NARRATIVE_SYSTEMS, npc, guild], {
        aiMode: 'off',
      });
      let postingId = '';
      let recipient = '';
      withCtx(g, (ctx) => {
        const b = boardDef(ctx, 'board_borderstone_guild');
        const t = commissionDef(ctx.content, 'cmm_a1_south_road_escort');
        if (!b || !t) throw new Error('missing escort content');
        const p = post(ctx, b, t);
        if (!p?.recipient) throw new Error('missing peddler');
        postingId = p.id;
        recipient = p.recipient;
        take(ctx, p.id);
      });
      const escortee = g.world.slices.npc.npcs[recipient];
      expect(escortee).toBeDefined();
      expect(g.world.meta.flags[`quest.${postingId}.stage`]).toBe('meet');
      withCtx(g, (ctx) =>
        ctx.emit('player.talked', { npcId: escortee?.entityId ?? '', npcRef: recipient }),
      );
      expect(escortee?.follow).toMatchObject({ questId: postingId, stage: 'escort' });
      const loaded = Engine.resume(JSON.parse(JSON.stringify(g.world)), content, g.systems);
      const p = loaded.world.slices.guild.postings[postingId];
      const entityId = escortee?.entityId ?? '';
      if (outcome === 'die') {
        const e = loaded.world.slices.world.entities[entityId];
        if (!e) throw new Error('missing escortee entity');
        withCtx(loaded, (ctx) =>
          ctx.emit('entity.died', {
            id: e.id,
            ref: recipient,
            kind: 'npc',
            mapId: e.mapId,
            x: e.x,
            y: e.y,
          }),
        );
        expect(loaded.world.slices.quests.quests[postingId]?.status).toBe('failed');
        expect(p?.state).toBe('failed');
        expect(loaded.world.slices.npc.npcs[recipient]?.follow).toBeNull();
        return;
      }
      const map = content.maps.find((m) => m.id === p?.place.mapId);
      const loc = map?.locations.find((l) => l.id === p?.place.location);
      if (!map || !loc) throw new Error('missing escort destination');
      loaded.queue('world.teleport', {
        entityId: 'player',
        mapId: map.id,
        x: loc.x + loc.w / 2,
        y: loc.y + loc.h / 2,
      });
      loaded.step(32);
      expect(loaded.world.slices.world.entities[entityId]?.mapId).toBe(map.id);
      expect(loaded.world.slices.quests.quests[postingId]?.status).toBe('ready');
      loaded.queue('quests.turn_in', { questId: postingId });
      loaded.step(4);
      expect(loaded.world.slices.quests.quests[postingId]?.status).toBe('done');
      expect(p?.state).toBe('done');
    },
  );

  it('bounty postings use real rumor modifiers, clamp the pay, and grant no quest experience', () => {
    const g = Engine.create(20261119, CONTENT, [...NARRATIVE_SYSTEMS, guild], { aiMode: 'off' });
    let reward = 0;
    withCtx(g, (ctx) => {
      const b = boardDef(ctx, 'board_borderstone_notice');
      const t = commissionDef(ctx.content, 'cmm_a1_bounty_named');
      if (!b || !t || t.goal.type !== 'kill') throw new Error('missing bounty');
      for (const id of t.goal.targets)
        registerModifier(ctx, {
          target: 'monster',
          key: `rumor:${id}`,
          add: 20,
          untilTick: 100000,
          source: 'test',
          visibility: 'hidden',
          note: '',
        });
      reward = post(ctx, b, t)?.reward ?? 0;
    });
    expect(reward).toBe(300);
  });
});
