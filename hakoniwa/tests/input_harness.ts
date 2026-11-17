// Shared driver of the input-layer tests (PK-M1-07): a real no-model game with every system,
// the client's adapters, the event router that feeds loose lines into the conversation box,
// a window manager stand-in that tracks which windows are open, the client's PlayerInput and
// the action layer (InputHub) with a recording UI side. Tests drive it only through
// synthetic gamepad snapshots (pad) and key chords (key), never by queueing commands.

import { createAdapters } from '../src/client/app/adapters_wiring';
import { FixedStepClock } from '../src/client/app/clock';
import { EventRouter } from '../src/client/app/event_router';
import { PlayerInput, type PlayerInputHost } from '../src/client/app/player_input';
import { DialogueQueue } from '../src/client/hud/dialogue_queue';
import { DEFAULT_CONTEXT_KEYMAP, type KeyChord } from '../src/client/input/contexts';
import type { PadSnapshot } from '../src/client/input/gamepad';
import { InputHub, type UiSink } from '../src/client/input/input_hub';
import { defaultInputSettings, type InputSettings } from '../src/client/input/input_settings';
import { DEFAULT_PAD_KEYMAP, PAD_BUTTONS, type PadButton } from '../src/client/input/pad_bindings';
import { AnimTracker } from '../src/client/render/anim_state';
import { BubbleBoard } from '../src/client/render/bubbles';
import { FloatingBoard } from '../src/client/render/floating_text';
import { createGameCommands, createGameView } from '../src/client/view/game_view';
import type { WindowId } from '../src/client/windows/window_registry';
import { createGame } from '../src/game/create';
import { t } from '../src/shared_ui/i18n';
import { SEED } from './playthrough/harness';

/** A gamepad in the standard mapping whose buttons and sticks the test sets. */
export class VirtualPad {
  buttons = new Array<number>(17).fill(0);
  axes = [0, 0, 0, 0];
  snapshot(): PadSnapshot {
    return {
      id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)',
      buttons: [...this.buttons],
      axes: [...this.axes],
    };
  }
  set(button: PadButton, down: boolean): void {
    this.buttons[PAD_BUTTONS.indexOf(button)] = down ? 1 : 0;
  }
}

/** Records what the UI side was asked to do. */
export class RecordingUi implements UiSink {
  log: string[] = [];
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
  scroll() {}
  cursorClick() {}
  cursorMoved() {}
  hideUi() {
    this.log.push('hide');
  }
  fullscreen() {}
  viewport() {
    return { w: 1280, h: 720 };
  }
  changed() {}
}

export function inputHarness(settings: Partial<InputSettings> = {}) {
  const engine = createGame({ seed: SEED, aiMode: 'off' });
  const view = createGameView(engine);
  const commands = createGameCommands(engine);
  const adapters = createAdapters();
  const loose = new DialogueQueue();
  const open: WindowId[] = [];
  const sent: Record<string, number> = {};
  const log: string[] = [];
  const timeScales: number[] = [];
  const windows: PlayerInputHost['windows'] = {
    toggle: (id) => {
      const i = open.indexOf(id);
      if (i >= 0) open.splice(i, 1);
      else open.push(id);
    },
    show: (id) => {
      if (!open.includes(id)) open.push(id);
      return true;
    },
    closeTop: () => open.pop() !== undefined,
    closeAll: () => {
      open.length = 0;
    },
    get anyOpen() {
      return open.length > 0;
    },
    available: () => true,
    isOpen: (id) => open.includes(id),
  };
  const host: PlayerInputHost = {
    view,
    adapters,
    hud: { hotbar: { flash: () => {} } } as unknown as PlayerInputHost['hud'],
    windows,
    loose,
    clock: new FixedStepClock(),
    selection: null,
    moveTarget: null,
    placing: null,
    queue: (cmds) => {
      for (const c of cmds ?? []) sent[c.kind] = (sent[c.kind] ?? 0) + 1;
      if (cmds?.length) commands.queueAll(cmds);
    },
    logLine: (text) => log.push(text),
    inScene: () => !!adapters.scene?.scene(view),
    select(id) {
      host.selection = id;
      host.queue(adapters.combat?.selectTarget(view, id));
    },
    zoomBy: () => {},
    turnView: () => {},
    toggleViewPreset: () => {},
    resetView: () => {},
    orbitView: () => {},
    viewYaw: () => 0,
    togglePause: () => {},
    stepSpeed: () => {},
    setTimeScale: (s) => timeScales.push(s),
    worldPoint: () => null,
    pick: () => null,
    renderStory: () => {},
    cancelPlacement: () => {
      host.placing = null;
    },
    confirmPlacement: () => {},
    saveTo: () => {},
    loadFrom: () => {},
  };
  const player = new PlayerInput(host);
  const ui = new RecordingUi();
  const hub = new InputHub(
    player,
    ui,
    () => t('ui.pop.osk.han_page'),
    () => t('ui.hud.wheel.more'),
  );
  const input = { ...defaultInputSettings(), ...settings };
  hub.configure(DEFAULT_CONTEXT_KEYMAP, DEFAULT_PAD_KEYMAP, input, false);
  player.configure(input);
  // the session's event router: loose lines reach the conversation box
  const router = new EventRouter(
    view,
    adapters,
    new BubbleBoard(),
    loose,
    new AnimTracker(),
    new FloatingBoard(),
    {
      log: () => {},
      banner: () => {},
      storyChanged: () => {},
      playerMapChanged: () => {},
      featuresChanged: () => {},
      openWindow: (id) => windows.show(id),
      closeWindow: () => {},
    },
  );
  let now = 0;
  engine.onEvents((events) => router.handle(events, now));
  const pad = new VirtualPad();
  /** One 50 ms frame: poll the pad, run one tick, let the input catch up. */
  const frame = () => {
    now += 50;
    hub.padFrame(pad.snapshot(), now);
    engine.step(1);
    player.afterSteps();
  };
  const tap = (b: PadButton) => {
    pad.set(b, true);
    frame();
    pad.set(b, false);
    frame();
  };
  /** A key press and release with one frame in between (no pad snapshot). */
  const keyFrame = () => {
    now += 50;
    engine.step(1);
    player.afterSteps();
  };
  const press = (c: KeyChord) => {
    hub.key(c, 'down');
    keyFrame();
    hub.key(c, 'up');
    keyFrame();
  };
  return {
    engine,
    view,
    adapters,
    host,
    player,
    hub,
    ui,
    pad,
    open,
    loose,
    sent,
    log,
    timeScales,
    frame,
    tap,
    press,
    keyFrame,
  };
}

export type InputHarness = ReturnType<typeof inputHarness>;

/** The nearest living monster on the player's map, and its distance. */
export function nearestMonster(h: InputHarness) {
  const w = h.engine.world.slices.world;
  const me = w.entities[w.playerId];
  if (!me) return null;
  let best: { id: string; x: number; y: number; d: number } | null = null;
  for (const e of Object.values(w.entities)) {
    if (e.kind !== 'monster' || !e.alive || e.mapId !== me.mapId) continue;
    const d = Math.hypot(e.x - me.x, e.y - me.y);
    if (!best || d < best.d) best = { id: e.id, x: e.x, y: e.y, d };
  }
  return best ? { ...best, dx: (best.x - me.x) / best.d, dy: (best.y - me.y) / best.d } : null;
}
