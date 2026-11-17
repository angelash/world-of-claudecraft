// Where the dungeons are, pure: the form of a pressure (catalog_dungeons_bosses.md 1.1), the
// party cap of a record (1.4), and which dungeon floor a point of a map lies on. A floor is
// a whole map, or a location rectangle of one; the smallest area floor holding the point
// wins over the whole-map floor. The floor index is built once per content table.

import type { ContentMap } from '../../core/contracts';
import type { LocationDef, MapDef } from '../world/types';
import type {
  DungeonConfig,
  DungeonDef,
  DungeonForm,
  FloorDef,
  FormDef,
  NestDef,
  PlaceRef,
} from './types';

type Content = Pick<ContentMap, 'dungeons' | 'nests' | 'dungeonConfig' | 'maps'>;

export function dungeonConfig(content: Partial<Content>): DungeonConfig | undefined {
  return content.dungeonConfig;
}

export function dungeonDef(content: Partial<Content>, id: string): DungeonDef | undefined {
  return (content.dungeons ?? []).find((d) => d.id === id);
}

export function nestDef(content: Partial<Content>, id: string): NestDef | undefined {
  return (content.nests ?? []).find((n) => n.id === id);
}

/** The forms by rising pressure floor. */
function formsByFloor(cfg: DungeonConfig): FormDef[] {
  return [...cfg.forms].sort((a, b) => a.minPressure - b.minPressure);
}

/** The form of a pressure: the highest form whose floor it reaches (the lowest below all). */
export function formOf(cfg: DungeonConfig, pressure: number): DungeonForm {
  const forms = formsByFloor(cfg);
  let out = forms[0]?.id ?? 'lair';
  for (const f of forms) if (pressure >= f.minPressure) out = f.id;
  return out;
}

/** The pressure band of a form: [floor, next floor - 1] (the top form has no ceiling). */
export function formBand(cfg: DungeonConfig, form: DungeonForm): [number, number] | undefined {
  const forms = formsByFloor(cfg);
  const i = forms.findIndex((f) => f.id === form);
  if (i < 0) return undefined;
  const next = forms[i + 1];
  return [forms[i]?.minPressure ?? 0, next ? next.minPressure - 1 : Number.POSITIVE_INFINITY];
}

/** The starting pressure of a record: its own, else the floor of its form's band. */
export function startPressure(cfg: DungeonConfig, def: DungeonDef): number {
  return def.pressure ?? formBand(cfg, def.form)?.[0] ?? 0;
}

/**
 * Companions a dungeon allows besides the player: the record's own cap, else the cap of
 * the form it has now (its pressure, when given: a nurtured core grows into the next
 * form), else of the form it is written at.
 */
export function partyCap(cfg: DungeonConfig, def: DungeonDef, pressure?: number): number {
  if (def.party !== undefined) return def.party;
  const form = pressure === undefined ? def.form : formOf(cfg, pressure);
  return cfg.forms.find((f) => f.id === form)?.party ?? 0;
}

export function locationOf(map: MapDef | undefined, id: string): LocationDef | undefined {
  return map?.locations.find((l) => l.id === id);
}

/** Whether a point lies in a location's rectangle, grown by `margin` tiles. */
export function inRect(l: LocationDef, x: number, y: number, margin = 0): boolean {
  return x >= l.x - margin && x < l.x + l.w + margin && y >= l.y - margin && y < l.y + l.h + margin;
}

/** The centre of a place, or undefined when the map or location is unknown. */
export function placeCentre(
  content: Pick<ContentMap, 'maps'>,
  p: PlaceRef,
): { x: number; y: number } | undefined {
  const l = locationOf(
    content.maps.find((m) => m.id === p.mapId),
    p.location,
  );
  return l ? { x: l.x + l.w / 2, y: l.y + l.h / 2 } : undefined;
}

/** One floor where it stands: the record, the floor and its rectangle (area floors only). */
export interface FloorHit {
  dungeon: DungeonDef;
  floor: FloorDef;
  rect?: LocationDef;
}

/** Floor indexes by dungeon table, then by map table (the area rectangles live on the maps). */
const indexes = new WeakMap<
  readonly DungeonDef[],
  WeakMap<readonly MapDef[], Map<string, FloorHit[]>>
>();

/** The floors on each map, area floors first (smallest first), the map's own floor last. */
function floorIndex(content: Content): Map<string, FloorHit[]> {
  const rows = content.dungeons ?? [];
  let byMaps = indexes.get(rows);
  if (!byMaps) {
    byMaps = new WeakMap();
    indexes.set(rows, byMaps);
  }
  let index = byMaps.get(content.maps);
  if (index) return index;
  index = new Map();
  for (const d of rows)
    for (const f of d.floors) {
      const map = content.maps.find((m) => m.id === f.mapId);
      const rect = f.area ? locationOf(map, f.area) : undefined;
      if (f.area && !rect) continue;
      const list = index.get(f.mapId) ?? [];
      list.push(rect ? { dungeon: d, floor: f, rect } : { dungeon: d, floor: f });
      index.set(f.mapId, list);
    }
  for (const list of index.values())
    list.sort((a, b) => {
      const sa = a.rect ? a.rect.w * a.rect.h : Number.POSITIVE_INFINITY;
      const sb = b.rect ? b.rect.w * b.rect.h : Number.POSITIVE_INFINITY;
      return sa - sb;
    });
  byMaps.set(content.maps, index);
  return index;
}

/** Whether any dungeon floor lies on the map. */
export function isFloorMap(content: Content, mapId: string): boolean {
  return floorIndex(content).has(mapId);
}

/** Whether the map has floors narrowed to areas (the floor can change without a map change). */
export function hasAreaFloors(content: Content, mapId: string): boolean {
  return (floorIndex(content).get(mapId) ?? []).some((h) => !!h.rect);
}

/**
 * The dungeon floor at a point, or undefined outside every dungeon; `keep` limits the
 * dungeons considered (the standing ones, one dungeon).
 */
export function floorAt(
  content: Content,
  mapId: string,
  x: number,
  y: number,
  keep?: (d: DungeonDef) => boolean,
): FloorHit | undefined {
  const list = floorIndex(content).get(mapId);
  if (!list) return undefined;
  return list.find((h) => (!h.rect || inRect(h.rect, x, y)) && (!keep || keep(h.dungeon)));
}

/** The floor of a record holding its entry place. */
export function entryFloor(content: Content, def: DungeonDef): FloorDef | undefined {
  const at = placeCentre(content, def.entry);
  if (!at) return undefined;
  const hit = floorAt(content, def.entry.mapId, at.x, at.y);
  return hit?.dungeon.id === def.id ? hit.floor : undefined;
}
