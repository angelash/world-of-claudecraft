// Battlefield window model (src/client/windows/battle_model.ts): the grid-to-canvas
// transform, formation footprints, front-most picking, selection rules, the orders and
// casts a click builds, side-panel text, and one round trip through a real battle where
// the orders the model builds are accepted by the warfare command handlers.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  abilityButtons,
  abilityTargetMode,
  attackOrder,
  CELL_MAX,
  CELL_MIN,
  canvasToGrid,
  castTargetFor,
  drawOrder,
  fitLayout,
  formatClock,
  formationOptions,
  formationOrder,
  formationShape,
  gridToCanvas,
  gridToLocal,
  hitsRegiment,
  holdOrder,
  isOrderable,
  lastReport,
  lerpPos,
  localToGrid,
  MAX_PIPS,
  moraleBar,
  moveOrder,
  objectiveSummaries,
  orderBlock,
  orderLine,
  outcomeText,
  pickUnit,
  regimentColors,
  reportLines,
  resolveClick,
  retreatOrder,
  scaleText,
  stepAlpha,
  type Targeting,
  timeLine,
  unitDetail,
  validSelection,
} from '../src/client/windows/battle_model';
import { buildContent } from '../src/content';
import { pack as inventoryPack } from '../src/content/packs/inventory';
import { pack as warfarePack } from '../src/content/packs/warfare';
import { pack as worldPack } from '../src/content/packs/world';
import type { AnyWorldEvent } from '../src/core/contracts';
import { createGame } from '../src/game/create';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import {
  type BattleView,
  battleView,
  type HeroView,
  type RegimentView,
  system as warfare,
} from '../src/systems/warfare';
import { system as world } from '../src/systems/world';

// ---------------------------------------------------------------------------
// fixtures

function reg(id: string, over: Partial<RegimentView> = {}): RegimentView {
  return {
    id,
    team: 'player',
    controller: 'player',
    typeId: 'militia',
    typeName: '民兵',
    role: 'militia',
    name: `${id}队`,
    count: 12,
    maxCount: 12,
    x: 5,
    y: 5,
    radius: 0.74,
    facing: 0,
    formation: 'line',
    formations: ['line', 'column', 'square'],
    state: 'idle',
    morale: 60,
    fatigue: 0,
    order: null,
    range: 1,
    ranged: false,
    broken: false,
    ...over,
  };
}

function hero(id: string, over: Partial<HeroView> = {}): HeroView {
  return {
    id,
    name: `${id}英雄`,
    team: 'player',
    controller: 'player',
    x: 10,
    y: 5,
    hp: 500,
    maxHp: 800,
    down: false,
    auraRadius: 5,
    abilities: [
      { id: 'charge', name: '冲锋', kind: 'charge', ready: true, readyIn: 0, range: 5 },
      { id: 'inspire', name: '鼓舞', kind: 'inspire', ready: false, readyIn: 12.3, range: 0 },
      { id: 'cleave', name: '横扫', kind: 'aoe', ready: true, readyIn: 0, range: 2 },
      { id: 'strike', name: '斩将', kind: 'strike', ready: true, readyIn: 0, range: 2 },
    ],
    ...over,
  };
}

function battle(over: Partial<BattleView> = {}): BattleView {
  return {
    id: 'battle1',
    scenarioId: 'test_field',
    name: '试炼之战',
    mode: 'manual',
    time: 65,
    timeLimit: 240,
    width: 20,
    height: 10,
    rows: Array.from({ length: 10 }, () => '..........WWWW......'),
    legend: { '.': 'plain', W: 'water' },
    regiments: [],
    heroes: [],
    objectives: [],
    plans: {},
    zones: [],
    retreat: { player: { x: 1, y: 5 }, enemy: { x: 19, y: 5 } },
    log: [],
    outcome: null,
    ...over,
  };
}

const LAYOUT = fitLayout(20, 10, 400, 200);

// ---------------------------------------------------------------------------

describe('battle layout and transform', () => {
  it('fits the largest integer cell into the box and clamps it', () => {
    expect(fitLayout(56, 32, 886, 450)).toEqual({
      cell: 14,
      cols: 56,
      rows: 32,
      width: 784,
      height: 448,
    });
    expect(fitLayout(32, 20, 886, 450)).toMatchObject({ cell: 22, width: 704, height: 440 });
    expect(fitLayout(56, 32, 100, 60).cell).toBe(CELL_MIN);
    expect(fitLayout(4, 3, 2000, 2000).cell).toBe(CELL_MAX);
    expect(LAYOUT.cell).toBe(20);
  });

  it('round-trips grid and canvas coordinates', () => {
    expect(gridToCanvas(LAYOUT, 2.5, 1)).toEqual({ x: 50, y: 20 });
    for (const [x, y] of [
      [0, 0],
      [3.25, 7.5],
      [19.99, 9.99],
      [11.1, 0.3],
    ] as const) {
      const px = gridToCanvas(LAYOUT, x, y);
      const g = canvasToGrid(LAYOUT, px.x, px.y);
      expect(g.x).toBeCloseTo(x, 9);
      expect(g.y).toBeCloseTo(y, 9);
    }
  });

  it('round-trips a unit local frame for any facing', () => {
    for (const facing of [0, Math.PI / 2, Math.PI, -2.1, 0.7]) {
      const p = localToGrid(4, 6, facing, 0.8, -0.35);
      const back = gridToLocal(4, 6, facing, p.x, p.y);
      expect(back.a).toBeCloseTo(0.8, 9);
      expect(back.d).toBeCloseTo(-0.35, 9);
    }
    // facing east: the front (positive depth) points to +x, the across axis is +y
    const east = localToGrid(0, 0, 0, 1, 2);
    expect(east.x).toBeCloseTo(2, 9);
    expect(east.y).toBeCloseTo(1, 9);
  });
});

describe('formation footprints', () => {
  it('lays a line wide and a column deep, capped in pips', () => {
    const line = formationShape('line', 40, 1);
    const column = formationShape('column', 40, 1);
    expect(line.halfW).toBeGreaterThan(line.halfD);
    expect(column.halfD).toBeGreaterThan(column.halfW);
    expect(line.pips).toHaveLength(MAX_PIPS);
    expect(formationShape('wedge', 6, 0.65).pips).toHaveLength(6);
    expect(formationShape('circle', 1, 0.5).pips).toEqual([{ a: 0, d: 0 }]);
    // a wedge puts its single tip pip in front
    const wedge = formationShape('wedge', 6, 0.65);
    const front = Math.max(...wedge.pips.map((p) => p.d));
    expect(wedge.pips.filter((p) => Math.abs(p.d - front) < 1e-9)).toHaveLength(1);
  });

  it('rotates the hit box with the facing', () => {
    const r = reg('a', { x: 5, y: 5, facing: 0 });
    const shape = formationShape(r.formation, r.count, r.radius);
    expect(shape.halfW).toBeGreaterThan(1);
    // facing east: wide along y, thin along x
    expect(hitsRegiment(r, 5, 5 + shape.halfW - 0.05)).toBe(true);
    expect(hitsRegiment(r, 5 + shape.halfW - 0.05, 5)).toBe(false);
    const south = { ...r, facing: Math.PI / 2 };
    expect(hitsRegiment(south, 5 + shape.halfW - 0.05, 5)).toBe(true);
    expect(hitsRegiment(south, 5, 5 + shape.halfW - 0.05)).toBe(false);
  });
});

describe('picking', () => {
  const a = reg('a');
  const b = reg('b');
  const enemy = reg('foe', { team: 'enemy', controller: 'ai', x: 15, y: 5 });
  const gone = reg('gone', { x: 2, y: 2, state: 'gone', count: 0 });
  const view = battle({ regiments: [a, b, enemy, gone], heroes: [hero('h', { x: 5, y: 5 })] });

  it('picks heroes over regiments and later regiments over earlier ones', () => {
    expect(pickUnit(view, 5, 5)?.unit.id).toBe('h');
    const noHero = battle({ regiments: [a, b] });
    expect(pickUnit(noHero, 5, 5)?.unit.id).toBe('b');
    // the selected regiment is drawn last, so it is the front-most one
    expect(pickUnit(noHero, 5, 5, 'a')?.unit.id).toBe('a');
    expect(drawOrder(noHero, 'a').regiments.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('skips fallen heroes, gone regiments and empty ground', () => {
    const downed = battle({ regiments: [a], heroes: [hero('h', { x: 5, y: 5, down: true })] });
    expect(pickUnit(downed, 5, 5)?.unit.id).toBe('a');
    expect(pickUnit(view, 2, 2)).toBeNull();
    expect(pickUnit(view, 9, 9)).toBeNull();
    expect(drawOrder(view, null).regiments.map((r) => r.id)).toEqual(['a', 'b', 'foe']);
  });
});

describe('selection rules', () => {
  it('lets the player order only own units the player controls that still fight', () => {
    const view = battle({
      regiments: [
        reg('mine'),
        reg('ally', { controller: 'ai' }),
        reg('foe', { team: 'enemy', controller: 'ai' }),
        reg('lost', { state: 'gone', count: 0 }),
        reg('runner', { state: 'rout' }),
      ],
      heroes: [hero('me'), hero('fallen', { down: true }), hero('boss', { team: 'enemy' })],
    });
    const ok = (id: string) => isOrderable(pickById(view, id));
    expect(ok('mine')).toBe(true);
    expect(ok('me')).toBe(true);
    expect(ok('runner')).toBe(true);
    expect(ok('ally')).toBe(false);
    expect(ok('foe')).toBe(false);
    expect(ok('lost')).toBe(false);
    expect(ok('fallen')).toBe(false);
    expect(ok('boss')).toBe(false);
    expect(validSelection(view, 'mine')).toBe('mine');
    expect(validSelection(view, 'lost')).toBeNull();
    expect(validSelection(view, 'foe')).toBeNull();
    expect(validSelection(view, 'missing')).toBeNull();
    expect(validSelection(view, null)).toBeNull();
    expect(orderBlock(pickById(view, 'runner'))).toBe('溃退中，不听号令');
    expect(orderBlock(pickById(view, 'mine'))).toBeNull();
  });
});

function pickById(view: BattleView, id: string) {
  const r = view.regiments.find((x) => x.id === id);
  if (r) return { kind: 'regiment' as const, unit: r };
  const h = view.heroes.find((x) => x.id === id);
  return h ? { kind: 'hero' as const, unit: h } : null;
}

describe('clicks build orders', () => {
  const view = battle({
    regiments: [
      reg('mine', { x: 3, y: 3 }),
      reg('ally', { controller: 'ai', x: 3, y: 8 }),
      reg('foe', { team: 'enemy', controller: 'ai', x: 16, y: 5 }),
      reg('runner', { x: 8, y: 8, state: 'rout' }),
    ],
    heroes: [
      hero('me', { x: 7, y: 2 }),
      hero('boss', { team: 'enemy', controller: 'ai', x: 18, y: 8 }),
    ],
  });

  it('left-click selects own units, inspects others and moves the selection', () => {
    expect(resolveClick(view, LAYOUT, null, 'left', 3, 3)).toEqual({ kind: 'select', id: 'mine' });
    expect(resolveClick(view, LAYOUT, 'mine', 'left', 7, 2)).toEqual({ kind: 'select', id: 'me' });
    expect(resolveClick(view, LAYOUT, 'mine', 'left', 16, 5)).toEqual({
      kind: 'inspect',
      id: 'foe',
    });
    expect(resolveClick(view, LAYOUT, 'mine', 'left', 3, 8)).toEqual({
      kind: 'inspect',
      id: 'ally',
    });
    expect(resolveClick(view, LAYOUT, 'mine', 'left', 12.345, 6.789)).toEqual({
      kind: 'order',
      order: { unitId: 'mine', kind: 'move', x: 12.35, y: 6.79 },
    });
    expect(resolveClick(view, LAYOUT, null, 'left', 12, 6)).toEqual({ kind: 'inspect', id: null });
    expect(resolveClick(view, LAYOUT, 'mine', 'left', 25, 6)).toEqual({
      kind: 'inspect',
      id: null,
    });
    // a routing regiment can be selected but does not take orders
    expect(resolveClick(view, LAYOUT, 'runner', 'left', 12, 6)).toEqual({
      kind: 'inspect',
      id: null,
    });
    // a stale selection (not orderable) never issues orders
    expect(resolveClick(view, LAYOUT, 'ally', 'left', 12, 6)).toEqual({
      kind: 'inspect',
      id: null,
    });
  });

  it('right-click attacks enemies and moves elsewhere', () => {
    expect(resolveClick(view, LAYOUT, 'mine', 'right', 16, 5)).toEqual({
      kind: 'order',
      order: { unitId: 'mine', kind: 'attack', targetId: 'foe' },
    });
    expect(resolveClick(view, LAYOUT, 'me', 'right', 18, 8)).toEqual({
      kind: 'order',
      order: { unitId: 'me', kind: 'attack', targetId: 'boss' },
    });
    expect(resolveClick(view, LAYOUT, 'mine', 'right', 11, 4)).toEqual({
      kind: 'order',
      order: { unitId: 'mine', kind: 'move', x: 11, y: 4 },
    });
    // a friendly unit under the cursor is just a place to move to
    expect(resolveClick(view, LAYOUT, 'mine', 'right', 3, 8)).toMatchObject({
      kind: 'order',
      order: { kind: 'move' },
    });
    expect(resolveClick(view, LAYOUT, null, 'right', 16, 5)).toEqual({ kind: 'none' });
    expect(resolveClick(view, LAYOUT, 'runner', 'right', 16, 5)).toEqual({ kind: 'none' });
    expect(resolveClick(view, LAYOUT, 'mine', 'right', -1, 5)).toEqual({ kind: 'none' });
  });

  it('builds hold, retreat, formation and attack specs the war.order command reads', () => {
    expect(holdOrder('mine')).toEqual({ unitId: 'mine', kind: 'hold' });
    expect(retreatOrder('mine')).toEqual({ unitId: 'mine', kind: 'retreat' });
    expect(formationOrder('mine', 'square')).toEqual({
      unitId: 'mine',
      kind: 'formation',
      formation: 'square',
    });
    expect(attackOrder('mine', 'foe')).toEqual({ unitId: 'mine', kind: 'attack', targetId: 'foe' });
    expect(moveOrder('mine', 1.004, 2.006)).toEqual({
      unitId: 'mine',
      kind: 'move',
      x: 1,
      y: 2.01,
    });
    expect(formationOptions(reg('x', { formations: ['line', 'shield_wall'] }))).toEqual([
      { value: 'line', label: '横阵' },
      { value: 'shield_wall', label: '盾墙' },
    ]);
  });

  it('targets hero abilities by kind; right-click cancels', () => {
    expect(abilityTargetMode('inspire')).toBe('self');
    expect(abilityTargetMode('rally')).toBe('self');
    expect(abilityTargetMode('charge')).toBe('unit');
    expect(abilityTargetMode('strike')).toBe('unit');
    expect(abilityTargetMode('aoe')).toBe('area');
    const charge: Targeting = {
      heroId: 'me',
      abilityId: 'charge',
      kind: 'charge',
      name: '冲锋',
      range: 5,
    };
    expect(resolveClick(view, LAYOUT, 'me', 'left', 16, 5, charge)).toEqual({
      kind: 'cast',
      heroId: 'me',
      abilityId: 'charge',
      target: { targetId: 'foe' },
    });
    // a charge needs an enemy regiment: ground, own units and heroes do nothing
    expect(resolveClick(view, LAYOUT, 'me', 'left', 11, 4, charge)).toEqual({ kind: 'none' });
    expect(resolveClick(view, LAYOUT, 'me', 'left', 3, 3, charge)).toEqual({ kind: 'none' });
    expect(resolveClick(view, LAYOUT, 'me', 'left', 18, 8, charge)).toEqual({ kind: 'none' });
    expect(resolveClick(view, LAYOUT, 'me', 'right', 16, 5, charge)).toEqual({ kind: 'cancel' });
    expect(castTargetFor('strike', pickById(view, 'boss'), 18, 8, LAYOUT)).toEqual({
      targetId: 'boss',
    });
    expect(castTargetFor('aoe', null, 12.5, 4.25, LAYOUT)).toEqual({ x: 12.5, y: 4.25 });
    expect(castTargetFor('aoe', pickById(view, 'foe'), 16, 5, LAYOUT)).toEqual({ targetId: 'foe' });
    expect(castTargetFor('aoe', null, 30, 4, LAYOUT)).toBeNull();
    expect(castTargetFor('inspire', null, 0, 0, LAYOUT)).toEqual({});
  });

  it('labels ability buttons with their cooldowns', () => {
    const buttons = abilityButtons(hero('me'));
    expect(buttons.map((b) => [b.id, b.label, b.disabled])).toEqual([
      ['charge', '冲锋', false],
      ['inspire', '鼓舞 13 秒', true],
      ['cleave', '横扫', false],
      ['strike', '斩将', false],
    ]);
    expect(abilityButtons(hero('me', { down: true })).every((b) => b.disabled)).toBe(true);
  });
});

describe('side panel text and colours', () => {
  it('summarises objectives with team, progress and status', () => {
    const view = battle({
      objectives: [
        {
          id: 'hold_market',
          team: 'player',
          kind: 'hold',
          label: '守住鱼市',
          progress: 42.6,
          seconds: 180,
          status: 'active',
          zone: { x: 1, y: 1, w: 4, h: 4 },
        },
        {
          id: 'wipe',
          team: 'enemy',
          kind: 'annihilate',
          label: '全歼守军',
          progress: 0,
          status: 'active',
        },
        {
          id: 'boss',
          team: 'player',
          kind: 'kill_hero',
          label: '击倒敌将',
          progress: 0,
          status: 'done',
        },
        {
          id: 'last',
          team: 'player',
          kind: 'survive',
          label: '坚持到天明',
          progress: 0,
          seconds: 60,
          status: 'failed',
        },
      ],
    });
    const list = objectiveSummaries(view);
    expect(list.map((o) => o.text)).toEqual([
      '我方目标：守住鱼市，42/180 秒，进行中',
      '敌方目标：全歼守军，进行中',
      '我方目标：击倒敌将，达成',
      '我方目标：坚持到天明，0/60 秒，失败',
    ]);
    expect(list[0]?.frac).toBeCloseTo(42.6 / 180, 9);
    expect(list[1]?.frac).toBeNull();
    expect(list[3]?.status).toBe('failed');
  });

  it('formats the clock, time line, outcome and scale', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(125.9)).toBe('2:05');
    expect(timeLine(battle())).toBe('战斗时间 1:05 / 4:00');
    expect(outcomeText(null)).toBe('');
    expect(outcomeText({ victor: 'player', reason: '敌军已无可战之兵' })).toBe(
      '战斗结束：胜利（敌军已无可战之兵）',
    );
    expect(scaleText('legion')).toBe('规模：军团战');
  });

  it('finds the last battle report among recent events', () => {
    const report = {
      battleId: 'battle1',
      scenario: 'test_field',
      victor: 'enemy' as const,
      reason: '我军撤出战场',
      seconds: 30,
      casualties: { player: 3, enemy: 20 },
      regiments: [],
    };
    const events = [
      { kind: 'war.battle_report', tick: 1, seq: 1, data: { ...report, victor: 'player' } },
      { kind: 'flag.changed', tick: 2, seq: 2, data: { key: 'x', value: true } },
      { kind: 'war.battle_report', tick: 3, seq: 3, data: report },
      { kind: 'flag.changed', tick: 4, seq: 4, data: { key: 'y', value: true } },
    ] as unknown as AnyWorldEvent[];
    const last = lastReport(events);
    expect(last?.victor).toBe('enemy');
    expect(last && reportLines(last)).toEqual([
      '上一战：败北（我军撤出战场）',
      '我军损失 3 人，敌军损失 20 人',
    ]);
    expect(lastReport([])).toBeNull();
  });

  it('describes a selected regiment, its order and its general', () => {
    const view = battle({
      regiments: [
        reg('mine', { order: { kind: 'attack', targetId: 'foe' }, general: 'ron', broken: true }),
        reg('foe', { team: 'enemy', controller: 'ai', name: '泥魔群', x: 15 }),
      ],
      heroes: [hero('ron', { name: '罗恩' })],
    });
    const mine = pickById(view, 'mine');
    expect(mine && unitDetail(view, mine)).toEqual([
      'mine队（民兵）',
      '12/12 人，士气 60，疲劳 0',
      '待命，横阵，攻击 泥魔群',
      '阵型已被冲散',
      '将领 罗恩',
    ]);
    const foe = pickById(view, 'foe');
    expect(foe && unitDetail(view, foe).at(-1)).toBe('敌军');
  });

  it('draws order lines to the target, the hold point or the retreat point', () => {
    const view = battle({ regiments: [reg('foe', { team: 'enemy', x: 15, y: 6 })] });
    const u = { id: 'mine', x: 2, y: 2, team: 'player' as const };
    expect(orderLine(view, u, { kind: 'attack', targetId: 'foe' })).toMatchObject({
      kind: 'attack',
      to: { x: 15, y: 6 },
    });
    expect(orderLine(view, u, { kind: 'retreat' })).toMatchObject({ to: { x: 1, y: 5 } });
    expect(orderLine(view, u, { kind: 'move', x: 2.1, y: 2.1 })).toBeNull();
    expect(orderLine(view, u, null)).toBeNull();
  });

  it('colours sides, fades broken regiments and grades morale', () => {
    const mine = regimentColors(reg('a'));
    const ally = regimentColors(reg('b', { controller: 'ai' }));
    const foe = regimentColors(reg('c', { team: 'enemy', controller: 'ai' }));
    expect(new Set([mine.fill, ally.fill, foe.fill]).size).toBe(3);
    expect(mine.alpha).toBe(1);
    expect(regimentColors(reg('d', { broken: true })).alpha).toBeLessThan(1);
    expect(regimentColors(reg('e', { state: 'rout' })).alpha).toBeLessThan(
      regimentColors(reg('f', { broken: true })).alpha,
    );
    expect(moraleBar(80)).toEqual({ frac: 0.8, color: '#7ed36a' });
    expect(moraleBar(45).color).toBe('#e2c04a');
    expect(moraleBar(20).color).toBe('#e0604a');
    expect(moraleBar(150).frac).toBe(1);
    expect(moraleBar(-5).frac).toBe(0);
    expect(moraleBar(0.5).frac).toBe(0.5);
  });

  it('glides positions between kernel steps but snaps long jumps', () => {
    const prev = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 0, y: 0 }],
    ]);
    expect(lerpPos(prev, 'a', 2, 0, 0.25)).toEqual({ x: 0.5, y: 0 });
    expect(lerpPos(prev, 'b', 9, 0, 0.25)).toEqual({ x: 9, y: 0 });
    expect(lerpPos(prev, 'new', 4, 4, 0.25)).toEqual({ x: 4, y: 4 });
    expect(lerpPos(null, 'a', 2, 0, 0.25)).toEqual({ x: 2, y: 0 });
    expect(stepAlpha(1100, 1000, 200)).toBe(0.5);
    expect(stepAlpha(1500, 1000, 200)).toBe(1);
    expect(stepAlpha(900, 1000, 200)).toBe(0);
  });
});

describe('battle model purity', () => {
  it('touches no DOM, real randomness or clock', () => {
    const src = readFileSync(
      join(__dirname, '..', 'src', 'client', 'windows', 'battle_model.ts'),
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

describe('battle model against a real battle', () => {
  const content = buildContent([inventoryPack, warfarePack, worldPack]);

  it('builds orders the warfare command handlers accept', () => {
    const g = createGame({ seed: 7, content, systems: [modifiers, world, inventory, warfare] });
    g.queue('flag.set', { key: 'war.pending', value: 'act2_city_defense' });
    g.step(1);
    g.queue('war.start', { scenarioId: 'act2_city_defense' });
    g.step(1);
    const view = battleView(g.world, g.content);
    expect(view).not.toBeNull();
    if (!view) return;
    const layout = fitLayout(view.width, view.height, 886, 450);
    const guard = view.regiments.find((r) => r.id === 'door_guard');
    const watch = view.regiments.find((r) => r.id === 'watch_squad');
    const foe = view.regiments.find((r) => r.team === 'enemy' && r.state !== 'gone');
    expect(guard && watch && foe).toBeTruthy();
    if (!guard || !watch || !foe) return;

    // the canvas point of the guard picks the guard
    const px = gridToCanvas(layout, guard.x, guard.y);
    const g0 = canvasToGrid(layout, px.x, px.y);
    expect(resolveClick(view, layout, null, 'left', g0.x, g0.y)).toEqual({
      kind: 'select',
      id: 'door_guard',
    });
    // the allied city watch is led by the AI: inspect only
    expect(resolveClick(view, layout, null, 'left', watch.x, watch.y)).toEqual({
      kind: 'inspect',
      id: 'watch_squad',
    });

    const attack = resolveClick(view, layout, 'door_guard', 'right', foe.x, foe.y);
    const move = resolveClick(view, layout, 'door_guard', 'left', 6.5, 4.5);
    expect(attack.kind).toBe('order');
    expect(move.kind).toBe('order');
    if (attack.kind !== 'order' || move.kind !== 'order') return;
    expect(attack.order.kind).toBe('attack');

    const results = () =>
      g.world.recent
        .filter((e) => e.kind === 'command.result' && e.data.kind === 'war.order')
        .map((e) => (e.kind === 'command.result' ? e.data.ok : null));
    // the formation selector offers only the unit's own formations
    const other = formationOptions(guard).find((o) => o.value !== guard.formation)?.value;
    expect(other).toBeDefined();
    if (!other) return;
    for (const order of [
      move.order,
      formationOrder('door_guard', other),
      attack.order,
      holdOrder('door_guard'),
    ]) {
      g.queue('war.order', order);
    }
    g.step(1);
    expect(results()).toEqual([true, true, true, true]);
    const after = battleView(g.world, g.content);
    const guardAfter = after?.regiments.find((r) => r.id === 'door_guard');
    expect(guardAfter?.formation).toBe(other);
    expect(guardAfter?.order).toMatchObject({ kind: 'hold' });
  });
});
