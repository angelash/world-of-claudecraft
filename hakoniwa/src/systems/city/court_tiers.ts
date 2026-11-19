// The inner court's data rules (city_building 2.2 and 2.3; catalog_buildings_city.md 4.1
// and 4.2; catalog_relics_lore.md 1.7; thousand_doors.md 13): the expansion tiers, the door
// that lets the player in, and the checks on the court site's `court` block. Pure: every
// number comes from data/city/sites.json and the world flags; nothing here writes.
// The current tier is the last tier whose flags all hold; the tiers up to it add their
// display cases and override building limits (garden plots) and building storage (the
// store's second level), later tiers over earlier ones.

import type { ContentMap, FlagValue } from '../../core/contracts';
import { liveMap, type MapDef, TILE_KINDS, tileAt } from '../world';
import type { BuildingDef, CourtCaseDef, CourtDoorRule, SiteDef } from './types';

type Flags = Readonly<Record<string, FlagValue>>;

/** The court tier in force, merged over the tiers below it. */
export interface CourtTier {
  /** position of the tier in the data (0: the first opening) */
  index: number;
  id: string;
  cases: CourtCaseDef[];
  buildingMax: Record<string, number>;
  buildingStorage: Record<string, number>;
}

// common.flagsOk reads the same way; common imports this module, so it is not imported here
function holds(flags: Flags, list: readonly string[] | undefined): boolean {
  return !list || list.every((f) => !!flags[f]);
}

/** The tier the flags give the court; undefined for a site without a `court` block. */
export function courtTier(sdef: Pick<SiteDef, 'court'>, flags: Flags): CourtTier | undefined {
  const tiers = sdef.court?.tiers ?? [];
  if (tiers.length === 0) return undefined;
  let last = 0;
  tiers.forEach((t, i) => {
    if (holds(flags, t.requiresFlags)) last = i;
  });
  const out: CourtTier = {
    index: last,
    id: tiers[last]?.id ?? '',
    cases: [],
    buildingMax: {},
    buildingStorage: {},
  };
  for (const t of tiers.slice(0, last + 1)) {
    out.cases.push(...(t.display ?? []));
    Object.assign(out.buildingMax, t.buildingMax ?? {});
    Object.assign(out.buildingStorage, t.buildingStorage ?? {});
  }
  return out;
}

/** The most instances of a building a site allows now: the court tier's, else the def's. */
export function buildingCap(
  sdef: Pick<SiteDef, 'court'>,
  def: Pick<BuildingDef, 'id' | 'max'>,
  flags: Flags,
): number | undefined {
  return courtTier(sdef, flags)?.buildingMax[def.id] ?? def.max;
}

/** Distance from a point to a rectangle (0 inside it). */
function rectDistance(r: { x: number; y: number; w: number; h: number }, x: number, y: number) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * Is a door within reach of a point (act1 9.2: any closed door)? A tile of a listed kind on
 * the live map (switches closed by the flags count by their closed tile), its centre within
 * `reach`; a switch whose closed tile is in `switchTiles`, closed now (the live map shows
 * that tile), on a tile within `reach`; or a location with a listed tag within `reach` of
 * its rectangle.
 */
export function doorWithinReach(
  map: MapDef,
  flags: Flags,
  at: { x: number; y: number },
  rule: CourtDoorRule,
): boolean {
  const live = liveMap(map, flags);
  const r = rule.reach;
  const switchTiles = rule.switchTiles ?? [];
  const inSwitch = (tx: number, ty: number, kind: string) =>
    (map.switches ?? []).some(
      (sw) =>
        sw.closedTile === kind &&
        switchTiles.includes(kind) &&
        tx >= sw.x &&
        ty >= sw.y &&
        tx < sw.x + sw.w &&
        ty < sw.y + sw.h,
    );
  for (let ty = Math.floor(at.y - r); ty <= Math.floor(at.y + r); ty++) {
    for (let tx = Math.floor(at.x - r); tx <= Math.floor(at.x + r); tx++) {
      if (Math.hypot(tx + 0.5 - at.x, ty + 0.5 - at.y) > r + 1e-9) continue;
      const kind = tileAt(live, tx, ty);
      if (rule.tiles.includes(kind) || inSwitch(tx, ty, kind)) return true;
    }
  }
  const tags = rule.anchorTags ?? [];
  if (tags.length === 0) return false;
  return map.locations.some(
    (l) => l.tags?.some((t) => tags.includes(t)) && rectDistance(l, at.x, at.y) <= r + 1e-9,
  );
}

const isWhole = (v: unknown, min: number): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;

/** Problems with the court sites' `court` blocks (content validation). */
export function courtConfigProblems(
  content: Pick<ContentMap, 'city_sites' | 'city_buildings'>,
): string[] {
  const out: string[] = [];
  const courtBuildings = new Map(
    (content.city_buildings ?? []).filter((b) => b.sites.includes('court')).map((b) => [b.id, b]),
  );
  for (const s of content.city_sites ?? []) {
    const cfg = s.court;
    if (s.kind !== 'court') {
      if (cfg) out.push(`site ${s.id}: only a court site has a court block`);
      continue;
    }
    if (!cfg) {
      out.push(`site ${s.id}: a court site needs a court block`);
      continue;
    }
    const at = `site ${s.id}: court`;
    const door = cfg.door;
    if (!door || !Array.isArray(door.tiles) || door.tiles.length === 0)
      out.push(`${at}.door needs at least one tile kind`);
    else
      for (const k of door.tiles)
        if (!(TILE_KINDS as readonly string[]).includes(k))
          out.push(`${at}.door: unknown tile kind ${k}`);
    for (const field of ['switchTiles', 'anchorTags'] as const) {
      const list = door?.[field];
      if (list === undefined) continue;
      if (!Array.isArray(list) || list.some((x) => typeof x !== 'string' || x === ''))
        out.push(`${at}.door.${field} must be a list of names`);
      else if (field === 'switchTiles')
        for (const k of list)
          if (!(TILE_KINDS as readonly string[]).includes(k))
            out.push(`${at}.door: unknown switch tile kind ${k}`);
    }
    if (!door || typeof door.reach !== 'number' || !(door.reach > 0))
      out.push(`${at}.door.reach must be above 0`);
    if (!door || !isWhole(door.cooldownMinutes, 0))
      out.push(`${at}.door.cooldownMinutes must be a whole number of minutes, 0 or more`);
    if (typeof cfg.displayOwner !== 'string' || cfg.displayOwner === '')
      out.push(`${at}.displayOwner is missing`);
    else if (cfg.displayOwner === s.stockOwner || cfg.displayOwner === 'player')
      out.push(`${at}.displayOwner must be a holder of its own`);
    if (!isWhole(cfg.takeDownDays, 0))
      out.push(`${at}.takeDownDays must be a whole number of days, 0 or more`);
    const tiers = Array.isArray(cfg.tiers) ? cfg.tiers : [];
    if (tiers.length === 0) out.push(`${at}.tiers needs at least one tier`);
    else if ((tiers[0]?.requiresFlags ?? []).length > 0)
      out.push(`${at}: the first tier is the first opening and needs no flags`);
    const tierIds = new Set<string>();
    const caseIds = new Set<string>();
    for (const t of tiers) {
      const tat = `${at} tier ${t.id}`;
      if (typeof t.id !== 'string' || t.id === '') out.push(`${at}: a tier has no id`);
      else if (tierIds.has(t.id)) out.push(`${tat} listed twice`);
      tierIds.add(t.id);
      for (const c of t.display ?? []) {
        if (caseIds.has(c.id)) out.push(`${tat}: display case ${c.id} listed twice`);
        caseIds.add(c.id);
        if (!isWhole(c.slots, 1)) out.push(`${tat}: display case ${c.id} needs 1 or more slots`);
      }
      for (const [field, table] of [
        ['buildingMax', t.buildingMax],
        ['buildingStorage', t.buildingStorage],
      ] as const) {
        for (const [id, n] of Object.entries(table ?? {})) {
          const b = courtBuildings.get(id);
          if (!b) out.push(`${tat}.${field}: ${id} is not a court building`);
          if (!isWhole(n, 0)) out.push(`${tat}.${field}: ${id} must be a whole number`);
          else if (field === 'buildingMax' && b?.max !== undefined && n > b.max)
            out.push(`${tat}.buildingMax: ${id} ${n} is above the building's own max ${b.max}`);
        }
      }
    }
  }
  return out;
}
