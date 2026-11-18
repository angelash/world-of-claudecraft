// Guild registration and ranks, the commission formulas and the boards (PK-M1-47;
// catalog_quests_acts1_3.md 2, 5.6; society.md 3; ux_and_onboarding.md 6.3.7): the formulas
// reproduce the catalog's table, registration and promotion follow the charter, instancing is
// reproducible from the seed, and a commission runs as a quest of kind `commission` from the
// board to the pay, the decay and the defaults.

import { describe, expect, it } from 'vitest';
import { validateContent } from '../src/content';
import { directorItems, validateGuild } from '../src/content/packs/guild';
import type { ContentMap } from '../src/core/contracts';
import { validateWorld } from '../src/core/save/validate';
import {
  autoPromotes,
  basePay,
  baseXp,
  boardView,
  commissionXp,
  decayFactor,
  defaultPenalty,
  difficultyFactor,
  GUILD_RANKS,
  gateIndex,
  guildCut,
  instanceQuest,
  instanceStages,
  type MemberRecord,
  postingPay,
  promotionNeeds,
  rankIndex,
  rankNeeded,
  readyForExam,
  validateGuildSlice,
} from '../src/systems/guild';
import type {
  CommissionDef,
  DynamicEventDef,
  GuildConfig,
  Posting,
} from '../src/systems/guild/types';
import {
  addQuestInstance,
  allQuestDefs,
  dropQuestInstance,
  questDefOf,
  questLog,
  questTitle,
} from '../src/systems/quests';
import {
  BASE,
  cmd,
  flags,
  type G,
  goTo,
  goToBoard,
  gs,
  guildGame,
  hours,
  kill,
  money,
  nextWeek,
  playerMoney,
  resumeGuildGame,
  set,
  talk,
  today,
} from './guild_harness';

const CFG = BASE.guildConfig;
const tpl = (id: string): CommissionDef => {
  const t = BASE.commissions.find((c) => c.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t;
};
const GUILD_BOARD = 'board_borderstone_guild';
const NOTICE_BOARD = 'board_borderstone_notice';

const member = (over: Partial<MemberRecord> = {}): MemberRecord => ({
  rank: 'f',
  registeredTick: 0,
  done: {},
  defaults: 0,
  merit: 0,
  history: [],
  ...over,
});

/** Postings of a board in a state. */
const postingsOf = (t: G, board: string, state: Posting['state'] = 'posted') =>
  Object.values(gs(t.g).postings).filter((p) => p.board === board && p.state === state);

/** Register the player through the story's condition (A1-M03 sets a1_guild_registered). */
function registerByStory(t: G): void {
  set(t, 'a1_guild_registered', true);
  t.g.step(2);
}

/** A posting of a template on the guild board, posted for the test (bypasses the draw). */
function postNow(t: G, templateId: string, board = GUILD_BOARD): Posting {
  const before = new Set(Object.keys(gs(t.g).postings));
  t.g.queue('gh.post', { templateId, board });
  t.g.step(2);
  const id = Object.keys(gs(t.g).postings).find((k) => !before.has(k));
  if (!id) throw new Error(`no posting of ${templateId}`);
  return gs(t.g).postings[id] as Posting;
}

// ---------------------------------------------------------------------------

describe('commission formulas (catalog 2.3, 2.4)', () => {
  // the catalog 5.6 table: pay (copper) and experience of every template the data carries
  const TABLE: Record<string, [number, number]> = {
    cmm_a1_cellar_rats: [65, 45],
    cmm_a1_herb_gather: [55, 55],
    cmm_a1_town_letter: [40, 35],
    cmm_a1_lost_item: [65, 70],
    cmm_a1_wolf_cull: [240, 125],
    cmm_a1_night_watch: [240, 260],
    cmm_a1_dian_wolf_north: [575, 315],
    cmm_a1_bandit_writ: [575, 250],
    cmm_a1_waste_bones: [865, 380],
    cmm_a1_boar_westfield: [200, 170],
    cmm_a1_spider_valley: [215, 170],
  };

  it('reproduces the pay and experience of catalog 5.6 for every template in data', () => {
    expect(Object.keys(TABLE).sort()).toEqual(BASE.commissions.map((c) => c.id).sort());
    for (const [id, [pay, xp]] of Object.entries(TABLE)) {
      expect(basePay(CFG, tpl(id)), `${id} pay`).toBe(pay);
      expect(baseXp(CFG, tpl(id)), `${id} xp`).toBe(xp);
    }
  });

  it('bands the difficulty against the rank median and clamps the pay into the band', () => {
    // E median 6: 3 below or more 0.8, within 2 1.0, 3 to 5 above 1.3, 6 above 1.6
    expect(difficultyFactor(CFG, 'e', 3)).toBe(0.8);
    expect(difficultyFactor(CFG, 'e', 4)).toBe(1);
    expect(difficultyFactor(CFG, 'e', 8)).toBe(1);
    expect(difficultyFactor(CFG, 'e', 9)).toBe(1.3);
    expect(difficultyFactor(CFG, 'e', 11)).toBe(1.3);
    expect(difficultyFactor(CFG, 'e', 12)).toBe(1.6);
    // a letter: 70 x 0.6 = 42, rounded to 40 and inside the F band 40 to 150
    const letter = { ...tpl('cmm_a1_town_letter'), level: 1 };
    expect(basePay(CFG, letter)).toBe(40);
    // an F escort far into the wilds well above the median: 70 x 1.3 x 1.6 x 1.8 = 262 to 150
    const wild = {
      ...tpl('cmm_a1_cellar_rats'),
      kind: 'escort' as const,
      distance: 'wild' as const,
      level: 12,
    };
    expect(basePay(CFG, wild)).toBe(150);
  });

  it('pays urgent postings half again, the cut on top and a fifth as penalty', () => {
    const t = tpl('cmm_a1_wolf_cull');
    expect(postingPay(CFG, t, false)).toBe(240);
    expect(postingPay(CFG, t, true)).toBe(360);
    expect(guildCut(CFG, 240)).toBe(36);
    expect(defaultPenalty(CFG, 240)).toBe(50);
    expect(defaultPenalty(CFG, 65)).toBe(15);
  });

  it('decays by the week count and gives nothing past the zero difference', () => {
    expect([0, 1, 2, 3, 9].map((n) => decayFactor(CFG, n))).toEqual([1, 0.5, 0.25, 0.25, 0.25]);
    const wolves = tpl('cmm_a1_wolf_cull');
    expect(commissionXp(CFG, wolves, 4, 0)).toBe(125);
    expect(commissionXp(CFG, wolves, 4, 1)).toBe(65);
    expect(commissionXp(CFG, wolves, 4, 2)).toBe(30);
    // nothing once the player stands the zero difference over the level 4 commission:
    // zeroDiff(10) is 7 (6 over: paid), zeroDiff(11) is 7 (7 over: none), as the kill formula
    expect(commissionXp(CFG, wolves, 10, 0)).toBe(125);
    expect(commissionXp(CFG, wolves, 11, 0)).toBe(0);
    expect(commissionXp(CFG, wolves, 12, 0)).toBe(0);
  });
});

describe('ranks (society.md 3.1, 3.2)', () => {
  const E = CFG.ranks.find((r) => r.id === 'e');
  const D = CFG.ranks.find((r) => r.id === 'd');
  const C = CFG.ranks.find((r) => r.id === 'c');

  it('E needs the card level 5, ten F commissions and a clean record, no exam', () => {
    if (!E) throw new Error('no E');
    const ready = member({ done: { f: 10 } });
    expect(autoPromotes(E, promotionNeeds(E, ready, 5))).toBe(true);
    expect(autoPromotes(E, promotionNeeds(E, ready, 4))).toBe(false);
    expect(autoPromotes(E, promotionNeeds(E, member({ done: { f: 9 } }), 5))).toBe(false);
    expect(autoPromotes(E, promotionNeeds(E, member({ done: { f: 12 }, defaults: 1 }), 5))).toBe(
      false,
    );
    // the player's card reads Lv1 forever: the level gate never opens by itself
    expect(autoPromotes(E, promotionNeeds(E, ready, CFG.registration.cardLevel))).toBe(false);
  });

  it('D and up need their exam; C needs thirty merit points', () => {
    if (!D || !C) throw new Error('no D or C');
    const needsD = promotionNeeds(D, member({ rank: 'e' }), 10);
    expect(autoPromotes(D, needsD)).toBe(false);
    expect(readyForExam(needsD)).toBe(true);
    expect(needsD.map((n) => n.kind)).toEqual(['level', 'exam']);
    const needsC = promotionNeeds(C, member({ rank: 'd', merit: 29 }), 15);
    expect(readyForExam(needsC)).toBe(false);
    expect(readyForExam(promotionNeeds(C, member({ rank: 'd', merit: 30 }), 15))).toBe(true);
  });

  it('gates a board by the rank plus its reach, or the party leader with the reach', () => {
    expect(GUILD_RANKS.map(rankIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(gateIndex('f', [], 1)).toBe(rankIndex('e'));
    expect(gateIndex('f', ['d'], 1)).toBe(rankIndex('c'));
    expect(gateIndex('f', [], 0)).toBe(rankIndex('f'));
    expect(gateIndex('f', [], null)).toBe(rankIndex('s'));
    // the borderstone branch (catalog 2.1): F and E to any member, D with a D leader
    expect(gateIndex('f', [], 0, 'e')).toBe(rankIndex('e'));
    expect(gateIndex('e', [], 0, 'e')).toBe(rankIndex('e'));
    expect(gateIndex('f', ['d'], 0, 'e')).toBe(rankIndex('d'));
    expect(gateIndex('d', [], 0, 'e')).toBe(rankIndex('d'));
    expect(rankNeeded('d', 1)).toBe('e');
    expect(rankNeeded('d', 0)).toBe('d');
    expect(rankNeeded('d', null)).toBe('f');
    expect(rankNeeded('e', 0, 'e')).toBe('f');
    expect(rankNeeded('d', 0, 'e')).toBe('d');
  });
});

describe('registration', () => {
  it('registers by the story at F without a fee, once', () => {
    const t = guildGame();
    expect(flags(t.g).guild_rank).toBeUndefined();
    money(t, 300);
    registerByStory(t);
    expect(flags(t.g).guild_rank).toBe('f');
    expect(gs(t.g).member?.history.map((h) => h.how)).toEqual(['register']);
    expect(playerMoney(t)).toBe(300);
    expect(t.events.filter((e) => e.kind === 'guild.registered')).toHaveLength(1);
    goToBoard(t, 'board_borderstone_guild');
    expect(cmd(t, 'guild.register', {}).code).toBe('already');
  });

  it('registers at the counter for the one-silver fee, refused without it', () => {
    const t = guildGame();
    money(t, 60);
    expect(cmd(t, 'guild.register', {}).code).toBe('far');
    goToBoard(t, 'board_borderstone_guild');
    expect(cmd(t, 'guild.register', {}).code).toBe('no_money');
    expect(flags(t.g).guild_rank).toBeUndefined();
    money(t, 60);
    expect(cmd(t, 'guild.register', {}).ok).toBe(true);
    expect(flags(t.g).guild_rank).toBe('f');
    expect(playerMoney(t)).toBe(20);
    // a model never registers the player
    const ai = guildGame();
    money(ai, 500);
    expect(cmd(ai, 'guild.register', {}, { type: 'ai', agentId: 'x', requestId: 'r' }).code).toBe(
      'not_allowed',
    );
  });
});

describe('promotion', () => {
  it('practical recognition takes the player from F to B and marks the card', () => {
    const t = guildGame();
    registerByStory(t);
    // the player cannot promote themselves; exams come from the story and the kernel
    expect(cmd(t, 'guild.promote', { rank: 'b', practical: true }).code).toBe('not_allowed');
    const script = { type: 'script', script: 'cut_a2_exam' } as const;
    expect(cmd(t, 'guild.promote', { rank: 'f' }, script).code).toBe('not_higher');
    expect(cmd(t, 'guild.promote', { rank: 'b' }, script).code).toBe('one_step');
    expect(cmd(t, 'guild.promote', { rank: 'b', practical: true }, script).ok).toBe(true);
    expect(flags(t.g).guild_rank).toBe('b');
    expect(flags(t.g)['guild.practical']).toBe(true);
    expect(gs(t.g).member?.history.map((h) => `${h.rank}:${h.how}`)).toEqual([
      'f:register',
      'b:practical',
    ]);
  });

  it('the regular exam promotes one step once the other requirements hold', () => {
    const t = guildGame();
    registerByStory(t);
    const script = { type: 'script', script: 'exam' } as const;
    // F to E: the card reads Lv1, ten F commissions are missing
    expect(cmd(t, 'guild.promote', { rank: 'e' }, script).code).toBe('not_ready_rank');
    const m = gs(t.g).member as MemberRecord;
    m.done.f = 10;
    // still the card level: E needs Lv5 read by the crystal
    expect(cmd(t, 'guild.promote', { rank: 'e' }, script).code).toBe('not_ready_rank');
  });

  it('the regular exam passes for a member whose card reads the level', () => {
    const cfg: GuildConfig = { ...CFG, registration: { ...CFG.registration, cardLevel: 15 } };
    const t = guildGame({ content: { ...BASE, guildConfig: cfg } });
    registerByStory(t);
    const script = { type: 'script', script: 'exam' } as const;
    set(t, 'guild_rank', 'e');
    // E to D: the branch exam is the promotion itself; skipping a rank is refused
    expect(cmd(t, 'guild.promote', { rank: 'c' }, script).code).toBe('one_step');
    expect(cmd(t, 'guild.promote', { rank: 'd' }, script).ok).toBe(true);
    expect(flags(t.g).guild_rank).toBe('d');
    expect(flags(t.g)['guild.practical']).toBeUndefined();
    // D to C: the exam passes only with thirty merit points on the record
    expect(cmd(t, 'guild.promote', { rank: 'c' }, script).code).toBe('not_ready_rank');
    (gs(t.g).member as MemberRecord).merit = 30;
    expect(cmd(t, 'guild.promote', { rank: 'c' }, script).ok).toBe(true);
    expect(gs(t.g).member?.history.map((h) => `${h.rank}:${h.how}`)).toEqual([
      'f:register',
      'e:story',
      'd:exam',
      'c:exam',
    ]);
  });

  it('promotes to E by itself for a member whose card reads Lv5 after ten clean F commissions', () => {
    const cfg: GuildConfig = { ...CFG, registration: { ...CFG.registration, cardLevel: 5 } };
    const t = guildGame({ content: { ...BASE, guildConfig: cfg } });
    registerByStory(t);
    const m = gs(t.g).member as MemberRecord;
    m.done.f = 9;
    set(t, 'zz_poke', 1);
    expect(flags(t.g).guild_rank).toBe('f');
    m.done.f = 10;
    m.defaults = 1;
    set(t, 'zz_poke', 2);
    expect(flags(t.g).guild_rank).toBe('f');
    m.defaults = 0;
    set(t, 'zz_poke', 3);
    expect(flags(t.g).guild_rank).toBe('e');
    expect(m.history.at(-1)).toMatchObject({ rank: 'e', how: 'auto' });
    // D's level gate (Lv10) is shut for this card, so it stays: D needs its exam besides
    hours(t, 2);
    expect(flags(t.g).guild_rank).toBe('e');
  });

  it('never steps to an exam rank by itself, even with every other requirement met', () => {
    const cfg: GuildConfig = { ...CFG, registration: { ...CFG.registration, cardLevel: 60 } };
    const t = guildGame({ content: { ...BASE, guildConfig: cfg } });
    registerByStory(t);
    const m = gs(t.g).member as MemberRecord;
    m.done.f = 10;
    m.merit = 100;
    set(t, 'zz_poke', 1);
    hours(t, 2);
    // E needs no exam: it comes; D and up wait for theirs
    expect(flags(t.g).guild_rank).toBe('e');
  });

  it('follows the rank flag when the story writes it', () => {
    const t = guildGame();
    registerByStory(t);
    set(t, 'guild_rank', 'c');
    expect(gs(t.g).member?.rank).toBe('c');
    expect(gs(t.g).member?.history.at(-1)).toMatchObject({ rank: 'c', how: 'story' });
  });

  it('takes a story write of guild_rank before any record as the registration', () => {
    const t = guildGame();
    set(t, 'guild_rank', 'f');
    expect(gs(t.g).member?.history.map((h) => h.how)).toEqual(['register']);
    expect(t.events.filter((e) => e.kind === 'guild.registered')).toHaveLength(1);
    expect(t.events.some((e) => e.kind === 'guild.promoted')).toBe(false);
  });
});

const game = (seed?: number) => guildGame({ seed });

describe('boards and instancing', () => {
  it('fills the boards at the act start and every week, within the cap and the gates', () => {
    const t = game();
    const first = postingsOf(t, GUILD_BOARD);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first.length).toBeLessThanOrEqual(6);
    // the first cellar, herb and letter commissions belong to A1-M04: held off the board
    for (const p of first)
      expect(['cmm_a1_cellar_rats', 'cmm_a1_herb_gather', 'cmm_a1_town_letter']).not.toContain(
        p.template,
      );
    // the night watch posts only in act weeks 8 and 9
    for (let w = 0; w < 6; w++) {
      nextWeek(t);
      const up = postingsOf(t, GUILD_BOARD);
      expect(up.length).toBeLessThanOrEqual(6);
      expect(up.some((p) => p.template === 'cmm_a1_night_watch')).toBe(false);
    }
    expect(postingsOf(t, NOTICE_BOARD).every((p) => p.template === 'cmm_a1_bandit_writ')).toBe(
      true,
    );
    // one posting of a template per board at a time; display numbers GC-<rank>-<nnn>
    for (const board of [GUILD_BOARD, NOTICE_BOARD]) {
      const up = postingsOf(t, board).map((p) => p.template);
      expect(new Set(up).size).toBe(up.length);
    }
    for (const p of Object.values(gs(t.g).postings)) {
      expect(p.display).toMatch(/^GC-[FEDCBA]-\d{3}$/);
      expect(p.id).toBe(p.display.toLowerCase().replace(/-/g, '_'));
    }
  });

  it('is reproducible from the seed: the same seed posts the same commissions', () => {
    const run = (seed: number) => {
      const t = game(seed);
      for (let w = 0; w < 9; w++) nextWeek(t);
      return JSON.stringify(gs(t.g).postings);
    };
    const a = run(101);
    expect(run(101)).toBe(a);
    expect(run(202)).not.toBe(a);
  });

  it('posts the night watch in weeks 8 and 9 only, at most five times', () => {
    const t = game();
    const seen = new Set<number>();
    for (let w = 0; w < 11; w++) {
      nextWeek(t);
      const week = Number(flags(t.g).act_week);
      if (postingsOf(t, GUILD_BOARD).some((p) => p.template === 'cmm_a1_night_watch'))
        seen.add(week);
    }
    for (const w of seen) expect([8, 9, 10]).toContain(w); // a week-9 posting stays up into week 10
    expect([...seen].some((w) => w === 8 || w === 9)).toBe(true);
    // five completions and it never posts again, not even as an emergency
    const done = game();
    gs(done.g).total.cmm_a1_night_watch = 5;
    while (Number(flags(done.g).act_week ?? 0) < 10) nextWeek(done);
    expect(
      Object.values(gs(done.g).postings).some((p) => p.template === 'cmm_a1_night_watch'),
    ).toBe(false);
  });

  it('builds the instance as a quest of kind commission with the drawn parameters', () => {
    const t = tpl('cmm_a1_cellar_rats');
    const p = {
      id: 'gc_f_007',
      display: 'GC-F-007',
      template: t.id,
      board: GUILD_BOARD,
      rank: 'f',
      giver: 'martha',
      place: { mapId: 'borderstone', location: 'drunk_moon' },
      target: 'dian_rat',
      count: 6,
      days: 3,
      reward: 65,
      cut: 10,
      urgent: false,
      emergency: false,
      postedDay: 0,
      untilDay: 13,
      state: 'posted',
    } satisfies Posting;
    const q = instanceQuest(t, p, { act: 'act1', turnIn: 'lina', deadline: 12 });
    expect(q).toMatchObject({
      id: 'gc_f_007',
      kind: 'commission',
      turnIn: 'lina',
      textOf: { table: 'commissions', id: 'cmm_a1_cellar_rats' },
      expiry: { when: 'day > 12' },
    });
    expect(q.stages[0]?.objectives[0]).toMatchObject({
      type: 'kill',
      refs: ['dian_rat'],
      count: 6,
    });
    // find: reach the place, then report to the giver; watch: reach, then hold for hours
    const find = instanceStages(tpl('cmm_a1_lost_item'), {
      ...p,
      template: 'cmm_a1_lost_item',
      giver: 'dora',
      place: { mapId: 'borderstone', location: 'washing_creek' },
    });
    expect(find.map((s) => s.objectives[0]?.type)).toEqual(['reach', 'talk']);
    const watch = instanceStages(tpl('cmm_a1_night_watch'), {
      ...p,
      place: { mapId: 'borderstone', location: 'east_gate' },
    });
    expect(watch.map((s) => s.objectives[0]?.type)).toEqual(['reach', 'wait', 'reach']);
  });
});

describe('a commission from the board to the pay', () => {
  function registered(seed?: number): G {
    const t = game(seed);
    registerByStory(t);
    goToBoard(t, GUILD_BOARD);
    return t;
  }

  it('takes, kills, hands in at the board: pay, experience, the count and the books', () => {
    const t = registered();
    const p = postNow(t, 'cmm_a1_wolf_cull');
    expect(cmd(t, 'guild.accept', { postingId: p.id }).ok).toBe(true);
    const q = t.g.world.slices.quests.quests[p.id];
    expect(q?.status).toBe('active');
    expect(t.g.world.slices.quests.instances?.[p.id]?.kind).toBe('commission');
    expect(questLog(t.g.world, t.g.content).active.map((v) => v.id)).toContain(p.id);
    // kills elsewhere do not count: the wolves are in the forest
    kill(t, 'grey_wolf', 'borderstone', 6);
    expect(q?.status).toBe('active');
    kill(t, 'grey_wolf', 'forest_edge', p.count ?? 6);
    expect(t.g.world.slices.quests.quests[p.id]?.status).toBe('ready');
    goTo(t, 'borderstone');
    expect(cmd(t, 'guild.turn_in', { postingId: p.id }).code).toBe('far');
    goToBoard(t, GUILD_BOARD);
    const before = playerMoney(t);
    const xpBefore = t.events.length;
    expect(cmd(t, 'guild.turn_in', { postingId: p.id }).ok).toBe(true);
    expect(t.g.world.slices.quests.quests[p.id]?.status).toBe('done');
    expect(playerMoney(t) - before).toBe(240);
    const xp = t.events.slice(xpBefore).find((e) => e.kind === 'xp.awarded');
    expect(xp?.kind === 'xp.awarded' && xp.data).toEqual({
      entityId: t.g.world.slices.world.playerId,
      amount: 125,
      reason: 'quest:cmm_a1_wolf_cull',
    });
    expect(flags(t.g)['cmm_count.cmm_a1_wolf_cull']).toBe(1);
    expect(flags(t.g)['guild.done']).toBe(1);
    expect(gs(t.g).member?.done.e).toBe(1);
    expect(gs(t.g).ledger).toEqual({ cut: 36, paid: 240 });
    expect(gs(t.g).postings[p.id]?.state).toBe('done');
    // the wolves' modifier: a week of lower monster pressure on the forest edge
    const mod = t.g.world.slices.modifiers.active.find((m) => m.source === 'cmm_a1_wolf_cull');
    expect(mod).toMatchObject({ target: 'monster', key: 'forest_edge', factor: 0.8 });
  });

  it('decays the experience within a week and resets the count at the week start', () => {
    const t = registered();
    const xpOf = (): number => {
      const p = postNow(t, 'cmm_a1_wolf_cull');
      cmd(t, 'guild.accept', { postingId: p.id });
      kill(t, 'grey_wolf', 'forest_edge', p.count ?? 6);
      const mark = t.events.length;
      cmd(t, 'guild.turn_in', { postingId: p.id });
      const e = t.events.slice(mark).find((x) => x.kind === 'guild.commission_done');
      return e?.kind === 'guild.commission_done' ? e.data.xp : -1;
    };
    // stay inside one calendar week for the first three
    expect([xpOf(), xpOf(), xpOf()]).toEqual([125, 65, 30]);
    expect(flags(t.g)['cmm_count.cmm_a1_wolf_cull']).toBe(3);
    nextWeek(t);
    expect(flags(t.g)['cmm_count.cmm_a1_wolf_cull']).toBe(0);
    expect(xpOf()).toBe(125);
  });

  it('gates the ranks: F and E to any member, D with a D adventurer leading the party', () => {
    const t = registered();
    // an F takes an E posting at the borderstone branch (catalog 2.1)
    const e = postNow(t, 'cmm_a1_wolf_cull');
    expect(cmd(t, 'guild.accept', { postingId: e.id }).ok).toBe(true);
    const d = postNow(t, 'cmm_a1_dian_wolf_north');
    expect(cmd(t, 'guild.accept', { postingId: d.id }).code).toBe('rank');
    // an E alone may not take a D posting either
    set(t, 'guild_rank', 'e');
    expect(cmd(t, 'guild.accept', { postingId: d.id }).code).toBe('rank');
    // the window data says what a lone taker needs
    let view = boardView(t.g.world, t.g.content, GUILD_BOARD);
    expect(view?.postings.find((v) => v.id === d.id)?.needs).toBe('d');
    // Ron, a D-rank adventurer, in the party
    (t.g.world.slices as { party?: unknown }).party = { members: { ron: { id: 'ron' } } };
    expect(cmd(t, 'guild.accept', { postingId: d.id }).ok).toBe(true);
    view = boardView(t.g.world, t.g.content, GUILD_BOARD);
    expect(view?.playerRank).toBe('e');
    expect(view?.accepted.map((v) => v.id)).toEqual([e.id, d.id]);
    expect(view?.accepted.find((v) => v.id === e.id)?.needs).toBe('f');
    expect(view?.rankProgress.next).toBe('d');
    expect(view?.rankProgress.needs.map((n) => n.kind)).toEqual(['level', 'exam']);
    // the notice board takes anyone
    const writ = postNow(t, 'cmm_a1_bandit_writ', NOTICE_BOARD);
    const notice = boardView(t.g.world, t.g.content, NOTICE_BOARD);
    expect(notice?.postings.find((v) => v.id === writ.id)).toMatchObject({ needs: 'f', cut: 0 });
  });

  it('refuses an unregistered taker, a far one, a sixth commission and a taken posting', () => {
    const t = game();
    goToBoard(t, GUILD_BOARD);
    const p = postNow(t, 'cmm_a1_lost_item');
    expect(cmd(t, 'guild.accept', { postingId: p.id }).code).toBe('not_registered');
    registerByStory(t);
    goTo(t, 'borderstone');
    expect(cmd(t, 'guild.accept', { postingId: p.id }).code).toBe('far');
    goToBoard(t, GUILD_BOARD);
    expect(cmd(t, 'guild.accept', { postingId: p.id }).ok).toBe(true);
    expect(cmd(t, 'guild.accept', { postingId: p.id }).code).toBe('taken');
    // D postings: Ron leads the party, so they may be taken
    (t.g.world.slices as { party?: unknown }).party = { members: { ron: { id: 'ron' } } };
    for (let i = 0; i < 4; i++) {
      const x = postNow(t, 'cmm_a1_waste_bones');
      expect(cmd(t, 'guild.accept', { postingId: x.id }).ok).toBe(true);
    }
    const sixth = postNow(t, 'cmm_a1_wolf_cull');
    expect(cmd(t, 'guild.accept', { postingId: sixth.id }).code).toBe('full');
    expect(cmd(t, 'guild.accept', { postingId: 'gc_x_999' }).code).toBe('no_posting');
  });

  it('walking away costs the penalty and a default; so does running out of time', () => {
    const t = registered();
    money(t, 500);
    const a = postNow(t, 'cmm_a1_wolf_cull');
    cmd(t, 'guild.accept', { postingId: a.id });
    const before = playerMoney(t);
    expect(cmd(t, 'guild.abandon', { postingId: a.id }).ok).toBe(true);
    expect(t.g.world.slices.quests.quests[a.id]?.status).toBe('failed');
    expect(before - playerMoney(t)).toBe(50);
    expect(gs(t.g).postings[a.id]?.state).toBe('failed');
    expect(flags(t.g)['guild.defaults']).toBe(1);
    // a lost item has three days counting today: the fourth day it has run out
    const b = postNow(t, 'cmm_a1_lost_item');
    cmd(t, 'guild.accept', { postingId: b.id });
    const deadline = gs(t.g).postings[b.id]?.deadline ?? 0;
    expect(deadline).toBe(today(t.g) + 2);
    const mid = playerMoney(t);
    hours(t, 24 * 4);
    expect(t.g.world.slices.quests.quests[b.id]?.status).toBe('expired');
    expect(gs(t.g).postings[b.id]?.state).toBe('expired');
    expect(mid - playerMoney(t)).toBe(15);
    expect(flags(t.g)['guild.defaults']).toBe(2);
    expect(gs(t.g).member?.defaults).toBe(2);
    // a player who cannot pay pays what they have
    const c = postNow(t, 'cmm_a1_wolf_cull');
    cmd(t, 'guild.accept', { postingId: c.id });
    money(t, -playerMoney(t) + 20);
    const mark = t.events.length;
    cmd(t, 'guild.abandon', { postingId: c.id });
    const d = t.events.slice(mark).find((e) => e.kind === 'guild.commission_defaulted');
    expect(d?.kind === 'guild.commission_defaulted' && d.data.penalty).toBe(20);
    expect(playerMoney(t)).toBe(0);
  });

  it('a find commission: search the place, report to the client, the commons remember it', () => {
    const t = registered();
    const p = postNow(t, 'cmm_a1_lost_item');
    cmd(t, 'guild.accept', { postingId: p.id });
    const map = t.g.content.maps.find((m) => m.id === p.place.mapId);
    const loc = map?.locations.find((l) => l.id === p.place.location);
    if (!loc) throw new Error('no place');
    t.g.queue('world.teleport', {
      entityId: t.g.world.slices.world.playerId,
      mapId: p.place.mapId,
      x: loc.x + loc.w / 2,
      y: loc.y + loc.h / 2,
    });
    t.g.step(12);
    expect(t.g.world.slices.quests.quests[p.id]?.stage).toBe(1);
    talk(t, p.giver ?? '');
    expect(t.g.world.slices.quests.quests[p.id]?.status).toBe('ready');
    // handed in at the clerk through the dialogue path of the quests system: paid the same
    const before = playerMoney(t);
    cmd(t, 'quests.turn_in', { questId: p.id });
    expect(playerMoney(t) - before).toBe(65);
    expect(gs(t.g).postings[p.id]?.state).toBe('done');
    expect(flags(t.g)['rep.bs_commons']).toBe(2);
  });

  it('a notice-board writ pays on the spot, without a guild cut', () => {
    const t = registered();
    const p = postNow(t, 'cmm_a1_bandit_writ', NOTICE_BOARD);
    expect(p.cut).toBe(0);
    // the writ hangs on the plaza, not in the guild hall
    expect(cmd(t, 'guild.accept', { postingId: p.id }).code).toBe('far');
    goToBoard(t, NOTICE_BOARD);
    expect(cmd(t, 'guild.accept', { postingId: p.id }).ok).toBe(true);
    const before = playerMoney(t);
    kill(t, 'oneeye_bandit', 'forest_edge', p.count ?? 5);
    expect(t.g.world.slices.quests.quests[p.id]?.status).toBe('done');
    expect(playerMoney(t) - before).toBe(575);
  });

  it('A1-M04 holds the first cellar, herb and letter commissions and counts them once', () => {
    const t = registered();
    // A1-M04's window is weeks 1 to 2 (after it, someone else takes the errands, PK-M1-33)
    nextWeek(t);
    const held = ['cmm_a1_cellar_rats', 'cmm_a1_herb_gather', 'cmm_a1_town_letter'];
    expect(Object.values(gs(t.g).postings).some((p) => held.includes(p.template))).toBe(false);
    // the quest stands ready at Bron's (its own objectives are the quests system's tests)
    expect(t.g.content.quests.some((q) => q.id === 'q_a1_m04_hunt')).toBe(true);
    t.g.world.slices.quests.order.push('q_a1_m04_hunt');
    t.g.world.slices.quests.quests.q_a1_m04_hunt = {
      id: 'q_a1_m04_hunt',
      status: 'ready',
      stage: 0,
      counts: [],
      met: [],
      stageStartTick: 0,
      startedTick: 0,
      choices: {},
    };
    cmd(t, 'quests.turn_in', { questId: 'q_a1_m04_hunt' });
    expect(gs(t.g).firstDone.sort()).toEqual([...held].sort());
    expect(gs(t.g).member?.done.f).toBe(3);
    expect(flags(t.g)['cmm_count.cmm_a1_cellar_rats']).toBe(1);
    // released: they post from the next week on
    for (let w = 0; w < 3; w++) nextWeek(t);
    expect(Object.values(gs(t.g).postings).some((p) => held.includes(p.template))).toBe(true);
  });

  it('keeps a sound slice through a save round trip and finishes the commission after it', () => {
    const t = registered();
    const p = postNow(t, 'cmm_a1_wolf_cull');
    cmd(t, 'guild.accept', { postingId: p.id });
    expect(validateGuildSlice(gs(t.g))).toEqual([]);
    const world = JSON.parse(JSON.stringify(t.g.world));
    expect(validateGuildSlice(world.slices.guild)).toEqual([]);
    expect(validateGuildSlice({ ...world.slices.guild, postings: { x: { id: 'y' } } })).not.toEqual(
      [],
    );
    expect(world.slices.quests.instances[p.id].kind).toBe('commission');
    // the loaded world runs the commission to its pay
    const r = resumeGuildGame(world);
    kill(r, 'grey_wolf', 'forest_edge', p.count ?? 6);
    expect(r.g.world.slices.quests.quests[p.id]?.status).toBe('ready');
    const before = playerMoney(r);
    expect(cmd(r, 'guild.turn_in', { postingId: p.id }).ok).toBe(true);
    expect(playerMoney(r) - before).toBe(240);
  });

  it('loads a save from before the guild: no slice is sound, and one is made on first use', () => {
    expect(validateGuildSlice(undefined)).toEqual([]);
    const t = registered();
    const world = JSON.parse(JSON.stringify(t.g.world));
    delete world.slices.guild;
    expect(validateWorld(world, [{ id: 'guild', validateSlice: validateGuildSlice }])).toEqual([]);
    const r = resumeGuildGame(world);
    hours(r, 2);
    expect(gs(r.g)).toBeDefined();
    expect(Object.values(gs(r.g).postings).length).toBeGreaterThan(0);
    // the rank flag stayed and the record follows it
    expect(gs(r.g).member?.rank).toBe('f');
  });

  it('drops closed commissions and their quests after the retention weeks', () => {
    const t = registered();
    const p = postNow(t, 'cmm_a1_wolf_cull');
    cmd(t, 'guild.accept', { postingId: p.id });
    cmd(t, 'guild.abandon', { postingId: p.id });
    for (let w = 1; w < CFG.keepWeeks; w++) nextWeek(t);
    expect(gs(t.g).postings[p.id]).toBeDefined();
    expect(t.g.world.slices.quests.instances?.[p.id]).toBeDefined();
    nextWeek(t);
    expect(gs(t.g).postings[p.id]).toBeUndefined();
    expect(t.g.world.slices.quests.instances?.[p.id]).toBeUndefined();
    expect(t.g.world.slices.quests.quests[p.id]).toBeUndefined();
    // the quest's flag stays as history
    expect(flags(t.g)[`quest.${p.id}`]).toBe('failed');
  });

  it('records merit points from a subjugation with merit', () => {
    const t = registered();
    (t.g.world.slices as { party?: unknown }).party = { members: { ron: { id: 'ron' } } };
    const p = postNow(t, 'cmm_a1_waste_bones');
    cmd(t, 'guild.accept', { postingId: p.id });
    kill(t, 'wandering_bones', 'ash_waste', p.count ?? 6);
    cmd(t, 'guild.turn_in', { postingId: p.id });
    expect(gs(t.g).member?.merit).toBe(3);
    expect(flags(t.g)['guild.merit']).toBe(3);
    expect(gs(t.g).member?.done.d).toBe(1);
  });
});

describe('the content', () => {
  it('validates, and the director is offered the director events as menu items', () => {
    expect(validateContent(BASE).filter((m) => /commission|event ev_|board|guild/.test(m))).toEqual(
      [],
    );
    expect(validateGuild(BASE)).toEqual([]);
    const items = directorItems(BASE.dynamicEvents);
    expect(items.map((i) => i.id).sort()).toEqual(['ev_a1_market_day', 'ev_a1_moira_coincidence']);
    for (const i of items) expect(BASE.directorMenu.some((d) => d.id === i.id)).toBe(true);
    expect(items.find((i) => i.id === 'ev_a1_market_day')).toMatchObject({
      kind: 'respite',
      requires: 'act == 1',
      maps: ['borderstone'],
    });
  });

  it('rejects broken templates: unknown refs, wrong goals, writes outside the white list', () => {
    const bad = (patch: Partial<CommissionDef>): string[] => {
      const t = { ...tpl('cmm_a1_wolf_cull'), ...patch } as CommissionDef;
      const content = { ...BASE, commissions: [t] } as ContentMap;
      return validateGuild(content);
    };
    expect(bad({ id: 'x_wolves' }).join()).toMatch(/must start with cmm_/);
    expect(
      bad({ goal: { type: 'kill', targets: ['no_such_monster'], count: [1, 2] } }).join(),
    ).toMatch(/unknown monster/);
    expect(bad({ level: 9 }).join()).toMatch(/outside grey_wolf levels/);
    expect(bad({ goal: { type: 'talk', to: ['oola'] } }).join()).toMatch(/cannot have a talk goal/);
    expect(bad({ writes: [{ type: 'xp', amount: 100 }] }).join()).toMatch(/not a commission write/);
    expect(bad({ boards: ['board_borderstone_notice'], rank: 'c' }).join()).toMatch(
      /does not post rank c/,
    );
    expect(bad({ firstIn: 'q_nope' }).join()).toMatch(/unknown firstIn/);
    expect(bad({ acts: [3] }).join()).toMatch(/no board of it stands in act 3/);
  });

  it('rejects events that would spam, arrive unannounced or pay urgent without an end', () => {
    const bad = (e: Partial<DynamicEventDef>): string[] => {
      const row = {
        id: 'ev_a1_t',
        category: 'settlement',
        source: 'npc',
        title: 't',
        acts: [1],
        maps: ['borderstone'],
        severity: 'minor',
        when: 'act_week >= 1',
        once: true,
        ...e,
      } as DynamicEventDef;
      return validateGuild({ ...BASE, dynamicEvents: [row] } as ContentMap);
    };
    expect(bad({})).toEqual([]);
    expect(bad({ once: undefined }).join()).toMatch(/repeats every day/);
    expect(bad({ once: undefined, cooldownDays: 7 })).toEqual([]);
    expect(bad({ category: 'tide' }).join()).toMatch(/announces itself at least 3 days/);
    expect(bad({ category: 'disaster', omen: { days: 2 } }).join()).toMatch(/at least 3 days/);
    expect(bad({ category: 'search' }).join()).toMatch(/needs a precursor/);
    expect(bad({ effects: [{ type: 'xp', amount: 10 }] }).join()).toMatch(/not an event write/);
    expect(bad({ hooks: { urgent: ['cmm_a1_wolf_cull'] } }).join()).toMatch(/it needs days/);
    expect(bad({ hooks: { post: ['cmm_a1_night_watch'] }, maps: ['ash_waste'] }).join()).toMatch(
      /no board open on its maps/,
    );
    expect(
      bad({ source: 'goddess', category: 'tide', omen: { days: 3 }, acts: [2] }).join(),
    ).toMatch(/no tide before act 3/);
  });
});

describe('the quests system instance seam', () => {
  it('keeps run-time quests in the slice, never reusing an id, dropping only closed ones', () => {
    const t = guildGame();
    const ctx = { content: t.g.content, world: t.g.world };
    const def = instanceQuest(
      tpl('cmm_a1_wolf_cull'),
      {
        id: 'gc_e_900',
        display: 'GC-E-900',
        template: 'cmm_a1_wolf_cull',
        board: GUILD_BOARD,
        rank: 'e',
        giver: 'gorn',
        place: { mapId: 'forest_edge' },
        target: 'grey_wolf',
        count: 2,
        days: 5,
        reward: 240,
        cut: 36,
        urgent: false,
        emergency: false,
        postedDay: 0,
        untilDay: 13,
        state: 'posted',
      },
      { act: 'act1', deadline: 99 },
    );
    expect(addQuestInstance(ctx, { ...def, id: 'q_a1_m04_hunt' })).toBe(false);
    expect(addQuestInstance(ctx, def)).toBe(true);
    expect(addQuestInstance(ctx, def)).toBe(false);
    expect(questDefOf(ctx, 'gc_e_900')?.kind).toBe('commission');
    expect(allQuestDefs(ctx).at(-1)?.id).toBe('gc_e_900');
    expect(questTitle(def)).toEqual({ key: 'c.commissions.cmm_a1_wolf_cull.title' });
    t.g.world.slices.quests.order.push('gc_e_900');
    t.g.world.slices.quests.quests.gc_e_900 = {
      id: 'gc_e_900',
      status: 'active',
      stage: 0,
      counts: [0],
      met: [false],
      stageStartTick: 0,
      startedTick: 0,
      choices: {},
    };
    expect(dropQuestInstance(ctx, 'gc_e_900')).toBe(false);
    (t.g.world.slices.quests.quests.gc_e_900 as { status: string }).status = 'done';
    expect(dropQuestInstance(ctx, 'gc_e_900')).toBe(true);
    expect(t.g.world.slices.quests.order).not.toContain('gc_e_900');
    expect(questDefOf(ctx, 'gc_e_900')).toBeUndefined();
  });
});
