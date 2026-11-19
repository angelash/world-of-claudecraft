import { describe, expect, it } from 'vitest';
import { Engine, ok, tr } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../src/core/time';
import { addItem, countItem } from '../src/systems/inventory';
import {
  act5Outcome,
  checkCondition,
  evaluate,
  findLeaks,
  flagResolver,
  judgeEnding,
  knowledgeFor,
  type QuestDef,
  questLog,
  reviewOutcome,
  sanitizeText,
  topDoorHints,
} from '../src/systems/quests';
import {
  NARRATIVE_SYSTEMS,
  narrativeContent,
  narrativeGame,
  otherTeamsStub,
  playScene,
} from './narrative_harness';

const ev = (expr: string, flags: Record<string, string | number | boolean>) =>
  evaluate(expr, flagResolver(flags));

/** Run a function with a system context for one tick (gives items, as a player's trade would). */
function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe: GameSystem = { id: 'zz_probe', order: 999, tick: (ctx) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

describe('conditions (reveal-ledger syntax)', () => {
  it('evaluates logic, comparisons, sets, counts and acts', () => {
    expect(ev('a AND NOT b', { a: true })).toBe(true);
    expect(ev('a OR b', {})).toBe(false);
    expect(ev('trust.selene >= 50 OR a3_selene_tremble_told', { 'trust.selene': 50 })).toBe(true);
    expect(ev('a1_oola_fate == cleared', { a1_oola_fate: 'cleared' })).toBe(true);
    expect(ev('a1_oola_fate != cleared', {})).toBe(true);
    expect(ev('a2_wb_ruler IN (edric, cecilia)', { a2_wb_ruler: 'cecilia' })).toBe(true);
    expect(ev('p_answers HAS E6', { p_answers: 'E6,V1' })).toBe(true);
    expect(ev('COUNT(a, b, c) >= 2', { a: true, c: 1 })).toBe(true);
    expect(ev('MAX(x, y) > 3', { x: 2, y: 4 })).toBe(true);
    expect(ev('act >= 3', { act: 'act4' })).toBe(true);
    expect(ev('act == act4', { act: 'act4' })).toBe(true);
    expect(ev('NOT (x == 1 OR y == 2) AND z', { x: 3, y: 3, z: true })).toBe(true);
    expect(ev('', {})).toBe(true);
    expect(checkCondition('a AND')).not.toBeNull();
    expect(checkCondition('a == (b')).not.toBeNull();
  });
});

describe('acts and the main line', () => {
  it('starts act 1 after the prologue and auto-starts its first main quest', () => {
    const g = narrativeGame();
    g.step(1);
    playScene(g);
    g.step(2);
    const acts = g.world.recent.filter((e) => e.kind === 'act.changed');
    expect(
      acts.some(
        (e) => e.kind === 'act.changed' && e.data.from === 'prologue' && e.data.to === 'act1',
      ),
    ).toBe(true);
    expect(g.world.meta.flags.act).toBe('act1');
    expect(g.world.slices.quests.quests.q_a1_m01_fall?.status).toBe('active');
    const log = questLog(g.world, g.content);
    expect(log.actTitle).toBe('第一幕：边石镇');
    expect(log.active.map((q) => q.id)).toContain('q_a1_m01_fall');
  });

  it('offers giver quests in the dialogue menu and accepts through option_chosen', () => {
    const g = narrativeGame();
    // A1-M04 is offered in act weeks 1 to 2 of act 1 (catalog 5.2)
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.queue('flag.set', { key: 'quest.q_a1_m03_register', value: 'done' });
    g.step(2);
    g.queue('stub.talk', { npc: 'bron' });
    g.step(1);
    const offer = g.world.recent.find(
      (e) => e.kind === 'dialogue.options_offered' && e.data.system === 'quests',
    );
    expect(
      offer?.kind === 'dialogue.options_offered' && offer.data.options.map((o) => o.id),
    ).toContain('accept:q_a1_m04_hunt');
    // the option label is a text key with the quest title (content) as its param
    const hunt = g.content.quests.find((q) => q.id === 'q_a1_m04_hunt');
    const opt =
      offer?.kind === 'dialogue.options_offered'
        ? offer.data.options.find((o) => o.id === 'accept:q_a1_m04_hunt')
        : undefined;
    expect(opt?.label).toEqual(tr('sys.quests.label.accept', { title: hunt?.title ?? '' }));
    // the dialogue system reports the choice back
    const probe: GameSystem = {
      id: 'zz_probe',
      order: 999,
      commands: {
        'stub.feat'(ctx) {
          ctx.emit('dialogue.option_chosen', {
            npcId: 'npc_bron',
            system: 'quests',
            optionId: 'accept:q_a1_m04_hunt',
          });
          return ok();
        },
      },
    };
    const g2 = Engine.create(1, narrativeContent(), [...NARRATIVE_SYSTEMS, probe], {});
    g2.queue('flag.set', { key: 'act', value: 'act1' });
    g2.queue('flag.set', { key: 'quest.q_a1_m03_register', value: 'done' });
    g2.step(2);
    g2.queue('stub.feat', { tier: 0 });
    g2.step(1);
    expect(g2.world.slices.quests.quests.q_a1_m04_hunt?.status).toBe('active');
  });

  it('counts only kills by the player side, on the right map, then turns in for rewards', () => {
    const g = narrativeGame();
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.queue('flag.set', { key: 'quest.q_a1_m03_register', value: 'done' });
    g.step(2);
    g.queue('quests.accept', { questId: 'q_a1_m04_hunt' });
    g.step(1);
    // the letter of the third errand comes with the quest
    expect(countItem(g.world, 'player', 'guild_letter')).toBe(1);
    // errand one, the cellar: only rats count
    g.queue('stub.kill', { ref: 'grey_wolf', kind: 'monster', mapId: 'forest_edge' });
    g.step(1);
    expect(g.world.slices.quests.quests.q_a1_m04_hunt?.counts[0]).toBe(0);
    for (let i = 0; i < 4; i++)
      g.queue('stub.kill', { ref: 'dian_rat', kind: 'monster', mapId: 'seal_ruins' });
    g.step(1);
    expect(g.world.slices.quests.quests.q_a1_m04_hunt?.stage).toBe(1);
    // errand two: talking to Oola without the herbs hands nothing over
    g.queue('stub.talk', { npc: 'oola' });
    g.step(2);
    expect(g.world.slices.quests.quests.q_a1_m04_hunt?.stage).toBe(1);
    withCtx(g, (ctx) => addItem(ctx, 'player', 'herb', 5));
    g.queue('stub.talk', { npc: 'oola' });
    g.step(2);
    expect(g.world.slices.quests.quests.q_a1_m04_hunt?.stage).toBe(2);
    expect(countItem(g.world, 'player', 'herb')).toBe(0);
    // errand three: the letter to the chapel
    g.queue('stub.talk', { npc: 'cassian' });
    g.step(2);
    expect(g.world.slices.quests.quests.q_a1_m04_hunt?.status).toBe('ready');
    expect(g.world.meta.flags.a1_cassian_appraise).toBe(true);
    g.queue('quests.accept', { questId: 'q_a1_m04_hunt' });
    g.step(1);
    const again = [...g.world.recent]
      .reverse()
      .find((e) => e.kind === 'command.result' && e.data.kind === 'quests.accept');
    expect(again?.kind === 'command.result' && again.data.reason).toEqual(
      tr('sys.quests.reject.already'),
    );
    g.queue('quests.turn_in', { questId: 'q_a1_m04_hunt' });
    g.step(1);
    expect(g.world.meta.flags['quest.q_a1_m04_hunt']).toBe('done');
    expect(g.world.slices.inventory.owners.player?.money).toBe(270);
    // progression 18.1: 640 paid at the second and the third errand
    const xp = g.world.recent.flatMap((e) => (e.kind === 'xp.awarded' ? [e.data.amount] : []));
    expect(xp).toEqual([320, 320]);
  });

  it('completes a boss objective through the combat flag (orWhen) and recruits the companion', () => {
    const g = narrativeGame();
    g.queue('flag.set', { key: 'quest.q_a1_m01_fall', value: 'done' });
    g.step(2);
    expect(g.world.slices.quests.quests.q_a1_m02_raven?.status).toBe('active');
    g.queue('flag.set', { key: 'boss.guardian_raven.yielded', value: true });
    g.step(2);
    // the reaching out is the binding scene; the companion joins when it ends
    expect(g.world.meta.flags['quest.q_a1_m02_raven.stage']).toBe('reach');
    playScene(g);
    g.step(2);
    expect(g.world.meta.flags['companion.yeyu.recruited']).toBe(true);
    expect(g.world.meta.flags['trust.yeyu']).toBe(40);
    expect(countItem(g.world, 'player', 'old_guild_badge')).toBe(1);
    // the act-1 import drops the seal write and the early word for the sediment (audit 3)
    expect(g.world.meta.flags['term.dian_known']).toBeUndefined();
    const ring = g.content.maps
      .find((m) => m.id === 'seal_ruins')
      ?.locations.find((l) => l.id === 'outer_ring');
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: 'seal_ruins',
      x: (ring?.x ?? 0) + 2,
      y: (ring?.y ?? 0) + 2,
    });
    g.step(12);
    expect(g.world.meta.flags['quest.q_a1_m02_raven']).toBe('done');
  });

  it('runs the beast tide from the tide night, with the waves only when no tide system runs it', () => {
    const run = (tideSystem: boolean) => {
      const g = narrativeGame({ stub: false });
      if (tideSystem) g.queue('flag.set', { key: 'a1_beast_tide_started', value: true });
      g.queue('flag.set', { key: 'a1_tide_night', value: true });
      g.step(2);
      const q = () => g.world.slices.quests.quests.q_a1_m12_tide;
      expect(q()?.status).toBe('active');
      // the quest never forces the unrest: the act clock's night rule does that
      expect(g.world.meta.flags.seal_unrest).not.toBe(100);
      g.step(TICKS_PER_GAME_HOUR + 20);
      return { g, q };
    };
    const { g, q } = run(false);
    expect(g.world.meta.flags['combat.wave.tide_first']).toBe('go');
    g.queue('flag.set', { key: 'combat.wave.tide_first.state', value: 'cleared' });
    g.step(12);
    expect(g.world.meta.flags['combat.wave.tide_second']).toBe('go');
    g.queue('flag.set', { key: 'combat.wave.tide_second.state', value: 'cleared' });
    g.step(12);
    expect(g.world.meta.flags['combat.wave.tide_colossus']).toBe('go');
    // the second surge is a witnessed beat, not a wave (audit 3)
    expect(g.world.meta.flags['combat.wave.tide_flood']).toBeUndefined();
    g.queue('flag.set', { key: 'boss.dian_colossus.defeated', value: true });
    g.step(12);
    expect(g.world.meta.flags.a1_beast_tide_cleared).toBe(true);
    // after the tide the unrest restarts at 30, then the core choice may add to it
    expect(g.world.meta.flags.seal_unrest).toBe(30);
    expect(g.world.meta.flags.a1_martha_strike).toBeUndefined();
    g.queue('quests.choose', { questId: 'q_a1_m12_tide', optionId: 'shatter' });
    g.step(12);
    expect(q()?.status).toBe('active');
    // The core scene owns this choice and its items. This isolated quest run supplies
    // the scene's completion evidence, just as it supplies the combat wave evidence.
    expect(countItem(g.world, 'player', 'colossus_core')).toBe(0);
    g.queue('flag.set', { key: 'a1_core_choice_made', value: true });
    g.step(12);
    expect(q()?.status).toBe('done');
    expect(countItem(g.world, 'player', 'bounty_voucher')).toBe(1);
    expect(g.world.slices.inventory.owners.player?.money).toBe(660);
    // with the tide system running the night (it wrote the start at dusk), the quest neither
    // calls the waves nor ends the night: it waits for the system's clear flag
    const t = run(true);
    expect(t.g.world.meta.flags['combat.wave.tide_first']).toBeUndefined();
    t.g.queue('flag.set', { key: 'a1_tide_stage', value: 3 });
    t.g.step(12);
    expect(t.g.world.meta.flags['combat.wave.tide_colossus']).toBeUndefined();
    t.g.queue('flag.set', { key: 'boss.dian_colossus.defeated', value: true });
    t.g.step(12);
    expect(t.g.world.meta.flags.a1_beast_tide_cleared).toBeUndefined();
    t.g.queue('quests.choose', { questId: 'q_a1_m12_tide', optionId: 'shatter' });
    t.g.step(12);
    expect(t.q()?.status).toBe('active');
    t.g.queue('flag.set', { key: 'a1_core_choice_made', value: true });
    t.g.step(12);
    expect(t.q()?.status).toBe('active');
    t.g.queue('flag.set', { key: 'a1_beast_tide_cleared', value: true });
    t.g.step(12);
    expect(t.q()?.status).toBe('done');
  });

  it('a battle objective: a loss costs the continent and re-arms war.pending', () => {
    const g2 = Engine.create(1, narrativeContent(), [...NARRATIVE_SYSTEMS, otherTeamsStub], {});
    g2.queue('flag.set', { key: 'quest.q_a2_m03_company', value: 'done' });
    g2.queue('flag.set', { key: 'quest.q_a2_m03_village', value: 'done' });
    g2.queue('flag.set', { key: 'continent', value: 70 });
    g2.step(2);
    expect(g2.world.meta.flags['war.pending']).toBe('act2_city_defense');
    g2.queue('flag.set', { key: 'war.pending', value: '' });
    g2.queue('stub.battle', { scenario: 'act2_city_defense', victor: 'enemy' });
    g2.step(1);
    expect(g2.world.meta.flags['war.pending']).toBe('act2_city_defense');
    expect(g2.world.meta.flags.continent).toBe(67);
    g2.queue('stub.battle', { scenario: 'act2_city_defense', victor: 'player' });
    g2.step(1);
    expect(g2.world.meta.flags['quest.q_a2_m12_defense']).toBe('done');
  });

  it('counts buildings and waits on any-of stages', () => {
    const g = narrativeGame();
    g.queue('flag.set', { key: 'quest.q_a3_m01_territory', value: 'done' });
    g.step(2);
    for (let i = 0; i < 3; i++) g.queue('stub.build', { defId: 'house' });
    g.step(1);
    expect(g.world.meta.flags['quest.q_a3_m01_build']).toBe('done');
    // conclave: either the domain milestone or one day of waiting
    const g2 = narrativeGame({ stub: false });
    g2.queue('flag.set', { key: 'quest.q_a4_m03_versions', value: 'done' });
    g2.step(2);
    expect(g2.world.slices.quests.quests.q_a4_m13_conclave?.stage).toBe(0);
    g2.step(TICKS_PER_GAME_DAY + 20);
    expect(g2.world.slices.quests.quests.q_a4_m13_conclave?.stage).toBe(1);
    // the prologue is still playing in this bare run, so the conclave scene waits in the queue
    expect([g2.world.slices.scenes.current?.sceneId, ...g2.world.slices.scenes.queue]).toContain(
      'a4_conclave',
    );
  });

  it('turns a goddess request flag into a side quest', () => {
    const g = narrativeGame({ stub: false });
    g.queue('flag.set', { key: 'request.merca.safe_caravan', value: '护送北路商队' });
    g.step(2);
    // the request posts it at once (the trading branch only carries the notice, catalog 5.5)
    expect(g.world.slices.quests.quests.q_gl_merca_01?.status).toBe('active');
  });

  it('every quest is reachable through the content (no dangling triggers)', () => {
    const content = narrativeContent();
    const ids = new Set((content.quests as QuestDef[]).map((q) => q.id));
    for (const q of content.quests as QuestDef[]) {
      for (const m of (q.trigger ?? '').matchAll(/(?:^|[^a-z_.])quest\.([a-z0-9_]+)/g))
        expect(ids.has(m[1] as string), `${q.id} -> ${m[1]}`).toBe(true);
    }
  });
});

describe('reveal ledger', () => {
  it('filters lore by unlock and tier', () => {
    const content = narrativeContent();
    const early = { meta: { flags: { act: 'act1', p_discarded: true } } };
    const late = {
      meta: {
        flags: {
          act: 'act6',
          a3_ash_tells_sundering: true,
          a6_name_spoken: true,
          a6_charter_read: true,
        },
      },
    };
    const k0Early = knowledgeFor(early, content, 'K0');
    const k5Late = knowledgeFor(late, content, 'K5');
    expect(k5Late.length).toBeGreaterThan(k0Early.length);
    expect(knowledgeFor(early, content, 'K5').some((t) => t.includes('大断绝'))).toBe(false);
  });

  it('finds leaks and rewrites locked names until they unlock', () => {
    const content = narrativeContent();
    const locked = { meta: { flags: {} } };
    const open = { meta: { flags: { a6_name_spoken: true, a3_ash_tells_sundering: true } } };
    expect(findLeaks('雅努在大断绝之后被封印', locked, content)).toEqual(
      expect.arrayContaining(['雅努', '大断绝']),
    );
    expect(sanitizeText('雅努之钥在那里', locked, content)).toBe('无名之钥在那里');
    expect(sanitizeText('雅努·珀尔塔', locked, content)).not.toContain('雅努');
    expect(findLeaks('雅努在大断绝之后被封印', open, content)).toEqual([]);
  });
});

describe('endings and settlements', () => {
  const roster = narrativeContent();
  const left = {
    'verdict.eluen': 'voluntary',
    'verdict.valda': 'judged',
    'verdict.merca': 'voluntary',
    'verdict.sylvie': 'voluntary',
    'verdict.moira': 'voluntary',
  };
  const world = {
    a5_purge_route: 'people',
    a5_gate_ring: 5,
    a5_held_unaided: 3,
    a5_janu_act: 'receive',
    continent: 60,
    a6_review_score: 0.8,
    autonomy: 65,
  };

  it('judges endings in the order of act6 11.0', () => {
    expect(judgeEnding({ ...left, ...world, a6_janu_release: true }, roster)).toBe('release');
    expect(judgeEnding({ ...left, ...world, autonomy: 50, a6_janu_release: true }, roster)).toBe(
      'release_unfinished',
    );
    expect(
      judgeEnding({ ...left, ...world, a6_janu_release: true, a6_player_absorb: true }, roster),
    ).toBe('new_god');
    expect(judgeEnding({ ...left, ...world, a6_janu_release: true, continent: 10 }, roster)).toBe(
      'reclaim',
    );
    expect(
      judgeEnding({ ...left, ...world, a6_janu_release: true, a6_god_war: true }, roster),
    ).toBe('reclaim');
    expect(
      judgeEnding(
        { ...left, ...world, a6_janu_release: false, a6_janu_restore_chosen: true },
        roster,
      ),
    ).toBe('janu_restored');
    expect(judgeEnding({ ...left, ...world, a6_janu_release: false }, roster)).toBe(
      'janu_restored',
    );
    expect(
      judgeEnding({ ...left, ...world, a6_janu_release: true, a6_patron: 'moira' }, roster),
    ).toBe('rule_moira');
    expect(
      judgeEnding({ ...left, ...world, a6_janu_release: true, 'verdict.valda': 'refuse' }, roster),
    ).toBe('rule_valda');
    expect(
      judgeEnding(
        {
          ...left,
          ...world,
          a6_janu_release: true,
          'verdict.valda': 'contend',
          'verdict.eluen': 'contend',
        },
        roster,
      ),
    ).toBe('reclaim');
  });

  it('settles act 5 fronts from autonomy and the gate ring', () => {
    const strong = act5Outcome({
      autonomy: 80,
      a5_purge_route: 'people',
      a5_gate_ring: 5,
      'companion.ron.recruited': true,
    });
    expect(strong.a5_held_unaided).toBe(5);
    expect(strong.a5_janu_act).toBe('receive');
    expect(strong.a5_purify_success).toBe(true);
    const weak = act5Outcome({
      autonomy: 0,
      a5_purge_route: 'people',
      a5_gate_ring: 3,
      a5_faceless_end: 'destroyed',
      continent: 70,
    });
    expect(weak.a5_janu_act).toBe('seal');
    expect(Number(weak.continent)).toBeLessThan(40);
  });

  it('scores the review crises and counts descents', () => {
    const r = reviewOutcome({ autonomy: 70, 'review.no_light.descend': true }, roster);
    expect(r['review.no_light']).toBe('descend');
    expect(r['review.residue_tide']).toBe('self');
    expect(r.a6_descents).toBe(1);
    expect(r.a6_review_score).toBe(0.9);
    expect(reviewOutcome({ autonomy: 0 }, roster).a6_review_score).toBe(0);
  });

  it('ranks prologue door hints with the fixed tie order', () => {
    expect(
      topDoorHints({
        'p_hint.pact': 2,
        'p_hint.blade': 2,
        'p_hint.spirit': 1,
      }),
    ).toEqual(['blade', 'pact']);
  });

  it('keeps the act 6 content table consistent with the endings', () => {
    const content: ContentMap = narrativeContent();
    expect(content.acts.map((a) => a.id)).toEqual([
      'prologue',
      'act1',
      'act2',
      'act3',
      'act4',
      'act5',
      'act6',
      'epilogue',
    ]);
  });
});

describe('story flags read by other systems have writers at their beats', () => {
  it('sets the heroes, Nera stance and Wallenburg ruler along the act 2 main line', () => {
    const g = narrativeGame();
    g.queue('flag.set', { key: 'act', value: 'act2' });
    g.step(2);
    expect(g.world.slices.quests.quests.q_a2_m01_city?.status).toBe('active');
    g.queue('world.teleport', { entityId: 'player', mapId: 'wallenburg', x: 12, y: 6 });
    g.step(12);
    // the hero party comes to the city with the player (npc personas require this flag)
    expect(g.world.meta.flags.a2_heroes_arrived).toBe(true);
    g.queue('flag.set', { key: 'quest.q_a2_m02_exam', value: 'done' });
    g.step(2);
    g.queue('stub.talk', { npc: 'nera' });
    g.queue('quests.accept', { questId: 'q_a2_m03_company' });
    g.step(2);
    // the company's partner share reads this when the company is founded
    expect(g.world.meta.flags['npc.nera.stance']).toBe('neutral');
    g.queue('flag.set', { key: 'quest.q_a2_m03_village', value: 'done' });
    g.step(12);
    expect(g.world.meta.flags['war.pending']).toBe('act2_city_defense');
    g.queue('stub.battle', { scenario: 'act2_city_defense', victor: 'player' });
    g.step(2);
    // city/daily.ts reads the succession outcome when the territory is granted
    expect(g.world.meta.flags.a2_wb_ruler).toBe('edric');
  });

  it('keeps a partner stance won in act 1 and exposes Nera when Merca tells her version', () => {
    const g = narrativeGame();
    g.queue('flag.set', { key: 'npc.nera.stance', value: 'partner' });
    g.queue('flag.set', { key: 'quest.q_a2_m02_exam', value: 'done' });
    g.step(2);
    g.queue('stub.talk', { npc: 'nera' });
    g.queue('quests.accept', { questId: 'q_a2_m03_company' });
    g.step(2);
    expect(g.world.meta.flags['npc.nera.stance']).toBe('partner');
    g.queue('flag.set', { key: 'econ.company_founded', value: true });
    g.queue('flag.set', { key: 'quest.q_a4_m02_feast', value: 'done' });
    g.step(3);
    playScene(g);
    while (g.world.slices.scenes.current) playScene(g);
    expect(g.world.slices.scenes.seen).toContain('a4_goddess_versions');
    expect(g.world.meta.flags.a4_nera_exposed).toBe(true);
  });

  it('every flag in this list is written somewhere in the content or the systems', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.(json|ts)$/.test(f.name)) files.push(readFileSync(p, 'utf8'));
      }
    };
    walk(join(__dirname, '..', 'data'));
    walk(join(__dirname, '..', 'src', 'systems'));
    const all = files.join('\n');
    for (const key of [
      'a2_heroes_arrived',
      'a2_wb_ruler',
      'npc.nera.stance',
      'a4_summit_bloodshed',
      'a6_god_war',
      'a2_archivist_met',
      'a3_archive_sealed_room',
      'a4_nera_exposed',
      'a6_letter7_delivered',
    ]) {
      const written = all.includes(`"key": "${key}"`) || all.includes(`setFlag('${key}'`);
      expect(written, key).toBe(true);
    }
  });
});
