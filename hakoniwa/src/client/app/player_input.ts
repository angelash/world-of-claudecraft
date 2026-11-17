// Player input to game commands: the game side of the action layer (src/client/input/
// input_hub.ts calls it as its GameSink). Movement intents (held while a scene plays or while
// the player cannot move), clicks (select, interact, walk, place buildings), the 24-slot
// hotbar, interaction, appraisal, target cycling and soft targeting (16.4), Esc and B
// layering, dialogue and scene keys with the gamepad's option cursor, the window, item and
// party rings (16.5), and the free-text fields the floating keyboard types into. Thin glue
// over the session; the rules live in the adapters and the pure input modules.

import { t } from '../../shared_ui/i18n';
import { enemiesNear, unitOf } from '../../systems/combat';
import type { PartyOrder } from '../../systems/party';
import { screenIntentToWorld } from '../hd2d/view';
import type { DialogueQueue } from '../hud/dialogue_queue';
import type { Hud } from '../hud/hud';
import { sceneKey, scenePanelModel } from '../hud/scene_model';
import type { InputSurface } from '../input/actions';
import type { InputContext } from '../input/contexts';
import type { InputDevice } from '../input/device';
import type { GameSink, TextTarget } from '../input/input_hub';
import { defaultInputSettings, type InputSettings } from '../input/input_settings';
import { type Intent, isZero } from '../input/keymap';
import type { RingId } from '../input/pad_bindings';
import { nearestExit, nextTarget } from '../input/picking';
import { RING_TIME_SCALE, type RingSector } from '../input/radial';
import {
  cycleTarget,
  hardTargetLost,
  pickSoftTarget,
  SOFT_RANGE,
  type SoftCandidate,
} from '../input/soft_target';
import type { ClientAdapters } from '../view/adapters';
import type { ClientCommand, GameView } from '../view/game_view';
import type { WindowManager } from '../windows/window_manager';
import { type WindowId, windowTitle } from '../windows/window_registry';
import type { FixedStepClock } from './clock';
import type { StoryInputHost } from './story_wiring';

export interface PlayerInputHost {
  readonly view: GameView;
  readonly adapters: ClientAdapters;
  readonly hud: Pick<Hud, 'hotbar'>;
  readonly windows: Pick<
    WindowManager,
    'toggle' | 'show' | 'closeTop' | 'closeAll' | 'anyOpen' | 'available' | 'isOpen'
  > &
    Partial<Pick<WindowManager, 'modeOpen' | 'modeAction'>>;
  readonly loose: DialogueQueue;
  readonly clock: FixedStepClock;
  selection: string | null;
  moveTarget: { x: number; y: number; at: number } | null;
  placing: unknown;
  queue(cmds: readonly ClientCommand[] | null | undefined): void;
  logLine(text: string, category?: string): void;
  /** a light notification (ui_hud_notify 5.4: why a press did nothing; never logged) */
  notifyLight?(text: string): void;
  /** the focus action (ui_hud_focus): the candidate becomes the focus, the same one lets go */
  toggleFocus?(candidate: string | null): boolean;
  inScene(): boolean;
  select(id: string | null): void;
  /** camera: zoom by whole steps, turn, toggle street view and overview, reset, orbit */
  zoomBy(delta: number): void;
  turnView(dir: 1 | -1): void;
  toggleViewPreset(): void;
  resetView(): void;
  orbitView(dx: number, dy: number): void;
  /** the camera yaw in degrees (movement keys are screen-relative) */
  viewYaw(): number;
  togglePause(): void;
  /** one step slower or faster on the 1x, 2x, 4x ladder */
  stepSpeed(dir: 1 | -1): void;
  /** world speed multiplier (a radial menu open in a fight runs the world at 0.3x) */
  setTimeScale(scale: number): void;
  worldPoint(sx: number, sy: number): { x: number; y: number } | null;
  pick(sx: number, sy: number): string | null;
  renderStory(): void;
  cancelPlacement(): void;
  confirmPlacement(): void;
  saveTo(slot: 'quick'): void;
  loadFrom(slot: 'quick'): void;
  /** the dialogue panel and the cutscene player's reading state (absent in tests) */
  readonly story?: StoryInputHost;
}

/** Field actions that toggle a window (16.2); planned windows are not built yet. */
const WINDOW_ACTIONS: Readonly<Record<string, WindowId>> = {
  win_character: 'character',
  win_inventory: 'inventory',
  win_doors: 'doors',
  win_quests: 'quests',
  win_map: 'map',
  win_party: 'party',
  win_rumors: 'rumors',
  win_goddess: 'goddess',
  win_company: 'company',
  win_territory: 'territory',
  win_strategy: 'strategy',
};

/** The window ring (16.5): page one, then the rest once their features open. */
const WINDOW_RING: readonly WindowId[] = [
  'character',
  'inventory',
  'doors',
  'quests',
  'map',
  'party',
  'rumors',
  'goddess',
  'company',
  'territory',
  'strategy',
];

/** The party ring: the orders the party system takes (16.5). */
const PARTY_ORDERS: readonly PartyOrder[] = ['follow', 'assist', 'passive', 'stay'];

/** Target cycling range: the combat adapter's Tab list (CombatAdapter.nextEnemy). */
export const CYCLE_RANGE = 20;

/** At most this many consumables sit on the item ring (16.5). */
export const ITEM_RING_SIZE = 8;

const HOTBAR_ACTION = /^hotbar_(\d+)$/;
const OPTION_ACTION = /^option_(\d)$/;
const PARTY_ACTION = /^select_party_(\d)$/;

type SceneMode = NonNullable<InputSurface['scene']>;

export class PlayerInput implements GameSink {
  private held: Intent = { dx: 0, dy: 0 };
  private sent: Intent = { dx: 0, dy: 0 };
  private lockedNoted = false;
  device: InputDevice = 'kbm';
  private settings: InputSettings = defaultInputSettings();
  /** the soft target (16.4), when soft targeting is on and nothing is hard-targeted */
  softTarget: string | null = null;
  /** the gamepad's option cursor over the scene or conversation choices */
  private option = { key: '', index: 0 };

  constructor(private readonly s: PlayerInputHost) {}

  private get v(): GameView {
    return this.s.view;
  }

  configure(settings: InputSettings): void {
    this.settings = settings;
    this.updateSoftTarget();
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

  // -------------------------------------------------------------------------
  // GameSink

  /** A conversation with someone is open (read straight from the dialogue slice). */
  private conversationOpen(): boolean {
    const w = this.v.world as { slices?: { dialogue?: { session?: unknown } } };
    return !!w.slices?.dialogue?.session;
  }

  /** Cheap: read on every input event and every poll (no text is rendered here). */
  surface(): InputSurface {
    const sv = this.s.adapters.scene?.scene(this.v);
    const conversation = this.conversationOpen();
    return {
      scene: sv ? sceneMode(sv.waiting) : null,
      talk: conversation || !!this.s.loose.current,
      conversation,
      windows: this.s.windows.anyOpen,
      placing: !!this.s.placing,
      corridor: this.s.windows.modeOpen === 'doors',
    };
  }

  /** Movement keys or the left stick changed. */
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

  orbit(dx: number, dy: number): void {
    this.s.orbitView(dx, dy);
  }

  deviceChanged(device: InputDevice): void {
    this.device = device;
    this.updateSoftTarget();
  }

  /** After simulation steps: release a held intent when movement becomes locked, resume after. */
  afterSteps(): void {
    if (this.canMove()) {
      if (!isZero(this.held)) this.send(this.held);
    } else if (!isZero(this.sent)) this.send({ dx: 0, dy: 0 });
    this.updateSoftTarget();
  }

  // -------------------------------------------------------------------------
  // soft targeting (16.4)

  private softOn(): boolean {
    return this.device === 'pad' ? this.settings.softLock : this.settings.softLockKbm;
  }

  /** Enemies the player could pick by hand (the combat system's Tab filter) within `range`. */
  private candidates(range: number): SoftCandidate[] {
    const w = this.v.world as never;
    const me = this.v.playerId();
    const out: SoftCandidate[] = [];
    for (const id of enemiesNear(w, range)) {
      const e = this.v.entity(id);
      if (!e || e.hidden) continue;
      out.push({ id, x: e.x, y: e.y, attacking: unitOf(w, id)?.target === me });
    }
    return out;
  }

  /** Re-pick the soft target; drop a hard target past the leash or dead (soft lock on). */
  updateSoftTarget(): void {
    const p = this.v.player();
    if (!p || !this.softOn() || this.s.inScene()) {
      this.softTarget = null;
      return;
    }
    if (this.s.selection) {
      const sel = this.v.entity(this.s.selection);
      if (hardTargetLost(p, sel)) this.s.select(null);
    }
    this.softTarget = this.s.selection
      ? null
      : pickSoftTarget(p, this.candidates(SOFT_RANGE), this.settings.softCone);
  }

  /** The target an ability or the interact button acts on: hard, else soft. */
  private targetForUse(): string | null {
    return this.s.selection ?? this.softTarget;
  }

  /** Promote the soft target to the hard target (R3, or a cast with lock on cast). */
  private lockSoft(): boolean {
    if (!this.softTarget) return false;
    this.s.select(this.softTarget);
    this.softTarget = null;
    return true;
  }

  private cycle(dir: 1 | -1): void {
    const p = this.v.player();
    if (!p) return;
    const a = this.s.adapters;
    // Tab with soft targeting off keeps the combat adapter's own cycle; every other way
    // walks the same list (the Tab filter and range, nearest first) forward or back
    let next: string | null;
    if (dir === 1 && !this.softOn()) {
      next = a.combat?.nextEnemy(this.v, this.s.selection) ?? null;
    } else {
      next = cycleTarget(p, this.candidates(CYCLE_RANGE), this.s.selection ?? this.softTarget, dir);
    }
    if (!next && dir === 1)
      next = nextTarget(this.v.entitiesOnMap(p.mapId), p, this.s.selection, p.id);
    if (next) {
      this.softTarget = null;
      this.s.select(next);
    }
  }

  // -------------------------------------------------------------------------
  // pointer

  click(sx: number, sy: number, double: boolean, shift = false): void {
    if (this.s.placing) {
      this.s.confirmPlacement();
      return;
    }
    if (this.s.inScene()) return;
    const id = this.s.pick(sx, sy);
    // Shift and a click sets the focus (ux_and_onboarding.md 5.2 ui_hud_focus)
    if (shift && id && id !== this.v.playerId() && this.s.toggleFocus) {
      this.s.toggleFocus(id);
      return;
    }
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

  // -------------------------------------------------------------------------
  // hotbar, interaction, dialogue

  hotbar(slot: number): void {
    this.s.hud.hotbar.flash(slot);
    const combat = this.s.adapters.combat;
    if (!combat) {
      this.s.logLine(t('ui.hud.log.hotbar_pending'));
      return;
    }
    const target = this.targetForUse();
    const res = combat.activateSlot(this.v, slot, target);
    if (typeof res === 'string') {
      // the light notification line above the hotbar (5.2, 5.4); hosts without one log it
      if (this.s.notifyLight) this.s.notifyLight(res);
      else this.s.logLine(res, 'warning');
      return;
    }
    if (res.length > 0 && !this.s.selection && target && this.settings.lockOnCast) this.lockSoft();
    this.s.queue(res);
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
    // the soft target last: talking and exits in reach come first
    const soft = this.softTarget;
    if (ia && soft) {
      const attack = ia.interact(v, soft);
      if (attack) {
        this.lockSoft();
        this.s.queue(attack);
        return;
      }
    }
    this.s.logLine(t('ui.hud.log.interact_nothing'));
  }

  /** The option cursor of the gamepad: which choice A picks (scene first, then talk). */
  optionCursor(): { kind: 'scene' | 'conversation'; index: number; count: number } | null {
    const a = this.s.adapters;
    const sv = a.scene?.scene(this.v);
    if (sv) {
      if (sceneMode(sv.waiting) !== 'choice' || sv.choices.length === 0) return null;
      const key = `s/${sv.sceneId}/${sv.nodeId}/${sv.choices.map((c) => c.id).join(',')}`;
      return {
        kind: 'scene',
        index: this.optionIndex(key, sv.choices.length),
        count: sv.choices.length,
      };
    }
    const conv = a.conversation?.conversation(this.v);
    if (!conv || conv.options.length === 0) return null;
    const key = `c/${conv.npcId}/${conv.options.map((o) => o.id).join(',')}`;
    return {
      kind: 'conversation',
      index: this.optionIndex(key, conv.options.length),
      count: conv.options.length,
    };
  }

  private optionIndex(key: string, count: number): number {
    if (this.option.key !== key) this.option = { key, index: 0 };
    this.option.index = Math.max(0, Math.min(count - 1, this.option.index));
    return this.option.index;
  }

  private moveOption(delta: 1 | -1): boolean {
    const c = this.optionCursor();
    if (!c) return false;
    this.option.index = (c.index + delta + c.count) % c.count;
    return true;
  }

  /** Pick option `n` (1-based) of the scene or the conversation. */
  private choose(n: number): boolean {
    const a = this.s.adapters;
    const sv = a.scene?.scene(this.v);
    if (sv) {
      const act = sceneKey(scenePanelModel(sv), { action: 'number', n });
      if (act?.type !== 'choose') return false;
      // no pick before the choices show (the node's lines still typing, 13.2)
      if (this.s.story && !this.s.story.sceneChoicesShown()) return true;
      if (this.s.story) this.s.story.chooseScene(act.choiceId);
      else this.s.queue(a.scene?.choose(this.v, act.choiceId));
      return true;
    }
    const conv = a.conversation?.conversation(this.v);
    const o = conv?.options[n - 1];
    if (!o) return false;
    this.s.queue(a.conversation?.choose(this.v, o.id));
    return true;
  }

  /** Space, Enter or A: the scene first, then the pad's option cursor, then loose lines. */
  advance(device: InputDevice = 'kbm'): boolean {
    // a typing line completes, the next line of a node shows, a card closes (7.3, 13.2)
    if (this.s.story?.press()) return true;
    const sv = this.s.adapters.scene?.scene(this.v);
    if (sv) {
      const mode = sceneMode(sv.waiting);
      if (mode === 'advance') {
        this.s.queue(this.s.adapters.scene?.advance(this.v));
        return true;
      }
      if (mode === 'choice' && device === 'pad') {
        const c = this.optionCursor();
        return c ? this.choose(c.index + 1) : false;
      }
      return false;
    }
    if (device === 'pad') {
      const c = this.optionCursor();
      if (c && !this.s.loose.current) return this.choose(c.index + 1);
    }
    if (this.s.loose.current) {
      this.s.loose.advance();
      this.s.renderStory();
      return true;
    }
    return false;
  }

  closeConversation(): void {
    if (this.s.adapters.conversation?.conversation(this.v)) {
      this.s.queue(this.s.adapters.conversation.close(this.v));
    }
    this.s.loose.close();
    this.s.renderStory();
  }

  /**
   * Esc (and the pad's B): cancel placement, close the front window, leave a conversation,
   * clear the target; Esc then opens the menu, B stops there.
   */
  private back(openMenu: boolean): boolean {
    const s = this.s;
    const a = s.adapters;
    if (s.placing) {
      s.cancelPlacement();
      return true;
    }
    if (s.windows.closeTop()) {
      s.story?.spendBack();
      return true;
    }
    if (s.story?.back()) return true;
    if (a.scene?.scene(this.v)) return openMenu;
    if (a.conversation?.conversation(this.v) || s.loose.current) {
      this.closeConversation();
      return true;
    }
    if (s.selection) {
      s.select(null);
      return true;
    }
    if (!openMenu) return false;
    s.windows.show('menu');
    return true;
  }

  // -------------------------------------------------------------------------
  // actions

  /** Run one action of the action layer; false when it does not apply now. */
  action(context: InputContext, action: string, device: InputDevice): boolean {
    switch (context) {
      case 'global':
        return this.globalAction(action, device);
      case 'dialogue':
        return this.dialogueAction(action, device);
      case 'field':
        return this.fieldAction(action);
      case 'corridor':
        // the corridor mode (ux_and_onboarding.md 9) runs in the window manager
        return this.s.windows.modeAction?.(action) ?? false;
      default:
        // lord, battle, continent, travel and court run in their own windows until their
        // modes are built (act 2 and later)
        return false;
    }
  }

  private globalAction(action: string, device: InputDevice): boolean {
    const s = this.s;
    switch (action) {
      case 'menu':
        // Esc closes layer by layer, then opens the menu (1.3); Start is the menu itself
        // (16.3): with windows open it closes them all, otherwise it opens the menu
        if (device !== 'pad') return this.back(true);
        if (s.windows.anyOpen) {
          s.windows.closeAll();
          return true;
        }
        if (s.placing) {
          s.cancelPlacement();
          return true;
        }
        // a scene panel covers the windows: Start waits like Esc does
        if (s.inScene()) return true;
        s.windows.show('menu');
        return true;
      case 'back':
        return this.back(false);
      case 'help':
        s.windows.toggle('help');
        return true;
      case 'debug':
        s.windows.toggle('debug');
        return true;
      case 'quick_save':
        s.saveTo('quick');
        return true;
      case 'quick_load':
        s.loadFrom('quick');
        return true;
      default:
        return false;
    }
  }

  private dialogueAction(action: string, device: InputDevice): boolean {
    if (action === 'advance') return this.advance(device);
    if (action === 'option_next') return this.moveOption(1);
    if (action === 'option_prev') return this.moveOption(-1);
    // backlog, auto advance and hidden text (8.2)
    if (action === 'recall' || action === 'auto_advance' || action === 'hide_text')
      return this.s.story?.action(action) ?? false;
    const m = OPTION_ACTION.exec(action);
    if (m) {
      // an open conversation keeps its number keys (no hotbar casts mid-talk); with only a
      // loose line showing they fall through to the hotbar
      const picked = this.choose(Number(m[1]));
      return picked || this.conversationOpen();
    }
    return false;
  }

  private fieldAction(action: string): boolean {
    const s = this.s;
    const a = s.adapters;
    if (s.inScene()) return false;
    const hot = HOTBAR_ACTION.exec(action);
    if (hot) {
      this.hotbar(Number(hot[1]));
      return true;
    }
    const win = WINDOW_ACTIONS[action];
    if (win) {
      s.windows.toggle(win);
      return true;
    }
    const party = PARTY_ACTION.exec(action);
    if (party) return this.selectParty(Number(party[1]));
    switch (action) {
      case 'interact':
        this.interact();
        return true;
      case 'select':
        // R3: lock the soft target, or let go of the hard target (16.4)
        if (this.lockSoft()) return true;
        if (s.selection) {
          s.select(null);
          return true;
        }
        return false;
      case 'appraise':
        if (s.selection && a.appraise) s.queue(a.appraise.appraise(this.v, s.selection));
        return true;
      case 'target_next':
        this.cycle(1);
        return true;
      case 'target_prev':
        this.cycle(-1);
        return true;
      case 'zoom_in':
        s.zoomBy(1);
        return true;
      case 'zoom_out':
        s.zoomBy(-1);
        return true;
      case 'camera_turn_left':
        s.turnView(-1);
        return true;
      case 'camera_turn_right':
        s.turnView(1);
        return true;
      case 'camera_toggle':
        s.toggleViewPreset();
        return true;
      case 'camera_reset':
        s.resetView();
        return true;
      case 'pause':
        s.togglePause();
        return true;
      case 'slow_down':
        s.stepSpeed(-1);
        return true;
      case 'speed_up':
        s.stepSpeed(1);
        return true;
      case 'select_self':
        s.select(this.v.playerId());
        return true;
      case 'focus':
        // Shift and a click, or a long R3: the target (or the soft target) becomes the focus
        return s.toggleFocus?.(s.selection ?? this.softTarget) ?? false;
      case 'party_next':
        return this.cycleParty(1);
      case 'party_prev':
        return this.cycleParty(-1);
      case 'item_1': {
        const first = this.consumables()[0];
        if (!first) return false;
        this.useItem(first.id);
        return true;
      }
      default:
        return false;
    }
  }

  // -------------------------------------------------------------------------
  // party selection

  /** Self first, then the companions' entities in party order. */
  private partyEntities(): string[] {
    const list = this.s.adapters.party?.companions(this.v) ?? [];
    const ids = list.map((c) => c.unit?.id).filter((id): id is string => !!id);
    return [this.v.playerId(), ...ids];
  }

  private selectParty(n: number): boolean {
    const id = this.partyEntities()[n];
    if (!id) return false;
    this.s.select(id);
    return true;
  }

  private cycleParty(dir: 1 | -1): boolean {
    const ids = this.partyEntities();
    const i = this.s.selection ? ids.indexOf(this.s.selection) : -1;
    const next =
      ids[i < 0 ? (dir === 1 ? 0 : ids.length - 1) : (i + dir + ids.length) % ids.length];
    if (!next) return false;
    this.s.select(next);
    return true;
  }

  // -------------------------------------------------------------------------
  // rings (16.5)

  /** Usable consumables in the bag, best first, at most ITEM_RING_SIZE. */
  private consumables(): { id: string; name: string }[] {
    const holding = this.v.holding(this.v.playerId());
    const out: { id: string; name: string; quality: number }[] = [];
    for (const [id, count] of Object.entries(holding.items)) {
      const def = this.v.itemDef(id);
      if (count <= 0 || !def?.use || def.kind !== 'consumable') continue;
      out.push({ id, name: def.name, quality: def.quality ?? 1 });
    }
    out.sort((x, y) => y.quality - x.quality || (x.id < y.id ? -1 : 1));
    return out.slice(0, ITEM_RING_SIZE);
  }

  private useItem(itemId: string): void {
    this.s.queue([{ kind: 'inventory.use', data: { ownerId: this.v.playerId(), itemId } }]);
  }

  ringSectors(ring: RingId): RingSector[] {
    switch (ring) {
      case 'windows':
        return WINDOW_RING.filter((id) => this.s.windows.available(id)).map((id) => ({
          id,
          label: windowTitle(id),
        }));
      case 'items':
        return this.consumables().map((c) => ({ id: c.id, label: c.name }));
      case 'party':
        if ((this.s.adapters.party?.companions(this.v) ?? []).length === 0) return [];
        return PARTY_ORDERS.map((o) => ({ id: o, label: t(`sys.party.order.${o}`) }));
      default:
        return [];
    }
  }

  ringChoose(ring: RingId, id: string): void {
    switch (ring) {
      case 'windows':
        if ((WINDOW_RING as readonly string[]).includes(id)) this.s.windows.show(id as WindowId);
        return;
      case 'items':
        this.useItem(id);
        return;
      case 'party':
        if ((PARTY_ORDERS as readonly string[]).includes(id))
          this.s.queue(this.s.adapters.party?.order(this.v, undefined, id as PartyOrder));
        return;
      default:
        return;
    }
  }

  ringOpen(open: boolean): void {
    const me = unitOf(this.v.world as never, this.v.playerId());
    const fighting = !!me && me.combatUntil > this.v.tick;
    // Legend difficulty keeps the world at full speed behind an open ring (16.5).
    const legend = this.v.flag('difficulty') === 'legend';
    this.s.setTimeScale(open && fighting && !legend ? RING_TIME_SCALE : 1);
  }

  // -------------------------------------------------------------------------
  // free text (the floating keyboard)

  textTarget(): TextTarget | null {
    const a = this.s.adapters;
    const sv = a.scene?.scene(this.v);
    if (sv) {
      const m = scenePanelModel(sv);
      return m.input ? { prompt: m.input.prompt, maxLength: m.input.maxLength } : null;
    }
    const conv = a.conversation?.conversation(this.v);
    if (conv && !conv.pending)
      return { prompt: conv.name, maxLength: a.conversation?.maxSay ?? 200 };
    return null;
  }

  submitText(text: string): void {
    const a = this.s.adapters;
    const sv = a.scene?.scene(this.v);
    if (sv && sceneMode(sv.waiting) === 'input') {
      // an empty answer is the keyboard's "use the default" key: the node's own default
      // (the prologue's unnamed traveller) answers, so typing is never forced (4.4)
      const cmds = text.trim()
        ? a.scene?.input(this.v, text)
        : [{ kind: 'scenes.input' as const, data: { text: '' } }];
      this.s.queue(cmds);
      return;
    }
    if (text && a.conversation?.conversation(this.v))
      this.s.queue(a.conversation.say(this.v, text));
  }
}

function sceneMode(waiting: string): SceneMode {
  return waiting === 'court' || waiting === 'choice'
    ? 'choice'
    : waiting === 'input'
      ? 'input'
      : waiting === 'resolve'
        ? 'resolve'
        : 'advance';
}
