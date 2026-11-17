// Repair at a station (catalog_equipment.md 2.7): a station with a repair service (the
// gate-bronze workshop of the inner court is the T6 repair site: T6 work is mended nowhere
// else) mends the pieces of whoever stands at it with the station's skill and standing,
// worn pieces first; the owner pays the quote and the tier material through the inventory's
// repair port. Smiths in town run their own service from the `crafters` data (the
// inventory's smith service).

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import type { World } from '../../core/world';
import { type RepairRun, repairAll } from '../inventory';
import { entityOf, placeOf } from './places';
import { craftingConfig, holdsIn } from './skills';
import type { StationDef } from './types';

/** The best repair station the entity stands at (T6 sites first, then by skill). */
export function repairStationAt(
  world: World,
  content: ContentMap,
  entityId: string,
): StationDef | undefined {
  const cfg = craftingConfig(content);
  const e = entityOf(world, entityId);
  if (!cfg || !e) return undefined;
  let best: StationDef | undefined;
  for (const s of content.craftStations ?? []) {
    const r = s.repair;
    if (!r || !placeOf(content, e, s.places, cfg.gather.reach) || !holdsIn(world, s.when)) continue;
    const b = best?.repair;
    if (!b || (r.t6 && !b.t6) || (!!r.t6 === !!b.t6 && r.skill > b.skill)) best = s;
  }
  return best;
}

/** Mend one piece, or every damaged one, at the station; the owner pays. */
export function repairAtStation(
  ctx: SystemContext,
  entityId: string,
  station: StationDef,
  instanceId?: string,
): RepairRun {
  const r = station.repair ?? { skill: 0 };
  return repairAll(
    ctx,
    entityId,
    { skill: r.skill, ...(r.master ? { master: true } : {}), ...(r.t6 ? { t6: true } : {}) },
    entityId,
    instanceId,
  );
}
