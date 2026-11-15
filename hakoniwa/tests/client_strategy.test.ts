// Continent window pure core (src/client/windows/strategy_model.ts): fitting province
// coordinates into the canvas, node radius, picking, the provinces a player army may
// march to next, markers and colours, the founding and convene gates, recruit limits,
// and the summary texts. One test builds the real opening continent to check the fit.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  armyDetail,
  armyPathPoints,
  armyStatus,
  battleModeFrom,
  buildNames,
  canConvene,
  canRecruitIn,
  clampRecruit,
  conferenceText,
  continentSignature,
  diplomacyActions,
  diplomacyLines,
  entryAllowed,
  fitTransform,
  formatCount,
  foundingState,
  layoutMap,
  linkStyle,
  logLines,
  moveTargets,
  nationRows,
  neighbours,
  nodeRadius,
  ownerColors,
  PLAYER,
  pendingText,
  pickAt,
  pickProvince,
  pickToken,
  provinceMarks,
  provinceRows,
  recruitLimit,
  shade,
  shortName,
  statusText,
  toCanvas,
  warMark,
  warSummaries,
} from '../src/client/windows/strategy_model';
import { buildContent } from '../src/content';
import { pack as inventoryPack } from '../src/content/packs/inventory';
import { pack as strategyPack } from '../src/content/packs/strategy';
import { pack as warfarePack } from '../src/content/packs/warfare';
import { pack as worldPack } from '../src/content/packs/world';
import { createGame } from '../src/game/create';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import {
  type ContinentView,
  continentView,
  type DiplomacyRow,
  type NationView,
  system as strategy,
} from '../src/systems/strategy';
import { system as warfare } from '../src/systems/warfare';
import { system as world } from '../src/systems/world';

type Province = ContinentView['provinces'][number];
type Army = ContinentView['armies'][number];

function prov(id: string, over: Partial<Province> = {}): Province {
  return {
    id,
    name: id,
    region: 'r',
    terrain: 'plain',
    owner: null,
    ownerName: '无主之地',
    color: '#7a7a7a',
    population: 10000,
    garrison: 100,
    dian: 0,
    x: 0,
    y: 0,
    impassable: false,
    siege: null,
    armies: [],
    ...over,
  };
}

function army(id: string, over: Partial<Army> = {}): Army {
  return {
    id,
    owner: PLAYER,
    ownerName: '庭外之国',
    name: id,
    province: 'home',
    soldiers: 900,
    path: [],
    frozen: false,
    ...over,
  };
}

function row(nation: string, over: Partial<DiplomacyRow> = {}): DiplomacyRow {
  return {
    nation,
    name: nation,
    scoreTo: 0,
    scoreFrom: 0,
    band: '中立',
    treaties: [],
    atWar: false,
    truce: false,
    aeTowardUs: 0,
    ...over,
  };
}

/** home (player) linked to wild (unowned), east (lothar), peak (impassable), south (empire). */
function sampleView(over: Partial<ContinentView> = {}): ContinentView {
  return {
    day: 12,
    active: true,
    releaseIndex: 17.4,
    provinces: [
      prov('home', {
        name: '灰烬边境（边石镇与旧哨村）',
        owner: PLAYER,
        ownerName: '庭外之国',
        color: '#d8d0c0',
        x: 10,
        y: 10,
        population: 20000,
        capitalOf: PLAYER,
        armies: ['army1'],
      }),
      prov('wild', { x: 20, y: 10, population: 500 }),
      prov('east', {
        name: '瓦伦堡',
        owner: 'lothar',
        ownerName: '洛萨王国',
        color: '#3b6ea5',
        x: 30,
        y: 10,
        population: 400000,
        garrison: 2000,
        dian: 3,
        siege: { by: 'empire', byName: '格兰提亚帝国', progress: 42 },
      }),
      prov('peak', { x: 10, y: 30, impassable: true }),
      prov('south', {
        owner: 'empire',
        ownerName: '格兰提亚帝国',
        color: '#9c2f2f',
        x: 30,
        y: 30,
        population: 3500000,
        garrison: 10000,
      }),
    ],
    links: [
      { a: 'home', b: 'wild', days: 2, kind: 'road' },
      { a: 'home', b: 'east', days: 1, kind: 'river' },
      { a: 'peak', b: 'home', days: 4, kind: 'pass' },
      { a: 'wild', b: 'south', days: 6, kind: 'trail' },
    ],
    armies: [
      army('army1', { province: 'home', general: '罗恩' }),
      army('army2', { owner: 'lothar', ownerName: '洛萨王国', province: 'east', soldiers: 3000 }),
      army('army3', { province: 'home', path: ['wild', 'south'] }),
    ],
    wars: [{ id: 'war1', attackers: ['empire'], defenders: ['lothar'], score: 10, startDay: 3 }],
    conference: null,
    summit: null,
    pendingBattle: null,
    log: [
      { day: 3, text: '格兰提亚帝国向洛萨王国宣战' },
      { day: 9, text: '瓦伦堡被围' },
    ],
    ...over,
  };
}

describe('strategy window: fitting the continent into the canvas', () => {
  it('scales uniformly by the tighter axis and centres the bounding box', () => {
    const t = fitTransform(
      [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
      500,
      400,
      50,
    );
    // width allows 400/100 = 4, height allows 300/50 = 6: the tighter wins
    expect(t.scale).toBe(4);
    expect(toCanvas(t, 0, 0)).toEqual({ x: 50, y: 100 });
    expect(toCanvas(t, 100, 50)).toEqual({ x: 450, y: 300 });
  });

  it('handles a single point, a flat line and no points', () => {
    const one = fitTransform([{ x: 7, y: 9 }], 200, 100, 10);
    expect(one.scale).toBe(1);
    expect(toCanvas(one, 7, 9)).toEqual({ x: 100, y: 50 });
    const flat = fitTransform(
      [
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ],
      120,
      80,
      10,
    );
    expect(flat.scale).toBe(10);
    expect(toCanvas(flat, 0, 5)).toEqual({ x: 10, y: 40 });
    expect(toCanvas(flat, 10, 5)).toEqual({ x: 110, y: 40 });
    expect(fitTransform([], 100, 100, 10)).toEqual({ scale: 1, ox: 0, oy: 0 });
  });

  it('keeps every node of the real opening continent inside the padded canvas', () => {
    const content = buildContent([inventoryPack, strategyPack, warfarePack, worldPack]);
    const g = createGame({
      seed: 3,
      content,
      systems: [modifiers, world, inventory, warfare, strategy],
    });
    const v = continentView(g.world, content);
    expect(v.provinces.length).toBeGreaterThan(20);
    const layout = layoutMap(v, 540, 500, 'population');
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(30 - 1e-9);
      expect(n.x).toBeLessThanOrEqual(510 + 1e-9);
      expect(n.y).toBeGreaterThanOrEqual(30 - 1e-9);
      expect(n.y).toBeLessThanOrEqual(470 + 1e-9);
    }
    // one axis is filled edge to edge
    const xs = layout.nodes.map((n) => n.x);
    const ys = layout.nodes.map((n) => n.y);
    const fillsX = Math.abs(Math.min(...xs) - 30) < 1e-6 && Math.abs(Math.max(...xs) - 510) < 1e-6;
    const fillsY = Math.abs(Math.min(...ys) - 30) < 1e-6 && Math.abs(Math.max(...ys) - 470) < 1e-6;
    expect(fillsX || fillsY).toBe(true);
    // every link joins two laid-out nodes
    for (const l of v.links) {
      expect(layout.byId.has(l.a)).toBe(true);
      expect(layout.byId.has(l.b)).toBe(true);
    }
  });
});

describe('strategy window: nodes, tokens and picking', () => {
  it('sizes nodes by population or garrison within 5 to 18 px', () => {
    expect(nodeRadius({ population: 0, garrison: 0 }, 'population')).toBe(5);
    expect(nodeRadius({ population: 3_500_000, garrison: 0 }, 'population')).toBeCloseTo(17.5, 1);
    expect(nodeRadius({ population: 400_000, garrison: 0 }, 'population')).toBeCloseTo(9.2, 1);
    expect(nodeRadius({ population: 1e9, garrison: 0 }, 'population')).toBe(18);
    expect(nodeRadius({ population: 0, garrison: 3600 }, 'garrison')).toBe(10);
    expect(nodeRadius({ population: 1e9, garrison: 0 }, 'garrison')).toBe(5);
  });

  it('stacks army tokens beside their province and marks the player and marching ones', () => {
    const layout = layoutMap(sampleView(), 400, 400, 'population');
    const home = layout.byId.get('home');
    if (!home) throw new Error('no home node');
    const [t1, t3] = layout.tokens.filter((t) => t.province === 'home');
    expect(t1?.armyId).toBe('army1');
    expect(t3?.armyId).toBe('army3');
    expect(t1?.x).toBeGreaterThan(home.x);
    expect(t1?.y).toBeLessThan(home.y);
    expect((t3?.x ?? 0) - (t1?.x ?? 0)).toBe(11);
    expect(t1?.player).toBe(true);
    expect(t1?.marching).toBe(false);
    expect(t3?.marching).toBe(true);
    const enemy = layout.tokens.find((t) => t.armyId === 'army2');
    expect(enemy?.player).toBe(false);
  });

  it('picks the nearest node within its radius plus slack, tokens first', () => {
    const layout = layoutMap(sampleView(), 400, 400, 'population');
    const east = layout.byId.get('east');
    const wild = layout.byId.get('wild');
    if (!east || !wild) throw new Error('missing nodes');
    expect(pickProvince(layout, east.x + 1, east.y - 1)).toBe('east');
    expect(pickProvince(layout, wild.x + wild.r + 3, wild.y)).toBe('wild');
    expect(pickProvince(layout, wild.x + wild.r + 6, wild.y)).toBeNull();
    expect(pickProvince(layout, 1, 399)).toBeNull();
    const tok = layout.tokens.find((t) => t.armyId === 'army2');
    if (!tok) throw new Error('no token');
    expect(pickToken(layout, tok.x, tok.y)).toBe('army2');
    expect(pickAt(layout, tok.x, tok.y)).toEqual({ kind: 'army', id: 'army2' });
    expect(pickAt(layout, east.x, east.y)).toEqual({ kind: 'province', id: 'east' });
    expect(pickAt(layout, 1, 399)).toBeNull();
  });

  it('draws a march from the army through its remaining path', () => {
    const v = sampleView();
    const layout = layoutMap(v, 400, 400, 'population');
    const marching = v.armies.find((a) => a.id === 'army3') as Army;
    const pts = armyPathPoints(layout, marching);
    expect(pts.map((p) => [p.x, p.y])).toEqual(
      ['home', 'wild', 'south'].map((id) => {
        const n = layout.byId.get(id);
        return [n?.x, n?.y];
      }),
    );
    expect(armyPathPoints(layout, v.armies[0] as Army)).toEqual([]);
  });
});

describe('strategy window: where a selected army may go', () => {
  it('lists linked provinces shortest march first', () => {
    const v = sampleView();
    expect(neighbours(v.links, 'home').map((n) => [n.id, n.days])).toEqual([
      ['east', 1],
      ['wild', 2],
      ['peak', 4],
    ]);
    expect(neighbours(v.links, 'south').map((n) => n.id)).toEqual(['wild']);
    expect(neighbours(v.links, 'nowhere')).toEqual([]);
  });

  it('follows the entry rules: own, unowned, allied, at war, or a passage treaty', () => {
    expect(entryAllowed(null, [])).toBe(true);
    expect(entryAllowed(PLAYER, [])).toBe(true);
    expect(entryAllowed('lothar', [row('lothar')])).toBe(false);
    expect(entryAllowed('lothar', [row('lothar', { treaties: ['trade'] })])).toBe(false);
    expect(entryAllowed('lothar', [row('lothar', { treaties: ['passage'] })])).toBe(true);
    expect(entryAllowed('lothar', [row('lothar', { treaties: ['alliance'] })])).toBe(true);
    expect(entryAllowed('lothar', [row('lothar', { atWar: true })])).toBe(true);
    expect(entryAllowed('ghost', [row('lothar', { atWar: true })])).toBe(false);
  });

  it('offers neighbours without impassable land, flags blocked ones, and none for others', () => {
    const v = sampleView();
    expect(moveTargets(v, 'army1', [row('lothar')])).toEqual([
      { id: 'east', days: 1, allowed: false },
      { id: 'wild', days: 2, allowed: true },
    ]);
    expect(moveTargets(v, 'army1', [row('lothar', { treaties: ['passage'] })])[0]).toEqual({
      id: 'east',
      days: 1,
      allowed: true,
    });
    // not ours, frozen, or unknown
    expect(moveTargets(v, 'army2', [])).toEqual([]);
    const frozen = sampleView({ armies: [army('army1', { frozen: true })] });
    expect(moveTargets(frozen, 'army1', [])).toEqual([]);
    expect(moveTargets(v, 'nope', [])).toEqual([]);
  });
});

describe('strategy window: markers and colours', () => {
  it('marks wars, sieges, capitals, dian and impassable land', () => {
    const v = sampleView({
      wars: [
        { id: 'w1', attackers: ['empire'], defenders: ['lothar'], score: 0, startDay: 1 },
        { id: 'w2', attackers: [PLAYER], defenders: ['empire'], score: 0, startDay: 2 },
      ],
    });
    expect(warMark(v.wars, 'lothar')).toBe('war');
    expect(warMark(v.wars, 'empire')).toBe('player');
    expect(warMark(v.wars, 'silva')).toBe('none');
    expect(warMark(v.wars, null)).toBe('none');
    const byId = (id: string) => v.provinces.find((p) => p.id === id) as Province;
    const east = provinceMarks(v, byId('east'));
    expect(east.siege).toEqual({ progress: 42, color: '#9c2f2f', byName: '格兰提亚帝国' });
    expect(east.dian).toBe(3);
    expect(east.war).toBe('war');
    expect(provinceMarks(v, byId('home')).capital).toBe(true);
    expect(provinceMarks(v, byId('peak')).impassable).toBe(true);
    expect(provinceMarks(v, byId('wild'))).toEqual({
      capital: false,
      impassable: false,
      dian: 0,
      siege: null,
      war: 'none',
    });
  });

  it('takes nation colours from held provinces and styles links by days and kind', () => {
    const colors = ownerColors(sampleView());
    expect(colors.get('lothar')).toBe('#3b6ea5');
    expect(colors.get(PLAYER)).toBe('#d8d0c0');
    expect(colors.has('nightrealm')).toBe(false);
    expect(linkStyle({ days: 1, kind: 'road' })).toEqual({
      width: 3.5,
      dash: [],
      color: '#8a7a5c',
    });
    expect(linkStyle({ days: 8 }).width).toBe(1);
    expect(linkStyle({ days: 2, kind: 'sea' }).dash.length).toBeGreaterThan(0);
    expect(linkStyle({ days: 2, kind: 'trail' }).dash.length).toBeGreaterThan(0);
    expect(linkStyle({ days: 1 }).width).toBeGreaterThan(linkStyle({ days: 4 }).width);
    expect(shade('#808080', 0.5)).toBe('#404040');
    expect(shade('#ff0000', 2)).toBe('#ff0000');
    expect(shade('red', 0.5)).toBe('red');
  });
});

describe('strategy window: summary texts', () => {
  it('formats counts and short names', () => {
    expect(formatCount(9999)).toBe('9999');
    expect(formatCount(12345)).toBe('1.2 万');
    expect(formatCount(3_500_000)).toBe('350 万');
    expect(shortName('灰烬边境（边石镇与旧哨村）')).toBe('灰烬边境');
    expect(shortName('瓦伦堡')).toBe('瓦伦堡');
    expect(shortName('（只有注解）')).toBe('（只有注解）');
  });

  it('describes a province with owner, numbers, siege and war state', () => {
    const v = sampleView();
    const east = v.provinces.find((p) => p.id === 'east') as Province;
    const rows = provinceRows(v, east);
    const get = (label: string) => rows.filter((r) => r.label === label).map((r) => r.value);
    expect(get('归属')).toEqual(['洛萨王国']);
    expect(rows[0]?.swatch).toBe('#3b6ea5');
    expect(get('人口')).toEqual(['40 万']);
    expect(get('驻军')).toEqual(['2000']);
    expect(get('围城')).toEqual(['格兰提亚帝国围攻中，进度 42%']);
    expect(get('状态')).toEqual(['处于战争中']);
    const home = v.provinces.find((p) => p.id === 'home') as Province;
    expect(provinceRows(v, home).find((r) => r.label === '状态')?.value).toBe('庭外之国的首都');
  });

  it('describes an army as idle, marching or engaged', () => {
    const v = sampleView();
    const names = buildNames(v);
    expect(armyStatus(v.armies[0] as Army, names)).toBe('驻扎');
    expect(armyStatus(v.armies[2] as Army, names)).toBe('行军中，下一站wild，还有 2 站');
    expect(armyStatus(army('x', { frozen: true, path: ['wild'] }), names)).toBe('会战中');
    expect(armyDetail(v.armies[0] as Army, names)).toBe('驻扎，统帅 罗恩');
    expect(armyDetail(v.armies[2] as Army, names)).toBe('行军中，下一站wild，还有 2 站');
  });

  it('describes the nation with money, warnings and resolved names', () => {
    const n: NationView = {
      id: PLAYER,
      name: '庭外之国',
      ruler: '你',
      capital: 'home',
      alive: true,
      treasury: 512,
      income: 3.14,
      upkeep: 5.06,
      taxRate: 0.1,
      stability: 50,
      legitimacy: 15,
      warWeariness: 60,
      autonomy: 45,
      divineReliance: 0,
      credibility: 70,
      population: 23000,
      provinces: [
        { id: 'home', name: '灰烬边境' },
        { id: 'wild', name: 'wild' },
      ],
      armies: [],
      soldiers: 900,
      power: 4200,
      enemies: ['lothar'],
      recognizedBy: [],
      aeAgainst: [
        { nation: 'empire', value: 12 },
        { nation: 'lothar', value: 45 },
      ],
    };
    const names = buildNames(sampleView(), [row('lothar', { name: '洛萨王国' })], n);
    const rows = nationRows(n, names);
    const get = (label: string) => rows.find((r) => r.label === label);
    expect(get('首都')?.value).toBe('灰烬边境');
    expect(get('国库')?.value).toBe('512 金');
    expect(get('日收入')?.value).toBe('+3.1 金');
    expect(get('日支出')).toEqual({ label: '日支出', value: '-5.1 金', tone: 'warn' });
    expect(get('税率')?.value).toBe('10%');
    expect(get('正统')?.tone).toBe('warn');
    expect(get('战争厌倦')?.tone).toBe('warn');
    expect(get('领土')?.value).toBe('2 个地区');
    expect(get('交战对象')?.value).toBe('洛萨王国');
    expect(get('承认我国')?.value).toBe('无');
    expect(get('侵略扩张值')).toEqual({
      label: '侵略扩张值',
      value: '洛萨王国 45、格兰提亚帝国 12',
      tone: 'warn',
    });
  });

  it('describes a diplomacy row both ways with treaties, war and AE', () => {
    expect(
      diplomacyLines(row('lothar', { scoreTo: 25, scoreFrom: -8, treaties: ['trade', 'passage'] })),
    ).toEqual([{ text: '我方好感 +25，对方好感 -8' }, { text: '条约：通商、通行权' }]);
    const tense = diplomacyLines(row('empire', { atWar: true, truce: true, aeTowardUs: 41 }));
    expect(tense.map((l) => l.text)).toEqual([
      '我方好感 0，对方好感 0',
      '条约：无',
      '交战中',
      '停战期内',
      '对我方的侵略扩张值 41',
    ]);
    expect(tense[4]?.tone).toBe('warn');
  });

  it('lists wars, the conclave state, the pending battle, status and the log', () => {
    const v = sampleView();
    const names = buildNames(v);
    expect(warSummaries(v, names)).toEqual([
      {
        id: 'war1',
        title: '格兰提亚帝国 对 洛萨王国',
        detail: '战争分数 +10，始于第 3 日',
        involvesPlayer: false,
      },
    ]);
    expect(conferenceText(v)).toBe('尚未召集');
    expect(
      conferenceText({
        conference: { stage: 'talks', stageName: '游说', endsDay: 20 },
        summit: null,
      }),
    ).toBe('游说阶段，第 20 日结束');
    expect(
      conferenceText({
        conference: { stage: 'done', stageName: '结束', endsDay: 20 },
        summit: { result: 'divided', name: '分化（龙脊公约）' },
      }),
    ).toBe('会盟结果：分化（龙脊公约）');
    expect(pendingText(v, names)).toBeNull();
    expect(pendingText({ pendingBattle: { scenarioId: 's', province: 'east' } }, names)).toBe(
      '瓦伦堡爆发会战，等待你亲自指挥',
    );
    expect(statusText(v)).toBe('第 12 日，箱庭离手指数 17，进行中的战争 1 场');
    expect(logLines(v)).toEqual(['第 9 日：瓦伦堡被围', '第 3 日：格兰提亚帝国向洛萨王国宣战']);
    expect(logLines(v, 1)).toEqual(['第 9 日：瓦伦堡被围']);
  });
});

describe('strategy window: action gates', () => {
  it('offers diplomacy per the system preconditions', () => {
    const acts = (r: DiplomacyRow) => diplomacyActions(r, true).map((b) => b.action);
    expect(acts(row('a'))).toEqual([
      'alliance',
      'trade',
      'non_aggression',
      'passage',
      'recognize',
      'declare_war',
    ]);
    const withTreaties = diplomacyActions(row('a', { treaties: ['trade', 'recognition'] }), true);
    expect(withTreaties.map((b) => b.action)).toEqual([
      'alliance',
      'non_aggression',
      'passage',
      'break_treaty',
      'break_treaty',
      'declare_war',
    ]);
    expect(
      withTreaties.filter((b) => b.action === 'break_treaty').map((b) => [b.treaty, b.label]),
    ).toEqual([
      ['trade', '废除通商'],
      ['recognition', '废除承认'],
    ]);
    expect(acts(row('a', { atWar: true }))).toEqual(['truce', 'peace']);
    expect(acts(row('a', { truce: true }))).not.toContain('declare_war');
    expect(diplomacyActions(row('a'), false)).toEqual([]);
    const war = diplomacyActions(row('a'), true).find((b) => b.action === 'declare_war');
    expect(war?.tone).toBe('war');
    expect(war?.hint).toBeTruthy();
  });

  it('gates founding on feature.slg, autonomy 40 and not having founded', () => {
    const on = { 'feature.slg': true, territory_autonomy: 45 };
    expect(foundingState(on, null)).toEqual({ show: true, can: true, reason: '' });
    expect(foundingState({ territory_autonomy: 45 }, null)).toEqual({
      show: true,
      can: false,
      reason: '立国之门尚未显现',
    });
    expect(foundingState({ 'feature.slg': true, territory_autonomy: 39.6 }, null)).toEqual({
      show: true,
      can: false,
      reason: '领地自治度 39，立国需要 40',
    });
    expect(foundingState({ 'feature.slg': true }, null).reason).toBe('领地自治度 0，立国需要 40');
    expect(foundingState({ ...on, 'slg.nation_founded': true }, null).can).toBe(false);
    expect(foundingState(on, { alive: true }).show).toBe(false);
    expect(foundingState(on, { alive: false })).toEqual({
      show: true,
      can: false,
      reason: '你的国家已经覆灭',
    });
  });

  it('allows convening once, only while nothing runs and after feature.slg', () => {
    const idle = { conference: null, summit: null };
    expect(canConvene(idle, { 'feature.slg': true })).toBe(true);
    expect(canConvene(idle, {})).toBe(false);
    expect(canConvene(idle, { 'feature.slg': true, 'slg.conclave_done': true })).toBe(false);
    expect(
      canConvene(
        { conference: { stage: 'invite', stageName: '邀请', endsDay: 3 }, summit: null },
        { 'feature.slg': true },
      ),
    ).toBe(false);
    expect(
      canConvene(
        { conference: null, summit: { result: 'broken', name: '破裂' } },
        { 'feature.slg': true },
      ),
    ).toBe(false);
  });

  it('limits recruiting to the player province and 5 percent of its people, at most 5000', () => {
    expect(recruitLimit(20000)).toBe(1000);
    expect(recruitLimit(3_500_000)).toBe(5000);
    expect(recruitLimit(19)).toBe(0);
    expect(recruitLimit(-5)).toBe(0);
    expect(clampRecruit(250, 1000)).toBe(250);
    expect(clampRecruit(99999, 1000)).toBe(1000);
    expect(clampRecruit(0, 1000)).toBe(1);
    expect(clampRecruit(12.9, 1000)).toBe(12);
    expect(clampRecruit(Number.NaN, 1000)).toBe(0);
    expect(clampRecruit(10, 0)).toBe(0);
    expect(canRecruitIn({ owner: PLAYER }, { alive: true })).toBe(true);
    expect(canRecruitIn({ owner: PLAYER }, null)).toBe(false);
    expect(canRecruitIn({ owner: PLAYER }, { alive: false })).toBe(false);
    expect(canRecruitIn({ owner: 'lothar' }, { alive: true })).toBe(false);
  });

  it('reads the battle mode from the raw slice defensively', () => {
    expect(battleModeFrom({ strategy: { battleMode: 'manual' } })).toBe('manual');
    expect(battleModeFrom({ strategy: { battleMode: 'auto' } })).toBe('auto');
    expect(battleModeFrom({ strategy: { battleMode: 'odd' } })).toBeNull();
    expect(battleModeFrom({})).toBeNull();
    expect(battleModeFrom(undefined)).toBeNull();
  });
});

describe('strategy window: change detection and purity', () => {
  it('changes the map signature only when drawn state changes', () => {
    const base = continentSignature(sampleView());
    expect(continentSignature(sampleView({ day: 99, log: [] }))).toBe(base);
    const moved = sampleView();
    (moved.armies[0] as Army).province = 'wild';
    expect(continentSignature(moved)).not.toBe(base);
    const sieged = sampleView();
    const east = sieged.provinces.find((p) => p.id === 'east') as Province;
    east.siege = { by: 'empire', byName: '格兰提亚帝国', progress: 50 };
    expect(continentSignature(sieged)).not.toBe(base);
  });

  it('keeps the model free of DOM access, real time and randomness', () => {
    const src = readFileSync(
      join(__dirname, '..', 'src', 'client', 'windows', 'strategy_model.ts'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(
      /\b(document|window|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|localStorage|requestAnimationFrame|performance\.now)\b/.test(
        src,
      ),
    ).toBe(false);
    expect(/\b(Math\.random|Date\.now|new Date\()/.test(src)).toBe(false);
    expect(/from '[^']*shared_ui\/dom'/.test(src)).toBe(false);
  });
});
