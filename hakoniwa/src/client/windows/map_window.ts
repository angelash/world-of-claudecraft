// Map window: the current map at a larger scale than the minimap, with exits and their
// labels, quest-related residents, the player, and visible units by relation.

import { el, setText } from '../../shared_ui/dom';
import { T } from '../../shared_ui/text';
import { DOT_COLORS, minimapMatrix, minimapScale } from '../hud/minimap_model';
import { ctx2d, makeCanvas, matrixToCanvas } from '../render/canvas_util';
import { relationOf } from '../render/scene';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

const BOX_W = 432;
const BOX_H = 340;

export function mapWindow(ctx: WindowContext): WindowContent {
  const canvas = makeCanvas(BOX_W, BOX_H);
  canvas.className = 'hk-map-canvas';
  const c = ctx2d(canvas);
  const title = el('div', { className: 'hk-card-head' });
  let mapId = '';
  let base: HTMLCanvasElement | null = null;
  const update = () => {
    const map = ctx.view.currentMap();
    c.fillStyle = '#101018';
    c.fillRect(0, 0, BOX_W, BOX_H);
    if (!map) return;
    if (map.id !== mapId) {
      mapId = map.id;
      base = matrixToCanvas(minimapMatrix(map));
      setText(title, map.name);
    }
    const s = minimapScale(map.width, map.height, BOX_W, BOX_H - 16);
    const ox = Math.floor((BOX_W - map.width * s) / 2);
    const oy = Math.floor((BOX_H - 16 - map.height * s) / 2);
    c.imageSmoothingEnabled = false;
    if (base) c.drawImage(base, ox, oy, map.width * s, map.height * s);
    const dot = (x: number, y: number, color: string, r: number) => {
      c.fillStyle = color;
      c.fillRect(Math.round(ox + x * s - r / 2), Math.round(oy + y * s - r / 2), r, r);
    };
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'center';
    for (const ex of map.exits) {
      dot(ex.x + 0.5, ex.y + 0.5, DOT_COLORS.exit, 6);
      c.fillStyle = '#f2d78a';
      c.fillText(ex.label, ox + (ex.x + 0.5) * s, oy + ex.y * s - 4);
    }
    const pid = ctx.view.playerId();
    for (const e of ctx.view.entitiesOnMap(map.id)) {
      if (e.hidden || !e.alive || e.kind === 'object' || e.id === pid) continue;
      dot(e.x, e.y, DOT_COLORS[relationOf(e, pid)], 4);
    }
    for (const m of ctx.adapters.mapMarkers?.markers(ctx.view, map.id) ?? []) {
      dot(m.x, m.y, '#f2c94c', 8);
      if (m.label) {
        c.fillStyle = '#fff2c8';
        c.fillText(m.label, ox + m.x * s, oy + m.y * s - 7);
      }
    }
    const p = ctx.view.player();
    if (p) {
      dot(p.x, p.y, '#101018', 9);
      dot(p.x, p.y, DOT_COLORS.self, 7);
      c.fillStyle = '#ffffff';
      c.fillText(T.mapWindow.you, ox + p.x * s, oy + p.y * s + 16);
    }
  };
  return {
    el: el('div', { className: 'hk-map' }, [
      title,
      canvas,
      el('div', { className: 'hk-muted', text: T.mapWindow.legend }),
    ]),
    update,
  };
}
