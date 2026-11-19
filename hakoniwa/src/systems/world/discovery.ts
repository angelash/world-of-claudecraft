// Discoveries require the visible living player to occupy a declared rectangle. No
// remote map scans or name-based guesses; vistas require an uninterrupted three seconds.
import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import type { XpLedger, XpReward } from '../records/xp_types';
import { isWalkable } from './grid';
import { mapById, playerEntity } from './index';
import { liveMap } from './switches';

function inside(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** Current-position candidates only; the records owner performs the once-only award. */
export function discoveredRewards(
  world: World,
  content: ContentMap,
  rows: readonly XpReward[],
  ledger: XpLedger,
): XpReward[] {
  const p = playerEntity(world);
  const original = p ? mapById(content, p.mapId) : undefined;
  const map = original ? liveMap(original, world.meta.flags) : undefined;
  if (!p?.alive || p.hidden || !map || !isWalkable(map, p.x, p.y)) {
    delete ledger.vista;
    delete ledger.position;
    return [];
  }
  const act = String(world.meta.flags.act ?? '');
  const same =
    ledger.position?.mapId === p.mapId &&
    ledger.position.x === p.x &&
    ledger.position.y === p.y &&
    ledger.position.act === act;
  if (same && !ledger.vista) return [];
  ledger.position = { mapId: p.mapId, x: p.x, y: p.y, act };
  const region = content.atlas_maps?.find((a) => a.id === p.mapId)?.region;
  const out: XpReward[] = [];
  let vista = false;
  for (const row of rows) {
    const t = row.trigger;
    if (t.kind !== 'discovery' || ledger.settled[row.id]) continue;
    if (Number(act.slice(3)) < row.act) continue;
    if (t.discovery === 'region') {
      const expected = content.atlas_maps?.find((a) => a.id === t.mapId)?.region;
      if (region && region === expected) out.push(row);
      continue;
    }
    if (t.mapId !== p.mapId) continue;
    if (!t.location) {
      out.push(row);
      continue;
    }
    const l = map.locations.find((l) => l.id === t.location);
    if (!l || !inside(p.x, p.y, l)) continue;
    if (t.discovery !== 'vista') {
      out.push(row);
      continue;
    }
    vista = true;
    if (
      ledger.vista?.id !== row.id ||
      ledger.vista.mapId !== p.mapId ||
      ledger.vista.x !== p.x ||
      ledger.vista.y !== p.y
    )
      ledger.vista = { id: row.id, since: world.meta.tick, mapId: p.mapId, x: p.x, y: p.y };
    if (world.meta.tick - ledger.vista.since >= 60) out.push(row);
  }
  if (!vista) delete ledger.vista;
  return out;
}

export function discoveryProblems(content: ContentMap): string[] {
  const out: string[] = [];
  for (const map of content.maps ?? [])
    for (const l of map.locations) {
      const d = l.discovery;
      if (d === undefined) continue;
      if (
        !d ||
        typeof d !== 'object' ||
        Array.isArray(d) ||
        !['map', 'landmark', 'vista', 'secret'].includes(d.kind) ||
        Object.keys(d).some((k) => !['kind', 'act'].includes(k)) ||
        (d.act !== undefined && (!Number.isInteger(d.act) || d.act < 1 || d.act > 6))
      )
        out.push(`map ${map.id}: invalid discovery ${l.id}`);
    }
  return out;
}
