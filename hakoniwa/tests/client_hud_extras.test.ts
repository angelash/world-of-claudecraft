// PK-M1-23 HUD extras: the coin badge (ui_hud_coin) and the offering popup (ui_pop_offer)
// models, the tide-night panel model, the gauges' sickness stage and the mortal aura names
// (D-030), and the inventory's instance notes (durability, signature, lapsed attributes).

import { describe, expect, it } from 'vitest';
import { createQuestDetailAdapter } from '../src/client/adapters/corridor';
import { formatSystemEvent } from '../src/client/adapters/log';
import {
  COIN_SHOW_MS,
  coinBadgeModel,
  coinCommand,
  coinUsedByEvent,
} from '../src/client/hud/coin_badge_model';
import { auraDisplayName, gaugesModel, sedStageOf } from '../src/client/hud/gauges_model';
import {
  accountText,
  offerableItems,
  offerPopModel,
  offerReceipt,
  pushReceipt,
  RECEIPTS_KEPT,
} from '../src/client/hud/offer_pop_model';
import { lineState, phaseLabel, tidePanelModel } from '../src/client/hud/tide_panel_model';
import type { TideData } from '../src/client/view/adapters_tide';
import {
  DIAN_KNOWN_FLAG,
  auraDisplayName as mortalAura,
  sedStageOf as mortalStage,
} from '../src/client/view/mortal_terms';
import { companionName, questTitleText } from '../src/client/view/quest_title';
import { buildInventoryView, instanceLine } from '../src/client/windows/inventory_view';
import type { ItemDef } from '../src/systems/inventory';

describe('coin badge (ui_hud_coin)', () => {
  const base = { now: 1000, usedAt: 1000, holdsCoin: true, reduceFlashing: false };

  it('stays hidden until the coin is used, then shows for 1.5 s', () => {
    expect(coinBadgeModel({ ...base, usedAt: null })).toBeNull();
    expect(coinBadgeModel(base)?.spin).toBe(true);
    expect(coinBadgeModel({ ...base, now: 1000 + COIN_SHOW_MS - 1 })).not.toBeNull();
    expect(coinBadgeModel({ ...base, now: 1000 + COIN_SHOW_MS })).toBeNull();
  });

  it('never shows without the coin, and holds a still outline with reduce flashing', () => {
    expect(coinBadgeModel({ ...base, holdsCoin: false })).toBeNull();
    const row = coinBadgeModel({ ...base, reduceFlashing: true });
    expect(row?.spin).toBe(false);
    expect(row?.title).toBe('梅尔卡的硬币：打开往来账与供奉');
  });

  it('flips on an accepted goddess.coin result only', () => {
    const ev = (kind: string, ok: boolean) => ({
      kind: 'command.result',
      data: { kind, ok, source: { type: 'player' } },
    });
    expect(coinUsedByEvent(ev('goddess.coin', true))).toBe(true);
    expect(coinUsedByEvent(ev('goddess.coin', false))).toBe(false);
    expect(coinUsedByEvent(ev('goddess.offer', true))).toBe(false);
    expect(coinUsedByEvent({ kind: 'flag.changed', data: {} })).toBe(false);
    expect(coinCommand()).toEqual({ kind: 'goddess.coin', data: {} });
  });
});

describe('offering popup (ui_pop_offer)', () => {
  const input = {
    holdsCoin: true,
    coinItem: 'merca_coin',
    items: [
      { id: 'merca_coin', name: 'coin', count: 1 },
      { id: 'herb', name: 'herb', count: 3 },
      { id: 'gone', name: 'gone', count: 0 },
    ],
    ledger: 0,
    receipts: [],
  };

  it('offers every held item but her own coin', () => {
    const m = offerPopModel(input);
    expect(m.options.map((o) => o.id)).toEqual(['herb']);
    expect(m.canOffer).toBe(true);
    expect(m.blocked).toBe('');
    expect(m.wants.map((w) => w.id)).toEqual(['blessing', 'intel']);
    expect(m.historyEmpty).not.toBe('');
  });

  it('greys the form without the coin or without anything to give', () => {
    const noCoin = offerPopModel({ ...input, holdsCoin: false });
    expect(noCoin.canOffer).toBe(false);
    expect(noCoin.blocked).toBe('手里没有她的硬币，供奉不到她面前。');
    const nothing = offerPopModel({ ...input, items: [{ id: 'merca_coin', name: 'c', count: 1 }] });
    expect(nothing.canOffer).toBe(false);
    expect(nothing.blocked).toBe('身上没有可以供奉的东西。');
  });

  it('writes the account in words, never the ledger points', () => {
    expect(accountText(12)).toBe('她记着欠你一份');
    expect(accountText(-3)).toBe('你还欠着她');
    expect(accountText(0)).toBe('你们两清');
    expect(accountText(null)).toBe('你们两清');
    expect(offerPopModel({ ...input, ledger: 7.5 }).account).not.toMatch(/\d/);
  });

  it('keeps receipts of accepted and refused exchanges, newest first', () => {
    const ok = offerReceipt({
      kind: 'command.result',
      data: { kind: 'goddess.offer', ok: true, reason: { key: 'sys.goddess.info.offering_kept' } },
    });
    const refused = offerReceipt({
      kind: 'command.result',
      data: { kind: 'goddess.offer', ok: false },
    });
    expect(ok?.ok).toBe(true);
    expect(ok?.text).not.toBe('');
    expect(refused).toEqual({ ok: false, text: '她没有收' });
    expect(offerReceipt({ kind: 'command.result', data: { kind: 'goddess.coin', ok: true } })).toBe(
      null,
    );
    let list = pushReceipt([], ok as never);
    list = pushReceipt(list, refused as never);
    expect(list[0]).toEqual(refused);
    for (let i = 0; i < 20; i++) list = pushReceipt(list, refused as never);
    expect(list).toHaveLength(RECEIPTS_KEPT);
  });
});

describe('tide-night panel', () => {
  const data = (over: Partial<TideData['view']> = {}): TideData => ({
    view: { night: 'n1', phase: 'wave1', stage: 1, results: [], ...over },
    mapId: 'town',
    name: '兽潮之夜',
    lines: [
      { id: 'north', name: '北门', face: true },
      { id: 'east', name: '东门', face: true },
      { id: 'slope', name: '东坡', face: false },
    ],
    phases: [
      { id: 'dusk', stage: 0 },
      { id: 'wave1', stage: 1 },
      { id: 'surge', stage: 4 },
      { id: 'dawn', stage: 5 },
    ],
    surgePhase: 'surge',
    gaps: { injury: 20, death: 40 },
    placeName: (id) => `place:${id}`,
    personName: (id) => `person:${id}`,
  });
  const line = (id: string, gap: number, extra: Record<string, unknown> = {}) => ({
    line: id,
    defence: 10,
    pressure: 10 + gap,
    gap,
    deaths: 0,
    player: false,
    damaged: [],
    ...extra,
  });
  const input = { onMap: true, dianKnown: false, dismissed: null };

  it('bands a line by the settlement floors, never by numbers', () => {
    const gaps = { injury: 20, death: 40 };
    expect(lineState(undefined, gaps)).toBe('waiting');
    expect(lineState(line('a', 0) as never, gaps)).toBe('held');
    expect(lineState(line('a', 19) as never, gaps)).toBe('strained');
    expect(lineState(line('a', 20) as never, gaps)).toBe('broken');
    expect(lineState(line('a', 40) as never, gaps)).toBe('fallen');
    expect(lineState(line('a', 80, { struck: true }) as never, gaps)).toBe('held');
  });

  it('shows only on the night map, faces before a front is held', () => {
    expect(tidePanelModel({ ...input, data: null })).toBeNull();
    expect(tidePanelModel({ ...input, data: data(), onMap: false })).toBeNull();
    const row = tidePanelModel({ ...input, data: data() });
    expect(row?.lines.map((l) => l.id)).toEqual(['north', 'east']);
    expect(row?.lines.every((l) => l.state === 'waiting')).toBe(true);
    const held = tidePanelModel({
      ...input,
      data: data({ results: [{ phase: 'wave1', lines: [line('slope', 5)] }] }),
    });
    expect(held?.lines.map((l) => l.id)).toEqual(['north', 'east', 'slope']);
    expect(JSON.stringify(held)).not.toMatch(/"(defence|pressure|gap)"/);
  });

  it('names the surge face only once the surge phase is settled', () => {
    const before = tidePanelModel({ ...input, data: data({ phase: 'surge', weakest: 'east' }) });
    expect(before?.lines.some((l) => l.weakest)).toBe(false);
    const after = tidePanelModel({
      ...input,
      data: data({
        phase: 'dawn',
        weakest: 'east',
        results: [{ phase: 'surge', lines: [line('east', 50, { damaged: ['mill'] })] }],
      }),
    });
    const east = after?.lines.find((l) => l.id === 'east');
    expect(east?.weakest).toBe(true);
    expect(east?.state).toBe('fallen');
    expect(east?.damaged).toEqual(['place:mill']);
  });

  it('marks the player line and uses the mortal phase word until the word is known', () => {
    const row = tidePanelModel({
      ...input,
      data: data({
        phase: 'surge',
        results: [{ phase: 'wave1', lines: [line('north', 0, { player: true })] }],
      }),
    });
    expect(row?.lines.find((l) => l.id === 'north')?.player).toBe(true);
    expect(row?.phase).toBe('第二波：灰潮');
    expect(phaseLabel('surge', true)).toBe('第二波：澱流');
    expect(phaseLabel('wave1', false)).toBe('第一波：兽群');
  });

  it('shows the dawn summary until the player closes it', () => {
    const summary = {
      civilians: 7,
      named: ['boro'],
      injured: ['dris'],
      buildings: ['mill'],
      survival: 'damaged',
      population: 790,
      prosperity: 45,
      credit: 'x',
      tellers: [],
      losses: [],
      grievances: [],
    };
    const row = tidePanelModel({ ...input, data: data({ phase: 'dawn', summary }) });
    expect(row?.summary).toEqual({
      survival: '边石镇受了创',
      civilians: '镇上死去的平民：7 人',
      named: ['person:boro'],
      injured: ['person:dris'],
      buildings: ['place:mill'],
    });
    expect(JSON.stringify(row)).not.toMatch(/790|45/);
    expect(tidePanelModel({ ...input, data: data({ summary }), dismissed: 'n1' })).toBeNull();
  });
});

describe('gauges: the sickness stage and the mortal names (D-030)', () => {
  const g = (over: Record<string, unknown>) =>
    gaugesModel({ blockage: 0, fatigue: 0, taint: 0, dianKnown: false, ...over });

  it('reads the state from player.sed_stage when present', () => {
    // the taint passed 45, the body only has a spot: the body's stage wins
    expect(g({ taint: 50, stage: 'spot' })[0]?.state).toBe('灰斑');
    expect(g({ taint: 50, stage: 'none' })[0]?.state).toBe('');
    expect(g({ taint: 50, stage: null })[0]?.state).toBe('灰热');
    expect(g({ taint: 80, dianKnown: true, stage: 'crystal' })[0]?.state).toBe('澱化');
  });

  it('keeps the bar up while a sickness outlasts its taint', () => {
    expect(g({ taint: 0, stage: 'fever' })).toHaveLength(1);
    expect(g({ taint: 0, stage: 'none' })).toHaveLength(0);
  });

  it('accepts only the registered stage values', () => {
    expect(sedStageOf('fever')).toBe('fever');
    expect(sedStageOf('burning')).toBeNull();
    expect(sedStageOf(2)).toBeNull();
  });

  it('gives the sickness auras their mortal names before the word is known', () => {
    const stages = [
      { id: 'spot', aura: 'aur_st_sed_spot' },
      { id: 'fever', aura: 'aur_st_sed_fever' },
      { id: 'crystal', aura: 'aur_st_sed_crystal' },
    ];
    expect(auraDisplayName('aur_st_sed_fever', '澱热', stages, false)).toBe('灰热');
    expect(auraDisplayName('aur_st_sed_fever', '澱热', stages, true)).toBe('澱热');
    expect(auraDisplayName('aur_other', '流血', stages, false)).toBe('流血');
    expect(auraDisplayName('aur_st_sed_spot', '澱斑', undefined, false)).toBe('澱斑');
  });
});

describe('inventory instance notes (6.2.2)', () => {
  const sword: ItemDef = {
    id: 'sword',
    name: '铁剑',
    kind: 'weapon',
    quality: 2,
    value: 100,
    slot: 'main_hand',
  } as ItemDef;
  const lookup = (id: string) => (id === 'sword' ? sword : undefined);

  it('writes durability, and at 0 that the attributes have lapsed', () => {
    const ok = instanceLine({ instanceId: 'i1', defId: 'sword', durability: { cur: 30, max: 60 } });
    expect(ok.durability).toBe('耐久 30/60');
    expect(ok.lapsed).toBe(false);
    const broken = instanceLine({
      instanceId: 'i2',
      defId: 'sword',
      durability: { cur: 0, max: 60 },
    });
    expect(broken.lapsed).toBe(true);
    expect(broken.notes).toContain('属性失效');
    expect(instanceLine({ instanceId: 'i3', defId: 'sword' }).durability).toBeNull();
  });

  it('signs the player own work as by one without a record, others by name', () => {
    expect(
      instanceLine({ instanceId: 'a', defId: 'sword', signature: 'unrecorded' }).signature,
    ).toBe('无记载者之作');
    expect(
      instanceLine(
        { instanceId: 'b', defId: 'sword', signature: 'balga' },
        { personName: (id) => (id === 'balga' ? '巴尔加' : id) },
      ).signature,
    ).toBe('巴尔加之作');
  });

  it('names the grain with the mortal word until the word is known', () => {
    const inst = { instanceId: 'c', defId: 'sword', sedTier: 2 as const, purified: true };
    expect(instanceLine(inst).sed).toBe('灰纹中');
    expect(instanceLine(inst, { dianKnown: true }).sed).toBe('澱纹中');
    expect(instanceLine(inst).notes).toContain('已净化');
  });

  it('puts worn pieces in their slot and the rest under the bag row', () => {
    const v = buildInventoryView(
      {
        money: 0,
        items: { sword: 2 },
        equipped: { main_hand: 'sword' },
        worn: { main_hand: 'w1' },
        instances: {
          w1: { instanceId: 'w1', defId: 'sword', durability: { cur: 0, max: 60 } },
          b1: { instanceId: 'b1', defId: 'sword', durability: { cur: 60, max: 60 } },
        },
        stacks: [{ itemId: 'sword', count: 1, purified: true }],
      },
      lookup,
    );
    expect(v.equipped[0]?.instance?.lapsed).toBe(true);
    const row = v.groups[0]?.items[0];
    expect(row?.instances.map((i) => i.instanceId)).toEqual(['b1']);
    expect(row?.parts).toEqual(['已净化 x1']);
  });

  it('leaves a holding without the instance layer as before', () => {
    const v = buildInventoryView({ money: 0, items: { sword: 1 }, equipped: {} }, lookup);
    expect(v.groups[0]?.items[0]?.instances).toEqual([]);
    expect(v.equipped[0]?.instance).toBeUndefined();
  });
});

describe('names in party lines and commission titles (PK-M1-15, PK-M1-47 requests)', () => {
  const instance = {
    id: 'cmm_inst_1',
    title: '讨伐状（原文）',
    textOf: { table: 'commissions', id: 'cmm_a1_bandit_writ' },
    stages: [],
  };
  const view = {
    content: {
      companions: [{ id: 'nera', name: '奈拉' }],
      quests: [{ id: 'q_plain', title: '落门', stages: [] }],
    },
    world: { slices: { quests: { instances: { cmm_inst_1: instance }, quests: {} } } },
    entity: (id: string) => (id === 'e_pet' ? { name: '小狼' } : undefined),
    flag: () => undefined,
    playerId: () => 'player',
  } as never;
  const ev = (kind: string, data: unknown) => ({ kind, data, tick: 0 }) as never;

  it('names a standby join by its companion id, never the raw id', () => {
    expect(
      formatSystemEvent(view, ev('party.joined', { companionId: 'nera', entityId: '' }))?.text,
    ).toBe('奈拉 加入了队伍');
    expect(formatSystemEvent(view, ev('party.left', { companionId: 'nera' }))?.text).toBe(
      '奈拉 离开了队伍',
    );
    // a beast has no companion record: its entity names it, else the id
    expect(companionName(view, 'pet_wolf', 'e_pet')).toBe('小狼');
    expect(companionName(view, 'pet_wolf')).toBe('pet_wolf');
  });

  it('renders an instance title from its template, a content title from its own key', () => {
    expect(questTitleText(view, 'cmm_inst_1')).toBe('讨伐状：南路的匪徒');
    expect(questTitleText(view, 'q_plain')).toBe('落门');
    expect(questTitleText(view, 'gone', '原样')).toBe('原样');
    expect(
      formatSystemEvent(view, ev('quest.started', { questId: 'cmm_inst_1', title: 'raw' }))?.text,
    ).toBe('新任务：讨伐状：南路的匪徒');
    const det = createQuestDetailAdapter().detail(view, 'cmm_inst_1');
    expect(det?.title).toBe('讨伐状：南路的匪徒');
  });
});

describe('offerable items (ui_pop_offer form)', () => {
  const defs: Record<string, Partial<ItemDef>> = {
    herb: { id: 'herb', name: 'herb-raw', kind: 'material' },
    key1: { id: 'key1', name: 'k', kind: 'key' },
    ev1: { id: 'ev1', name: 'e', kind: 'evidence' },
    book: { id: 'book', name: 'b', kind: 'lore' },
    sword: { id: 'sword', name: 's', kind: 'weapon' },
    merca_coin: { id: 'merca_coin', name: 'c', kind: 'trinket' },
  };
  const lookup = (id: string) => defs[id] as ItemDef | undefined;

  it('keeps out her coin, keys, evidence, books, unknown items and the worn last piece', () => {
    const list = offerableItems(
      { herb: 2, key1: 1, ev1: 1, book: 1, sword: 1, merca_coin: 1, ghost: 3, none: 0 },
      lookup,
      'merca_coin',
      { main_hand: 'sword' },
    );
    expect(list.map((i) => i.id)).toEqual(['herb']);
    expect(list[0]?.count).toBe(2);
  });

  it('offers a spare of a worn kind', () => {
    const list = offerableItems({ sword: 2 }, lookup, null, { main_hand: 'sword' });
    expect(list).toEqual([{ id: 'sword', name: 's', count: 1 }]);
  });
});

describe('mortal terms module', () => {
  it('holds the flag and the helpers the adapters and the HUD share', () => {
    expect(DIAN_KNOWN_FLAG).toBe('term.dian_known');
    expect(mortalStage('spot')).toBe('spot');
    expect(
      mortalAura('aur_st_sed_spot', '澱斑', [{ id: 'spot', aura: 'aur_st_sed_spot' }], false),
    ).toBe('灰斑');
  });
});
