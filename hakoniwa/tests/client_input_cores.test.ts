// The pure input cores of PK-M1-07 (release_engineering.md 4.4; ux_and_onboarding.md 5.2,
// 16): the gamepad reader (radial dead zone, 8-way movement, hold, repeat, stick gestures),
// controller families and glyph text, soft targeting (cone, range, attackers first, leash,
// cycling), radial menu pages and pointing, focus navigation, the virtual cursor, the
// floating keyboard and the 24-slot hotbar layout.

import { describe, expect, it } from 'vitest';
import { hotbarLayout } from '../src/client/hud/hotbar_model';
import { DEFAULT_CONTEXT_KEYMAP } from '../src/client/input/contexts';
import { familyFromId, glyphFamily } from '../src/client/input/device';
import { moveFocus } from '../src/client/input/focus_nav';
import { deadZone, eightWay, PadReader, type PadSnapshot } from '../src/client/input/gamepad';
import {
  actionText,
  chordText,
  DEFAULT_KEY_TEXT_STATE,
  keyCapText,
  keyRefText,
  padBindingText,
} from '../src/client/input/glyphs';
import {
  openOsk,
  oskBack,
  oskKeyAt,
  oskMove,
  oskPress,
  oskRows,
  oskType,
} from '../src/client/input/osk';
import { DEFAULT_PAD_KEYMAP, PAD_BUTTONS, type PadButton } from '../src/client/input/pad_bindings';
import {
  MORE_SECTOR,
  openRing,
  pageCount,
  pageSectors,
  pickRing,
  pointStick,
  sectorAt,
} from '../src/client/input/radial';
import { cycleTarget, hardTargetLost, pickSoftTarget } from '../src/client/input/soft_target';
import { centeredCursor, moveCursor } from '../src/client/input/virtual_cursor';

function snap(pressed: PadButton[] = [], axes = [0, 0, 0, 0]): PadSnapshot {
  const buttons = PAD_BUTTONS.map((b) => (pressed.includes(b) ? 1 : 0));
  return { id: 'x', buttons, axes };
}

describe('gamepad reader', () => {
  it('applies a radial dead zone and rescales to 1 at the outer edge', () => {
    expect(deadZone(0.1, 0.1, 0.15, 0.95)).toEqual({ x: 0, y: 0 });
    const full = deadZone(1, 0, 0.15, 0.95);
    expect(full.x).toBeCloseTo(1);
    const mid = deadZone(0.55, 0, 0.15, 0.95);
    expect(mid.x).toBeCloseTo(0.5);
  });

  it('quantizes the left stick to 8 directions like the keyboard', () => {
    expect(eightWay({ x: 1, y: 0 })).toEqual({ dx: 1, dy: 0 });
    expect(eightWay({ x: 0.7, y: 0.7 })).toEqual({ dx: 1, dy: 1 });
    expect(eightWay({ x: -0.1, y: -0.9 })).toEqual({ dx: 0, dy: -1 });
    expect(eightWay({ x: 0.05, y: 0 })).toEqual({ dx: 0, dy: 0 });
  });

  it('reports down, hold after the hold time, repeat, and up with the held time', () => {
    const r = new PadReader({ holdMs: 500, repeatDelayMs: 400, repeatMs: 100 });
    expect(r.read(snap(['a']), 0).events).toEqual([{ type: 'down', button: 'a' }]);
    expect(r.read(snap(['a']), 300).events).toEqual([]);
    expect(r.read(snap(['a']), 450).events).toEqual([{ type: 'repeat', button: 'a' }]);
    expect(r.read(snap(['a']), 520).events).toEqual([{ type: 'hold', button: 'a' }]);
    expect(r.read(snap(), 600).events).toEqual([{ type: 'up', button: 'a', heldMs: 600 }]);
    // triggers count from half way
    const t = new PadReader();
    const s = snap();
    (s.buttons as number[])[6] = 0.4;
    expect(t.read(s, 0).events).toEqual([]);
    (s.buttons as number[])[6] = 0.6;
    expect(t.read(s, 10).events).toEqual([{ type: 'down', button: 'lt' }]);
    // a vanished pad releases everything
    expect(t.read(null, 20).events).toEqual([{ type: 'up', button: 'lt', heldMs: 10 }]);
  });

  it('turns stick pushes into gestures that re-arm in the centre', () => {
    const r = new PadReader({ repeatDelayMs: 400, repeatMs: 100 });
    const ev = (axes: number[], t: number) => r.read(snap([], axes), t).events;
    expect(ev([0, 0, 0, -1], 0)).toEqual([
      { type: 'gesture', stick: 'right', dir: 'up', repeat: false },
    ]);
    expect(ev([0, 0, 0, -1], 100)).toEqual([]);
    expect(ev([0, 0, 0, -1], 450)).toEqual([
      { type: 'gesture', stick: 'right', dir: 'up', repeat: true },
    ]);
    expect(ev([0, 0, 0, 0], 500)).toEqual([]);
    expect(ev([-1, 0, 0, 0], 600)).toEqual([
      { type: 'gesture', stick: 'left', dir: 'left', repeat: false },
    ]);
    expect(r.read(snap([], [0.9, 0, 0, 0]), 700).move).toEqual({ dx: 1, dy: 0 });
  });
});

describe('controller families and glyph text (16.1, 16.6 rule 6)', () => {
  it('tells families from Gamepad.id, with the setting winning', () => {
    expect(familyFromId('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)')).toBe('xbox');
    expect(familyFromId('DualSense Wireless Controller (Vendor: 054c Product: 0ce6)')).toBe(
      'playstation',
    );
    expect(familyFromId('Wireless Controller (STANDARD GAMEPAD Vendor: 054c)')).toBe('playstation');
    expect(familyFromId('Pro Controller (Vendor: 057e)')).toBe('switch');
    expect(familyFromId('Steam Deck (Vendor: 28de Product: 1205)')).toBe('deck');
    expect(familyFromId('Steam Virtual Gamepad (Vendor: 28de Product: 11ff)')).toBe('xbox');
    expect(familyFromId('Generic USB Joystick')).toBe('neutral');
    expect(glyphFamily('auto', 'Pro Controller')).toBe('switch');
    expect(glyphFamily('neutral', 'Pro Controller')).toBe('neutral');
  });

  it('labels keys by physical position, with the layout character when known', () => {
    expect(keyCapText('KeyE')).toBe('E');
    expect(keyCapText('Space')).toBe('空格');
    expect(keyCapText('Numpad3')).toBe('小键盘3');
    expect(keyCapText('Mouse1')).toBe('中键');
    expect(keyCapText('KeyQ', new Map([['KeyQ', 'a']]))).toBe('A');
    expect(chordText({ code: 'Digit1', shift: true })).toBe('Shift+1');
    expect(chordText({ code: 'Tab', ctrl: true, shift: true })).toBe('Ctrl+Shift+Tab');
  });

  it('labels pad bindings per family, hold, combos, sticks, rings and the hotbar', () => {
    const map = DEFAULT_PAD_KEYMAP;
    const text = (ctx: 'field' | 'global', a: string, fam = 'xbox' as const) =>
      padBindingText(map[ctx][a]?.primary, fam, map, ctx);
    expect(text('field', 'interact')).toBe('A');
    expect(padBindingText(map.field.interact?.primary, 'playstation', map, 'field')).toBe('下方键');
    expect(padBindingText(map.field.interact?.primary, 'switch', map, 'field')).toBe('B');
    expect(text('field', 'camera_reset')).toBe('长按 Y');
    expect(text('field', 'mount')).toBe('LB+RB');
    expect(text('field', 'zoom_in')).toBe('LS+右摇杆上');
    expect(text('field', 'win_inventory')).toBe('长按 View');
    expect(text('field', 'hotbar_1')).toBe('LT+十字键←');
    expect(text('field', 'hotbar_20')).toBe('LT+RT+十字键↓');
  });

  it('renders {key:} references per device, composites included', () => {
    const kbm = DEFAULT_KEY_TEXT_STATE;
    const pad = { ...kbm, device: 'pad' as const };
    expect(keyRefText('field.interact', kbm)).toBe('E');
    expect(keyRefText('field.interact', pad)).toBe('A');
    expect(keyRefText('interact', kbm)).toBe('E');
    expect(keyRefText('field.move', kbm)).toBe('WASD');
    expect(keyRefText('field.move', pad)).toBe('左摇杆');
    expect(keyRefText('dialogue.choose', kbm)).toBe('1～9');
    expect(keyRefText('global.cancel', kbm)).toBe('Esc');
    expect(keyRefText('global.cancel', pad)).toBe('B');
    // a key-only action on the pad falls back to the key
    expect(actionText(pad, 'global', 'menu')).toBe('Menu');
    expect(keyRefText('nowhere.thing', kbm)).toBeUndefined();
  });
});

describe('soft targeting (16.4)', () => {
  const from = { x: 0, y: 0, facing: 0 };
  it('picks the nearest enemy in the cone and range, attackers first', () => {
    const c = [
      { id: 'behind', x: -3, y: 0, attacking: false },
      { id: 'near', x: 4, y: 0.5, attacking: false },
      { id: 'far', x: 10, y: 0, attacking: false },
      { id: 'wide', x: 2, y: 3, attacking: false },
    ];
    expect(pickSoftTarget(from, c)).toBe('near');
    expect(pickSoftTarget(from, c, 40)).toBe('near');
    // a 90 degree cone does not reach 56 degrees off the facing
    expect(pickSoftTarget(from, [c[3] as (typeof c)[number]], 90)).toBeNull();
    expect(pickSoftTarget({ ...from, facing: Math.PI }, c)).toBe('behind');
    expect(pickSoftTarget(from, [...c, { id: 'biter', x: 9, y: 0, attacking: true }])).toBe(
      'biter',
    );
    expect(pickSoftTarget(from, [{ id: 'out', x: 26, y: 0, attacking: true }])).toBeNull();
  });

  it('drops a hard target past 40 m, dead or on another map', () => {
    const me = { x: 0, y: 0, mapId: 'm' };
    expect(hardTargetLost(me, { x: 30, y: 0, mapId: 'm', alive: true })).toBe(false);
    expect(hardTargetLost(me, { x: 41, y: 0, mapId: 'm', alive: true })).toBe(true);
    expect(hardTargetLost(me, { x: 1, y: 0, mapId: 'm', alive: false })).toBe(true);
    expect(hardTargetLost(me, { x: 1, y: 0, mapId: 'n', alive: true })).toBe(true);
    expect(hardTargetLost(me, undefined)).toBe(true);
  });

  it('cycles by distance both ways and wraps', () => {
    const c = [
      { id: 'b', x: 5, y: 0, attacking: false },
      { id: 'a', x: 2, y: 0, attacking: false },
      { id: 'c', x: 9, y: 0, attacking: false },
    ];
    expect(cycleTarget(from, c, null, 1)).toBe('a');
    expect(cycleTarget(from, c, 'a', 1)).toBe('b');
    expect(cycleTarget(from, c, 'c', 1)).toBe('a');
    expect(cycleTarget(from, c, 'a', -1)).toBe('c');
    expect(cycleTarget(from, [], null, 1)).toBeNull();
  });
});

describe('radial menus (16.5)', () => {
  const sectors = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, label: `S${i}` }));
  it('pages past 8 sectors with "more" on the eighth', () => {
    expect(pageCount(sectors(8))).toBe(1);
    expect(pageCount(sectors(9))).toBe(2);
    const p0 = pageSectors(sectors(9), 0, 'more');
    expect(p0.length).toBe(8);
    expect(p0[7]?.id).toBe(MORE_SECTOR);
    expect(pageSectors(sectors(9), 1, 'more').map((x) => x.id)).toEqual(['s7', 's8', MORE_SECTOR]);
  });

  it('points clockwise from the top, picks, turns the page, cancels in the centre', () => {
    expect(sectorAt(0, -1, 8, 0.5)).toBe(0);
    expect(sectorAt(1, 0, 8, 0.5)).toBe(2);
    expect(sectorAt(0, 1, 4, 0.5)).toBe(2);
    expect(sectorAt(0.1, 0, 4, 0.5)).toBeNull();
    let r = openRing('windows', sectors(9), 'pad:view', false);
    r = pointStick(r, 1, 0, 'more');
    expect(pickRing(r, 'more')).toEqual({ type: 'pick', id: 's2' });
    r = pointStick(r, -0.7, -0.7, 'more');
    const more = pickRing(r, 'more');
    expect(more.type).toBe('page');
    if (more.type === 'page') expect(more.state.page).toBe(1);
    r = pointStick(r, 0, 0, 'more');
    expect(pickRing(r, 'more')).toEqual({ type: 'cancel' });
    const off = pointStick(
      openRing('items', [{ id: 'x', label: 'x', disabled: true }], 'pad:down', false),
      0,
      -1,
      'more',
    );
    expect(pickRing(off, 'more')).toEqual({ type: 'none' });
  });
});

describe('focus navigation and the virtual cursor', () => {
  const grid = [
    { id: 'a', x: 0, y: 0, w: 50, h: 20 },
    { id: 'b', x: 100, y: 0, w: 50, h: 20 },
    { id: 'c', x: 0, y: 40, w: 50, h: 20 },
    { id: 'd', x: 100, y: 40, w: 50, h: 20 },
  ];
  it('moves by direction to the nearest control in line, wraps, and walks reading order', () => {
    expect(moveFocus(grid, null, 'down')).toBe('a');
    expect(moveFocus(grid, 'a', 'right')).toBe('b');
    expect(moveFocus(grid, 'a', 'down')).toBe('c');
    expect(moveFocus(grid, 'd', 'up')).toBe('b');
    expect(moveFocus(grid, 'b', 'right')).toBe('a');
    expect(moveFocus(grid, 'c', 'down')).toBe('a');
    expect(moveFocus(grid, 'd', 'next')).toBe('a');
    expect(moveFocus(grid, 'a', 'prev')).toBe('d');
    expect(moveFocus([], null, 'up')).toBeNull();
  });

  it('steers the cursor by the square of the stick, inside the viewport', () => {
    const view = { w: 800, h: 600 };
    const c = centeredCursor(800, 600);
    expect(c).toEqual({ x: 400, y: 300 });
    const full = moveCursor(c, { x: 1, y: 0 }, 100, view);
    const half = moveCursor(c, { x: 0.5, y: 0 }, 100, view);
    expect(full.x - 400).toBeCloseTo(90);
    expect(half.x - 400).toBeCloseTo(22.5);
    expect(moveCursor({ x: 795, y: 5 }, { x: 1, y: -1 }, 100, view)).toEqual({ x: 799, y: 0 });
    expect(moveCursor(c, { x: 0, y: 0 }, 100, view)).toBe(c);
  });
});

describe('floating keyboard', () => {
  const han = '甲乙丙丁戊己庚辛壬癸子丑';
  it('lays out pages with an action row and types up to the maximum length', () => {
    const latin = oskRows('latin', han, false);
    expect(latin[0]?.length).toBe(10);
    expect(latin.at(-1)?.map((k) => k.kind)).toEqual([
      'page',
      'caps',
      'space',
      'back',
      'empty',
      'done',
    ]);
    expect(oskRows('han', han, false)[1]?.length).toBe(2);
    let s = openOsk(3);
    expect(oskKeyAt(s, han)).toEqual({ kind: 'char', ch: '甲' });
    s = oskType(oskType(oskType(oskType(s, 'a'), 'b'), 'c'), 'd');
    expect(s.text).toBe('abc');
    const back = oskBack(s);
    expect(back.type === 'edit' && back.state.text).toBe('ab');
    expect(oskBack(openOsk(3))).toEqual({ type: 'cancel' });
  });

  it('moves with wrap, keeps the column in proportion and submits', () => {
    let s = openOsk(8, 'latin');
    s = oskMove(s, 'left', han);
    expect(s.col).toBe(9);
    s = oskMove(s, 'down', han);
    s = oskMove(s, 'down', han);
    expect(s.row).toBe(2);
    expect(s.col).toBe(8);
    s = oskMove(s, 'down', han);
    s = oskMove(s, 'down', han);
    expect(s.row).toBe(4);
    expect(oskKeyAt(s, han)?.kind).toBe('done');
    expect(oskPress({ ...s, text: ' Ann ' }, han)).toEqual({ type: 'submit', text: 'Ann' });
    const empty = { ...s, col: 4 };
    expect(oskPress(empty, han)).toEqual({ type: 'submit', text: '' });
    const page = oskPress({ ...s, col: 0 }, han);
    expect(page.type === 'edit' && page.state.page).toBe('han');
    const caps = oskPress({ ...s, col: 1 }, han);
    expect(caps.type === 'edit' && oskKeyAt({ ...caps.state, row: 1, col: 0 }, han)).toEqual({
      kind: 'char',
      ch: 'Q',
    });
  });
});

describe('hotbar layout (5.2)', () => {
  it('shows two keyboard rows of 12 with the second only when filled', () => {
    const l = hotbarLayout(DEFAULT_KEY_TEXT_STATE, new Set([1, 2]), { a: false, b: false });
    expect(l.rows.map((r) => [r.slots.length, r.visible])).toEqual([
      [12, true],
      [12, false],
    ]);
    expect(l.keys.slice(0, 3)).toEqual(['1', '2', '3']);
    expect(l.keys[10]).toBe('-');
    expect(l.keys[12]).toBe('Shift+1');
    const two = hotbarLayout(DEFAULT_KEY_TEXT_STATE, new Set([13]), { a: false, b: false });
    expect(two.rows[1]?.visible).toBe(true);
  });

  it('shows three gamepad groups of 8, lighting the held layer', () => {
    const pad = { ...DEFAULT_KEY_TEXT_STATE, device: 'pad' as const, kbm: DEFAULT_CONTEXT_KEYMAP };
    const l = hotbarLayout(pad, new Set([1]), { a: true, b: true });
    expect(l.rows.map((r) => [r.slots[0], r.slots.length, r.label, r.active])).toEqual([
      [1, 8, 'LT', false],
      [9, 8, 'RT', false],
      [17, 8, 'LT+RT', true],
    ]);
    expect(l.rows.map((r) => r.visible)).toEqual([true, false, true]);
    expect(l.keys.slice(0, 8)).toEqual(['←', '↑', '→', '↓', 'X', 'Y', 'B', 'A']);
  });
});
