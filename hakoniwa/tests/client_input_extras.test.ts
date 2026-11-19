// Input extras of PK-M1-23 (ux_and_onboarding.md 3.4.3, 5.2, 7.3, 8.2, 16.3, 16.5, 18.5): the
// spirit mirror's own input context (the stack, the bindings of both devices, every action
// reaching the mirror), the party order ring for one companion (opened from a party frame,
// or through the whole-party ring's "single order" and the members ring), the mouse picking
// a ring opened from the HUD, the AI mark on a long Y (a tap stays free input), the held
// fast-forward key read as state, and the global read table with the fast-forward rule.

import { describe, expect, it } from 'vitest';
import {
  READ_LOG_KEY,
  READ_LOG_LIMIT,
  ReadLog,
  sceneLineId,
  skipAllowed,
  skipReadAllowed,
  talkLineId,
} from '../src/client/app/read_log';
import { contextStack, IDLE_SURFACE, type InputSurface } from '../src/client/input/actions';
import { cardButtons, cardPadAnswer } from '../src/client/input/card_pad';
import {
  DEFAULT_CONTEXT_KEYMAP,
  type InputContext,
  type KeyChord,
  keymapConflicts,
} from '../src/client/input/contexts';
import type { PadSnapshot } from '../src/client/input/gamepad';
import {
  type GameSink,
  HELD_ACTIONS,
  heldNow,
  InputHub,
  RING_OPENER_POINTER,
  type RingFollow,
  type UiSink,
} from '../src/client/input/input_hub';
import { defaultInputSettings } from '../src/client/input/input_settings';
import type { Intent } from '../src/client/input/keymap';
import {
  DEFAULT_PAD_KEYMAP,
  PAD_BUTTONS,
  type PadButton,
  padCoverageGaps,
  padKeymapConflicts,
  type RingId,
  resolvePadKeymap,
} from '../src/client/input/pad_bindings';
import {
  PARTY_MEMBERS,
  PARTY_RING_ORDERS,
  PARTY_SINGLE,
  type PartyRingMember,
  partyRingMembers,
  partyRingPick,
  partyRingSectors,
  partyRingTitle,
} from '../src/client/input/party_ring';
import type { RingSector } from '../src/client/input/radial';
import { t } from '../src/shared_ui/i18n';

const MEMBERS: PartyRingMember[] = [
  { id: 'yeyu', name: 'Y' },
  { id: 'shiya', name: 'S' },
];

/** A game sink whose party ring is the real party_ring.ts over MEMBERS. */
class Game implements GameSink {
  surf: InputSurface = { ...IDLE_SURFACE };
  actions: string[] = [];
  orders: string[] = [];
  members: PartyRingMember[] = MEMBERS;
  text: { prompt: string; maxLength: number } | null = null;
  surface() {
    return this.surf;
  }
  intent(_i: Intent) {}
  action(context: InputContext, action: string, device: string) {
    this.actions.push(`${context}.${action}@${device}`);
    return true;
  }
  orbit() {}
  textTarget() {
    return this.text;
  }
  submitText() {}
  ringSectors(ring: RingId, target?: string): RingSector[] {
    return ring === 'party' ? partyRingSectors(this.members, target) : [];
  }
  ringChoose(ring: RingId, id: string, target?: string): RingFollow | undefined {
    if (ring !== 'party') return undefined;
    const p = partyRingPick(this.members, id, target);
    if (p.type === 'next') return { ring: 'party', target: p.target };
    if (p.type === 'order') this.orders.push(`${p.companionId ?? '*'}:${p.order}`);
    return undefined;
  }
  ringTitle(ring: RingId, target?: string) {
    return ring === 'party' ? partyRingTitle(this.members, target) : undefined;
  }
  ringOpen() {}
  deviceChanged() {}
}

class Ui implements UiSink {
  focusMove() {
    return false;
  }
  focusActivate() {
    return false;
  }
  focusAction() {
    return false;
  }
  tab() {
    return false;
  }
  page() {
    return false;
  }
  scroll() {}
  cursorClick() {}
  cursorMoved() {}
  hideUi() {}
  fullscreen() {}
  viewport() {
    return { w: 1000, h: 600 };
  }
  changed() {}
}

function setup(
  holdToToggle = false,
  kbm: typeof DEFAULT_CONTEXT_KEYMAP = DEFAULT_CONTEXT_KEYMAP,
  pad: typeof DEFAULT_PAD_KEYMAP = DEFAULT_PAD_KEYMAP,
) {
  const game = new Game();
  const hub = new InputHub(
    game,
    new Ui(),
    () => '甲乙',
    () => 'more',
  );
  hub.configure(kbm, pad, defaultInputSettings(), holdToToggle);
  const buttons = new Array<number>(17).fill(0);
  const axes = [0, 0, 0, 0];
  let now = 0;
  const snap = (): PadSnapshot => ({ id: 'Xbox (045e)', buttons: [...buttons], axes: [...axes] });
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
  const hold = (b: PadButton, ms = 700) => {
    set(b, true);
    frame();
    frame(ms);
  };
  const key = (c: KeyChord, phase: 'down' | 'up' = 'down') => hub.key(c, phase);
  return { game, hub, set, frame, tap, hold, axes, key };
}

describe('the spirit mirror input context (3.4.3, 16.3, 18.5)', () => {
  it('takes every input but global while the mirror is open, over its scene', () => {
    const s = { ...IDLE_SURFACE, scene: 'resolve' as const, creator: true };
    expect(contextStack(s, 'kbm')).toEqual(['creator', 'global']);
    expect(contextStack(s, 'pad')).toEqual(['creator', 'global']);
    expect(contextStack({ ...s, creator: false }, 'pad')).toEqual(['dialogue', 'global']);
  });

  it('binds every mirror action on both devices, conflict-free, with Tab left for focus', () => {
    const kbm = DEFAULT_CONTEXT_KEYMAP.creator;
    const pad = DEFAULT_PAD_KEYMAP.creator;
    expect(Object.keys(kbm).sort()).toEqual(Object.keys(pad).sort());
    expect(Object.keys(kbm).sort()).toEqual([
      'cycle_next',
      'cycle_prev',
      'done',
      'page_next',
      'page_prev',
      'randomize',
      'reset_look',
      'row_next',
      'row_prev',
      'turn_left',
      'turn_right',
    ]);
    for (const b of Object.values(kbm)) {
      expect(b.primary?.code).not.toBe('Tab');
      expect(b.secondary?.code).not.toBe('Tab');
    }
    expect(keymapConflicts(DEFAULT_CONTEXT_KEYMAP)).toEqual([]);
    expect(padKeymapConflicts(DEFAULT_PAD_KEYMAP)).toEqual([]);
    expect(padKeymapConflicts(resolvePadKeymap({}, { swapConfirmBack: true }))).toEqual([]);
    expect(padCoverageGaps()).toEqual([]);
    // the pad layout the package asked for: shoulders page, X random, Y restore, A done
    expect(pad.page_prev?.primary).toEqual({ kind: 'button', chord: { button: 'lb' } });
    expect(pad.page_next?.primary).toEqual({ kind: 'button', chord: { button: 'rb' } });
    expect(pad.randomize?.primary).toEqual({ kind: 'button', chord: { button: 'x' } });
    expect(pad.reset_look?.primary).toEqual({ kind: 'button', chord: { button: 'y' } });
    expect(pad.done?.primary).toEqual({ kind: 'button', chord: { button: 'a' } });
  });

  it('routes both devices to creator actions, and the scene behind sees nothing', () => {
    const { game, tap, key, frame } = setup();
    game.surf = { ...IDLE_SURFACE, scene: 'resolve', creator: true };
    frame();
    tap('lb');
    tap('rb');
    tap('x');
    tap('y');
    tap('left');
    tap('up');
    tap('lt');
    tap('a');
    key({ code: 'ArrowRight' });
    key({ code: 'KeyQ' });
    key({ code: 'Delete' });
    key({ code: 'Enter' });
    key({ code: 'Space' });
    expect(game.actions).toEqual([
      'creator.page_prev@pad',
      'creator.page_next@pad',
      'creator.randomize@pad',
      'creator.reset_look@pad',
      'creator.cycle_prev@pad',
      'creator.row_prev@pad',
      'creator.turn_left@pad',
      'creator.done@pad',
      'creator.cycle_next@kbm',
      'creator.turn_left@kbm',
      'creator.reset_look@kbm',
      'creator.done@kbm',
    ]);
    // Tab binds nothing here: the browser moves the focus to the panel's buttons
    expect(key({ code: 'Tab' })).toBe(false);
  });

  it('maps every mirror action to the mirror (creator_wiring.ts CREATOR_ACTIONS)', async () => {
    const { CREATOR_ACTIONS } = await import('../src/client/app/creator_wiring');
    for (const a of Object.keys(DEFAULT_CONTEXT_KEYMAP.creator))
      expect(CREATOR_ACTIONS[a], a).toBeDefined();
    expect(CREATOR_ACTIONS.turn_left).toEqual({ type: 'turn', delta: -1 });
    expect(CREATOR_ACTIONS.reset_look).toEqual({ type: 'reset' });
    expect(CREATOR_ACTIONS.done).toBe('done');
  });

  it('labels the context and every mirror action', () => {
    expect(t('ui.set.controls.context.creator_label')).not.toMatch(/^ui\./);
    for (const a of Object.keys(DEFAULT_CONTEXT_KEYMAP.creator))
      expect(t(`ui.set.controls.action.${a}`), a).not.toMatch(/^ui\./);
  });
});

describe('the party order ring for one companion (5.2, 16.5)', () => {
  it('builds the whole-party, members and one-member rings', () => {
    const whole = partyRingSectors(MEMBERS);
    expect(whole.map((s) => s.id)).toEqual([...PARTY_RING_ORDERS, PARTY_SINGLE]);
    expect(partyRingSectors(MEMBERS, PARTY_MEMBERS).map((s) => s.id)).toEqual(['yeyu', 'shiya']);
    expect(partyRingSectors(MEMBERS, 'shiya').map((s) => s.id)).toEqual([...PARTY_RING_ORDERS]);
    // one companion: no "whom" step; nobody: no ring; a member no longer here: no ring
    expect(partyRingSectors([MEMBERS[0] as PartyRingMember]).map((s) => s.id)).toEqual([
      ...PARTY_RING_ORDERS,
    ]);
    expect(partyRingSectors([])).toEqual([]);
    expect(partyRingSectors(MEMBERS, 'ron')).toEqual([]);
    expect(partyRingTitle(MEMBERS)).toBeUndefined();
    expect(partyRingTitle(MEMBERS, 'shiya')).toBe(
      t('ui.hud.wheel.party.orders_for', { name: 'S' }),
    );
    expect(partyRingTitle(MEMBERS, PARTY_MEMBERS)).toBe(t('ui.hud.wheel.party.pick_member'));
  });

  it('names members through the content table, the view name as fallback', () => {
    // a companion with a content record takes its name from the table, not the view's string
    expect(partyRingMembers([{ id: 'ron', name: 'raw' }])[0]?.name).toBe(
      t('c.companions.ron.name' as never),
    );
    expect(partyRingMembers([{ id: 'ron', name: 'raw' }])[0]?.name).not.toBe('raw');
    const named = partyRingMembers([
      { id: 'no_such_companion', name: 'Fallback' },
      { id: 'blank', name: '' },
    ]);
    expect(named).toEqual([
      { id: 'no_such_companion', name: 'Fallback' },
      { id: 'blank', name: 'blank' },
    ]);
  });

  it('answers an order for the party or one member, or the next ring', () => {
    expect(partyRingPick(MEMBERS, 'assist')).toEqual({ type: 'order', order: 'assist' });
    expect(partyRingPick(MEMBERS, 'stay', 'yeyu')).toEqual({
      type: 'order',
      order: 'stay',
      companionId: 'yeyu',
    });
    expect(partyRingPick(MEMBERS, PARTY_SINGLE)).toEqual({ type: 'next', target: PARTY_MEMBERS });
    expect(partyRingPick(MEMBERS, 'shiya', PARTY_MEMBERS)).toEqual({
      type: 'next',
      target: 'shiya',
    });
    expect(partyRingPick(MEMBERS, 'dance')).toEqual({ type: 'none' });
    expect(partyRingPick(MEMBERS, 'follow', 'ron')).toEqual({ type: 'none' });
    expect(partyRingPick([MEMBERS[0] as PartyRingMember], PARTY_SINGLE)).toEqual({
      type: 'none',
    });
  });

  it('opens a member ring from the HUD: the mouse points, a click picks, right click cancels', () => {
    const { game, hub } = setup();
    expect(hub.openRing('party', RING_OPENER_POINTER, 'shiya')).toBe(true);
    expect(hub.radial?.target).toBe('shiya');
    expect(hub.radial?.sticky).toBe(true);
    expect(hub.radial?.title).toBe(t('ui.hud.wheel.party.orders_for', { name: 'S' }));
    // a click with nothing pointed cancels; a right click cancels
    expect(hub.pointerButton(0)).toBe(true);
    expect(hub.radial).toBeNull();
    hub.openRing('party', RING_OPENER_POINTER, 'shiya');
    expect(hub.pointerButton(2)).toBe(true);
    expect(hub.radial).toBeNull();
    // point at sector 2 (straight down of four: "passive") and click
    hub.openRing('party', RING_OPENER_POINTER, 'shiya');
    hub.pointer(500, 300 + 80, 10, 0);
    expect(hub.radial?.highlight).toBe(2);
    expect(hub.pointerButton(0)).toBe(true);
    expect(game.orders).toEqual(['shiya:passive']);
    expect(hub.radial).toBeNull();
    // no ring: the click is the world's
    expect(hub.pointerButton(0)).toBe(false);
    // a member no longer in the party opens nothing
    expect(hub.openRing('party', RING_OPENER_POINTER, 'ron')).toBe(false);
  });

  it('walks "single order", then the member, then the order on the pad', () => {
    const { game, hub, set, frame, axes } = setup();
    // LB long press opens the whole-party ring; point at "single order" (fifth of five)
    set('lb', true);
    frame();
    frame(700);
    expect(hub.radial?.ring).toBe('party');
    expect(hub.radial?.target).toBeUndefined();
    // sector 4 of 5 sits up-left (288 degrees clockwise from the top)
    const a = (4 / 5) * Math.PI * 2;
    axes[0] = Math.sin(a);
    axes[1] = -Math.cos(a);
    frame();
    expect(hub.radial?.highlight).toBe(4);
    axes[0] = 0;
    axes[1] = 0;
    set('lb', false);
    frame();
    // the members ring opened, held open (chain): point at the second member, A picks
    expect(hub.radial?.target).toBe(PARTY_MEMBERS);
    expect(hub.radial?.sticky).toBe(true);
    axes[1] = 1; // down: sector 1 of 2
    frame();
    expect(hub.radial?.highlight).toBe(1);
    axes[1] = 0;
    set('a', true);
    frame();
    set('a', false);
    frame();
    // the member's own ring: point right ("assist", sector 1 of 4) and pick
    expect(hub.radial?.target).toBe('shiya');
    axes[0] = 1;
    frame();
    set('a', true);
    frame();
    set('a', false);
    frame();
    expect(game.orders).toEqual(['shiya:assist']);
    expect(hub.radial).toBeNull();
    // none of these presses acted in the field
    expect(game.actions.filter((x) => x.startsWith('field.'))).toEqual([]);
  });
});

describe('the AI mark on the pad and the keyboard (7.3)', () => {
  it('a long Y opens the mark, a tap stays free input, over the field as in scenes', () => {
    const { game, hub, hold, set, frame, tap, key } = setup();
    game.surf = { ...IDLE_SURFACE, talk: true, conversation: true };
    game.text = { prompt: 'p', maxLength: 200 };
    hold('y');
    set('y', false);
    frame();
    expect(hub.osk).toBeNull();
    // a tap is still free input: the floating keyboard opens on release
    tap('y');
    expect(hub.osk).not.toBeNull();
    hub.closeOsk();
    key({ code: 'KeyY', shift: true });
    game.surf = { ...IDLE_SURFACE, scene: 'advance' };
    hold('y');
    set('y', false);
    frame();
    expect(game.actions).toEqual([
      'dialogue.ai_mark@pad',
      'dialogue.ai_mark@kbm',
      'dialogue.ai_mark@pad',
    ]);
  });
});

describe('the held fast-forward key (8.2)', () => {
  it('has no default binding until the story controller reads the read table', () => {
    expect(DEFAULT_CONTEXT_KEYMAP.dialogue.skip_read).toBeUndefined();
    expect(DEFAULT_PAD_KEYMAP.dialogue.skip_read).toBeUndefined();
  });

  it('is state while held on either device, never an event, and only in scenes', () => {
    // bound the way the controller hook will bind it: Ctrl held, RT held
    const kbm = {
      ...DEFAULT_CONTEXT_KEYMAP,
      dialogue: {
        ...DEFAULT_CONTEXT_KEYMAP.dialogue,
        skip_read: { primary: { code: 'ControlLeft', ctrl: true } },
      },
    };
    const pad = {
      ...DEFAULT_PAD_KEYMAP,
      dialogue: {
        ...DEFAULT_PAD_KEYMAP.dialogue,
        skip_read: { primary: { kind: 'button' as const, chord: { button: 'rt' as const } } },
      },
    };
    const { game, hub, set, frame, key } = setup(false, kbm, pad);
    expect(HELD_ACTIONS.has('dialogue.skip_read')).toBe(true);
    game.surf = { ...IDLE_SURFACE, scene: 'advance' };
    expect(hub.actionHeld('dialogue', 'skip_read')).toBe(false);
    expect(key({ code: 'ControlLeft', ctrl: true })).toBe(true);
    expect(hub.actionHeld('dialogue', 'skip_read')).toBe(true);
    key({ code: 'ControlLeft' }, 'up');
    expect(hub.actionHeld('dialogue', 'skip_read')).toBe(false);
    set('rt', true);
    frame();
    expect(hub.actionHeld('dialogue', 'skip_read')).toBe(true);
    set('rt', false);
    frame();
    expect(hub.actionHeld('dialogue', 'skip_read')).toBe(false);
    expect(game.actions).toEqual([]);
    // over the field (a conversation) it is not live: the field keeps Ctrl and RT
    game.surf = { ...IDLE_SURFACE, talk: true, conversation: true };
    key({ code: 'ControlLeft', ctrl: true });
    expect(hub.actionHeld('dialogue', 'skip_read')).toBe(false);
  });

  it('follows rebinding (the effective keymaps)', () => {
    const codes = new Set(['KeyK']);
    const kbm = {
      ...DEFAULT_CONTEXT_KEYMAP,
      dialogue: { ...DEFAULT_CONTEXT_KEYMAP.dialogue, skip_read: { primary: { code: 'KeyK' } } },
    };
    const src = { kbm, pad: DEFAULT_PAD_KEYMAP, codes, padDown: () => false };
    expect(heldNow(src, 'dialogue', 'skip_read')).toBe(true);
    expect(heldNow({ ...src, kbm: DEFAULT_CONTEXT_KEYMAP }, 'dialogue', 'skip_read')).toBe(false);
  });
});

/** An in-memory page store. */
class Kv {
  data = new Map<string, string>();
  writes = 0;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.writes++;
    this.data.set(k, v);
  }
}

describe('the global read table and the fast-forward rule (8.2, 8.3, 17.8)', () => {
  it('ids scene lines by scene, node and written index; improvised lines have none', () => {
    expect(sceneLineId('cut_p_01', 'n1', 0)).toBe('s|cut_p_01|n1|0');
    expect(sceneLineId('cut_p_01', 'n1', undefined)).toBeNull();
    expect(sceneLineId('cut_p_01', 'n1', -1)).toBeNull();
    expect(talkLineId('ron', 'hello')).toBe(talkLineId('ron', 'hello'));
    expect(talkLineId('ron', 'hello')).not.toBe(talkLineId('ron', 'hello!'));
    expect(talkLineId('ron', '')).toBeNull();
  });

  it('marks, keeps across a reload, writes only when changed, survives a damaged store', () => {
    const kv = new Kv();
    const log = new ReadLog(kv);
    expect(log.mark('s|a|n|0')).toBe(true);
    expect(log.mark('s|a|n|0')).toBe(false);
    expect(log.mark(null)).toBe(false);
    log.flush();
    log.flush();
    expect(kv.writes).toBe(1);
    const again = new ReadLog(kv);
    expect(again.isRead('s|a|n|0')).toBe(true);
    expect(again.isRead('s|a|n|1')).toBe(false);
    expect(again.isRead(null)).toBe(false);
    kv.data.set(READ_LOG_KEY, '{not json');
    expect(new ReadLog(kv).size).toBe(0);
    expect(new ReadLog(null).isRead('x')).toBe(false);
  });

  it('drops the oldest quarter when full, keeping the lines read last', () => {
    const log = new ReadLog(null);
    for (let i = 0; i <= READ_LOG_LIMIT; i++) log.mark(`s|x|n|${i}`);
    expect(log.size).toBe(READ_LOG_LIMIT + 1 - READ_LOG_LIMIT / 4);
    expect(log.isRead('s|x|n|0')).toBe(false);
    expect(log.isRead(`s|x|n|${READ_LOG_LIMIT / 4 - 1}`)).toBe(false);
    expect(log.isRead(`s|x|n|${READ_LOG_LIMIT / 4}`)).toBe(true);
    expect(log.isRead(`s|x|n|${READ_LOG_LIMIT}`)).toBe(true);
  });

  it('runs past read lines only while held, never past a choice, an anchor or a pending reply', () => {
    const log = new ReadLog(null);
    log.mark('s|a|n|0');
    const base = { held: true, waitsForPlayer: false, anchor: false, lineId: 's|a|n|0' };
    expect(skipReadAllowed(log, base)).toBe(true);
    expect(skipReadAllowed(log, { ...base, lineId: 's|a|n|1' })).toBe(false);
    expect(skipReadAllowed(log, { ...base, lineId: null })).toBe(false);
    expect(skipReadAllowed(log, { ...base, held: false })).toBe(false);
    expect(skipReadAllowed(log, { ...base, waitsForPlayer: true })).toBe(false);
    expect(skipReadAllowed(log, { ...base, anchor: true })).toBe(false);
    expect(skipReadAllowed(log, { ...base, pending: true })).toBe(false);
    expect(skipAllowed({ ...base, lineId: null })).toBe(false);
  });
});

describe('the pad on a modal guidance card (17.2, 18.5)', () => {
  const snap = (down: PadButton[]): PadSnapshot => {
    const buttons = new Array<number>(17).fill(0);
    for (const b of down) buttons[PAD_BUTTONS.indexOf(b)] = 1;
    return { id: 'pad', buttons, axes: [0, 0, 0, 0] };
  };

  it('answers on fresh presses only: confirm or back, Y mutes, X expands', () => {
    const none = cardButtons(snap([]), 'a', 'b');
    const a = cardButtons(snap(['a']), 'a', 'b');
    expect(cardPadAnswer(none, a)).toBe('ok');
    expect(cardPadAnswer(none, cardButtons(snap(['b']), 'a', 'b'))).toBe('ok');
    expect(cardPadAnswer(none, cardButtons(snap(['y']), 'a', 'b'))).toBe('mute');
    expect(cardPadAnswer(none, cardButtons(snap(['x']), 'a', 'b'))).toBe('expand');
    // a button already down (the press that led here) answers nothing
    expect(cardPadAnswer(a, a)).toBeNull();
    expect(cardPadAnswer(none, none)).toBeNull();
    expect(cardButtons(null, 'a', 'b')).toEqual(none);
    // swapped confirm and back still answer
    const swapped = cardButtons(snap(['b']), 'b', 'a');
    expect(swapped.confirm).toBe(true);
    expect(cardPadAnswer(cardButtons(snap([]), 'b', 'a'), swapped)).toBe('ok');
  });
});

describe('hold-to-toggle on long presses (18.5)', () => {
  it('opens a door in the corridor on a tap of A, only with hold-to-toggle', () => {
    const off = setup(false);
    off.game.surf = { ...IDLE_SURFACE, corridor: true };
    off.tap('a');
    expect(off.game.actions).toEqual([]);
    off.hold('a');
    expect(off.game.actions).toEqual(['corridor.open_door@pad']);

    const on = setup(true);
    on.game.surf = { ...IDLE_SURFACE, corridor: true };
    on.tap('a');
    expect(on.game.actions).toEqual(['corridor.open_door@pad']);
    // the long press still works, once
    on.hold('a');
    on.set('a', false);
    on.frame();
    expect(on.game.actions).toEqual(['corridor.open_door@pad', 'corridor.open_door@pad']);
  });

  it('keeps a button with a tap of its own as it was (a tap is the tap)', () => {
    const on = setup(true);
    on.game.surf = { ...IDLE_SURFACE, talk: true, conversation: true };
    on.game.text = { prompt: 'p', maxLength: 200 };
    on.tap('y');
    // a tap of Y is free input (the floating keyboard), never the AI mark's long press
    expect(on.hub.osk).not.toBeNull();
    expect(on.game.actions).toEqual([]);
  });
});
