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
import { DialogueQueue } from '../hud/dialogue_queue';
import { Hud } from '../hud/hud';
import {
  atSafePoint,
  type ClientSaves,
  type LoadedSave,
  loadErrorText,
  type SlotId,
  saveErrorText,
  slotLabel,
} from '../hud/save_slots';
import { scenePanelModel } from '../hud/scene_model';
import { InputController } from '../input/input_controller';
import { exitOpen, nearestExit, pickEntity } from '../input/picking';
import { AnimTracker } from '../render/anim_state';
import { BubbleBoard } from '../render/bubbles';
import { MAX_ZOOM as FLAT_MAX_ZOOM } from '../render/camera';
import { FloatingBoard } from '../render/floating_text';
import { DecorClock, FrameScheduler } from '../render/frame_scheduler';
import { frameSignals } from '../render/frame_signals';
import { InterpBuffer } from '../render/interp';
import { buildMapContext, type MapContext } from '../render/map_context';
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
import { registerWindows, WindowManager } from '../windows';
import type { ClientSettings, DisplayView } from '../windows/window_context';
import { FixedStepClock, type Speed } from './clock';
import { EventRouter } from './event_router';
import { PlayerInput, type PlayerInputHost } from './player_input';
import type { LocalSettings, StoredView } from './settings_schema';

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
  /** replace this session with a loaded save */
  loadWorld(loaded: LoadedSave, greeting: string): void;
  toTitle(): void;
}

/** The slice of the settings store a session reads and writes. */
export interface SessionPrefs {
  readonly local: Readonly<Pick<LocalSettings, 'quality' | 'view'>>;
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
  private readonly sprites = new SpriteCache(400);
  private readonly looks = new WeakMap<Appearance, SpriteLook>();
  readonly hud: Hud;
  readonly windows: WindowManager;
  private input: InputController;
  private readonly actions: PlayerInput;
  private readonly router: EventRouter;
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
      maxSay: a.conversation?.maxSay ?? 200,
      conversation: {
        choose: (id) => this.queue(a.conversation?.choose(this.view, id)),
        say: (text) => this.queue(a.conversation?.say(this.view, text)),
        leave: () => this.actions.closeConversation(),
        advanceLoose: () => this.actions.advance(),
      },
      scene: {
        advance: () => this.queue(a.scene?.advance(this.view)),
        choose: (id) => this.queue(a.scene?.choose(this.view, id)),
        submit: (text) => this.queue(a.scene?.input(this.view, text)),
      },
      onHotbar: (slot) => this.actions.hotbar(slot),
      onToggleWindow: (id) => this.windows.toggle(id),
      onWarPrompt: () => this.windows.show('battle'),
    });

    this.windows = new WindowManager(opts.root, {
      flags: () => this.view.flags(),
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
      actions: {
        saveTo: (slot) => this.saveTo(slot),
        loadFrom: (slot) => this.loadFrom(slot),
        toTitle: () => opts.toTitle(),
        openWindow: (id) => this.windows.show(id),
        closeWindow: (id) => this.windows.close(id),
        beginPlacement: (siteId, defId, name) => this.beginPlacement(siteId, defId, name),
        select: (id) => this.select(id),
        display: () => this.display(),
        setQuality: (id) => this.setQuality(id),
        setViewPreset: (preset) => this.setViewPreset(preset),
      },
    });

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
      },
    );
    this.unsubscribe = opts.engine.onEvents((events) =>
      this.router.handle(events, performance.now()),
    );

    this.input = this.bindInput();

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

  private bindInput(): InputController {
    return new InputController(
      this.renderer.canvas,
      {
        intent: (i) => this.actions.intent(i),
        action: (act, b) => this.actions.action(act, b),
        click: (sx, sy, dbl) => this.actions.click(sx, sy, dbl),
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
        orbit: (dx, dy) => {
          if (this.renderer.kind === 'hd2d') this.setPrefs(orbit(this.prefs(), dx, dy));
        },
      },
      () => this.renderer.dpr,
    );
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
    cancelAnimationFrame(this.raf);
    clearTimeout(this.prefsTimer);
    if (this.viewPrefs) this.storeView();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('webglcontextrestored', this.onContextRestored, true);
    this.unsubscribe();
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
    const a = this.adapters;
    const sv = a.scene?.scene(this.view) ?? null;
    this.hud.scene.render(sv ? scenePanelModel(sv) : null);
    const conv = sv ? null : (a.conversation?.conversation(this.view) ?? null);
    this.hud.conversation.render(conv, sv ? null : this.loose.current);
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
    const { steps, alpha } = this.clock.advance(dt);
    for (let i = 0; i < steps; i++) {
      this.engine.step(1);
      this.capture();
      this.opts.hooks?.afterStep?.(this.engine);
    }
    if (steps > 0) this.actions.afterSteps();
    if (this.engine.logFull) this.autosaveAtSafePoint();
    this.alpha = alpha;
    this.present(now, dt);
    this.windows.frame(now);
    if (now - this.lastHud >= HUD_INTERVAL_MS) this.refreshHud(false, now);
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
    const ctx = this.mapCtx;
    if (!player || !ctx) return;
    const map = ctx.map;
    const entities: SceneEntityInput[] = [];
    const ids = new Set<string>();
    let playerPos = { x: player.x, y: player.y };
    const overhead = this.adapters.overhead;
    for (const e of this.view.entitiesOnMap(map.id)) {
      const pos = this.interp.sample(e.id, this.alpha) ?? { x: e.x, y: e.y };
      if (e.id === player.id) playerPos = pos;
      ids.add(e.id);
      const anim = this.anim.sample(
        {
          id: e.id,
          alive: e.alive,
          facing: e.facing,
          yawDeg: this.viewYaw(),
          moving: this.interp.moving(e.id),
          travelled: this.interp.travelled(e.id),
        },
        now,
      );
      const markers = overhead?.markers(this.view, e.id) ?? [];
      entities.push({
        entity: e,
        x: pos.x,
        y: pos.y,
        look: this.lookOf(e),
        anim,
        marker: topMarker(markers),
      });
    }
    this.anim.retain(ids);
    if (this.selection && !ids.has(this.selection)) this.select(null);

    const prefs = this.prefs();
    const view = {
      focusX: playerPos.x,
      focusY: playerPos.y,
      step: stepAt(prefs.stepIndex),
      pitch: prefs.pitch,
      yaw: this.viewYaw(),
    };

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
    // Paused, or a scene panel over the world: idle animation, weather and water hold still.
    const quiet = this.clock.paused || inScene;
    let exitHint: { x: number; y: number; text: string } | null = null;
    const exit = nearestExit(map, playerPos);
    if (exit) {
      const open = exitOpen(exit, (k) => flagOn(this.view.flag(k)));
      exitHint = {
        x: exit.x + 0.5,
        y: exit.y + 0.5,
        text: t(open ? 'ui.hud.prompt.exit' : 'ui.hud.prompt.exit_locked', { label: exit.label }),
      };
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
      calendar: this.view.calendar(),
      weather: this.view.weather(),
      entities,
      standees: ctx.layout.standees,
      staticLights: ctx.layout.lights,
      roofs: ctx.roofs,
      roofOpenness: (id) => this.roofs.openness(id),
      selection: this.selection,
      hover: this.hover,
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
  }

  private enterMap(): void {
    const map = this.view.currentMap();
    if (!map) return;
    if (this.mapCtx?.map.id === map.id) return;
    this.mapCtx = buildMapContext(map);
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
    const v = this.view;
    const a = this.adapters;
    const player = v.player();
    const pid = v.playerId();
    this.hud.playerFrame.update(player, 'self', a.unitFrames?.unitFrame(v, pid, pid) ?? null, '');
    const target = this.selection ? v.entity(this.selection) : undefined;
    this.hud.targetFrame.update(
      target,
      target ? relationOf(target, pid) : null,
      target ? (a.unitFrames?.unitFrame(v, target.id, pid) ?? null) : null,
      t('ui.hud.target.none'),
    );
    this.hud.clock.update(v.calendar(), v.weather(), this.clock.speed, this.clock.paused);
    const map = v.currentMap();
    this.hud.minimap.update(
      map,
      map ? v.entitiesOnMap(map.id) : [],
      pid,
      map ? (a.mapMarkers?.markers(v, map.id) ?? []) : [],
    );
    this.hud.menuBar.update(v.flags(), (id) => this.windows.isOpen(id));
    this.hud.hotbar.update(a.combat?.hotbar(v) ?? []);
    const pending = a.battle?.pending(v);
    this.hud.warPrompt.update(
      pending && !a.battle?.battle(v)
        ? t('ui.hud.warprompt.pending', { name: pending.name })
        : null,
    );
    this.hud.banner.update(now);
    this.hud.setPaused(this.clock.paused);
    this.renderStory();
    this.windows.update();
  }

  // -------------------------------------------------------------------------
  // Save and load

  saveTo(slot: SlotId): void {
    this.opts.saves.save(slot, this.saveInfo()).then(
      () => this.saveLine(t('ui.hud.log.saved', { slot: slotLabel(slot) })),
      (err) => this.saveFailed(err),
    );
  }

  loadFrom(slot: SlotId): void {
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
    if (!safe) return;
    this.opts.saves.autosave(this.saveInfo()).then(
      (meta) => this.saveLine(t('ui.hud.log.saved', { slot: slotLabel(meta.slot) })),
      (err) => this.saveFailed(err),
    );
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
}
