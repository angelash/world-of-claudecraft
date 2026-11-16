// L4 settler entities (city_building 5.1, 3.7): about one representative resident per 5
// people (capped), spawned through the world port, walking a simple hourly schedule:
// work at 07:00, the village centre at 12:00, home at 19:00. They carry the tags
// npc, settler and friendly; the cohort pool stays the real population.

import type { SystemContext } from '../../core/system';
import { mapById, orderMove, removeEntity, spawnEntity } from '../world';
import { buildingDef, isWorking, totalPop } from './common';
import { centerTile, entranceOf } from './placement';
import settlerNames from './settler_names.json';
import type { SiteDef, SiteState } from './types';

const MAX_SETTLERS = 12;
// The name pool is content data (settler_names.json), not display text the kernel writes.
const NAMES: readonly string[] = settlerNames.names;
const PALETTES = [
  ['#6b5a3e', '#a08c6a', '#f1c9a5', '#3a2a1a'],
  ['#4f6b4a', '#c2b28a', '#e8bb93', '#5a3b22'],
  ['#7a4a3a', '#d0b48c', '#f3cfb0', '#2b2b2b'],
  ['#55607a', '#b9a77f', '#d9a982', '#6b4a2a'],
  ['#6d6d5a', '#9c8a66', '#efc4a0', '#8a6a3a'],
];

export function syncSettlers(ctx: SystemContext, site: SiteState, sdef: SiteDef): void {
  if (sdef.kind !== 'settlement') return;
  const ents = ctx.world.slices.world.entities;
  site.settlers = site.settlers.filter((id) => !!ents[id]);
  const target = Math.min(MAX_SETTLERS, Math.ceil(totalPop(site) / 5));
  const map = mapById(ctx.content, sdef.mapId);
  if (!map) return;
  const center = centerTile(map, sdef);
  const rng = ctx.rng('city.settlers');
  while (site.settlers.length < target) {
    const name = NAMES[Math.floor(rng.next() * NAMES.length)] as string;
    const colors = PALETTES[Math.floor(rng.next() * PALETTES.length)] as string[];
    const e = spawnEntity(ctx, {
      kind: 'npc',
      name,
      mapId: sdef.mapId,
      x: center.x + 0.5 + rng.int(-3, 3),
      y: center.y + 0.5 + rng.int(-3, 3),
      faction: sdef.id,
      appearance: { base: 'human', colors },
      speed: 2.4,
      tags: ['npc', 'settler', 'friendly', `faction:${sdef.id}`, 'lvl:3', 'tier:0'],
      ref: 'settler',
    });
    site.settlers.push(e.id);
  }
  while (site.settlers.length > target) {
    const id = site.settlers.pop() as string;
    removeEntity(ctx, id);
  }
}

/** Hourly schedule: work, centre, home. */
export function settlerSchedule(
  ctx: SystemContext,
  site: SiteState,
  sdef: SiteDef,
  hour: number,
): void {
  if (sdef.kind !== 'settlement' || site.settlers.length === 0) return;
  if (hour !== 7 && hour !== 12 && hour !== 19) return;
  const map = mapById(ctx.content, sdef.mapId);
  if (!map) return;
  const center = centerTile(map, sdef);
  const rng = ctx.rng('city.settlers');
  const working = site.buildings.filter((b) => isWorking(b));
  const workplaces = working.filter((b) => (buildingDef(ctx.content, b.defId)?.jobs ?? 0) > 0);
  const homes = working.filter((b) => (buildingDef(ctx.content, b.defId)?.housing ?? 0) > 0);
  for (const id of site.settlers) {
    let dest = { x: center.x + rng.int(-2, 2), y: center.y + rng.int(-1, 1) };
    const pool = hour === 7 ? workplaces : hour === 19 ? homes : [];
    const b = pool.length > 0 ? pool[Math.floor(rng.next() * pool.length)] : undefined;
    if (b) dest = entranceOf(b.x, b.y, b.w, b.h);
    orderMove(ctx, id, dest.x + 0.5, dest.y + 0.5);
  }
}
