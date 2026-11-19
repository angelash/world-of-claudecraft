// The session's wiring of `ui_mode_creator` (the spirit mirror, ux_and_onboarding.md 3.4.3)
// and of the other interfaces a scene's `ui` effect opens (catalog_cutscenes.md 13.6): while
// the scene waits for 'ui', the mirror opens from the saved look (the effect's storeAs flag) or
// the player's appearance, once the node's lines are read, and closing it sends
// `scenes.ui_done` with the look and its assembled appearance. An interface the client does not
// build yet is closed at once with no result, so a scene never waits on it. Everything comes
// from the scene view; both devices drive the mirror through the `creator` input context
// (contexts.ts, pad_bindings.ts), which takes the input while it is open (3.4.3), so the
// scene behind it never sees a press. Thin glue: the rules are in src/client/hud/creator/.

import type { SceneView } from '../../systems/scenes';
import { installedResolver } from '../assets/runtime';
import { appearanceOf, creatorResult, encodeLook, lookOf } from '../hud/creator/creator_look';
import {
  type CreatorAction,
  type CreatorState,
  creatorReduce,
  creatorView,
  openCreator,
  PREVIEW_DIRS,
} from '../hud/creator/creator_model';
import { CreatorPanel } from '../hud/creator/creator_panel';
import type { InputDevice } from '../input/device';
import { makeCanvas } from '../render/canvas_util';
import { lookFromAppearance, type SpriteLook } from '../sprites/look';
import type { SpriteCache } from '../sprites/sprite_cache';
import type { ClientCommand, GameView } from '../view/game_view';

/** The interface ids of `ui` effects the client builds. */
const BUILT = new Set(['ui_mode_creator']);

/** The preview's size in canvas pixels (the standee frame drawn at four times). */
const PREVIEW = 192;
/**
 * A sent result the scene did not take (the kernel refused it, or the command was lost): the
 * mirror opens again after this long, so the scene never hangs on a closed interface.
 */
const RETRY_MS = 2000;

export interface CreatorWiringDeps {
  view: GameView;
  sprites: SpriteCache;
  queue(cmds: readonly ClientCommand[] | null | undefined): void;
  /** where the mirror's element goes (the story overlay) */
  mount(el: HTMLElement): void;
  /** the chance the mirror's "random" draws from (tests pass their own) */
  random?: () => number;
}

/**
 * The `creator` context's actions (16.3 "灵镜"): the rows and the focused row's options, the
 * pages on the shoulder buttons, the preview's turn, random, restore and "照好了". `random`
 * needs a source of chance, so it is built per press from the caller's `rand`.
 */
export const CREATOR_ACTIONS: Readonly<Record<string, CreatorAction | 'done' | 'random'>> = {
  row_prev: { type: 'row', delta: -1 },
  row_next: { type: 'row', delta: 1 },
  cycle_prev: { type: 'cycle', delta: -1 },
  cycle_next: { type: 'cycle', delta: 1 },
  page_prev: { type: 'page', delta: -1 },
  page_next: { type: 'page', delta: 1 },
  turn_left: { type: 'turn', delta: -1 },
  turn_right: { type: 'turn', delta: 1 },
  randomize: 'random',
  reset_look: { type: 'reset' },
  done: 'done',
};

interface UiWait {
  runId: number;
  revision: number;
  ui: string;
  storeAs: string;
}

export class CreatorWiring {
  private readonly panel: CreatorPanel;
  private state: CreatorState | null = null;
  /** the interface the scene waits on now */
  private wait: UiWait | null = null;
  /** run, revision and interface the mirror was opened for */
  private openFor = '';
  /** the one a result (or an unbuilt interface's close) was sent for, and when */
  private sent = '';
  private sentAt = 0;

  constructor(private readonly d: CreatorWiringDeps) {
    this.panel = new CreatorPanel({
      act: (a) => this.act(a),
      done: () => this.done(),
    });
    d.mount(this.panel.el);
  }

  dispose(): void {
    this.panel.dispose();
  }

  get open(): boolean {
    return !!this.state;
  }

  /**
   * Follow the scene view each frame: open, keep painting, or close the mirror. `linesRead`:
   * the node's lines are all shown (the mirror waits for them, as choices do).
   */
  frame(scene: SceneView | null, linesRead = true): void {
    if (scene?.waiting !== 'ui' || !scene.ui) {
      this.wait = null;
      if (this.state) this.close();
      return;
    }
    const w: UiWait = {
      runId: scene.runId,
      revision: scene.revision,
      ui: scene.ui,
      storeAs: scene.uiStoreAs,
    };
    this.wait = w;
    if (!this.state && !linesRead) return;
    const key = `${w.runId}/${w.revision}/${w.ui}`;
    const now = performance.now();
    if (!BUILT.has(w.ui)) {
      // nothing to show yet (the credits, the carried memories): go on at once
      if (this.sent !== key || now - this.sentAt >= RETRY_MS) {
        this.sent = key;
        this.sentAt = now;
        this.d.queue([
          { kind: 'scenes.ui_done', data: { runId: w.runId, revision: w.revision, ui: w.ui } },
        ]);
      }
      return;
    }
    if (this.sent === key) {
      if (now - this.sentAt < RETRY_MS) return;
      this.sent = '';
      this.openFor = '';
    }
    if (this.openFor !== key) {
      this.openFor = key;
      const saved = w.storeAs ? this.d.view.world.meta.flags[w.storeAs] : undefined;
      const me = this.d.view.entity(this.d.view.playerId());
      this.state = openCreator(lookOf(saved, me?.appearance));
      this.paint();
    }
  }

  private paint(): void {
    const s = this.state;
    if (!s) {
      this.panel.render(null, null);
      return;
    }
    const v = creatorView(s, installedResolver().size > 0);
    const dir = PREVIEW_DIRS[s.facing] ?? 'down';
    const look = lookFromAppearance(appearanceOf(s.look));
    // the whole look names the preview: parts change the picture once their art is in
    this.panel.render(v, () => this.standee(look, dir), `${encodeLook(s.look)}|${dir}`);
  }

  private standee(look: SpriteLook, dir: (typeof PREVIEW_DIRS)[number]): HTMLCanvasElement {
    const { canvas, frame } = this.d.sprites.get(look, 'idle', dir, 0);
    const out = makeCanvas(PREVIEW, PREVIEW);
    const ctx = out.getContext('2d');
    if (!ctx) return out;
    ctx.imageSmoothingEnabled = false;
    const k = Math.max(1, Math.floor(PREVIEW / Math.max(frame.matrix.w, frame.matrix.h)));
    const w = frame.matrix.w * k;
    const h = frame.matrix.h * k;
    const x = (PREVIEW - w) / 2;
    const y = (PREVIEW - h) / 2;
    ctx.drawImage(canvas, 0, 0, frame.matrix.w, frame.matrix.h, x, y, w, h);
    return out;
  }

  act(a: CreatorAction): void {
    if (!this.state) return;
    this.state = creatorReduce(this.state, a);
    this.paint();
  }

  /** "照好了": hand the look to the kernel and close. */
  done(): void {
    const s = this.state;
    const w = this.wait;
    if (!s || !w) return;
    this.sent = this.openFor;
    this.sentAt = performance.now();
    this.d.queue([
      {
        kind: 'scenes.ui_done',
        data: { runId: w.runId, revision: w.revision, ui: w.ui, result: creatorResult(s.look) },
      },
    ]);
    this.close();
  }

  private close(): void {
    this.state = null;
    this.panel.render(null, null);
  }

  /**
   * An input action while the mirror is open; true when the mirror took it. Both devices send
   * the `creator` context's actions (3.4.3); a dialogue action (a scene key still held as the
   * mirror opens) is swallowed, so nothing reaches the scene behind it.
   */
  inputAction(action: string, device: InputDevice): boolean {
    if (!this.state) return false;
    const a = CREATOR_ACTIONS[action];
    // Enter on a focused panel control presses that control (a tab, a cell, "随机"); with the
    // focus elsewhere it says "照好了"
    if (a === 'done' && device === 'kbm' && this.panel.activateFocused()) return true;
    if (a === 'done') this.done();
    else if (a === 'random') this.act({ type: 'random', rand: this.d.random ?? Math.random });
    else if (a) this.act(a);
    // an action of another context does nothing over the mirror, and goes no further
    return true;
  }
}
