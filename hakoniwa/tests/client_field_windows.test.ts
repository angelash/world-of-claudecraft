// The field windows' pure cores (PK-M1-23; ux_and_onboarding.md 5.2, 6.2.7, 6.3.3 to 6.3.5,
// 6.3.7, 6.3.10): the commission board keeps the client's claims apart from the rule row and
// gates taking by rank and the held cap; the craft model groups recipes by family, flags short
// materials and bands the skill-up; the gather model halves the yield a tier short and words
// the refusal; the dungeon bar and list switch from the mortal words to the canon ones on
// term.dian_known (D-030) and offer a disposition only once; the beasts model hides a beast's
// place outside the field and never names a retainer a messenger; the party model groups the
// roster, shows stances only for those walking along, and gates the one-way ironman switch.

import { describe, expect, it } from 'vitest';
import { dungeonBarModel } from '../src/client/hud/dungeon_bar_model';
import type { CraftRecipeData, GatherNodeData } from '../src/client/view/adapters_field';
import { beastsModel, petStateText } from '../src/client/windows/field/beasts_model';
import { boardModel } from '../src/client/windows/field/board_model';
import {
  clampRuns,
  craftModel,
  gatherModel,
  skillUpBand,
} from '../src/client/windows/field/craft_model';
import { DISPOSITIONS, dungeonModel } from '../src/client/windows/field/dungeon_model';
import {
  companionName,
  partyWindowModel,
  rosterGroup,
} from '../src/client/windows/field/party_window_model';
import { TICKS_PER_GAME_DAY } from '../src/core/time';
import { SOURCE_TABLE } from '../src/shared_ui/i18n';
import type { CraftingView } from '../src/systems/crafting/view';
import type { DungeonFieldView, DungeonListEntry } from '../src/systems/dungeons/view';
import type { BoardView, PostingView } from '../src/systems/guild/view';
import type { BeastView, CompanionView } from '../src/systems/party/view';

const posting = (over: Partial<PostingView> = {}): PostingView => ({
  id: 'p1',
  display: 'GC-F-001',
  templateId: 'cmm_x',
  title: { key: 'ui.win.board.postings' },
  rank: 'f',
  giver: null,
  place: { mapId: 'borderstone' },
  reward: 1200,
  cut: 180,
  days: 5,
  urgent: false,
  emergency: false,
  claims: [{ key: 'ui.win.board.full' }],
  needs: 'f',
  state: 'posted',
  ...over,
});

const board = (over: Partial<BoardView> = {}): BoardView => ({
  boardId: 'b1',
  name: { key: 'ui.win.board.postings' },
  postings: [posting()],
  playerRank: 'f',
  practical: false,
  rankProgress: { next: 'e', needs: [{ kind: 'level', need: 5, have: 3, met: false }] },
  accepted: [],
  maxAccepted: 5,
  ...over,
});

const boardOf = (v: BoardView, ready: (id: string) => boolean = () => false) =>
  boardModel({ view: v, giverName: (id) => id, daysLeft: () => 3, ready });

describe('ui_win_board (6.3.7)', () => {
  it('puts pay and the cut on two rows and marks every claim as the client claim', () => {
    const m = boardOf(board());
    const p = m.postings[0];
    expect(p?.reward).toContain('12 银');
    expect(p?.cut).not.toBe('');
    expect(p?.cut).not.toBe(p?.reward);
    expect(p?.claims).toHaveLength(1);
    expect(p?.claims[0]?.startsWith('委托人称')).toBe(true);
    expect(p?.giver).toContain('匿名');
    expect(p?.canAccept).toBe(true);
  });

  it('drops the cut row on a board that takes none', () => {
    expect(boardOf(board({ postings: [posting({ cut: 0 })] })).postings[0]?.cut).toBe('');
  });

  it('refuses a posting above the rank a lone taker may take, and an unregistered player', () => {
    const low = boardOf(board({ postings: [posting({ needs: 'd' })] })).postings[0];
    expect(low?.canAccept).toBe(false);
    expect(low?.reason).toContain('D');
    const none = boardOf(board({ playerRank: null })).postings[0];
    expect(none?.canAccept).toBe(false);
    expect(none?.reason).not.toBe('');
  });

  it('refuses once the held list is full, and counts held against the cap', () => {
    const full = Array.from({ length: 5 }, (_, i) => posting({ id: `a${i}`, state: 'accepted' }));
    const m = boardOf(board({ accepted: full }));
    expect(m.postings[0]?.canAccept).toBe(false);
    expect(m.heldCount).toContain('5');
    expect(m.accepted.every((a) => !a.canAccept)).toBe(true);
  });

  it('shows days to finish before taking and days left once taken', () => {
    const before = boardOf(board()).postings[0];
    const after = boardOf(board({ postings: [posting({ deadline: 40 })] })).postings[0];
    expect(before?.deadline).toContain('5');
    expect(after?.deadline).toContain('3');
    expect(after?.deadline).not.toBe(before?.deadline);
  });

  it('enables turn-in only once the held commission is done', () => {
    const held = [
      posting({ id: 'h1', state: 'accepted' }),
      posting({ id: 'h2', state: 'accepted' }),
    ];
    const m = boardOf(board({ accepted: held }), (id) => id === 'h2');
    expect(m.accepted.map((a) => a.canTurnIn)).toEqual([false, true]);
    expect(m.accepted[0]?.reason).toBe('委托还没完成');
    expect(m.accepted[1]?.reason).toBe('');
    expect(m.postings.every((p) => !p.canTurnIn)).toBe(true);
  });

  it('lists the promotion needs and the practical mark', () => {
    const m = boardOf(board({ practical: true }));
    expect(m.progress).toEqual([expect.objectContaining({ met: false })]);
    expect(m.rank).toContain('实');
    expect(boardOf(board({ postings: [] })).empty).toBe(true);
  });
});

const recipe = (over: Partial<CraftRecipeData> = {}): CraftRecipeData => ({
  row: { id: 'rcp_a', ok: true },
  def: {
    id: 'rcp_a',
    name: 'A',
    family: 'rcp_blade',
    profession: 'weaponcrafting',
    tier: 1,
    station: 'forge',
    inputs: [
      { itemId: 'iron', count: 2 },
      { itemId: 'coal', count: 1 },
    ],
    output: { itemId: 'blade' },
  },
  have: { iron: 3, coal: 0 },
  masterwork: 0.04,
  atStation: true,
  stationTier: 1,
  skillGain: 1,
  ...over,
});

const craftOf = (
  recipes: CraftRecipeData[],
  skills: CraftingView['skills'] = [{ profession: 'mining', skill: 30, cap: 50 }],
) =>
  craftModel({
    livelihoods: { skills, drunk: 0 },
    recipes,
    maxRuns: 10,
    itemName: (id) => id,
    recipeName: (_id, f) => f,
  });

describe('ui_win_craft (6.3.3)', () => {
  it('groups by family and flags each short material', () => {
    const m = craftOf([
      recipe(),
      recipe({ def: { ...recipe().def, id: 'rcp_b', family: undefined } }),
    ]);
    expect(m.families.map((f) => f.family)).toEqual(['刀剑', '其他']);
    const mats = m.families[0]?.recipes[0]?.materials;
    expect(mats?.find((x) => x.itemId === 'iron')?.short).toBe(false);
    expect(mats?.find((x) => x.itemId === 'coal')?.short).toBe(true);
    expect(m.families[0]?.recipes[0]?.masterwork).toContain('4%');
  });

  it('bands the skill-up by the four-state gain, with steps for the shape', () => {
    expect([1, 0.5, 0.25, 0].map(skillUpBand)).toEqual(['always', 'maybe', 'rarely', 'never']);
    const r = craftOf([recipe({ skillGain: 0.25 })]).families[0]?.recipes[0];
    expect(r?.skillUp).toEqual({ band: 'rarely', label: '很少提升', steps: 1 });
  });

  it('names livelihoods by the catalog (掘脉, 锻兵) and hides the chance away from a station', () => {
    const m = craftOf(
      [recipe({ atStation: false })],
      [
        { profession: 'mining', skill: 30, cap: 50 },
        { profession: 'weaponcrafting', skill: 5, cap: 25 },
      ],
    );
    expect(m.livelihoods.map((l) => l.name)).toEqual(['掘脉', '锻兵']);
    expect(m.families[0]?.recipes[0]?.masterwork).toBe('');
  });

  it('words the system refusal and keeps refine without a masterwork line', () => {
    const r = craftOf([recipe({ row: { id: 'rcp_a', ok: false, code: 'no_station' } })]).families[0]
      ?.recipes[0];
    expect(r?.canCraft).toBe(false);
    expect(r?.reason).toBe('不在合适的工站旁');
    const refine = craftOf([recipe({ def: { ...recipe().def, op: 'refine' } })]).families[0]
      ?.recipes[0];
    expect(refine?.masterwork).toBe('');
  });

  it('is empty only with nothing learned and no recipe, and clamps the batch to 1 to 10', () => {
    expect(craftOf([], []).empty).toBe(true);
    expect(craftOf([recipe()], []).empty).toBe(false);
    expect([0, 3, 99, Number.NaN].map((n) => clampRuns(n, 10))).toEqual([1, 3, 10, 1]);
  });

  it('has a refusal text for every craft and gather code', () => {
    for (const c of [
      'no_rules',
      'no_recipe',
      'no_body',
      'unknown',
      'skill',
      'no_station',
      'busy',
      'inputs',
      'money',
      'target',
      'max',
      'slot',
    ])
      expect(SOURCE_TABLE[`ui.win.craft.refuse.${c}`], c).toBeTruthy();
    for (const c of [
      'no_rules',
      'no_node',
      'no_body',
      'not_here',
      'not_now',
      'spent',
      'not_ready',
      'skill',
      'tool',
    ])
      expect(SOURCE_TABLE[`ui.win.gather.refuse.${c}`], c).toBeTruthy();
  });
});

const node = (over: Partial<GatherNodeData> = {}): GatherNodeData => ({
  row: { id: 'node_a', ok: true, readyAt: 0 },
  def: {
    id: 'node_a',
    name: 'N',
    kind: 'herb',
    tier: 2,
    yields: [{ itemId: 'herb', count: [2, 4] }],
    places: [],
  },
  taint: 0,
  toolTier: 2,
  skillTier: 2,
  full: true,
  readyDays: null,
  ...over,
});

const gatherOf = (nodes: GatherNodeData[], dianKnown = false) =>
  gatherModel({ nodes, dianKnown, itemName: (id) => id, nodeName: (_id, f) => f });

describe('ui_win_gather (6.3.4)', () => {
  it('halves the yield when a tier falls one short', () => {
    expect(gatherOf([node()])[0]?.yieldText).toContain('2 到 4');
    expect(gatherOf([node({ full: false })])[0]?.yieldText).toContain('1 到 2');
  });

  it('warns from mid taint up, and words the refresh and refusals', () => {
    expect(gatherOf([node({ taint: 1 })])[0]?.taintWarn).toBe(false);
    expect(gatherOf([node({ taint: 2 })])[0]?.taintWarn).toBe(true);
    expect(gatherOf([node({ readyDays: 3 })])[0]?.respawn).toContain('3');
    expect(gatherOf([node({ readyDays: -1 })])[0]?.respawn).toBe('已采空');
    const no = gatherOf([node({ row: { id: 'node_a', ok: false, code: 'tool', readyAt: 0 } })])[0];
    expect(no?.canGather).toBe(false);
    expect(no?.reason).toBe('工具不够好');
    expect(gatherOf([node({ toolTier: 0 })])[0]?.tool).toBe('没有工具');
  });

  it('reads spent for a node used up by its gathers even though its clock says ready', () => {
    const used = node({ row: { id: 'node_a', ok: false, code: 'spent', readyAt: 0 } });
    expect(gatherOf([used])[0]?.respawn).toBe('已采空');
    expect(gatherOf([node()])[0]?.respawn).toBe('可以采集');
  });

  it('says the mortal taint word until term.dian_known, the canon one after (D-030)', () => {
    const before = gatherOf([node({ taint: 2 })])[0];
    const after = gatherOf([node({ taint: 2 })], true)[0];
    expect(before?.taint).toBe('中度灰染');
    expect(before?.taintWarnText).not.toContain('澱');
    expect(after?.taint).toBe('中度澱染');
    expect(after?.taintWarnText).toContain('澱');
  });
});

const field = (over: Partial<DungeonFieldView> = {}): DungeonFieldView => ({
  dungeonId: 'dg_a',
  name: { key: 'ui.win.board.postings' },
  floorId: 'f1',
  floorName: null,
  depth: 1,
  form: 'lair',
  formName: { key: 'sys.dungeons.form.lair' },
  state: 'active',
  stateName: { key: 'sys.dungeons.state.active' },
  cap: 1,
  party: 2,
  floorBossDown: false,
  leftItemDays: 7,
  ...over,
});

describe('ui_hud_dungeon (5.2)', () => {
  it('uses the mortal words before term.dian_known and the canon ones after (D-030)', () => {
    const before = dungeonBarModel(field(), false);
    const after = dungeonBarModel(field(), true);
    expect(before?.form).toBe('灰窝');
    expect(before?.state).toBe('躁动');
    expect(after?.form).toBe('澱巢');
    expect(after?.state).toBe('活性期');
    expect(before?.form).not.toContain('澱');
  });

  it('flags a party over the field cap, the boss and the left-item days', () => {
    const m = dungeonBarModel(field(), true);
    expect(m?.overCap).toBe(true);
    expect(m?.party).toContain('2');
    expect(m?.boss).toBe('本层首领还在');
    expect(m?.leftItems).toBe('');
    const withLeft = dungeonBarModel(field(), true, 2);
    expect(withLeft?.leftItems).toContain('2');
    expect(withLeft?.leftItems).toContain('7');
    expect(dungeonBarModel(field({ floorBossDown: null, party: 1 }), true)).toMatchObject({
      boss: '',
      overCap: false,
    });
  });

  it('hides outside every dungeon', () => {
    expect(dungeonBarModel(null, true)).toBeNull();
  });

  it('has a mortal word for every form and state', () => {
    for (const f of ['lair', 'shallow', 'dungeon', 'great'])
      expect(SOURCE_TABLE[`ui.hud.dungeon.form_mortal.${f}`], f).toBeTruthy();
    for (const s of ['normal', 'active', 'overflow', 'collapsing', 'purifying'])
      expect(SOURCE_TABLE[`ui.hud.dungeon.state_mortal.${s}`], s).toBeTruthy();
  });
});

const entry = (over: Partial<DungeonListEntry> = {}): DungeonListEntry => ({
  id: 'dg_a',
  name: { key: 'ui.win.board.postings' },
  mapId: 'forest_edge',
  form: 'lair',
  formName: { key: 'sys.dungeons.form.lair' },
  state: 'normal',
  stateName: { key: 'sys.dungeons.state.normal' },
  overflowDays: null,
  disposition: 'untouched',
  collapsed: false,
  purified: false,
  owner: null,
  partyLimit: 1,
  firstClear: false,
  bosses: [{ id: 'boss_a', floorId: 'f1', defeated: true }],
  lostItems: [{ id: 'l1', swallowTick: 3 * TICKS_PER_GAME_DAY }],
  affixes: [],
  ...over,
});

describe('ui_win_dungeon (6.3.10)', () => {
  it('names only the bosses already down and counts the rest as unexplored', () => {
    const list = [
      entry({
        bosses: [
          { id: 'boss_a', floorId: 'f1', defeated: true },
          { id: 'boss_b', floorId: 'f2', defeated: false },
          { id: 'boss_c', floorId: 'f3', defeated: false },
        ],
      }),
    ];
    const m = dungeonModel({ list, dianKnown: true, tick: 0, bossName: (id) => id });
    expect(m.rows[0]?.bosses.map((b) => b.label)).toEqual([expect.stringContaining('boss_a')]);
    expect(m.rows[0]?.bosses.map((b) => b.label).join('')).not.toContain('boss_b');
    expect(m.rows[0]?.unexplored).toContain('2');
  });

  it('puts boss and dungeon names through the mortal rule before the word is known', () => {
    const m = dungeonModel({
      list: [entry()],
      dianKnown: false,
      tick: 0,
      bossName: () => '澱巨像',
    });
    expect(m.rows[0]?.bosses[0]?.label).not.toContain('澱');
    expect(m.rows[0]?.bosses[0]?.label).toContain('灰巨像');
    const known = dungeonModel({
      list: [entry()],
      dianKnown: true,
      tick: 0,
      bossName: () => '澱巨像',
    });
    expect(known.rows[0]?.bosses[0]?.label).toContain('澱巨像');
  });

  it('offers the three dispositions with a consequence once, never after', () => {
    const open = dungeonModel({ list: [entry()], dianKnown: false, tick: 0, bossName: (id) => id });
    expect(open.rows[0]?.choices.map((c) => c.choice)).toEqual([...DISPOSITIONS]);
    expect(open.rows[0]?.choices.every((c) => c.confirm.length > 0)).toBe(true);
    expect(open.rows[0]?.form).toBe('灰窝');
    for (const done of [
      { disposition: 'destroy' as const },
      { collapsed: true },
      { purified: true },
    ]) {
      const m = dungeonModel({
        list: [entry(done)],
        dianKnown: true,
        tick: 0,
        bossName: (id) => id,
      });
      expect(m.rows[0]?.choices).toEqual([]);
    }
  });

  it('counts the days to the first swallowed item, and is empty with none known', () => {
    const m = dungeonModel({ list: [entry()], dianKnown: true, tick: 0, bossName: (id) => id });
    expect(m.rows[0]?.lost).toContain('3');
    expect(m.rows[0]?.bosses[0]?.defeated).toBe(true);
    expect(m.rows[0]?.unexplored).toBe('');
    expect(dungeonModel({ list: [], dianKnown: true, tick: 0, bossName: (id) => id }).empty).toBe(
      true,
    );
  });
});

const beast = (over: Partial<BeastView> = {}): BeastView => ({
  id: 'b1',
  species: 'pet_ashgrey_wolf',
  kind: 'half',
  state: 'party',
  guarding: null,
  unit: null,
  ...over,
});

describe('ui_win_beasts (6.3.5)', () => {
  it('shows the keeper the real state of a resting beast or one at the spring', () => {
    expect(petStateText('resting')).toBe('休养');
    expect(petStateText('spring')).toBe('泉畔');
    expect(petStateText('party')).toBe('随队');
    expect(petStateText('resting')).not.toBe('所在不明');
  });

  it('names a retainer a retainer, never a messenger, and lets only a half-bound beast go', () => {
    const m = beastsModel({
      pets: [beast(), beast({ id: 'b2', kind: 'retainer' })],
      mounts: [],
      speciesName: (id) => id,
    });
    expect(m.pets[1]?.kind).toBe('从者');
    expect(m.pets.map((p) => p.kind).join('')).not.toContain('信使');
    expect(m.pets.map((p) => p.canRelease)).toEqual([true, false]);
    expect(m.mountsEmpty).toBe(true);
  });
});

const companion = (over: Partial<CompanionView> = {}): CompanionView => ({
  id: 'ron',
  name: '罗恩',
  title: '',
  classId: 'c',
  className: '剑士',
  role: '',
  personality: [],
  order: 'follow',
  orderName: { key: 'sys.party.order.follow' },
  state: 'party',
  stateName: { key: 'sys.party.state.party' },
  tactic: null,
  bond: 42,
  nextThreshold: 60,
  bondGate: null,
  downed: false,
  restUntil: null,
  unit: null,
  ...over,
});

describe('ui_win_party roster and ironman (6.2.7; PK-M1-15)', () => {
  it('never shows a companion title (Yeyu as messenger is a later reveal), role through a key', () => {
    const yeyu = companion({
      id: 'yeyu',
      name: 'raw-name',
      title: '从者：门之信使，称你为门把手',
      classId: 'no_such_class',
      className: '术士',
      role: 'caster',
    });
    const row = partyWindowModel({ roster: [yeyu], ironman: null, tick: 0 }).groups[0]?.rows[0];
    expect(row?.sub).not.toContain('信使');
    expect(row?.sub).not.toContain('caster');
    expect(row?.sub).toContain('施法');
    expect(companionName(yeyu)).not.toBe('raw-name');
    expect(companionName({ id: 'no_such_one', name: 'fallback' })).toBe('fallback');
  });

  it('groups the roster by where each one is, along first and the dead last', () => {
    expect(
      ['party', 'waiting', 'standby', 'resting', 'spring', 'away', 'cold', 'dead'].map((s) =>
        rosterGroup(s as never),
      ),
    ).toEqual(['along', 'along', 'standby', 'resting', 'resting', 'away', 'away', 'dead']);
    const m = partyWindowModel({
      roster: [
        companion({ id: 'd', state: 'dead', stateName: { key: 'sys.party.state.dead' } }),
        companion(),
      ],
      ironman: null,
      tick: 0,
    });
    expect(m.groups.map((g) => g.group)).toEqual(['along', 'dead']);
  });

  it('shows stances and wait only for those walking along, and the rest days left', () => {
    const resting = companion({
      id: 's',
      state: 'resting',
      stateName: { key: 'sys.party.state.resting' },
      restUntil: 2 * TICKS_PER_GAME_DAY,
    });
    const m = partyWindowModel({ roster: [companion(), resting], ironman: null, tick: 0 });
    const along = m.groups.find((g) => g.group === 'along')?.rows[0];
    const rest = m.groups.find((g) => g.group === 'resting')?.rows[0];
    expect(along?.orders.find((o) => o.active)?.order).toBe('follow');
    expect(along?.wait?.on).toBe(false);
    expect(rest?.orders).toEqual([]);
    expect(rest?.wait).toBeNull();
    expect(rest?.rest).toContain('2');
    expect(m.allOrders).toHaveLength(4);
  });

  it('gates the one-way ironman switch: turnable off only while on', () => {
    expect(partyWindowModel({ roster: [], ironman: null, tick: 0 }).ironman).toBeNull();
    const on = partyWindowModel({ roster: [], ironman: 'on', tick: 0 }).ironman;
    const off = partyWindowModel({ roster: [], ironman: 'off', tick: 0 }).ironman;
    expect(on?.canTurnOff).toBe(true);
    expect(on?.confirm).not.toBe('');
    expect(off?.canTurnOff).toBe(false);
    expect(partyWindowModel({ roster: [], ironman: 'on', tick: 0 }).empty).toBe(true);
  });
});
