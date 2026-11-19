// What the client shows of the inner court (a pure query, architecture.md 4.5): the tier,
// whether the door can be pushed from where the player stands, storage, the display cases
// and their pieces, the building limits the tier sets (garden plots), and how many tainted
// pieces lie in the court outside a vault (catalog_relics_lore.md 1.7 rule 2: each one silts
// the court; the effect on the doors' blockage recovery is the doors and ailments owners').

import type { ContentMap, FlagValue } from '../../core/contracts';
import { type InventorySlice, itemDef } from '../inventory';
import { playerEntity, type WorldSlice } from '../world';
import { countBuildings, courtSite, stockOf, storageCap, storageUsed } from './common';
import { atCourtDoor, courtCooldownLeft } from './court';
import { displayEntries } from './court_display';
import { courtTier } from './court_tiers';
import type { CitySlice, CourtDisplayEntry } from './types';

/** The item tag of a tainted piece (catalog_relics_lore.md 1.7 rule 2). */
export const TAINT_TAG = 'tainted';

export interface CourtView {
  siteId: string;
  /** the tier id in force (court_tiers.ts) */
  tier: string;
  door: { near: boolean; cooldownLeft: number };
  storage: { used: number; cap: number };
  display: {
    cases: { id: string; slots: number; used: number }[];
    entries: CourtDisplayEntry[];
  };
  limits: { buildingId: string; built: number; max: number }[];
  /** tainted pieces in the court's storage and display (no vault yet) */
  tainted: number;
}

type CourtWorld = {
  meta: { tick: number; flags: Record<string, FlagValue> };
  slices: { city: CitySlice; inventory: InventorySlice; world: WorldSlice };
};

export function courtView(
  world: CourtWorld,
  content: Pick<ContentMap, 'city_sites' | 'city_buildings' | 'items' | 'maps'>,
): CourtView | null {
  const sdef = courtSite(content);
  const site = sdef ? world.slices.city.sites[sdef.id] : undefined;
  if (!sdef || !site) return null;
  const tier = courtTier(sdef, world.meta.flags);
  const entries = displayEntries(world);
  const p = playerEntity(world);
  const owners = [sdef.stockOwner, ...(sdef.court ? [sdef.court.displayOwner] : [])];
  let tainted = 0;
  for (const owner of owners) {
    for (const [id, n] of Object.entries(stockOf(world, owner))) {
      if (itemDef(content, id)?.tags?.includes(TAINT_TAG)) tainted += n;
    }
  }
  return {
    siteId: sdef.id,
    tier: tier?.id ?? '',
    door: {
      near: !!p && p.mapId !== sdef.mapId && atCourtDoor(world, content, sdef, p),
      cooldownLeft: courtCooldownLeft(world, sdef),
    },
    storage: {
      used: storageUsed(world, sdef.stockOwner),
      cap: storageCap(site, sdef, content, world.meta.flags),
    },
    display: {
      cases: (tier?.cases ?? []).map((c) => ({
        id: c.id,
        slots: c.slots,
        used: entries.filter((e) => e.caseId === c.id).length,
      })),
      entries: entries.map((e) => ({ ...e })),
    },
    limits: Object.entries(tier?.buildingMax ?? {}).map(([buildingId, max]) => ({
      buildingId,
      built: countBuildings(site, buildingId, true),
      max,
    })),
    tainted,
  };
}
