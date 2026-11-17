// The action layer (PK-M1-07; release_engineering.md 4.4; ux_and_onboarding.md 16): the
// context stack, key chords resolved through it with fall-through, held movement (Shift held
// still walks), device switching (a key, a pad input, more than 8 pixels of pointer travel),
// and the gamepad semantics: taps fire on press, buttons with a long press or used as a
// modifier wait, combos suppress the modifier's own tap, the cross hotbar layers, ring
// opening, pointing, picking and cancelling (also with hold-to-toggle), the floating
// keyboard, the virtual cursor in placement, the right stick's orbit, and window actions on
// the UI side.

import { describe, expect, it } from 'vitest';
import { contextStack, IDLE_SURFACE, type InputSurface } from '../src/client/input/actions';
import {
  DEFAULT_CONTEXT_KEYMAP,
  type InputContext,
  type KeyChord,
} from '../src/client/input/contexts';
import type { PadSnapshot } from '../src/client/input/gamepad';
import {
  type GameSink,
  InputHub,
  type TextTarget,
  type UiSink,
} from '../src/client/input/input_hub';
import { defaultInputSettings } from '../src/client/input/input_settings';
import type { Intent } from '../src/client/input/keymap';
import {
  DEFAULT_PAD_KEYMAP,
  PAD_BUTTONS,
  type PadButton,
  type RingId,
  resolvePadKeymap,
} from '../src/client/input/pad_bindings';
import type { RingSector } from '../src/client/input/radial';

class FakeGame implements GameSink {
  surf: InputSurface = { ...IDLE_SURFACE };
  intents: Intent[] = [];
  actions: string[] = [];
  /** actions that decline (fall through) */
  decline = new Set<string>();
  orbits: [number, number][] = [];
  text: TextTarget | null = null;
  submitted: string[] = [];
  sectors: Partial<Record<RingId, RingSector[]>> = {};
  chosen: string[] = [];
  ringOpenLog: boolean[] = [];
  devices: string[] = [];
  surface() {
    return this.surf;
  }
  intent(i: Intent) {
    this.intents.push(i);
  }
  action(context: InputContext, action: string, device: string) {
    const name = `${context}.${action}`;
    if (this.decline.has(name)) return false;
    this.actions.push(`${name}@${device}`);
    return true;
  }
  orbit(dx: number, dy: number) {
    this.orbits.push([dx, dy]);
  }
  textTarget() {
    return this.text;
  }
  submitText(text: string) {
    this.submitted.push(text);
  }
  ringSectors(ring: RingId) {
    return this.sectors[ring] ?? [];
  }
  ringChoose(ring: RingId, id: string) {
    this.chosen.push(`${ring}:${id}`);
  }
  ringOpen(open: boolean) {
    this.ringOpenLog.push(open);
  }
  deviceChanged(d: string) {
    this.devices.push(d);
  }
}

class FakeUi implements UiSink {
  log: string[] = [];
  clicks: [number, number][] = [];
  focusMove(m: string) {
    this.log.push(`focus:${m}`);
    return true;
  }
  focusActivate() {
    this.log.push('activate');
    return true;
  }
  focusAction(k: string) {
    this.log.push(`action:${k}`);
    return true;
  }
  tab(d: number) {
    this.log.push(`tab:${d}`);
    return true;
  }
  page(d: number) {
    this.log.push(`page:${d}`);
    return true;
  }
  scroll(_dx: number, dy: number) {
    this.log.push(`scroll:${Math.sign(dy)}`);
  }
  cursorClick(x: number, y: number) {
    this.clicks.push([x, y]);
  }
  cursorMoved() {}
  hideUi() {
    this.log.push('hide');
  }
  fullscreen() {
    this.log.push('fullscreen');
  }
  viewport() {
    return { w: 1000, h: 600 };
  }
  changed() {}
}

function setup(holdToToggle = false) {
  const game = new FakeGame();
  const ui = new FakeUi();
  const hub = new InputHub(
    game,
    ui,
    () => '甲乙丙丁戊己庚辛壬癸子丑',
    () => 'more',
  );
  hub.configure(DEFAULT_CONTEXT_KEYMAP, DEFAULT_PAD_KEYMAP, defaultInputSettings(), holdToToggle);
  const buttons = new Array<number>(17).fill(0);
  const axes = [0, 0, 0, 0];
  let now = 0;
  const snap = (): PadSnapshot => ({
    id: 'Xbox 360 Controller (045e)',
    buttons: [...buttons],
    axes: [...axes],
  });
  const frame = (ms = 16) => {
    now += ms;
    hub.padFrame(snap(), now);
  };
  const set = (b: PadButton, v: boolean) => {
    buttons[PAD_BUTTONS.indexOf(b)] = v ? 1 : 0;
  };
  const tap = (b: PadButton) => {
    set(b, true);
    frame();
    set(b, false);
    frame();
  };
  const hold = (b: PadButton, ms = 600) => {
    set(b, true);
    frame();
    frame(ms);
  };
  const key = (c: KeyChord, phase: 'down' | 'up' = 'down') => hub.key(c, phase);
  return { game, ui, hub, set, frame, tap, hold, axes, key };
}

describe('context stack (16.1)', () => {
  it('stacks dialogue over the field while talk shows, and a window on top', () => {
    const s = IDLE_SURFACE;
    expect(contextStack(s, 'kbm')).toEqual(['field', 'global']);
    expect(contextStack({ ...s, talk: true }, 'kbm')).toEqual(['dialogue', 'field', 'global']);
    expect(contextStack({ ...s, scene: 'choice', talk: true }, 'kbm')).toEqual([
      'dialogue',
      'global',
    ]);
    // an open window takes the directional navigation (1.3): over the field for key and
    // mouse, the whole pad
    expect(contextStack({ ...s, windows: true }, 'kbm')).toEqual(['window', 'field', 'global']);
    expect(contextStack({ ...s, windows: true, talk: true }, 'pad')).toEqual(['window', 'global']);
  });

  it('never lets the dialogue table shadow walking, windows or zoom over the field', () => {
    const { game, key } = setup();
    game.surf = { ...game.surf, talk: true, conversation: true };
    // A walks (auto-advance stays off), H opens the letters, PageUp zooms, 1 picks
    key({ code: 'KeyA' });
    key({ code: 'KeyA' }, 'up');
    key({ code: 'KeyH' });
    key({ code: 'PageUp' });
    key({ code: 'Digit1' });
    expect(game.intents).toEqual([
      { dx: -1, dy: 0 },
      { dx: 0, dy: 0 },
    ]);
    expect(game.actions).toEqual([
      'field.win_letters@kbm',
      'field.zoom_in@kbm',
      'dialogue.option_1@kbm',
    ]);
    // in a scene the whole dialogue table is live
    game.surf = { ...game.surf, scene: 'advance' };
    key({ code: 'KeyA' });
    expect(game.actions.at(-1)).toBe('dialogue.auto_advance@kbm');
    expect(game.intents.length).toBe(2);
  });
});

describe('key and mouse through the action layer', () => {
  it('resolves chords in the active contexts and falls through declined actions', () => {
    const { game, key } = setup();
    expect(key({ code: 'KeyE' })).toBe(true);
    expect(key({ code: 'Digit1', shift: true })).toBe(true);
    expect(key({ code: 'KeyQ', ctrl: true })).toBe(false);
    expect(game.actions).toEqual(['field.interact@kbm', 'field.hotbar_13@kbm']);
    // a conversation: 1 picks an option; with no option to pick it falls to the hotbar
    game.surf = { ...game.surf, talk: true };
    key({ code: 'Digit1' });
    game.decline.add('dialogue.option_1');
    key({ code: 'Digit1' });
    expect(game.actions.slice(2)).toEqual(['dialogue.option_1@kbm', 'field.hotbar_1@kbm']);
  });

  it('holds movement by physical key; Shift held still walks; opposites cancel', () => {
    const { game, key } = setup();
    key({ code: 'KeyW' });
    key({ code: 'KeyD', shift: true });
    key({ code: 'KeyS' });
    key({ code: 'KeyW' }, 'up');
    key({ code: 'KeyD' }, 'up');
    key({ code: 'KeyS' }, 'up');
    expect(game.intents).toEqual([
      { dx: 0, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 1, dy: 1 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: 0 },
    ]);
  });

  it('runs window actions on the UI side while a window is open; WASD still walks', () => {
    const { game, ui, key } = setup();
    game.surf = { ...game.surf, windows: true };
    key({ code: 'ArrowDown' });
    key({ code: 'Tab' });
    key({ code: 'Enter' });
    key({ code: 'NumpadEnter' });
    key({ code: 'Tab', ctrl: true });
    key({ code: 'F10' });
    key({ code: 'KeyW' });
    expect(ui.log).toEqual(['focus:down', 'focus:next', 'activate', 'activate', 'tab:1', 'hide']);
    expect(game.actions).toEqual([]);
    expect(game.intents).toEqual([{ dx: 0, dy: -1 }]);
  });

  it('switches the device on a key, a pad input and more than 8 pixels of pointer travel', () => {
    const { hub, game, key, tap } = setup();
    expect(hub.device).toBe('kbm');
    tap('x');
    expect(hub.device).toBe('pad');
    hub.pointer(10, 10, 5);
    expect(hub.device).toBe('pad');
    hub.pointer(20, 10, 5);
    expect(hub.device).toBe('kbm');
    tap('x');
    key({ code: 'KeyV' });
    expect(game.devices).toEqual(['pad', 'kbm', 'pad', 'kbm']);
  });

  it('opens the party ring on F, points with the mouse and picks on release', () => {
    const { hub, game, key } = setup();
    game.sectors.party = ['follow', 'assist', 'passive', 'stay'].map((id) => ({ id, label: id }));
    key({ code: 'KeyF' });
    expect(hub.radial?.ring).toBe('party');
    // four sectors: up, right, down, left; point right of the centre (500, 300)
    hub.pointer(700, 300, 0);
    expect(hub.radial?.highlight).toBe(1);
    key({ code: 'KeyF' }, 'up');
    expect(game.chosen).toEqual(['party:assist']);
    expect(hub.radial).toBeNull();
    expect(game.ringOpenLog).toEqual([true, false]);
  });
});

describe('gamepad through the action layer', () => {
  it('fires a plain button on press and a waiting button by tap or hold', () => {
    const { game, set, frame, tap, hold } = setup();
    set('a', true);
    frame();
    expect(game.actions).toEqual(['field.interact@pad']);
    set('a', false);
    frame();
    // LB waits: a tap is the previous target, a long press opens the party ring
    tap('lb');
    expect(game.actions.at(-1)).toBe('field.target_prev@pad');
    // Y: tap does nothing in the field, a hold resets the camera
    hold('y');
    expect(game.actions.at(-1)).toBe('field.camera_reset@pad');
    set('y', false);
    frame();
    expect(game.actions.filter((a) => a.startsWith('field.camera_reset')).length).toBe(1);
  });

  it('a combo fires on press and suppresses the modifier tap (LB+RB mount, View+Start pause)', () => {
    const { game, set, frame } = setup();
    set('lb', true);
    frame();
    set('rb', true);
    frame();
    set('rb', false);
    set('lb', false);
    frame();
    expect(game.actions).toEqual(['field.mount@pad']);
    set('view', true);
    frame();
    set('start', true);
    frame();
    set('start', false);
    set('view', false);
    frame();
    expect(game.actions).toEqual(['field.mount@pad', 'field.pause@pad']);
  });

  it('turns cluster buttons into hotbar slots under LT, RT and both', () => {
    const { game, set, frame, tap } = setup();
    set('lt', true);
    frame();
    tap('left');
    tap('a');
    set('rt', true);
    frame();
    tap('up');
    set('lt', false);
    frame();
    tap('x');
    set('rt', false);
    frame();
    expect(game.actions).toEqual([
      'field.hotbar_1@pad',
      'field.hotbar_8@pad',
      'field.hotbar_18@pad',
      'field.hotbar_13@pad',
    ]);
  });

  it('opens a ring on a long press, points with a stick and picks on release; centre cancels', () => {
    const { hub, game, set, frame, hold, axes } = setup();
    game.sectors.windows = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id }));
    hold('view');
    expect(hub.radial?.ring).toBe('windows');
    axes[0] = 0;
    axes[1] = 1;
    frame();
    expect(hub.radial?.highlight).toBe(2);
    set('view', false);
    frame();
    expect(game.chosen).toEqual(['windows:c']);
    // the View tap (map) did not fire after the long press
    expect(game.actions).not.toContain('field.win_map@pad');
    axes[1] = 0;
    hold('view');
    set('view', false);
    frame();
    expect(game.chosen).toEqual(['windows:c']);
    expect(hub.radial).toBeNull();
  });

  it('keeps a ring open with hold-to-toggle: A picks, B cancels (18.5)', () => {
    const { hub, game, set, frame, hold, tap, axes } = setup(true);
    game.sectors.items = [{ id: 'potion', label: 'p' }];
    hold('down');
    set('down', false);
    frame();
    expect(hub.radial?.ring).toBe('items');
    axes[1] = -1;
    frame();
    tap('a');
    expect(game.chosen).toEqual(['items:potion']);
    axes[1] = 0;
    hold('down');
    set('down', false);
    frame();
    tap('b');
    expect(hub.radial).toBeNull();
    expect(game.chosen).toEqual(['items:potion']);
  });

  it('types into a free-text field with the floating keyboard', () => {
    const { hub, game, tap } = setup();
    game.surf = { ...game.surf, scene: 'input' };
    game.text = { prompt: 'name', maxLength: 2 };
    tap('a');
    expect(hub.osk?.page).toBe('han');
    tap('a');
    tap('right');
    tap('a');
    tap('right');
    tap('a');
    // the maximum length holds
    expect(hub.osk?.text).toBe('甲乙');
    tap('b');
    expect(hub.osk?.text).toBe('甲');
    tap('start');
    expect(game.submitted).toEqual(['甲']);
    expect(hub.osk).toBeNull();
    // no free-text field: Y opens nothing; B on an empty field closes without submitting
    game.text = null;
    tap('y');
    expect(hub.osk).toBeNull();
    game.text = { prompt: 'say', maxLength: 200 };
    game.surf = { ...game.surf, scene: null, talk: true };
    tap('y');
    expect(hub.osk).not.toBeNull();
    tap('b');
    expect(hub.osk).toBeNull();
    expect(game.submitted).toEqual(['甲']);
  });

  it('walks with the left stick in 8 directions and orbits with the right one', () => {
    const { game, frame, axes } = setup();
    axes[0] = 0.9;
    axes[1] = -0.9;
    frame();
    expect(game.intents.at(-1)).toEqual({ dx: 1, dy: -1 });
    axes[0] = 0.1;
    axes[1] = 0.1;
    frame();
    expect(game.intents.at(-1)).toEqual({ dx: 0, dy: 0 });
    axes[2] = 1;
    frame(100);
    expect(game.orbits.length).toBe(1);
    expect(game.orbits[0]?.[0]).toBeGreaterThan(0);
  });

  it('L3 plus the right stick zooms and turns instead of orbiting', () => {
    const { game, set, frame, axes } = setup();
    set('l3', true);
    frame();
    axes[3] = -1;
    frame();
    axes[3] = 0;
    frame();
    axes[2] = 1;
    frame();
    axes[2] = 0;
    set('l3', false);
    frame();
    expect(game.actions).toEqual(['field.zoom_in@pad', 'field.camera_turn_right@pad']);
    expect(game.orbits).toEqual([]);
  });

  it('moves the window focus and runs window actions with a window open', () => {
    const { game, ui, tap, frame, axes } = setup();
    game.surf = { ...game.surf, windows: true };
    tap('down');
    tap('a');
    tap('rb');
    tap('x');
    axes[3] = 1;
    frame(50);
    expect(ui.log).toEqual(['focus:down', 'activate', 'tab:1', 'action:context_menu', 'scroll:1']);
    tap('start');
    tap('b');
    expect(game.actions).toEqual(['global.menu@pad', 'global.back@pad']);
  });

  it('keeps field bindings out of an open window: the window owns every button', () => {
    const { game, ui, set, frame, tap, hold } = setup();
    game.sectors.items = [{ id: 'potion', label: 'p' }];
    game.sectors.party = [{ id: 'follow', label: 'f' }];
    game.surf = { ...game.surf, windows: true };
    // d-pad down fires on press and repeats (no item ring under it)
    set('down', true);
    frame();
    frame(450);
    frame(150);
    set('down', false);
    frame();
    expect(ui.log.filter((x) => x === 'focus:down').length).toBeGreaterThanOrEqual(2);
    // LB, View, X and a long Y never reach the field
    hold('lb');
    set('lb', false);
    frame();
    tap('view');
    tap('x');
    hold('y');
    set('y', false);
    frame();
    expect(game.actions).toEqual([]);
    expect(game.chosen).toEqual([]);
    expect(ui.log).toContain('tab:-1');
  });

  it('gives an open conversation the stick and the d-pad (no walking, no item ring)', () => {
    const { game, frame, set, axes } = setup();
    game.sectors.items = [{ id: 'potion', label: 'p' }];
    game.surf = { ...game.surf, talk: true, conversation: true };
    axes[1] = -1;
    frame();
    axes[1] = 0;
    frame();
    set('down', true);
    frame();
    expect(game.actions).toEqual(['dialogue.option_prev@pad', 'dialogue.option_next@pad']);
    expect(game.intents).toEqual([]);
    // a loose line alone leaves walking to the stick
    set('down', false);
    game.surf = { ...game.surf, conversation: false };
    axes[1] = -1;
    frame();
    expect(game.intents.at(-1)).toEqual({ dx: 0, dy: -1 });
  });

  it('pauses once while View and Start stay held, even when pausing releases input', () => {
    const { game, hub, set, frame } = setup();
    // the session releases all input when it pauses (GameSession.togglePause)
    game.action = (context, action, device) => {
      game.actions.push(`${context}.${action}@${device}`);
      if (action === 'pause') hub.releaseAll();
      return true;
    };
    set('view', true);
    frame();
    set('start', true);
    for (let i = 0; i < 5; i++) frame();
    set('start', false);
    set('view', false);
    frame();
    expect(game.actions).toEqual(['field.pause@pad']);
  });

  it('ignores a button already held when it starts (the A that began the game)', () => {
    const game = new FakeGame();
    const hub = new InputHub(
      game,
      new FakeUi(),
      () => '',
      () => 'more',
    );
    const held = PAD_BUTTONS.map((b) => (b === 'a' ? 1 : 0));
    const snap = (buttons: number[]): PadSnapshot => ({ id: 'x', buttons, axes: [0, 0, 0, 0] });
    hub.consumeHeld(snap(held), 0);
    hub.padFrame(snap(held), 16);
    hub.padFrame(snap(held.map(() => 0)), 32);
    expect(game.actions).toEqual([]);
    hub.padFrame(snap(held), 48);
    expect(game.actions).toEqual(['field.interact@pad']);
  });

  it('follows the confirm and back swap in the overlays', () => {
    const { hub, game, tap } = setup();
    hub.configure(
      DEFAULT_CONTEXT_KEYMAP,
      resolvePadKeymap({}, { swapConfirmBack: true }),
      { ...defaultInputSettings(), swapConfirmBack: true },
      false,
    );
    expect([hub.confirmButton, hub.backButton]).toEqual(['b', 'a']);
    game.surf = { ...game.surf, scene: 'input' };
    game.text = { prompt: 'name', maxLength: 4 };
    tap('b');
    expect(hub.osk).not.toBeNull();
    tap('b');
    expect(hub.osk?.text).toBe('甲');
    tap('a');
    expect(hub.osk?.text).toBe('');
    tap('a');
    expect(hub.osk).toBeNull();
    expect(game.submitted).toEqual([]);
  });

  it('closes the floating keyboard when its field goes away', () => {
    const { hub, game, tap, frame } = setup();
    game.surf = { ...game.surf, scene: 'input' };
    game.text = { prompt: 'name', maxLength: 4 };
    tap('a');
    expect(hub.osk).not.toBeNull();
    game.text = null;
    frame();
    expect(hub.osk).toBeNull();
  });

  it('latches a hotbar layer with a tap under hold-to-toggle (18.5)', () => {
    const { game, hub, tap } = setup(true);
    tap('lt');
    expect(hub.layers).toEqual({ a: true, b: false });
    tap('left');
    tap('up');
    tap('lt');
    expect(hub.layers).toEqual({ a: false, b: false });
    tap('left');
    expect(game.actions).toEqual([
      'field.hotbar_1@pad',
      'field.hotbar_2@pad',
      'field.party_prev@pad',
    ]);
  });

  it('removes the virtual cursor when placement ends', () => {
    const { hub, game, tap, frame, axes } = setup();
    tap('x');
    game.surf = { ...game.surf, placing: true };
    axes[0] = 1;
    frame(50);
    axes[0] = 0;
    expect(hub.cursor).not.toBeNull();
    game.surf = { ...game.surf, placing: false };
    frame();
    expect(hub.cursor).toBeNull();
  });

  it('steers the virtual cursor while placing and clicks under it with A', () => {
    const { hub, ui, game, tap, frame, axes } = setup();
    tap('x');
    game.surf = { ...game.surf, placing: true };
    axes[0] = 1;
    frame(100);
    axes[0] = 0;
    frame();
    expect(hub.cursor?.x).toBeGreaterThan(500);
    tap('a');
    expect(ui.clicks.length).toBe(1);
    expect(ui.clicks[0]?.[0]).toBe(hub.cursor?.x);
    tap('b');
    expect(game.actions.at(-1)).toBe('global.back@pad');
  });
});
