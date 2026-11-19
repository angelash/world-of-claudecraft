// Minimap: the current map at one pixel per tile (baked once per map), entity dots by
// relation, exits, and phase-2 map markers. Redrawn a few times per second.

import { el } from '../../shared_ui/dom';
import type { Entity, MapDef } from '../../systems/world/types';
import { ctx2d, makeCanvas, matrixToCanvas } from '../render/canvas_util';
import { relationOf } from '../render/scene';
import type { MapMarkerView } from '../view/adapters';
import { contentNames } from '../view/content_names';
import { dotColor, minimapMatrix, minimapScale } from './minimap_model';

export class Minimap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private mapId = '';
  private title = el('div', { className: 'hk-minimap-title' });

  constructor(
    private readonly boxW = 176,
    private readonly boxH = 132,
  ) {
    this.canvas = makeCanvas(boxW, boxH);
    this.canvas.className = 'hk-minimap-canvas';
    this.ctx = ctx2d(this.canvas);
    this.el = el('div', { className: 'hk-panel hk-minimap' }, [this.title, this.canvas]);
  }

  update(
    map: MapDef | undefined,
    entities: readonly Readonly<Entity>[],
    playerId: string,
    markers: readonly MapMarkerView[],
  ): void {
    const c = this.ctx;
    c.fillStyle = '#101018';
    c.fillRect(0, 0, this.boxW, this.boxH);
    if (!map) return;
    if (map.id !== this.mapId) {
      this.mapId = map.id;
      this.base = matrixToCanvas(minimapMatrix(map));
      this.title.textContent = contentNames.map(map);
    }
    const s = minimapScale(map.width, map.height, this.boxW, this.boxH);
    const w = map.width * s;
    const h = map.height * s;
    const ox = Math.floor((this.boxW - w) / 2);
    const oy = Math.floor((this.boxH - h) / 2);
    c.imageSmoothingEnabled = false;
    if (this.base) c.drawImage(this.base, ox, oy, w, h);
    const dot = (x: number, y: number, color: string, r: number) => {
      c.fillStyle = color;
      c.fillRect(Math.round(ox + x * s - r / 2), Math.round(oy + y * s - r / 2), r, r);
    };
    for (const ex of map.exits) dot(ex.x + 0.5, ex.y + 0.5, dotColor('exit'), 4);
    for (const m of markers) dot(m.x, m.y, m.kind === 'danger' ? dotColor('danger') : '#f2c94c', 4);
    let self: Readonly<Entity> | undefined;
    for (const e of entities) {
      if (e.hidden || !e.alive || e.kind === 'object') continue;
      if (e.id === playerId) {
        self = e;
        continue;
      }
      dot(e.x, e.y, dotColor(relationOf(e, playerId)), 3);
    }
    if (self) {
      dot(self.x, self.y, '#101018', 6);
      dot(self.x, self.y, dotColor('self'), 4);
    }
  }
}
