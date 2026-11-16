// Player input to game commands: movement intents (held while a scene plays or while the
// player cannot move), clicks (select, interact, walk, place buildings), the hotbar, the
// interaction key, appraisal, Tab targeting, Esc layering, dialogue and scene keys.
// Thin glue over the session; the rules live in the adapters and pure input modules.

import { t } from '../../shared_ui/i18n';
import { screenIntentToWorld } from '../hd2d/view';
import type { DialogueQueue } from '../hud/dialogue_queue';
import type { Hud } from '../hud/hud';
import { sceneKey, scenePanelModel } from '../hud/scene_model';
import { type Action, type Binding, type Intent, isZero } from '../input/keymap';
import { nearestExit, nextTarget } from '../input/picking';
import type { ClientAdapters } from '../view/adapters';
import type { ClientCommand, GameView } from '../view/game_view';
import type { WindowId, WindowManager } from '../windows';
import type { FixedStepClock } from './clock';

export interface PlayerInputHost {
  readonly view: GameView;
  readonly adapters: ClientAdapters;
  readonly hud: Hud;
  readonly windows: WindowManager;
  readonly loose: DialogueQueue;
  readonly clock: FixedStepClock;
  selection: string | null;
  moveTarget: { x: number; y: number; at: number } | null;
  placing: unknown;
  queue(cmds: readonly ClientCommand[] | null | undefined): void;
  logLine(text: string, category?: string): void;
  inScene(): boolean;
  select(id: string | null): void;
  /** camera: zoom by whole steps, turn, toggle street view and overview, reset */
  zoomBy(delta: number): void;
  turnView(dir: 1 | -1): void;
  toggleViewPreset(): void;
  resetView(): void;
  /** the camera yaw in degrees (movement keys are screen-relative) */
  viewYaw(): number;
  togglePause(): void;
  worldPoint(sx: number, sy: number): { x: number; y: number } | null;
  pick(sx: number, sy: number): string | null;
  renderStory(): void;
  cancelPlacement(): void;
  confirmPlacement(): void;
  saveTo(slot: 'quick'): void;
  loadFrom(slot: 'quick'): void;
}

const WINDOW_KEYS: Partial<Record<Action, WindowId>> = {
  inventory: 'inventory',
  character: 'character',
  quests: 'quests',
  doors: 'doors',
  map: 'map',
  debug: 'debug',
};

export class PlayerInput {
  private held: Intent = { dx: 0, dy: 0 };
  private sent: Intent = { dx: 0, dy: 0 };
  private lockedNoted = false;

  constructor(private readonly s: PlayerInputHost) {}

  private get v(): GameView {
    return this.s.view;
  }

  private canMove(): boolean {
    if (this.s.inScene()) return false;
    return this.s.adapters.combat?.canMove(this.v) ?? true;
  }

  /**
   * Send a screen-relative intent, turned into map axes by the camera yaw. The yaw is
   * taken in 15-degree steps, so orbiting the camera while walking sends a new intent
   * only when the walking direction changes noticeably, not on every pointer move.
   */
  private send(i: Intent): void {
    const yaw = Math.round(this.s.viewYaw() / 15) * 15;
    const w = screenIntentToWorld(i.dx, i.dy, yaw);
    if (w.dx === this.sent.dx && w.dy === this.sent.dy) return;
    this.sent = { ...w };
    this.s.queue([
      { kind: 'world.set_intent', data: { entityId: this.v.playerId(), dx: w.dx, dy: w.dy } },
    ]);
  }

  /** The camera turned: re-send a held movement so it keeps its screen direction. */
  viewTurned(): void {
    if (!isZero(this.held) && this.canMove()) this.send(this.held);
  }

  /** Movement keys changed. */
  intent(i: Intent): void {
    this.held = { ...i };
    this.s.moveTarget = null;
    if (!isZero(i) && !this.canMove()) {
      if (!this.lockedNoted && !this.s.inScene()) {
        this.lockedNoted = true;
        this.s.logLine(t('ui.hud.log.cannot_move'), 'warning');
      }
      this.send({ dx: 0, dy: 0 });
      return;
    }
    this.lockedNoted = false;
    this.send(i);
  }

  /** After simulation steps: release a held intent when movement becomes locked, resume after. */
  afterSteps(): void {
    if (this.canMove()) {
      if (!isZero(this.held)) this.send(this.held);
    } else if (!isZero(this.sent)) this.send({ dx: 0, dy: 0 });
  }

  click(sx: number, sy: number, double: boolean): void {
    if (this.s.placing) {
      this.s.confirmPlacement();
      return;
    }
    if (this.s.inScene()) return;
    const id = this.s.pick(sx, sy);
    if (id && id !== this.v.playerId()) {
      this.s.select(id);
      if (double) this.interact();
      return;
    }
    if (!this.canMove()) return;
    const w = this.s.worldPoint(sx, sy);
    const p = this.v.player();
    if (!w || !p) return;
    this.s.queue([
      { kind: 'world.move_to', data: { entityId: p.id, x: w.x, y: w.y, mapId: p.mapId } },
    ]);
    this.sent = { dx: 0, dy: 0 };
    this.s.moveTarget = { x: w.x, y: w.y, at: performance.now() };
  }

  secondary(sx: number, sy: number): void {
    if (this.s.placing) {
      this.s.cancelPlacement();
      return;
    }
    if (this.s.inScene()) return;
    const id = this.s.pick(sx, sy);
    if (id && id !== this.v.playerId()) {
      this.s.select(id);
      this.interact();
    }
  }

  hotbar(slot: number): void {
    this.s.hud.hotbar.flash(slot);
    const combat = this.s.adapters.combat;
    if (!combat) {
      this.s.logLine(t('ui.hud.log.hotbar_pending'));
      return;
    }
    const res = combat.activateSlot(this.v, slot, this.s.selection);
    if (typeof res === 'string') this.s.logLine(res, 'warning');
    else this.s.queue(res);
  }

  interact(): void {
    const v = this.v;
    const ia = this.s.adapters.interact;
    if (ia && this.s.selection) {
      const cmds = ia.interact(v, this.s.selection);
      if (cmds) {
        this.s.queue(cmds);
        return;
      }
    }
    const p = v.player();
    const map = v.currentMap();
    if (p && map) {
      const exit = nearestExit(map, p);
      if (exit) {
        this.s.queue([{ kind: 'world.use_exit', data: { entityId: p.id, exitId: exit.id } }]);
        return;
      }
    }
    const cmds = ia?.interact(v, null);
    if (cmds) {
      this.s.queue(cmds);
      return;
    }
    this.s.logLine(t('ui.hud.log.interact_nothing'));
  }

  /** Space or Enter: scene first, then loose lines. */
  advance(): void {
    const sv = this.s.adapters.scene?.scene(this.v);
    if (sv) {
      const act = sceneKey(scenePanelModel(sv), { action: 'advance' });
      if (act?.type === 'advance') this.s.queue(this.s.adapters.scene?.advance(this.v));
      return;
    }
    if (this.s.loose.current) {
      this.s.loose.advance();
      this.s.renderStory();
    }
  }

  closeConversation(): void {
    if (this.s.adapters.conversation?.conversation(this.v)) {
      this.s.queue(this.s.adapters.conversation.close(this.v));
    }
    this.s.loose.close();
    this.s.renderStory();
  }

  action(action: Action, b: Binding): void {
    const s = this.s;
    const a = s.adapters;
    const sv = a.scene?.scene(this.v);
    if (sv && action === 'hotbar') {
      const act = sceneKey(scenePanelModel(sv), { action: 'number', n: b.slot ?? 0 });
      if (act?.type === 'choose') s.queue(a.scene?.choose(this.v, act.choiceId));
      return;
    }
    const conv = a.conversation?.conversation(this.v);
    if (conv && action === 'hotbar') {
      const o = conv.options[(b.slot ?? 0) - 1];
      if (o) s.queue(a.conversation?.choose(this.v, o.id));
      return;
    }
    const win = WINDOW_KEYS[action];
    if (win) {
      s.windows.toggle(win);
      return;
    }
    switch (action) {
      case 'interact':
        if (!sv) this.interact();
        break;
      case 'hotbar':
        this.hotbar(b.slot ?? 1);
        break;
      case 'advance':
        this.advance();
        break;
      case 'menu':
        if (s.placing) s.cancelPlacement();
        else if (s.windows.closeTop()) break;
        else if (sv) break;
        else if (conv || s.loose.current) this.closeConversation();
        else if (s.selection) s.select(null);
        else s.windows.show('menu');
        break;
      case 'zoom_in':
        s.zoomBy(1);
        break;
      case 'zoom_out':
        s.zoomBy(-1);
        break;
      case 'view_turn_left':
        s.turnView(-1);
        break;
      case 'view_turn_right':
        s.turnView(1);
        break;
      case 'view_toggle':
        s.toggleViewPreset();
        break;
      case 'view_reset':
        s.resetView();
        break;
      case 'pause':
        s.togglePause();
        break;
      case 'quick_save':
        s.saveTo('quick');
        break;
      case 'quick_load':
        s.loadFrom('quick');
        break;
      case 'appraise':
        if (s.selection && a.appraise) s.queue(a.appraise.appraise(this.v, s.selection));
        break;
      case 'target_next': {
        const p = this.v.player();
        if (!p) break;
        const next =
          a.combat?.nextEnemy(this.v, s.selection) ??
          nextTarget(this.v.entitiesOnMap(p.mapId), p, s.selection, p.id);
        if (next) s.select(next);
        break;
      }
      default:
        break;
    }
  }
}
