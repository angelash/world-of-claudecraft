import { describe, expect, it } from 'vitest';
import type { AnyWorldEvent, EventKind, EventMap } from '../src/core/contracts';
import '../src/core/shared_events';
import '../src/systems/inventory';
import '../src/systems/world';
import { formatDate, formatTime, timeOfDayLabel, weatherLabel } from '../src/client/hud/format';
import { formatEvent, type LogContext } from '../src/client/hud/log_format';
import { tr } from '../src/core/text';
import { calendarAt, tickAtDay } from '../src/core/time';

function ev<K extends EventKind>(kind: K, data: EventMap[K], tick = 10): AnyWorldEvent {
  return { kind, tick, seq: 1, data } as unknown as AnyWorldEvent;
}

const ctx: LogContext = {
  playerId: 'player',
  playerMapId: 'town',
  itemName: (id) => ({ herb: '月见草', sword: '旧铁剑' })[id],
  mapName: (id) => ({ town: '边石镇', ruins: '封门遗迹' })[id],
  entityName: (id) => ({ wolf1: '灰狼' })[id],
};

const text = (e: AnyWorldEvent) => formatEvent(e, ctx)?.text ?? null;

describe('client message log formatting', () => {
  it('formats the four dialogue line kinds', () => {
    const line = (kind: EventMap['dialogue.line']['kind']) =>
      ev('dialogue.line', { speakerId: 'n1', speakerName: '玛莎', text: '欢迎光临。', kind });
    expect(text(line('say'))).toBe('玛莎：欢迎光临。');
    expect(text(line('think'))).toBe('玛莎（心想）：欢迎光临。');
    expect(text(line('divine'))).toBe('【玛莎】欢迎光临。');
    expect(text(line('narrate'))).toBe('欢迎光临。');
    expect(formatEvent(line('divine'), ctx)?.category).toBe('divine');
  });

  it('shows rejection reasons only for the player own commands', () => {
    const rejected = (source: EventMap['command.result']['source'], kind = 'world.use_exit') =>
      ev('command.result', {
        kind,
        ok: false,
        code: 'too_far',
        reason: tr('sys.world.reject.too_far'),
        source,
      });
    expect(text(rejected({ type: 'player' }))).toBe('无法执行：离出口太远');
    expect(formatEvent(rejected({ type: 'player' }), ctx)?.category).toBe('warning');
    expect(text(rejected({ type: 'system', system: 'npc' }))).toBeNull();
    expect(text(rejected({ type: 'ai', agentId: 'a', requestId: 'r' }))).toBeNull();
    // routine movement rejections stay quiet
    expect(text(rejected({ type: 'player' }, 'world.set_intent'))).toBeNull();
    // successes are not logged
    expect(
      text(ev('command.result', { kind: 'world.move_to', ok: true, source: { type: 'player' } })),
    ).toBeNull();
    // a rejection without a reason names the command
    expect(
      text(ev('command.result', { kind: 'x.y', ok: false, code: 'c', source: { type: 'player' } })),
    ).toBe('无法执行：x.y');
  });

  it('formats money changes with formatMoney, for the player only', () => {
    const money = (ownerId: string, delta: number) =>
      ev('money.changed', { ownerId, delta, balance: 99999, reason: 'loot' });
    expect(text(money('player', 12345))).toBe('获得 1 金 23 银 45 铜');
    expect(text(money('player', -250))).toBe('失去 2 银 50 铜');
    expect(text(money('npc_1', 100))).toBeNull();
    expect(text(money('player', 0))).toBeNull();
  });

  it('formats inventory changes with item names', () => {
    const inv = (itemId: string, delta: number, ownerId = 'player') =>
      ev('inventory.changed', { ownerId, itemId, delta, reason: 'gain' });
    expect(text(inv('herb', 3))).toBe('获得 月见草 x3');
    expect(text(inv('sword', -1))).toBe('失去 旧铁剑 x1');
    expect(text(inv('mystery', 1))).toBe('获得 未知物品 x1');
    expect(text(inv('herb', 1, 'npc_1'))).toBeNull();
    expect(
      text(ev('item.equipped', { ownerId: 'player', itemId: 'sword', slot: 'main_hand' })),
    ).toBe('装备了 旧铁剑');
  });

  it('formats world events: map change, weather, new day, move failure', () => {
    expect(text(ev('world.map_changed', { id: 'player', from: 'town', to: 'ruins' }))).toBe(
      '来到了 封门遗迹',
    );
    expect(text(ev('world.map_changed', { id: 'npc_1', from: 'town', to: 'ruins' }))).toBeNull();
    expect(text(ev('world.weather', { weather: 'rain', forced: false }))).toBe('天气转为：雨');
    expect(text(ev('world.weather', { weather: 'ashfall', forced: true }))).toBe('天气骤变：灰烬');
    const dayTick = tickAtDay(1, 0, 0);
    expect(text(ev('world.day', { dayIndex: 1, season: 0, year: 998 }, dayTick))).toBe(
      '新的一天：圣历 998 年 春 第 2 日',
    );
    expect(text(ev('world.move_failed', { id: 'player', reason: '那里走不过去' }))).toBe(
      '移动受阻：那里走不过去',
    );
  });

  it('formats story and progression events', () => {
    expect(text(ev('feature.unlocked', { feature: 'company' }))).toBe('新的能力开放：门扉商会');
    expect(text(ev('feature.unlocked', { feature: 'feature.city' }))).toBe(
      '新的能力开放：领地建设',
    );
    expect(text(ev('act.changed', { from: 'prologue', to: 'act1' }))).toBe('第一幕');
    expect(text(ev('player.level_up', { level: 5 }))).toBe('你升到了 5 级');
    // experience is logged from combat.xp (combat applies xp.awarded), never twice
    expect(text(ev('xp.awarded', { entityId: 'player', amount: 40, reason: 'quest' }))).toBeNull();
  });

  it('logs deaths on the player map only, by entity name', () => {
    const died = (id: string, mapId: string) =>
      ev('entity.died', { id, kind: 'monster', mapId, x: 1, y: 1 });
    expect(text(died('wolf1', 'town'))).toBe('灰狼 倒下了');
    expect(text(died('wolf1', 'ruins'))).toBeNull();
    expect(text(died('unknown', 'town'))).toBeNull();
    // the event's own name wins (the entity may already be gone)
    expect(
      text(
        ev('entity.died', { id: 'gone', name: '澱渣', kind: 'monster', mapId: 'town', x: 1, y: 1 }),
      ),
    ).toBe('澱渣 倒下了');
  });

  it('ignores events it has no line for', () => {
    expect(text(ev('world.arrived', { id: 'player', x: 1, y: 1 }))).toBeNull();
    expect(text(ev('flag.changed', { key: 'a', value: 1, previous: undefined }))).toBeNull();
  });
});

describe('client HUD calendar formatting', () => {
  it('formats the opening moment of the Sacred Era', () => {
    const cal = calendarAt(0);
    expect(formatDate(cal)).toBe('圣历 998 年 春 第 1 日');
    expect(formatTime(cal)).toBe('06:00');
    expect(timeOfDayLabel(cal)).toBe('黎明');
  });

  it('rolls seasons and pads minutes', () => {
    const cal = calendarAt(tickAtDay(28 + 3, 21, 5));
    expect(formatDate(cal)).toBe('圣历 998 年 夏 第 4 日');
    expect(formatTime(cal)).toBe('21:05');
    expect(timeOfDayLabel(cal)).toBe('夜晚');
  });

  it('names every weather', () => {
    for (const w of ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow', 'ashfall'] as const) {
      expect(weatherLabel(w)).not.toBe('未知');
    }
    expect(weatherLabel('meteor')).toBe('未知');
  });
});
