// One running game in the browser: owns the engine loop (20 Hz fixed step with 1x, 2x,
// 4x and pause), render interpolation, the renderer, input, HUD and windows. It wires
// modules together and keeps per-session state (selection, zoom, map caches, placement
// mode); the rules live in the pure modules and adapters it calls. Player input is
// translated in ./player_input.ts.

import type { Engine } from '../../core/engine';
import type { World } from '../../core/world';
import { fmt, T } from '../../shared_ui/text';
import type { Appearance } from '../../systems/world/types';
import { DialogueQueue } from '../hud/dialogue_queue';
import { Hud } from '../hud/hud';
import { isQuotaError, type SaveStore, type SlotId, slotLabel } from '../hud/save_slots';
import { scenePanelModel } from '../hud/scene_model';
import { InputController } from '../input/input_controller';
import { exitOpen, nearestExit, pickEntity } from '../input/picking';
import { AnimTracker } from '../render/anim_state';
import { BubbleBoard } from '../render/bubbles';
import { type Camera, clampZoom, defaultZoom, followCamera, screenToWorld } from '../render/camera';
import { CanvasWorldRenderer } from '../render/canvas_renderer';
import { FloatingBoard } from '../render/floating_text';
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
import type { ClientSettings } from '../windows/window_context';
import { FixedStepClock, type Speed } from './clock';
import { EventRouter } from './event_router';
import { PlayerInput, type PlayerInputHost } from './player_input';

export interface SessionHooks {
  /** after every simulation tick */
  afterStep?(engine: Engine): void;
}

export interface SessionOptions {
  engine: Engine;
  root: HTMLElement;
  devMode: boolean;
  adapters: ClientAdapters;
  saves: SaveStore;
  settings: ClientSettings;
  hooks?: SessionHooks;
  /** first message-log line (for example "loaded slot 2") */
  greeting?: string;
  /** replace this session with a loaded world */
  loadWorld(world: World, greeting: string): void;
  toTitle(): void;
}

const HUD_INTERVAL_MS = 250;

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
  readonly renderer: WorldRenderer;
  readonly clock = new FixedStepClock();
  private readonly interp = new InterpBuffer();
  private readonly anim = new AnimTracker();
  private readonly bubbles = new BubbleBoard();
  private readonly floats = new FloatingBoard();
  private readonly roofs = new RoofFader();
  readonly loose = new DialogueQueue();
  private readonly sprites = new SpriteCache(400);
  private readonly looks = new WeakMap<Appearance, SpriteLook>();
  readonly hud: Hud;
  readonly windows: WindowManager;
  private readonly input: InputController;
  private readonly actions: PlayerInput;
  private readonly router: EventRouter;
  private readonly unsubscribe: () => void;
  private mapCtx: MapContext | null = null;
  zoom = 0;
  camera: Camera | null = null;
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

  constructor(private readonly opts: SessionOptions) {
    this.engine = opts.engine;
    this.adapters = opts.adapters;
    this.view = createGameView(opts.engine);
    this.commands = createGameCommands(opts.engine);
    const canvas = document.createElement('canvas');
    canvas.className = 'hk-world';
    opts.root.append(canvas);
    this.renderer = new CanvasWorldRenderer(canvas);
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

    this.input = new InputController(
      canvas,
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
        zoom: (d) => this.setZoom(this.zoom + d),
      },
      () => this.renderer.dpr,
    );

    window.addEventListener('resize', this.onResize);
    this.resize();
    this.enterMap();
    if (opts.greeting) this.hud.log.push({ text: opts.greeting, category: 'system' });
    if (a.trade?.session(this.view)) this.windows.show('trade');
    this.renderStory();
    this.refreshHud(true);
  }

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
    window.removeEventListener('resize', this.onResize);
    this.unsubscribe();
    this.input.dispose();
    this.windows.dispose();
    this.hud.dispose();
    this.renderer.dispose();
    this.renderer.canvas.remove();
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

  setZoom(z: number): void {
    this.zoom = clampZoom(z);
  }

  togglePause(): void {
    this.clock.togglePause();
    this.input.releaseAll();
    this.hud.setPaused(this.clock.paused);
    this.refreshHud(true);
  }

  worldPoint(sx: number, sy: number): { x: number; y: number } | null {
    return this.camera ? screenToWorld(this.camera, sx, sy) : null;
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
    this.logLine(fmt(T.territory.placing, { name }));
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
    const t = this.adapters.territory;
    const w = this.worldPoint(sx, sy);
    if (!pl || !t || !w) return;
    const def = t.buildMenu(this.view, pl.siteId).find((b) => b.id === pl.defId);
    const x = Math.floor(w.x) - Math.floor((def?.w ?? 1) / 2);
    const y = Math.floor(w.y) - Math.floor((def?.h ?? 1) / 2);
    if (x === pl.x && y === pl.y) return;
    pl.x = x;
    pl.y = y;
    const r = t.preview(this.view, pl.siteId, pl.defId, x, y);
    pl.preview = r.ok
      ? { ok: true, tiles: r.tiles, blocked: [], entrance: r.entrance, label: T.territory.canPlace }
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
    this.alpha = alpha;
    this.draw(now, dt);
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

  private draw(now: number, dt: number): void {
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

    const r = this.renderer;
    if (!this.zoom) this.zoom = defaultZoom(r.deviceW, r.deviceH);
    const at = followCamera(playerPos, map.width, map.height, r.deviceW, r.deviceH, this.zoom);
    this.camera = { zoom: this.zoom, x: at.x, y: at.y, viewW: r.deviceW, viewH: r.deviceH };

    this.roofs.update(dt, roofsToOpen(ctx.roofs, playerPos), ctx.roofs);

    let exitHint: { x: number; y: number; text: string } | null = null;
    const exit = nearestExit(map, playerPos);
    if (exit) {
      const open = exitOpen(exit, (k) => flagOn(this.view.flag(k)));
      exitHint = {
        x: exit.x + 0.5,
        y: exit.y + 0.5,
        text: fmt(open ? T.prompts.exit : T.prompts.exitLocked, { label: exit.label }),
      };
    } else {
      const near = this.adapters.interact?.nearestTalkable(this.view);
      const ne = near ? this.view.entity(near) : undefined;
      if (ne) exitHint = { x: ne.x, y: ne.y - 1.6, text: T.prompts.talk };
    }

    const scene = buildScene(
      {
        map,
        camera: this.camera,
        timeMs: now,
        playerId: player.id,
        calendar: this.view.calendar(),
        weather: this.view.weather(),
        entities,
        props: ctx.props,
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
        exitHint: this.inScene() ? null : exitHint,
        placement: this.placing?.preview ?? null,
      },
      ctx.lights,
    );
    r.render(scene);
  }

  private enterMap(): void {
    const map = this.view.currentMap();
    if (!map) return;
    if (this.mapCtx?.map.id === map.id) return;
    this.mapCtx = buildMapContext(map);
    this.renderer.setMap(map);
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
    this.zoom = clampZoom(this.zoom || defaultZoom(this.renderer.deviceW, this.renderer.deviceH));
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
      T.frames.noTarget,
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
      pending && !a.battle?.battle(v) ? fmt(T.warPrompt.pending, { name: pending.name }) : null,
    );
    this.hud.banner.update(now);
    this.hud.setPaused(this.clock.paused);
    this.renderStory();
    this.windows.update();
  }

  // -------------------------------------------------------------------------
  // Save and load

  saveTo(slot: SlotId): void {
    const map = this.view.currentMap();
    try {
      this.opts.saves.save(slot, this.engine.world, map?.name ?? '', new Date().toISOString());
      this.logLine(fmt(T.log.saved, { slot: slotLabel(slot) }));
    } catch (err) {
      const reason = isQuotaError(err) ? T.saves.quota : String((err as Error)?.message ?? err);
      this.logLine(fmt(T.saves.failed, { reason }), 'warning');
    }
  }

  loadFrom(slot: SlotId): void {
    try {
      const world = this.opts.saves.load(slot);
      if (!world) return;
      this.opts.loadWorld(world, fmt(T.log.loaded, { slot: slotLabel(slot) }));
    } catch (err) {
      this.logLine(
        fmt(T.saves.loadFailed, { reason: String((err as Error)?.message ?? err) }),
        'warning',
      );
    }
  }
}
