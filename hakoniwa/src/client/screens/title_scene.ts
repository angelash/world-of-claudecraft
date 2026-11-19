// A frozen save rendered by the game's real renderer. There is no Engine, command queue,
// ticking, autosave or model runner here. Only camera/sky presentation may move.

import { buildContent } from '../../content';
import { calendarAt } from '../../core/time';
import { el } from '../../shared_ui/dom';
import { currentWeather, playerEntity } from '../../systems/world';
import type { Entity, Weather } from '../../systems/world/types';
import { createWorldRenderer, type QualityId, resolveQuality } from '../hd2d';
import type { ClientSaves, SlotId } from '../hud/save_slots';
import { buildMapContext } from '../render/map_context';
import type { WorldRenderer } from '../render/renderer';
import { buildScene, type SceneEntityInput } from '../render/scene';
import { lookFromEntity } from '../sprites/look';
import { latestTitleSlot } from './title_model';
import { titleCamera } from './title_scene_model';

const COVER_PREFIX = 'hk.title.cover.';
const COVER_LIMIT = 600_000;

export interface TitleSceneOptions {
  quality: QualityId;
  calm: boolean;
  storage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  } | null;
}

export class TitleScene {
  readonly el = el('div', { className: 'hk-title-scene', attrs: { 'aria-hidden': 'true' } });
  private renderer: WorldRenderer | null = null;
  private disposed = false;
  private raf = 0;
  private cover: HTMLImageElement | null = null;
  private coverSaved = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    parent: HTMLElement,
    saves: ClientSaves,
    private readonly options: TitleSceneOptions,
  ) {
    parent.prepend(this.el);
    void this.prepare(saves);
  }

  private showCover(slot: SlotId | null): void {
    try {
      const data = this.options.storage?.getItem(`${COVER_PREFIX}${slot ?? 'opening'}`);
      if (data && data.length <= COVER_LIMIT && /^data:image\/(png|jpeg|webp);base64,/.test(data)) {
        this.cover = el('img', { className: 'hk-title-cover', attrs: { src: data, alt: '' } });
        this.el.append(this.cover);
      }
    } catch {
      /* A missing cover never blocks the title. */
    }
  }

  private async prepare(saves: ClientSaves): Promise<void> {
    const latest = latestTitleSlot(saves.list(), saves.problems());
    this.showCover(latest?.slot ?? null);
    try {
      const content = buildContent();
      let map = content.maps.find((m) => m.id === 'antechamber') ?? content.maps[0];
      let tick = 0;
      let weather: Weather = 'clear';
      let figures: Readonly<Entity>[] = [];
      let p: Readonly<Entity> | undefined;
      if (latest?.meta && !latest.problem) {
        try {
          const loaded = await saves.load(latest.slot);
          const world = loaded.world;
          p = playerEntity(world);
          const savedMap = p && content.maps.find((m) => m.id === p?.mapId);
          if (savedMap) {
            map = savedMap;
            tick = world.meta.tick;
            const ids = new Set([
              p?.id,
              ...Object.values(world.slices.party?.members ?? {})
                .filter(
                  (m) => m.state === undefined || m.state === 'party' || m.state === 'waiting',
                )
                .map((m) => m.entityId),
            ]);
            figures = Object.values(world.slices.world.entities).filter(
              (e) => ids.has(e.id) && e.mapId === savedMap.id && !e.hidden,
            );
            weather = currentWeather(world);
          }
        } catch {
          /* Corrupt saves use the opening picture; the load button handles recovery. */
        }
      }
      if (this.disposed || !map) return;
      const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      const quality = resolveQuality(this.options.quality, { touch, webgl: true });
      const renderer = createWorldRenderer(quality);
      this.renderer = renderer;
      renderer.mount(this.el);
      const context = buildMapContext(map);
      renderer.setMap(context);
      const center =
        p?.mapId === map.id
          ? p
          : (map.locations.find((l) => l.kind === 'safe') ?? {
              x: map.width / 2,
              y: map.height / 2,
            });
      const entities: SceneEntityInput[] = figures.map((entity) => ({
        entity,
        x: entity.x,
        y: entity.y,
        look: lookFromEntity(entity),
        anim: { anim: 'idle', dir: 'down', frame: 0 },
        marker: null,
      }));
      const started = performance.now();
      let lastDraw = -1;
      const motion = !this.options.calm && !touch && renderer.kind === 'hd2d';
      const resize = () => {
        renderer.resize(
          Math.max(1, this.el.clientWidth),
          Math.max(1, this.el.clientHeight),
          Math.min(devicePixelRatio || 1, quality.maxPixelRatio),
        );
        lastDraw = -1;
      };
      this.resizeObserver = new ResizeObserver(resize);
      this.resizeObserver.observe(this.el);
      resize();
      const draw = (now: number) => {
        if (this.disposed) return;
        this.raf = requestAnimationFrame(draw);
        const elapsed = Math.max(0, now - started);
        if ((document.hidden || !document.hasFocus()) && lastDraw >= 0) return;
        const captureDue = elapsed >= 2000 && !this.coverSaved;
        if (lastDraw >= 0 && !captureDue && (!motion || now - lastDraw < 1000 / 24)) return;
        const camera = titleCamera(elapsed, map.width, motion);
        const scene = buildScene({
          map,
          view: {
            focusX: center.x + camera.offsetX,
            focusY: center.y,
            step: renderer.kind === 'flat' ? 2 : 3 / camera.widthScale,
            pitch: 36,
            yaw: 0,
          },
          timeMs: motion ? elapsed : 0,
          playerId: p?.id ?? '',
          calendar: calendarAt(tick),
          weather,
          entities,
          standees: context.layout.standees,
          roofs: context.roofs,
          roofOpenness: () => 0,
          staticLights: context.layout.lights,
          selection: null,
          hover: null,
          bubbles: [],
        });
        try {
          renderer.render(scene);
        } catch (error) {
          // An unavailable GPU picture must leave the cover and all title controls usable.
          console.warn('[title] drawing unavailable', error);
          cancelAnimationFrame(this.raf);
          this.resizeObserver?.disconnect();
          renderer.dispose();
          this.renderer = null;
          return;
        }
        lastDraw = now;
        this.cover?.classList.add('ready');
        if (elapsed >= 2000 && !this.coverSaved) {
          this.coverSaved = true;
          this.saveCover(latest?.slot ?? null);
        }
      };
      this.raf = requestAnimationFrame(draw);
    } catch (error) {
      console.warn('[title] background unavailable', error);
      cancelAnimationFrame(this.raf);
      this.resizeObserver?.disconnect();
      this.renderer?.dispose();
      this.renderer = null;
    }
  }

  private saveCover(slot: SlotId | null): void {
    try {
      if (!this.options.storage) return;
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 226;
      const paint = canvas.getContext('2d');
      if (!paint) return;
      // The HD-2D renderer keeps its world and overlay on separate canvases.
      for (const source of this.el.querySelectorAll('canvas'))
        paint.drawImage(source, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.82);
      if (data.length <= COVER_LIMIT)
        this.options.storage.setItem(`${COVER_PREFIX}${slot ?? 'opening'}`, data);
    } catch {
      /* Storage or canvas failures preserve the live picture and working menu. */
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.renderer?.dispose();
    this.el.remove();
  }
}
