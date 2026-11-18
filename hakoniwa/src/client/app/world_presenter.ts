// What the session adds to the world picture each frame beyond the entities (PK-M1-24): the
// map context of the player's live map (switch tiles painted in, rebuilt with a fade when one
// opens or closes; the far-sky pack from the atlas), the local sediment haze eased over two
// seconds, the combat marks and ground warnings, and the scene's stage (camera, light,
// weather, court mirror, motions). Thin glue over the pure cores in src/client/render/.

import type { AtlasMapDef } from '../../systems/world/atlas';
import type { Entity, MapDef } from '../../systems/world/types';
import type { AnimSample } from '../render/anim_state';
import { type EntityMarks, type GroundWarning, NO_MARKS } from '../render/combat_marks';
import { buildMapContext, type MapContext } from '../render/map_context';
import { sedimentLevel } from '../render/scene';
import { SedimentFader } from '../render/sediment_fade';
import { liveMapOf, SwitchFader, type SwitchFadeState } from '../render/switch_fade';
import type { ClientAdapters } from '../view/adapters';
import type { GameView } from '../view/game_view';
import { type StagePicture, StagePresenter } from './stage_presenter';

export class WorldPresenter {
  private readonly stage: StagePresenter;
  private readonly switches = new SwitchFader();
  private readonly sediment = new SedimentFader();
  private marks = new Map<string, EntityMarks>();
  private warnings: GroundWarning[] = [];
  /** the tick and map the marks were read for: they change with the world, not per frame */
  private marksAt = '';
  private picture: StagePicture | null = null;

  constructor(
    root: HTMLElement,
    private readonly view: GameView,
    private readonly adapters: ClientAdapters,
  ) {
    this.stage = new StagePresenter(root);
  }

  private atlasSky(mapId: string): string | undefined {
    const atlas = (this.view.content as { atlas_maps?: readonly AtlasMapDef[] }).atlas_maps;
    return atlas?.find((a) => a.id === mapId)?.sky;
  }

  /** The render context of a map as the flags leave it now. */
  contextFor(map: MapDef, now: number): MapContext {
    const live = liveMapOf(map, this.view.flags());
    this.switches.update(map, live.closed, now);
    return buildMapContext(live.map, { switchKey: live.key, atlasSky: this.atlasSky(map.id) });
  }

  /**
   * A new context when a switch on the player's map opened or closed since the last call
   * (the renderers fade the change), else null.
   */
  switchChange(content: MapDef, now: number): MapContext | null {
    const live = liveMapOf(content, this.view.flags());
    if (!this.switches.update(content, live.closed, now)) return null;
    return buildMapContext(live.map, { switchKey: live.key, atlasSky: this.atlasSky(content.id) });
  }

  switchFade(now: number): SwitchFadeState | null {
    return this.switches.state(now);
  }

  /** The sediment haze to draw where the camera looks, eased over two seconds. */
  sedimentAt(map: MapDef, focus: { x: number; y: number }, now: number): number {
    return this.sediment.value(map.id, sedimentLevel(map, focus.x, focus.y), now);
  }

  /** Refresh the combat marks of the map when the world has moved on (once per tick). */
  readMarks(mapId: string, onMap: readonly Readonly<Entity>[]): void {
    const at = `${mapId}@${this.view.tick}`;
    if (at === this.marksAt) return;
    this.marksAt = at;
    const wm = this.adapters.combat?.worldMarks?.(this.view, mapId, onMap);
    this.marks = wm?.marks ?? new Map();
    this.warnings = wm?.warnings ?? [];
  }

  marksOf(entityId: string): EntityMarks {
    return this.marks.get(entityId) ?? NO_MARKS;
  }

  groundWarnings(): GroundWarning[] {
    return this.warnings;
  }

  /** Compute the stage picture of this frame (null stage: the world's own picture). */
  readStage(i: Parameters<StagePresenter['frame']>[0]): StagePicture {
    this.picture = this.stage.frame(i);
    return this.picture;
  }

  /** An entity's frame under a staged motion, else its own. */
  animOf(
    e: Readonly<Entity>,
    base: AnimSample,
    pos: { x: number; y: number },
    player: { x: number; y: number } | null,
    yawDeg: number,
    pitchDeg: number | undefined,
    now: number,
  ): AnimSample {
    const m = this.picture?.motions.get(e.id);
    return m ? this.stage.motionFrame(m, now, base, pos, player, yawDeg, pitchDeg) : base;
  }

  dispose(): void {
    this.stage.dispose();
  }
}
