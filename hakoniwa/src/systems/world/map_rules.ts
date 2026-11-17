// Logic-layer rules of a map document beyond walkability (map_briefs.md 1.10): gate sites
// (locations of kind `gate_site`, or of another kind tagged `gate_site` such as a ruin
// hall, where the advanced travelling door lands on the walkable tile nearest the centre)
// and the validator that gathers the map mechanics' problems: sediment levels, switch tile
// areas, spawn point rules and exits (negated flag entries work on spawn points only).
// Pure.

import { nearestWalkable } from './grid';
import { sedimentProblems } from './sediment';
import { NEGATED, spawnRuleProblems } from './spawn_rules';
import { switchProblems } from './switches';
import type { LocationDef, MapDef, Waypoint } from './types';

/** The location kind that marks a gate site. */
export const GATE_SITE_KIND = 'gate_site';

/** Whether a location is a gate site: its kind, or a tag on a location of another kind. */
export function isGateSite(l: LocationDef): boolean {
  return l.kind === GATE_SITE_KIND || (l.tags ?? []).includes(GATE_SITE_KIND);
}

/** The gate sites of a map, in content order. */
export function gateSites(map: { locations: readonly LocationDef[] }): LocationDef[] {
  return map.locations.filter(isGateSite);
}

/**
 * Where a door arriving at a gate site puts the traveller: the walkable tile nearest the
 * site's centre (tile centre), or null when the map has no such site or nothing walkable
 * is near it.
 */
export function gateSiteLanding(map: MapDef, locationId: string): Waypoint | null {
  const site = map.locations.find((l) => l.id === locationId && isGateSite(l));
  if (!site) return null;
  return nearestWalkable(map, site.x + site.w / 2, site.y + site.h / 2);
}

/** Problems with the map mechanics of one map (content validation). Pure. */
export function mapMechanicProblems(map: MapDef): string[] {
  const out = [...sedimentProblems(map), ...switchProblems(map), ...spawnRuleProblems(map)];
  for (const site of gateSites(map))
    if (!gateSiteLanding(map, site.id))
      out.push(`map ${map.id}: gate site ${site.id} has no walkable tile near its centre`);
  for (const x of map.exits)
    if ((x.requiresFlags ?? []).some((f) => typeof f === 'string' && f.startsWith(NEGATED)))
      out.push(`map ${map.id}: exit ${x.id} negated flag entries work on spawn points only`);
  return out;
}
