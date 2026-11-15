// Map roles read from the map documents (release_engineering.md 13.2): which map takes a
// fallen player back, which acts' story a map carries, and which maps stay outside the
// atlas. Systems ask these queries instead of naming map ids in code.

import type { MapDef, MapRespawnRole } from './types';

type MapContent = { maps: readonly MapDef[] };

/** The map that holds a respawn role ('door' or 'wake'); undefined when no map claims it. */
export function respawnMap(content: MapContent, role: MapRespawnRole): MapDef | undefined {
  return content.maps.find((m) => m.respawn === role);
}

/**
 * Act ids (act flag values) whose story a map carries: the default story weight of a
 * persona card that names no acts of its own. Empty when the map declares none.
 */
export function mapStoryActs(content: MapContent, mapId: string): readonly string[] {
  return content.maps.find((m) => m.id === mapId)?.storyActs ?? [];
}

/** A test or tooling map that is not part of the world (no atlas entry needed). */
export function isAtlasExempt(map: { atlasExempt?: boolean }): boolean {
  return map.atlasExempt === true;
}

/** Problems with the map role fields (one map per respawn role, story acts that exist). */
export function mapRoleProblems(
  content: MapContent & { acts?: readonly { id: string }[] },
): string[] {
  const out: string[] = [];
  const holders = new Map<string, string[]>();
  for (const m of content.maps) {
    if (m.respawn === undefined) continue;
    if (m.respawn !== 'door' && m.respawn !== 'wake')
      out.push(`map ${m.id}: unknown respawn role ${String(m.respawn)}`);
    holders.set(m.respawn, [...(holders.get(m.respawn) ?? []), m.id]);
  }
  for (const [role, ids] of holders)
    if (ids.length > 1) out.push(`maps ${ids.join(', ')}: respawn role ${role} claimed twice`);
  const acts = content.acts ? new Set(content.acts.map((a) => a.id)) : null;
  for (const m of content.maps)
    for (const a of m.storyActs ?? [])
      if (acts && !acts.has(a)) out.push(`map ${m.id}: unknown story act ${a}`);
  return out;
}
