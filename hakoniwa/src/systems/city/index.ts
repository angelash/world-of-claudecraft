// City system (phase 55): the old outpost settlement (outpost, village, territory) and the
// inner court. Thin coordinator: command handlers and event subscriptions delegate to the
// sibling modules. See docs/40_design/systems/city_building.md.

import { ok, reject } from '../../core';
import { contentText } from '../../core/content_key';
import type { GameSystem } from '../../core/system';
import { tr } from '../../core/text';
import { siteDef, today } from './common';
import { cancelBuilding, placeBuilding } from './construction';
import { deposit, enterCourt, leaveCourt, presence, withdraw } from './court';
import { foundNation, grantTerritory, initCity, refreshActive, runDay } from './daily';
import { assignOffice, officialAct } from './officials';
import { foundVillage, micro, setPolicy } from './orders';
import { addPopulation } from './population';
import { settlerSchedule } from './settlers';
import { POP_GROUP_LABELS } from './types';

export { actingLevel, autonomyEfficiency, computeTerms } from './autonomy';
export {
  courtSite,
  defenseLevel,
  foodValue,
  militiaCount,
  siteByRole,
  siteState,
  stocksAny,
  totalPop,
} from './common';
export { presence } from './court';
export { OFFICIAL_ACTIONS, utilityAction } from './officials';
export { FOUND_FOOD_DAYS, FOUND_MIN_POP, policySlots } from './orders';
export {
  entranceOf,
  findSpot,
  footprintTiles,
  type PlacementResult,
  previewPlacement,
  unlockedZones,
} from './placement';
export {
  buildingList,
  buildMenu,
  officialCandidates,
  policyList,
  type SettlementView,
  settlementView,
} from './queries';
export * from './types';

export const system: GameSystem = {
  id: 'city',
  order: 55,

  init(ctx) {
    initCity(ctx);
  },

  commands: {
    'city.found'(ctx, d) {
      return foundVillage(ctx, d.siteId);
    },
    'city.place'(ctx, d) {
      const site = ctx.world.slices.city.sites[d.siteId];
      const sdef = siteDef(ctx.content, d.siteId);
      if (!site || !sdef) return reject('unknown_site', tr('sys.city.reject.unknown_site'));
      const pres = presence(ctx, site, sdef);
      if (!pres.ok) return reject(pres.code, pres.reason);
      return placeBuilding(ctx, d.siteId, d.defId, d.x, d.y, 'player').result;
    },
    'city.cancel'(ctx, d) {
      const site = ctx.world.slices.city.sites[d.siteId];
      const sdef = siteDef(ctx.content, d.siteId);
      if (!site || !sdef) return reject('unknown_site', tr('sys.city.reject.unknown_site'));
      const pres = presence(ctx, site, sdef);
      if (!pres.ok) return reject(pres.code, pres.reason);
      return cancelBuilding(ctx, d.siteId, d.buildingId);
    },
    'city.assign'(ctx, d) {
      return assignOffice(ctx, d);
    },
    'city.policy'(ctx, d) {
      return setPolicy(ctx, d);
    },
    'city.micro'(ctx, d) {
      return micro(ctx, d);
    },
    'city.deposit'(ctx, d) {
      return deposit(ctx, d);
    },
    'city.withdraw'(ctx, d) {
      return withdraw(ctx, d);
    },
    'city.add_population'(ctx, d) {
      const site = ctx.world.slices.city.sites[d.siteId];
      const sdef = siteDef(ctx.content, d.siteId);
      if (!site || !sdef || sdef.kind !== 'settlement')
        return reject('unknown_site', tr('sys.city.reject.unknown_site'));
      if (!(d.group in POP_GROUP_LABELS))
        return reject('bad_group', tr('sys.city.reject.bad_group'));
      const n = addPopulation(
        ctx,
        site,
        sdef,
        d.group,
        d.count,
        d.reason ?? tr('sys.city.reason.story'),
      );
      return n > 0
        ? ok(
            tr('sys.city.info.population_arrived', {
              n,
              group: POP_GROUP_LABELS[d.group](),
              site: contentText('city_sites', sdef),
            }),
          )
        : reject('full', tr('sys.city.reject.full'));
    },
    'city.official_act'(ctx, d, source) {
      return officialAct(ctx, d, source);
    },
    'city.enter_court'(ctx) {
      return enterCourt(ctx);
    },
    'city.leave_court'(ctx) {
      return leaveCourt(ctx);
    },
  },

  on: {
    'world.day'(ctx, ev) {
      runDay(ctx, ev.data.dayIndex ?? today(ctx.tick));
    },
    'world.hour'(ctx, ev) {
      for (const sdef of ctx.content.city_sites) {
        const site = ctx.world.slices.city.sites[sdef.id];
        if (site?.active) settlerSchedule(ctx, site, sdef, ev.data.hour);
      }
    },
    'flag.changed'(ctx, ev) {
      const { key, value } = ev.data;
      if (key === 'a3_territory_granted' && value) grantTerritory(ctx);
      else if (key === 'a4_nation_founded' && value) foundNation(ctx);
      if (ctx.content.city_sites.some((s) => s.requiresFlags?.includes(key))) refreshActive(ctx);
    },
  },
};
