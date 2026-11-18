// The world side of a scene's stage (catalog_cutscenes.md 2.3 and 13.5; PK-M1-24): turns the
// camera, light, weather, court-mirror and motion directives the story layer recorded into
// the view, calendar, weather, mood and standee frames the session hands the renderer, and
// shows the court mirror: another atlas map in an oval of water, a small flat render of it
// redrawn with its water frames for at most twenty seconds; a map that cannot be shown falls
// back to its region's far sky. Directives the picture cannot carry out keep the current
// picture. Only a staged scene (the in-world presentation, 13.1) keeps the world moving under
// it; theater and illustration scenes hold it still as before. Thin: the rules live in
// src/client/render/stage_direct.ts.

import './stage_presenter.css';
import type { Calendar } from '../../core/time';
import type { ScenePresentation } from '../../systems/scenes/types';
import type { AtlasMapDef } from '../../systems/world/atlas';
import type { Entity, MapDef, Weather } from '../../systems/world/types';
import { cachedSkyLayer, skyPackFor } from '../hd2d/sky';
import type { ViewRequest } from '../hd2d/view';
import { screenFacing } from '../hd2d/view';
import type { StageState } from '../hud/story/stage';
import type { AnimSample } from '../render/anim_state';
import { matrixToCanvas } from '../render/canvas_util';
import { FlatWorldRenderer } from '../render/flat_renderer';
import { buildMapContext, type MapContext } from '../render/map_context';
import { buildScene, type LightMood } from '../render/scene';
import { mirrorShown, motionSample, resolveStageRef, StageDirector } from '../render/stage_direct';
import { liveMapOf } from '../render/switch_fade';
import { WATER_FRAMES } from '../render/tile_art';
import { dirFromFacing } from '../sprites/anim_spec';
import { lookFromEntity } from '../sprites/look';
import type { GameView } from '../view/game_view';

/** The court mirror redraws once per water frame (tile_art's 650 ms beat). */
const MIRROR_FRAME_MS = 650;
const MIRROR_CSS = { w: 320, h: 200 };

export interface StagePicture {
  /** the shot, or null when the camera is the player's */
  view: ViewRequest | null;
  calendar: Calendar;
  weather: Weather;
  weatherFade: { from: Weather; t: number } | null;
  mood: { kind: LightMood; k: number } | null;
  /** entity id to the motion it plays (resolved from the directive's `who`) */
  motions: Map<string, { action: string; start: number }>;
  /** a staged scene directs the world: it keeps moving under the scene */
  staged: boolean;
}

function mirrorRoot(): HTMLElement {
  const n = document.createElement('div');
  n.className = 'hk-court-mirror';
  n.setAttribute('aria-hidden', 'true');
  return n;
}

export class StagePresenter {
  private readonly director = new StageDirector();
  private mirror: {
    root: HTMLElement;
    key: string;
    flat: FlatWorldRenderer | null;
    ctx: MapContext | null;
    beat: number;
  } | null = null;

  constructor(private readonly host: HTMLElement) {}

  /** This frame's stage picture over the world's own state. */
  frame(i: {
    stage: StageState | null;
    presentation: ScenePresentation | null;
    now: number;
    view: GameView;
    map: MapDef;
    entities: readonly Readonly<Entity>[];
    playerId: string;
    calendar: Calendar;
    weather: Weather;
    deviceH: number;
  }): StagePicture {
    const s = i.stage;
    const ref = (r: string | undefined) =>
      resolveStageRef(r, { playerId: i.playerId, entities: i.entities, map: i.map });
    const shot = this.director.view(s?.camera ?? null, i.now, ref, i.deviceH);
    const calendar = this.director.calendar(i.calendar, s?.light ?? null, i.now);
    const w = this.director.weather(i.weather, s?.weather ?? null, i.now);
    const mood = this.director.mood(s?.light ?? null, s?.weather ?? null, i.now);
    const motions = new Map<string, { action: string; start: number }>();
    for (const m of s?.motions ?? []) {
      const at = ref(m.who);
      if (at?.id) motions.set(at.id, { action: m.action, start: m.start });
    }
    this.paintMirror(s?.mirror ?? null, i.now, i.view, calendar);
    const directs = !!s && (!!s.camera || !!s.light || !!s.weather || s.motions.length > 0);
    return {
      view: shot,
      calendar,
      weather: w.weather,
      weatherFade: w.fade,
      mood,
      motions,
      staged: directs && i.presentation === 'staged',
    };
  }

  /** The frame of an entity in a staged motion, facing toward or away from the player. */
  motionFrame(
    motion: { action: string; start: number },
    now: number,
    base: AnimSample,
    from: { x: number; y: number },
    player: { x: number; y: number } | null,
    yawDeg: number,
    pitchDeg?: number,
  ): AnimSample {
    let toward = null;
    if (player && (player.x !== from.x || player.y !== from.y)) {
      const facing = Math.atan2(player.y - from.y, player.x - from.x);
      toward = dirFromFacing(screenFacing(facing, yawDeg, pitchDeg));
    }
    return motionSample(motion.action, now - motion.start, base, toward);
  }

  private paintMirror(
    m: StageState['mirror'],
    now: number,
    view: GameView,
    calendar: Calendar,
  ): void {
    if (!m || !mirrorShown(m, now)) {
      this.closeMirror();
      return;
    }
    const target = view.map(m.map);
    const key = `${m.map}@${m.start}`;
    if (!this.mirror || this.mirror.key !== key) {
      this.closeMirror();
      const root = mirrorRoot();
      this.host.append(root);
      let flat: FlatWorldRenderer | null = null;
      let ctx: MapContext | null = null;
      if (target) {
        try {
          const live = liveMapOf(target, view.flags());
          ctx = buildMapContext(live.map, { switchKey: live.key });
          flat = new FlatWorldRenderer();
          flat.resize(MIRROR_CSS.w, MIRROR_CSS.h, 1);
          flat.mount(root);
          flat.setMap(ctx);
        } catch {
          flat?.dispose();
          flat = null;
        }
      }
      if (!flat) {
        // the region's far sky stands in (13.5)
        const atlas = (view.content as { atlas_maps?: readonly AtlasMapDef[] }).atlas_maps;
        const entry = atlas?.find((a) => a.id === m.map);
        const pack =
          (target ? skyPackFor(target) : null) ??
          skyPackFor({ region: entry?.region ?? '', style: entry?.style }, entry?.sky) ??
          'lothar_plain';
        const strip = matrixToCanvas(cachedSkyLayer(pack, 'far'));
        strip.className = 'hk-court-mirror-sky';
        root.append(strip);
      }
      this.mirror = { root, key, flat, ctx, beat: -1 };
    }
    const mr = this.mirror;
    const beat = Math.floor(now / MIRROR_FRAME_MS) % WATER_FRAMES;
    if (!mr.flat || !mr.ctx || beat === mr.beat) return;
    mr.beat = beat;
    const map = mr.ctx.map;
    const ents = view.entitiesOnMap(map.id).map((e) => ({
      entity: e,
      x: e.x,
      y: e.y,
      look: lookFromEntity(e),
      anim: { anim: 'idle' as const, dir: dirFromFacing(e.facing), frame: 0 },
      marker: null,
    }));
    mr.flat.render(
      buildScene({
        map,
        view: { focusX: map.width / 2, focusY: map.height / 2, step: 1, pitch: 90, yaw: 0 },
        timeMs: beat * MIRROR_FRAME_MS,
        playerId: '',
        calendar,
        weather: 'clear',
        entities: ents,
        standees: mr.ctx.layout.standees,
        roofs: [],
        roofOpenness: () => 1,
        selection: null,
        hover: null,
        bubbles: [],
      }),
    );
  }

  private closeMirror(): void {
    if (!this.mirror) return;
    this.mirror.flat?.dispose();
    this.mirror.root.remove();
    this.mirror = null;
  }

  dispose(): void {
    this.closeMirror();
  }
}
