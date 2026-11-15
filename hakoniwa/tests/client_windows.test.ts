import { describe, expect, it } from 'vitest';
import { flagOn } from '../src/client/view/game_view';
import { buildInventoryView, qualityLabel } from '../src/client/windows/inventory_view';
import {
  availabilityKey,
  availableWindows,
  cascadePos,
  clampWindowPos,
  isWindowAvailable,
  WINDOW_DEFS,
  windowDef,
  windowTitle,
} from '../src/client/windows/window_registry';
import type { ItemDef } from '../src/systems/inventory';

describe('client window availability by feature flags', () => {
  it('reads flag truthiness the way the UI does', () => {
    expect(flagOn(undefined)).toBe(false);
    expect(flagOn(false)).toBe(false);
    expect(flagOn(0)).toBe(false);
    expect(flagOn('')).toBe(false);
    expect(flagOn('false')).toBe(false);
    expect(flagOn('0')).toBe(false);
    expect(flagOn(true)).toBe(true);
    expect(flagOn(2)).toBe(true);
    expect(flagOn('done')).toBe(true);
  });

  it('requires every requiresAll flag', () => {
    const def = { requiresAll: ['feature.a', 'feature.b'] };
    expect(isWindowAvailable(def, {}, false)).toBe(false);
    expect(isWindowAvailable(def, { 'feature.a': true }, false)).toBe(false);
    expect(isWindowAvailable(def, { 'feature.a': true, 'feature.b': 1 }, false)).toBe(true);
    expect(isWindowAvailable(def, { 'feature.a': true, 'feature.b': false }, false)).toBe(false);
  });

  it('requires at least one requiresAny flag', () => {
    const def = { requiresAny: ['feature.city', 'feature.inner_court'] };
    expect(isWindowAvailable(def, {}, false)).toBe(false);
    expect(isWindowAvailable(def, { 'feature.city': true }, false)).toBe(true);
    expect(isWindowAvailable(def, { 'feature.inner_court': 'yes' }, false)).toBe(true);
    expect(isWindowAvailable({ requiresAny: [] }, {}, false)).toBe(true);
  });

  it('hides dev-only windows outside dev mode', () => {
    expect(isWindowAvailable({ devOnly: true }, {}, false)).toBe(false);
    expect(isWindowAvailable({ devOnly: true }, {}, true)).toBe(true);
  });

  it('gates the catalogue on the feature flags of implementation_conventions.md 4', () => {
    const base = availableWindows({}, false).map((d) => d.id);
    expect(base).toContain('inventory');
    expect(base).toContain('character');
    expect(base).toContain('saves');
    expect(base).not.toContain('company');
    expect(base).not.toContain('territory');
    expect(base).not.toContain('battle');
    expect(base).not.toContain('strategy');
    expect(base).not.toContain('debug');
    const late = availableWindows(
      { 'feature.company': true, 'feature.city': true, 'feature.rts': true, 'feature.slg': true },
      true,
    ).map((d) => d.id);
    for (const id of ['company', 'territory', 'battle', 'strategy', 'debug'] as const) {
      expect(late).toContain(id);
    }
    expect(windowDef('company').requiresAll).toEqual(['feature.company']);
    expect(windowDef('battle').requiresAll).toEqual(['feature.rts']);
    expect(windowDef('strategy').requiresAll).toEqual(['feature.slg']);
  });

  it('changes the availability signature only when availability changes', () => {
    const a = availabilityKey({}, false);
    expect(availabilityKey({ unrelated: true }, false)).toBe(a);
    expect(availabilityKey({ 'feature.company': true }, false)).not.toBe(a);
    expect(a).toHaveLength(WINDOW_DEFS.length);
  });

  it('has a Chinese title for every window', () => {
    for (const d of WINDOW_DEFS) expect(windowTitle(d.id)).not.toBe(d.id);
  });

  it('keeps dragged windows reachable and cascades new ones', () => {
    expect(clampWindowPos(-5000, -40, 400, 1920, 1080)).toEqual({ x: 80 - 400, y: 0 });
    expect(clampWindowPos(5000, 5000, 400, 1920, 1080)).toEqual({ x: 1920 - 80, y: 1080 - 32 });
    expect(clampWindowPos(300, 200, 400, 1920, 1080)).toEqual({ x: 300, y: 200 });
    const a = cascadePos(0, 400, 1920);
    const b = cascadePos(1, 400, 1920);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
    expect(cascadePos(8, 400, 1920)).toEqual(a);
  });
});

describe('client inventory window model', () => {
  const defs: ItemDef[] = [
    {
      id: 'sword',
      name: '旧铁剑',
      kind: 'weapon',
      quality: 1,
      value: 450,
      desc: '',
      slot: 'main_hand',
      level: 3,
    },
    {
      id: 'blade',
      name: '名刀',
      kind: 'weapon',
      quality: 4,
      value: 99999,
      desc: '',
      slot: 'main_hand',
    },
    {
      id: 'potion',
      name: '药草汤',
      kind: 'consumable',
      quality: 1,
      value: 35,
      desc: '',
      use: { effect: 'heal' },
    },
    { id: 'herb', name: '月见草', kind: 'material', quality: 0, value: 4, desc: '' },
  ];
  const lookup = (id: string) => defs.find((d) => d.id === id);

  it('groups by kind in a fixed order, sorts by quality, and lists actions', () => {
    const v = buildInventoryView(
      {
        money: 12345,
        items: { herb: 7, potion: 2, sword: 1, blade: 1, odd: 1, gone: 0 },
        equipped: { main_hand: 'sword' },
      },
      lookup,
    );
    expect(v.money).toBe('1 金 23 银 45 铜');
    expect(v.groups.map((g) => g.label)).toEqual(['武器', '消耗品', '材料', '未知物品']);
    const weapons = v.groups[0]?.items ?? [];
    expect(weapons.map((i) => i.id)).toEqual(['blade', 'sword']);
    expect(weapons[1]?.equipped).toBe(true);
    expect(weapons[1]?.actions).toEqual(['equip']);
    expect(weapons[1]?.levelNote).toBe('需要等级 3');
    expect(v.groups[1]?.items[0]?.actions).toEqual(['use']);
    expect(v.groups[2]?.items[0]?.actions).toEqual([]);
    expect(v.groups[3]?.items[0]?.name).toBe('odd');
    expect(v.empty).toBe(false);
  });

  it('lists all eight equipment slots with Chinese labels', () => {
    const v = buildInventoryView({ money: 0, items: {}, equipped: { main_hand: 'sword' } }, lookup);
    expect(v.equipped).toHaveLength(8);
    expect(v.equipped[0]).toMatchObject({ slot: 'main_hand', label: '主手', name: '旧铁剑' });
    expect(v.equipped[1]?.name).toBeUndefined();
    expect(v.empty).toBe(true);
    expect(v.money).toBe('0 铜');
  });

  it('labels the six quality steps', () => {
    expect(qualityLabel(0)).toBe('粗糙');
    expect(qualityLabel(5)).toBe('传说');
    expect(qualityLabel(9)).toBe('传说');
  });
});
