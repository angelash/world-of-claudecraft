// Where the combat slice keeps content ids, for the rename table (release_engineering.md
// 5.5 `idFields`): the aura ids on every unit; the ability ids in cooldowns, casts, door
// grants, boss phase lists and the outsider's skill rack (the racked abilities and those
// taken off by hand); and the monster a unit was spawned from. The boss library adds the
// abilities a boss already settled at half (`firstHalf`) and queued, the adds it announced,
// the kind a corpse rises as, what a thief carries, the ability a ground warning settles and
// the boss an arena object belongs to. A save written before an ability, aura or monster
// was renumbered loads with the new ids (data/registry/renames.json, kinds `ability`,
// `aura` and `monster`).

import type { IdField } from '../../core/save/renames';

export const COMBAT_ID_FIELDS: readonly IdField[] = [
  { path: 'units.*.auras.*.id', kind: 'aura' },
  { path: 'units.*.cds.@keys', kind: 'ability' },
  { path: 'units.*.cast.abilityId', kind: 'ability' },
  { path: 'units.*.drinking.itemId', kind: 'item' },
  { path: 'units.*.drinking.mapId', kind: 'map' },
  { path: 'units.*.eating.itemId', kind: 'item' },
  { path: 'units.*.eating.auraId', kind: 'aura' },
  { path: 'units.*.eating.mapId', kind: 'map' },
  { path: 'units.*.abilities.*', kind: 'ability' },
  { path: 'units.*.phaseAbilities.*', kind: 'ability' },
  { path: 'units.*.rack.*', kind: 'ability' },
  { path: 'units.*.rackOff.*', kind: 'ability' },
  { path: 'units.*.monsterId', kind: 'monster' },
  { path: 'bags.*.items.*.itemId', kind: 'item' },
  { path: 'units.*.firstHalf.*', kind: 'ability' },
  { path: 'units.*.boss.queued.*', kind: 'ability' },
  { path: 'units.*.boss.pending.*.monster', kind: 'monster' },
  { path: 'units.*.rise', kind: 'monster' },
  { path: 'units.*.stolen.items.*.itemId', kind: 'item' },
  { path: 'telegraphs.*.abilityId', kind: 'ability' },
  { path: 'telegraphs.*.aura', kind: 'aura' },
  { path: 'terrain.*.monsterId', kind: 'monster' },
];
