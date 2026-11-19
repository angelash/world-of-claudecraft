// One running game in the browser: owns the engine loop (20 Hz fixed step with 1x, 2x,
// 4x and pause), render interpolation, the renderer (HD-2D scene or flat fallback), input,
// HUD and windows. It wires modules together and keeps per-session state (selection, the
// camera view and quality tier, map caches, placement mode); the rules live in the pure
// modules and adapters it calls. Player input is translated in ./player_input.ts. The
// world is redrawn on demand: the frame scheduler (render/frame_scheduler.ts) decides each
// frame whether the renderer runs (release_engineering.md 6.3).

import type { Engine } from '../../core/engine';
import { t } from '../../shared_ui/i18n';
import type { Appearance } from '../../systems/world/types';
import type { GameAudio } from '../audio';
import { createBrowserAudio } from '../audio/browser_audio';
import { createWorldRenderer, hasWebGL2, type QualityId, resolveQuality } from '../hd2d';
import { isQualityId } from '../hd2d/quality';
import {
  defaultPrefs,
  orbit,
  sanitizePrefs,
  stepAt,
  togglePreset,
  turn,
  type ViewPrefs,
  zoomBy,
} from '../hd2d/view';
import { cancelConfirm, confirmOpen, setConfirmPrefs } from '../hud/confirm_pop';
import { DialogueQueue } from '../hud/dialogue_queue';
import { gateExits, gatePrompt } from '../hud/exit_choice_model';
import { cancelExitChoice, exitChoiceOpen } from '../hud/exit_choice_pop';
import { gaugeInput, gaugesModel } from '../hud/gauges_model';
import { Hud } from '../hud/hud';
import {
  atSafePoint,
  type ClientSaves,
  type LoadedSave,
  loadErrorText,
  type SaveBlock,
  type SlotId,
  saveBlock,
  saveBlockText,
  saveErrorText,
  slotLabel,
} from '../hud/save_slots';
import { buildTracker, TRACK_MAX, TRACK_MAX_SHORT, TrackerState } from '../hud/tracker_model';
import { InputLayer } from '../input/input_layer';
import { pickEntity } from '../input/picking';
import { AnimTracker } from '../render/anim_state';
import { BubbleBoard } from '../render/bubbles';
import { MAX_ZOOM as FLAT_MAX_ZOOM } from '../render/camera';
import { FloatingBoard } from '../render/floating_text';
import { DecorClock, FrameScheduler } from '../render/frame_scheduler';
import { frameSignals } from '../render/frame_signals';
import { InterpBuffer } from '../render/interp';
import type { MapContext } from '../render/map_context';
import { topMarker } from '../render/markers';
import type { WorldRenderer } from '../render/renderer';
import { RoofFader, roofsToOpen } from '../render/roofs';
import {
  buildScene,
  type PlacementOverlay,
  relationOf,
  type SceneEntityInput,
} from '../render/scene';
import { lookFromEntity, type SpriteLook } from '../sprites/look';
import { SpriteCache } from '../sprites/sprite_cache';
import type { ClientAdapters } from '../view/adapters';
import {
  type ClientCommand,
  createGameCommands,
  createGameView,
  flagOn,
  type GameCommands,
  type GameView,
} from '../view/game_view';
import { registerWindows, type WindowId, WindowManager } from '../windows';
import type { ClientSettings, DisplayView, WindowPrefs } from '../windows/window_context';
import { applyAccessibility, systemReducedMotion } from './accessibility';
import { Act1Wiring } from './act1_wiring';
import { FixedStepClock, framesToRun, SPEEDS, type Speed } from './clock';
import { EventRouter } from './event_router';
import { HudExtras } from './hud_extras';
import { pageStorage } from './platform_wiring';
import { PlayerInput, type PlayerInputHost } from './player_input';
import type { LocalSettings, StoredView, SyncSettings } from './settings_schema';
import { StoryWiring } from './story_wiring';
import { ThumbnailCapture } from './thumbnail';
import { WorldPresenter } from './world_presenter';

export interface SessionHooks {
  /** after every simulation tick */
  afterStep?(engine: Engine): void;
}

export interface SessionOptions {
  engine: Engine;
  root: HTMLElement;
  devMode: boolean;
  adapters: ClientAdapters;
  saves: ClientSaves;
  settings: ClientSettings;
  /** The quality tier and camera view, kept in the local settings part (SettingsStore). */
  prefs: SessionPrefs;
  hooks?: SessionHooks;
  /** first message-log line (for example "loaded slot 2") */
  greeting?: string;
  /** the loaded save's client segment (guidance, tracking, notes; ux_and_onboarding.md 17.8) */
  clientSegment?: unknown;
  /** replace this session with a loaded save */
  loadWorld(loaded: LoadedSave, greeting: string): void;
  toTitle(): void;
}

/**
 * The slice of the settings store a session reads and writes: the sync part (key and pad
 * bindings and the input options, PK-M1-07; the settings pages, WindowPrefs) and the quality
 * tier and camera view of the local part.
 */
export interface SessionPrefs extends WindowPrefs {
  readonly local: Readonly<Pick<LocalSettings, 'quality' | 'view' | 'audioDevice'>>;
  updateLocal(patch: { quality?: QualityId; view?: StoredView | null }): boolean;
}

const HUD_INTERVAL_MS = 250;

function isTouch(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

interface Placing {
  siteId: string;
  defId: string;
  name: string;
  x: number;
  y: number;
  preview: PlacementOverlay | null;
}

export class GameSession implements PlayerInputHost {
  readonly engine: Engine;
  readonly view: GameView;
  readonly commands: GameCommands;
  readonly adapters: ClientAdapters;
  renderer: WorldRenderer;
  readonly clock = new FixedStepClock();
  private readonly interp = new InterpBuffer();
  private readonly anim = new AnimTracker();
  private readonly bubbles = new BubbleBoard();
  private readonly floats = new FloatingBoard();
  private readonly roofs = new RoofFader();
  /** on-demand redraw: decides each frame whether and what the renderer draws */
  readonly frames = new FrameScheduler();
  /** time for water, weather, motes and grain: holds still while paused or in a scene */
  private readonly decor = new DecorClock();
  /** the HD-2D tier animates film grain */
  private grain = false;
  readonly loose = new DialogueQueue();
  /** the dialogue panel and the cutscene player's reading state (PK-M1-22) */
  readonly story: StoryWiring;
  /** the quests and the door the HUD tracker follows (ui_hud_tracker, client state) */
  readonly tracker = new TrackerState();
  private readonly sprites = new SpriteCache(400);
  private readonly looks = new WeakMap<Appearance, SpriteLook>();
  readonly hud: Hud;
  readonly windows: WindowManager;
  private input: InputLayer;
  private readonly actions: PlayerInput;
  /** world speed multiplier: a radial menu open in a fight slows the world (16.5) */
  private timeScale = 1;
  private readonly router: EventRouter;
  /** party, focus, notifications, hint bar and rumble (PK-M1-22) */
  private readonly extras: HudExtras;
  /** the act-1 windows' availability, the onboarding, the field and tide panels, the coin and
   * the save's client segment (PK-M1-23) */
  private readonly act1: Act1Wiring;
  /** the accessibility settings and the system motion preference last applied (18) */
  private appliedAccess: Readonly<SyncSettings> | null = null;
  private appliedMotion = false;
  /** live map, sediment fade, combat marks and the scene's stage (PK-M1-24) */
  private readonly world: WorldPresenter;
  private readonly unsubscribe: () => void;
  private mapCtx: MapContext | null = null;
  private viewPrefs: ViewPrefs | null = null;
  private prefsTimer: ReturnType<typeof setTimeout> | undefined;
  private quality: QualityId = 'auto';
  private readonly webgl = hasWebGL2();
  selection: string | null = null;
  private hover: string | null = null;
  moveTarget: { x: number; y: number; at: number } | null = null;
  placing: Placing | null = null;
  private raf = 0;
  private last = 0;
  private lastHud = 0;
  private alpha = 0;
  private disposed = false;
  private readonly onResize = () => this.resize();
  // A tab brought back, or a WebGL context restored after a loss, may have lost the last
  // picture; draw once more even if nothing in the world changed.
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') this.frames.invalidate('resize');
  };
  private readonly onContextRestored = () => this.frames.invalidate('resize');

  constructor(private readonly opts: SessionOptions) {
    this.engine = opts.engine;
    this.adapters = opts.adapters;
    this.view = createGameView(opts.engine);
    this.commands = createGameCommands(opts.engine);
    const q = opts.prefs.local.quality;
    this.quality = isQualityId(q) ? q : 'auto';
    const quality = resolveQuality(this.quality, { touch: isTouch(), webgl: this.webgl });
    this.grain = quality.grain;
    this.renderer = createWorldRenderer(quality);
    this.renderer.mount(opts.root);
    this.actions = new PlayerInput(this);
    this.story = new StoryWiring({
      view: this.view,
      adapters: opts.adapters,
      loose: this.loose,
      sprites: this.sprites,
      hud: () => this.hud,
      sync: () => opts.prefs.sync,
      audio: () => this.audio,
      queue: (cmds) => this.queue(cmds),
      advance: () => this.actions.advance(),
      closeConversation: () => this.actions.closeConversation(),
      storage: pageStorage(window),
      // built before the windows: read them only when a frame asks
      held: () => this.clock.paused || this.worldHeld(),
    });
    const a = opts.adapters;

    this.hud = new Hud(opts.root, {
      sprites: this.sprites,
      devMode: opts.devMode,
      time: {
        setSpeed: (s: Speed) => {
          this.clock.setSpeed(s);
          if (this.clock.paused) this.togglePause();
          this.refreshHud(true);
        },
        togglePause: () => this.togglePause(),
      },
      story: this.story.handlers,
      storyCrop: this.story.crop,
      onHotbar: (slot) => this.actions.hotbar(slot),
      onToggleWindow: (id) => this.windows.toggle(id),
      onWarPrompt: () => this.windows.show('battle'),
      onSelect: (id) => this.select(id),
      onOpenWindow: (id) => this.windows.show(id as WindowId),
      onCoin: () => this.act1.openOffer(),
      onTideClose: (night) => this.act1.closeTide(night),
    });
    this.world = new WorldPresenter(opts.root, this.view, a);
    this.extras = new HudExtras({
      view: this.view,
      adapters: a,
      hud: this.hud,
      sync: () => opts.prefs.sync,
      inScene: () => this.inScene(),
      // a loose line sits over the field: notifications and hints keep going (5.1, 5.4)
      talking: () => !!a.conversation?.conversation(this.view),
      conversing: () => !!a.conversation?.conversation(this.view),
      hintContext: (base) => this.act1.hintContext(base),
    });
    this.act1 = new Act1Wiring({
      view: this.view,
      adapters: a,
      hud: this.hud,
      root: opts.root,
      tracker: this.tracker,
      sync: () => opts.prefs.sync,
      updateSync: (patch) => opts.prefs.updateSync(patch),
      queue: (cmds) => this.queue(cmds),
      isOpen: (id) => this.windows?.isOpen(id) ?? false,
      inScene: () => this.inScene(),
      talking: () => !!a.conversation?.conversation(this.view),
      selection: () => this.selection,
      canSave: () => this.saveBlockNow() === null,
      listenTier: () => this.story.listenTierNow(),
      notify: (n) => this.extras.notify(n, performance.now()),
      kv: pageStorage(window),
    });
    this.act1.restore(opts.clientSegment);
    opts.saves.setClientSegment(() => this.act1.segment());

    this.windows = new WindowManager(opts.root, {
      // the world's flags plus the act-1 discovery keys (window_unlocks.ts)
      flags: () => this.act1.availFlags(),
      devMode: opts.devMode,
    });
    this.windows.onChange = () => this.refreshHud(true);
    registerWindows(this.windows, {
      view: this.view,
      commands: this.commands,
      adapters: opts.adapters,
      devMode: opts.devMode,
      saves: opts.saves,
      settings: opts.settings,
      prefs: opts.prefs,
      tracker: this.tracker,
      help: this.act1.help(),
      evidenceNotes: this.act1.notes,
      actions: {
        saveTo: (slot) => this.saveTo(slot),
        loadFrom: (slot) => this.loadFrom(slot),
        saveBlock: () => this.saveBlockNow(),
        toTitle: () => opts.toTitle(),
        openWindow: (id) => this.windows.show(id),
        closeWindow: (id) => this.windows.close(id),
        beginPlacement: (siteId, defId, name) => this.beginPlacement(siteId, defId, name),
        select: (id) => this.select(id),
        display: () => this.display(),
        setQuality: (id) => this.setQuality(id),
        setViewPreset: (preset) => this.setViewPreset(preset),
        runQueued: () => this.runQueued(),
      },
    });
    this.hud.tracker.handlers = {
      open: () => this.windows.show('quests'),
      untrack: (id) => {
        this.tracker.untrack(id);
        this.refreshHud(true);
      },
      openDoor: () => this.windows.show('doors'),
      unpinDoor: () => {
        this.tracker.pinDoor(null);
        this.refreshHud(true);
      },
    };

    this.router = new EventRouter(
      this.view,
      opts.adapters,
      this.bubbles,
      this.loose,
      this.anim,
      this.floats,
      {
        log: (line) => this.hud.log.push(line),
        banner: (b) => this.hud.banner.show(b),
        storyChanged: () => this.renderStory(),
        playerMapChanged: () => this.enterMap(),
        featuresChanged: () => {
          this.windows.refreshAvailability();
          this.refreshHud(true);
        },
        openWindow: (id) => this.windows.show(id),
        closeWindow: (id) => this.windows.close(id),
        notify: (n) => this.extras.notify(n, performance.now()),
      },
    );
    this.unsubscribe = opts.engine.onEvents((events) => {
      this.router.handle(events, performance.now());
      this.story.feed(events);
      this.act1.events(events, performance.now());
    });
    this.audio = this.startAudio();

    this.input = this.bindInput();
    // a right click on a companion's party frame opens that companion's order ring (5.2)
    this.hud.party.onOrders = (id) => this.input.openRing('party', id);

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    // Context events do not bubble; a capture listener on the document still sees them.
    document.addEventListener('webglcontextrestored', this.onContextRestored, true);
    this.resize();
    this.enterMap();
    if (opts.greeting) this.hud.log.push({ text: opts.greeting, category: 'system' });
    if (a.trade?.session(this.view)) this.windows.show('trade');
    this.renderStory();
    this.refreshHud(true);
  }

  private bindInput(): InputLayer {
    return new InputLayer({
      root: this.opts.root,
      canvas: this.renderer.canvas,
      dpr: () => this.renderer.dpr,
      windowsRoot: this.windows.root,
      game: this.actions,
      settings: () => this.opts.prefs.sync,
      pointer: {
        secondary: (sx, sy) => this.actions.secondary(sx, sy),
        hover: (sx, sy) => {
          if (sx === null || sy === null) {
            this.hover = null;
            return;
          }
          this.hover = pickEntity(this.renderer.hitBoxes(), sx, sy);
          if (this.placing) this.movePlacement(sx, sy);
        },
        zoom: (d) => this.zoomBy(d),
        orbit: (dx, dy) => this.orbitView(dx, dy),
      },
      glyphsChanged: () => this.refreshHud(true),
    });
  }

  /**
   * Run the loop. Every animation frame advances the simulation clock, runs due ticks,
   * refreshes the HUD and canvas windows, and builds the scene; the renderer runs only on
   * frames the scheduler finds dirty, so input and simulation never wait on drawing.
   */
  start(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.disposed = true;
    // a question asked by this run (delete a save, an irreversible choice) ends with it
    cancelConfirm();
    cancelExitChoice();
    cancelAnimationFrame(this.raf);
    clearTimeout(this.prefsTimer);
    if (this.viewPrefs) this.storeView();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('webglcontextrestored', this.onContextRestored, true);
    this.unsubscribe();
    this.opts.saves.setClientSegment(null);
    this.act1.dispose();
    this.story.dispose();
    this.world.dispose();
    this.stopAudio();
    this.input.dispose();
    this.windows.dispose();
    this.hud.dispose();
    this.renderer.dispose();
  }

  // -------------------------------------------------------------------------
  // PlayerInputHost

  queue(cmds: readonly ClientCommand[] | null | undefined): void {
    if (cmds?.length) this.commands.queueAll(cmds);
  }

  logLine(text: string, category = 'system'): void {
    this.hud.log.push({ text, category });
  }

  notifyLight(text: string): void {
    this.extras.light(text, performance.now());
  }

  toggleFocus(candidate: string | null): boolean {
    return this.extras.toggleFocus(candidate);
  }

  inScene(): boolean {
    return !!this.adapters.scene?.scene(this.view);
  }

  select(id: string | null): void {
    this.selection = id;
    this.queue(this.adapters.combat?.selectTarget(this.view, id));
    this.refreshHud(true);
  }

  // -------------------------------------------------------------------------
  // Camera view and quality (art_pipeline.md 1.2 and 2.11)

  private prefs(): ViewPrefs {
    if (!this.viewPrefs) {
      this.viewPrefs = sanitizePrefs(this.opts.prefs.local.view, this.renderer.deviceH);
    }
    return this.viewPrefs;
  }

  private storeView(): void {
    const p = this.viewPrefs;
    if (p)
      this.opts.prefs.updateLocal({ view: { stepIndex: p.stepIndex, pitch: p.pitch, yaw: p.yaw } });
  }

  private setPrefs(p: ViewPrefs): void {
    const turned = !this.viewPrefs || this.viewPrefs.yaw !== p.yaw;
    this.viewPrefs = p;
    // Orbiting changes the prefs on every pointer move; store them once it settles.
    clearTimeout(this.prefsTimer);
    this.prefsTimer = setTimeout(() => this.storeView(), 400);
    if (turned) this.actions.viewTurned();
  }

  orbitView(dx: number, dy: number): void {
    if (this.renderer.kind === 'hd2d') this.setPrefs(orbit(this.prefs(), dx, dy));
  }

  stepSpeed(dir: 1 | -1): void {
    const i = SPEEDS.indexOf(this.clock.speed);
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + dir))] as Speed;
    if (next === this.clock.speed) return;
    this.clock.setSpeed(next);
    this.refreshHud(true);
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, Math.min(1, scale));
  }

  zoomBy(delta: number): void {
    const next = zoomBy(this.prefs(), delta);
    // The flat renderer stops at its own largest zoom; do not walk past it.
    if (this.renderer.kind === 'flat' && stepAt(next.stepIndex) > FLAT_MAX_ZOOM) return;
    this.setPrefs(next);
  }

  turnView(dir: 1 | -1): void {
    if (this.renderer.kind === 'hd2d') this.setPrefs(turn(this.prefs(), dir));
  }

  toggleViewPreset(): void {
    if (this.renderer.kind === 'hd2d') this.setPrefs(togglePreset(this.prefs()));
  }

  resetView(): void {
    this.setPrefs(defaultPrefs(this.renderer.deviceH));
  }

  viewYaw(): number {
    return this.renderer.kind === 'hd2d' ? this.prefs().yaw : 0;
  }

  setViewPreset(preset: 'street' | 'overview'): void {
    const p = this.prefs();
    const want = preset === 'street' ? 'street' : 'overview';
    const isStreet = p.pitch < 50;
    if ((want === 'street') !== isStreet) this.toggleViewPreset();
  }

  display(): DisplayView {
    return { quality: this.quality, renderer: this.renderer.kind, webgl: this.webgl };
  }

  setQuality(id: QualityId): void {
    this.quality = id;
    this.opts.prefs.updateLocal({ quality: id });
    const q = resolveQuality(id, { touch: isTouch(), webgl: this.webgl });
    this.grain = q.grain;
    const want = q.tier === 'flat' ? 'flat' : 'hd2d';
    if (want === this.renderer.kind) {
      this.renderer.setQuality(q);
      this.frames.invalidate('quality');
      return;
    }
    this.input.dispose();
    this.renderer.dispose();
    this.renderer = createWorldRenderer(q);
    this.renderer.mount(this.opts.root);
    this.input = this.bindInput();
    this.resize();
    if (this.mapCtx) this.renderer.setMap(this.mapCtx);
    this.frames.invalidate('quality');
  }

  togglePause(): void {
    this.clock.togglePause();
    this.input.releaseAll();
    this.hud.setPaused(this.clock.paused);
    this.refreshHud(true);
  }

  worldPoint(sx: number, sy: number): { x: number; y: number } | null {
    return this.renderer.screenToGround(sx, sy);
  }

  pick(sx: number, sy: number): string | null {
    return pickEntity(this.renderer.hitBoxes(), sx, sy);
  }

  renderStory(): void {
    // the dialogue panel and the cutscene player (ui_mode_dialogue, ui_mode_cutscene)
    this.story.frame(performance.now());
  }

  // -------------------------------------------------------------------------
  // Placement mode (territory window)

  beginPlacement(siteId: string, defId: string, name: string): void {
    this.placing = { siteId, defId, name, x: -1, y: -1, preview: null };
    this.windows.closeAll();
    this.logLine(t('ui.win.territory.placing', { name }));
  }

  cancelPlacement(): void {
    this.placing = null;
  }

  confirmPlacement(): void {
    const pl = this.placing;
    if (!pl || pl.x < 0) return;
    this.queue(this.adapters.territory?.place(this.view, pl.siteId, pl.defId, pl.x, pl.y));
    this.placing = null;
  }

  private movePlacement(sx: number, sy: number): void {
    const pl = this.placing;
    const ter = this.adapters.territory;
    const w = this.worldPoint(sx, sy);
    if (!pl || !ter || !w) return;
    const def = ter.buildMenu(this.view, pl.siteId).find((b) => b.id === pl.defId);
    const x = Math.floor(w.x) - Math.floor((def?.w ?? 1) / 2);
    const y = Math.floor(w.y) - Math.floor((def?.h ?? 1) / 2);
    if (x === pl.x && y === pl.y) return;
    pl.x = x;
    pl.y = y;
    const r = ter.preview(this.view, pl.siteId, pl.defId, x, y);
    pl.preview = r.ok
      ? {
          ok: true,
          tiles: r.tiles,
          blocked: [],
          entrance: r.entrance,
          label: t('ui.win.territory.can_place'),
        }
      : { ok: false, tiles: r.tiles, blocked: r.blocked, entrance: null, label: r.reason };
  }

  // -------------------------------------------------------------------------
  // Loop

  private frame(now: number): void {
    const dt = now - this.last;
    this.last = now;
    this.input.frame(now);
    // An interface mode (the corridor, 9.1), settings, saves, the menu, help and a confirm popup
    // hold the world still (ux_and_onboarding.md 1.3).
    // a modal guidance card holds it too (17.2)
    const scale = this.worldHeld() ? 0 : this.timeScale;
    const { steps, alpha } = this.clock.advance(dt * scale);
    const ranSteps = framesToRun(steps, !!this.engine.clockStep());
    for (let i = 0; i < ranSteps; i++) {
      this.engine.step(1);
      this.capture();
      this.opts.hooks?.afterStep?.(this.engine);
    }
    if (ranSteps > 0) this.actions.afterSteps();
    if (this.engine.logFull) this.autosaveAtSafePoint();
    this.alpha = alpha;
    // the story types on real time, outside the 20 Hz world; it enters a node's stage before
    // the world picture reads it, so a directive shows on the frame its node starts
    this.story.frame(now);
    this.present(now, dt);
    this.audioFrame(now);
    this.windows.frame(now);
    // One mode at a time (1.3): a scene that starts while the corridor is open (a door's own
    // cutscene) takes over; the corridor would otherwise hold the world, and the scene, still.
    const mode = this.windows.modeOpen;
    if (mode && this.inScene()) this.windows.close(mode);
    if (now - this.lastHud >= HUD_INTERVAL_MS) this.refreshHud(false, now);
  }

  /**
   * Whatever holds the world still (1.3, 17.2): a mode, settings, saves, the menu, help, a
   * confirm or exit popup, or a modal guidance card. The step, the story layer and the frame
   * scheduler all read this one answer.
   */
  private worldHeld(): boolean {
    return (
      !!this.windows?.holdsWorld || confirmOpen() || exitChoiceOpen() || !!this.act1?.holdsWorld()
    );
  }

  /**
   * While a mode holds the world still, run the one tick that settles the commands the mode
   * just queued (opening or closing a door in the corridor).
   */
  runQueued(): void {
    if (!this.windows.modeOpen || this.disposed) return;
    this.engine.step(1);
    this.capture();
    this.opts.hooks?.afterStep?.(this.engine);
    this.actions.afterSteps();
    this.refreshHud(true);
  }

  private capture(): void {
    const p = this.view.player();
    if (!p) return;
    this.interp.capture(this.view.entitiesOnMap(p.mapId));
  }

  private lookOf(e: { appearance: Appearance; kind: string }): SpriteLook {
    let l = this.looks.get(e.appearance);
    if (!l) {
      l = lookFromEntity(e);
      this.looks.set(e.appearance, l);
    }
    return l;
  }

  /** Build this frame's scene and draw it when the frame scheduler finds it dirty. */
  private present(now: number, dt: number): void {
    const player = this.view.player();
    if (player && this.mapCtx?.map.id !== player.mapId) this.enterMap();
    this.followSwitches(now);
    const ctx = this.mapCtx;
    if (!player || !ctx) return;
    const map = ctx.map;
    const prefs = this.prefs();
    const yaw = this.viewYaw();
    const onMap = this.view.entitiesOnMap(map.id);
    // the scene's stage: camera, light, weather, mirror and motions (catalog_cutscenes.md 13.5)
    const stage = this.world.readStage({
      stage: this.story.stage(),
      presentation: this.adapters.scene?.scene(this.view)?.presentation ?? null,
      now,
      view: this.view,
      map,
      entities: onMap,
      playerId: player.id,
      calendar: this.view.calendar(),
      weather: this.view.weather(),
      deviceH: this.renderer.deviceH,
    });
    this.world.readMarks(map.id, onMap);
    const entities: SceneEntityInput[] = [];
    const ids = new Set<string>();
    const playerPos = this.interp.sample(player.id, this.alpha) ?? { x: player.x, y: player.y };
    const overhead = this.adapters.overhead;
    // a staged shot frames the scene; otherwise the player's own view follows the player
    const view = stage.view ?? {
      focusX: playerPos.x,
      focusY: playerPos.y,
      step: stepAt(prefs.stepIndex),
      pitch: prefs.pitch,
      yaw,
    };
    // the flat renderer never turns: its figures face the map as it is
    const hd = this.renderer.kind === 'hd2d';
    const faceYaw = hd ? view.yaw : 0;
    const facePitch = hd ? view.pitch : undefined;
    for (const e of onMap) {
      const pos =
        e.id === player.id
          ? playerPos
          : (this.interp.sample(e.id, this.alpha) ?? { x: e.x, y: e.y });
      ids.add(e.id);
      const sampled = this.anim.sample(
        {
          id: e.id,
          alive: e.alive,
          facing: e.facing,
          yawDeg: faceYaw,
          pitchDeg: facePitch,
          moving: this.interp.moving(e.id),
          travelled: this.interp.travelled(e.id),
        },
        now,
      );
      const anim = this.world.animOf(e, sampled, pos, playerPos, faceYaw, facePitch, now);
      const markers = overhead?.markers(this.view, e.id) ?? [];
      entities.push({
        entity: e,
        x: pos.x,
        y: pos.y,
        look: this.lookOf(e),
        anim,
        marker: topMarker(markers),
        marks: this.world.marksOf(e.id),
      });
    }
    this.anim.retain(ids);
    if (this.selection && !ids.has(this.selection)) this.select(null);

    // Open the roof over the player, over the selected figure, and every roof while placing
    // a building, so nothing the player acts on hides under a roof (art_pipeline.md 5.6).
    const extraOpen: string[] = [];
    if (this.placing) extraOpen.push(...ctx.roofs.map((r) => r.locationId));
    const sel = this.selection ? this.view.entity(this.selection) : undefined;
    if (sel) {
      for (const r of roofsToOpen(ctx.roofs, sel)) extraOpen.push(r);
    }
    this.roofs.update(dt, roofsToOpen(ctx.roofs, playerPos, extraOpen), ctx.roofs);

    const inScene = this.inScene();
    // Paused, or a scene panel over the world: idle animation, weather and water hold still;
    // a staged scene (a shot, a light, a weather or a motion on stage) keeps the world moving.
    const held = this.worldHeld();
    const quiet = this.clock.paused || held || (inScene && !stage.staged);
    let exitHint: { x: number; y: number; text: string } | null = null;
    // a gate with several ways out says how many (exit_choice_model.ts)
    const ways = gateExits(map, playerPos, (k) => flagOn(this.view.flag(k)));
    const prompt = gatePrompt(ways);
    const exit = ways.length ? map.exits.find((e) => e.id === ways[0]?.id) : undefined;
    if (exit && prompt) {
      exitHint = { x: exit.x + 0.5, y: exit.y + 0.5, text: t(prompt.key, prompt.params) };
    } else {
      const near = this.adapters.interact?.nearestTalkable(this.view);
      const ne = near ? this.view.entity(near) : undefined;
      if (ne) exitHint = { x: ne.x, y: ne.y - 1.6, text: t('ui.hud.prompt.talk') };
    }

    const scene = buildScene({
      map,
      view,
      timeMs: this.decor.advance(now, quiet),
      playerId: player.id,
      calendar: stage.calendar,
      weather: stage.weather,
      weatherFade: stage.weatherFade,
      mood: stage.mood,
      sediment: this.world.sedimentAt(map, { x: view.focusX, y: view.focusY }, now),
      warnings: this.world.groundWarnings(),
      switchFade: this.world.switchFade(now),
      entities,
      standees: ctx.layout.standees,
      staticLights: ctx.layout.lights,
      roofs: ctx.roofs,
      roofOpenness: (id) => this.roofs.openness(id),
      selection: this.selection,
      // the soft target (16.4) shows with the hover ring while the pointer is not on a unit
      hover: this.hover ?? this.actions.softTarget,
      bubbles: this.bubbles.active(now),
      floats: this.floats.active(now),
      extraLights: (this.adapters.lights?.lights(this.view, map.id) ?? []).map((l) => ({
        ...l,
        intensity: l.intensity ?? 1,
      })),
      moveTarget: this.moveTarget
        ? { x: this.moveTarget.x, y: this.moveTarget.y, ageMs: now - this.moveTarget.at }
        : null,
      exitHint: inScene ? null : exitHint,
      placement: this.placing?.preview ?? null,
    });
    const r = this.renderer;
    const { signature, activity } = frameSignals(scene, {
      flat: r.kind === 'flat',
      deviceW: r.deviceW,
      deviceH: r.deviceH,
      dpr: r.dpr,
      grain: this.grain,
    });
    const decision = this.frames.decide({ nowMs: now, signature, activity, quiet });
    if (decision.draw) r.render(scene, decision.layers);
    // A save thumbnail is copied in the same task as a frame that drew every layer.
    if (decision.draw && decision.layers.world && decision.layers.overlay)
      this.shots.frameDrawn(this.opts.root);
  }

  /** A switch tile on the player's map opened or closed: draw the live map, fading the change. */
  private followSwitches(now: number): void {
    const content = this.view.currentMap();
    if (!this.mapCtx || !content || content.id !== this.mapCtx.map.id) return;
    const next = this.world.switchChange(content, now);
    if (!next) return;
    this.mapCtx = next;
    this.renderer.setMap(next);
    this.frames.invalidate('map');
  }

  private enterMap(): void {
    const map = this.view.currentMap();
    if (!map) return;
    if (this.mapCtx?.map.id === map.id) return;
    this.mapCtx = this.world.contextFor(map, performance.now());
    this.renderer.setMap(this.mapCtx);
    this.frames.invalidate('map');
    this.interp.clear();
    this.roofs.reset();
    this.bubbles.clear();
    this.floats.clear();
    this.selection = null;
    this.moveTarget = null;
    this.placing = null;
    this.capture();
  }

  private resize(): void {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    this.renderer.resize(window.innerWidth, window.innerHeight, dpr);
    this.frames.invalidate('resize');
  }

  refreshHud(force: boolean, now = performance.now()): void {
    if (!force && now - this.lastHud < HUD_INTERVAL_MS) return;
    this.lastHud = now;
    // holds turned into presses (18.5) reach the confirm popup as soon as the setting changes
    const sync = this.opts.prefs.sync;
    setConfirmPrefs({
      holdToToggle: sync.accessibility.holdToToggle,
      swapConfirmBack: sync.input.swapConfirmBack,
    });
    const v = this.view;
    const a = this.adapters;
    const player = v.player();
    const pid = v.playerId();
    this.hud.playerFrame.update(player, 'self', a.unitFrames?.unitFrame(v, pid, pid) ?? null, '');
    // the soft target fills the target frame, marked as the candidate (16.4)
    const soft = this.selection ? null : this.actions.softTarget;
    const shown = this.selection ?? soft;
    const target = shown ? v.entity(shown) : undefined;
    const frame = target ? (a.unitFrames?.unitFrame(v, target.id, pid) ?? null) : null;
    if (frame && soft)
      frame.subtitle = [t('ui.hud.target.candidate'), frame.subtitle].filter(Boolean).join('  ');
    this.hud.targetFrame.update(
      target,
      target ? relationOf(target, pid) : null,
      frame,
      t('ui.hud.target.none'),
    );
    this.hud.clock.update(v.calendar(), v.weather(), this.clock.speed, this.clock.paused);
    // the minimap shows the live map: switch tiles as the flags leave them (PK-M1-16)
    const content = v.currentMap();
    const map = content && this.mapCtx?.map.id === content.id ? this.mapCtx.map : content;
    this.hud.minimap.update(
      map,
      map ? v.entitiesOnMap(map.id) : [],
      pid,
      map ? (a.mapMarkers?.markers(v, map.id) ?? []) : [],
    );
    this.hud.menuBar.update(this.act1.availFlags(), (id) => this.windows.isOpen(id));
    this.hud.gauges.update(gaugesModel(gaugeInput(v, a)));
    const short = window.innerHeight < 900;
    this.hud.tracker.update(buildTracker(v, a, this.tracker, short ? TRACK_MAX_SHORT : TRACK_MAX));
    this.input.configure();
    const slots = a.combat?.hotbar(v) ?? [];
    const filled = new Set(slots.filter((x) => x.abilityId).map((x) => x.slot));
    this.hud.hotbar.update(slots, this.input.hotbarLayout(filled));
    const pending = a.battle?.pending(v);
    this.hud.warPrompt.update(
      pending && !a.battle?.battle(v)
        ? t('ui.hud.warprompt.pending', { name: pending.name })
        : null,
    );
    this.hud.banner.update(now);
    this.extras.refresh(now);
    this.act1.refresh(now);
    // colour mode, text size, reduced motion (18): written again whenever the settings change
    const motion = systemReducedMotion();
    if (sync !== this.appliedAccess || motion !== this.appliedMotion) {
      this.appliedAccess = sync;
      this.appliedMotion = motion;
      // the world palette and calm flag changed: redraw the world picture (18.2, 18.8)
      if (applyAccessibility(document.documentElement, sync, motion))
        this.frames.invalidate('quality');
    }
    this.hud.setPaused(this.clock.paused);
    this.renderStory();
    this.windows.update();
  }

  // -------------------------------------------------------------------------
  // Save and load

  /** Save thumbnails: a copy of the next fully drawn frame (./thumbnail.ts). */
  private readonly shots = new ThumbnailCapture(() => this.frames.invalidate('resize'));

  /** A save the player asked for (window, F6); refused with a line when it cannot go ahead. */
  saveTo(slot: SlotId): void {
    const refusal = this.saveRefusal();
    if (refusal) {
      this.saveLine(refusal, 'warning');
      return;
    }
    const trigger = slot === 'quick' ? 'quick' : 'manual';
    this.saveWithThumb(this.opts.saves.save(slot, this.saveInfo(), trigger));
  }

  /** Why the player cannot save now (ux_and_onboarding.md 6.2.13), or null. */
  saveBlockNow(): SaveBlock | null {
    return saveBlock(this.engine.world, {
      inScene: this.inScene(),
      talking: !!this.adapters.conversation?.conversation(this.view),
      writing: this.opts.saves.writing,
    });
  }

  /** The sentence refusing a player save: an ironman run (5.9) or a block, else null. */
  private saveRefusal(): string | null {
    if (this.opts.saves.ironman) return t('ui.win.saves.ironman_auto_only');
    const b = this.saveBlockNow();
    return b ? saveBlockText(b) : null;
  }

  /** Report a save and keep a thumbnail of the frame after it (dropped if none comes). */
  private saveWithThumb(saving: ReturnType<ClientSaves['save']>): void {
    const shot = this.shots.request();
    saving.then(
      (meta) => {
        this.saveLine(t('ui.hud.log.saved', { slot: slotLabel(meta.slot) }));
        void shot.then((url) => {
          if (url) this.opts.saves.setThumb(meta, url);
        });
      },
      (err) => this.saveFailed(err),
    );
  }

  /** The exit save of an ironman run (3.4.1: leaving saves); resolves when it is written. */
  /** The ironman run's save on the way out; the player text of a failure, else null. */
  async exitSave(): Promise<string | null> {
    if (!this.opts.saves.ironman || this.engine.world.meta.flags.act === 'prologue') return null;
    try {
      await this.opts.saves.exitSave(this.saveInfo());
      return null;
    } catch (err) {
      console.warn('[saves] exit save failed', err);
      return t('ui.win.saves.failed', { reason: saveErrorText(err) });
    }
  }

  loadFrom(slot: SlotId): void {
    // An ironman run never loads back, quick load included (3.4.1).
    if (this.opts.saves.ironman) {
      this.saveLine(t('ui.win.saves.ironman_no_load'), 'warning');
      return;
    }
    this.opts.saves.load(slot).then(
      (loaded) => {
        if (!this.disposed)
          this.opts.loadWorld(loaded, t('ui.hud.log.loaded', { slot: slotLabel(slot) }));
      },
      (err) => {
        console.warn('[saves] load failed', err);
        this.saveLine(t('ui.win.saves.load_failed', { reason: loadErrorText(err) }), 'warning');
      },
    );
  }

  /**
   * The replay log reached its limit (Engine.logFull): autosave at the next safe point,
   * which drains the log into a commands segment (release_engineering.md 13.6).
   */
  private autosaveAtSafePoint(): void {
    const safe = atSafePoint(this.engine.world, {
      inScene: this.inScene(),
      writing: this.opts.saves.writing,
    });
    // The prologue is never saved (catalog_cutscenes.md 13.7).
    if (!safe || this.engine.world.meta.flags.act === 'prologue') return;
    this.saveWithThumb(this.opts.saves.autosave(this.saveInfo()));
  }

  private saveInfo(): { mapId: string; mapName: string } {
    const map = this.view.currentMap();
    return { mapId: map?.id ?? '', mapName: map?.name ?? '' };
  }

  private saveFailed(err: unknown): void {
    console.warn('[saves] save failed', err);
    this.saveLine(t('ui.win.saves.failed', { reason: saveErrorText(err) }), 'warning');
  }

  /** A save finishes after its frame; the session may be gone by then. */
  private saveLine(text: string, category = 'system'): void {
    if (!this.disposed) this.logLine(text, category);
  }

  // -------------------------------------------------------------------------
  // Audio (PK-M1-06; src/client/audio, its README.md). The subsystem only reads the view and
  // the kernel events; it runs silent without a device or approved files. The cutscene
  // player and the dialogue painters drive it through `session.audio` (GameAudio).

  /** The audio subsystem's API (cutscene tracks and silences, written sounds, phrases, blips). */
  readonly audio: GameAudio;
  private unsubscribeAudio: () => void = () => {};
  /** The first user input starts the audio output (the browser's autoplay rule). */
  private readonly onAudioUnlock = () => this.audio.unlock();

  private startAudio(): GameAudio {
    const audio = createBrowserAudio({
      view: this.view,
      root: this.opts.root,
      atlas: this.engine.content.atlas_maps ?? [],
      settings: () => this.opts.prefs.sync,
      device: () => this.opts.prefs.local.audioDevice ?? null,
    });
    this.unsubscribeAudio = this.engine.onEvents((evs) => audio.events(evs, performance.now()));
    window.addEventListener('pointerdown', this.onAudioUnlock, true);
    window.addEventListener('keydown', this.onAudioUnlock, true);
    // A click on the title screen already counts as the page's first input.
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
      .userActivation;
    if (activation?.hasBeenActive) audio.unlock();
    return audio;
  }

  private audioFrame(now: number): void {
    // a pad-only player starts the audio with the first button press (18.5)
    if (this.act1.padUnlocks()) this.audio.unlock();
    const player = this.view.player();
    const r = this.renderer;
    const prefs = this.prefs();
    const focus = player ? (this.interp.sample(player.id, this.alpha) ?? player) : null;
    this.audio.frame({
      nowMs: now,
      paused: this.clock.paused,
      inScene: this.inScene(),
      dialogueOpen: !!this.adapters.conversation?.conversation(this.view),
      camera: {
        yawDeg: this.viewYaw(),
        pitchDeg: r.kind === 'hd2d' ? prefs.pitch : 90,
        step: stepAt(prefs.stepIndex),
        viewportW: r.deviceW,
        viewportH: r.deviceH,
      },
      focus: focus ? { x: focus.x, y: focus.y } : null,
      travelled: (id) => this.interp.travelled(id),
    });
  }

  private stopAudio(): void {
    window.removeEventListener('pointerdown', this.onAudioUnlock, true);
    window.removeEventListener('keydown', this.onAudioUnlock, true);
    this.unsubscribeAudio();
    this.audio.dispose();
  }
}
